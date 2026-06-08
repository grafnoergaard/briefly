import { toggleGoogleTaskCompletionAction, updateGoogleTaskAction } from "@/app/tasks/actions";
import type { CachedTask } from "@/lib/tasks";

type TasksListProps = {
  tasks: CachedTask[];
};

export function TasksList({ tasks }: TasksListProps) {
  if (tasks.length === 0) {
    return (
      <div className="mt-8 rounded-[26px] bg-muted/55 p-5 text-sm leading-7 text-muted-foreground">
        Der er ingen åbne punkter lige nu. Tilføj en husker ovenfor, eller nyd den tomme liste.
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      {tasks.map((task) => (
        <div
          key={task.id}
          className="rounded-[26px] bg-muted/55 p-5"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {task.taskListTitle ?? "To-do"}
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">{task.title}</h2>
              {task.dueAt ? (
                <p className="mt-1 text-sm text-muted-foreground">{formatDueLabel(task.dueAt)}</p>
              ) : null}
              {task.notes ? (
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{task.notes}</p>
              ) : null}
            </div>
            {task.taskListId ? (
              <form action={toggleGoogleTaskCompletionAction}>
                <input type="hidden" name="taskId" value={task.sourceTaskId} />
                <input type="hidden" name="taskListId" value={task.taskListId} />
                <input
                  type="hidden"
                  name="completed"
                  value={task.status === "completed" ? "false" : "true"}
                />
                <button
                  type="submit"
                  className="rounded-full border border-border bg-background px-3 py-2 text-sm font-medium transition hover:bg-muted"
                >
                  {task.status === "completed" ? "Gør aktiv igen" : "Markér som færdig"}
                </button>
              </form>
            ) : null}
          </div>

          {task.taskListId ? (
            <form action={updateGoogleTaskAction} className="mt-4 grid gap-3">
              <input type="hidden" name="taskId" value={task.sourceTaskId} />
              <input type="hidden" name="taskListId" value={task.taskListId} />
              <input
                name="title"
                type="text"
                defaultValue={task.title}
                className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none transition focus:border-[#205949] focus:ring-2 focus:ring-[#205949]/10"
              />
              <textarea
                name="notes"
                rows={2}
                defaultValue={task.notes ?? ""}
                placeholder="Valgfrie noter"
                className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-[#205949] focus:ring-2 focus:ring-[#205949]/10"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-full border border-border bg-background px-3 py-2 text-sm font-medium transition hover:bg-muted"
                >
                  Gem ændringer
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function formatDueLabel(value: string) {
  const dueDate = new Date(value);

  if (Number.isNaN(dueDate.getTime())) {
    return "Forfaldsdato sat";
  }

  const today = new Date();
  const dateLabel = dueDate.toLocaleDateString("da-DK", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });

  if (dueDate.toDateString() === today.toDateString()) {
    return "Forfalder i dag";
  }

  return `Forfalder ${dateLabel}`;
}
