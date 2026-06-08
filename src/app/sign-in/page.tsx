import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { GoogleSignInButton } from "@/features/auth/components/google-sign-in-button";

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f6f1_0%,#efede3_100%)] px-4 py-6 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-xl flex-col justify-center">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Tilbage til overblik
        </Link>

        <Card className="rounded-[32px] border-black/5 bg-white/88 shadow-[0_30px_100px_-60px_rgba(17,24,39,0.75)]">
          <CardContent className="space-y-6 p-8">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                Login
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">
                Forbind Briefly med dit Google-liv
              </h1>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">
                Log ind med Supabase Auth og Google OAuth. Kalender, opgaver og de øvrige
                datakilder kobles på, så Briefly kan samle det vigtigste i én daglig briefing.
              </p>
            </div>

            <GoogleSignInButton />

            <div className="rounded-[24px] bg-muted/55 p-4 text-sm leading-7 text-muted-foreground">
              Aktivér Google som provider i Supabase Auth og tilføj callback-URL&apos;en
              `/auth/callback` i både Supabase og Google Cloud Console.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
