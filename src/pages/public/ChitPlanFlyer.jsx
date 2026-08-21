import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { generateAuctionPlan } from "@/lib/auctionEngine";
import { generateLakhBoxPlan } from "@/lib/lakhboxEngine";
import { getStartingAmount } from "@/lib/liveAuctionEngine";
import { formatMoney } from "@/lib/currency";
import { usePublicCurrency } from "@/lib/publicCurrency";
import {
  PiggyBank,
  Users,
  TrendingUp,
  Target,
  ShieldCheck,
  Calendar,
  Award,
  Crown,
  Phone,
  MapPin,
  ArrowRight,
  Mail,
} from "lucide-react";

const features = [
  { icon: PiggyBank, title: "Safe & Reliable" },
  { icon: Users, title: "Flexible Plans" },
  { icon: TrendingUp, title: "Attractive Returns" },
  { icon: Target, title: "Discipline Today, Wealth Tomorrow" },
];

const footerBadges = [
  { icon: ShieldCheck, label: "Regular Savings" },
  { icon: Calendar, label: "Flexible Duration" },
  { icon: Award, label: "High Returns" },
  { icon: ShieldCheck, label: "Trusted Process" },
];

export default function ChitPlanFlyer() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const { currency: selectedCurrency } = usePublicCurrency();

  useEffect(() => {
    base44.auth.isAuthenticated().then(setAuthed).catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    setLoading(true);
    base44.entities.ChitPlan.list("-created_date", 50)
      .then((all) => {
        const active = all.filter((p) => p.status === "active");
        const matching =
          selectedCurrency !== "all"
            ? active.filter((p) => (p.currency || "INR") === selectedCurrency)
            : active;
        const withResults = matching.map((p) => ({
          plan: p,
          result: p.model === "lakhbox" ? generateLakhBoxPlan(p) : p.model === "live_auction" ? null : generateAuctionPlan(p, null),
        }));
        setPlans(withResults);
      })
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, [selectedCurrency]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#080816] via-[#0d0d24] to-[#080816] text-white">
      {/* Header */}
      <header className="relative overflow-hidden border-b border-amber-500/20">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(212,175,55,0.12),transparent_70%)]" />
        <div className="relative max-w-5xl mx-auto px-4 py-10 md:py-14 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="hidden md:flex items-center">
            <span className="px-5 py-2 rounded-full border-2 border-amber-400/60 text-amber-300 text-xs font-semibold tracking-widest">
              YOUR TRUST • OUR PROMISE
            </span>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="flex items-center gap-2 mb-1">
              <Crown className="w-7 h-7 text-amber-400" />
            </div>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
              <span className="bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 bg-clip-text text-transparent drop-shadow-[0_2px_8px_rgba(212,175,55,0.3)]">
                CashBox
              </span>
            </h1>
            <p className="mt-3 text-xs md:text-sm text-white/80 tracking-[0.25em] uppercase">
              Smart Saving • Sure Growth • Secure Future
            </p>
            <div className="mt-4 px-6 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 rounded-full text-[#080816] text-xs font-bold tracking-wide">
              DISCIPLINE TODAY • WEALTH TOMORROW
            </div>
          </div>

          <div className="hidden md:block">
            <div className="w-28 h-28 rounded-full border-2 border-amber-400/60 flex items-center justify-center text-center p-3">
              <span className="text-amber-300 text-[10px] font-semibold leading-tight tracking-wider">
                BUILD YOUR DREAMS STEP BY STEP WITH CASHBOX
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Feature Icons */}
      <section className="max-w-5xl mx-auto px-4 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {features.map((f) => (
            <div key={f.title} className="flex flex-col items-center text-center">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-amber-300 to-amber-600 flex items-center justify-center mb-3 shadow-lg shadow-amber-500/20">
                <f.icon className="w-7 h-7 md:w-9 md:h-9 text-[#080816]" />
              </div>
              <p className="text-xs md:text-sm font-semibold text-white/90 tracking-wide">
                {f.title.toUpperCase()}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Plan Tables */}
      <section className="max-w-4xl mx-auto px-4 py-6 space-y-10">
        {loading && (
          <p className="text-center text-white/60 py-8">Loading plans…</p>
        )}
        {!loading && plans.length === 0 && (
          <p className="text-center text-white/60 py-8">No active plans available right now. Please check back soon.</p>
        )}
        {plans.map(({ plan, result }) => {
          const cur = plan.currency || "INR";
          const fmt = (amt) => formatMoney(amt, cur);
          const sym = cur === "CAD" ? "$" : "₹";
          return (
            <div key={plan.id}>
              <div className="text-center mb-4">
                <h2 className="text-2xl md:text-3xl font-bold text-amber-400 tracking-wide">
                  {plan.plan_name} — SAVINGS SCHEDULE
                </h2>
                <p className="text-white/60 text-sm mt-1">
                  {plan.duration_months || 20}-Month savings schedule
                </p>
              </div>

              <div className="rounded-2xl overflow-hidden border border-amber-500/30 shadow-2xl">
                <div className="overflow-x-auto">
                  {plan.model === "live_auction" ? (
                    <div className="bg-[#FFF8E7] text-[#1a1a2e] p-6 grid grid-cols-2 sm:grid-cols-3 gap-6 text-center">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-500">Chit Amount</p>
                        <p className="text-xl font-bold text-amber-700">{fmt(plan.chit_amount)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-500">Members</p>
                        <p className="text-xl font-bold text-amber-700">{plan.member_count}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-500">Duration</p>
                        <p className="text-xl font-bold text-amber-700">{plan.duration_months} Months</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-500">Monthly Installment</p>
                        <p className="text-xl font-bold text-amber-700">{fmt(plan.monthly_contribution)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-500">Starting Auction Amount</p>
                        <p className="text-xl font-bold text-amber-700">{fmt(getStartingAmount(plan))}</p>
                      </div>
                      <div className="col-span-2 sm:col-span-1 flex items-center justify-center">
                        <Link
                          to={authed ? "/browse-plans" : "/register"}
                          className="px-4 py-2 rounded-full bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold tracking-wide transition-colors"
                        >
                          {authed ? "Join this plan" : "Register to join"}
                        </Link>
                      </div>
                    </div>
                  ) : plan.model === "lakhbox" ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gradient-to-r from-amber-700 via-amber-600 to-amber-700 text-white">
                          <th className="text-left px-4 py-3 font-semibold tracking-wider text-xs uppercase">Month</th>
                          <th className="text-left px-4 py-3 font-semibold tracking-wider text-xs uppercase">Winner</th>
                          <th className="text-right px-4 py-3 font-semibold tracking-wider text-xs uppercase">Winner Payout ({sym})</th>
                          <th className="text-right px-4 py-3 font-semibold tracking-wider text-xs uppercase">Member Monthly Payment ({sym})</th>
                          <th className="text-right px-4 py-3 font-semibold tracking-wider text-xs uppercase">Premium / Bonus ({sym})</th>
                        </tr>
                      </thead>
                      <tbody className="bg-[#FFF8E7] text-[#1a1a2e]">
                        {result?.monthlySummary.map((row, idx) => (
                          <tr
                            key={row.month}
                            className={idx % 2 === 0 ? "bg-[#FFF8E7]" : "bg-[#F5EFD8]"}
                          >
                            <td className="px-4 py-2.5 font-medium text-slate-700">{row.month}</td>
                            <td className="px-4 py-2.5 font-semibold">{row.winnerLabel}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmt(row.winnerPayout)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{fmt(row.memberMonthlyPayment)}</td>
                            <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${row.profitLoss >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                              {row.profitLoss >= 0 ? "+" : ""}{fmt(row.profitLoss)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gradient-to-r from-amber-700 via-amber-600 to-amber-700 text-white">
                          <th className="text-left px-4 py-3 font-semibold tracking-wider text-xs uppercase">S. No.</th>
                          <th className="text-right px-4 py-3 font-semibold tracking-wider text-xs uppercase">Chit Amount ({sym})</th>
                          <th className="text-right px-4 py-3 font-semibold tracking-wider text-xs uppercase">Payment / Member ({sym})</th>
                          <th className="text-right px-4 py-3 font-semibold tracking-wider text-xs uppercase">Dividend / Member ({sym})</th>
                        </tr>
                      </thead>
                      <tbody className="bg-[#FFF8E7] text-[#1a1a2e]">
                        {result?.monthlySummary.map((row, idx) => (
                          <tr
                            key={row.month}
                            className={idx % 2 === 0 ? "bg-[#FFF8E7]" : "bg-[#F5EFD8]"}
                          >
                            <td className="px-4 py-2.5 font-medium text-slate-700">{row.month}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmt(row.winningBid)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{fmt(row.monthlyPayment)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                              {row.dividendPerMember > 0 ? fmt(row.dividendPerMember) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {plan.model !== "live_auction" && (
                <div className="mt-4 flex justify-center">
                  <Link
                    to={authed ? "/browse-plans" : "/register"}
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-[#080816] font-bold rounded-full px-6 py-2.5 text-sm"
                  >
                    {authed ? "Join this plan" : "Register to join"} <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Footer Badges */}
      <section className="max-w-5xl mx-auto px-4 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {footerBadges.map((b) => (
            <div
              key={b.label}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-amber-500/30 bg-white/5 backdrop-blur"
            >
              <b.icon className="w-6 h-6 text-amber-400" />
              <span className="text-xs font-semibold tracking-wider text-white/90">
                {b.label.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Contact Strip */}
      <section className="border-t border-amber-500/20">
        <div className="max-w-4xl mx-auto px-4 py-10 text-center">
          <h3 className="text-lg md:text-xl font-bold text-amber-400 mb-6">
            JOIN CASHBOX TODAY AND TAKE A STEP TOWARDS A BETTER TOMORROW!
          </h3>
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 text-sm">
            <div className="flex items-center gap-2 text-white/90">
              <Mail className="w-4 h-4 text-amber-400" />
              <span className="font-semibold">Email</span>
              <span className="text-white/60">— hello@cashbox.com</span>
            </div>
            <div className="flex items-center gap-2 text-white/90">
              <Phone className="w-4 h-4 text-amber-400" />
              <span className="font-semibold">WhatsApp</span>
              <span className="text-white/60">— +91 88911 63315</span>
            </div>
            <div className="flex items-center gap-2 text-white/90">
              <MapPin className="w-4 h-4 text-amber-400" />
              <span className="text-white/60">Palakkad, Kerala</span>
            </div>
          </div>

          <p className="mt-8 text-base md:text-lg text-white/80">
            <span className="text-amber-400 font-bold">SAVE SMART, LIVE BIG!</span>{" "}
            CashBox — Your Partner in Progress.
          </p>

          <div className="mt-8">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-[#080816] font-bold rounded-full px-8 py-3"
            >
              Get Started <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}