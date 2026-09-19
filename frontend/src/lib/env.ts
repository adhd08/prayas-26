export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

export function requireSupabaseConfig() {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Set Supabase URL and publishable key in frontend/.env.local first.");
  return config;
}

export function getApiUrl() {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) throw new Error("Set NEXT_PUBLIC_API_URL in frontend/.env.local first.");
  return url.replace(/\/$/, "");
}
