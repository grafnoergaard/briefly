import { saveGoogleTaskListSelectionAction } from "@/app/tasks/actions";
import { Button } from "@/components/ui/button";
import type { GoogleTaskListChoice } from "@/features/integrations/google/google-tasks";

type TaskListSelectionFormProps = {
  taskLists: GoogleTaskListChoice[];
  redirectTo?: string;
};

export function TaskListSelectionForm({ taskLists, redirectTo = "/tasks" }: TaskListSelectionFormProps) {
  if (taskLists.length === 0) {
    return (
      <div className="rounded-[24px] bg-muted/55 p-4 text-sm leading-7 text-muted-foreground">
        Forbind Google først for at vælge, hvilke opgavelister Briefly skal synce.
      </div>
    );
  }

  return (
    <form action={saveGoogleTaskListSelectionAction} className="space-y-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <div className="grid gap-3">
        {taskLists.map((taskList) => (
          <label
            key={taskList.id}
            className="flex items-start gap-3 rounded-[22px] border border-border/70 bg-white/90 px-4 py-3"
          >
            <input
              type="checkbox"
              name="taskListIds"
              value={taskList.id}
              defaultChecked={taskList.isSelected}
              className="mt-1 size-4 rounded border-border text-[#205949] focus:ring-[#205949]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{taskList.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Google Tasks-liste
              </span>
            </span>
          </label>
        ))}
      </div>

      <Button type="submit" variant="outline" className="w-full rounded-full md:w-auto">
        Gem valg af opgavelister
      </Button>
    </form>
  );
}
