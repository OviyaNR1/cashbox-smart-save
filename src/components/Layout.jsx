import React, { useEffect, useState } from "react";
import { Link, Outlet, useLocation, Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { LayoutDashboard, Layers, Users, CreditCard, Trophy, BarChart3, ScrollText, MessageSquare, LogOut, Menu, X, Calendar, Landmark, UsersRound, User, Inbox, Gavel, Search, ChevronsLeft, ChevronsRight, Bell, Trash2 } from "lucide-react";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { AdminCountryProvider, useAdminCountry } from "@/lib/AdminCountryContext";

const SIDEBAR_COLLAPSED_KEY = "cashbox_sidebar_collapsed";

function CountrySwitcher() {
  const { country, setCountry } = useAdminCountry();
  return (
    <select
      value={country}
      onChange={(e) => setCountry(e.target.value)}
      className="w-full text-sm font-medium rounded-xl border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
    >
      <option value="India">🇮🇳 India</option>
      <option value="Canada">🇨🇦 Canada</option>
    </select>
  );
}

function NavIcon({ icon: Icon, className, badge }) {
  return (
    <span className="relative inline-flex shrink-0">
      <Icon className={className} />
      {badge && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />}
    </span>
  );
}

export default function Layout() {
  const [user, setUser] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [navQuery, setNavQuery] = useState("");
  const [auctionProminent, setAuctionProminent] = useState(false);
  const location = useLocation();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, [location.pathname]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    } catch {
      // ignore
    }
  }, [collapsed]);

  // Close the mobile drawer on every navigation — otherwise it stays open
  // over the new page until the user taps the backdrop.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const isStaff = user && (user.app_role === "admin" || user.app_role == null || ["super_admin", "branch_admin", "collection_agent"].includes(user.app_role));

  // Badge the Auction nav item when a live-auction group the member belongs
  // to already has bidding in progress, or its collection day is within 3
  // days — mirrors the "any non-closed Auction row" pattern LiveAuction.jsx
  // already uses to detect "in progress".
  useEffect(() => {
    if (!user || isStaff) { setAuctionProminent(false); return; }
    (async () => {
      try {
        const memberships = await base44.entities.GroupMembership.filter({ user_id: user.id, status: "active" });
        if (!memberships.length) return setAuctionProminent(false);
        const [groups, plans, auctions] = await Promise.all([
          base44.entities.ChitGroup.list("-created_date", 200),
          base44.entities.ChitPlan.list("-created_date", 200),
          base44.entities.Auction.list("-month_number", 300),
        ]);
        const myGroupIds = new Set(memberships.map((m) => m.group_id));
        const liveGroups = groups.filter((g) => myGroupIds.has(g.id) && plans.find((p) => p.id === g.plan_id)?.model === "live_auction");
        const today = new Date();
        const prominent = liveGroups.some((g) => {
          if (auctions.some((a) => a.group_id === g.id && a.status !== "closed")) return true;
          const day = Math.min(g.monthly_collection_date || 1, 28);
          const next = new Date(today.getFullYear(), today.getMonth(), day);
          if (next < today) next.setMonth(next.getMonth() + 1);
          return Math.round((next - today) / 86400000) <= 3;
        });
        setAuctionProminent(prominent);
      } catch {
        setAuctionProminent(false);
      }
      // Keyed on user.id, not the `user` object itself — base44.auth.me()
      // returns a fresh object on every call (line 24 refires it on every
      // navigation), which was re-triggering this whole fetch chain on
      // every single page change.
    })();
  }, [user?.id, isStaff]);

  // Block non-staff from admin routes
  if (user && !isStaff && location.pathname.startsWith("/admin")) {
    return <Navigate to="/dashboard" replace />;
  }

  const nav = isStaff
    ? [
        { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
        { to: "/admin/members", label: "Members", icon: Users },
        { to: "/admin/plan-requests", label: "Plan Requests", icon: Inbox },
        { to: "/admin/plans", label: "Savings Plans", icon: Landmark },
        { to: "/admin/groups", label: "Groups", icon: UsersRound },
        { to: "/admin/payments", label: "Payments", icon: CreditCard },
        { to: "/admin/winners", label: "Winners", icon: Trophy },
        { to: "/admin/auction-plan", label: "Auction Plan", icon: Calendar },
        { to: "/admin/live-auction", label: "Live Auction", icon: Gavel },
        { to: "/admin/reports", label: "Reports", icon: BarChart3 },
        { to: "/admin/audit", label: "Audit Trail", icon: ScrollText },
        { to: "/admin/notifications", label: "Communications", icon: MessageSquare },
        { to: "/admin/reminders", label: "Send Reminders", icon: Bell },
        { to: "/admin/cleanup", label: "Data Cleanup", icon: Trash2 },
      ]
    : [
        { to: "/dashboard", label: "Home", icon: LayoutDashboard },
        { to: "/my-chits", label: "My Chit", icon: Layers },
        { to: "/live-auction", label: "Auction", icon: Gavel, badge: auctionProminent },
        { to: "/payments", label: "Payments", icon: CreditCard },
        { to: "/profile", label: "Profile", icon: User },
      ];

  const filteredNav = navQuery.trim()
    ? nav.filter((n) => n.label.toLowerCase().includes(navQuery.trim().toLowerCase()))
    : nav;

  const displayName = user?.full_name || user?.email || "Account";
  const initials = displayName.trim().charAt(0).toUpperCase() || "?";
  const roleLabel = user?.app_role
    ? user.app_role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : isStaff ? "Admin" : "Member";

  return (
    <AdminCountryProvider>
      <div className="min-h-screen bg-background lg:flex">
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <aside
          className={`fixed lg:sticky top-0 left-0 h-screen z-50 flex flex-col shrink-0 bg-card border-r border-border transition-[width,transform] duration-200 ease-out w-64 ${
            collapsed ? "lg:w-20" : "lg:w-64"
          } ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        >
          <div className="h-16 flex items-center justify-between px-4 border-b border-border shrink-0">
            <Link to="/" className={`flex items-center min-w-0 ${collapsed ? "lg:hidden" : ""}`}>
              <Logo />
            </Link>
            <button
              onClick={() => setMobileOpen(false)}
              className="lg:hidden w-9 h-9 rounded-lg grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="hidden lg:grid w-9 h-9 rounded-lg place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronsRight className="w-5 h-5" /> : <ChevronsLeft className="w-5 h-5" />}
            </button>
          </div>

          <div className={`px-4 py-3 shrink-0 ${collapsed ? "lg:hidden" : ""}`}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={navQuery}
                onChange={(e) => setNavQuery(e.target.value)}
                placeholder="Search menu…"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 space-y-1">
            {filteredNav.length === 0 && (
              <p className={`px-3 py-2 text-xs text-muted-foreground ${collapsed ? "lg:hidden" : ""}`}>No matches.</p>
            )}
            {filteredNav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                title={n.label}
                className={`flex items-center gap-3 rounded-xl text-sm font-medium transition-colors px-3 py-2.5 ${
                  collapsed ? "lg:justify-center lg:px-0" : ""
                } ${
                  location.pathname === n.to ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
                }`}
              >
                <NavIcon icon={n.icon} className="w-5 h-5 shrink-0" badge={n.badge} />
                <span className={`truncate ${collapsed ? "lg:hidden" : ""}`}>{n.label}</span>
              </Link>
            ))}
          </nav>

          <div className="border-t border-border p-3 space-y-3 shrink-0">
            {isStaff && (
              <div className={collapsed ? "lg:hidden" : ""}>
                <CountrySwitcher />
              </div>
            )}
            <div className={`flex items-center justify-between ${collapsed ? "lg:justify-center" : ""}`}>
              <ThemeToggle />
              <span className={`text-xs text-muted-foreground ${collapsed ? "lg:hidden" : ""}`}>Theme</span>
            </div>
            <div className={`flex items-center gap-3 rounded-xl ${collapsed ? "lg:justify-center" : ""}`}>
              <span className="w-9 h-9 rounded-full bg-primary/10 text-primary grid place-items-center text-sm font-semibold shrink-0">
                {initials}
              </span>
              <div className={`min-w-0 flex-1 ${collapsed ? "lg:hidden" : ""}`}>
                <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{roleLabel}</p>
              </div>
              <button
                onClick={() => base44.auth.logout("/login")}
                title="Sign out"
                className={`w-8 h-8 rounded-lg grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 ${
                  collapsed ? "lg:hidden" : ""
                }`}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <div className="lg:hidden sticky top-0 z-30 h-14 bg-card border-b border-border flex items-center px-4 gap-3">
            <button onClick={() => setMobileOpen(true)} className="text-foreground" aria-label="Open menu">
              <Menu className="w-5 h-5" />
            </button>
            <Logo />
          </div>
          <main className="max-w-7xl mx-auto px-5 py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </AdminCountryProvider>
  );
}
