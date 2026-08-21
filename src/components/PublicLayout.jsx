import React, { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Menu, X, LayoutDashboard } from "lucide-react";
import Logo from "@/components/Logo";
import { PublicCurrencyProvider } from "@/lib/publicCurrency";
import ThemeToggle from "@/components/ThemeToggle";

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/chit-plan", label: "Plans" },
  { to: "/how-it-works", label: "How it Works" },
  { to: "/about", label: "About" },
  { to: "/faq", label: "FAQ" },
  { to: "/contact", label: "Contact" },
];

export default function PublicLayout() {
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
    base44.auth.isAuthenticated().then(setAuthed).catch(() => setAuthed(false));
  }, [location.pathname]);

  return (
    <PublicCurrencyProvider>
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link to="/" className="shrink-0"><Logo /></Link>
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`px-3.5 py-2 rounded-full text-sm font-medium transition-colors ${
                  location.pathname === n.to
                    ? "text-primary"
                    : "text-foreground hover:text-primary"
                }`}
              >
                {n.label}
              </Link>
            ))}
            <ThemeToggle className="ml-1" />
            {authed ? (
              <Link to="/app" className="ml-2 px-4 py-2 rounded-full text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4" /> Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="ml-2 px-4 py-2 rounded-full text-sm font-medium text-foreground hover:bg-muted">
                  Login
                </Link>
                <Link to="/register" className="px-4 py-2 rounded-full text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90">
                  Get Started
                </Link>
              </>
            )}
          </nav>
          <button className="md:hidden text-foreground" onClick={() => setOpen(!open)}>
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {open && (
          <div className="md:hidden border-t border-border px-5 py-3 space-y-1">
            {navLinks.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`block py-2 text-sm font-medium ${
                  location.pathname === n.to ? "text-primary" : "text-foreground"
                }`}
              >
                {n.label}
              </Link>
            ))}
            <div className="pt-2 flex items-center gap-3">
              <ThemeToggle />
            </div>
            <div className="flex gap-2 pt-2">
              {authed ? (
                <Link to="/app" className="flex-1 text-center py-2 rounded-full text-sm font-medium bg-primary text-primary-foreground">
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link to="/login" className="flex-1 text-center py-2 rounded-full text-sm font-medium border border-border text-foreground">
                    Login
                  </Link>
                  <Link to="/register" className="flex-1 text-center py-2 rounded-full text-sm font-medium bg-primary text-primary-foreground">
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
    </PublicCurrencyProvider>
  );
}

function Footer() {
  return (
    <footer className="bg-card text-foreground border-t border-border">
      <div className="max-w-7xl mx-auto px-5 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="col-span-2 md:col-span-1">
          <Logo variant="light" />
          <p className="mt-3 text-sm text-muted-foreground max-w-xs">
            Modern digital savings groups for the global community. Save smarter, win bigger.
          </p>
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-3">Company</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link to="/about" className="hover:text-primary">About Us</Link></li>
            <li><Link to="/how-it-works" className="hover:text-primary">How it Works</Link></li>
            <li><Link to="/contact" className="hover:text-primary">Contact</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-3">Resources</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link to="/chit-plan" className="hover:text-primary">Chit Plans</Link></li>
            <li><Link to="/faq" className="hover:text-primary">FAQ</Link></li>
            <li><Link to="/register" className="hover:text-primary">Join Now</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-3">Legal</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link to="/privacy" className="hover:text-primary">Privacy Policy</Link></li>
            <li><Link to="/terms" className="hover:text-primary">Terms of Service</Link></li>
            <li>Security</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="max-w-7xl mx-auto px-5 py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} CashBox. All rights reserved.
        </div>
      </div>
    </footer>
  );
}