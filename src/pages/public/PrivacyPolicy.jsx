import React from "react";

const lastUpdated = "August 2026";

export default function PrivacyPolicy() {
  return (
    <div>
      <section className="bg-card text-foreground py-16">
        <div className="max-w-4xl mx-auto px-5 text-center">
          <h1 className="text-4xl md:text-5xl font-bold">Privacy Policy</h1>
          <p className="mt-4 text-muted-foreground">Last updated: {lastUpdated}</p>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-3xl mx-auto px-5 space-y-10 text-muted-foreground leading-relaxed">
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Introduction</h2>
            <p>
              CashBox ("we", "us", "our") operates a digital savings-group (chit fund) platform serving
              members in India. This Privacy Policy explains what personal information we
              collect, why we collect it, how we use and protect it, and the choices you have.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Information We Collect</h2>
            <p className="mb-3">We collect information you provide directly, including:</p>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>Account details: name, email address, phone number, and password.</li>
              <li>
                Identity verification (KYC) documents required to join a savings group: government-issued
                ID (e.g. driver's license, passport, Aadhaar, PAN), a selfie photo, proof of address, and
                related details such as date of birth, occupation, and employer.
              </li>
              <li>Banking details needed to process contributions, dividends, and prize payouts.</li>
              <li>Guarantor information you submit on behalf of a third party who agrees to vouch for you.</li>
              <li>Payment and transaction records, including method, amount, and date.</li>
              <li>Communications you send us, including support requests and messages sent via WhatsApp.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>To verify your identity and eligibility to join a savings group, as required by law.</li>
              <li>To operate savings groups: track contributions, run prize draws or auctions, and calculate dividends.</li>
              <li>To send payment reminders, auction updates, and account notifications by email, WhatsApp, or in-app notification.</li>
              <li>To detect and prevent fraud, and to maintain an audit trail of account and group activity.</li>
              <li>To comply with applicable financial recordkeeping and reporting obligations in India.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. How We Share Information</h2>
            <p>
              We do not sell your personal information. We share it only where necessary: with the
              guarantor you designate, with group administrators for the purposes of running your savings
              group, with payment and messaging providers (such as our WhatsApp Business messaging
              provider) strictly to deliver the service, and where required by law or a valid legal
              request.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Data Security</h2>
            <p>
              We use industry-standard safeguards — encrypted storage and transmission, access controls,
              and audit logging of administrative actions — to protect your information. No system is
              completely secure, and we encourage you to use a strong, unique password.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Data Retention</h2>
            <p>
              We retain KYC and transaction records for as long as your account is active and for a
              reasonable period afterward, to meet recordkeeping obligations and resolve disputes.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Your Rights</h2>
            <p>
              Depending on where you live, you may have the right to access, correct, or request deletion
              of your personal information, and to withdraw consent to non-essential communications.
              Contact us using the details below to exercise these rights.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Regional Compliance</h2>
            <p>
              We handle personal information in accordance with applicable Indian data protection law,
              including the Digital Personal Data Protection Act.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">9. Changes to This Policy</h2>
            <p>
              We may update this policy from time to time. Material changes will be posted on this page
              with an updated effective date.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">10. Contact Us</h2>
            <p>
              Questions about this policy or your personal information can be sent to{" "}
              <a href="mailto:hello@cashbox.com" className="text-primary hover:underline">hello@cashbox.com</a>.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
