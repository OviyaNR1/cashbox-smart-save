import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44, setRememberMe } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { LogIn, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { safeReturnTo } from "@/lib/authReturnTo";

function toE164(tenDigits) {
  return `+91${tenDigits.replace(/\D/g, "")}`;
}

// Customer-facing login only — no Admin/Member choice here. Whoever signs
// in lands on /app, which auto-detects their role and routes them to the
// member dashboard or admin panel accordingly (see Home.jsx). Admin has its
// own separate entry point at /admin/login and still uses email/password.
//
// Phone + password, not OTP — the WhatsApp code only happens once, at
// signup, to confirm the number. Every login after that is a normal
// password check, same as email login was, just keyed by phone.
export default function Login() {
  const [phoneDigits, setPhoneDigits] = useState("");
  const [password, setPassword] = useState("");
  // Checked by default — repeatedly re-typing a password is exactly the
  // friction this whole phone+password flow was built to avoid, so staying
  // signed in is the expected default; unchecking is for a shared/public
  // device where you don't want the session to survive closing the tab.
  const [rememberMe, setRememberMeChecked] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const returnTo = safeReturnTo();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!/^\d{10}$/.test(phoneDigits)) {
      setError("Enter a valid 10-digit WhatsApp number");
      return;
    }
    setLoading(true);
    try {
      // Must happen before login — the session gets written to storage as
      // part of that call, and the storage adapter reads this preference
      // live to decide where.
      setRememberMe(rememberMe);
      await base44.auth.loginViaPhonePassword(toE164(phoneDigits), password);
      window.location.href = returnTo === "/" ? "/app" : returnTo;
    } catch (err) {
      setError(err.message || "Invalid number or password");
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Welcome back"
      subtitle="Log in with your WhatsApp number"
      footer={
        <>
          Don't have an account?{" "}
          <Link
            to={"/register" + (returnTo !== "/" ? "?returnTo=" + encodeURIComponent(returnTo) : "")}
            className="text-primary font-medium hover:underline"
          >
            Create one
          </Link>
        </>
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
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
    </AuthLayout>
  );
}
