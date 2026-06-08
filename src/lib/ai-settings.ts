import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AiBriefSettings = {
  enabled: boolean;
  model: string;
  tone: string;
};

export const DEFAULT_AI_BRIEF_SETTINGS: AiBriefSettings = {
  enabled: false,
  model: "gpt-5-mini",
  tone: "calm",
};

export async function getAiBriefSettings(userId: string): Promise<AiBriefSettings> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return DEFAULT_AI_BRIEF_SETTINGS;
  }

  const { data } = await supabase
    .from("profiles")
    .select("ai_brief_enabled, ai_brief_model, ai_brief_tone")
    .eq("id", userId)
    .maybeSingle();

  return {
    enabled: data?.ai_brief_enabled ?? DEFAULT_AI_BRIEF_SETTINGS.enabled,
    model: data?.ai_brief_model ?? DEFAULT_AI_BRIEF_SETTINGS.model,
    tone: data?.ai_brief_tone ?? DEFAULT_AI_BRIEF_SETTINGS.tone,
  };
}

export function hasOpenAiEnv() {
  return Boolean(process.env.OPENAI_API_KEY);
}
