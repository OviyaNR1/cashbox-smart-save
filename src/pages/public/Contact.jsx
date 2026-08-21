import React, { useState } from "react";
import { Mail, Phone, Send, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export default function Contact() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div>
      <section className="bg-card text-foreground py-16">
        <div className="max-w-7xl mx-auto px-5 text-center">
          <h1 className="text-4xl md:text-5xl font-bold">Get in Touch</h1>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            Have questions about CashBox? Want to partner with us? We'd love to hear from you.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-5 grid md:grid-cols-2 gap-12">
          <div>
            {submitted ? (
              <div className="bg-emerald-500/10 rounded-2xl border border-emerald-500/20 p-8 text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-emerald-400">Message sent!</h3>
                <p className="mt-2 text-sm text-muted-foreground">Thanks for reaching out. Our team will get back to you within 24 hours.</p>
                <Button onClick={() => { setSubmitted(false); setForm({ name: "", email: "", phone: "", message: "" }); }} variant="outline" className="mt-4 rounded-full">
                  Send another message
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div><Label>Full Name</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Your name" required /></div>
                <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" required /></div>
                <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 88911 63315" /></div>
                <div><Label>Message</Label><Textarea value={form.message} onChange={(e) => set("message", e.target.value)} placeholder="How can we help you?" rows={5} required /></div>
                <Button type="submit" className="w-full rounded-full bg-primary hover:bg-primary/90">
                  <Send className="w-4 h-4 mr-2" /> Send Message
                </Button>
              </form>
            )}
          </div>

          <div className="space-y-6">
            <ContactCard icon={Mail} title="Email Us" value="hello@cashbox.com" desc="We reply within 24 hours" />
            <ContactCard icon={Phone} title="WhatsApp" value="+91 88911 63315" desc="Mon-Sat, 9am-6pm IST" />
            <div className="bg-card rounded-2xl p-6 border border-border text-foreground">
              <h3 className="font-semibold mb-2">Why reach out?</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Questions about savings plans</li>
                <li>• Partnership opportunities</li>
                <li>• Technical support</li>
                <li>• General inquiries</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ContactCard({ icon: Icon, title, value, desc }) {
  return (
    <div className="flex items-start gap-4 bg-card rounded-2xl border border-border p-5">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{title}</p>
        <p className="font-medium text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </div>
  );
}