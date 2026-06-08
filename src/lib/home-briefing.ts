import {
  format,
  formatDistanceToNowStrict,
  isBefore,
} from "date-fns";
import { da } from "date-fns/locale";

import {
  formatAppTime,
  getAppDateKey,
  getCurrentDateContext,
  isTodayInAppTimeZone,
  isTomorrowInAppTimeZone,
  toAppTimeZoneDate,
} from "@/lib/date-context";
import { ensureShoppingListsForFamilyGroup, isLegacyShoppingListId } from "@/lib/family";
import { formatEventTime, type CachedCalendarEvent } from "@/lib/calendar";
import type { AiBriefSettings } from "@/lib/ai-settings";
import { resolveAiBriefSummary } from "@/lib/ai-briefings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CachedTask } from "@/lib/tasks";
import type {
  BriefingLine,
  DashboardSnapshot,
  FamilyFeedItem,
  HomeBriefingAiInput,
  HomeBriefingModel,
  MealPlanItem,
} from "@/lib/types";

type HomeBriefingInputs = {
  userId: string;
  snapshot: DashboardSnapshot;
  calendarEvents: CachedCalendarEvent[];
  topTasks: CachedTask[];
  aiSettings: AiBriefSettings;
};

type ActivityFeedRow = {
  id: string;
  entity_type: string;
  summary: string;
  created_at: string;
};

type MealPlanRow = {
  id: string;
  title: string;
  notes: string | null;
  planned_for: string;
};

type ShoppingItemRow = {
  id: string;
  label: string;
  meal_plan_id: string | null;
  shopping_list_id: string;
};

export async function buildHomeBriefingModel({
  userId,
  snapshot,
  calendarEvents,
  topTasks,
  aiSettings,
}: HomeBriefingInputs): Promise<HomeBriefingModel> {
  const supabase = await createSupabaseServerClient();
  const dateContext = getCurrentDateContext();
  const today = dateContext.today;
  const todayEvents = calendarEvents.filter(
    (event) => getAppDateKey(event.startsAt) === dateContext.todayIso,
  );
  const overlappingEvents = findOverlappingEvents(todayEvents);
  const nextEvent = calendarEvents[0] ?? null;

  let familyFeedRows: ActivityFeedRow[] = [];
  let mealPlanRows: MealPlanRow[] = [];
  let shoppingRows: ShoppingItemRow[] = [];

  if (supabase && snapshot.familyGroupId) {
    const shoppingLists = await ensureShoppingListsForFamilyGroup({
      supabase,
      familyGroupId: snapshot.familyGroupId,
      userId,
    });
    const primaryShoppingListId =
      shoppingLists.find((list) => list.isPrimary)?.id ?? shoppingLists[0]?.id ?? null;

    const [familyFeedResult, mealPlanResult] = await Promise.all([
      supabase
        .from("activity_feed")
        .select("id, entity_type, summary, created_at")
        .eq("family_group_id", snapshot.familyGroupId)
        .gte("created_at", `${dateContext.weekStartIso}T00:00:00.000Z`)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("meal_plans")
        .select("id, title, notes, planned_for")
        .eq("family_group_id", snapshot.familyGroupId)
        .gte("planned_for", format(today, "yyyy-MM-dd"))
        .order("planned_for", { ascending: true })
        .limit(3),
    ]);

    const shoppingResult = isLegacyShoppingListId(primaryShoppingListId)
      ? await supabase
          .from("shopping_items")
          .select("id, label, meal_plan_id")
          .eq("family_group_id", snapshot.familyGroupId)
          .eq("is_completed", false)
          .order("created_at", { ascending: false })
          .limit(6)
      : await supabase
          .from("shopping_items")
          .select("id, label, meal_plan_id, shopping_list_id")
          .eq("family_group_id", snapshot.familyGroupId)
          .eq("shopping_list_id", primaryShoppingListId ?? "")
          .eq("is_completed", false)
          .order("created_at", { ascending: false })
          .limit(6);

    familyFeedRows = familyFeedResult.data ?? [];
    mealPlanRows = mealPlanResult.data ?? [];
    shoppingRows = ((shoppingResult.data as Array<Record<string, unknown>> | null) ?? []).map((item) => ({
      id: String(item.id ?? ""),
      label: String(item.label ?? ""),
      meal_plan_id: (item.meal_plan_id as string | null) ?? null,
      shopping_list_id:
        (item.shopping_list_id as string | undefined) ??
        primaryShoppingListId ??
        "legacy-household",
    }));
  }

  const baseSummary = buildSummary({
    todayEvents,
    nextEvent,
    topTasks,
    mealPlan: mealPlanRows[0] ?? null,
    openShoppingItemCount: shoppingRows.length || snapshot.openShoppingItemCount,
    familyGroupName: snapshot.familyGroupName,
  });
  const signals = buildBriefingLines({
    todayEvents,
    nextEvent,
    topTasks,
    mealPlan: mealPlanRows[0] ?? null,
    shoppingRows,
    familyGroupName: snapshot.familyGroupName,
  });
  const familyFeed = buildFamilyFeed({
    rows: familyFeedRows,
    mealPlan: mealPlanRows[0] ?? null,
    shoppingRows,
    snapshot,
    nextEvent,
  });
  const mealPlan = buildMealPlanItems(mealPlanRows, shoppingRows);
  const dayShape = buildDayShape({
    todayEvents,
    topTasks,
    mealPlan: mealPlanRows[0] ?? null,
    openShoppingItemCount: shoppingRows.length || snapshot.openShoppingItemCount,
  });
  const integrationStatus = buildIntegrationStatus(snapshot);
  const aiInput = buildAiInput({
    snapshot,
    aiSettings,
    dateContext,
    todayEvents,
    overlappingEvents,
    nextEvent,
    topTasks,
    mealPlanRows,
    shoppingRows,
    familyFeedRows,
    dayShape,
    integrationStatus,
  });
  const ai = await resolveAiBriefSummary({
    userId,
    familyGroupId: snapshot.familyGroupId,
    fallbackSummary: baseSummary,
    aiInput,
    settings: aiSettings,
  });

  return {
    dateLabel: dateContext.dateLabel,
    summary: ai.summary,
    signals,
    familyFeed,
    mealPlan,
    dayShape,
    integrationStatus,
    ai,
  };
}

