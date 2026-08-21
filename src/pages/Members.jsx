import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Search, Users, UserPlus } from "lucide-react";
import MemberOnboardingForm from "@/components/members/MemberOnboardingForm";
import MemberDetailDialog from "@/components/members/MemberDetailDialog";
import { KYC_STAGES } from "@/lib/canada";
import { useAdminCountry } from "@/lib/AdminCountryContext";

export default function Members() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [kycFilter, setKycFilter] = useState("all");
  // Shared with every other admin page via the header dropdown — doesn't
  // reset when you navigate away, only when you change it yourself.
  const { country: countryFilter } = useAdminCountry();
  const [selected, setSelected] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    base44.entities.MemberProfile.list("-created_date", 500).then((p) => {
      setProfiles(p);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return profiles.filter((p) => {
      const stage = p.kyc_stage || "registration";
      const matchKyc = kycFilter === "all" || stage === kycFilter;
      const matchCountry = (p.country || "India") === countryFilter;
      const q = query.toLowerCase();
      const matchQuery = !q ||
        (p.full_name || "").toLowerCase().includes(q) ||
        (p.member_code || "").toLowerCase().includes(q) ||
        (p.mobile || "").toLowerCase().includes(q) ||
        (p.email || "").toLowerCase().includes(q) ||
        (p.branch || "").toLowerCase().includes(q);
      return matchKyc && matchCountry && matchQuery;
    });
  }, [profiles, query, kycFilter, countryFilter]);

  // Country-scoped but not further narrowed by the active KYC chip or search
  // — these are the summary totals for the whole selected market, not a
  // reflection of whatever sub-filter happens to be highlighted right now.
  const profilesInCountry = useMemo(
    () => profiles.filter((p) => (p.country || "India") === countryFilter),
    [profiles, countryFilter]
  );
  const stats = {
    total: profilesInCountry.length,
    pending: profilesInCountry.filter((p) => (p.kyc_stage || "registration") !== "approved" && (p.kyc_stage || "registration") !== "rejected").length,
    approved: profilesInCountry.filter((p) => p.kyc_stage === "approved").length,
    rejected: profilesInCountry.filter((p) => p.kyc_stage === "rejected").length,
  };

  const stageBadge = (stage) => {
    const s = stage || "registration";
    const tone = s === "approved" ? "bg-emerald-500/15 text-emerald-400" : s === "rejected" ? "bg-rose-500/15 text-rose-400" : "bg-amber-500/15 text-amber-400";
    const label = KYC_STAGES.find((k) => k.value === s)?.label || s;
    return { label, tone };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Admin</p>
          <h1 className="text-3xl font-semibold text-foreground mt-1">Members</h1>
        </div>
        <Button onClick={() => setFormOpen(true)} className="bg-primary hover:bg-primary/90 rounded-full">
          <UserPlus className="w-4 h-4 mr-1" /> Onboard member
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total members" value={stats.total} color="text-foreground" active={kycFilter === "all"} onClick={() => setKycFilter("all")} />
        <StatCard label="Pending KYC" value={stats.pending} color="text-amber-400" active={kycFilter === "registration"} onClick={() => setKycFilter("registration")} />
        <StatCard label="KYC approved" value={stats.approved} color="text-emerald-400" active={kycFilter === "approved"} onClick={() => setKycFilter("approved")} />
        <StatCard label="Rejected" value={stats.rejected} color="text-rose-400" active={kycFilter === "rejected"} onClick={() => setKycFilter("rejected")} />
      </div>

      <div className="bg-card rounded-2xl border border-border p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, code, mobile, email…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <FilterChip label="All" active={kycFilter === "all"} onClick={() => setKycFilter("all")} />
          <FilterChip label="Pending" active={kycFilter === "registration"} onClick={() => setKycFilter("registration")} />
          <FilterChip label="Approved" active={kycFilter === "approved"} onClick={() => setKycFilter("approved")} />
          <FilterChip label="Rejected" active={kycFilter === "rejected"} onClick={() => setKycFilter("rejected")} />
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <Users className="w-6 h-6 mx-auto mb-2 animate-pulse text-muted-foreground/60" />
            Loading members…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No members match your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/70 text-muted-foreground text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-5 py-3">Member</th>
                  <th className="text-left px-5 py-3">Contact</th>
                  <th className="text-left px-5 py-3 hidden sm:table-cell">Branch</th>
                  <th className="text-right px-5 py-3">KYC Stage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => {
                  const badge = stageBadge(p.kyc_stage);
                  return (
                    <tr key={p.id} onClick={() => setSelected(p)} className="cursor-pointer hover:bg-muted/50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="w-9 h-9 rounded-full bg-primary/5 grid place-items-center text-sm font-medium text-foreground">
                            {(p.full_name || "?").charAt(0)}
                          </span>
                          <div>
                            <p className="text-foreground font-medium">{p.full_name || "—"}</p>
                            <p className="text-xs text-muted-foreground">{p.member_code || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        <p>{p.mobile || "—"}</p>
                        <p className="text-xs text-muted-foreground">{p.email || ""}</p>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground hidden sm:table-cell">{p.branch || "—"}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={`text-xs px-2.5 py-1 rounded-full ${badge.tone}`}>{badge.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <MemberOnboardingForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={load}
      />

      <MemberDetailDialog
        member={selected}
        onClose={() => setSelected(null)}
        onUpdated={(updated) => {
          if (!updated) return;
          setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          setSelected(updated);
        }}
      />
    </div>
  );
}

function StatCard({ label, value, color, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`text-left bg-card rounded-2xl border p-5 transition-colors ${
        active ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-primary/30"
      }`}
    >
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${color}`}>{value}</p>
    </button>
  );
}

function FilterChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm transition-colors ${
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
      }`}
    >
      {label}
    </button>
  );
}