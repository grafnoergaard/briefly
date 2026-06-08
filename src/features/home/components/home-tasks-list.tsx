import { Badge } from "@/components/ui/badge";
import { focusTasks } from "@/features/home/data/mock-briefing";
import type { CachedTask } from "@/lib/tasks";

type HomeTasksListProps = {
  tasks: CachedTask[];
};

export function HomeTasksList({ tasks }: HomeTasksListProps) {
  const items =
    tasks.length > 0
      ? tasks.map((task) => ({
          id: task.id,
          title: task.title,
          category: task.category,
          energy: task.energy,
        }))
      : focusTasks;

  return (
    <div className="mt-6 space-y-3">
      {items.map((task, index) => (
        <div
          key={task.id}
          className="flex items-center justify-between rounded-[22px] bg-muted/55 px-4 py-3"
        >
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              0{index + 1} · {task.category}
            </p>
            <p className="mt-2 text-sm font-medium">{task.title}</p>
          </div>
          <Badge className="rounded-full bg-[#e8f2ee] text-[#205949] hover:bg-[#e8f2ee]">
            {task.energy}
          </Badge>
        </div>
      ))}
    </div>
  );
}