function buildAiInput({
  snapshot,
  aiSettings,
  dateContext,
  todayEvents,
  overlappingEvents,
  nextEvent,
  topTasks,
  mealPlanRows,
  shoppingRows,
  familyFeedRows,
  dayShape,
  integrationStatus,
}: {
  snapshot: DashboardSnapshot;
  aiSettings: AiBriefSettings;
  dateContext: ReturnType<typeof getCurrentDateContext>;
  todayEvents: CachedCalendarEvent[];
  overlappingEvents: ReturnType<typeof findOverlappingEvents>;
  nextEvent: CachedCalendarEvent | null;
  topTasks: CachedTask[];
  mealPlanRows: MealPlanRow[];
  shoppingRows: ShoppingItemRow[];
  familyFeedRows: ActivityFeedRow[];
  dayShape: string;
  integrationStatus: string;
}): HomeBriefingAiInput {
  const { personalTasks, familyTasks } = splitTasks(topTasks, snapshot.familyGroupName);
  const todayMeal = mealPlanRows.find((mealPlan) => mealPlan.planned_for === dateContext.todayIso) ?? null;
  const familyLogistics = todayEvents.filter((event) =>
    isLikelyFamilyLogisticsEvent(event, snapshot.familyGroupName),
  );

  return {
    dateLabel: dateContext.fullDateLabel,
    familyGroupName: snapshot.familyGroupName,
    currentTimeLabel: formatAppTime(new Date()),
    todayEvents: todayEvents.map((event) => ({
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      isAllDay: event.isAllDay,
      location: event.location ?? null,
      calendarName: event.calendarName ?? null,
    })),
    overlappingEvents: overlappingEvents.map((overlap) => ({
      firstTitle: overlap.first.title,
      firstStartsAt: overlap.first.startsAt,
      secondTitle: overlap.second.title,
      secondStartsAt: overlap.second.startsAt,
    })),
    nextEvent: nextEvent
      ? {
          title: nextEvent.title,
          startsAt: nextEvent.startsAt,
          endsAt: nextEvent.endsAt,
          isAllDay: nextEvent.isAllDay,
          location: nextEvent.location ?? null,
          calendarName: nextEvent.calendarName ?? null,
        }
      : null,
    topTasks: topTasks.map((task) => ({
      title: task.title,
      dueAt: task.dueAt,
      taskListName: task.taskListTitle ?? null,
      status: task.status,
      notes: task.notes,
    })),
    personalTasks: personalTasks.map((task) => ({
      title: task.title,
      dueAt: task.dueAt,
      taskListName: task.taskListTitle ?? null,
      notes: task.notes,
    })),
    familyTasks: familyTasks.map((task) => ({
      title: task.title,
      dueAt: task.dueAt,
      taskListName: task.taskListTitle ?? null,
      notes: task.notes,
    })),
    familyLogistics: familyLogistics.map((event) => ({
      title: event.title,
      startsAt: event.startsAt,
      isAllDay: event.isAllDay,
      calendarName: event.calendarName ?? null,
    })),
    todayMeal: todayMeal
      ? {
          title: todayMeal.title,
          notes: todayMeal.notes,
        }
      : null,
    upcomingMeals: mealPlanRows.map((mealPlan) => ({
      title: mealPlan.title,
      plannedFor: mealPlan.planned_for,
      notes: mealPlan.notes,
    })),
    openShoppingItems: shoppingRows.map((item) => ({
      label: item.label,
      mealPlanTitle: mealPlanRows.find((plan) => plan.id === item.meal_plan_id)?.title ?? null,
    })),
    familyFeed: familyFeedRows.map((row) => ({
      summary: row.summary,
      entityType: row.entity_type,
      createdAt: row.created_at,
    })),
    customGuidance: aiSettings.customGuidance,
    integrationStatus,
    dayShape,
  };
}

