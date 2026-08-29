const crypto = require("crypto");

// Supabase Auth's Send SMS Hook: it generates and manages the OTP itself
// (same code-hashing/expiry/verification machinery it already uses for
// email), and calls this webhook with the phone number + code instead of
// handing delivery to a configured SMS provider. We take it from there and
// deliver over WhatsApp using the same Meta Graph API integration
// sendWhatsApp.cjs already uses — no Twilio, no SMS costs.
//
// Payload: { user: { phone, ... }, sms: { otp } }
// Required response on success: {} with HTTP 200.
// On failure: { error: { http_code, message } } with a non-200 status.

// Standard Webhooks verification (the spec Supabase Auth Hooks use) —
// secret is "whsec_<base64>"; the signed content is
// "<webhook-id>.<webhook-timestamp>.<raw body>", HMAC-SHA256'd with the
// base64-decoded secret, and compared against the "v1,<sig>" tokens in the
// webhook-signature header.
function verifySignature(rawBody, headers, secret) {
  const id = headers["webhook-id"];
  const timestamp = headers["webhook-timestamp"];
  const signatureHeader = headers["webhook-signature"];
  if (!id || !timestamp || !signatureHeader) return false;

  // Supabase's secret comes as "v1,whsec_<base64>" — strip both the
  // version prefix and the whsec_ marker, wherever whsec_ actually starts,
  // rather than assuming it's at position 0.
  const secretBytes = Buffer.from(secret.replace(/^.*whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  return signatureHeader.split(" ").some((token) => {
    const sig = token.startsWith("v1,") ? token.slice(3) : token;
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      // Buffers of different length — definitely not a match.
      return false;
    }
  });
}

const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const hookSecret = process.env.SEND_SMS_HOOK_SECRET;
  if (!hookSecret) {
    console.error("Missing SEND_SMS_HOOK_SECRET in environment");
    return { statusCode: 500, body: JSON.stringify({ error: { http_code: 500, message: "SMS hook not configured" } }) };
  }

  const rawBody = event.body || "";
  const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));

  if (!verifySignature(rawBody, headers, hookSecret)) {
    return { statusCode: 401, body: JSON.stringify({ error: { http_code: 401, message: "Invalid webhook signature" } }) };
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: { http_code: 400, message: "Invalid JSON body" } }) };
  }

  const phone = payload?.user?.phone;
  const otp = payload?.sms?.otp;
  if (!phone || !otp) {
    return { statusCode: 400, body: JSON.stringify({ error: { http_code: 400, message: "Missing phone or otp in payload" } }) };
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const businessPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !businessPhoneNumberId) {
    console.error("Missing WhatsApp credentials in environment");
    return { statusCode: 500, body: JSON.stringify({ error: { http_code: 500, message: "WhatsApp not configured" } }) };
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/${businessPhoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone.replace(/^\+/, ""),
        type: "template",
        template: {
          name: "cashbox_verification_code",
          language: { code: "en" },
          components: [
            { type: "body", parameters: [{ type: "text", text: otp }] },
            { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: otp }] },
          ],
        },
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      console.error("WhatsApp OTP send failed:", result);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: { http_code: 500, message: result.error?.message || "Failed to send WhatsApp OTP" } }),
      };
    }

    return { statusCode: 200, body: JSON.stringify({}) };
  } catch (err) {
    console.error("sendSmsHook error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: { http_code: 500, message: err.message } }) };
  }
};

exports.handler = handler;
