import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { logAudit } from "@/lib/audit";
import PlanRequestCard from "@/components/members/PlanRequestCard";
import { UserPlus, Check } from "lucide-react";
import { getCountryPref, getCurrencyPref } from "@/lib/countryPref";

const stripCc = (v) => (v || "").replace(/^\+\d{1,3}/, "");

const STEPS = ["Create account", "Join your Chit", "Verification"];

export default function MemberOnboardingWizard({ user, profile: initialProfile, startStep = 1, onDone }) {
  const [step, setStep] = useState(startStep);
  const [profile, setProfile] = useState(initialProfile || null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Country is decided once, at the ?country=CA entry point (see Home.jsx) —
  // read here rather than hardcoded so this whole wizard follows whichever
  // country the visitor actually picked.
  const isCanada = getCountryPref() === "CA";
  const CC = isCanada ? "+1" : "+91";
  const flag = isCanada ? "🇨🇦" : "🇮🇳";

  const [form, setForm] = useState({
    full_name: initialProfile?.full_name || user?.full_name || "",
    mobile: stripCc(initialProfile?.mobile) || "",
    email: initialProfile?.email || user?.email || "",
    dob: initialProfile?.dob || "",
    gender: initialProfile?.gender || "female",
    address: initialProfile?.address || "",
    city: initialProfile?.city || "",
    state: initialProfile?.state || "",
    pin_code: initialProfile?.pin_code || "",
    province: initialProfile?.province || "",
    postal_code: initialProfile?.postal_code || "",
    aadhaar_number: initialProfile?.aadhaar_number || "",
    pan_number: initialProfile?.pan_number || "",
    guarantor_name: initialProfile?.guarantor_name || "",
    guarantor_mobile: stripCc(initialProfile?.guarantor_mobile) || "",
    guarantor_relationship: initialProfile?.guarantor_relationship || "",
    guarantor_email: initialProfile?.guarantor_email || "",
  });

  useEffect(() => {
    if (!initialProfile && user) {
      setForm((f) => ({ ...f, full_name: f.full_name || user.full_name || "", email: f.email || user.email || "" }));
    }
  }, [user, initialProfile]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submitStep1 = async () => {
    if (!form.full_name) return toast({ title: "Full name is required", variant: "destructive" });
    if (!form.mobile) return toast({ title: "WhatsApp number is required", variant: "destructive" });
    setSaving(true);
    try {
      // member_code is assigned server-side (DB trigger + sequence) — a
      // client-computed "next code" is unreliable here since a brand-new
      // registrant can't see other members' rows under RLS yet, so it
      // would always compute "first ever" and collide.
      const created = await base44.entities.MemberProfile.create({
        user_id: user.id,
        full_name: form.full_name,
        mobile: `${CC}${stripCc(form.mobile)}`,
        email: form.email || user.email,
        country: isCanada ? "Canada" : "India",
        kyc_stage: "registration",
        kyc_status: "pending",
        gender: form.gender || "female",
      });
      logAudit({ module: "Members", action: "self-register", record_id: created.id, details: `${created.full_name} created their account` });
      const phoneNumber = `${CC}${stripCc(form.mobile)}`;
      console.log("📱 Sending registration_welcome_v2 to:", phoneNumber);
      import("@/lib/sendWhatsAppMessage").then(({ sendWhatsAppMessage }) => {
        sendWhatsAppMessage({
          phone: phoneNumber,
          templateName: "registration_welcome_v2",
          parameters: [created.full_name],
        }).then((res) => {
          console.log("✅ Registration welcome sent:", res);
        }).catch((err) => {
          console.error("❌ Registration welcome WhatsApp notification failed:", err);
        });
      });
      setProfile(created);
      setStep(2);
    } catch (e) {
      toast({ title: "Could not create your account", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const submitStep3 = async () => {
    if (!form.guarantor_name || !form.guarantor_mobile || !form.guarantor_relationship) {
      return toast({ title: "Guarantor name, phone, and relationship are required", variant: "destructive" });
    }
    setSaving(true);
    try {
      await base44.entities.MemberProfile.update(profile.id, {
        dob: form.dob,
        gender: form.gender || "female",
        address: form.address,
        city: form.city,
        state: isCanada ? "" : form.state,
        pin_code: isCanada ? "" : form.pin_code,
        province: isCanada ? form.province : "",
        postal_code: isCanada ? form.postal_code : "",
        aadhaar_number: isCanada ? "" : form.aadhaar_number,
        pan_number: isCanada ? "" : form.pan_number,
        guarantor_name: form.guarantor_name,
        guarantor_mobile: `${CC}${stripCc(form.guarantor_mobile)}`,
        guarantor_relationship: form.guarantor_relationship,
        guarantor_email: form.guarantor_email,
        kyc_stage: "document_upload",
      });
      logAudit({ module: "Members", action: "self-verify", record_id: profile.id, details: `${form.full_name || profile.full_name} completed self-service verification` });
      toast({ title: "Profile complete!", description: "Welcome to CashBox." });
      onDone();
    } catch (e) {
      toast({ title: "Could not save your details", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-3">
          <UserPlus className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground">
          {step === 1 ? "Create your account" : step === 2 ? "Join your Chit" : "Complete your verification"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Step {step} of 3 — {STEPS[step - 1]}</p>
        <div className="flex gap-1.5 mt-4 max-w-[240px] mx-auto">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
      </div>

      {step === 1 && (
        <div className="bg-card rounded-2xl border border-border p-4 sm:p-6 space-y-4">
          <div>
            <Label>Full name *</Label>
            <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Your full name" autoFocus />
          </div>
          <div>
            <Label>WhatsApp number *</Label>
            <div className="flex gap-2">
              <span className="shrink-0 w-[72px] h-10 rounded-md border border-border bg-muted grid place-items-center text-sm text-muted-foreground">{CC} {flag}</span>
              <Input value={form.mobile} onChange={(e) => set("mobile", e.target.value)} placeholder={isCanada ? "416 555 0123" : "98765 43210"} className="flex-1" />
            </div>
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com (optional)" />
          </div>
          <Button onClick={submitStep1} disabled={saving} className="w-full rounded-full bg-primary hover:bg-primary/90">
            {saving ? "Saving…" : "Continue"}
          </Button>
        </div>
      )}

      {step === 2 && (
        <Step2 user={user} profile={profile} onNext={() => setStep(3)} />
      )}

      {step === 3 && (
        <div className="bg-card rounded-2xl border border-border p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Date of birth</Label>
              <Input type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} />
            </div>
            <div>
              <Label>Gender</Label>
              <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Street address" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Your city" />
            </div>
            {isCanada ? (
              <div>
                <Label>Province</Label>
                <Input value={form.province} onChange={(e) => set("province", e.target.value)} placeholder="Ontario" />
              </div>
            ) : (
              <div>
                <Label>State</Label>
                <Input value={form.state} onChange={(e) => set("state", e.target.value)} placeholder="Kerala" />
              </div>
            )}
          </div>

          {isCanada ? (
            <div>
              <Label>Postal code</Label>
              <Input value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} placeholder="M5V 2T6" />
            </div>
          ) : (
            <div>
              <Label>PIN code</Label>
              <Input value={form.pin_code} onChange={(e) => set("pin_code", e.target.value)} placeholder="686001" />
            </div>
          )}

          {!isCanada && (
            <div className="pt-2 border-t border-border">
              <p className="text-sm font-medium text-foreground mb-3">Identity</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Aadhaar number</Label>
                  <Input value={form.aadhaar_number} onChange={(e) => set("aadhaar_number", e.target.value)} placeholder="1234 5678 9012" />
                </div>
                <div>
                  <Label>PAN number</Label>
                  <Input value={form.pan_number} onChange={(e) => set("pan_number", e.target.value)} placeholder="ABCDE1234F" />
                </div>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-border">
            <p className="text-sm font-medium text-foreground mb-3">Guarantor details *</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Guarantor name</Label>
                <Input value={form.guarantor_name} onChange={(e) => set("guarantor_name", e.target.value)} placeholder="Guarantor full name" />
              </div>
              <div>
                <Label>Relationship</Label>
                <Input value={form.guarantor_relationship} onChange={(e) => set("guarantor_relationship", e.target.value)} placeholder="Spouse, Parent, Sibling…" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div>
                <Label>Guarantor phone *</Label>
                <div className="flex gap-2">
                  <span className="shrink-0 w-[72px] h-10 rounded-md border border-border bg-muted grid place-items-center text-sm text-muted-foreground">{CC} {flag}</span>
                  <Input value={form.guarantor_mobile} onChange={(e) => set("guarantor_mobile", e.target.value)} placeholder={isCanada ? "416 555 0123" : "98765 43210"} className="flex-1" />
                </div>
              </div>
              <div>
                <Label>Guarantor email</Label>
                <Input type="email" value={form.guarantor_email} onChange={(e) => set("guarantor_email", e.target.value)} placeholder="guarantor@email.com" />
              </div>
            </div>
          </div>

          <Button onClick={submitStep3} disabled={saving} className="w-full rounded-full bg-primary hover:bg-primary/90">
            {saving ? "Saving…" : "Complete"}
          </Button>
        </div>
      )}
    </div>
  );
}

function Step2({ user, profile, onNext }) {
  const [plans, setPlans] = useState(null);
  // Same currency-scoping BrowsePlans.jsx already does — a Canada member
  // shouldn't be offered INR plans mixed in here.
  const currencyFilter = getCurrencyPref();

  useEffect(() => {
    base44.entities.ChitPlan.filter({ status: "active" }).then(setPlans).catch(() => setPlans([]));
  }, []);

  const filteredPlans = plans && currencyFilter !== "all"
    ? plans.filter((p) => (p.currency || "INR") === currencyFilter)
    : plans;

  return (
    <div className="space-y-4">
      {filteredPlans === null ? (
        <div className="h-32 grid place-items-center text-muted-foreground text-sm">Loading plans…</div>
      ) : filteredPlans.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">
          No active plans available right now — you can browse later from your dashboard.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {filteredPlans.map((plan) => (
            <PlanRequestCard key={plan.id} plan={plan} user={user} memberProfile={profile} />
          ))}
        </div>
      )}
      <div className="flex items-center justify-between pt-1">
        <button onClick={onNext} className="text-sm text-muted-foreground hover:text-foreground">
          Browse plans later, skip for now →
        </button>
        <Button onClick={onNext} className="rounded-full bg-primary hover:bg-primary/90">
          <Check className="w-4 h-4 mr-1" /> Continue
        </Button>
      </div>
    </div>
  );
}
