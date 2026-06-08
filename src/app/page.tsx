import { AppFrame } from "@/features/navigation/components/app-frame";
import { HomeBriefing } from "@/features/home/components/home-briefing";
import { MarketingLanding } from "@/features/home/components/marketing-landing";
import { getAiBriefSettings } from "@/lib/ai-settings";
import { getOptionalUser } from "@/lib/auth";
import { getUpcomingCalendarEvents } from "@/lib/calendar";
import { getDashboardSnapshot } from "@/lib/dashboard";
import { buildHomeBriefingModel } from "@/lib/home-briefing";
import { getOpenTasks } from "@/lib/tasks";

export default async function HomePage() {
  const user = await getOptionalUser();

  if (!user) {
    return <MarketingLanding />;
  }

  const snapshot = await getDashboardSnapshot(user.id);
  const calendarEvents = await getUpcomingCalendarEvents(user.id, 20);
  const topTasks = await getOpenTasks(user.id, 8);
  const aiSettings = await getAiBriefSettings(user.id);
  const briefing = await buildHomeBriefingModel({
    userId: user.id,
    snapshot,
    calendarEvents,
    topTasks,
    aiSettings,
  });
  const userName =
    snapshot.profileName ?? user.user_metadata.full_name ?? user.user_metadata.name ?? "dig";

  return (
    <AppFrame currentPath="/" userLabel={snapshot.profileEmail ?? user.email}>
      <HomeBriefing userName={userName} briefing={briefing} />
    </AppFrame>
  );
}
