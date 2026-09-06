const { createClient } = require("@supabase/supabase-js");

// Best-effort — a logging failure should never block the actual send. Uses
// the anon key from trusted server-side code (see whatsapp_message_log's
// RLS policies), so no separate service-role secret is needed.
async function logDelivery({ waMessageId, phone, memberProfileId, templateName, purpose }) {
  try {
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
    await supabase.from("whatsapp_message_log").insert({
      wa_message_id: waMessageId,
      phone,
      member_profile_id: memberProfileId || null,
      template_name: templateName || null,
      purpose: purpose || null,
    });
  } catch (err) {
    console.error("Failed to log WhatsApp delivery row:", err);
  }
}

const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const { phone, message, templateName, parameters, memberProfileId, purpose } = JSON.parse(event.body);

    if (!phone) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Phone number is required" }),
      };
    }

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const businessPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!accessToken || !businessPhoneNumberId) {
      console.error("Missing WhatsApp credentials in environment");
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "WhatsApp not configured" }),
      };
    }

    let payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
    };

    if (templateName && parameters) {
      payload.type = "template";
      payload.template = {
        name: templateName,
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: parameters.map((param) => ({
              type: "text",
              text: param,
            })),
          },
        ],
      };
    } else if (message) {
      payload.type = "text";
      payload.text = { body: message };
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Either message or (templateName + parameters) is required",
        }),
      };
    }

    const response = await fetch(
      `https://graph.facebook.com/v20.0/${businessPhoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("WhatsApp API error:", result);
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: result.error?.message || "Failed to send message",
          details: result,
        }),
      };
    }

    const messageId = result.messages?.[0]?.id;
    if (messageId) {
      await logDelivery({ waMessageId: messageId, phone, memberProfileId, templateName, purpose });
    }

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: true,
        messageId,
      }),
    };
  } catch (error) {
    console.error("sendWhatsApp error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

exports.handler = handler;
