import Link from "next/link";

import { cn } from "@/lib/utils";

const sortItems = [
  { key: "manual", label: "Manuel rækkefølge" },
  { key: "category", label: "Efter kategori" },
] as const;

type ShoppingSortControlsProps = {
  currentSort: "manual" | "category";
  currentListId?: string | null;
};

export function ShoppingSortControls({ currentSort, currentListId }: ShoppingSortControlsProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {sortItems.map((item) => {
        const isActive = currentSort === item.key;

        return (
          <Link
            key={item.key}
            href={`/shopping?sort=${item.key}${currentListId ? `&list=${currentListId}` : ""}`}
            className={cn(
              "rounded-full border px-4 py-2 text-center text-sm font-medium transition-colors",
              isActive
                ? "border-[#153d32] bg-[#153d32] text-white"
                : "border-border/70 bg-white/80 text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
