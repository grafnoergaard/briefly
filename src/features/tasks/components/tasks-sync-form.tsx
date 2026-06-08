import { syncGoogleTasksAction } from "@/app/tasks/actions";
import { PendingSyncButton } from "@/features/calendar/components/pending-sync-button";

export function TasksSyncForm() {
  return (
    <form action={syncGoogleTasksAction}>
      <PendingSyncButton label="Synkronisér Google Tasks" />
    </form>
  );
}
