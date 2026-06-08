import { createSupabaseAdminClient, hasSupabaseAdminEnv } from "@/lib/supabase/admin";
import { getValidGoogleAccessToken } from "@/features/integrations/google/google-auth";

const GOOGLE_PROVIDER = "google";
const GOOGLE_TASKS_PROVIDER = "google_tasks";
const GOOGLE_TASKS_SCOPE = "https://www.googleapis.com/auth/tasks";
const PREFERRED_GOOGLE_TASK_LIST_NAME = "Opgaver";

type TasksSyncResult = {
  taskListNames: string[];
  syncedCount: number;
  deletedCount: number;
};

type GoogleTaskList = {
  id: string;
  title?: string;
};

type TaskIntegrationAccountMetadataRow = {
  metadata?: Record<string, unknown> | null;
};

export type GoogleTaskListChoice = {
  id: string;
  title: string;
  isSelected: boolean;
};

type GoogleTask = {
  id: string;
  title?: string;
  notes?: string;
  due?: string;
  completed?: string;
  status?: string;
  deleted?: boolean;
  hidden?: boolean;
};

type CachedTaskRow = {
  profile_id: string;
  provider: string;
  external_id: string;
  task_list_id: string | null;
  title: string;
  notes: string | null;
  due_at: string | null;
  completed_at: string | null;
  status: string;
  priority_score: number | null;
  payload: GoogleTask;
  synced_at: string;
};

export async function syncGoogleTasks(userId: string): Promise<TasksSyncResult> {
  if (!hasSupabaseAdminEnv()) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for secure Google sync.");
  }

  const token = await getValidGoogleAccessToken(userId, GOOGLE_TASKS_SCOPE);

  if (!token) {
    throw new Error("No Google provider token stored for this user.");
  }

  const admin = createSupabaseAdminClient();
  const availableTaskLists = await fetchGoogleTaskLists(token);
  const taskLists = await resolveSelectedGoogleTaskLists(userId, availableTaskLists);

  if (taskLists.length === 0) {
    throw new Error("Choose at least one Google task list before syncing.");
  }

  const allTasks: CachedTaskRow[] = [];

  for (const list of taskLists) {
    const tasks = await fetchGoogleTasksForList(token, list.id);

    allTasks.push(
      ...tasks
        .filter((task) => !task.deleted)
        .map((task) => ({
          profile_id: userId,
          provider: GOOGLE_TASKS_PROVIDER,
          external_id: `${list.id}:${task.id}`,
          task_list_id: list.id,
          title: task.title?.trim() || "Untitled task",
          notes: task.notes ?? null,
          due_at: task.due ?? null,
          completed_at: task.completed ?? null,
          status: task.status ?? "needsAction",
          priority_score: inferPriorityScore(task),
          payload: {
            ...task,
            taskListTitle: list.title ?? "Untitled list",
            sourceTaskId: task.id,
          } as GoogleTask,
          synced_at: new Date().toISOString(),
        })),
    );
  }

  const { data: existingRows, error: existingRowsError } = await admin
    .from("tasks_cache")
    .select("id")
    .eq("profile_id", userId)
    .eq("provider", GOOGLE_TASKS_PROVIDER);

  if (existingRowsError) {
    throw new Error(`Failed to inspect existing tasks cache: ${existingRowsError.message}`);
  }

  const typedExistingRows = (existingRows ?? []) as Array<{ id: string }>;
  const deletedCount = typedExistingRows.length;

  if (typedExistingRows.length > 0) {
    const { error: deleteError } = await admin
      .from("tasks_cache")
      .delete()
      .in(
        "id",
        typedExistingRows.map((row) => row.id),
      );

    if (deleteError) {
      throw new Error(`Failed to clear previous tasks cache: ${deleteError.message}`);
    }
  }

  if (allTasks.length > 0) {
    const { error } = await admin.from("tasks_cache").upsert(allTasks as never, {
      onConflict: "profile_id,provider,external_id",
    });

    if (error) {
      throw new Error(`Failed to cache Google Tasks items: ${error.message}`);
    }
  }

  const now = new Date().toISOString();
  const taskListNames = taskLists.map((list) => list.title ?? "Untitled list");
  await admin
    .from("integration_accounts")
    .update({
      status: "connected",
      last_synced_at: now,
      updated_at: now,
      metadata: {
        lastTasksSyncAt: now,
        taskListCount: taskLists.length,
        selectedTaskListIds: taskLists.map((list) => list.id),
        selectedTaskListTitles: taskListNames,
      },
    } as never)
    .eq("profile_id", userId)
    .eq("provider", GOOGLE_PROVIDER);

  return {
    taskListNames,
    syncedCount: allTasks.length,
    deletedCount,
  };
}

