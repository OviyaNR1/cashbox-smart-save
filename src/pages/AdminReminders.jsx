import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { MessageCircle, Send } from "lucide-react";
import { sendPaymentReminders, sendAuctionReminders } from "@/lib/sendReminders";

export default function AdminReminders() {
  const { toast } = useToast();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [sending, setSending] = useState(null);

  useEffect(() => {
    base44.entities.ChitGroup.list("-created_date", 100).then(setGroups);
  }, []);

  const handlePaymentReminders = async () => {
    if (!selectedGroup) {
      toast({ title: "Select a group first", variant: "destructive" });
      return;
    }
    setSending("payment");
    try {
      const result = await sendPaymentReminders(selectedGroup.id);
      toast({
        title: `Sent ${result.sent} reminders`,
        description: result.failed ? `${result.failed} failed` : "All sent successfully",
      });
    } catch (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
    setSending(null);
  };

  const handleAuctionReminders = async () => {
    if (!selectedGroup) {
      toast({ title: "Select a group first", variant: "destructive" });
      return;
    }
    setSending("auction");
    try {
      const result = await sendAuctionReminders(selectedGroup.id);
      toast({
        title: `Sent ${result.sent} auction reminders`,
        description: result.failed ? `${result.failed} failed` : "All sent successfully",
      });
    } catch (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
    setSending(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-primary">Admin</p>
        <h1 className="text-3xl font-semibold text-foreground mt-1">Send Reminders</h1>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4">
        <p className="text-sm text-blue-300">
          <strong>Payment Reminders:</strong> Automatically finds unpaid members and sends based on days late
        </p>
        <p className="text-sm text-blue-300 mt-2">
          <strong>Auction Reminders:</strong> Sends to all members about upcoming auction
        </p>
      </div>

      <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
        <div>
          <label className="text-sm font-semibold text-foreground">Select Group</label>
          <select
            value={selectedGroup?.id || ""}
            onChange={(e) => setSelectedGroup(groups.find((g) => g.id === e.target.value))}
            className="w-full mt-2 px-4 py-2 rounded-lg border border-border bg-background text-foreground"
          >
            <option value="">Choose a group...</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.group_code} - {g.group_name}
              </option>
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

            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={handlePaymentReminders}
                disabled={sending === "payment"}
                className="bg-orange-600 hover:bg-orange-700 rounded-lg"
              >
                <Send className="w-4 h-4 mr-2" />
                {sending === "payment" ? "Sending..." : "Send Payment Reminders"}
              </Button>

              <Button
                onClick={handleAuctionReminders}
                disabled={sending === "auction"}
                className="bg-green-600 hover:bg-green-700 rounded-lg"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                {sending === "auction" ? "Sending..." : "Send Auction Reminders"}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              ✓ Payment reminders auto-calculate days late and send only to unpaid members
            </p>
            <p className="text-xs text-muted-foreground">
              ✓ Auction reminders send to all members with upcoming auction details
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
