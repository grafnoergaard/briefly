import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AppFrame } from "@/features/navigation/components/app-frame";
import { TaskComposerForm } from "@/features/tasks/components/task-composer-form";
import { TasksList } from "@/features/tasks/components/tasks-list";
import { requireUser } from "@/lib/auth";
import { getDashboardSnapshot } from "@/lib/dashboard";
import { getOpenTasks } from "@/lib/tasks";

type TasksPageProps = {
  searchParams: Promise<{
    sync?: string;
    message?: string;
  }>;
};

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const user = await requireUser();
  const snapshot = await getDashboardSnapshot(user.id);
  const openTasks = await getOpenTasks(user.id, 24);
  const params = await searchParams;

  return (
    <AppFrame currentPath="/tasks" userLabel={snapshot.profileEmail ?? user.email}>
      <Card className="rounded-[32px] border-black/5 bg-white/82">
        <CardContent className="p-6 sm:p-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-muted-foreground">
            Lister
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">En enkel to-do- og huskeliste</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
            Brug lister til små opgaver, husketing og løse noter til hverdagen. Når noget er klaret,
            markerer du det som færdigt, og så forsvinder det fra den aktive liste.
          </p>
          <div className="mt-4">
            <Badge className="rounded-full bg-[#e8f2ee] text-[#205949] hover:bg-[#e8f2ee]">
              {openTasks.length > 0 ? `${openTasks.length} åbne punkter` : "Listen er tom"}
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
            {snapshot.taskCount === 0 ? (
              <div className="mb-4 rounded-[26px] bg-muted/55 p-5 text-sm leading-7 text-muted-foreground">
                Der er endnu ingen Google Tasks-data i cache. Kør den første sync, så skifter denne
                side til din rigtige to-do-liste.
              </div>
            ) : null}
            <TaskComposerForm />
            <TasksList tasks={openTasks} />
          </div>
        </CardContent>
      </Card>
    </AppFrame>
  );
}
