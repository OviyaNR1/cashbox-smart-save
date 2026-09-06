const { createClient } = require("@supabase/supabase-js");

// Meta's WhatsApp Cloud API webhook — receives two kinds of events on the
// same URL: per-message delivery status updates (sent/delivered/read/
// failed) and inbound messages from members. This is what actually closes
// the gap where sendWhatsApp.cjs only ever knew "Meta accepted the API
// call," never whether a message actually reached anyone's phone.
//
// GET  — Meta's one-time webhook verification handshake when the URL is
//        first registered (or re-verified): echo back hub.challenge if
//        hub.verify_token matches, otherwise reject.
// POST — the actual event delivery. Must respond 200 quickly regardless of
//        internal processing outcome, or Meta will retry (and eventually
//        disable the subscription) — logging failures are swallowed rather
//        than surfaced as a non-200.

function supabaseClient() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
}

function handleVerification(event) {
  const params = event.queryStringParameters || {};
  const mode = params["hub.mode"];
  const token = params["hub.verify_token"];
  const challenge = params["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return { statusCode: 200, body: challenge || "" };
  }
  return { statusCode: 403, body: "Verification failed" };
}

async function recordStatuses(supabase, statuses) {
  for (const s of statuses) {
    const waMessageId = s.id;
    if (!waMessageId) continue;
    const update = {
      status: s.status,
      status_updated_at: new Date(Number(s.timestamp) * 1000 || Date.now()).toISOString(),
    };
    if (s.errors?.length) {
      update.error_code = String(s.errors[0].code ?? "");
      update.error_message = s.errors[0].title || s.errors[0].message || null;
    }
    // Status updates arrive as a strict progression (sent -> delivered ->
    // read, or -> failed) for a message row inserted at send time — if the
    // row isn't there yet (send-time insert still in flight, or predates
    // this feature), there's nothing to update onto, so this is a no-op
    // rather than an error.
    await supabase.from("whatsapp_message_log").update(update).eq("wa_message_id", waMessageId);
  }
}

async function recordInbound(supabase, messages, contacts) {
  const nameByWaId = Object.fromEntries((contacts || []).map((c) => [c.wa_id, c.profile?.name]));
  for (const m of messages) {
    await supabase.from("whatsapp_inbound_messages").insert({
      wa_message_id: m.id,
      from_phone: m.from,
      body: m.text?.body || null,
      raw: { ...m, contact_name: nameByWaId[m.from] },
    });
  }
}

const handler = async (event) => {
  if (event.httpMethod === "GET") {
    return handleVerification(event);
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    const supabase = supabaseClient();

    const changes = (payload.entry || []).flatMap((e) => e.changes || []);
    for (const change of changes) {
      const value = change.value || {};
      if (value.statuses?.length) await recordStatuses(supabase, value.statuses);
      if (value.messages?.length) await recordInbound(supabase, value.messages, value.contacts);
    }
  } catch (err) {
    // Swallow — see the module comment on why this still returns 200.
    console.error("whatsappWebhook processing error:", err);
  }

  return { statusCode: 200, body: "EVENT_RECEIVED" };
};

exports.handler = handler;
