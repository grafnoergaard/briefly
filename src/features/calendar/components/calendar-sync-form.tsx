import { syncGoogleCalendarAction } from "@/app/calendar/actions";
import { PendingSyncButton } from "@/features/calendar/components/pending-sync-button";

export function CalendarSyncForm() {
  return (
    <form action={syncGoogleCalendarAction}>
      <PendingSyncButton label="Synkronisér Google Kalender" />
    </form>
  );
}
