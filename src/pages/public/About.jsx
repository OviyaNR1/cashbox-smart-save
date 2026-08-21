import React from "react";
import { Link } from "react-router-dom";
import { Shield, Heart, Users, Zap, ArrowRight } from "lucide-react";
import { usePlatformStats } from "@/hooks/usePlatformStats";
import { usePublicCurrency } from "@/lib/publicCurrency";
import { formatMoney } from "@/lib/currency";

export default function About() {
  const stats = usePlatformStats();
  const { currency } = usePublicCurrency();
  const totalDisbursedDisplay = stats
    ? currency === "all"
      ? Number(stats.totalDisbursed || 0).toLocaleString()
      : formatMoney(stats.totalDisbursed, currency)
    : "—";

  return (
    <div>
      <section className="bg-card text-foreground py-16">
        <div className="max-w-7xl mx-auto px-5 text-center">
          <h1 className="text-4xl md:text-5xl font-bold">About CashBox</h1>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            We're on a mission to bring traditional savings groups into the digital age —
            making them safer, more transparent, and accessible to everyone.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-4xl mx-auto px-5 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-6">Our Mission</h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            For generations, chit funds and savings groups have helped communities save money and
            access credit. But traditional groups rely on trust alone — with no transparency,
            no records, and no protection against fraud.
          </p>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            CashBox changes that. We combine the community power of traditional savings groups with
            modern technology, member verification, and complete transparency. Every member is verified,
            every transaction is recorded, and every prize draw is documented.
          </p>
        </div>
      </section>

      <section className="bg-muted/30 py-16">
        <div className="max-w-7xl mx-auto px-5">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground text-center mb-12">What we stand for</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Value icon={Shield} title="Security First" desc="Member verification, guarantor backing, and recorded transactions protect every member." />
            <Value icon={Heart} title="Community Driven" desc="We preserve the human connection of traditional savings groups while adding technology." />
            <Value icon={Users} title="Transparency" desc="Every transaction, dividend, and draw is visible to all members in real-time." />
            <Value icon={Zap} title="Innovation" desc="We constantly improve with AI-powered insights, automated reminders, and smart tracking." />
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-5 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">Built for the modern saver</h2>
            <p className="text-muted-foreground leading-relaxed">
              Whether you're in Chennai or Coimbatore, CashBox adapts to your local banking system.
              UPI, bank transfer, and cash collection for traditional members — we support it all.
            </p>
            <ul className="mt-6 space-y-3">
              {["Localized payment methods","Government ID verification","Guarantor-based trust system","WhatsApp notifications"].map((item) => (
                <li key={item} className="flex items-center gap-3 text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-card rounded-3xl p-8 border border-border">
            <h3 className="text-xl font-semibold mb-4 text-foreground">By the numbers</h3>
            <div className="grid grid-cols-2 gap-6">
              <div><p className="text-3xl font-bold text-primary">{stats ? stats.memberCount : "—"}</p><p className="text-sm text-muted-foreground mt-1">Active members</p></div>
              <div><p className="text-3xl font-bold text-primary">{stats ? stats.groupCount : "—"}</p><p className="text-sm text-muted-foreground mt-1">Savings groups</p></div>
              <div><p className="text-3xl font-bold text-primary">{totalDisbursedDisplay}</p><p className="text-sm text-muted-foreground mt-1">Total disbursed</p></div>
              <div><p className="text-3xl font-bold text-primary">India</p><p className="text-sm text-muted-foreground mt-1">Country served</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-muted/30">
        <div className="max-w-4xl mx-auto px-5 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground">Join the movement</h2>
          <p className="mt-3 text-muted-foreground">Be part of a community that's redefining how people save and grow their money.</p>
          <Link to="/register" className="mt-6 inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors">
            Create your free account <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function Value({ icon: Icon, title, desc }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-6 text-center">
      <div className="w-12 h-12 mx-auto rounded-xl bg-primary/10 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-primary" />
      </div>
      <h3 className="font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}