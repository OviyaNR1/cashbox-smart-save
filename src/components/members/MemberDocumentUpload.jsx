import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { getSignedUrl } from "@/lib/storage";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FileUpload from "./FileUpload";
import { DOC_TYPE_LABELS } from "@/lib/canada";
import { CheckCircle2, Clock, XCircle, Upload, Loader2, FileText, Plus } from "lucide-react";

// India-only launch: Aadhaar is the only document type members can submit.
// DOC_TYPE_LABELS keeps the other (Canada-era) entries so any historical
// documents on file still render a proper label — just not offered here.
const DOC_TYPE_OPTIONS = [{ value: "aadhaar_card", label: DOC_TYPE_LABELS.aadhaar_card }];

const statusTone = (status) => {
  if (status === "approved") return { bg: "bg-emerald-500/15", text: "text-emerald-400", icon: CheckCircle2, label: "Approved" };
  if (status === "rejected") return { bg: "bg-rose-500/15", text: "text-rose-400", icon: XCircle, label: "Rejected" };
  return { bg: "bg-amber-500/15", text: "text-amber-400", icon: Clock, label: "Pending" };
};

export default function MemberDocumentUpload({ memberProfileId }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ docType: "aadhaar_card", docNumber: "", expiryDate: "", frontUrl: "", backUrl: "" });
  const { toast } = useToast();

  const load = () => {
    if (!memberProfileId) return;
    setLoading(true);
    base44.entities.Document.filter({ member_profile_id: memberProfileId })
      .then(async (rows) => {
        const withSignedUrls = await Promise.all(rows.map(async (doc) => ({
          ...doc,
          front_image_url: doc.front_image_url ? await getSignedUrl("kyc-documents", doc.front_image_url).catch(() => null) : null,
        })));
        setDocs(withSignedUrls);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [memberProfileId]);

  const submit = async () => {
    if (!form.docType || !form.frontUrl) {
      toast({ title: "Please select a document type and upload the front image.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await base44.entities.Document.create({
        member_profile_id: memberProfileId,
        document_type: form.docType,
        document_number: form.docNumber || "",
        expiry_date: form.expiryDate || "",
        front_image_url: form.frontUrl,
        back_image_url: form.backUrl || "",
        verification_status: "pending",
      });
      toast({ title: "Document submitted for review." });
      setForm({ docType: "aadhaar_card", docNumber: "", expiryDate: "", frontUrl: "", backUrl: "" });
      setShowForm(false);
      load();
    } catch (e) {
      toast({ title: e.message || "Failed to upload document.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="py-8 text-center"><Loader2 className="w-5 h-5 text-muted-foreground/60 animate-spin mx-auto" /></div>;
  }

  return (
    <div className="space-y-4">
      {docs.length === 0 && !showForm && (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          <FileText className="w-5 h-5 mx-auto mb-2 text-muted-foreground/60" />
          No documents uploaded yet.
        </div>
      )}

      {docs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {docs.map((doc) => {
            const tone = statusTone(doc.verification_status);
            const ToneIcon = tone.icon;
            return (
              <div key={doc.id} className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{DOC_TYPE_LABELS[doc.document_type] || doc.document_type}</span>
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${tone.bg} ${tone.text}`}>
                    <ToneIcon className="w-3 h-3" /> {tone.label}
                  </span>
                </div>
                {doc.document_number && <p className="text-xs text-muted-foreground">Doc #: {doc.document_number}</p>}
                {doc.front_image_url && (
                  <img src={doc.front_image_url} alt={doc.document_type} className="w-full h-24 object-cover rounded-lg border border-border" />
                )}
                {doc.rejection_reason && <p className="text-xs text-destructive">Reason: {doc.rejection_reason}</p>}
              </div>
            );
          })}
        </div>
      )}

      {showForm ? (
        <div className="rounded-xl border border-border p-4 space-y-4">
          <div className="space-y-1.5">
            <Label>Document type</Label>
            <p className="text-sm text-foreground px-3 py-2 rounded-md border border-border bg-muted">{DOC_TYPE_OPTIONS[0].label}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="docNum">Aadhaar number</Label>
            <Input id="docNum" value={form.docNumber} onChange={(e) => setForm({ ...form, docNumber: e.target.value })} placeholder="1234 5678 9012" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FileUpload label="Front image" value={form.frontUrl} onChange={(url) => setForm({ ...form, frontUrl: url })} />
            <FileUpload label="Back image (optional)" value={form.backUrl} onChange={(url) => setForm({ ...form, backUrl: url })} />
          </div>

          <div className="flex gap-2">
            <Button onClick={submit} disabled={submitting} className="rounded-full bg-primary hover:bg-primary/90" size="sm">
              {submitting ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Submitting…</> : <><Upload className="w-4 h-4 mr-1" /> Submit for review</>}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)} className="rounded-full" size="sm">Cancel</Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setShowForm(true)} variant="outline" className="rounded-full" size="sm">
          <Plus className="w-4 h-4 mr-1" /> Upload document
        </Button>
      )}
    </div>
  );
}