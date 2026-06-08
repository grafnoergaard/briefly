import { addDays, format } from "date-fns";
import { da } from "date-fns/locale";

import {
  formatAppTime,
  isTodayInAppTimeZone,
  toAppTimeZoneDate,
} from "@/lib/date-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CachedCalendarEvent = {
  id: string;
  sourceEventId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  calendarId: string;
  calendarName: string | null;
  location: string | null;
  description: string | null;
  isAllDay: boolean;
};

export async function getUpcomingCalendarEvents(
  userId: string,
  limit = 12,
  daysAhead = 30,
): Promise<CachedCalendarEvent[]> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return [];
  }

  const today = new Date();
  const windowStart = format(today, "yyyy-MM-dd'T'00:00:00xxx");
  const windowEnd = format(addDays(today, daysAhead), "yyyy-MM-dd'T'23:59:59xxx");

  const { data, error } = await supabase
    .from("calendar_events_cache")
    .select("id, external_id, title, starts_at, ends_at, calendar_id, location, description, is_all_day, payload")
    .eq("profile_id", userId)
    .gte("starts_at", windowStart)
    .lte("starts_at", windowEnd)
    .order("starts_at", { ascending: true })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data.map((event) => ({
    id: event.id,
    sourceEventId:
      typeof event.external_id === "string" && event.external_id.includes(":")
        ? event.external_id.slice(event.external_id.indexOf(":") + 1)
        : event.id,
    title: event.title,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    calendarId: event.calendar_id,
    calendarName:
      event.payload &&
      typeof event.payload === "object" &&
      "calendarName" in event.payload &&
      typeof event.payload.calendarName === "string"
        ? event.payload.calendarName
        : null,
    location: event.location,
    description: event.description,
    isAllDay: event.is_all_day,
  }));
}

export function formatEventTime(event: CachedCalendarEvent) {
  if (event.isAllDay) {
    return isTodayInAppTimeZone(event.startsAt)
      ? "I dag"
      : format(toAppTimeZoneDate(event.startsAt), "EEE dd MMM", { locale: da });
  }

  return formatAppTime(event.startsAt);
}

export function formatCalendarEventDetail(event: CachedCalendarEvent) {
  const cleanedDescription = cleanCalendarText(event.description);
  const cleanedLocation = cleanCalendarText(event.location);
  const cleanedCalendarName = cleanCalendarText(event.calendarName);

  return (
    cleanedLocation ??
    cleanedDescription ??
    (event.isAllDay ? "Hele dagen" : cleanedCalendarName ?? "Google Kalender")
  );
}

function cleanCalendarText(value: string | null) {
  if (!value) {
    return null;
  }

  const stripped = value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!stripped) {
    return null;
  }

  return stripped.length > 140 ? `${stripped.slice(0, 137)}...` : stripped;
}
