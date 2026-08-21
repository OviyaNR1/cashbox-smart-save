import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { getSignedUrl } from "@/lib/storage";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FileUpload from "./FileUpload";
import { ShieldCheck, ShieldX, FileText, Loader2, Upload, Plus } from "lucide-react";
import { DOC_TYPE_LABELS } from "@/lib/canada";

const DOC_TYPE_OPTIONS = Object.entries(DOC_TYPE_LABELS).map(([value, label]) => ({ value, label }));

export default function MemberDocuments({ memberProfileId }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ docType: "", docNumber: "", expiryDate: "", frontUrl: "", backUrl: "" });
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
      setForm({ docType: "", docNumber: "", expiryDate: "", frontUrl: "", backUrl: "" });
      setShowForm(false);
      load();
    } catch (e) {
      toast({ title: e.message || "Failed to upload document.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id, status, reason = "") => {
    const payload = {
      verification_status: status,
      approved_by: "Admin",
      approved_date: new Date().toISOString().slice(0, 10),
    };
    if (status === "rejected") payload.rejection_reason = reason;
    await base44.entities.Document.update(id, payload);
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, ...payload } : d)));
    toast({ title: `Document ${status}` });
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
            const status = doc.verification_status || "pending";
            const tone = status === "approved" ? "bg-emerald-500/15 text-emerald-400" : status === "rejected" ? "bg-rose-500/15 text-destructive" : "bg-amber-500/15 text-amber-400";
            return (
              <div key={doc.id} className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{DOC_TYPE_LABELS[doc.document_type] || doc.document_type}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${tone}`}>{status}</span>
                </div>
                {doc.document_number && <p className="text-xs text-muted-foreground">Doc #: {doc.document_number}</p>}
                {doc.front_image_url && (
                  <img src={doc.front_image_url} alt={doc.document_type} className="w-full h-24 object-cover rounded-lg border border-border" />
                )}
                {doc.rejection_reason && <p className="text-xs text-destructive">Reason: {doc.rejection_reason}</p>}
                {status !== "approved" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateStatus(doc.id, "approved")}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 font-medium"
                    >
                      <ShieldCheck className="w-3 h-3" /> Approve
                    </button>
                    {status !== "rejected" && (
                      <button
                        onClick={() => {
                          const reason = prompt("Rejection reason:");
                          if (reason) updateStatus(doc.id, "rejected", reason);
                        }}
                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-rose-500/15 text-destructive hover:bg-rose-500/25 font-medium"
                      >
                        <ShieldX className="w-3 h-3" /> Reject
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm ? (
        <div className="rounded-xl border border-border p-4 space-y-4">
          <div className="space-y-1.5">
            <Label>Document type</Label>
            <Select value={form.docType} onValueChange={(v) => setForm({ ...form, docType: v })}>
              <SelectTrigger><SelectValue placeholder="Select document type" /></SelectTrigger>
              <SelectContent>
                {DOC_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="docNum">Document number</Label>
              <Input id="docNum" value={form.docNumber} onChange={(e) => setForm({ ...form, docNumber: e.target.value })} placeholder="e.g. D123-4567" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="docExp">Expiry date</Label>
              <Input id="docExp" type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
            </div>
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