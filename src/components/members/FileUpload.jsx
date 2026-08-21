import React, { useState, useEffect } from "react";
import { uploadToBucket, getSignedUrl } from "@/lib/storage";
import { Upload, X, Loader2 } from "lucide-react";

export default function FileUpload({ label, value, onChange, accept = "image/*", bucket = "kyc-documents" }) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

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
    try {
      const path = await uploadToBucket(bucket, file);
      onChange(path);
    } catch (e) {
      console.error("Upload failed", e);
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
        <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted transition-colors">
          {uploading ? (
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          ) : (
            <Upload className="w-5 h-5 text-muted-foreground" />
          )}
          <span className="text-xs text-muted-foreground mt-1">
            {uploading ? "Uploading…" : "Click to upload"}
          </span>
          <input
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />
        </label>
      )}
    </div>
  );
}