function buildSummary({
  todayEvents,
  nextEvent,
  topTasks,
  mealPlan,
  openShoppingItemCount,
  familyGroupName,
}: {
  todayEvents: CachedCalendarEvent[];
  nextEvent: CachedCalendarEvent | null;
  topTasks: CachedTask[];
  mealPlan: MealPlanRow | null;
  openShoppingItemCount: number;
  familyGroupName: string | null;
}) {
  const parts: string[] = [];
  const overlapText = buildOverlapSummary(todayEvents);
  const namedEventsText = buildNamedTodayEventsSummary(todayEvents);
  const { personalTasks, familyTasks } = splitTasks(topTasks, familyGroupName);
  const isTodaysMeal = mealPlan ? mealPlan.planned_for === getCurrentDateContext().todayIso : false;

  if (todayEvents.length > 0) {
    parts.push(namedEventsText);
  } else if (nextEvent) {
    parts.push(`Din næste aftale er ${nextEvent.title} kl. ${formatEventTime(nextEvent)}.`);
  } else {
    parts.push("Kalenderen er rolig, så dagen kan formes mere frit.");
  }

  if (overlapText) {
    parts.push(overlapText);
  }

  if (personalTasks[0] || familyTasks[0]) {
    const personalText = personalTasks[0]
      ? `${personalTasks[0].title}${getTaskDueLabel(personalTasks[0]) ? ` ${getTaskDueLabel(personalTasks[0])}` : ""}`
      : null;
    const familyText = familyTasks[0]
      ? `${familyTasks[0].title}${getTaskDueLabel(familyTasks[0]) ? ` ${getTaskDueLabel(familyTasks[0])}` : ""}`
      : null;

    if (personalText && familyText) {
      parts.push(`Personligt ligger ${personalText}, og i familien ligger ${familyText}.`);
    } else if (personalText) {
      parts.push(`Personligt ligger ${personalText}.`);
    } else if (familyText) {
      parts.push(`I familien ligger ${familyText}.`);
    }
  }

  if (mealPlan) {
    parts.push(
      isTodaysMeal
        ? `Aftensmaden er ${mealPlan.title}.`
        : `Næste planlagte aftensmad er ${mealPlan.title}.`,
    );
  } else if (openShoppingItemCount > 0) {
    parts.push("Den fælles indkøbsliste trænger stadig til et hurtigt kig.");
  }

  return parts.join(" ");
}

