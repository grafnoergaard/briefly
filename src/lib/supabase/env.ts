const publicEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

export function hasSupabaseEnv() {
  return Boolean(publicEnv.url && publicEnv.anonKey);
}

export function getSupabasePublicEnv() {
  if (!hasSupabaseEnv()) {
    throw new Error("Missing Supabase environment variables.");
  }

  return {
    url: publicEnv.url!,
    anonKey: publicEnv.anonKey!,
  };
}
