import { format } from "date-fns";
import { da } from "date-fns/locale";
import { z } from "zod";

import { getAiBriefSettings } from "@/lib/ai-settings";
import { getUpcomingCalendarEvents, type CachedCalendarEvent } from "@/lib/calendar";
import {
  formatAppTime,
  getAppDateKey,
  getCurrentDateContext,
  normalizeToAppTimeZoneIsoDateTime,
  toAppTimeZoneDate,
} from "@/lib/date-context";
import { getDashboardSnapshot } from "@/lib/dashboard";
import {
  addShoppingItems,
  createMealPlanEntry,
  getFamilyWorkspaceData,
} from "@/lib/family";
import {
  addDefaultEventDuration,
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  type GoogleCalendarChoice,
  getGoogleCalendarChoices,
} from "@/features/integrations/google/google-calendar";
import { createGoogleTask } from "@/features/integrations/google/google-tasks";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOpenTasks, type CachedTask } from "@/lib/tasks";
import type { FamilyMealPlanEntry, ShoppingListEntry } from "@/lib/types";

const assistantStepSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_calendar_event"),
    title: z.string().min(1),
    startsAt: z.string().transform(normalizeToAppTimeZoneIsoDateTime),
    endsAt: z.string().transform(normalizeToAppTimeZoneIsoDateTime).nullable(),
    isAllDay: z.boolean().default(false),
    description: z.string().nullable().default(null),
    location: z.string().nullable().default(null),
  }),
  z.object({
    type: z.literal("delete_calendar_event"),
    title: z.string().min(1),
    startsAt: z.string().transform(normalizeToAppTimeZoneIsoDateTime).nullable(),
    calendarName: z.string().nullable().default(null),
  }),
  z.object({
    type: z.literal("create_task"),
    title: z.string().min(1),
    notes: z.string().nullable().default(null),
    dueAt: z.string().transform(normalizeToAppTimeZoneIsoDateTime).nullable(),
  }),
  z.object({
    type: z.literal("add_shopping_items"),
    items: z
      .array(
        z.object({
          label: z.string().min(1),
          quantity: z.string().nullable().default(null),
          category: z.string().nullable().default(null),
        }),
      )
      .min(1),
  }),
  z.object({
    type: z.literal("create_meal_plan"),
    title: z.string().min(1),
    plannedFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notes: z.string().nullable().default(null),
    shoppingItems: z
      .array(
        z.object({
          label: z.string().min(1),
          quantity: z.string().nullable().default(null),
          category: z.string().nullable().default(null),
        }),
      )
      .default([]),
  }),
]);

const assistantActionSchema = z.object({
  replyText: z.string().min(1),
  steps: z.array(assistantStepSchema),
});

export type AssistantTurnResult = {
  reply: string;
  action:
    | "create_calendar_event"
    | "delete_calendar_event"
    | "create_task"
    | "add_shopping_items"
    | "create_meal_plan"
    | "clarify"
    | "reply";
  createdEvent:
    | {
        title: string;
        calendarName: string;
        timeLabel: string;
      }
    | null;
  completedActions: string[];
};

