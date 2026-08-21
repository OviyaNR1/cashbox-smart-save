import React from "react";
import { Globe } from "lucide-react";
import Logo from "@/components/Logo";

export default function CountrySelection({ onSelect }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-5">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <Logo />
          </div>
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-4">
            <Globe className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Welcome to CashBox</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Where would you like to save money?
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => onSelect("IN")}
            className="bg-card rounded-2xl border border-border p-6 text-center hover:border-primary/40 hover:bg-muted/30 transition-all"
          >
            <div className="text-4xl mb-2">🇮🇳</div>
            <p className="font-semibold text-foreground">India</p>
            <p className="text-xs text-muted-foreground mt-1">Save in ₹ INR</p>
          </button>
          <button
            onClick={() => onSelect("CA")}
            className="bg-card rounded-2xl border border-border p-6 text-center hover:border-primary/40 hover:bg-muted/30 transition-all"
          >
            <div className="text-4xl mb-2">🇨🇦</div>
            <p className="font-semibold text-foreground">Canada</p>
            <p className="text-xs text-muted-foreground mt-1">Save in $ CAD</p>
          </button>
        </div>
      </div>
    </div>
  );
}