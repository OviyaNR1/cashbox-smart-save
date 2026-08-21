import React, { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle({ className = "" }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid a hydration/flash mismatch — next-themes only knows the real
  // theme after mount.
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className={`w-9 h-9 ${className}`} />;

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`w-9 h-9 rounded-full border border-border grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ${className}`}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle theme"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
