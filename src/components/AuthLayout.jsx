import React from "react";
import Logo from "@/components/Logo";
import WhatsAppBrowserTip from "@/components/WhatsAppBrowserTip";

export default function AuthLayout({ icon: Icon, title, subtitle, badge, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <Logo variant="light" className="text-2xl mb-4" />
          {badge && <div className="flex justify-center mb-4">{badge}</div>}
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
        </div>
        {/* Every reminder link lands someone here first if their session
            expired — the earliest possible point to tell someone stuck in
            WhatsApp's in-app browser how to get out. */}
        <WhatsAppBrowserTip />
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}