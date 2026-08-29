import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44, setRememberMe } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { LogIn, Lock, Loader2, Phone, ShieldCheck, ArrowLeft } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { safeReturnTo } from "@/lib/authReturnTo";

// India-only for now — the whole app is currently India-first (see the
// landing page), so a bare 10-digit field kept simple beats a country-code
// picker nobody but a handful of Canada members would ever touch.
function toE164(tenDigits) {
  return `+91${tenDigits.replace(/\D/g, "")}`;
}

// One entry point for both /login and /register (App.jsx routes both here)
// — a member types their WhatsApp number first, and the number itself
// decides what happens next: an existing account asks for the password,
// a new one goes straight into account creation. Nobody has to already
// know which of "log in" or "sign up" applies to them before they start,
// which is exactly what was confusing about having two separate forms.
//
// Admin has its own separate entry point at /admin/login and still uses
// email/password, untouched by any of this.
export default function Login() {
  // "phone" -> checks existence -> "password" (existing account) or
  // "create-password" (new account) -> "verify" (new account's WhatsApp
  // code) -> done. Going back from either branch returns to "phone".
  const [step, setStep] = useState("phone");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [checking, setChecking] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  // Checked by default — repeatedly re-typing a password is exactly the
  // friction this whole phone+password flow was built to avoid, so staying
  // signed in is the expected default; unchecking is for a shared/public
  // device where you don't want the session to survive closing the tab.
  const [rememberMe, setRememberMeChecked] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const returnTo = safeReturnTo();

  const phoneValid = /^\d{10}$/.test(phoneDigits);
  const phone = toE164(phoneDigits);

  const submitPhone = async (e) => {
    e.preventDefault();
    setError("");
    if (!phoneValid) {
      setError("Enter a valid 10-digit WhatsApp number");
      return;
    }
    setChecking(true);
    try {
      const exists = await base44.auth.phoneExists(phone);
      setStep(exists ? "password" : "create-password");
    } catch (err) {
      setError(err.message || "Couldn't check that number — try again");
    }
    setChecking(false);
  };

  const backToPhone = () => {
    setStep("phone");
    setPassword("");
    setConfirmPassword("");
    setError("");
  };

  const submitLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Must happen before login — the session gets written to storage as
      // part of that call, and the storage adapter reads this preference
      // live to decide where.
      setRememberMe(rememberMe);
      await base44.auth.loginViaPhonePassword(phone, password);
      window.location.href = returnTo === "/" ? "/app" : returnTo;
    } catch (err) {
      setError(err.message || "Invalid number or password");
      setLoading(false);
    }
  };

  const submitCreatePassword = async (e) => {
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
      await base44.auth.signUpWithPhone(phone, password);
      setStep("verify");
    } catch (err) {
      setError(err.message || "Could not create account");
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
      await base44.auth.verifyPhoneSignup(phone, code.trim());
      const target = safeReturnTo();
      window.location.href = target === "/" ? "/app" : target;
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
              "Verify and continue"
            )}
          </Button>
          <button
            type="button"
            onClick={() => { setStep("create-password"); setCode(""); setError(""); }}
            className="w-full text-sm text-muted-foreground hover:text-foreground"
          >
            Wrong number? Go back
          </button>
        </form>
      </AuthLayout>
    );
  }

  const isNewAccount = step === "create-password";

  return (
    <AuthLayout
      icon={step === "phone" ? LogIn : isNewAccount ? ShieldCheck : LogIn}
      title={step === "phone" ? "Welcome to CashBox" : isNewAccount ? "Create your account" : "Welcome back"}
      subtitle={
        step === "phone"
          ? "Enter your WhatsApp number to continue"
          : isNewAccount
          ? "No account found — let's set a password"
          : "Enter your password to continue"
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {step === "phone" && (
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
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 shrink-0" /> We'll check if you already have an account with this number.
          </p>
          <Button type="submit" className="w-full h-12 font-medium" disabled={checking}>
            {checking ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Checking...
              </>
            ) : (
              "Continue"
            )}
          </Button>
        </form>
      )}

      {step === "password" && (
        <form onSubmit={submitLogin} className="space-y-4">
          <button
            type="button"
            onClick={backToPhone}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> +91 {phoneDigits}
          </button>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                autoFocus
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 h-12"
                required
              />
            </div>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <Checkbox checked={rememberMe} onCheckedChange={(v) => setRememberMeChecked(!!v)} />
            <span className="text-sm text-muted-foreground">Remember me on this device</span>
          </label>
          <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Logging in...
              </>
            ) : (
              "Log in"
            )}
          </Button>
        </form>
      )}

      {isNewAccount && (
        <form onSubmit={submitCreatePassword} className="space-y-4">
          <button
            type="button"
            onClick={backToPhone}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> +91 {phoneDigits}
          </button>
          <div className="space-y-2">
            <Label htmlFor="new-password">Create a password</Label>
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
      )}
    </AuthLayout>
  );
}
