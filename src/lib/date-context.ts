import {
  endOfISOWeek,
  format,
  getISOWeek,
  getISOWeekYear,
  isWeekend,
  startOfDay,
  startOfISOWeek,
} from "date-fns";
import { da } from "date-fns/locale";

export function getCurrentDateContext(now = new Date()) {
  const today = startOfDay(now);
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
