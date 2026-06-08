import type { FamilyMealPlanEntry } from "@/lib/types";
import { addShoppingItemAction } from "@/app/family/actions";
import { SHOPPING_CATEGORY_OPTIONS } from "@/features/family/lib/shopping-categories";

type ShoppingItemFormProps = {
  mealPlans: FamilyMealPlanEntry[];
  shoppingListId?: string | null;
  shoppingListLabel?: string | null;
  redirectTo?: string;
  defaultMealPlanId?: string;
  defaultMealPlanLabel?: string;
  compact?: boolean;
};

export function ShoppingItemForm({
  mealPlans,
  shoppingListId,
  shoppingListLabel,
  redirectTo = "/shopping",
  defaultMealPlanId,
  defaultMealPlanLabel,
  compact = false,
}: ShoppingItemFormProps) {
  return (
    <form
      action={addShoppingItemAction}
      className={
        compact
          ? "grid gap-3"
          : "rounded-[26px] border border-border/70 bg-white/85 p-5 shadow-[0_24px_60px_-44px_rgba(17,24,39,0.45)]"
      }
    >
      <input type="hidden" name="redirectTo" value={redirectTo} />
      {defaultMealPlanId ? <input type="hidden" name="mealPlanId" value={defaultMealPlanId} /> : null}
      {shoppingListId ? <input type="hidden" name="shoppingListId" value={shoppingListId} /> : null}
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
        {compact ? "Opskriftsindkøb" : "Ny vare"}
      </p>
      <h2 className={`mt-2 font-semibold tracking-[-0.04em] ${compact ? "text-base" : "text-2xl"}`}>
        {compact ? `Tilføj ingredienser til ${defaultMealPlanLabel ?? "denne ret"}` : "Tilføj hurtigt, sorter smart"}
      </h2>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">
        {compact
          ? `Varerne lægges direkte på ${shoppingListLabel ?? "husholdningslisten"}.`
          : "Start med varenavnet. Vælg en butikszone, hvis du vil, eller lad Briefly foreslå den ud fra varen."}
      </p>
      <div className="mt-4 grid gap-3">
        <input
          name="label"
          type="text"
          required
          placeholder={compact ? "Fx: Kylling, parmesan, romainesalat" : "Fx: Mælk, gulerødder, toiletpapir"}
          className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none transition focus:border-[#205949] focus:ring-2 focus:ring-[#205949]/10"
        />
        <input
          name="quantity"
          type="text"
          placeholder="Mængde"
          className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none transition focus:border-[#205949] focus:ring-2 focus:ring-[#205949]/10"
        />
        <select
          name="category"
          defaultValue=""
          className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none transition focus:border-[#205949] focus:ring-2 focus:ring-[#205949]/10"
        >
          <option value="">Find butikszone automatisk</option>
          {SHOPPING_CATEGORY_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        {!defaultMealPlanId ? (
          <select
            name="mealPlanId"
            defaultValue=""
            className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none transition focus:border-[#205949] focus:ring-2 focus:ring-[#205949]/10"
          >
            <option value="">Ikke knyttet til en ret</option>
            {mealPlans.map((mealPlan) => (
              <option key={mealPlan.id} value={mealPlan.id}>
                {mealPlan.title} · {mealPlan.plannedFor}
              </option>
            ))}
          </select>
        ) : null}
        <div className="flex justify-end">
          <button
            type="submit"
            className="w-full rounded-full bg-[#153d32] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#205949] sm:w-auto"
          >
            {compact ? "Tilføj ingredienser" : "Tilføj til indkøbsliste"}
          </button>
        </div>
      </div>
    </form>
  );
}
