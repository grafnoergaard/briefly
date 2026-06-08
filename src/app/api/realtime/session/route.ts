import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error: "OPENAI_API_KEY is missing for realtime voice.",
      },
      { status: 500 },
    );
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(
      {
        error: "Missing Supabase environment variables.",
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
        error: "You need to sign in before using Live Voice.",
      },
      { status: 401 },
    );
  }

  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: "gpt-realtime-2",
        audio: {
          output: {
            voice: "marin",
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();

    return NextResponse.json(
      {
        error: `OpenAI realtime session failed: ${text || response.status}`,
      },
      { status: 500 },
    );
  }

  const payload = await response.json();

  return NextResponse.json(payload);
}