function buildBriefingLines({
  todayEvents,
  nextEvent,
  topTasks,
  mealPlan,
  shoppingRows,
  familyGroupName,
}: {
  todayEvents: CachedCalendarEvent[];
  nextEvent: CachedCalendarEvent | null;
  topTasks: CachedTask[];
  mealPlan: MealPlanRow | null;
  shoppingRows: ShoppingItemRow[];
  familyGroupName: string | null;
}): BriefingLine[] {
  const lines: BriefingLine[] = [];
  const overlapText = buildOverlapSummary(todayEvents);
  const { personalTasks, familyTasks } = splitTasks(topTasks, familyGroupName);
  const isTodaysMeal = mealPlan ? mealPlan.planned_for === getCurrentDateContext().todayIso : false;

  if (todayEvents.length > 0) {
    lines.push({
      id: "today-events",
      text: buildNamedTodayEventsSummary(todayEvents),
    });
  }

  if (nextEvent && !overlapText) {
    const startText = nextEvent.isAllDay ? "hele dagen" : `kl. ${formatEventTime(nextEvent)}`;
    lines.push({
      id: "next-event",
      text: `Næste punkt er ${nextEvent.title} ${startText}.`,
      tone: "accent",
    });
  }

  if (overlapText) {
    lines.push({
      id: "overlap",
      text: overlapText,
      tone: "warning",
    });
  }

  if (personalTasks[0]) {
    const dueLabel = getTaskDueLabel(personalTasks[0]);
    lines.push({
      id: "personal-task",
      text: dueLabel
        ? `Personligt: ${personalTasks[0].title} ${dueLabel}.`
        : `Personligt: ${personalTasks[0].title}.`,
      tone: dueLabel ? "warning" : "neutral",
    });
  }

  if (familyTasks[0]) {
    const dueLabel = getTaskDueLabel(familyTasks[0]);
    lines.push({
      id: "family-task",
      text: dueLabel
        ? `Familie-logistik: ${familyTasks[0].title} ${dueLabel}.`
        : `Familie-logistik: ${familyTasks[0].title}.`,
      tone: dueLabel ? "warning" : "neutral",
    });
  }

  if (mealPlan) {
    lines.push({
      id: "meal-plan",
      text: isTodaysMeal
        ? `Aftensmaden er ${mealPlan.title}.`
        : `Næste ret i madplanen er ${mealPlan.title}.`,
    });
  }

  if (shoppingRows.length > 0) {
    lines.push({
      id: "shopping",
      text: `${buildShoppingSummary(shoppingRows)} kræver stadig opmærksomhed.`,
      tone: "warning",
    });
  }

  if (lines.length === 0) {
    lines.push({
      id: "blank-state",
      text: "Forbind Google Kalender og Google Tasks for at gøre dette til en live, aktuel briefing.",
    });
  }

  return lines.slice(0, 5);
}

function buildFamilyFeed({
  rows,
  mealPlan,
  shoppingRows,
  snapshot,
  nextEvent,
}: {
  rows: ActivityFeedRow[];
  mealPlan: MealPlanRow | null;
  shoppingRows: ShoppingItemRow[];
  snapshot: DashboardSnapshot;
  nextEvent: CachedCalendarEvent | null;
}): FamilyFeedItem[] {
  if (rows.length > 0) {
    return rows.map((row) => ({
      id: row.id,
      summary: row.summary,
      meta: `${toEntityLabel(row.entity_type)} · ${formatDistanceToNowStrict(new Date(row.created_at), { addSuffix: true })}`,
    }));
  }

  const fallback: FamilyFeedItem[] = [];

  if (shoppingRows.length > 0) {
    fallback.push({
      id: "shopping-fallback",
      summary: `${buildShoppingSummary(shoppingRows)} er stadig åbne på den fælles liste.`,
      meta: "Indkøbsliste",
    });
  }

  if (mealPlan) {
    fallback.push({
      id: "meal-fallback",
      summary:
        mealPlan.planned_for === getCurrentDateContext().todayIso
          ? `Aftensmaden er planlagt som ${mealPlan.title}.`
          : `Næste ret i madplanen er ${mealPlan.title}.`,
      meta: "Madplan",
    });
  }

  if (nextEvent) {
    fallback.push({
      id: "calendar-fallback",
      summary: `Næste fælles holdepunkt er ${nextEvent.title} ${nextEvent.isAllDay ? "i dag" : `kl. ${formatEventTime(nextEvent)}`}.`,
      meta: "Kalender",
    });
  }

  if (fallback.length === 0) {
    fallback.push({
      id: "family-empty",
      summary: snapshot.familyGroupName
        ? `${snapshot.familyGroupName} er forbundet, men det fælles familiefeed er endnu ikke begyndt at fylde sig selv.`
        : "Opret den første familiegruppe for at åbne et fælles feed til madplan, indkøb og rutiner.",
      meta: "Familie",
    });
  }

  return fallback.slice(0, 3);
}

