// memberProfileId/purpose are optional context stamped onto the delivery
// log row (see whatsapp_message_log) purely for later lookup — e.g. "who
// got the auction_save_the_date send" — they don't affect what's sent.
export const sendWhatsAppMessage = async ({ phone, message, templateName, parameters, memberProfileId, purpose }) => {
  try {
    const response = await fetch("/.netlify/functions/sendWhatsApp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phone, message, templateName, parameters, memberProfileId, purpose }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Failed to send WhatsApp message");
    }

    return result;
  } catch (error) {
    console.error("sendWhatsAppMessage error:", error);
    throw error;
  }
};
