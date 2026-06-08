import type { FamilyActivityEntry } from "@/lib/types";

type FamilyFeedListProps = {
  items: FamilyActivityEntry[];
};

export function FamilyFeedList({ items }: FamilyFeedListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-[26px] bg-muted/55 p-5 text-sm leading-7 text-muted-foreground">
        The family feed is empty for now. The first meal plan or shopping update will appear here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.id} className="rounded-[26px] bg-muted/55 p-5">
          <p className="text-base leading-8 text-foreground/80">{item.summary}</p>
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {item.entityType} · {item.createdAt}
          </p>
        </div>
      ))}
    </div>
  );
}
