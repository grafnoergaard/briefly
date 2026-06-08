"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { GripVertical, Loader2 } from "lucide-react";

import {
  clearCompletedShoppingItemsAction,
  reorderShoppingItemsAction,
  toggleShoppingItemAction,
} from "@/app/family/actions";
import { getShoppingCategoryMeta } from "@/features/family/lib/shopping-categories";
import { cn } from "@/lib/utils";
import type { ShoppingListEntry, ShoppingListSummary } from "@/lib/types";

type ShoppingListProps = {
  items: ShoppingListEntry[];
  shoppingLists: ShoppingListSummary[];
  activeListId?: string | null;
  activeListName?: string | null;
  sortMode?: "manual" | "category";
  redirectTo?: string;
};

export function ShoppingList({
  items,
  shoppingLists,
  activeListId,
  activeListName,
  sortMode = "manual",
  redirectTo = "/shopping",
}: ShoppingListProps) {
  const [isPending, startTransition] = useTransition();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualItems, setManualItems] = useState(() =>
    items
      .filter((item) => !item.isCompleted)
      .sort((a, b) => a.sortIndex - b.sortIndex || a.label.localeCompare(b.label)),
  );
  const dragChangedRef = useRef(false);

  const openItems = useMemo(
    () => items.filter((item) => !item.isCompleted),
    [items],
  );
  const completedItems = useMemo(
    () => items.filter((item) => item.isCompleted),
    [items],
  );

  const persistOrder = (nextItems: ShoppingListEntry[]) => {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("orderedIds", JSON.stringify(nextItems.map((item) => item.id)));
      formData.set("shoppingListId", activeListId ?? "");

      try {
        await reorderShoppingItemsAction(formData);
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Kunne ikke gemme rækkefølgen på indkøbslisten.",
        );
      }
    });
  };

  const moveItem = (targetId: string) => {
    if (!draggedId || draggedId === targetId) {
      return;
    }

    setManualItems((current) => {
      const fromIndex = current.findIndex((item) => item.id === draggedId);
      const toIndex = current.findIndex((item) => item.id === targetId);

      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
        return current;
      }

      const next = [...current];
      const [movedItem] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, movedItem);
      dragChangedRef.current = true;
      return next;
    });
  };

  const finishDrag = () => {
    if (!draggedId) {
      return;
    }

    setDraggedId(null);

    if (!dragChangedRef.current) {
      return;
    }

    dragChangedRef.current = false;
    persistOrder(manualItems);
  };

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <ShoppingToolbar
          shoppingLists={shoppingLists}
          activeListId={activeListId}
          activeListName={activeListName}
          sortMode={sortMode}
          openCount={0}
          completedCount={0}
        />
        <div className="rounded-[30px] border border-black/8 bg-white px-5 py-8 text-center text-sm leading-7 text-muted-foreground shadow-[0_18px_40px_-32px_rgba(0,0,0,0.28)]">
          {activeListName ? `Der er ingen varer på ${activeListName}.` : "Der er ingen varer på listen endnu."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ShoppingToolbar
        shoppingLists={shoppingLists}
        activeListId={activeListId}
        activeListName={activeListName}
        sortMode={sortMode}
        openCount={openItems.length}
        completedCount={completedItems.length}
      />

      {error ? (
        <div className="rounded-[22px] border border-red-200 bg-red-50 px-4 py-3 text-sm leading-7 text-red-700">
          {error}
        </div>
      ) : null}

      {sortMode === "category" ? (
        <div className="space-y-5">
          {buildCategoryGroups(openItems).map((group) => (
            <section key={group.key} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                  {group.label}
                </p>
                <p className="text-xs text-muted-foreground">{group.items.length}</p>
              </div>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <ShoppingRow
                    key={item.id}
                    item={item}
                    redirectTo={redirectTo}
                    draggable={false}
                    isDragging={false}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {manualItems.map((item) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => {
                setDraggedId(item.id);
                dragChangedRef.current = false;
              }}
              onDragEnter={() => moveItem(item.id)}
              onDragOver={(event) => event.preventDefault()}
              onDragEnd={finishDrag}
            >
              <ShoppingRow
                item={item}
                redirectTo={redirectTo}
                draggable
                isDragging={draggedId === item.id}
              />
            </div>
          ))}
        </div>
      )}

      {completedItems.length > 0 ? (
        <div className="rounded-[22px] border border-black/8 bg-white px-4 py-3 shadow-[0_16px_30px_-28px_rgba(0,0,0,0.25)]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {completedItems.length} købte varer er skjult.
            </p>
            <form action={clearCompletedShoppingItemsAction}>
              <input type="hidden" name="redirectTo" value={redirectTo} />
              <input type="hidden" name="shoppingListId" value={activeListId ?? ""} />
              <button
                type="submit"
                className="rounded-full border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
              >
                Ryd købte
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {isPending ? (
        <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Gemmer ny rækkefølge…
        </div>
      ) : null}
    </div>
  );
}

type ShoppingToolbarProps = {
  shoppingLists: ShoppingListSummary[];
  activeListId?: string | null;
  activeListName?: string | null;
  sortMode: "manual" | "category";
  openCount: number;
  completedCount: number;
};

function ShoppingToolbar({
  shoppingLists,
  activeListId,
  activeListName,
  sortMode,
  openCount,
  completedCount,
}: ShoppingToolbarProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            Indkøbstur
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
            {activeListName ?? "Indkøbsliste"}
          </h1>
        </div>
        <div className="rounded-full border border-black/6 bg-[#f3f5f2] px-3 py-2 text-sm text-muted-foreground">
          {openCount} åbne{completedCount > 0 ? ` · ${completedCount} købte skjult` : ""}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {shoppingLists.map((list) => (
          <Link
            key={list.id}
            href={`/shopping?list=${list.id}&sort=${sortMode}`}
            className={cn(
              "rounded-full px-4 py-2 text-sm transition",
              list.id === activeListId
                ? "bg-[#153d32] text-white"
                : "border border-border bg-white text-foreground hover:bg-muted",
            )}
          >
            {list.name}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: "manual", label: "Manuel" },
          { key: "category", label: "Kategori" },
        ].map((item) => (
          <Link
            key={item.key}
            href={`/shopping?sort=${item.key}${activeListId ? `&list=${activeListId}` : ""}`}
            className={cn(
              "rounded-full px-4 py-2 text-sm transition",
              sortMode === item.key
                ? "bg-[#3C5C4E] text-white"
                : "border border-border bg-white text-foreground hover:bg-muted",
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

type ShoppingRowProps = {
  item: ShoppingListEntry;
  redirectTo: string;
  draggable: boolean;
  isDragging: boolean;
};

function ShoppingRow({ item, redirectTo, draggable, isDragging }: ShoppingRowProps) {
  const category = getShoppingCategoryMeta(item.category);

  return (
    <div
      className={cn(
        "rounded-[24px] border border-white/10 bg-white px-4 py-4 text-[#101313] shadow-[0_18px_40px_-32px_rgba(0,0,0,0.45)]",
        isDragging && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        {draggable ? (
          <div className="pt-1 text-[#3C5C4E]/55">
            <GripVertical className="size-5" />
          </div>
        ) : null}

        <form action={toggleShoppingItemAction} className="flex min-w-0 flex-1 items-start gap-3">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="label" value={item.label} />
          <input type="hidden" name="completed" value="true" />
          <input type="hidden" name="shoppingListId" value={item.shoppingListId} />

          <button
            type="submit"
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-[#3C5C4E]/35 bg-[#f4f6f2] transition hover:bg-[#e8f0ec]"
            aria-label={`Markér ${item.label} som købt`}
          >
            <span className="size-3 rounded-full bg-[#3C5C4E]" />
          </button>

          <div className="min-w-0 flex-1">
            <p className="text-lg font-medium leading-7">
              {item.label}
              {item.quantity ? ` · ${item.quantity}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#edf3ef] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[#3C5C4E]">
                {category.label}
              </span>
              {item.addedByName ? (
                <span className="text-xs text-muted-foreground">Tilføjet af {item.addedByName}</span>
              ) : null}
            </div>
          </div>
        </form>
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