export async function getGoogleTaskListChoices(userId: string): Promise<GoogleTaskListChoice[]> {
  if (!hasSupabaseAdminEnv()) {
    return [];
  }

  const token = await getValidGoogleAccessToken(userId, GOOGLE_TASKS_SCOPE);

  if (!token) {
    return [];
  }

  const availableTaskLists = await fetchGoogleTaskLists(token);
  const savedTaskListIds = await getSavedSelectedGoogleTaskListIds(userId);
  const defaultTaskLists = pickDefaultTaskLists(availableTaskLists);
  const selectedIds = new Set(
    savedTaskListIds.length > 0 ? savedTaskListIds : defaultTaskLists.map((list) => list.id),
  );

  return availableTaskLists.map((list) => ({
    id: list.id,
    title: list.title ?? "Untitled list",
    isSelected: selectedIds.has(list.id),
  }));
}

export async function saveSelectedGoogleTaskLists(userId: string, taskListIds: string[]) {
  if (!hasSupabaseAdminEnv()) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for secure task list settings.");
  }

  const token = await getValidGoogleAccessToken(userId, GOOGLE_TASKS_SCOPE);

  if (!token) {
    throw new Error("No Google provider token stored for this user.");
  }

  const availableTaskLists = await fetchGoogleTaskLists(token);
  const selectedTaskLists = availableTaskLists.filter((list) => taskListIds.includes(list.id));

  if (selectedTaskLists.length === 0) {
    throw new Error("Choose at least one Google task list.");
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("integration_accounts")
    .select("metadata")
    .eq("profile_id", userId)
    .eq("provider", GOOGLE_PROVIDER)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Google task settings: ${error.message}`);
  }

  const typedRow = data as TaskIntegrationAccountMetadataRow | null;
  const metadata =
    typedRow && typedRow.metadata && typeof typedRow.metadata === "object"
      ? typedRow.metadata
      : {};

  const { error: updateError } = await admin
    .from("integration_accounts")
    .update({
      metadata: {
        ...metadata,
        selectedTaskListIds: selectedTaskLists.map((list) => list.id),
        selectedTaskListTitles: selectedTaskLists.map((list) => list.title ?? "Untitled list"),
      },
      updated_at: new Date().toISOString(),
    } as never)
    .eq("profile_id", userId)
    .eq("provider", GOOGLE_PROVIDER);

  if (updateError) {
    throw new Error(`Failed to save task list selection: ${updateError.message}`);
  }

  return selectedTaskLists.map((list) => list.title ?? "Untitled list");
}

export async function createGoogleTask(input: {
  userId: string;
  title: string;
  notes?: string | null;
  dueAt?: string | null;
}) {
  const token = await getValidatedToken(input.userId);
  const defaultList = await getDefaultTask(token, input.userId);

  const response = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${defaultList.id}/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: input.title,
      notes: input.notes?.trim() || undefined,
      due: input.dueAt ?? undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google Tasks create failed with ${response.status}.`);
  }

  await syncGoogleTasks(input.userId);

  return {
    title: input.title,
    taskListId: defaultList.id,
    taskListTitle: defaultList.title ?? "Untitled list",
    dueAt: input.dueAt ?? null,
  };
}

export async function updateGoogleTask(input: {
  userId: string;
  taskListId: string;
  taskId: string;
  title: string;
  notes?: string | null;
}) {
  const token = await getValidatedToken(input.userId);
  const currentTask = await fetchGoogleTask(token, input.taskListId, input.taskId);

  const response = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${input.taskListId}/tasks/${input.taskId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: input.title,
        notes: input.notes?.trim() || undefined,
        status: currentTask.status ?? "needsAction",
        completed: currentTask.completed,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Google Tasks update failed with ${response.status}.`);
  }

  await syncGoogleTasks(input.userId);
}

export async function toggleGoogleTaskCompletion(input: {
  userId: string;
  taskListId: string;
  taskId: string;
  completed: boolean;
}) {
  const token = await getValidatedToken(input.userId);
  const currentTask = await fetchGoogleTask(token, input.taskListId, input.taskId);

  const response = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${input.taskListId}/tasks/${input.taskId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: currentTask.title ?? "Untitled task",
        notes: currentTask.notes ?? undefined,
        status: input.completed ? "completed" : "needsAction",
        completed: input.completed ? new Date().toISOString() : null,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Google Tasks completion toggle failed with ${response.status}.`);
  }

  await syncGoogleTasks(input.userId);
}

