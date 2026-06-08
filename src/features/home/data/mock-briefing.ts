import type {
  BriefingLine,
  CalendarItem,
  FamilyFeedItem,
  FocusTask,
  MealPlanItem,
} from "@/lib/types";

export const briefingLines: BriefingLine[] = [
  { id: "meetings", text: "Hvad skal du vide? Du har tre aftaler i dag.", tone: "neutral" },
  { id: "drive", text: "Hvad skal du gøre? Kør mod Randers senest kl. 08.10.", tone: "accent" },
  { id: "karate", text: "Hvad skal du huske? Vigga har karate kl. 16.00.", tone: "neutral" },
  { id: "groceries", text: "Hvad kræver opmærksomhed først? Der mangler mælk til aftensmad.", tone: "warning" },
  { id: "weather", text: "Regn starter efter kl. 14.00.", tone: "neutral" },
];

export const todaysEvents: CalendarItem[] = [
  {
    id: "1",
    title: "Leadership standup",
    time: "08.30",
    detail: "15 minutes · Product calendar",
  },
  {
    id: "2",
    title: "Client review in Randers",
    time: "10.00",
    detail: "Travel buffer included",
  },
  {
    id: "3",
    title: "Weekly family sync",
    time: "20.15",
    detail: "Shared calendar · Home",
  },
];

export const focusTasks: FocusTask[] = [
  {
    id: "1",
    title: "Approve Q3 hiring plan",
    category: "Work",
    energy: "Deep work",
  },
  {
    id: "2",
    title: "Reply to Michael",
    category: "Follow-up",
    energy: "Low lift",
  },
  {
    id: "3",
    title: "Book dentist appointment",
    category: "Personal",
    energy: "Admin",
  },
];

export const familyFeed: FamilyFeedItem[] = [
  { id: "1", summary: "Line added milk.", meta: "Shopping list · 12 min ago" },
  { id: "2", summary: "Claus planned burger night.", meta: "Friday dinner" },
  { id: "3", summary: "Vigga has karate.", meta: "Thursday · 16.00" },
];

export const mealPlan: MealPlanItem[] = [
  { id: "1", day: "Today", meal: "Salmon bowls", note: "Need milk and cucumber" },
  { id: "2", day: "Friday", meal: "Burger night", note: "Family favorite" },
  { id: "3", day: "Sunday", meal: "Pasta al limone", note: "Fast reset dinner" },
];
