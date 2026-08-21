import React from "react";
import { Link } from "react-router-dom";
import { UserPlus, ShieldCheck, Users, CreditCard, Trophy, ArrowRight } from "lucide-react";

const steps = [
  { icon: UserPlus, title: "Apply Online", desc: "Register with your details and complete the digital KYC verification. Upload your ID, selfie, and guarantor information — all from your phone." },
  { icon: ShieldCheck, title: "Get Approved", desc: "Our admin team reviews your application, verifies your guarantor, and approves your membership. You'll receive a WhatsApp notification once approved." },
  { icon: Users, title: "Join a Savings Group", desc: "Choose a savings plan that fits your budget. You'll be assigned to a group with other verified members and given a ticket number for prize draws." },
  { icon: CreditCard, title: "Pay Monthly Installments", desc: "Pay your monthly contribution via e-Transfer, UPI, bank transfer, or cash. Track every payment in real-time and receive automated reminders." },
  { icon: Trophy, title: "Win Your Prize", desc: "Each month, a winner is selected through a recorded random draw. The prize amount is transferred to your bank account with full documentation." },
];

export default function HowItWorks() {
  return (
    <div>
      <section className="bg-card text-foreground py-16">
        <div className="max-w-7xl mx-auto px-5 text-center">
          <h1 className="text-4xl md:text-5xl font-bold">How it Works</h1>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            From registration to your first prize — here's exactly how CashBox works, step by step.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-4xl mx-auto px-5">
          <div className="space-y-8">
            {steps.map((step, i) => (
              <div key={i} className="flex gap-6">
                <div className="flex flex-col items-center">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                    <step.icon className="w-6 h-6 text-primary" />
                  </div>
                  {i < steps.length - 1 && <div className="w-px flex-1 bg-border my-2" />}
                </div>
                <div className="pb-8">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-bold text-primary">STEP {i + 1}</span>
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-2 text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted/30 py-16">
        <div className="max-w-7xl mx-auto px-5">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground text-center mb-10">What makes us different</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Benefit title="Transparent Tracking" desc="Every transaction, dividend, and prize draw is recorded and visible to all group members in real-time." />
            <Benefit title="Guarantor-Backed" desc="Every member is backed by a verified guarantor, ensuring trust and reducing default risk." />
            <Benefit title="Automated Reminders" desc="Never miss a payment. Get WhatsApp and email reminders before your due date every month." />
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-4xl mx-auto px-5 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground">Ready to begin?</h2>
          <p className="mt-3 text-muted-foreground">Create your free account today and join a savings group within minutes.</p>
          <Link to="/register" className="mt-6 inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors">
            Get Started Free <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function Benefit({ title, desc }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-6">
      <h3 className="font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}