async function fetchGoogleTaskLists(token: string) {
  const taskLists: GoogleTaskList[] = [];
  let pageToken: string | null = null;

  do {
    const params = new URLSearchParams({
      maxResults: "100",
    });

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const response = await fetch(
      `https://tasks.googleapis.com/tasks/v1/users/@me/lists?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`Google Tasklists API returned ${response.status}.`);
    }

    const payload = (await response.json()) as {
      items?: GoogleTaskList[];
      nextPageToken?: string;
    };

    taskLists.push(...(payload.items ?? []));
    pageToken = payload.nextPageToken ?? null;
  } while (pageToken);

  return taskLists;
}

async function getDefaultTask(token: string, userId: string) {
  const taskLists = await fetchGoogleTaskLists(token);
  const selectedTaskLists = await resolveSelectedGoogleTaskLists(userId, taskLists);
  const defaultList = selectedTaskLists[0] ?? taskLists[0];

  if (!defaultList?.id) {
    throw new Error("No Google task list available for this account.");
  }

  return defaultList;
}

async function fetchGoogleTasksForList(token: string, taskListId: string) {
  const tasks: GoogleTask[] = [];
  let pageToken: string | null = null;

  do {
    const params = new URLSearchParams({
      maxResults: "100",
      showCompleted: "true",
      showDeleted: "false",
      showHidden: "true",
    });

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const response = await fetch(
      `https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`Google Tasks API returned ${response.status}.`);
    }

    const payload = (await response.json()) as {
      items?: GoogleTask[];
      nextPageToken?: string;
    };

    tasks.push(...(payload.items ?? []).filter((task) => !task.deleted));
    pageToken = payload.nextPageToken ?? null;
  } while (pageToken);

  return tasks;
}

async function fetchGoogleTask(token: string, taskListId: string, taskId: string) {
  const response = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks/${taskId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Google Tasks get failed with ${response.status}.`);
  }

  return (await response.json()) as GoogleTask;
}

async function getValidatedToken(userId: string) {
  if (!hasSupabaseAdminEnv()) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for secure Google sync.");
  }

  const token = await getValidGoogleAccessToken(userId, GOOGLE_TASKS_SCOPE);

  if (!token) {
    throw new Error("No Google provider token stored for this user.");
  }

  return token;
}

async function getSavedSelectedGoogleTaskListIds(userId: string) {
  if (!hasSupabaseAdminEnv()) {
    return [];
  }

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("integration_accounts")
    .select("metadata")
    .eq("profile_id", userId)
    .eq("provider", GOOGLE_PROVIDER)
    .maybeSingle();

  const typedRow = data as TaskIntegrationAccountMetadataRow | null;
  const selectedTaskListIds = typedRow?.metadata?.selectedTaskListIds;

  if (!Array.isArray(selectedTaskListIds)) {
    return [];
  }

  return selectedTaskListIds.filter((item): item is string => typeof item === "string");
}

async function resolveSelectedGoogleTaskLists(userId: string, availableTaskLists: GoogleTaskList[]) {
  const savedIds = await getSavedSelectedGoogleTaskListIds(userId);
  const selectedFromSaved = availableTaskLists.filter((list) => savedIds.includes(list.id));

  if (selectedFromSaved.length > 0) {
    return selectedFromSaved;
  }

  return pickDefaultTaskLists(availableTaskLists);
}

function pickDefaultTaskLists(availableTaskLists: GoogleTaskList[]) {
  const preferredList = availableTaskLists.find(
    (list) => list.title?.trim().toLowerCase() === PREFERRED_GOOGLE_TASK_LIST_NAME.toLowerCase(),
  );

  if (preferredList) {
    return [preferredList];
  }

  return availableTaskLists.length > 0 ? [availableTaskLists[0]] : [];
}

function inferPriorityScore(task: GoogleTask) {
  if (task.status === "completed") {
    return 0;
  }

  if (task.due) {
    const dueDate = new Date(task.due).getTime();
    const daysUntilDue = (dueDate - Date.now()) / (1000 * 60 * 60 * 24);

    if (daysUntilDue <= 1) {
      return 90;
    }

    if (daysUntilDue <= 3) {
      return 70;
    }
  }

  return task.notes ? 55 : 40;
}
