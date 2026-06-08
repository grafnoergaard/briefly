import {
  format,
  getISOWeek,
  getISOWeekYear,
  endOfISOWeek,
  startOfISOWeek,
} from "date-fns";
import { da } from "date-fns/locale";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getAppDateKey,
  isTodayInAppTimeZone,
  isTomorrowInAppTimeZone,
  isWeekendInAppTimeZone,
  toAppTimeZoneDate,
} from "@/lib/date-context";
import { formatCalendarEventDetail, formatEventTime, type CachedCalendarEvent } from "@/lib/calendar";

type HomeCalendarListProps = {
  events: CachedCalendarEvent[];
  allowDelete?: boolean;
  deleteAction?: (formData: FormData) => void | Promise<void>;
  redirectTo?: string;
};

type WeekGroup = {
  weekKey: string;
  weekLabel: string;
  subtitle: string;
  days: DayGroup[];
};

type DayGroup = {
  dayKey: string;
  dayLabel: string;
  dateLabel: string;
  isToday: boolean;
  isTomorrow: boolean;
  isWeekend: boolean;
  events: CachedCalendarEvent[];
};

export function HomeCalendarList({
  events,
  allowDelete = false,
  deleteAction,
  redirectTo = "/calendar",
}: HomeCalendarListProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-[26px] bg-muted/55 p-5 text-sm leading-7 text-muted-foreground">
        Der er endnu ingen kalenderdata i cache. Kør en sync, så grupperer denne visning dine aftaler automatisk i uger.
      </div>
    );
  }

  const weekGroups = groupEventsByWeek(events);

  return (
    <div className="space-y-5">
      {weekGroups.map((week) => (
        <div key={week.weekKey} className="rounded-[28px] border border-border/70 bg-white/78 p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Ugeoversigt
              </p>
              <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em]">{week.weekLabel}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{week.subtitle}</p>
            </div>
            <Badge className="rounded-full bg-[#e8f2ee] text-[#205949] hover:bg-[#e8f2ee]">
              {week.days.reduce((count, day) => count + day.events.length, 0)} aftaler
            </Badge>
          </div>

          <div className="space-y-4">
            {week.days.map((day) => (
              <div
                key={day.dayKey}
                className={`rounded-[24px] border p-4 sm:p-5 ${
                  day.isToday
                    ? "border-[#b9d3c9] bg-[#f0f4f1]"
                    : day.isWeekend
                      ? "border-border/70 bg-white/88"
                      : "border-border/70 bg-white/72"
                }`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {day.dayLabel}
                    </p>
                    <h4 className="mt-1 text-lg font-semibold tracking-[-0.02em]">{day.dateLabel}</h4>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {day.isToday ? (
                      <Badge className="rounded-full bg-white text-[#205949] hover:bg-white">I dag</Badge>
                    ) : null}
                    {day.isTomorrow ? (
                      <Badge className="rounded-full bg-white text-[#205949] hover:bg-white">I morgen</Badge>
                    ) : null}
                    {day.isWeekend ? (
                      <Badge variant="outline" className="rounded-full">Weekend</Badge>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {day.events.map((event) => (
                    <div key={event.id} className="rounded-[20px] border border-border/70 bg-white/90 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#205949]">
                            {formatEventTime(event)}
                          </p>
                          <h5 className="mt-2 text-lg font-semibold tracking-[-0.03em]">{event.title}</h5>
                          <p className="mt-1 text-sm leading-7 text-muted-foreground">
                            {formatCalendarEventDetail(event)}
                          </p>
                        </div>
                        <Badge variant="outline" className="rounded-full">
                          {event.calendarName ?? "Google Kalender"}
                        </Badge>
                      </div>
                      {allowDelete && deleteAction ? (
                        <form action={deleteAction} className="mt-4 flex justify-end">
                          <input type="hidden" name="redirectTo" value={redirectTo} />
                          <input type="hidden" name="calendarId" value={event.calendarId} />
                          <input type="hidden" name="eventId" value={event.sourceEventId} />
                          <input type="hidden" name="title" value={event.title} />
                          <Button
                            type="submit"
                            variant="outline"
                            className="rounded-full border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                          >
                            Slet aftale
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function groupEventsByWeek(events: CachedCalendarEvent[]): WeekGroup[] {
  const weekMap = new Map<string, WeekGroup>();

  for (const event of events) {
    const eventDate = toAppTimeZoneDate(event.startsAt);
    const weekStart = startOfISOWeek(eventDate);
    const weekKey = format(weekStart, "yyyy-MM-dd");
    const isoWeek = getISOWeek(weekStart);
    const isoWeekYear = getISOWeekYear(weekStart);
    const weekLabel = `Uge ${isoWeek} (${isoWeekYear})`;
    const subtitle = `${format(weekStart, "dd MMM", { locale: da })} - ${format(endOfISOWeek(weekStart), "dd MMM", { locale: da })}`;
    const dayKey = getAppDateKey(event.startsAt);

    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, {
        weekKey,
        weekLabel,
        subtitle,
        days: [],
      });
    }

    const weekGroup = weekMap.get(weekKey)!;
    const existingDay = weekGroup.days.find((day) => day.dayKey === dayKey);

    if (existingDay) {
      existingDay.events.push(event);
      continue;
    }

    weekGroup.days.push({
      dayKey,
      dayLabel: format(eventDate, "EEEE", { locale: da }),
      dateLabel: format(eventDate, "dd MMM", { locale: da }),
      isToday: isTodayInAppTimeZone(event.startsAt),
      isTomorrow: isTomorrowInAppTimeZone(event.startsAt),
      isWeekend: isWeekendInAppTimeZone(event.startsAt),
      events: [event],
    });
  }

  return [...weekMap.values()].map((week) => ({
    ...week,
    days: week.days.sort((a, b) => a.dayKey.localeCompare(b.dayKey)),
  }));
}
