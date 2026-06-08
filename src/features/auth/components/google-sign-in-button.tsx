"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/env";

type GoogleSignInButtonProps = {
  redirectTo?: string;
};

export function GoogleSignInButton({
  redirectTo = "/",
}: GoogleSignInButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSignIn = () => {
    startTransition(async () => {
      setError(null);

      const supabase = createSupabaseBrowserClient();

      if (!supabase || !hasSupabaseEnv()) {
        setError("Tilføj Supabase-env-vars, før Google-login kan aktiveres.");
        return;
      }

      const origin = window.location.origin;
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
          scopes: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/calendar",
            "https://www.googleapis.com/auth/tasks",
            "https://www.googleapis.com/auth/contacts.readonly",
            "https://www.googleapis.com/auth/gmail.readonly",
          ].join(" "),
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (signInError) {
        setError(signInError.message);
      }
    });
  };

  return (
    <div className="space-y-3">
      <Button
        type="button"
        size="lg"
        variant="outline"
        className="w-full justify-between rounded-2xl border-border/70 bg-white/90 px-4 text-sm shadow-sm hover:bg-white"
        onClick={handleSignIn}
        disabled={isPending}
      >
        <span>Fortsæt med Google</span>
        <Mail className="size-4" />
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
