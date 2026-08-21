import React from "react";
import { Link } from "react-router-dom";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { ArrowRight } from "lucide-react";

const faqs = [
  { q: "What is a savings group (chit fund)?", a: "A savings group is a traditional financial arrangement where a group of people pool their money monthly. Each month, one member receives the total pooled amount as a prize. Over the duration of the group, every member receives the prize exactly once. It's a way to save consistently and access lump-sum funds when you need them." },
  { q: "How does CashBox ensure fairness in prize draws?", a: "All prize draws are conducted through recorded random selection. The draw is documented on video and every member can verify the process. We use admin-approved random draw methods that are transparent and tamper-proof." },
  { q: "Is my money safe with CashBox?", a: "Yes. Every member goes through KYC verification and must provide a guarantor. All transactions are recorded and visible in real-time. We use bank-grade encryption and follow Indian financial regulations." },
  { q: "What payment methods are supported?", a: "We support UPI, bank transfers, and cash collection. You can choose the method that works best for you." },
  { q: "How much does it cost to join?", a: "Registration is free. The company charges a small commission (typically 5%) on the total chit amount, which is deducted from the prize pool. This covers platform operations, admin support, and security. There are no hidden fees." },
  { q: "What happens if I miss a payment?", a: "You'll receive automated reminders via WhatsApp and email before your due date. Late payments may incur a small interest fee (typically 2% per month). Consistent defaults can result in membership suspension, which is why we require guarantor verification during enrollment." },
  { q: "Can I join multiple savings groups?", a: "Yes! You can participate in multiple groups simultaneously, as long as you can manage the monthly contributions for each. Many members join groups with different durations to create a staggered savings plan." },
  { q: "What is a guarantor and why do I need one?", a: "A guarantor is someone who vouches for your reliability and agrees to cover your payments if you default. This is a traditional trust mechanism that protects all group members. Your guarantor must be verified and provide consent." },
  { q: "How do I track my payments and dividends?", a: "Once you're a member, you get access to your personal dashboard. You can track all payments, dividends, prize status, and group progress in real-time. You'll also receive WhatsApp notifications for important updates." },
  { q: "What countries does CashBox support?", a: "CashBox currently operates in India. We're planning to expand to more communities in the future." },
];

export default function FAQ() {
  return (
    <div>
      <section className="bg-card text-foreground py-16">
        <div className="max-w-7xl mx-auto px-5 text-center">
          <h1 className="text-4xl md:text-5xl font-bold">Frequently Asked Questions</h1>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            Everything you need to know about CashBox, savings groups, and how it all works.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-3xl mx-auto px-5">
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="bg-card rounded-xl border border-border px-5">
                <AccordionTrigger className="text-left text-foreground font-medium hover:no-underline">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section className="bg-muted/30 py-16">
        <div className="max-w-4xl mx-auto px-5 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground">Still have questions?</h2>
          <p className="mt-3 text-muted-foreground">Our team is here to help. Reach out and we'll get back to you within 24 hours.</p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/contact" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors">
              Contact Us <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/register" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-border text-foreground font-semibold hover:bg-muted transition-colors">
              Get Started
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}