export async function runLifeOsAssistantTurn(params: {
  userId: string;
  message: string;
  channel?: "text" | "voice";
  history?: Array<{
    role: "assistant" | "user";
    content: string;
  }>;
}): Promise<AssistantTurnResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY mangler til Briefly-assistenten.");
  }

  const [settings, snapshot, calendarEvents, tasks, familyWorkspace, calendarChoices] =
    await Promise.all([
      getAiBriefSettings(params.userId),
      getDashboardSnapshot(params.userId),
      getUpcomingCalendarEvents(params.userId, 200, 180),
      getOpenTasks(params.userId, 6),
      getFamilyWorkspaceData(params.userId),
      getGoogleCalendarChoices(params.userId),
    ]);
  const dateContext = getCurrentDateContext();
  const isVoiceChannel = params.channel === "voice";

  const selectedCalendars = calendarChoices.filter((calendar) => calendar.isSelected);
  const defaultCalendar =
    selectedCalendars[0] ??
    calendarChoices.find((calendar) => calendar.summary.trim().toLowerCase() === "vores kalender") ??
    calendarChoices[0] ??
    null;
  const recentConversation = formatConversationHistory(params.history ?? []);
  const followUpHint = isLikelyFollowUpMessage(params.message)
    ? "The newest user message is likely a short follow-up or confirmation. Resolve pronouns like den, det, den aftale, gør det, ja, nej against the most recent concrete item or question in recent conversation."
    : "The newest user message is a standalone request unless recent conversation clearly changes its meaning.";

  const prompt = [
    `Current timestamp: ${new Date().toISOString()}.`,
    "Timezone: Europe/Copenhagen.",
    `Current ISO week: Week ${dateContext.isoWeek} (${dateContext.isoWeekYear}), from ${dateContext.weekStartIso} to ${dateContext.weekEndIso}.`,
    `Weekend status: ${dateContext.isWeekend ? "It is currently weekend." : "It is currently a weekday."}`,
    `Profile name: ${snapshot.profileName ?? "Unknown"}.`,
    `Family group: ${snapshot.familyGroupName ?? "Not connected"}.`,
    `Selected Google calendars for Briefly: ${
      selectedCalendars.length > 0
        ? selectedCalendars.map((calendar: GoogleCalendarChoice) => calendar.summary).join(", ")
        : defaultCalendar?.summary ?? "none"
    }.`,
    `Default write calendar: ${defaultCalendar?.summary ?? "none"}.`,
    `Upcoming calendar events: ${
      calendarEvents.length > 0
        ? calendarEvents
            .map(
              (event: CachedCalendarEvent) =>
                `${event.title} at ${event.startsAt}${event.calendarName ? ` in ${event.calendarName}` : ""}`,
            )
            .join(", ")
        : "none"
    }.`,
    `Top tasks: ${
      tasks.length > 0
        ? tasks
            .map(
              (task: CachedTask) =>
                `${task.title}${task.taskListTitle ? ` (${task.taskListTitle})` : ""}`,
            )
            .join(", ")
        : "none"
    }.`,
    `Meal plan: ${
      familyWorkspace.mealPlans.length > 0
        ? familyWorkspace.mealPlans
            .map((meal: FamilyMealPlanEntry) => `${meal.title} on ${meal.plannedFor}`)
            .join(", ")
        : "none"
    }.`,
    `Open shopping items: ${
      familyWorkspace.shoppingItems.filter((item) => !item.isCompleted).length > 0
        ? familyWorkspace.shoppingItems
            .filter((item: ShoppingListEntry) => !item.isCompleted)
            .map((item: ShoppingListEntry) => item.label)
            .join(", ")
        : "none"
    }.`,
    `Recent conversation:\n${recentConversation}`,
    followUpHint,
    `User message: ${params.message}`,
  ].join(" ");

  const calendarLookup = answerCalendarLookupFromCache(params.message, calendarEvents);

  if (calendarLookup) {
    return {
      reply: calendarLookup.reply,
      action: calendarLookup.action,
      createdEvent: null,
      completedActions: [],
    };
  }

  const parsed = await planAssistantAction({
    model: settings.model,
    prompt,
    isVoiceChannel,
  });

  if (parsed.steps.length === 0) {
    return {
      reply: parsed.replyText,
      action: "reply",
      createdEvent: null,
      completedActions: [],
    };
  }

  const user = await requireAssistantUser();
  const completedActions: string[] = [];
  let createdEventSummary: AssistantTurnResult["createdEvent"] = null;

  for (const step of parsed.steps) {
    if (step.type === "create_calendar_event") {
      if (!defaultCalendar) {
        return {
          reply:
            "Jeg kan ikke finde en valgt Google-kalender endnu. Gå til Calendar og vælg mindst én kalender først.",
          action: "clarify",
          createdEvent: null,
          completedActions,
        };
      }

      const endsAt = step.endsAt ?? addDefaultEventDuration(step.startsAt);
      const createdEvent = await createGoogleCalendarEvent({
        userId: params.userId,
        calendarId: defaultCalendar.id,
        title: step.title,
        startsAt: step.startsAt,
        endsAt,
        isAllDay: step.isAllDay,
        description: step.description,
        location: step.location,
      });

      const startDate = new Date(createdEvent.startsAt);
      const endDate = new Date(createdEvent.endsAt);
      const timeLabel = step.isAllDay
        ? format(startDate, "EEE d MMM")
        : `${format(startDate, "EEE d MMM HH.mm")}–${format(endDate, "HH.mm")}`;

      createdEventSummary = {
        title: createdEvent.title,
        calendarName: createdEvent.calendarName,
        timeLabel,
      };
      completedActions.push(`Calendar · ${createdEvent.title} · ${timeLabel}`);
      continue;
    }

    if (step.type === "delete_calendar_event") {
      const match = resolveCalendarDeletionMatch(calendarEvents, {
        title: step.title,
        startsAt: step.startsAt,
        calendarName: step.calendarName,
      });

      if (match.type === "not_found") {
        return {
          reply:
            "Jeg kan ikke finde den aftale i de valgte kalendere. Prøv gerne igen med titel eller tidspunkt.",
          action: "clarify",
          createdEvent: null,
          completedActions,
        };
      }

      if (match.type === "ambiguous") {
        return {
          reply: `Jeg fandt flere mulige aftaler: ${match.options.join(", ")}. Hvilken vil du have mig til at slette?`,
          action: "clarify",
          createdEvent: null,
          completedActions,
        };
      }

      const deletedEvent = await deleteGoogleCalendarEvent({
        userId: params.userId,
        calendarId: match.event.calendarId,
        eventId: match.event.sourceEventId,
      });

      const timeLabel = formatDeletionEventLabel(match.event);
      createdEventSummary = {
        title: match.event.title,
        calendarName: deletedEvent.calendarName,
        timeLabel,
      };
      completedActions.push(`Kalender · slettet · ${match.event.title} · ${timeLabel}`);
      continue;
    }

    if (step.type === "create_task") {
      const createdTask = await createGoogleTask({
        userId: params.userId,
        title: step.title,
        notes: step.notes,
        dueAt: step.dueAt,
      });
      completedActions.push(
        `Task · ${createdTask.title}${createdTask.taskListTitle ? ` · ${createdTask.taskListTitle}` : ""}`,
      );
      continue;
    }

    if (step.type === "add_shopping_items") {
      const addedShoppingItems = await addShoppingItems({
        user,
        items: step.items,
      });
      completedActions.push(
        `Shopping · ${addedShoppingItems.items.map((item) => item.label).join(", ")}`,
      );
      continue;
    }

    if (step.type === "create_meal_plan") {
      const createdMeal = await createMealPlanEntry({
        user,
        title: step.title,
        plannedFor: step.plannedFor,
        notes: step.notes,
        shoppingItems: step.shoppingItems,
      });
      completedActions.push(
        `Meal plan · ${createdMeal.title} · ${createdMeal.plannedFor}${createdMeal.linkedShoppingCount > 0 ? ` · ${createdMeal.linkedShoppingCount} linked shopping items` : ""}`,
      );
    }
  }

  return {
    reply: parsed.replyText,
    action: parsed.steps[0]?.type ?? "reply",
    createdEvent: createdEventSummary,
    completedActions,
  };
}

