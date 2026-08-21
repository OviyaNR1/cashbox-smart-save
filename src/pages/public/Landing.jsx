import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { formatMoney } from "@/lib/currency";
import { usePublicCurrency } from "@/lib/publicCurrency";
import { Shield, Users, Trophy, ArrowRight, TrendingUp, Lock, Globe, CheckCircle2 } from "lucide-react";

export default function Landing() {
  const [plans, setPlans] = useState([]);
  const [authed, setAuthed] = useState(false);
  const navigate = useNavigate();
  const { currency } = usePublicCurrency();

  useEffect(() => {
    base44.auth.isAuthenticated().then(setAuthed).catch(() => setAuthed(false));
  }, []);

  const filteredPlans = currency === "all" ? plans : plans.filter((p) => (p.currency || "INR") === currency);
  const popular = filteredPlans.slice(0, 3);

  const today = new Date();
  const nextCycleStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const daysToNextCycle = Math.max(1, Math.ceil((nextCycleStart - today) / 86400000));

  return (
    <div>
      <section className="relative overflow-hidden bg-card text-foreground border-b border-border">
        <div className="absolute inset-0 opacity-[0.07]" style={{
          backgroundImage: "radial-gradient(circle at 18% 15%, #ffb833 0%, transparent 45%)"
        }} />
        <div className="relative max-w-3xl mx-auto px-5 py-20 md:py-28 text-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-xs font-medium text-primary mb-6">
            <Globe className="w-3.5 h-3.5" /> Now serving India
          </span>
          <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold mb-4">
            Every group has one
          </p>
          <h1 className="text-4xl md:text-6xl font-bold leading-tight text-balance">
            Draw day comes <span className="text-primary">every month.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto">
            Twenty members, one winner, recorded live and visible to your whole group.
            You'll always know exactly which day is yours to watch.
          </p>

          <div className="mt-9 inline-flex items-center gap-4 bg-primary text-primary-foreground rounded-2xl px-6 py-4">
            <span className="text-3xl font-bold tabular-nums">{daysToNextCycle}</span>
            <span className="text-left text-[11px] uppercase tracking-wide font-semibold opacity-75 leading-tight">
              days until<br />the next collection cycle
            </span>
          </div>

          <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to={authed ? "/chit-plan" : "/register"}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
            >
              {authed ? "Plans" : "Get Started Free"} <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/how-it-works"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-border text-foreground font-semibold hover:bg-muted transition-colors"
            >
              How it Works
            </Link>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">Why CashBox?</h2>
            <p className="mt-4 text-muted-foreground">
              We've reimagined traditional chit funds with modern technology, member verification,
              and complete transparency.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <Feature icon={Lock} title="Verified & Secure" desc="Member identity verification, guarantor-backed enrollment, and recorded transactions build trust." />
            <Feature icon={TrendingUp} title="Real-Time Tracking" desc="Track every payment, dividend, and prize distribution live. No more spreadsheets or manual ledgers." />
            <Feature icon={Trophy} title="Transparent Draws" desc="Recorded random draws ensure fairness. Every winner announcement is verifiable and documented." />
          </div>
        </div>
      </section>

      <section className="bg-muted/30 py-20">
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">Get started in minutes</h2>
            <p className="mt-4 text-muted-foreground">From signup to your first savings group in four simple steps.</p>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            <Step num="1" title="Apply Online" desc="Register and complete your KYC verification in minutes." />
            <Step num="2" title="Get Approved" desc="Our team reviews your application and guarantor details." />
            <Step num="3" title="Join a Group" desc="Pick a savings plan and get assigned to a group instantly." />
            <Step num="4" title="Pay & Win" desc="Pay monthly installments and win your prize through fair draws." />
          </div>
          <div className="text-center mt-10">
            <Link to="/how-it-works" className="inline-flex items-center gap-2 text-primary font-semibold hover:gap-3 transition-all">
              Learn more <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {popular.length > 0 && (
        <section className="py-20">
          <div className="max-w-7xl mx-auto px-5">
            <div className="flex items-end justify-between mb-10">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground">Popular Savings Plans</h2>
                <p className="mt-2 text-muted-foreground">Find the plan that fits your financial goals.</p>
              </div>
              <Link to="/plans" className="hidden md:inline-flex items-center gap-2 text-primary font-semibold hover:gap-3 transition-all">
                View all plans <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {popular.map((p) => <PlanCard key={p.id} plan={p} />)}
            </div>
          </div>
        </section>
      )}

      <section className="bg-card py-20 text-foreground">
        <div className="max-w-7xl mx-auto px-5 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold">Your money, tracked transparently</h2>
            <p className="mt-4 text-muted-foreground">
              Every group is backed by guarantor verification, member identity checks, and recorded transactions.
              We help you save with confidence alongside verified community members.
            </p>
            <ul className="mt-6 space-y-3">
              {["Verified KYC for every member","Guarantor-backed enrollment","Recorded prize draws for transparency","Automated payment tracking & reminders"].map((item) => (
                <li key={item} className="flex items-center gap-3 text-foreground/80">
                  <CheckCircle2 className="w-5 h-5 text-primary shrink-0" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <SecurityCard icon={Shield} title="Secure" desc="Protected accounts" />
            <SecurityCard icon={Users} title="Verified" desc="Identity + guarantor check" />
            <SecurityCard icon={Lock} title="Tracked" desc="Every transaction recorded" />
            <SecurityCard icon={Globe} title="Pan-India" desc="Built for Indian savers" />
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-4xl mx-auto px-5 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">Ready to start saving?</h2>
          <p className="mt-4 text-muted-foreground">Join thousands of members building their financial future with CashBox.</p>
          <Link
            to={authed ? "/chit-plan" : "/register"}
            className="mt-8 inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
          >
            {authed ? "Plans" : "Create your free account"} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function Feature({ icon: Icon, title, desc }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-6 hover:border-primary/30 transition-all">
      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-primary" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}

function Step({ num, title, desc }) {
  return (
    <div className="text-center">
      <div className="w-12 h-12 mx-auto rounded-full bg-primary text-primary-foreground font-bold text-lg flex items-center justify-center mb-4">
        {num}
      </div>
      <h3 className="font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function PlanCard({ plan }) {
  const currency = plan.currency || "INR";
  return (
    <div className="bg-card rounded-2xl border border-border p-6 hover:border-primary/30 transition-all">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">{plan.plan_name}</h3>
        <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400 font-medium">Active</span>
      </div>
      <div className="text-3xl font-bold text-primary">{formatMoney(plan.chit_amount, currency)}</div>
      <p className="text-sm text-muted-foreground mt-1">Total chit amount</p>
      <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-4 text-sm">
        <div><p className="text-muted-foreground text-xs">Monthly</p><p className="font-medium text-foreground">{formatMoney(plan.monthly_contribution, currency)}</p></div>
        <div><p className="text-muted-foreground text-xs">Duration</p><p className="font-medium text-foreground">{plan.duration_months} months</p></div>
        <div><p className="text-muted-foreground text-xs">Members</p><p className="font-medium text-foreground">{plan.member_count} seats</p></div>
      </div>
    </div>
  );
}

function SecurityCard({ icon: Icon, title, desc }) {
  return (
    <div className="bg-primary/5 rounded-xl p-4 border border-border">
      <Icon className="w-5 h-5 text-primary mb-2" />
      <p className="font-medium text-sm text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </div>
  );
}