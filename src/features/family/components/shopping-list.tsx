import {
  clearCompletedShoppingItemsAction,
  moveShoppingItemAction,
  toggleShoppingItemAction,
} from "@/app/family/actions";
import { getShoppingCategoryMeta } from "@/features/family/lib/shopping-categories";
import type { ShoppingListEntry } from "@/lib/types";

type ShoppingListProps = {
  items: ShoppingListEntry[];
  listName?: string | null;
  sortMode?: "manual" | "category";
  redirectTo?: string;
};

export function ShoppingList({
  items,
  listName,
  sortMode = "manual",
  redirectTo = "/shopping",
}: ShoppingListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-[26px] bg-muted/55 p-5 text-sm leading-7 text-muted-foreground">
        {listName ? `Der er endnu ingen varer på ${listName}.` : "Der er endnu ingen varer på denne indkøbsliste."}
      </div>
    );
  }

  const openItems = items.filter((item) => !item.isCompleted);
  const completedItems = items.filter((item) => item.isCompleted);

  return (
    <div className="space-y-5">
      {openItems.length > 0 ? (
        sortMode === "category" ? (
          <div className="space-y-4">
            {buildCategoryGroups(openItems).map((group) => (
              <div key={group.key} className="rounded-[26px] border border-border/70 bg-white/85 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{group.label}</p>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      {group.items.length} varer
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  {group.items.map((item, index) => renderShoppingRow(item, index, group.items.length, redirectTo, false))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {openItems.map((item, index) => renderShoppingRow(item, index, openItems.length, redirectTo, true))}
          </div>
        )
      ) : (
        <div className="rounded-[26px] bg-[#f0f4f1] p-5 text-sm leading-7 text-muted-foreground">
          Alt er købt. Godt klaret.
        </div>
      )}

      {completedItems.length > 0 ? (
        <div className="rounded-[26px] border border-border/70 bg-white/70 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Allerede købt</p>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {completedItems.length} færdige
              </p>
            </div>
            <form action={clearCompletedShoppingItemsAction}>
              <input type="hidden" name="redirectTo" value={redirectTo} />
              <input
                type="hidden"
                name="shoppingListId"
                value={completedItems[0]?.shoppingListId ?? ""}
              />
              <button
                type="submit"
                className="rounded-full border border-border bg-background px-3 py-2 text-xs font-medium transition hover:bg-muted"
              >
                Ryd købte
              </button>
            </form>
          </div>
          <div className="space-y-3">
            {completedItems.map((item) => renderShoppingRow(item, 0, 0, redirectTo, false))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function renderShoppingRow(
  item: ShoppingListEntry,
  index: number,
  total: number,
  redirectTo: string,
  canReorder: boolean,
) {
  const category = getShoppingCategoryMeta(item.category);

  return (
    <div
      key={item.id}
      className={`rounded-[22px] border px-4 py-3 ${
        item.isCompleted ? "border-border/50 bg-white/60" : "border-border/70 bg-white/95"
      }`}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className={`text-sm font-medium ${item.isCompleted ? "line-through text-muted-foreground" : ""}`}>
              {item.label}
              {item.quantity ? ` · ${item.quantity}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-[#f0f4f1] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[#205949]">
                {category.label}
              </span>
            </div>
          </div>
          <form action={toggleShoppingItemAction}>
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="label" value={item.label} />
            <input type="hidden" name="completed" value={item.isCompleted ? "false" : "true"} />
            <input type="hidden" name="shoppingListId" value={item.shoppingListId} />
            <button
              type="submit"
              className="w-full rounded-full border border-border bg-background px-3 py-2 text-sm font-medium transition hover:bg-muted sm:w-auto"
            >
              {item.isCompleted ? "Åbn igen" : "Markér som købt"}
            </button>
          </form>
        </div>
        {canReorder ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <form action={moveShoppingItemAction}>
              <input type="hidden" name="redirectTo" value={redirectTo} />
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="direction" value="up" />
              <input type="hidden" name="shoppingListId" value={item.shoppingListId} />
              <button
                type="submit"
                disabled={index === 0}
                className="w-full rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
              >
                Flyt op
              </button>
            </form>
            <form action={moveShoppingItemAction}>
              <input type="hidden" name="redirectTo" value={redirectTo} />
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="direction" value="down" />
              <input type="hidden" name="shoppingListId" value={item.shoppingListId} />
              <button
                type="submit"
                disabled={index === total - 1}
                className="w-full rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
              >
                Flyt ned
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function buildCategoryGroups(items: ShoppingListEntry[]) {
  const groups = new Map<string, { key: string; label: string; sortOrder: number; items: ShoppingListEntry[] }>();

  for (const item of items) {
    const category = getShoppingCategoryMeta(item.category);
    const existing = groups.get(category.key);

    if (existing) {
      existing.items.push(item);
      continue;
    }

    groups.set(category.key, {
      key: category.key,
      label: category.label,
      sortOrder: category.sortOrder,
      items: [item],
    });
  }

  return [...groups.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => a.sortIndex - b.sortIndex || a.label.localeCompare(b.label)),
    }));
}