function buildMealPlanItems(mealPlans: MealPlanRow[], shoppingRows: ShoppingItemRow[]): MealPlanItem[] {
  if (mealPlans.length === 0) {
    return [
      {
        id: "meal-empty",
        day: "Snart",
        meal: "Ingen madplan gemt endnu",
        note: "Den første gemte aftensmad dukker op her sammen med relevante indkøb.",
      },
    ];
  }

  return mealPlans.map((plan) => {
    const relatedShopping = shoppingRows.filter((item) => item.meal_plan_id === plan.id);

    return {
      id: plan.id,
      day: getDayLabel(plan.planned_for),
      meal: plan.title,
      note: buildMealNote(plan, relatedShopping),
    };
  });
}

function buildDayShape({
  todayEvents,
  topTasks,
  mealPlan,
  openShoppingItemCount,
}: {
  todayEvents: CachedCalendarEvent[];
  topTasks: CachedTask[];
  mealPlan: MealPlanRow | null;
  openShoppingItemCount: number;
}) {
  const parts = [
    `${todayEvents.length} aftale${todayEvents.length === 1 ? "" : "r"} i dag`,
    `${topTasks.length} åbne punkt${topTasks.length === 1 ? "" : "er"} på listen`,
  ];

  if (mealPlan) {
    parts.push(`aftensmad er sat til ${mealPlan.title}`);
  } else if (openShoppingItemCount > 0) {
    parts.push(`${openShoppingItemCount} indkøbsvare${openShoppingItemCount === 1 ? "" : "r"} er stadig åbne`);
  }

  return `${capitalize(parts.join(", "))}.`;
}

