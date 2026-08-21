import React from "react";

const lastUpdated = "August 2026";

export default function TermsOfService() {
  return (
    <div>
      <section className="bg-card text-foreground py-16">
        <div className="max-w-4xl mx-auto px-5 text-center">
          <h1 className="text-4xl md:text-5xl font-bold">Terms of Service</h1>
          <p className="mt-4 text-muted-foreground">Last updated: {lastUpdated}</p>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-3xl mx-auto px-5 space-y-10 text-muted-foreground leading-relaxed">
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Agreement</h2>
            <p>
              These Terms of Service ("Terms") govern your use of CashBox ("we", "us", "our"), a digital
              savings-group (chit fund) platform serving members in India. By creating an account or
              joining a savings group, you agree to these Terms.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Eligibility &amp; Verification</h2>
            <p>
              You must be at least 18 years old and able to enter a binding contract to use CashBox. Joining
              a savings group requires completing identity verification (KYC) and providing a guarantor who
              agrees to your obligations. We may decline or remove any member whose verification cannot be
              completed or confirmed.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. How Savings Groups Work</h2>
            <p>
              Each savings group ("chit") follows the schedule and payout method described on the plan you
              join — a fixed rotation, a random draw, or a live auction. Contributions are due on the
              group's collection date each month. Prize and dividend amounts are calculated according to
              the plan's published formula and are not subject to negotiation after a group starts.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Payments &amp; Fees</h2>
            <p>
              You're responsible for paying your monthly installment on time using one of the supported
              payment methods. Late payments may incur a late fee as disclosed on your plan. A commission,
              disclosed on the plan before you join, is deducted from the group's prize pool to cover
              platform operations — it is not a separate charge to you.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Guarantors</h2>
            <p>
              A guarantor you designate may be asked to cover your obligations if you default on payments.
              Providing false or unauthorized guarantor information is a violation of these Terms and may
              result in account suspension.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Suspension &amp; Termination</h2>
            <p>
              We may suspend or terminate your account for non-payment, fraudulent activity, false KYC or
              guarantor information, or any other violation of these Terms. Terminating your account does
              not relieve you of amounts already owed to your group.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Disclaimers</h2>
            <p>
              CashBox provides the platform to run and record savings groups; it does not guarantee
              investment returns. Prize and dividend amounts depend on your plan's model and the group's
              actual activity. We aim for continuous availability but don't guarantee the service will be
              uninterrupted or error-free.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Limitation of Liability</h2>
            <p>
              To the extent permitted by law, CashBox is not liable for indirect or consequential losses
              arising from your use of the platform. Our liability for any claim is limited to the fees you
              paid to us in the twelve months before the claim arose.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">9. Governing Law</h2>
            <p>
              These Terms are governed by the laws of India. Any dispute arising from these Terms or your
              use of CashBox will be subject to the exclusive jurisdiction of the courts of India.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">10. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. Material changes will be posted on this page
              with an updated effective date.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">11. Contact Us</h2>
            <p>
              Questions about these Terms can be sent to{" "}
              <a href="mailto:hello@cashbox.com" className="text-primary hover:underline">hello@cashbox.com</a>.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
