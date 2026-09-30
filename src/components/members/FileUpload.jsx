import React, { useState, useEffect, useRef } from "react";
import { uploadToBucket, getSignedUrl } from "@/lib/storage";
import { Upload, X, Loader2 } from "lucide-react";

export default function FileUpload({ label, value, onChange, accept = "image/*", bucket = "kyc-documents" }) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const inputRef = useRef(null);
  // A failed upload used to just log to the console and silently revert to
  // "Click to upload" — indistinguishable from having never attached
  // anything at all, so a member whose upload kept failing (flaky mobile
  // data, a storage hiccup, anything) saw no explanation and just kept
  // re-attaching the same file forever. Surfacing the real error breaks
  // that loop — they at least know why, and can retry with intent (e.g.
  // switch off wifi, wait, pick a smaller photo) instead of guessing.
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (value) {
      getSignedUrl(bucket, value).then((url) => { if (active) setPreviewUrl(url); }).catch(() => {});
    } else {
      setPreviewUrl(null);
    }
    return () => { active = false; };
  }, [value, bucket]);

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const path = await uploadToBucket(bucket, file);
      onChange(path);
    } catch (e) {
      console.error("Upload failed", e);
      setError(e.message || "Upload failed — please try again.");
    }
    setUploading(false);
  };

  return (
    <div>
      {label && <label className="text-xs text-muted-foreground block mb-1">{label}</label>}
      {value ? (
        <div className="relative">
          <img src={previewUrl} alt="Uploaded" className="w-full h-28 object-cover rounded-lg border border-border" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-1 right-1 bg-card/90 rounded-full p-1 shadow-sm hover:bg-card"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      ) : (
        <>
          {/* A plain onClick-triggered input (not a <label> relying on
              native label-for association, and not display:none via
              "hidden") — some mobile browsers, notably older Samsung
              Internet builds, are unreliable at opening the native file
              picker from a fully display:none input reached only through
              label association. sr-only keeps it out of view without
              display:none, and the div's onClick calls .click() on it
              directly, which every browser treats as a normal user-
              triggered file picker request regardless of how the input
              that issued it is hidden. */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
            className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted transition-colors ${error ? "border-destructive" : "border-border"}`}
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
            ) : (
              <Upload className="w-5 h-5 text-muted-foreground" />
            )}
            <span className="text-xs text-muted-foreground mt-1">
              {uploading ? "Uploading…" : "Click to upload"}
            </span>
            <input
              ref={inputRef}
              type="file"
              accept={accept}
              className="sr-only"
              onChange={(e) => handleFile(e.target.files[0])}
            />
          </div>
          {error && <p className="text-xs text-destructive mt-1">{error}</p>}
        </>
      )}
    </div>
  );
}