async function requireAssistantUser() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    throw new Error("Missing Supabase environment variables.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Du skal logge ind, før du kan bruge Briefly-assistenten.");
  }

  return user;
}

async function planAssistantAction({
  model,
  prompt,
  isVoiceChannel,
}: {
  model: string;
  prompt: string;
  isVoiceChannel: boolean;
}) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      instructions:
        `You are Briefly, a practical Danish assistant for everyday life. Your purpose is to reduce mental load by turning natural-language requests into calm, useful action. Interpret the user message and decide what concrete actions to take. You may create a Google Calendar event, delete a Google Calendar event, create a Google Task, add shopping items, create a meal plan entry, or combine several of those in the same response. Be date-aware and week-aware. Resolve relative dates against Europe/Copenhagen and the current ISO week context. Weekend means Saturday and Sunday. Use the recent conversation to keep context across follow-up replies like yes, okay, do it, that one, slet den, flyt den, or thank you. If the most recent assistant message asked a clarification question or named a concrete item, and the user now answers briefly, treat that as a follow-up instead of starting over. Listen carefully before acting: when the user gives multiple details in one request, preserve all of them. For calendar and task datetimes inside steps, always output full ISO datetime strings with seconds, for example 2026-06-08T18:00:00+02:00. For all-day calendar events, set isAllDay to true and use startsAt as the first included day and endsAt as the last included day in human terms, not Google Calendar's exclusive technical end date. In replyText, never use raw ISO strings, timezone abbreviations like CEST/CET, or an explicit year unless the user asked for it or the date is in another calendar year than the current relevant context. Prefer natural phrasing like i morgen kl. 10.00, tirsdag kl. 18.00, eller den 14. januar. If the user gives only a start time for a calendar event, leave endsAt null so the app can default it to 60 minutes. For calendar deletion, use type delete_calendar_event and include the event title. Include startsAt when it is known from the user message or recent conversation. For meal plans, plannedFor must be a calendar date in YYYY-MM-DD. Write replyText in Danish. Keep it calm, warm, useful, and specific.${isVoiceChannel ? " Voice mode: keep replyText short and speakable. Use at most two short sentences unless you are asking a clarification question. Put the action first, then any one essential detail." : ""} If the user is vague or missing key timing information, return no steps and use replyText to ask one short clarification question.`,
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "life_os_assistant_actions",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              replyText: {
                type: "string",
              },
              steps: {
                type: "array",
                items: {
                  anyOf: [
                    {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        type: { type: "string", const: "create_calendar_event" },
                        title: { type: "string" },
                        startsAt: { type: "string" },
                        endsAt: { type: ["string", "null"] },
                        isAllDay: { type: "boolean" },
                        description: { type: ["string", "null"] },
                        location: { type: ["string", "null"] },
                      },
                      required: ["type", "title", "startsAt", "endsAt", "isAllDay", "description", "location"],
                    },
                    {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        type: { type: "string", const: "delete_calendar_event" },
                        title: { type: "string" },
                        startsAt: { type: ["string", "null"] },
                        calendarName: { type: ["string", "null"] },
                      },
                      required: ["type", "title", "startsAt", "calendarName"],
                    },
                    {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        type: { type: "string", const: "create_task" },
                        title: { type: "string" },
                        notes: { type: ["string", "null"] },
                        dueAt: { type: ["string", "null"] },
                      },
                      required: ["type", "title", "notes", "dueAt"],
                    },
                    {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        type: { type: "string", const: "add_shopping_items" },
                        items: {
                          type: "array",
                          items: {
                            type: "object",
                            additionalProperties: false,
                            properties: {
                              label: { type: "string" },
                              quantity: { type: ["string", "null"] },
                              category: { type: ["string", "null"] },
                            },
                            required: ["label", "quantity", "category"],
                          },
                        },
                      },
                      required: ["type", "items"],
                    },
                    {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        type: { type: "string", const: "create_meal_plan" },
                        title: { type: "string" },
                        plannedFor: { type: "string" },
                        notes: { type: ["string", "null"] },
                        shoppingItems: {
                          type: "array",
                          items: {
                            type: "object",
                            additionalProperties: false,
                            properties: {
                              label: { type: "string" },
                              quantity: { type: ["string", "null"] },
                              category: { type: ["string", "null"] },
                            },
                            required: ["label", "quantity", "category"],
                          },
                        },
                      },
                      required: ["type", "title", "plannedFor", "notes", "shoppingItems"],
                    },
                  ],
                },
              },
            },
            required: ["replyText", "steps"],
          },
        },
      },
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`OpenAI assistant planning returned ${response.status}.`);
  }

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  };

  const text =
    payload.output_text?.trim() ??
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === "output_text" && typeof item.text === "string")
      ?.text?.trim();

  if (!text) {
    throw new Error("OpenAI assistant returned an empty response.");
  }

  const parsed = JSON.parse(text) as unknown;
  return assistantActionSchema.parse(parsed);
}

