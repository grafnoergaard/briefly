import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { deleteGoogleCalendarEventAction } from "@/app/calendar/actions";
import { HomeCalendarList } from "@/features/home/components/home-calendar-list";
import { AppFrame } from "@/features/navigation/components/app-frame";
import { requireUser } from "@/lib/auth";
import { getUpcomingCalendarEvents } from "@/lib/calendar";
import { getDashboardSnapshot } from "@/lib/dashboard";

type CalendarPageProps = {
  searchParams: Promise<{
    sync?: string;
    message?: string;
  }>;
};

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const user = await requireUser();
  const snapshot = await getDashboardSnapshot(user.id);
  const calendarEvents = await getUpcomingCalendarEvents(user.id, 20);
  const params = await searchParams;

  return (
    <AppFrame currentPath="/calendar" userLabel={snapshot.profileEmail ?? user.email}>
      <Card className="rounded-[32px] border-black/5 bg-white/82">
        <CardContent className="p-6 sm:p-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-muted-foreground">
            Kalender
          </p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-[-0.05em]">Kalenderen samlet ét sted</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                Google Kalender er stadig kilden til sandhed. Her handler det om at få et klart
                overblik over uger, dage og aftaler, mens sync styres fra Indstillinger.
              </p>
            </div>
            <Badge className="rounded-full bg-[#e8f2ee] text-[#205949] hover:bg-[#e8f2ee]">
              {snapshot.calendarEventCount > 0 ? `${snapshot.calendarEventCount} i cache` : "Klar til sync"}
            </Badge>
          </div>

          <div className="mt-8 space-y-8">
            {params.message ? (
              <div
                className={
                  params.sync === "error"
                    ? "mb-4 rounded-[26px] border border-red-200 bg-red-50 p-5 text-sm leading-7 text-red-700"
                    : "mb-4 rounded-[26px] border border-emerald-200 bg-emerald-50 p-5 text-sm leading-7 text-emerald-700"
                }
              >
                {params.message}
              </div>
            ) : null}
            {snapshot.calendarEventCount === 0 ? (
              <div className="rounded-[26px] bg-muted/55 p-5 text-sm leading-7 text-muted-foreground">
                Der er endnu ingen kalenderdata i cache for denne bruger. Siden er klar til Google
                Kalender-sync og skifter til rigtige aftaler, så snart første sync er kørt.
              </div>
            ) : null}
            <HomeCalendarList
              events={calendarEvents}
              allowDelete
              deleteAction={deleteGoogleCalendarEventAction}
              redirectTo="/calendar"
            />
          </div>
        </CardContent>
      </Card>
    </AppFrame>
  );
}
