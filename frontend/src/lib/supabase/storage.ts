"use client";

import { createClient } from "@/lib/supabase/client";

export const PLAN_ASSETS_BUCKET = "plan-assets";

// Use from future upload/export UI. RLS enforces the same user prefix.
export async function uploadAsset(file: File) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Sign in before uploading a file.");
  const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${user.id}/${crypto.randomUUID()}-${filename}`;
  const { data, error } = await supabase.storage.from(PLAN_ASSETS_BUCKET).upload(path, file);
  if (error) throw error;
  return data.path;
}

export async function getAssetUrl(path: string) {
  const { data, error } = await createClient().storage
    .from(PLAN_ASSETS_BUCKET).createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}