function formatConversationHistory(
  history: Array<{
    role: "assistant" | "user";
    content: string;
  }>,
) {
  if (history.length === 0) {
    return "none";
  }

  return history
    .slice(-12)
    .map((item, index) => `${index + 1}. ${item.role}: ${item.content}`)
    .join("\n");
}

function answerCalendarLookupFromCache(
  message: string,
  events: CachedCalendarEvent[],
):
  | {
      reply: string;
      action: "reply" | "clarify";
    }
  | null {
  if (!isCalendarLookupQuestion(message)) {
    return null;
  }

  const queryTokens = extractCalendarSearchTokens(message);

  if (queryTokens.length === 0) {
    return null;
  }

  const matches = events
    .map((event) => ({
      event,
      score: scoreCalendarEventMatch(event, queryTokens),
    }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.event.startsAt.localeCompare(b.event.startsAt));

  if (matches.length === 0) {
    return null;
  }

  const bestMatch = matches[0];
  const secondMatch = matches[1];

  if (secondMatch && secondMatch.score === bestMatch.score) {
    const options = matches
      .slice(0, 3)
      .map((match) => `${match.event.title} (${formatAssistantEventMoment(match.event)})`)
      .join(", ");

    return {
      reply: `Jeg fandt flere mulige aftaler: ${options}. Hvilken tænker du på?`,
      action: "clarify",
    };
  }

  return {
    reply: formatCalendarLookupReply(bestMatch.event),
    action: "reply",
  };
}

function isLikelyFollowUpMessage(message: string) {
  const normalized = normalizeMatchText(message);

  return [
    "ja",
    "jo",
    "ok",
    "okay",
    "gør det",
    "go",
    "slet den",
    "slet det",
    "flyt den",
    "flyt det",
    "nej",
    "tak",
    "den",
    "det",
  ].includes(normalized);
}

function isCalendarLookupQuestion(message: string) {
  const normalized = normalizeMatchText(message);

  const lookupSignals = [
    "hvornår",
    "hvad tid",
    "hvilken dag",
    "fortæl mig",
    "kan du se",
    "kan du finde",
    "hvad ligger",
    "har vi",
  ];
  const actionSignals = [
    "opret",
    "skriv",
    "tilføj",
    "lav",
    "slet",
    "flyt",
    "ret",
    "ændr",
    "book",
  ];

  return lookupSignals.some((signal) => normalized.includes(signal)) &&
    !actionSignals.some((signal) => normalized.includes(signal));
}

function normalizeMatchText(value: string) {
  return value
    .toLowerCase()
    .replace(/["“”]/g, "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCalendarSearchTokens(message: string) {
  const stopWords = new Set([
    "jeg",
    "mig",
    "du",
    "det",
    "den",
    "de",
    "vi",
    "os",
    "skal",
    "på",
    "til",
    "i",
    "om",
    "igen",
    "fortael",
    "fortal",
    "mig",
    "hvornar",
    "hvornaar",
    "hvad",
    "tid",
    "hvilken",
    "dag",
    "er",
    "var",
    "vores",
  ]);

  return normalizeMatchText(message)
    .split(" ")
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function scoreCalendarEventMatch(event: CachedCalendarEvent, queryTokens: string[]) {
  const haystack = normalizeMatchText(
    [event.title, event.description, event.location, event.calendarName].filter(Boolean).join(" "),
  );
  let score = 0;

  for (const token of queryTokens) {
    const expandedTokens = expandCalendarSearchToken(token);

    if (expandedTokens.some((candidate) => haystack.includes(candidate))) {
      score += token.length >= 5 ? 3 : 2;
      continue;
    }

    if (expandedTokens.some((candidate) => fuzzyContains(haystack, candidate))) {
      score += 1;
    }
  }

  if (normalizeMatchText(event.title).includes(queryTokens.join(" "))) {
    score += 2;
  }

  return score;
}

function expandCalendarSearchToken(token: string) {
  const synonymMap: Record<string, string[]> = {
    ferie: ["ferie", "rejse", "tur", "trip", "vacation"],
    rejse: ["rejse", "ferie", "tur", "trip", "vacation"],
    tur: ["tur", "rejse", "ferie", "trip"],
    tyrkiet: ["tyrkiet", "turkiet"],
    eksamen: ["eksamen", "prove", "proeve", "test"],
    psykolog: ["psykolog", "psykologi"],
    psykologi: ["psykologi", "psykolog"],
  };

  return synonymMap[token] ?? [token];
}

function fuzzyContains(haystack: string, needle: string) {
  if (needle.length < 4) {
    return false;
  }

  for (const part of haystack.split(" ")) {
    if (part.startsWith(needle.slice(0, Math.max(3, needle.length - 2)))) {
      return true;
    }
  }

  return false;
}

function formatCalendarLookupReply(event: CachedCalendarEvent) {
  const normalizedTitle = event.title.trim();
  const titlePrefix = /^[A-ZÆØÅ]/.test(normalizedTitle)
    ? normalizedTitle
    : normalizedTitle.charAt(0).toUpperCase() + normalizedTitle.slice(1);

  if (event.isAllDay) {
    const start = toAppTimeZoneDate(event.startsAt);
    const end = toAppTimeZoneDate(event.endsAt);
    const isMultiDay = getAppDateKey(event.startsAt) !== getAppDateKey(event.endsAt);

    if (isMultiDay) {
      return `${titlePrefix} ligger fra ${format(start, "EEEE 'den' d. MMMM", { locale: da })} til ${format(end, "EEEE 'den' d. MMMM", { locale: da })}.`;
    }

    return `${titlePrefix} ligger ${format(start, "EEEE 'den' d. MMMM", { locale: da })}.`;
  }

  const start = toAppTimeZoneDate(event.startsAt);
  return `${titlePrefix} ligger ${format(start, "EEEE 'den' d. MMMM", { locale: da })} kl. ${formatAppTime(event.startsAt)}.`;
}

function formatAssistantEventMoment(event: CachedCalendarEvent) {
  if (event.isAllDay) {
    return format(toAppTimeZoneDate(event.startsAt), "d. MMM", { locale: da });
  }

  return `${format(toAppTimeZoneDate(event.startsAt), "d. MMM", { locale: da })} kl. ${formatAppTime(event.startsAt)}`;
}

function resolveCalendarDeletionMatch(
  events: CachedCalendarEvent[],
  target: {
    title: string;
    startsAt: string | null;
    calendarName: string | null;
  },
):
  | { type: "match"; event: CachedCalendarEvent }
  | { type: "not_found" }
  | { type: "ambiguous"; options: string[] } {
  const normalizedTitle = normalizeMatchText(target.title);
  const normalizedCalendarName = target.calendarName ? normalizeMatchText(target.calendarName) : null;

  let matches = events.filter((event) => {
    const eventTitle = normalizeMatchText(event.title);
    const titleMatches =
      eventTitle === normalizedTitle ||
      eventTitle.includes(normalizedTitle) ||
      normalizedTitle.includes(eventTitle);

    if (!titleMatches) {
      return false;
    }

    if (normalizedCalendarName) {
      const eventCalendarName = normalizeMatchText(event.calendarName ?? "");

      if (eventCalendarName !== normalizedCalendarName) {
        return false;
      }
    }

    return true;
  });

  if (target.startsAt) {
    const targetTime = new Date(target.startsAt).getTime();
    const targetDay = getAppDateKey(target.startsAt);

    matches = matches.filter((event) => {
      const eventTime = new Date(event.startsAt).getTime();
      return eventTime === targetTime || getAppDateKey(event.startsAt) === targetDay;
    });
  }

  if (matches.length === 0) {
    return { type: "not_found" };
  }

  if (matches.length === 1) {
    return { type: "match", event: matches[0] };
  }

  return {
    type: "ambiguous",
    options: matches.slice(0, 4).map((event) => `${event.title} kl. ${formatAppTime(event.startsAt)}`),
  };
}

function formatDeletionEventLabel(event: CachedCalendarEvent) {
  if (event.isAllDay) {
    return format(toAppTimeZoneDate(event.startsAt), "EEE d MMM");
  }

  return `${format(toAppTimeZoneDate(event.startsAt), "EEE d MMM")} · ${formatAppTime(event.startsAt)}`;
}
