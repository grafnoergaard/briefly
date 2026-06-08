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
  const voice = String(formData.get("voice") ?? "").trim() || "coral";
  const rawVoiceSpeed = Number(formData.get("voiceSpeed") ?? "");
  const voiceSpeed = Number.isFinite(rawVoiceSpeed)
    ? Math.min(2, Math.max(0.75, rawVoiceSpeed))
    : 1.16;
  const voiceStyle =
    String(formData.get("voiceStyle") ?? "").trim() ||
    "Varm, rolig, moderne og tydelig dansk stemme med naturlige pauser.";
  const customGuidance = String(formData.get("customGuidance") ?? "").trim();

  const { error } = await supabase
    .from("profiles")
    .update({
      ai_brief_enabled: enabled,
      ai_brief_model: model,
      ai_brief_tone: tone,
      ai_voice_name: voice,
      ai_voice_speed: voiceSpeed,
      ai_voice_style: voiceStyle,
      ai_custom_guidance: customGuidance,
    })
    .eq("id", user.id);

  if (error) {
    redirect(`/settings?sync=error&message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  revalidatePath("/settings");
  redirect("/settings?sync=success&message=Saved%20AI%20settings.");
}
