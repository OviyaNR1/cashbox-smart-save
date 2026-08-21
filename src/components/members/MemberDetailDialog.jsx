import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  Phone, Mail, MapPin, Briefcase, Banknote, AlertTriangle,
  ShieldCheck, ShieldX, ChevronRight, Ban, Pencil,
} from "lucide-react";
import MemberDocuments from "./MemberDocuments";
import MemberOnboardingForm from "./MemberOnboardingForm";
import MemberGroupAssignment from "./MemberGroupAssignment";
import MemberTimeline from "./MemberTimeline";
import { KYC_STAGES, KYC_STAGE_ORDER } from "@/lib/canada";
import { logAudit } from "@/lib/audit";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function MemberDetailDialog({ member, onClose, onUpdated }) {
  const [editOpen, setEditOpen] = useState(false);
  const { toast } = useToast();

  if (!member) return null;

  const stage = member.kyc_stage || "registration";
  const stageIdx = KYC_STAGE_ORDER.indexOf(stage);
  const canAdvance = stageIdx >= 0 && stageIdx < KYC_STAGE_ORDER.length - 1;

  const advance = async () => {
    const next = KYC_STAGE_ORDER[stageIdx + 1];
    const payload = { kyc_stage: next };
    if (next === "approved") payload.kyc_status = "approved";
    await base44.entities.MemberProfile.update(member.id, payload);
    logAudit({ module: "Members", action: "kyc-advance", record_id: member.id, details: `Advanced ${member.full_name || "member"}'s KYC to "${next}"` });
    toast({ title: `KYC advanced to ${KYC_STAGES.find((s) => s.value === next)?.label}` });
    onUpdated({ ...member, ...payload });
  };

  const reject = async () => {
    const reason = prompt("Rejection reason:");
    if (!reason) return;
    const payload = { kyc_stage: "rejected", kyc_status: "rejected", kyc_rejection_reason: reason };
    await base44.entities.MemberProfile.update(member.id, payload);
    logAudit({ module: "Members", action: "kyc-reject", record_id: member.id, details: `Rejected ${member.full_name || "member"}'s KYC: ${reason}` });
    toast({ title: "KYC rejected" });
    onUpdated({ ...member, ...payload });
  };

  const updateGuarantor = async (status) => {
    await base44.entities.MemberProfile.update(member.id, { guarantor_status: status });
    logAudit({ module: "Members", action: "guarantor-status", record_id: member.id, details: `Set ${member.full_name || "member"}'s guarantor status to "${status}"` });
    toast({ title: `Guarantor ${status}` });
    onUpdated({ ...member, guarantor_status: status });
  };

  const stageLabel = KYC_STAGES.find((s) => s.value === stage)?.label || stage;
  const stageTone = stage === "approved" ? "bg-emerald-500/15 text-emerald-400"
    : stage === "rejected" ? "bg-rose-500/15 text-rose-400"
    : "bg-amber-500/15 text-amber-400";

  return (
    <>
      <Dialog open={!!member} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-primary/5 grid place-items-center text-base font-medium text-foreground">
                {(member.full_name || "?").charAt(0)}
              </span>
              <div className="flex-1">
                <p>{member.full_name}</p>
                <p className="text-xs text-muted-foreground font-normal">{member.member_code || "No code"}</p>
              </div>
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setEditOpen(true)}>
                <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center justify-between gap-2 rounded-xl bg-muted p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">KYC Stage</span>
              <span className={`text-xs px-2.5 py-1 rounded-full ${stageTone}`}>{stageLabel}</span>
            </div>
            <div className="flex gap-2">
              {canAdvance && (
                <button onClick={advance} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 font-medium">
                  {KYC_STAGE_ORDER[stageIdx + 1] === "approved" ? (
                    <><ShieldCheck className="w-3.5 h-3.5" /> Approve</>
                  ) : (
                    <>Advance <ChevronRight className="w-3.5 h-3.5" /></>
                  )}
                </button>
              )}
              {stage !== "rejected" && stage !== "approved" && (
                <button onClick={reject} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-rose-500/15 text-destructive hover:bg-rose-500/25 font-medium">
                  <Ban className="w-3.5 h-3.5" /> Reject
                </button>
              )}
            </div>
          </div>
          {member.kyc_rejection_reason && (
            <div className="flex items-center gap-2 text-xs text-destructive px-1">
              <AlertTriangle className="w-3.5 h-3.5" /> {member.kyc_rejection_reason}
            </div>
          )}

          <Tabs defaultValue="profile" className="w-full">
            <TabsList className="bg-muted">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
            </TabsList>

            <TabsContent value="timeline">
              <MemberTimeline member={member} />
            </TabsContent>

            <TabsContent value="profile">
          <div className="space-y-4">
            <Section title="Contact">
              <Row icon={Phone} label="Mobile" value={member.mobile} />
              <Row icon={Mail} label="Email" value={member.email} />
              <Row icon={MapPin} label="Address" value={[member.address, member.city, member.state, member.pin_code, member.province, member.postal_code].filter(Boolean).join(", ") || "—"} />
              {member.preferred_language && <Row label="Language" value={member.preferred_language} />}
            </Section>

            {(member.employer_name || member.employment_status) && (
              <Section title="Employment">
                <Row icon={Briefcase} label="Employer" value={member.employer_name} />
                <Row label="Status" value={member.employment_status} />
                <Row label="Occupation" value={member.occupation} />
                <Row label="Income range" value={member.annual_income_range} />
              </Section>
            )}

            {(member.aadhaar_number || member.pan_number) && (
              <Section title="Identity">
                <Row label="Aadhaar" value={member.aadhaar_number} />
                <Row label="PAN" value={member.pan_number} />
              </Section>
            )}

            {(member.bank_institution_name || member.transit_number) && (
              <Section title="Banking">
                <Row icon={Banknote} label="Institution" value={member.bank_institution_name} />
                <Row label="Transit #" value={member.transit_number} />
                <Row label="Institution #" value={member.institution_number} />
                <Row label="Holder" value={member.account_holder_name} />
              </Section>
            )}

            {(member.bank_name || member.bank_account_number) && (
              <Section title="Banking">
                <Row icon={Banknote} label="Bank" value={member.bank_name} />
                <Row label="Account #" value={member.bank_account_number} />
                <Row label="IFSC" value={member.ifsc_code} />
                <Row label="Holder" value={member.bank_account_holder} />
              </Section>
            )}

            {member.emergency_contact_name && (
              <Section title="Emergency Contact">
                <Row label="Name" value={member.emergency_contact_name} />
                <Row label="Relationship" value={member.emergency_contact_relationship} />
                <Row label="Phone" value={member.emergency_contact_phone} />
                <Row label="Email" value={member.emergency_contact_email} />
              </Section>
            )}

            {member.guarantor_name && (
              <Section title="Guarantor">
                <Row label="Name" value={member.guarantor_name} />
                <Row label="Relationship" value={member.guarantor_relationship} />
                <Row label="Phone" value={member.guarantor_mobile} />
                <Row label="Email" value={member.guarantor_email} />
                <Row label="Address" value={member.guarantor_address} />
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className={`text-xs px-2.5 py-1 rounded-full ${
                    member.guarantor_status === "verified" ? "bg-emerald-500/15 text-emerald-400" :
                    member.guarantor_status === "rejected" ? "bg-rose-500/15 text-destructive" :
                    "bg-amber-500/15 text-amber-400"
                  }`}>{member.guarantor_status || "pending"}</span>
                  {member.guarantor_status !== "verified" && (
                    <div className="flex gap-2">
                      <button onClick={() => updateGuarantor("verified")} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 font-medium">
                        <ShieldCheck className="w-3 h-3" /> Verify
                      </button>
                      {member.guarantor_status !== "rejected" && (
                        <button onClick={() => updateGuarantor("rejected")} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-rose-500/15 text-destructive hover:bg-rose-500/25 font-medium">
                          <ShieldX className="w-3 h-3" /> Reject
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </Section>
            )}

            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Groups &amp; Chit Plans</p>
              <MemberGroupAssignment member={member} onUpdated={onUpdated} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Documents</p>
              <MemberDocuments memberProfileId={member.id} />
            </div>
          </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <MemberOnboardingForm
        open={editOpen}
        member={member}
        onClose={() => setEditOpen(false)}
        onSaved={async () => {
          setEditOpen(false);
          const fresh = await base44.entities.MemberProfile.get(member.id);
          onUpdated(fresh);
        }}
      />
    </>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{title}</p>
      <div className="rounded-xl border border-border divide-y divide-border/50">{children}</div>
    </div>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      {Icon && <Icon className="w-4 h-4 text-muted-foreground/60 mt-0.5 shrink-0" />}
      <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
      <span className="text-sm text-foreground break-all">{value || "—"}</span>
    </div>
  );
}