import React from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export default function CollectionChart({ data }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <p className="text-sm font-medium text-foreground">Collection trend</p>
      <p className="text-xs text-muted-foreground mb-4">Successful collections per month</p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="lb" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffb833" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#ffb833" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: "rgba(255,255,255,0.5)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: "rgba(255,255,255,0.5)" }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => `₹${Number(v).toLocaleString("en-IN")}`} />
            <Area type="monotone" dataKey="amount" stroke="#ffb833" strokeWidth={2} fill="url(#lb)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}