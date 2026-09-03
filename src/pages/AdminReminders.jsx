import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { MessageCircle, Send, Users, Eye } from "lucide-react";
import {
  computePaymentReminderTargets, sendPaymentReminders,
  computeAuctionReminderTargets, sendAuctionReminders,
  computeUpcomingDueTargets, sendUpcomingDueReminders,
} from "@/lib/sendReminders";

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

  useEffect(() => {
    base44.entities.ChitGroup.list("-created_date", 100).then(setGroups);
  }, []);

  const resetPreview = () => setPreview(null);

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
                Collection Date: {new Date(selectedGroup.start_date).toLocaleDateString()}
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
              {preview.targets.length} member{preview.targets.length === 1 ? "" : "s"} will receive a {previewLabel(preview.type)} reminder
            </p>
            <button onClick={resetPreview} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
          </div>

          {preview.targets.length > 0 && (
            <div className="rounded-xl border border-border divide-y divide-border overflow-hidden max-h-80 overflow-y-auto">
              {preview.targets.map((t) => (
                <div key={t.memberProfileId} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div>
                    <p className="text-foreground font-medium">{t.fullName}</p>
                    <p className="text-xs text-muted-foreground">{t.mobile}</p>
                  </div>
                  <p className="text-xs text-muted-foreground text-right">
                    {preview.type === "payment" && `${t.daysLate} day${t.daysLate === 1 ? "" : "s"} late · ${t.amountStr}`}
                    {preview.type === "upcoming" && `Due ${t.dueDateStr} · ${t.amountStr}`}
                    {preview.type === "auction" && "Auction reminder"}
                  </p>
                </div>
              ))}
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
