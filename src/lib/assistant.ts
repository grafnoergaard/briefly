import { format } from "date-fns";
import { z } from "zod";

import { getAiBriefSettings } from "@/lib/ai-settings";
import { getUpcomingCalendarEvents, type CachedCalendarEvent } from "@/lib/calendar";
import { getCurrentDateContext, normalizeToAppTimeZoneIsoDateTime } from "@/lib/date-context";
import { getDashboardSnapshot } from "@/lib/dashboard";
import {
  addShoppingItems,
  createMealPlanEntry,
  getFamilyWorkspaceData,
} from "@/lib/family";
import {
  addDefaultEventDuration,
  createGoogleCalendarEvent,
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
}): Promise<AssistantTurnResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY mangler til Briefly-assistenten.");
  }

  const [settings, snapshot, calendarEvents, tasks, familyWorkspace, calendarChoices] =
    await Promise.all([
      getAiBriefSettings(params.userId),
      getDashboardSnapshot(params.userId),
      getUpcomingCalendarEvents(params.userId, 8),
      getOpenTasks(params.userId, 6),
      getFamilyWorkspaceData(params.userId),
      getGoogleCalendarChoices(params.userId),
    ]);
  const dateContext = getCurrentDateContext();

  const selectedCalendars = calendarChoices.filter((calendar) => calendar.isSelected);
  const defaultCalendar =
    selectedCalendars[0] ??
    calendarChoices.find((calendar) => calendar.summary.trim().toLowerCase() === "vores kalender") ??
    calendarChoices[0] ??
    null;

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
    `User message: ${params.message}`,
  ].join(" ");

  const parsed = await planAssistantAction({
    model: settings.model,
    prompt,
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
}: {
  model: string;
  prompt: string;
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
        "You are Briefly, a practical Danish assistant for everyday life. Your purpose is to reduce mental load by turning natural-language requests into calm, useful action. Interpret the user message and decide what concrete actions to take. You may create a Google Calendar event, create a Google Task, add shopping items, create a meal plan entry, or combine several of those in the same response. Be date-aware and week-aware. Resolve relative dates against Europe/Copenhagen and the current ISO week context. Weekend means Saturday and Sunday. For calendar and task datetimes, always output full ISO datetime strings with seconds, for example 2026-06-08T18:00:00+02:00. If the user gives only a start time for a calendar event, leave endsAt null so the app can default it to 60 minutes. For meal plans, plannedFor must be a calendar date in YYYY-MM-DD. Write replyText in Danish. Keep it calm, warm, useful, and specific. If the user is vague or missing key timing information, return no steps and use replyText to ask one short clarification question.",
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
