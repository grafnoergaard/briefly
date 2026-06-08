import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AiBriefSettings = {
  enabled: boolean;
  model: string;
  tone: string;
  voice: string;
  voiceSpeed: number;
  voiceStyle: string;
  customGuidance: string;
};

export const DEFAULT_AI_BRIEF_SETTINGS: AiBriefSettings = {
  enabled: false,
  model: "gpt-5-mini",
  tone: "calm",
  voice: "coral",
  voiceSpeed: 1.16,
  voiceStyle:
    "Varm, rolig, moderne og tydelig dansk stemme med naturlige pauser. Brug naturligt dansk. Undgå systemtoner, tekniske formuleringer og parenteser om tider. Start ikke automatisk med 'godmorgen'. Hvis du bruger en hilsen, skal den passe til tidspunktet. Om aftenen må du ikke sige 'godmorgen', og om morgenen må du ikke sige 'godaften'. Hvis en hilsen er unødvendig, så gå direkte til svaret.",
  customGuidance: "",
};

export async function getAiBriefSettings(userId: string): Promise<AiBriefSettings> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return DEFAULT_AI_BRIEF_SETTINGS;
  }

  const { data } = await supabase
    .from("profiles")
    .select("ai_brief_enabled, ai_brief_model, ai_brief_tone, ai_voice_name, ai_voice_speed, ai_voice_style, ai_custom_guidance")
    .eq("id", userId)
    .maybeSingle();

  return {
    enabled: data?.ai_brief_enabled ?? DEFAULT_AI_BRIEF_SETTINGS.enabled,
    model: data?.ai_brief_model ?? DEFAULT_AI_BRIEF_SETTINGS.model,
    tone: data?.ai_brief_tone ?? DEFAULT_AI_BRIEF_SETTINGS.tone,
    voice: data?.ai_voice_name ?? DEFAULT_AI_BRIEF_SETTINGS.voice,
    voiceSpeed:
      typeof data?.ai_voice_speed === "number"
        ? data.ai_voice_speed
        : DEFAULT_AI_BRIEF_SETTINGS.voiceSpeed,
    voiceStyle: data?.ai_voice_style ?? DEFAULT_AI_BRIEF_SETTINGS.voiceStyle,
    customGuidance: data?.ai_custom_guidance ?? DEFAULT_AI_BRIEF_SETTINGS.customGuidance,
  };
}

export function hasOpenAiEnv() {
  return Boolean(process.env.OPENAI_API_KEY);
}
