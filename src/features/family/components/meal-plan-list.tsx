import { ShoppingItemForm } from "@/features/family/components/shopping-item-form";
import {
  eachDayOfInterval,
  endOfISOWeek,
  format,
  getISOWeek,
  getISOWeekYear,
  isToday,
  isTomorrow,
  parseISO,
  startOfISOWeek,
} from "date-fns";
import { da } from "date-fns/locale";

import type { FamilyMealPlanEntry, ShoppingListEntry } from "@/lib/types";

type MealPlanListProps = {
  mealPlans: FamilyMealPlanEntry[];
  shoppingItems: ShoppingListEntry[];
  shoppingListId?: string | null;
  shoppingListLabel?: string | null;
  redirectTo?: string;
};

export function MealPlanList({
  mealPlans,
  shoppingItems,
  shoppingListId,
  shoppingListLabel,
  redirectTo = "/meal-plan",
}: MealPlanListProps) {
  if (mealPlans.length === 0) {
    return (
      <div className="rounded-[26px] bg-[#f0f4f1] p-5 text-sm leading-7 text-muted-foreground">
        Der er endnu ingen madplan. Tilføj den første aftensmad, og byg derefter ugen op én dag ad gangen.
      </div>
    );
  }

  const weekGroups = groupMealPlansByWeek(mealPlans);

  return (
    <div className="space-y-4">
      {weekGroups.map((group) => (
        <div key={group.weekKey} className="rounded-[28px] border border-border/70 bg-white/75 p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Ugeplan
              </p>
              <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em]">{group.weekLabel}</h3>
            </div>
            <span className="rounded-full bg-[#f0f4f1] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-[#205949]">
              {group.missingCount === 0 ? "Ugen er fyldt" : `${group.missingCount} åbne dage`}
            </span>
          </div>

          <div className="grid gap-4">
            {group.days.map((day) => {
              const linkedItems = day.mealPlan
                ? shoppingItems.filter((item) => item.mealPlanId === day.mealPlan?.id)
                : [];

              return (
                <div
                  key={day.dateKey}
                  className={`rounded-[26px] border p-5 ${
                    day.mealPlan
                      ? "border-border/70 bg-[#f0f4f1]"
                      : "border-dashed border-[#d6ddd9] bg-white/65"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                        {day.dayLabel}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{day.dateLabel}</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] ${
                        day.mealPlan
                          ? "bg-white/80 text-[#205949]"
                          : "bg-[#fff4e8] text-[#9a5d1a]"
                      }`}
                    >
                      {day.mealPlan ? formatMealPlanDay(day.mealPlan.plannedFor) : "Mangler"}
                    </span>
                  </div>

                  {day.mealPlan ? (
                    <>
                      <h4 className="mt-4 text-2xl font-semibold tracking-[-0.04em]">{day.mealPlan.title}</h4>
                      {day.mealPlan.notes ? (
                        <p className="mt-2 text-sm leading-7 text-muted-foreground">{day.mealPlan.notes}</p>
                      ) : null}
                      {linkedItems.length > 0 ? (
                        <div className="mt-4">
                          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                            Koblet til indkøb
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {linkedItems.map((item) => (
                              <span
                                key={item.id}
                                className="rounded-full border border-border/70 bg-background px-3 py-1 text-sm text-foreground/75"
                              >
                                {item.label}
                                {item.quantity ? ` · ${item.quantity}` : ""}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-5 border-t border-black/5 pt-4">
                        <ShoppingItemForm
                          mealPlans={mealPlans}
                          shoppingListId={shoppingListId}
                          shoppingListLabel={shoppingListLabel}
                          defaultMealPlanId={day.mealPlan.id}
                          defaultMealPlanLabel={day.mealPlan.title}
                          redirectTo={redirectTo}
                          compact
                        />
                      </div>
                    </>
                  ) : (
                    <div className="mt-6">
                      <p className="text-base font-semibold tracking-[-0.02em] text-foreground">Ingen aftensmad planlagt</p>
                      <p className="mt-2 text-sm leading-7 text-muted-foreground">
                        Denne dag er stadig åben. Tilføj aftensmaden fra formularen ovenfor og arbejd videre gennem ugen.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatMealPlanDay(value: string) {
  const date = new Date(value);

  if (isToday(date)) {
    return "I dag";
  }

  if (isTomorrow(date)) {
    return "I morgen";
  }

  return format(date, "EEE dd MMM", { locale: da });
}

function groupMealPlansByWeek(mealPlans: FamilyMealPlanEntry[]) {
  const groups = new Map<
    string,
    {
      weekKey: string;
      weekLabel: string;
      mealPlans: FamilyMealPlanEntry[];
      weekStart: Date;
    }
  >();

  for (const mealPlan of mealPlans) {
    const plannedDate = parseISO(mealPlan.plannedFor);
    const weekStart = startOfISOWeek(plannedDate);
    const weekKey = format(weekStart, "yyyy-MM-dd");
    const isoWeek = getISOWeek(weekStart);
    const isoWeekYear = getISOWeekYear(weekStart);
    const existing = groups.get(weekKey);

    if (existing) {
      existing.mealPlans.push(mealPlan);
      continue;
    }

    groups.set(weekKey, {
      weekKey,
      weekLabel: `Uge ${isoWeek} (${isoWeekYear})`,
      mealPlans: [mealPlan],
      weekStart,
    });
  }

  return [...groups.values()].map((group) => {
    const days = eachDayOfInterval({
      start: group.weekStart,
      end: endOfISOWeek(group.weekStart),
    }).map((date) => {
      const dateKey = format(date, "yyyy-MM-dd");
      const mealPlan = group.mealPlans.find((entry) => entry.plannedFor === dateKey) ?? null;

      return {
        dateKey,
        dateLabel: format(date, "dd MMM", { locale: da }),
        dayLabel: format(date, "EEEE", { locale: da }),
        mealPlan,
      };
    });

    return {
      ...group,
      days,
      missingCount: days.filter((day) => !day.mealPlan).length,
    };
  });
}
