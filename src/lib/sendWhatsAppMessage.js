export const sendWhatsAppMessage = async ({ phone, message, templateName, parameters }) => {
  try {
    const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || "https://wryjrklhymcmmnbyndzv.supabase.co";
    const response = await fetch(`${supabaseUrl}/functions/v1/sendWhatsApp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phone, message, templateName, parameters }),
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
