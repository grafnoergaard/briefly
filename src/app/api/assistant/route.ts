import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { runLifeOsAssistantTurn } from "@/lib/assistant";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  message: z.string().trim().min(1).max(1000),
});

export async function POST(request: Request) {
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
        error: "Du skal logge ind, før du kan bruge Briefly-assistenten.",
      },
      { status: 401 },
    );
  }

  const rawBody = (await request.json()) as unknown;
  const parsedBody = requestSchema.safeParse(rawBody);

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: "Beskeden mangler.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await runLifeOsAssistantTurn({
      userId: user.id,
      message: parsedBody.data.message,
    });

    revalidatePath("/");
    revalidatePath("/calendar");
    revalidatePath("/tasks");
    revalidatePath("/meal-plan");
    revalidatePath("/shopping");

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Briefly-assistenten fejlede.";

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 },
    );
  }
}
