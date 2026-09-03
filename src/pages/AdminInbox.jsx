import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { sendWhatsAppMessage } from "@/lib/sendWhatsAppMessage";
import { logAudit } from "@/lib/audit";
import { useToast } from "@/components/ui/use-toast";
import { Inbox, Send, Loader2, User } from "lucide-react";

// Replying here is a free-form text message, not a template — WhatsApp
// allows that without cost or pre-approval as long as it's within 24 hours
// of the customer's own last message ("customer service window"). Outside
// that window this send will simply fail; there's no way around that except
// a template, which doesn't fit a real back-and-forth reply.
export default function AdminInbox() {
  const { toast } = useToast();
  const [messages, setMessages] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [selectedPhone, setSelectedPhone] = useState(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = () => {
    Promise.all([
      base44.entities.WhatsAppInboundMessage.list("-created_date", 500),
      base44.entities.MemberProfile.list("-created_date", 500),
    ]).then(([msgs, profs]) => {
      setMessages(msgs);
      setProfiles(profs);
    });
  };

  useEffect(() => { load(); }, []);

  const profileFor = (m) => {
    if (m.matched_member_profile_id) return profiles.find((p) => p.id === m.matched_member_profile_id);
    // Older rows saved before the webhook matched senders — fall back to a
    // live lookup by phone so they still show a name instead of just a number.
    return profiles.find((p) => (p.mobile || "").replace(/^\+/, "") === m.from_phone);
  };

  // One row per sender, newest message first, so the inbox reads as a
  // conversation list rather than a flat, repeats-the-same-number-many-times
  // message log.
  const conversations = useMemo(() => {
    if (!messages) return [];
    const byPhone = {};
    for (const m of messages) {
      if (!byPhone[m.from_phone] || new Date(m.created_at) > new Date(byPhone[m.from_phone].created_at)) {
        byPhone[m.from_phone] = m;
      }
    }
    return Object.values(byPhone).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [messages]);

  const thread = useMemo(() => {
    if (!messages || !selectedPhone) return [];
    return messages
      .filter((m) => m.from_phone === selectedPhone)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }, [messages, selectedPhone]);

  const selectedProfile = thread.length ? profileFor(thread[thread.length - 1]) : null;

  const sendReply = async () => {
    if (!reply.trim() || !selectedPhone) return;
    setSending(true);
    try {
      await sendWhatsAppMessage({ phone: `+${selectedPhone}`, message: reply.trim() });
      // Attached to the latest message in the thread — marks the
      // conversation "caught up" rather than tracking a reply per message.
      const latest = thread[thread.length - 1];
      await base44.entities.WhatsAppInboundMessage.update(latest.id, { reply_sent: reply.trim() });
      logAudit({
        module: "Inbox", action: "reply", record_id: latest.id,
        details: `Replied to ${selectedProfile?.full_name || selectedPhone}: "${reply.trim()}"`,
      });
      setReply("");
      load();
      toast({ title: "Reply sent" });
    } catch (err) {
      toast({
        title: "Couldn't send reply",
        description: err.message?.includes("24") || err.message?.includes("window")
          ? "This conversation is outside WhatsApp's 24-hour reply window — they'd need to message again first."
          : err.message,
        variant: "destructive",
      });
    }
    setSending(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-primary">Admin</p>
        <h1 className="text-3xl font-semibold text-foreground mt-1">Inbox</h1>
        <p className="text-sm text-muted-foreground mt-1">Incoming WhatsApp messages from members</p>
      </div>

      <div className="grid md:grid-cols-[320px_1fr] gap-4 bg-card rounded-2xl border border-border overflow-hidden" style={{ minHeight: 480 }}>
        <div className="border-r border-border overflow-y-auto max-h-[70vh]">
          {messages === null ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <Inbox className="w-6 h-6 opacity-50" />
              No messages yet.
            </div>
          ) : (
            conversations.map((m) => {
              const prof = profileFor(m);
              const isSelected = selectedPhone === m.from_phone;
              const awaitingReply = !m.reply_sent;
              return (
                <button
                  key={m.from_phone}
                  onClick={() => setSelectedPhone(m.from_phone)}
                  className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/40 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{prof?.full_name || `+${m.from_phone}`}</p>
                    {awaitingReply && <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{m.body || "(non-text message)"}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1">{new Date(m.created_at).toLocaleString()}</p>
                </button>
              );
            })
          )}
        </div>

        <div className="flex flex-col">
          {!selectedPhone ? (
            <div className="flex-1 grid place-items-center text-sm text-muted-foreground">
              Select a conversation to view it
            </div>
          ) : (
            <>
              <div className="px-5 py-3 border-b border-border flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">{selectedProfile?.full_name || `+${selectedPhone}`}</p>
                <p className="text-xs text-muted-foreground">+{selectedPhone}</p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[50vh]">
                {thread.map((m) => (
                  <div key={m.id} className="space-y-1.5">
                    <div className="bg-muted/50 rounded-xl rounded-tl-sm px-3 py-2 max-w-[80%] text-sm text-foreground">
                      {m.body || "(non-text message)"}
                      <p className="text-[10px] text-muted-foreground mt-1">{new Date(m.created_at).toLocaleString()}</p>
                    </div>
                    {m.reply_sent && (
                      <div className="bg-primary/10 rounded-xl rounded-tr-sm px-3 py-2 max-w-[80%] text-sm text-foreground ml-auto">
                        {m.reply_sent}
                        <p className="text-[10px] text-muted-foreground mt-1 text-right">You</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-border flex gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Type a reply…"
                  rows={2}
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  onClick={sendReply}
                  disabled={sending || !reply.trim()}
                  className="px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5 self-end h-10"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
