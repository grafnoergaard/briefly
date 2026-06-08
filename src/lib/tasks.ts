import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CachedTask = {
  id: string;
  externalId: string;
  sourceTaskId: string;
  taskListId: string | null;
  taskListTitle: string | null;
  title: string;
  notes: string | null;
  category: string;
  energy: "Low lift" | "Deep work" | "Admin";
  status: string;
  dueAt: string | null;
};

export async function getOpenTasks(userId: string, limit = 12): Promise<CachedTask[]> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("tasks_cache")
    .select("id, external_id, task_list_id, title, notes, status, due_at, priority_score, payload")
    .eq("profile_id", userId)
    .neq("status", "completed")
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("title", { ascending: true })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data.map((task) => ({
    id: task.id,
    externalId: task.external_id,
    sourceTaskId:
      task.payload &&
      typeof task.payload === "object" &&
      "sourceTaskId" in task.payload &&
      typeof task.payload.sourceTaskId === "string"
        ? task.payload.sourceTaskId
        : task.external_id,
    taskListId: task.task_list_id,
    taskListTitle:
      task.payload &&
      typeof task.payload === "object" &&
      "taskListTitle" in task.payload &&
      typeof task.payload.taskListTitle === "string"
        ? task.payload.taskListTitle
        : null,
    title: task.title,
    notes: task.notes,
    category:
      task.payload &&
      typeof task.payload === "object" &&
      "taskListTitle" in task.payload &&
      typeof task.payload.taskListTitle === "string"
        ? task.payload.taskListTitle
        : task.task_list_id
          ? "Google Tasks"
          : "Inbox",
    energy: inferEnergy(task.priority_score),
    status: task.status,
    dueAt: task.due_at,
  }));
}

function inferEnergy(score: number | null): CachedTask["energy"] {
  if ((score ?? 0) >= 80) {
    return "Deep work";
  }

  if ((score ?? 0) >= 50) {
    return "Admin";
  }

  return "Low lift";
}
