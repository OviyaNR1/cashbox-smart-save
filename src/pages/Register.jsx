import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Phone, Lock, ShieldCheck, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { safeReturnTo } from "@/lib/authReturnTo";

// India-only for now — the whole app is currently India-first (see the
// landing page), so a bare 10-digit field kept simple beats a country-code
// picker nobody but a handful of Canada members would ever touch.
function toE164(tenDigits) {
  return `+91${tenDigits.replace(/\D/g, "")}`;
}

// Phone/WhatsApp registration, replacing the old email+password signup.
// Two steps: (1) phone + password creates the account but leaves it
// unconfirmed, (2) the WhatsApp-delivered code confirms it and logs the
// member in. After today, they log in with phone + password — no OTP on
// every visit, only here at signup to prove the number is really theirs.
export default function Register() {
  const [step, setStep] = useState("details");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const phoneValid = /^\d{10}$/.test(phoneDigits);

  const submitDetails = async (e) => {
    e.preventDefault();
    setError("");
    if (!phoneValid) {
      setError("Enter a valid 10-digit WhatsApp number");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await base44.auth.signUpWithPhone(toE164(phoneDigits), password);
      setStep("verify");
    } catch (err) {
      setError(err.message || "Could not create account");
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setError("");
    if (!code.trim()) {
      setError("Enter the code we sent on WhatsApp");
      return;
    }
    setLoading(true);
    try {
      await base44.auth.verifyPhoneSignup(toE164(phoneDigits), code.trim());
      const returnTo = safeReturnTo();
      window.location.href = returnTo === "/" ? "/app" : returnTo;
    } catch (err) {
      setError(err.message || "That code didn't work — check WhatsApp and try again");
      setLoading(false);
    }
  };

  if (step === "verify") {
    return (
      <AuthLayout
        icon={ShieldCheck}
        title="Check WhatsApp"
        subtitle={`We sent a code to your WhatsApp number ending in ${phoneDigits.slice(-4)}`}
      >
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}
        <form onSubmit={submitCode} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">Verification code</Label>
            <Input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="h-14 text-2xl font-semibold tracking-widest text-center border-2 border-primary/50 focus-visible:border-primary rounded-xl"
              required
            />
          </div>
          <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify and continue"
            )}
          </Button>
          <button
            type="button"
            onClick={() => { setStep("details"); setCode(""); setError(""); }}
            className="w-full text-sm text-muted-foreground hover:text-foreground"
          >
            Wrong number? Go back
          </button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={UserPlus}
      title="Create your account"
      subtitle="Sign up with your WhatsApp number"
      footer={
        <>
          Already have an account?{" "}
          <Link
            to={"/login" + (safeReturnTo() !== "/" ? "?returnTo=" + encodeURIComponent(safeReturnTo()) : "")}
            className="text-primary font-medium hover:underline"
          >
            Log in
          </Link>
        </>
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={submitDetails} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="phone">WhatsApp number</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
              +91
            </span>
            <Input
              id="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              autoFocus
              placeholder="98765 43210"
              value={phoneDigits}
              onChange={(e) => setPhoneDigits(e.target.value.replace(/\D/g, "").slice(0, 10))}
              className="pl-12 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Create a password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Phone className="w-3.5 h-3.5 shrink-0" /> We'll send a one-time code on WhatsApp to confirm this number.
        </p>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
