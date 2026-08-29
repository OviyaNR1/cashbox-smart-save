import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  User, Phone, Mail, MapPin, Users as UsersIcon, CheckCircle2, Clock, XCircle, FileText, LogOut,
} from "lucide-react";
import MemberDocumentUpload from "@/components/members/MemberDocumentUpload";

const kycTone = (status) => {
  if (status === "approved") return { bg: "bg-emerald-500/15", text: "text-emerald-400", icon: CheckCircle2, label: "Verified" };
  if (status === "rejected") return { bg: "bg-rose-500/15", text: "text-rose-400", icon: XCircle, label: "Rejected" };
  return { bg: "bg-amber-500/15", text: "text-amber-400", icon: Clock, label: "Pending review" };
};

export default function MyProfile() {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        const profiles = await base44.entities.MemberProfile.filter({ user_id: me.id });
        setState({ loading: false, data: { me, profile: profiles[0] } });
      } catch (err) {
        setState({ loading: false, error: err.message || String(err) });
      }
    })();
  }, []);

  if (state.loading)
    return <div className="h-64 grid place-items-center text-muted-foreground text-sm">Loading your profile…</div>;
  if (state.error)
    return <div className="h-64 grid place-items-center text-destructive text-sm text-center px-4">Error: {state.error}</div>;

  const { me, profile } = state.data;

  if (!profile)
    return (
      <div className="space-y-6">
        <Header />
        <div className="bg-card rounded-2xl border border-border p-8 text-center text-muted-foreground text-sm">
          Your profile hasn't been created yet. Please contact your administrator.
        </div>
      </div>
    );

  const kyc = kycTone(profile.kyc_status);
  const KycIcon = kyc.icon;

  return (
    <div className="space-y-6">
      <Header />
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="bg-gradient-to-r from-card to-muted px-6 py-8 border-b border-border">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">{profile.full_name}</h2>
              <p className="text-sm text-muted-foreground">{profile.email || me.email}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {profile.member_code || "—"} · {profile.country || "India"}
              </p>
            </div>
          </div>
        </div>
        <div className="px-6 py-4">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${kyc.bg} ${kyc.text}`}>
            <KycIcon className="w-3.5 h-3.5" /> Verification: {kyc.label}
          </span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <SectionCard title="Contact Details" icon={User}>
          <Row icon={Mail} label="Email" value={profile.email || me.email || "—"} />
          <Row icon={Phone} label="Mobile" value={profile.mobile || "—"} />
          <Row icon={MapPin} label="Address" value={[profile.address, profile.city, profile.state].filter(Boolean).join(", ") || "—"} />
        </SectionCard>
        <SectionCard title="Guarantor" icon={UsersIcon}>
          <Row icon={User} label="Name" value={profile.guarantor_name || "—"} />
          <Row icon={UsersIcon} label="Relationship" value={profile.guarantor_relationship || "—"} />
        </SectionCard>
      </div>

      {profile.kyc_status === "rejected" && profile.kyc_rejection_reason && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
          <p className="text-sm font-medium text-rose-400">Verification Rejected</p>
          <p className="text-sm text-rose-400 mt-1">{profile.kyc_rejection_reason}</p>
        </div>
      )}

      <SectionCard title="Documents" icon={FileText}>
        <p className="text-xs text-muted-foreground mb-3">
          Upload your identity documents (ID, selfie, etc.) for verification. Each document is reviewed by an administrator.
        </p>
        <MemberDocumentUpload memberProfileId={profile.id} />
      </SectionCard>

      {/* The sidebar has its own sign-out icon, but it's unlabeled and easy
          to miss (especially on mobile, tucked behind the hamburger menu) —
          this page is where a member would naturally look for it instead. */}
      <button
        onClick={() => base44.auth.logout("/login")}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <LogOut className="w-4 h-4" /> Log out
      </button>
    </div>
  );
}

function Header() {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-primary">My account</p>
      <h1 className="text-3xl font-semibold text-foreground mt-1">Profile</h1>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children }) {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        <p className="text-sm font-medium text-foreground">{title}</p>
      </div>
      <div className="px-5 py-3 space-y-1">{children}</div>
    </div>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-sm text-foreground text-right max-w-[60%] break-words">{value}</p>
    </div>
  );
}
