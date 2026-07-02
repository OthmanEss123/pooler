import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function uploadToSupabase(file: File, bucket: string): Promise<string> {
  const fileExt = file.name.split(".").pop();
  const fileName = `${Math.random().toString(36).slice(2, 10)}-${Date.now()}.${fileExt}`;
  const filePath = `${fileName}`;

  try {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      });

    if (error) {
      throw error;
    }

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (err) {
    // Fallback: upload to a generic "pooler" bucket under folder path
    const fallbackPath = `${bucket}/${fileName}`;
    const { error: fallbackError } = await supabase.storage
      .from("pooler")
      .upload(fallbackPath, file, {
        cacheControl: "3600",
        upsert: true,
      });

    if (fallbackError) {
      const originalMessage = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Upload failed. Buckets "${bucket}" (${originalMessage}) and fallback "pooler" (${fallbackError.message}) could not be reached.`
      );
    }

    const { data: { publicUrl } } = supabase.storage
      .from("pooler")
      .getPublicUrl(fallbackPath);

    return publicUrl;
  }
}