function buildIntegrationStatus(snapshot: DashboardSnapshot) {
  const connectedCount = snapshot.connectedProviders.filter(
    (provider) => provider.status === "connected",
  ).length;
  const latestSync = snapshot.connectedProviders
    .map((provider) => provider.lastSyncedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  if (connectedCount === 0) {
    return "Der er endnu ingen Google-integrationer forbundet. Supabase-login virker, og appen er klar til første sync.";
  }

  const syncText = latestSync
    ? ` Seneste sync ${formatDistanceToNowStrict(new Date(latestSync), {
        addSuffix: true,
        locale: da,
      })}.`
    : "";

  return `${connectedCount} Google-forbindelse${connectedCount === 1 ? "" : "r"} klar. Kalender-cache: ${snapshot.calendarEventCount}. Lister-cache: ${snapshot.taskCount}.${syncText}`;
}

function buildMealNote(plan: MealPlanRow, shoppingRows: ShoppingItemRow[]) {
  if (shoppingRows.length > 0) {
    const labels = shoppingRows.slice(0, 2).map((item) => item.label).join(", ");
    const remainder = shoppingRows.length > 2 ? ` +${shoppingRows.length - 2} mere` : "";
    return `Mangler ${labels}${remainder}.`;
  }

  if (plan.notes) {
    return plan.notes;
  }

  return "Gemt i Supabase og klar til familiekontekst.";
}

function buildShoppingSummary(shoppingRows: ShoppingItemRow[]) {
  const labels = shoppingRows.slice(0, 2).map((item) => item.label);

  if (shoppingRows.length <= 2) {
    return labels.join(" og ");
  }

  return `${labels.join(", ")} og ${shoppingRows.length - 2} mere`;
}

function getTaskDueLabel(task: CachedTask) {
  if (!task.dueAt) {
    return null;
  }

  const dueDate = new Date(task.dueAt);
  const now = new Date();

  if (isBefore(dueDate, now)) {
    return "er forsinket";
  }

  if (isTodayInAppTimeZone(dueDate, now)) {
    return "forfalder i dag";
  }

  if (isTomorrowInAppTimeZone(dueDate, now)) {
    return "forfalder i morgen";
  }

  return `forfalder ${format(toAppTimeZoneDate(dueDate), "EEE", { locale: da })}`;
}

function getDayLabel(value: string) {
  const date = new Date(value);

  if (isTodayInAppTimeZone(date)) {
    return "i dag";
  }

  if (isTomorrowInAppTimeZone(date)) {
    return "i morgen";
  }

  return format(toAppTimeZoneDate(date), "EEEE", { locale: da });
}

function buildNamedTodayEventsSummary(todayEvents: CachedCalendarEvent[]) {
  if (todayEvents.length === 0) {
    return "Der ligger ingen aftaler i kalenderen i dag.";
  }

  const items = todayEvents.map((event) =>
    `${event.title} ${event.isAllDay ? "hele dagen" : `kl. ${formatEventTime(event)}`}`,
  );

  if (items.length === 1) {
    return `I kalenderen i dag ligger ${items[0]}.`;
  }

  if (items.length === 2) {
    return `I kalenderen i dag ligger ${items[0]} og ${items[1]}.`;
  }

  return `I kalenderen i dag ligger ${items.slice(0, -1).join(", ")} og ${items.at(-1)}.`;
}

function buildOverlapSummary(todayEvents: CachedCalendarEvent[]) {
  const overlaps = findOverlappingEvents(todayEvents);

  if (overlaps.length === 0) {
    return null;
  }

  const firstOverlap = overlaps[0];
  return `${firstOverlap.first.title} kl. ${formatEventTime(firstOverlap.first)} overlapper med ${firstOverlap.second.title} kl. ${formatEventTime(firstOverlap.second)}.`;
}

function findOverlappingEvents(todayEvents: CachedCalendarEvent[]) {
  const sortedEvents = [...todayEvents]
    .filter((event) => !event.isAllDay)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const overlaps: Array<{ first: CachedCalendarEvent; second: CachedCalendarEvent }> = [];

  for (let index = 0; index < sortedEvents.length - 1; index += 1) {
    const current = sortedEvents[index];
    const next = sortedEvents[index + 1];

    if (new Date(current.endsAt).getTime() > new Date(next.startsAt).getTime()) {
      overlaps.push({ first: current, second: next });
    }
  }

  return overlaps;
}

function splitTasks(topTasks: CachedTask[], familyGroupName: string | null) {
  const personalTasks: CachedTask[] = [];
  const familyTasks: CachedTask[] = [];

  for (const task of topTasks) {
    if (isLikelyFamilyTask(task, familyGroupName)) {
      familyTasks.push(task);
    } else {
      personalTasks.push(task);
    }
  }

  return { personalTasks, familyTasks };
}

function isLikelyFamilyTask(task: CachedTask, familyGroupName: string | null) {
  const combined = [
    task.taskListTitle,
    task.title,
    task.notes,
    familyGroupName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return [
    "famil",
    "hjem",
    "hus",
    "børn",
    "skole",
    "middag",
    "aftensmad",
    "indkøb",
    "karate",
    "vigga",
  ].some((keyword) => combined.includes(keyword));
}

function isLikelyFamilyLogisticsEvent(event: CachedCalendarEvent, familyGroupName: string | null) {
  const combined = [event.title, event.calendarName, event.location, familyGroupName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return [
    "famil",
    "børn",
    "skole",
    "karate",
    "vigga",
    "forældre",
    "læs med",
    "idræt",
  ].some((keyword) => combined.includes(keyword));
}

function toEntityLabel(value: string) {
  return value
    .split("_")
    .map((part) => capitalize(part))
    .join(" ");
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
