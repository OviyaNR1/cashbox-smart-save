import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phone, message, templateName, parameters } = await req.json();

    if (!phone) {
      return Response.json(
        { error: "Phone number is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const businessPhoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

    if (!accessToken || !businessPhoneNumberId) {
      console.error("Missing WhatsApp credentials in environment");
      return Response.json(
        { error: "WhatsApp not configured" },
        { status: 500, headers: corsHeaders }
      );
    }

    let payload: any = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
    };

    // If template name and parameters provided, use template mode
    if (templateName && parameters) {
      payload.type = "template";
      payload.template = {
        name: templateName,
        language: {
          code: "en",
        },
        components: [
          {
            type: "body",
            parameters: parameters.map((param: string) => ({
              type: "text",
              text: param,
            })),
          },
        ],
      };
    } else if (message) {
      // Otherwise use text message
      payload.type = "text";
      payload.text = {
        body: message,
      };
    } else {
      return Response.json(
        { error: "Either message or (templateName + parameters) is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const response = await fetch(
      `https://graph.instagram.com/v18.0/${businessPhoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("WhatsApp API error:", result);
      return Response.json(
        { error: result.error?.message || "Failed to send message", details: result },
        { status: response.status, headers: corsHeaders }
      );
    }

    return Response.json(
      { success: true, messageId: result.messages?.[0]?.id },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("sendWhatsApp error:", error);
    return Response.json(
      { error: (error as Error).message },
      { status: 500, headers: corsHeaders }
    );
  }
});
