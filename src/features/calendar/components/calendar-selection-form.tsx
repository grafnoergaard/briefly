import { saveGoogleCalendarSelectionAction } from "@/app/calendar/actions";
import { Button } from "@/components/ui/button";
import type { GoogleCalendarChoice } from "@/features/integrations/google/google-calendar";

type CalendarSelectionFormProps = {
  calendars: GoogleCalendarChoice[];
  redirectTo?: string;
};

export function CalendarSelectionForm({ calendars, redirectTo = "/calendar" }: CalendarSelectionFormProps) {
  if (calendars.length === 0) {
    return (
      <div className="rounded-[24px] bg-muted/55 p-4 text-sm leading-7 text-muted-foreground">
        Forbind Google først for at vælge, hvilke kalendere Briefly skal synce.
      </div>
    );
  }

  return (
    <form action={saveGoogleCalendarSelectionAction} className="space-y-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <div className="grid gap-3">
        {calendars.map((calendar) => (
          <label
            key={calendar.id}
            className="flex items-start gap-3 rounded-[22px] border border-border/70 bg-white/90 px-4 py-3"
          >
            <input
              type="checkbox"
              name="calendarIds"
              value={calendar.id}
              defaultChecked={calendar.isSelected}
              className="mt-1 size-4 rounded border-border text-[#205949] focus:ring-[#205949]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{calendar.summary}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {calendar.isPrimary ? "Primær kalender" : "Ekstra kalender"}
              </span>
            </span>
          </label>
        ))}
      </div>

      <Button type="submit" variant="outline" className="w-full rounded-full md:w-auto">
        Gem kalendervalg
      </Button>
    </form>
  );
}
