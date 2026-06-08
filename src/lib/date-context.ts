import {
  addDays,
  endOfISOWeek,
  format,
  getISOWeek,
  getISOWeekYear,
  isWeekend,
  startOfDay,
  startOfISOWeek,
} from "date-fns";
import { da } from "date-fns/locale";

export const APP_TIME_ZONE = "Europe/Copenhagen";

function parseOffsetLabelToMinutes(label: string) {
  const normalized = label.replace("GMT", "");

  if (normalized === "" || normalized === "Z") {
    return 0;
  }

  const match = normalized.match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);

  if (!match) {
    return 0;
  }

  const [, sign, hours, minutes] = match;
  const totalMinutes = Number(hours) * 60 + Number(minutes ?? "0");

  return sign === "-" ? -totalMinutes : totalMinutes;
}

function getTimeZoneOffsetMinutes(date: Date, timeZone = APP_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "longOffset",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const offsetLabel = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";

  return parseOffsetLabelToMinutes(offsetLabel);
}

type TimeZoneParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

function getTimeZoneParts(input: Date | string): TimeZoneParts {
  const date = typeof input === "string" ? new Date(input) : input;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);

  return {
    year: parts.find((part) => part.type === "year")?.value ?? "0000",
    month: parts.find((part) => part.type === "month")?.value ?? "01",
    day: parts.find((part) => part.type === "day")?.value ?? "01",
    hour: parts.find((part) => part.type === "hour")?.value ?? "00",
    minute: parts.find((part) => part.type === "minute")?.value ?? "00",
    second: parts.find((part) => part.type === "second")?.value ?? "00",
  };
}

export function toAppTimeZoneDate(input: Date | string) {
  const parts = getTimeZoneParts(input);

  return new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
}

export function getAppDateKey(input: Date | string) {
  const parts = getTimeZoneParts(input);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatAppTime(input: Date | string) {
  const parts = getTimeZoneParts(input);
  return `${parts.hour}.${parts.minute}`;
}

export function isTodayInAppTimeZone(input: Date | string, now = new Date()) {
  return getAppDateKey(input) === getAppDateKey(now);
}

export function isTomorrowInAppTimeZone(input: Date | string, now = new Date()) {
  return getAppDateKey(input) === getAppDateKey(addDays(toAppTimeZoneDate(now), 1));
}

export function isWeekendInAppTimeZone(input: Date | string) {
  return isWeekend(toAppTimeZoneDate(input));
}

export function getCurrentDateContext(now = new Date()) {
  const zonedNow = toAppTimeZoneDate(now);
  const today = startOfDay(zonedNow);
  const weekStart = startOfISOWeek(today);
  const weekEnd = endOfISOWeek(today);
  const isoWeek = getISOWeek(today);
  const isoWeekYear = getISOWeekYear(today);

  return {
    today,
    todayIso: format(today, "yyyy-MM-dd"),
    weekStart,
    weekEnd,
    weekStartIso: format(weekStart, "yyyy-MM-dd"),
    weekEndIso: format(weekEnd, "yyyy-MM-dd"),
    isoWeek,
    isoWeekYear,
    isWeekend: isWeekend(today),
    dateLabel: `${format(today, "EEEE dd MMMM", { locale: da })} · Uge ${isoWeek}`,
    fullDateLabel: `${format(today, "EEEE dd MMMM yyyy", { locale: da })} · Uge ${isoWeek}`,
  };
}

export function normalizeToAppTimeZoneIsoDateTime(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error("Tidspunktet mangler.");
  }

  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(trimmed)) {
    const withOffset = new Date(trimmed);

    if (Number.isNaN(withOffset.getTime())) {
      throw new Error("Tidspunktet kunne ikke fortolkes.");
    }

    return withOffset.toISOString();
  }

  const match = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/,
  );

  if (!match) {
    throw new Error("Tidspunktet skal være et gyldigt dato-klokkeslæt.");
  }

  const [, year, month, day, hour, minute, second] = match;
  const utcGuess = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second ?? "0"),
    ),
  );

  let offsetMinutes = getTimeZoneOffsetMinutes(utcGuess);
  let adjusted = new Date(utcGuess.getTime() - offsetMinutes * 60_000);
  const recalculatedOffsetMinutes = getTimeZoneOffsetMinutes(adjusted);

  if (recalculatedOffsetMinutes !== offsetMinutes) {
    offsetMinutes = recalculatedOffsetMinutes;
    adjusted = new Date(utcGuess.getTime() - offsetMinutes * 60_000);
  }

  if (Number.isNaN(adjusted.getTime())) {
    throw new Error("Tidspunktet kunne ikke fortolkes.");
  }

  return adjusted.toISOString();
}
