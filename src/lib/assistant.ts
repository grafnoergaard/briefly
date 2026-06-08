import { addDays, format } from "date-fns";
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
      getOpenTasks(params.userId, 50),
      getFamilyWorkspaceData(params.userId),
      getGoogleCalendarChoices(params.userId),
    ]);
  const dateContext = getCurrentDateContext();
  const isVoiceChannel = params.channel === "voice";
  const customGuidance = settings.customGuidance.trim();

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
    `Current local timestamp in Europe/Copenhagen: ${dateContext.fullDateLabel}, kl. ${formatAppTime(new Date())}.`,
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
    `Extra Briefly principles: ${customGuidance || "none"}.`,
    `Recent conversation:\n${recentConversation}`,
    followUpHint,
    `User message: ${params.message}`,
  ].join(" ");

  const dayBrief = await answerRelativeDayBrief({
    message: params.message,
    model: settings.model,
    calendarEvents,
    tasks,
    familyWorkspace,
    customGuidance,
  });

  if (dayBrief) {
    return {
      reply: humanizeAssistantReply(dayBrief),
      action: "reply",
      createdEvent: null,
      completedActions: [],
    };
  }

  const calendarLookup = answerCalendarLookupFromCache(params.message, calendarEvents);

  if (calendarLookup) {
    return {
      reply: humanizeAssistantReply(calendarLookup.reply),
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
      reply: humanizeAssistantReply(parsed.replyText),
      action: "reply",
      createdEvent: null,
      completedActions: [],
    };
  }

  const user = await requireAssistantUser();
  const completedActions: string[] = [];
  const assistantNotes: string[] = [];
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

      const conflictingEvents = findCalendarConflicts(calendarEvents, {
        startsAt: step.startsAt,
        endsAt: step.endsAt ?? addDefaultEventDuration(step.startsAt),
        isAllDay: step.isAllDay,
      });

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

      const startDate = toAppTimeZoneDate(createdEvent.startsAt);
      const endDate = toAppTimeZoneDate(createdEvent.endsAt);
      const timeLabel = step.isAllDay
        ? format(startDate, "EEE d MMM")
        : `${format(startDate, "EEE d MMM HH.mm")}–${format(endDate, "HH.mm")}`;

      createdEventSummary = {
        title: createdEvent.title,
        calendarName: createdEvent.calendarName,
        timeLabel,
      };
      completedActions.push(`Calendar · ${createdEvent.title} · ${timeLabel}`);

      if (conflictingEvents.length > 0) {
        assistantNotes.push(
          `Den ligger oven i ${conflictingEvents
            .slice(0, 2)
            .map((event) => `${event.title} kl. ${formatAppTime(event.startsAt)}`)
            .join(" og ")}.`,
        );
      } else {
        assistantNotes.push("Der var plads i kalenderen uden overlap.");
      }
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
      const existingTask = findExistingTask(tasks, step.title);

      if (existingTask) {
        assistantNotes.push(
          `To-do'en “${existingTask.title}” findes allerede${existingTask.taskListTitle ? ` i ${existingTask.taskListTitle}` : ""}.`,
        );
        continue;
      }

      const createdTask = await createGoogleTask({
        userId: params.userId,
        title: step.title,
        notes: step.notes,
        dueAt: step.dueAt,
      });
      completedActions.push(
        `Task · ${createdTask.title}${createdTask.taskListTitle ? ` · ${createdTask.taskListTitle}` : ""}`,
      );
      assistantNotes.push(`Jeg har lagt to-do'en “${createdTask.title}” ind.`);
      continue;
    }

    if (step.type === "add_shopping_items") {
      const { newItems, duplicates } = splitShoppingItemsAgainstExisting(
        familyWorkspace.shoppingItems,
        step.items,
      );

      if (duplicates.length > 0) {
        assistantNotes.push(
          duplicates
            .map((item) =>
              `${item.label} findes allerede${item.addedByName ? ` og er lagt ind af ${item.addedByName}` : ""}.`,
            )
            .join(" "),
        );
      }

      if (newItems.length === 0) {
        continue;
      }

      const addedShoppingItems = await addShoppingItems({
        user,
        items: newItems,
      });
      completedActions.push(
        `Shopping · ${addedShoppingItems.items.map((item) => item.label).join(", ")}`,
      );
      assistantNotes.push(
        `Jeg har tilføjet ${addedShoppingItems.items.map((item) => item.label).join(", ")} til indkøbslisten.`,
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
      assistantNotes.push(`Jeg har lagt ${createdMeal.title} på madplanen.`);
    }
  }

  const reply = buildActionAwareReply(parsed.replyText, assistantNotes);

  return {
    reply: humanizeAssistantReply(reply),
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
        `You are Briefly, a practical Danish assistant for everyday life. Your purpose is to reduce mental load by turning natural-language requests into calm, useful action. Interpret the user message and decide what concrete actions to take. You may create a Google Calendar event, delete a Google Calendar event, create a Google Task, add shopping items, create a meal plan entry, or combine several of those in the same response. Be date-aware and week-aware. Resolve relative dates against Europe/Copenhagen and the current ISO week context. Weekend means Saturday and Sunday. Use the recent conversation to keep context across follow-up replies like yes, okay, do it, that one, slet den, flyt den, or thank you. If the most recent assistant message asked a clarification question or named a concrete item, and the user now answers briefly, treat that as a follow-up instead of starting over. Listen carefully before acting: when the user gives multiple details in one request, preserve all of them. For calendar and task datetimes inside steps, always output full ISO datetime strings with seconds, for example 2026-06-08T18:00:00+02:00. For all-day calendar events, set isAllDay to true and use startsAt as the first included day and endsAt as the last included day in human terms, not Google Calendar's exclusive technical end date. In replyText, never use raw ISO strings, timezone abbreviations like CEST/CET, or an explicit year unless the user asked for it or the date is in another calendar year than the current relevant context. Never wrap times or metadata in parentheses. Avoid stiff or technical phrasing. Do not say things like 'dagens vigtigste tid er' or 'klokken 20.10:'. Prefer natural Danish phrasing like i morgen kl. 10.00, tirsdag kl. 18.00, eller den 14. januar. Do not automatically start with greetings like 'godmorgen'. If you use a greeting or acknowledgment, it must match the local time in Europe/Copenhagen. In the evening, never say 'godmorgen'. In the morning, never say 'godaften'. If a greeting is unnecessary, go straight to the answer. If the user gives only a start time for a calendar event, leave endsAt null so the app can default it to 60 minutes. For calendar deletion, use type delete_calendar_event and include the event title. Include startsAt when it is known from the user message or recent conversation. For meal plans, plannedFor must be a calendar date in YYYY-MM-DD. Write replyText in Danish. Keep it calm, warm, useful, specific, and genuinely human.${isVoiceChannel ? " Voice mode: keep replyText short and speakable. Use at most two short sentences unless you are asking a clarification question. Put the action first, then any one essential detail." : ""} If the user is vague or missing key timing information, return no steps and use replyText to ask one short clarification question.`,
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

async function answerRelativeDayBrief(params: {
  message: string;
  model: string;
  calendarEvents: CachedCalendarEvent[];
  tasks: CachedTask[];
  familyWorkspace: {
    mealPlans: FamilyMealPlanEntry[];
    shoppingItems: ShoppingListEntry[];
  };
  customGuidance: string;
}) {
  const target = resolveRelativeDayBriefTarget(params.message);

  if (!target || !process.env.OPENAI_API_KEY) {
    return null;
  }

  const targetDate = target === "tomorrow"
    ? addDays(getCurrentDateContext().today, 1)
    : getCurrentDateContext().today;
  const targetDateKey = format(targetDate, "yyyy-MM-dd");
  const targetLabel = target === "tomorrow" ? "i morgen" : "i dag";

  const dayEvents = params.calendarEvents.filter(
    (event) => getAppDateKey(event.startsAt) === targetDateKey,
  );
  const sortedDayEvents = [...dayEvents].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const overlaps = findEventOverlaps(sortedDayEvents);
  const targetMeal =
    params.familyWorkspace.mealPlans.find((meal) => meal.plannedFor === targetDateKey) ?? null;
  const relevantTasks = params.tasks
    .filter((task) => {
      if (!task.dueAt) {
        return false;
      }

      return getAppDateKey(task.dueAt) === targetDateKey;
    })
    .slice(0, 4);
  const openShoppingItems = params.familyWorkspace.shoppingItems
    .filter((item) => !item.isCompleted)
    .slice(0, 6);

  const dayPrompt = [
    `Skriv en kort, menneskelig briefing på dansk for ${targetLabel}.`,
    `Kalenderaftaler ${targetLabel}: ${
      sortedDayEvents.length > 0
        ? sortedDayEvents
            .map((event) =>
              `${event.title}${event.isAllDay ? " hele dagen" : ` kl. ${formatAppTime(event.startsAt)}`}${
                event.calendarName ? `, kalender ${event.calendarName}` : ""
              }`,
            )
            .join(", ")
        : "ingen kendte aftaler"
    }.`,
    `Overlap ${targetLabel}: ${
      overlaps.length > 0
        ? overlaps
            .map(
              (overlap) =>
                `${overlap.firstTitle} kl. ${formatAppTime(overlap.firstStartsAt)} overlapper med ${overlap.secondTitle} kl. ${formatAppTime(overlap.secondStartsAt)}`,
            )
            .join(", ")
        : "ingen overlap"
    }.`,
    `Opgaver med relevans ${targetLabel}: ${
      relevantTasks.length > 0
        ? relevantTasks
            .map(
              (task) =>
                `${task.title}${task.taskListTitle ? `, liste ${task.taskListTitle}` : ""}${task.notes ? `, note ${task.notes}` : ""}`,
            )
            .join(", ")
        : "ingen tydelige opgaver"
    }.`,
    `Middag ${targetLabel}: ${targetMeal ? `${targetMeal.title}${targetMeal.notes ? `, note ${targetMeal.notes}` : ""}` : "ingen planlagt middag"}.`,
    `Åbne indkøb: ${
      openShoppingItems.length > 0
        ? openShoppingItems
            .map((item) => `${item.label}${item.mealPlanId ? " knyttet til en ret" : ""}`)
            .join(", ")
        : "indkøbene er under kontrol"
    }.`,
    `Ekstra Briefly-principper: ${params.customGuidance || "ingen ekstra principper"}.`,
    "Skriv 3 til 4 sætninger som en rolig, brugbar briefing. Nævn konkrete aftaler ved navn. Giv kontekst, ikke bare en opremsning. Fortæl hvad der er vigtigst at være opmærksom på, om noget overlapper, og om middag eller indkøb kræver handling. Hvis der ikke er planlagt middag, skal det behandles som et fokuspunkt og ikke som neutral status, fordi det ofte betyder at aftensplan og muligvis også indkøb ikke er helt på plads. Undgå årstal, undgå tidszoner, undgå parenteser og undgå stive formuleringer. Start ikke automatisk med 'godmorgen'. Hvis du bruger en hilsen, skal den passe til tidspunktet i Danmark. Hvis en hilsen er unødvendig, så gå direkte til briefingen. Det skal lyde som et menneske, ikke som et system.",
  ].join(" ");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: params.model,
      reasoning: { effort: "low" },
      instructions:
        "Du er Briefly. Skriv en kort, varm og brugbar dansk briefing for den ønskede dag. Den skal føles som en lille menneskelig oversigt, ikke som en tør kalenderliste. Manglende middag er et reelt opmærksomhedspunkt og må ikke behandles som om alt er under kontrol. Start ikke automatisk med 'godmorgen'. Hvis du bruger en hilsen, skal den passe til tidspunktet i Danmark. Hvis en hilsen er unødvendig, så gå direkte til briefingen.",
      input: dayPrompt,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    return buildFallbackDayBrief({
      targetLabel,
      events: sortedDayEvents,
      overlaps,
      targetMeal,
      openShoppingItems,
    });
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

  return text
    ? humanizeAssistantReply(text)
    : buildFallbackDayBrief({
        targetLabel,
        events: sortedDayEvents,
        overlaps,
        targetMeal,
        openShoppingItems,
      });
}

function resolveRelativeDayBriefTarget(message: string) {
  const normalized = normalizeMatchText(message);

  const asksForBrief =
    normalized.includes("morgenbrief") ||
    normalized.includes("brief") ||
    normalized.includes("oversigt");

  if (!asksForBrief) {
    return null;
  }

  if (normalized.includes("i morgen") || normalized.includes("imorgen")) {
    return "tomorrow" as const;
  }

  if (normalized.includes("i dag") || normalized.includes("idag")) {
    return "today" as const;
  }

  return null;
}

function buildActionAwareReply(replyText: string, assistantNotes: string[]) {
  const cleanedReply = replyText.trim();

  if (assistantNotes.length === 0) {
    return cleanedReply;
  }

  const uniqueNotes = [...new Set(assistantNotes.map((note) => note.trim()).filter(Boolean))];

  if (!cleanedReply) {
    return uniqueNotes.join(" ");
  }

  return `${cleanedReply} ${uniqueNotes.join(" ")}`.trim();
}

function findEventOverlaps(events: CachedCalendarEvent[]) {
  const overlaps: Array<{
    firstTitle: string;
    firstStartsAt: string;
    secondTitle: string;
    secondStartsAt: string;
  }> = [];

  for (let index = 0; index < events.length - 1; index += 1) {
    const current = events[index];
    const next = events[index + 1];

    if (current.isAllDay || next.isAllDay) {
      continue;
    }

    if (new Date(current.endsAt).getTime() > new Date(next.startsAt).getTime()) {
      overlaps.push({
        firstTitle: current.title,
        firstStartsAt: current.startsAt,
        secondTitle: next.title,
        secondStartsAt: next.startsAt,
      });
    }
  }

  return overlaps;
}

function findCalendarConflicts(
  events: CachedCalendarEvent[],
  target: {
    startsAt: string;
    endsAt: string;
    isAllDay: boolean;
  },
) {
  if (target.isAllDay) {
    return [];
  }

  const targetStart = new Date(target.startsAt).getTime();
  const targetEnd = new Date(target.endsAt).getTime();

  return events.filter((event) => {
    if (event.isAllDay) {
      return false;
    }

    const eventStart = new Date(event.startsAt).getTime();
    const eventEnd = new Date(event.endsAt).getTime();
    return targetStart < eventEnd && targetEnd > eventStart;
  });
}

function buildFallbackDayBrief(params: {
  targetLabel: string;
  events: CachedCalendarEvent[];
  overlaps: Array<{
    firstTitle: string;
    firstStartsAt: string;
    secondTitle: string;
    secondStartsAt: string;
  }>;
  targetMeal: FamilyMealPlanEntry | null;
  openShoppingItems: ShoppingListEntry[];
}) {
  if (params.events.length === 0) {
    return `Der er ikke meget bundet op i kalenderen ${params.targetLabel}. ${
      params.targetMeal
        ? `Middagen er ${params.targetMeal.title}.`
        : "Der er heller ingen middag lagt fast endnu."
    }`;
  }

  const firstEvent = params.events[0];
  const overlapLine = params.overlaps[0]
    ? `Vær især opmærksom på, at ${params.overlaps[0].firstTitle} overlapper med ${params.overlaps[0].secondTitle}.`
    : "";
  const mealLine = params.targetMeal
    ? `Middagen er ${params.targetMeal.title}.`
    : "Der er endnu ikke planlagt middag, så det er værd at få styr på aftensmaden.";
  const shoppingLine = params.openShoppingItems.length > 0
    ? `Indkøbslisten er stadig åben med blandt andet ${params.openShoppingItems.slice(0, 2).map((item) => item.label).join(" og ")}.`
    : params.targetMeal
      ? ""
      : "Indkøbene ser rolige ud, men når middagen ikke er planlagt endnu, er det værd at holde øje med om der også mangler indkøb.";

  return [
    `${params.targetLabel === "i morgen" ? "I morgen" : "I dag"} starter med ${firstEvent.title}${firstEvent.isAllDay ? "" : ` kl. ${formatAppTime(firstEvent.startsAt)}`}.`,
    overlapLine,
    mealLine,
    shoppingLine,
  ]
    .filter(Boolean)
    .join(" ");
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

function findExistingTask(tasks: CachedTask[], title: string) {
  const normalizedTitle = normalizeMatchText(title);

  return tasks.find((task) => normalizeMatchText(task.title) === normalizedTitle) ?? null;
}

function splitShoppingItemsAgainstExisting(
  shoppingItems: ShoppingListEntry[],
  items: Array<{
    label: string;
    quantity?: string | null;
    category?: string | null;
  }>,
) {
  const existingOpenItems = shoppingItems.filter((item) => !item.isCompleted);
  const duplicates: Array<{
    label: string;
    addedByName: string | null;
  }> = [];
  const newItems: typeof items = [];

  for (const item of items) {
    const normalizedLabel = normalizeMatchText(item.label);
    const existingItem =
      existingOpenItems.find((openItem) => normalizeMatchText(openItem.label) === normalizedLabel) ??
      null;

    if (existingItem) {
      duplicates.push({
        label: existingItem.label,
        addedByName: existingItem.addedByName ?? null,
      });
      continue;
    }

    newItems.push(item);
  }

  return {
    newItems,
    duplicates,
  };
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

function humanizeAssistantReply(text: string) {
  return normalizeTimeAwareGreeting(
    text
    .replace(/\s*\((?:CET|CEST|UTC|GMT[^)]*|kl\.?\s*\d{1,2}[.:]\d{2}|[A-Z]{2,5})\)/g, "")
    .replace(/klokken\s+\d{1,2}[.:]\d{2}:\s*dagens vigtigste tid er\s*kl\.?\s*(\d{1,2}[.:]\d{2})/gi, "Dagens vigtigste tidspunkt er kl. $1")
    .replace(/dagens vigtigste tid er\s*kl\.?\s*(\d{1,2}[.:]\d{2})/gi, "Dagens vigtigste tidspunkt er kl. $1")
    .replace(/\s{2,}/g, " ")
    .trim(),
  );
}

function normalizeTimeAwareGreeting(text: string) {
  const hour = toAppTimeZoneDate(new Date()).getHours();
  const trimmed = text.trim();

  const stripGreeting = (pattern: RegExp) =>
    trimmed.replace(pattern, "").replace(/^[—,:;\s-]+/, "").trim();

  if (hour >= 11 && /^\s*god\s*morgen\b/i.test(trimmed)) {
    return stripGreeting(/^\s*god\s*morgen\b\s*[—,:;\s-]*/i);
  }

  if (hour < 17 && /^\s*god\s*aften\b/i.test(trimmed)) {
    return stripGreeting(/^\s*god\s*aften\b\s*[—,:;\s-]*/i);
  }

  if (hour < 5 && /^\s*god\s*eftermiddag\b/i.test(trimmed)) {
    return stripGreeting(/^\s*god\s*eftermiddag\b\s*[—,:;\s-]*/i);
  }

  return trimmed;
}
