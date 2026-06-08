import { addWeeks, endOfISOWeek, format, getISOWeek, getISOWeekYear, startOfISOWeek } from "date-fns";
import { da } from "date-fns/locale";
import { createMealPlanAction } from "@/app/family/actions";

type MealPlanFormProps = {
  redirectTo?: string;
};

export function MealPlanForm({ redirectTo = "/meal-plan" }: MealPlanFormProps) {
  const currentWeekStart = startOfISOWeek(new Date());
  const availableWeeks = [0, 1, 2].map((offset) => {
    const weekStart = addWeeks(currentWeekStart, offset);
    const weekEnd = endOfISOWeek(weekStart);
    const isoWeek = getISOWeek(weekStart);
    const isoWeekYear = getISOWeekYear(weekStart);

    return {
      value: format(weekStart, "yyyy-MM-dd"),
      label: `Uge ${isoWeek} (${isoWeekYear}) · ${format(weekStart, "dd MMM", { locale: da })} - ${format(weekEnd, "dd MMM", { locale: da })}`,
    };
  });

  const weekdays = [
    { value: "0", label: "Mandag" },
    { value: "1", label: "Tirsdag" },
    { value: "2", label: "Onsdag" },
    { value: "3", label: "Torsdag" },
    { value: "4", label: "Fredag" },
    { value: "5", label: "Lørdag" },
    { value: "6", label: "Søndag" },
  ];

  return (
    <form action={createMealPlanAction} className="rounded-[26px] border border-border/70 bg-white/90 p-5">
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
        Tilføj aftensmad
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Læg næste ret ind i ugen</h2>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">
        Vælg uge, vælg dag, og arbejd dig ned gennem ugen, til den føles på plads.
      </p>
      <div className="mt-4 grid gap-3">
        <input
          name="title"
          type="text"
          required
          placeholder="Hvad skal vi have?"
          className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none transition focus:border-[#205949] focus:ring-2 focus:ring-[#205949]/10"
        />
        <div className="grid gap-3 md:grid-cols-2">
          <select
            name="weekStart"
            defaultValue={availableWeeks[0]?.value}
            className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none transition focus:border-[#205949] focus:ring-2 focus:ring-[#205949]/10"
          >
            {availableWeeks.map((week) => (
              <option key={week.value} value={week.value}>
                {week.label}
              </option>
            ))}
          </select>
          <select
            name="dayOffset"
            defaultValue="0"
            className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none transition focus:border-[#205949] focus:ring-2 focus:ring-[#205949]/10"
          >
            {weekdays.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </select>
        </div>
        <textarea
          name="notes"
          rows={3}
          placeholder="Valgfri note, opskriftskilde eller manglende ingredienser"
          className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-[#205949] focus:ring-2 focus:ring-[#205949]/10"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            className="w-full rounded-full bg-[#153d32] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#205949] sm:w-auto"
          >
            Tilføj til ugeplan
          </button>
        </div>
      </div>
    </form>
  );
}
