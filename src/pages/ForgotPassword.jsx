import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Phone, Lock, ShieldCheck, ArrowLeft, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

function toE164(tenDigits) {
  return `+91${tenDigits.replace(/\D/g, "")}`;
}

// Phone accounts have no email to send a reset link to, so this reuses the
// same WhatsApp OTP machinery signup does: prove you control the number,
// then set a new password directly — no emailed link, no second page.
export default function ForgotPassword() {
  const [step, setStep] = useState("phone"); // phone -> code -> new-password -> done
  const [phoneDigits, setPhoneDigits] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const phoneValid = /^\d{10}$/.test(phoneDigits);
  const phone = toE164(phoneDigits);

  const submitPhone = async (e) => {
    e.preventDefault();
    setError("");
    if (!phoneValid) {
      setError("Enter a valid 10-digit WhatsApp number");
      return;
    }
    setLoading(true);
    try {
      const exists = await base44.auth.phoneExists(phone);
      if (!exists) {
        setError("No account found with this number");
        setLoading(false);
        return;
      }
      await base44.auth.sendPasswordResetOtp(phone);
      setStep("code");
    } catch (err) {
      setError(err.message || "Couldn't send a code — try again");
    }
    setLoading(false);
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
      await base44.auth.verifyPasswordResetOtp(phone, code.trim());
      setStep("new-password");
    } catch (err) {
      setError(err.message || "That code didn't work — check WhatsApp and try again");
    }
    setLoading(false);
  };

  const submitNewPassword = async (e) => {
    e.preventDefault();
    setError("");
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
      await base44.auth.updatePassword(password);
      window.location.href = "/app";
    } catch (err) {
      setError(err.message || "Could not update your password");
      setLoading(false);
    }
  };

  if (step === "code") {
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
              placeholder="e.g. 123456"
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
              "Verify"
            )}
          </Button>
          <button
            type="button"
            onClick={() => { setStep("phone"); setCode(""); setError(""); }}
            className="w-full text-sm text-muted-foreground hover:text-foreground"
          >
            Wrong number? Go back
          </button>
        </form>
      </AuthLayout>
    );
  }

  if (step === "new-password") {
    return (
      <AuthLayout icon={Lock} title="Set a new password" subtitle="Choose a new password for your account">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}
        <form onSubmit={submitNewPassword} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                autoFocus
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
          <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              "Update password"
            )}
          </Button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={Phone}
      title="Reset password"
      subtitle="Enter your WhatsApp number and we'll send you a code"
      footer={
        <Link to="/login" className="text-primary font-medium hover:underline">
          <ArrowLeft className="w-3 h-3 inline mr-1" />Back to log in
        </Link>
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <form onSubmit={submitPhone} className="space-y-4">
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
              placeholder="e.g. 98765 43210"
              value={phoneDigits}
              onChange={(e) => setPhoneDigits(e.target.value.replace(/\D/g, "").slice(0, 10))}
              className="pl-12 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Sending...
            </>
          ) : (
            "Send code"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
