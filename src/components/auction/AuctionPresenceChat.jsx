import React, { useEffect, useRef, useState } from "react";
import { base44, supabase } from "@/api/base44Client";
import { getSignedUrl, uploadAuctionVoiceMessage } from "@/lib/storage";
import { playMemberJoin, playMemberLeave, playMention, playNewMessage, primeAudio } from "@/lib/sound";
import { Users, Send, MessageCircle, X, Mic, Square } from "lucide-react";

// Presence channels reconnect on their own well within the lifetime of a
// real session — a spotty mobile connection, the tab going to the background
// and back, a websocket hiccup — and each reconnect looks identical to a
// genuine leave-then-rejoin. Logging a message on every one of those would
// spam the feed with "X left" / "X joined" pairs a few seconds apart even
// though the person never actually left. Module-level (not per-component
// instance) so it survives a full component remount, not just an effect
// re-run: delay writing "leave" long enough for a matching reconnect "join"
// to cancel it out instead of logging either one.
const pendingLeaves = new Map();
const LEAVE_GRACE_MS = 7000;

const formatTime = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

// Live "who's watching this auction" + a persisted chat/activity feed,
// rendered as a floating widget (like a support-chat bubble) rather than
// inline content — an always-open panel pushed the page a full screen
// taller, which is exactly what a "just tap to check who's here" feature
// shouldn't do. Presence (the live "N here" list) is ephemeral, driven by
// Supabase Realtime's Presence API; join/leave/chat/voice entries are also
// written to auction_messages so anyone opening the panel mid-auction sees
// the full history, not just what happens after they open it.
export default function AuctionPresenceChat({ auctionId, groupId, userId, memberProfileId, senderName, onJoin, onPresenceChange }) {
  const [open, setOpen] = useState(false);
  const [present, setPresent] = useState([]);
  const [messages, setMessages] = useState([]);
  const [audioUrls, setAudioUrls] = useState({});
  const [unseen, setUnseen] = useState(0);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState("");
  const [mentionQuery, setMentionQuery] = useState(null);
  const feedRef = useRef(null);
  const openRef = useRef(open);
  const inputRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const onJoinRef = useRef(onJoin);
  const onPresenceChangeRef = useRef(onPresenceChange);
  openRef.current = open;
  onJoinRef.current = onJoin;
  onPresenceChangeRef.current = onPresenceChange;

  // Unlock audio playback from whatever the first real interaction with the
  // page turns out to be — a nav click, opening the panel, anything —
  // rather than depending on the join/leave sound's own (nonexistent, since
  // it's triggered by someone else's action) click to do it.
  useEffect(() => {
    const prime = () => primeAudio();
    document.addEventListener("pointerdown", prime, { once: true });
    return () => document.removeEventListener("pointerdown", prime);
  }, []);

  useEffect(() => {
    if (!auctionId || !userId || !senderName) return;
    let cancelled = false;

    base44.entities.AuctionMessage.filter({ auction_id: auctionId }, "created_date", 200)
      .then((rows) => { if (!cancelled) setMessages(rows); })
      .catch(() => {});

    const logEvent = (message_type, extra = {}) =>
      base44.entities.AuctionMessage.create({
        auction_id: auctionId,
        group_id: groupId,
        member_profile_id: memberProfileId || null,
        user_id: userId,
        sender_name: senderName,
        message_type,
        body: null,
        ...extra,
      }).catch(() => {});

    const roomKey = `${auctionId}:${userId}`;
    const logJoin = () => {
      const pending = pendingLeaves.get(roomKey);
      if (pending) {
        // A "leave" from moments ago is still waiting out its grace period —
        // this is that same session reconnecting, not a new visit. Cancel
        // the leave and don't log a fresh join either.
        clearTimeout(pending.timer);
        pendingLeaves.delete(roomKey);
        return;
      }
      logEvent("join");
    };
    const scheduleLeave = () => {
      const timer = setTimeout(() => {
        pendingLeaves.delete(roomKey);
        logEvent("leave");
      }, LEAVE_GRACE_MS);
      pendingLeaves.set(roomKey, { timer });
    };

    const channel = supabase.channel(`auction-room-${auctionId}`, {
      config: { presence: { key: userId } },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const list = Object.values(state).map((entries) => entries[0]);
      setPresent(list);
      onPresenceChangeRef.current?.(list.length);
    });

    // Separate from "sync" — these fire only for the delta, which is what a
    // per-arrival/departure sound needs. Filtered to skip your own join
    // (Presence echoes your own track() back to you too).
    channel.on("presence", { event: "join" }, ({ key, newPresences }) => {
      if (key === userId) return;
      playMemberJoin();
      const joinedName = newPresences?.[0]?.name;
      if (joinedName) onJoinRef.current?.(joinedName);
    });
    channel.on("presence", { event: "leave" }, ({ key }) => {
      if (key !== userId) playMemberLeave();
    });

    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "auction_messages", filter: `auction_id=eq.${auctionId}` },
      (payload) => {
        const m = payload.new;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        const iWasMentioned = m.sender_name !== senderName && m.body && m.body.includes(`@${senderName}`);
        if (m.sender_name !== senderName) {
          if (iWasMentioned) playMention();
          else if (m.message_type === "chat" || m.message_type === "voice") playNewMessage();
        }
        if (!openRef.current && m.sender_name !== senderName) setUnseen((n) => n + 1);
      }
    );

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel.track({ name: senderName });
        logJoin();
      }
    });

    return () => {
      cancelled = true;
      scheduleLeave();
      supabase.removeChannel(channel);
    };
  }, [auctionId, groupId, userId, memberProfileId, senderName]);

  // Voice clips live in a private bucket — resolve a signed URL for any
  // voice message that doesn't have one cached yet.
  useEffect(() => {
    const pending = messages.filter((m) => m.message_type === "voice" && m.audio_path && !audioUrls[m.id]);
    if (!pending.length) return;
    let cancelled = false;
    Promise.all(
      pending.map((m) =>
        getSignedUrl("auction-voice-messages", m.audio_path).then((url) => [m.id, url]).catch(() => [m.id, null])
      )
    ).then((pairs) => {
      if (cancelled) return;
      setAudioUrls((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
    });
    return () => { cancelled = true; };
  }, [messages, audioUrls]);

  useEffect(() => {
    if (open) {
      setUnseen(0);
      feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
    }
  }, [open, messages]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      await base44.entities.AuctionMessage.create({
        auction_id: auctionId,
        group_id: groupId,
        member_profile_id: memberProfileId || null,
        user_id: userId,
        sender_name: senderName,
        message_type: "chat",
        body,
      });
      setText("");
      setMentionQuery(null);
    } catch {
      // Best-effort — a dropped chat message isn't worth blocking the UI over.
    }
    setSending(false);
  };

  const onTextChange = (e) => {
    const value = e.target.value;
    setText(value);
    const cursor = e.target.selectionStart ?? value.length;
    const upToCursor = value.slice(0, cursor);
    const match = /@([\w]*)$/.exec(upToCursor);
    setMentionQuery(match ? match[1] : null);
  };

  const insertMention = (name) => {
    const input = inputRef.current;
    const cursor = input?.selectionStart ?? text.length;
    const upToCursor = text.slice(0, cursor);
    const replaced = upToCursor.replace(/@([\w]*)$/, `@${name} `);
    const next = replaced + text.slice(cursor);
    setText(next);
    setMentionQuery(null);
    input?.focus();
  };

  const startRecording = async () => {
    setRecordError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) return;
        try {
          const path = await uploadAuctionVoiceMessage(auctionId, blob);
          await base44.entities.AuctionMessage.create({
            auction_id: auctionId,
            group_id: groupId,
            member_profile_id: memberProfileId || null,
            user_id: userId,
            sender_name: senderName,
            message_type: "voice",
            body: null,
            audio_path: path,
          });
        } catch {
          setRecordError("Couldn't send voice message.");
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setRecordError("Microphone access denied or unavailable.");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const renderBody = (body) => {
    if (!body) return null;
    const parts = body.split(/(@[\w]+(?:\s[\w]+)?)/g);
    return parts.map((part, i) =>
      part.startsWith("@") ? (
        <span key={i} className="text-primary font-medium">{part}</span>
      ) : (
        part
      )
    );
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 pl-3 pr-4 h-11 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
      >
        <span className="relative">
          <MessageCircle className="w-4 h-4" />
          {present.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full bg-emerald-400" />
          )}
        </span>
        <span className="text-xs font-semibold">
          {present.length} live{unseen > 0 ? ` · ${unseen} new` : ""}
        </span>
      </button>
    );
  }

  const mentionCandidates =
    mentionQuery === null
      ? []
      : present.filter((p) => p.name?.toLowerCase().includes(mentionQuery.toLowerCase()) && p.name !== senderName);

  return (
    <div className="fixed bottom-5 right-5 z-40 w-72 max-w-[calc(100vw-2.5rem)] max-h-[28rem] bg-card border border-border rounded-2xl shadow-lg flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <p className="text-sm font-medium text-foreground flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" /> Live now
        </p>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            {present.length}
          </span>
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {present.length > 0 && (
        <p className="px-4 py-2 text-xs text-muted-foreground border-b border-border shrink-0 truncate">
          {present.map((p) => p.name).join(", ")}
        </p>
      )}

      <div ref={feedRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No activity yet.</p>
        )}
        {messages.map((m) => {
          if (m.message_type === "chat") {
            return (
              <div key={m.id} className="text-sm">
                <span className="font-medium text-foreground">{m.sender_name}: </span>
                <span className="text-muted-foreground">{renderBody(m.body)}</span>
                <span className="text-[10px] text-muted-foreground/60 ml-1.5 align-middle">{formatTime(m.created_at)}</span>
              </div>
            );
          }
          if (m.message_type === "voice") {
            return (
              <div key={m.id} className="text-sm">
                <span className="font-medium text-foreground block mb-1">
                  {m.sender_name}: <span className="text-[10px] text-muted-foreground/60 font-normal">{formatTime(m.created_at)}</span>
                </span>
                {audioUrls[m.id] ? (
                  <audio controls src={audioUrls[m.id]} className="w-full h-8" />
                ) : (
                  <span className="text-xs text-muted-foreground">Loading voice message…</span>
                )}
              </div>
            );
          }
          return (
            <p key={m.id} className="text-xs text-center text-muted-foreground/70">
              {m.sender_name} {m.message_type === "join" ? "joined" : "left"} · {formatTime(m.created_at)}
            </p>
          );
        })}
      </div>

      {recordError && <p className="px-4 pb-1 text-xs text-destructive shrink-0">{recordError}</p>}

      <div className="relative shrink-0">
        {mentionQuery !== null && mentionCandidates.length > 0 && (
          <div className="absolute bottom-full left-4 right-4 mb-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
            {mentionCandidates.map((p) => (
              <button
                key={p.name}
                onClick={() => insertMention(p.name)}
                className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted"
              >
                @{p.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
          {recording ? (
            <button
              onClick={stopRecording}
              className="w-9 h-9 shrink-0 rounded-lg bg-destructive text-destructive-foreground grid place-items-center animate-pulse"
              title="Stop recording"
            >
              <Square className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={startRecording}
              className="w-9 h-9 shrink-0 rounded-lg border border-border text-foreground grid place-items-center hover:bg-muted"
              title="Record a voice message"
            >
              <Mic className="w-4 h-4" />
            </button>
          )}
          <input
            ref={inputRef}
            value={text}
            onChange={onTextChange}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={recording ? "Recording…" : "Say something, @ to mention…"}
            disabled={recording}
            className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={sending || !text.trim() || recording}
            className="w-9 h-9 shrink-0 rounded-lg bg-primary text-primary-foreground grid place-items-center disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
