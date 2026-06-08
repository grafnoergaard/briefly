import { NextResponse } from "next/server";

import {
  ensureProfileFromAuthUser,
  persistGoogleOAuthSession,
} from "@/features/integrations/google/google-calendar";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextParam = requestUrl.searchParams.get("next") ?? "/";
  const next = nextParam.startsWith("/") ? nextParam : "/";

  const supabase = await createSupabaseServerClient();

  if (code && supabase) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session?.user) {
      const user = data.session.user;
      await ensureProfileFromAuthUser(user);
      const scopes =
        data.session.provider_token && data.session.provider_refresh_token
          ? [
              "openid",
              "email",
              "profile",
              "https://www.googleapis.com/auth/calendar",
              "https://www.googleapis.com/auth/tasks",
              "https://www.googleapis.com/auth/contacts.readonly",
              "https://www.googleapis.com/auth/gmail.readonly",
            ]
          : [];

      await persistGoogleOAuthSession({
        userId: user.id,
        email: user.email ?? null,
        providerAccountId:
          user.identities?.find((identity) => identity.provider === "google")?.id ?? null,
        scopes,
        providerToken: data.session.provider_token ?? null,
        providerRefreshToken: data.session.provider_refresh_token ?? null,
        expiresAt: data.session.expires_at ?? null,
      });
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
