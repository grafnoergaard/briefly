import { NextResponse } from "next/server";
import { z } from "zod";

import { getAiBriefSettings } from "@/lib/ai-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  text: z.string().trim().min(1).max(4096),
  mode: z.enum(["brief", "assistant"]).optional(),
});

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error: "OPENAI_API_KEY mangler til Briefly-oplæsning.",
      },
      { status: 500 },
    );
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(
      {
        error: "Supabase er ikke konfigureret korrekt.",
      },
      { status: 500 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        error: "Du skal være logget ind for at få læst briefen højt.",
      },
      { status: 401 },
    );
  }

  const rawBody = (await request.json()) as unknown;
  const parsedBody = requestSchema.safeParse(rawBody);

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: "Der mangler tekst til oplæsning.",
      },
      { status: 400 },
    );
  }

  const settings = await getAiBriefSettings(user.id);
  const sharedVoiceInstructions = settings.voiceStyle.trim();
  const modeInstruction =
    parsedBody.data.mode === "assistant"
      ? "Læs som Brieflys direkte svar til brugeren. Hold det nærværende, naturligt og let at følge."
      : "Læs som Brieflys oplæsning af briefen. Hold det roligt, naturligt og let at følge.";

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: settings.voice,
      response_format: "mp3",
      speed: settings.voiceSpeed,
      input: parsedBody.data.text,
      instructions: `Speak Danish. ${sharedVoiceInstructions} ${modeInstruction}`,
    }),
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();

    return NextResponse.json(
      {
        error: `OpenAI text-to-speech fejlede: ${text || response.status}`,
      },
      { status: 500 },
    );
  }

  const audioBuffer = await response.arrayBuffer();

  return new Response(audioBuffer, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
