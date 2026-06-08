export type BriefingItemTone = "neutral" | "accent" | "warning";

export type BriefingLine = {
  id: string;
  text: string;
  tone?: BriefingItemTone;
};

export type CalendarItem = {
  id: string;
  title: string;
  time: string;
  detail: string;
};

export type FocusTask = {
  id: string;
  title: string;
  category: string;
  energy: "Low lift" | "Deep work" | "Admin";
};

export type FamilyFeedItem = {
  id: string;
  summary: string;
  meta: string;
  author?: string;
  action?: string;
};

export type MealPlanItem = {
  id: string;
  day: string;
  meal: string;
  note: string;
};

export type IntegrationConnection = {
  provider: string;
  status: "pending" | "connected" | "error" | "revoked";
  lastSyncedAt: string | null;
};

export type DashboardSnapshot = {
  familyGroupId: string | null;
  profileName: string | null;
  profileEmail: string | null;
  familyGroupName: string | null;
  connectedProviders: IntegrationConnection[];
  calendarEventCount: number;
  taskCount: number;
  openShoppingItemCount: number;
  latestMealPlan:
    | {
        title: string;
        plannedFor: string;
      }
    | null;
};

export type HomeBriefingModel = {
  dateLabel: string;
  summary: string;
  signals: BriefingLine[];
  familyFeed: FamilyFeedItem[];
  mealPlan: MealPlanItem[];
  dayShape: string;
  integrationStatus: string;
  ai: {
    mode: "disabled" | "rule_based_ready" | "generated" | "error";
    status: string;
    promptText: string;
    input: HomeBriefingAiInput;
    sections: HomeBriefingAiSection[];
  };
};

export type HomeBriefingAiSection = {
  key: "time" | "task" | "dinner" | "shopping";
  label: string;
  text: string;
};

export type HomeBriefingAiInput = {
  dateLabel: string;
  familyGroupName: string | null;
  currentTimeLabel: string;
  todayEvents: Array<{
    title: string;
    startsAt: string;
    endsAt: string;
    isAllDay: boolean;
    location: string | null;
    calendarName: string | null;
  }>;
  overlappingEvents: Array<{
    firstTitle: string;
    firstStartsAt: string;
    secondTitle: string;
    secondStartsAt: string;
  }>;
  nextEvent:
    | {
        title: string;
        startsAt: string;
        endsAt: string;
        isAllDay: boolean;
        location: string | null;
        calendarName: string | null;
      }
    | null;
  topTasks: Array<{
    title: string;
    dueAt: string | null;
    taskListName: string | null;
    status: string;
    notes: string | null;
  }>;
  personalTasks: Array<{
    title: string;
    dueAt: string | null;
    taskListName: string | null;
    notes: string | null;
  }>;
  familyTasks: Array<{
    title: string;
    dueAt: string | null;
    taskListName: string | null;
    notes: string | null;
  }>;
  familyLogistics: Array<{
    title: string;
    startsAt: string;
    isAllDay: boolean;
    calendarName: string | null;
  }>;
  todayMeal:
    | {
        title: string;
        notes: string | null;
      }
    | null;
  upcomingMeals: Array<{
    title: string;
    plannedFor: string;
    notes: string | null;
  }>;
  openShoppingItems: Array<{
    label: string;
    mealPlanTitle: string | null;
  }>;
  familyFeed: Array<{
    summary: string;
    entityType: string;
    createdAt: string;
  }>;
  integrationStatus: string;
  dayShape: string;
};

export type FamilyActivityEntry = {
  id: string;
  summary: string;
  createdAt: string;
  entityType: string;
};

export type FamilyMealPlanEntry = {
  id: string;
  title: string;
  plannedFor: string;
  notes: string | null;
};

export type ShoppingListSummary = {
  id: string;
  name: string;
  slug: string;
  isPrimary: boolean;
};

export type ShoppingListEntry = {
  id: string;
  label: string;
  quantity: string | null;
  category: string | null;
  isCompleted: boolean;
  mealPlanId: string | null;
  sortIndex: number;
  shoppingListId: string;
};
