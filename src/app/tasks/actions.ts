"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createGoogleTask,
  saveSelectedGoogleTaskLists,
  syncGoogleTasks,
  toggleGoogleTaskCompletion,
  updateGoogleTask,
} from "@/features/integrations/google/google-tasks";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function syncGoogleTasksAction() {
  const user = await requireActionUser();
  let successMessage = "Google Tasks er synkroniseret.";

  try {
    const result = await syncGoogleTasks(user.id);
    successMessage = `${result.syncedCount} punkter blev synkroniseret fra ${formatTaskListNames(result.taskListNames)}.`;
  } catch (error) {
    redirectError(error, "Google Tasks-sync fejlede.");
  }

  revalidateTasksViews();
  redirectSuccess(successMessage);
}

export async function saveGoogleTaskListSelectionAction(formData: FormData) {
  const user = await requireActionUser();
  const redirectTo = getRedirectTarget(formData.get("redirectTo"), "/tasks");
  const selectedTaskListIds = formData
    .getAll("taskListIds")
    .map((value) => String(value))
    .filter(Boolean);

  try {
    const selectedTaskListNames = await saveSelectedGoogleTaskLists(user.id, selectedTaskListIds);
    revalidateTasksViews();
    redirectSuccess(`${formatTaskListNames(selectedTaskListNames)} er gemt til sync.`, redirectTo);
  } catch (error) {
    redirectError(error, "Kunne ikke gemme valg af Google-opgavelister.", redirectTo);
  }
}

export async function createGoogleTaskAction(formData: FormData) {
  const user = await requireActionUser();
  const title = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!title) {
    redirectError(new Error("Der mangler en titel på punktet."), "Der mangler en titel på punktet.");
  }

  try {
    await createGoogleTask({
      userId: user.id,
      title,
      notes,
    });
  } catch (error) {
    redirectError(error, "Kunne ikke oprette punkt i Google Tasks.");
  }

  revalidateTasksViews();
  redirectSuccess("Punktet er oprettet i Google Tasks.");
}

export async function updateGoogleTaskAction(formData: FormData) {
  const user = await requireActionUser();
  const taskId = String(formData.get("taskId") ?? "");
  const taskListId = String(formData.get("taskListId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!taskId || !taskListId || !title) {
    redirectError(new Error("Der mangler task-id, opgaveliste eller titel."), "Der mangler data til punktet.");
  }

  try {
    await updateGoogleTask({
      userId: user.id,
      taskId,
      taskListId,
      title,
      notes,
    });
  } catch (error) {
    redirectError(error, "Kunne ikke opdatere punkt i Google Tasks.");
  }

  revalidateTasksViews();
  redirectSuccess("Ændringerne er gemt.");
}

export async function toggleGoogleTaskCompletionAction(formData: FormData) {
  const user = await requireActionUser();
  const taskId = String(formData.get("taskId") ?? "");
  const taskListId = String(formData.get("taskListId") ?? "");
  const completed = String(formData.get("completed") ?? "") === "true";

  if (!taskId || !taskListId) {
    redirectError(new Error("Der mangler task-id eller opgaveliste."), "Der mangler data til punktet.");
  }

  try {
    await toggleGoogleTaskCompletion({
      userId: user.id,
      taskId,
      taskListId,
      completed,
    });
  } catch (error) {
    redirectError(error, "Kunne ikke opdatere punktets status i Google Tasks.");
  }

  revalidateTasksViews();
  redirectSuccess(completed ? "Punktet er markeret som færdigt." : "Punktet er åbent igen.");
}

async function requireActionUser() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/tasks?sync=error&message=Supabase-milj%C3%B8variabler%20mangler.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  return user;
}

function revalidateTasksViews() {
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/settings");
}

function formatTaskListNames(names: string[]) {
  if (names.length === 0) {
    return "Google Tasks";
  }

  if (names.length === 1) {
    return names[0];
  }

  if (names.length === 2) {
    return `${names[0]} og ${names[1]}`;
  }

  return `${names.slice(0, -1).join(", ")} og ${names.at(-1)}`;
}

function getRedirectTarget(value: FormDataEntryValue | null, fallback: string) {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return fallback;
  }

  return value;
}

function redirectSuccess(message: string, redirectTo = "/tasks") {
  redirect(`${redirectTo}?sync=success&message=${encodeURIComponent(message)}`);
}

function redirectError(error: unknown, fallback: string, redirectTo = "/tasks"): never {
  const message = error instanceof Error ? error.message : fallback;
  redirect(`${redirectTo}?sync=error&message=${encodeURIComponent(message)}`);
}
