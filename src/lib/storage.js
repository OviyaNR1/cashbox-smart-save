import { supabase } from "@/api/base44Client";

export async function uploadToBucket(bucket, file) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const path = `${user.id}/${crypto.randomUUID()}-${file.name}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file);
  if (error) throw error;
  return path;
}

export async function getSignedUrl(bucket, path, expiresIn = 3600) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

// Voice messages are scoped by auction (folder = auction id), not by
// uploader — the storage RLS lets any member of that auction's group listen,
// not just whoever recorded it, so the path can't use the uploadToBucket()
// convention of keying by user id.
export async function uploadAuctionVoiceMessage(auctionId, blob) {
  const path = `${auctionId}/${crypto.randomUUID()}.webm`;
  const { error } = await supabase.storage.from("auction-voice-messages").upload(path, blob, {
    contentType: blob.type || "audio/webm",
  });
  if (error) throw error;
  return path;
}
