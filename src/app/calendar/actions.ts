"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  saveSelectedGoogleCalendars,
  syncGooglePrimaryCalendar,
} from "@/features/integrations/google/google-calendar";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function syncGoogleCalendarAction() {
  const user = await requireActionUser();
  let successMessage = "Google Kalender er synkroniseret.";

  try {
    const result = await syncGooglePrimaryCalendar(user.id);
    successMessage = `${result.syncedCount} aftaler blev synkroniseret fra ${formatCalendarNames(result.calendarNames)}.`;
  } catch (error) {
    redirectError(error, "Google Kalender-sync fejlede.");
  }

  revalidateCalendarViews();
  redirectSuccess(successMessage);
}

export async function saveGoogleCalendarSelectionAction(formData: FormData) {
  const user = await requireActionUser();
  const redirectTo = getRedirectTarget(formData.get("redirectTo"), "/calendar");
  const selectedCalendarIds = formData
    .getAll("calendarIds")
    .map((value) => String(value))
    .filter(Boolean);

  try {
    const selectedCalendarNames = await saveSelectedGoogleCalendars(user.id, selectedCalendarIds);
    revalidateCalendarViews();
    redirectSuccess(`${formatCalendarNames(selectedCalendarNames)} er gemt til sync.`, redirectTo);
  } catch (error) {
    redirectError(error, "Kunne ikke gemme valg af Google-kalendere.", redirectTo);
  }
}

async function requireActionUser() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/calendar?sync=error&message=Supabase-milj%C3%B8variabler%20mangler.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  return user;
}

function revalidateCalendarViews() {
  revalidatePath("/");
  revalidatePath("/calendar");
  revalidatePath("/settings");
}

function formatCalendarNames(names: string[]) {
  if (names.length === 0) {
    return "Google Kalender";
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

function redirectSuccess(message: string, redirectTo = "/calendar"): never {
  redirect(`${redirectTo}?sync=success&message=${encodeURIComponent(message)}`);
}

function redirectError(error: unknown, fallback: string, redirectTo = "/calendar"): never {
  const message = error instanceof Error ? error.message : fallback;
  redirect(`${redirectTo}?sync=error&message=${encodeURIComponent(message)}`);
}
