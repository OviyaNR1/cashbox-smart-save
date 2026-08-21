import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { formatMoney } from "@/lib/currency";
import { CheckCircle2, Trophy, Coins, FileText, UserPlus } from "lucide-react";

const KIND = {
  registration: { icon: UserPlus, tone: "text-muted-foreground" },
  payment: { icon: CheckCircle2, tone: "text-emerald-400" },
  winner: { icon: Trophy, tone: "text-primary" },
  dividend: { icon: Coins, tone: "text-primary" },
  document: { icon: FileText, tone: "text-muted-foreground" },
};

export default function MemberTimeline({ member }) {
  const [events, setEvents] = useState(null);

  useEffect(() => {
    if (!member?.id) return;
    (async () => {
      const [payments, winners, dividends, documents] = await Promise.all([
        base44.entities.Payment.filter({ member_profile_id: member.id }).catch(() => []),
        base44.entities.Winner.filter({ member_profile_id: member.id }).catch(() => []),
        base44.entities.Dividend.filter({ member_profile_id: member.id }).catch(() => []),
        base44.entities.Document.filter({ member_profile_id: member.id }).catch(() => []),
      ]);
      const cur = member.currency || "INR";

      const feed = [
        member.created_at && {
          kind: "registration",
          date: member.created_at,
          title: "Registered",
          detail: member.member_code ? `Member code ${member.member_code}` : null,
        },
        ...payments.map((p) => ({
          kind: "payment",
          date: p.payment_date || p.created_at,
          title: `Payment — installment #${p.installment_number || "—"}`,
          detail: `${formatMoney(p.amount, p.currency || cur)} · ${(p.method || "").replace("_", " ")} · ${p.status}`,
        })),
        ...winners.map((w) => ({
          kind: "winner",
          date: w.announcement_date || w.created_at,
          title: `Won Month ${w.month_number}`,
          detail: formatMoney(w.prize_amount, cur),
        })),
        ...dividends.map((d) => ({
          kind: "dividend",
          date: d.created_at,
          title: `Dividend — month ${d.month_number}`,
          detail: `${formatMoney(d.amount, cur)} · ${d.status}`,
        })),
        ...documents.map((d) => ({
          kind: "document",
          date: d.created_at,
          title: `Document — ${(d.document_type || "").replace(/_/g, " ")}`,
          detail: d.verification_status,
        })),
      ].filter(Boolean).filter((e) => e.date);

      feed.sort((a, b) => new Date(b.date) - new Date(a.date));
      setEvents(feed);
    })();
  }, [member?.id, member?.created_at, member?.member_code, member?.currency]);

  if (events === null) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading timeline…</div>;
  }
  if (events.length === 0) {
    return <div className="py-8 text-center text-sm text-muted-foreground">No activity recorded yet.</div>;
  }

  return (
    <div className="space-y-1">
      {events.map((e, i) => {
        const { icon: Icon, tone } = KIND[e.kind];
        return (
          <div key={i} className="flex items-start gap-3 px-2 py-2.5 border-b border-border/50 last:border-0">
            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${tone}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">{e.title}</p>
              {e.detail && <p className="text-xs text-muted-foreground">{e.detail}</p>}
            </div>
            <p className="text-xs text-muted-foreground shrink-0">{new Date(e.date).toLocaleDateString()}</p>
          </div>
        );
      })}
    </div>
  );
}
