import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { ScrollText, Search } from "lucide-react";

export default function AuditLog() {
  const [logs, setLogs] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    base44.entities.AuditLog.list("-created_date", 500).then(setLogs);
  }, []);

  const filtered = (logs || []).filter((l) => {
    const s = `${l.action} ${l.module} ${l.actor_email} ${l.details || ""}`.toLowerCase();
    return s.includes(q.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-primary">Admin</p>
        <h1 className="text-3xl font-semibold text-foreground mt-1">Audit log</h1>
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-foreground" />
          <p className="text-sm font-medium text-foreground">Activity trail</p>
          <div className="ml-auto relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="h-9 w-56 rounded-full border border-border bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/70 text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-3">When</th>
                <th className="text-left px-5 py-3">Actor</th>
                <th className="text-left px-5 py-3">Module</th>
                <th className="text-left px-5 py-3">Action</th>
                <th className="text-left px-5 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((l) => (
                <tr key={l.id}>
                  <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">
                    {l.created_at ? new Date(l.created_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-5 py-3 text-foreground">{l.actor_email || "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{l.module || "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{l.action}</td>
                  <td className="px-5 py-3 text-muted-foreground">{l.details || "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">No matching log entries.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}