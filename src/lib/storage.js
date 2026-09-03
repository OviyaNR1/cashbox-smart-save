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
// MediaRecorder's actual output format depends entirely on the recording
// browser — Chrome/Firefox/Android produce audio/webm, but Safari/iOS (a
// large share of members, given 95%+ are on mobile) has no WebM support at
// all and silently records audio/mp4 (AAC) instead. Hardcoding a .webm
// extension regardless of the real format meant an iPhone-recorded clip got
// uploaded as "clip.webm" while actually containing MP4 audio — enough to
// make Storage/CDN content-type sniffing serve it as the wrong type and
// break playback with a bare "Error", even on the very phone that recorded
// it. Deriving the extension from the blob's real MIME type keeps the file
// self-consistent for any listener's browser.
function extensionFor(mimeType) {
  const type = (mimeType || "").toLowerCase();
  if (type.includes("mp4") || type.includes("m4a") || type.includes("aac")) return "mp4";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  return "webm";
}

export async function uploadAuctionVoiceMessage(auctionId, blob) {
  const path = `${auctionId}/${crypto.randomUUID()}.${extensionFor(blob.type)}`;
  const { error } = await supabase.storage.from("auction-voice-messages").upload(path, blob, {
    contentType: blob.type || "audio/webm",
  });
  if (error) throw error;
  return path;
}
