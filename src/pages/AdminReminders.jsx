import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { MessageCircle, Send, Users, Eye, ChevronDown, ChevronUp } from "lucide-react";
import {
  computePaymentReminderTargets, sendPaymentReminders,
  computeAuctionReminderTargets, sendAuctionReminders,
  computeUpcomingDueTargets, sendUpcomingDueReminders,
} from "@/lib/sendReminders";
import { collectionDateUTC } from "@/lib/dates";
import { renderTemplateBody, paramLabelsFor } from "@/lib/templatePreviews";

// Turns WhatsApp's own *bold* markdown into real bold for the preview —
// this is the exact same body text Meta will send, just rendered instead
// of shown as raw asterisks.
function WhatsAppBubble({ text }) {
  if (!text) return null;
  return (
    <div className="rounded-xl bg-[#e7ffdb] dark:bg-emerald-950/40 border border-emerald-900/10 px-3.5 py-2.5 text-sm text-foreground whitespace-pre-wrap break-words">
      {text.split("\n").map((line, i) => (
        <React.Fragment key={i}>
          {i > 0 && <br />}
          {line.split(/(\*[^*]+\*)/g).map((part, j) =>
            part.startsWith("*") && part.endsWith("*") && part.length > 1
              ? <strong key={j}>{part.slice(1, -1)}</strong>
              : <React.Fragment key={j}>{part}</React.Fragment>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// "YYYY-MM-DD" -> "5 Sept 2026", read directly from the string's own
// components rather than through a local-timezone Date conversion — see
// dates.js for why that silently shifts the day for viewers west of UTC.
function formatUTCDateStr(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

// Every reminder is a two-step action: preview computes exactly who would
// receive one and what it says, with nothing sent yet; only "Confirm & Send"
// actually dispatches messages, using that exact previewed list — so what
// goes out always matches what was reviewed, never a silently recomputed one.
export default function AdminReminders() {
  const { toast } = useToast();
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [previewing, setPreviewing] = useState(null);
  const [sending, setSending] = useState(false);
  // { type: "payment" | "auction" | "upcoming", targets: [...] }
  const [preview, setPreview] = useState(null);
  // Which target's message preview/edit panel is open — only one at a time,
  // both to keep the list scannable and because editing several at once
  // with no per-row "saved" indicator would be easy to lose track of.
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    base44.entities.ChitGroup.list("-created_date", 100).then(setGroups);
  }, []);

  const resetPreview = () => { setPreview(null); setExpandedId(null); };

  // Edits a single {{n}} value for one target — auction reminders have no
  // preview template mapped (their content is just a static link), so this
  // only ever applies to payment/upcoming targets in practice.
  const updateTargetParam = (memberProfileId, paramIndex, value) => {
    setPreview((p) => ({
      ...p,
      targets: p.targets.map((t) =>
        t.memberProfileId === memberProfileId
          ? { ...t, parameters: t.parameters.map((v, i) => (i === paramIndex ? value : v)) }
          : t
      ),
    }));
  };

  const runPreview = async (type) => {
    if (!selectedGroup) {
      toast({ title: "Select a group first", variant: "destructive" });
      return;
    }
    setPreviewing(type);
    setPreview(null);
    try {
      let targets;
      if (type === "payment") targets = await computePaymentReminderTargets(selectedGroup.id);
      else if (type === "auction") targets = (await computeAuctionReminderTargets(selectedGroup.id)).targets;
      else targets = await computeUpcomingDueTargets(selectedGroup.id, 1);
      setPreview({ type, targets });
      if (targets.length === 0) {
        toast({ title: "No one to remind right now", description: reasonForEmpty(type) });
      }
    } catch (error) {
      toast({ title: "Couldn't check who's due a reminder", description: error.message, variant: "destructive" });
    }
    setPreviewing(null);
  };

  const confirmSend = async () => {
    if (!preview || !selectedGroup) return;
    setSending(true);
    try {
      const sendFn = preview.type === "payment" ? sendPaymentReminders
        : preview.type === "auction" ? sendAuctionReminders
        : sendUpcomingDueReminders;
      const result = await sendFn(selectedGroup.id, preview.targets);
      toast({
        title: `Sent ${result.sent} reminder${result.sent === 1 ? "" : "s"}`,
        description: result.failed ? `${result.failed} failed` : "All sent successfully",
      });
      resetPreview();
    } catch (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
    setSending(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-primary">Admin</p>
        <h1 className="text-3xl font-semibold text-foreground mt-1">Send Reminders</h1>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 space-y-2">
        <p className="text-sm text-blue-300">
          <strong>Upcoming Due:</strong> 1 day before the due date, to anyone who hasn't paid yet
        </p>
        <p className="text-sm text-blue-300">
          <strong>Payment Reminders:</strong> Automatically finds unpaid members and sends based on days late
        </p>
        <p className="text-sm text-blue-300">
          <strong>Auction Reminders:</strong> Sends to all members about an upcoming auction
        </p>
      </div>

      <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
        <div>
          <label className="text-sm font-semibold text-foreground">Select Group</label>
          <select
            value={selectedGroup?.id || ""}
            onChange={(e) => { setSelectedGroup(groups.find((g) => g.id === e.target.value)); resetPreview(); }}
            className="w-full mt-2 px-4 py-2 rounded-lg border border-border bg-background text-foreground"
          >
            <option value="">Choose a group...</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.group_code} - {g.group_name}</option>
            ))}
          </select>
        </div>

        {selectedGroup && (
          <div className="p-4 bg-primary/5 rounded-lg border border-primary/20 space-y-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{selectedGroup.group_name}</p>
              <p className="text-xs text-muted-foreground">
                This month's due date: {formatUTCDateStr(collectionDateUTC(selectedGroup.start_date, selectedGroup.current_month - 1, selectedGroup.monthly_collection_date))}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Button variant="outline" onClick={() => runPreview("upcoming")} disabled={previewing === "upcoming"} className="rounded-lg">
                <Eye className="w-4 h-4 mr-2" /> {previewing === "upcoming" ? "Checking..." : "Preview Upcoming Due"}
              </Button>
              <Button variant="outline" onClick={() => runPreview("payment")} disabled={previewing === "payment"} className="rounded-lg">
                <Eye className="w-4 h-4 mr-2" /> {previewing === "payment" ? "Checking..." : "Preview Payment Reminders"}
              </Button>
              <Button variant="outline" onClick={() => runPreview("auction")} disabled={previewing === "auction"} className="rounded-lg">
                <Eye className="w-4 h-4 mr-2" /> {previewing === "auction" ? "Checking..." : "Preview Auction Reminders"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {preview && (
        <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              {preview.targets.length} member{preview.targets.length === 1 ? "" : "s"} will receive {preview.type === "auction" ? "an" : "a"} {previewLabel(preview.type)} reminder
            </p>
            <button onClick={resetPreview} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
          </div>

          {preview.targets.length > 0 && (
            <div className="rounded-xl border border-border divide-y divide-border overflow-hidden max-h-[28rem] overflow-y-auto">
              {preview.targets.map((t) => {
                const isOpen = expandedId === t.memberProfileId;
                const labels = paramLabelsFor(t.template);
                const hasPreview = labels.length > 0;
                return (
                  <div key={t.memberProfileId}>
                    <button
                      type="button"
                      onClick={() => hasPreview && setExpandedId(isOpen ? null : t.memberProfileId)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left ${hasPreview ? "hover:bg-muted/50" : "cursor-default"}`}
                    >
                      <div>
                        <p className="text-foreground font-medium">{t.fullName}</p>
                        <p className="text-xs text-muted-foreground">{t.mobile}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground text-right">
                          {preview.type === "payment" && `${t.daysLate} day${t.daysLate === 1 ? "" : "s"} late · ${t.amountStr}`}
                          {preview.type === "upcoming" && `Due ${t.dueDateStr} · ${t.amountStr}`}
                          {preview.type === "auction" && "Auction reminder"}
                        </p>
                        {hasPreview && (isOpen ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />)}
                      </div>
                    </button>

                    {isOpen && hasPreview && (
                      <div className="px-4 pb-4 pt-1 space-y-3 bg-muted/20">
                        <WhatsAppBubble text={renderTemplateBody(t.template, t.parameters)} />
                        <div className="space-y-2">
                          {labels.map((label, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <label className="text-xs text-muted-foreground w-28 shrink-0">{label}</label>
                              <Input
                                value={t.parameters[i] ?? ""}
                                onChange={(e) => updateTargetParam(t.memberProfileId, i, e.target.value)}
                                className="h-8 text-xs"
                              />
                            </div>
                          ))}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Editing here only changes this member's message — the fixed wording comes from the approved WhatsApp template and can't be rewritten, only these values.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {preview.targets.length > 0 && (
            <Button
              onClick={confirmSend}
              disabled={sending}
              className="w-full bg-orange-600 hover:bg-orange-700 rounded-lg"
            >
              <Send className="w-4 h-4 mr-2" />
              {sending ? "Sending..." : `Confirm & Send ${preview.targets.length} Reminder${preview.targets.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function previewLabel(type) {
  if (type === "payment") return "overdue payment";
  if (type === "upcoming") return "upcoming-due";
  return "auction";
}

function reasonForEmpty(type) {
  if (type === "payment") return "Nobody in this group is currently past their due date.";
  if (type === "upcoming") return "Nobody's payment is due exactly 1 day from now, or everyone due has already paid.";
  return "This group has no live auction currently open, or every member has already paid this month's dues.";
}
