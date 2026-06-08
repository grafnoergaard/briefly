"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function saveAiSettingsAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/settings?sync=error&message=Missing%20Supabase%20environment%20variables.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const enabled = String(formData.get("enabled") ?? "") === "true";
  const model = String(formData.get("model") ?? "").trim() || "gpt-5-mini";
  const tone = String(formData.get("tone") ?? "").trim() || "calm";

  const { error } = await supabase
    .from("profiles")
    .update({
      ai_brief_enabled: enabled,
      ai_brief_model: model,
      ai_brief_tone: tone,
    })
    .eq("id", user.id);

  if (error) {
    redirect(`/settings?sync=error&message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  revalidatePath("/settings");
  redirect("/settings?sync=success&message=Saved%20AI%20settings.");
}
