import { createSupabaseAdminClient, hasSupabaseAdminEnv } from "@/lib/supabase/admin";

const GOOGLE_PROVIDER = "google";

type StoredGoogleTokens = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
};

export async function getValidGoogleAccessToken(userId: string, fallbackScope?: string) {
  if (!hasSupabaseAdminEnv()) {
    return null;
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("integration_account_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("profile_id", userId)
    .eq("provider", GOOGLE_PROVIDER)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const typedData = data as StoredGoogleTokens;
  const tokenExpiresSoon =
    !typedData.expires_at || new Date(typedData.expires_at).getTime() <= Date.now() + 60_000;

  if (typedData.access_token && !tokenExpiresSoon) {
    return typedData.access_token;
  }

  if (!typedData.refresh_token) {
    return typedData.access_token;
  }

  return refreshGoogleAccessToken(userId, typedData.refresh_token, fallbackScope);
}

async function refreshGoogleAccessToken(
  userId: string,
  refreshToken: string,
  fallbackScope?: string,
) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET for token refresh.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error("Google refresh token exchange failed.");
  }

  const payload = (await response.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
  };

  const admin = createSupabaseAdminClient();
  await admin
    .from("integration_account_tokens")
    .update({
      access_token: payload.access_token,
      expires_at: new Date(Date.now() + payload.expires_in * 1000).toISOString(),
      scope: payload.scope ?? fallbackScope ?? null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("profile_id", userId)
    .eq("provider", GOOGLE_PROVIDER);

  return payload.access_token;
}
