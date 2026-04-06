// Fast2SMS Integration Module - SMS ONLY (Cost Optimized)
require("dotenv").config();

const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY;

// ⚠️ Verify API key is loaded
if (!FAST2SMS_API_KEY) {
  console.error("❌ FAST2SMS_API_KEY not found in .env file!");
} else {
  console.log(`✅ Fast2SMS API Key loaded (${FAST2SMS_API_KEY.length} characters)`);
}

/**
 * Send SMS via Fast2SMS - SINGLE API CALL (Cost Efficient)
 * @param {string} phone - Phone number (10 digits without +91)
 * @param {string} message - Message content
 * @returns {Promise<{success: boolean, message: string, deliveryState?: string, providerMessageId?: string|null, providerStatusCode?: string|null, data?: any}>}
 */
async function sendSMS(phone, message) {
  try {
    // Clean phone number (remove +91 and any non-digits)
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    
    if (cleanPhone.length !== 10) {
      console.log(`❌ Invalid phone format: ${phone}`);
      return { success: false, message: 'Invalid phone number format' };
    }

    const url = 'https://www.fast2sms.com/dev/bulkV2';
    
    const params = new URLSearchParams({
      route: 'q', // Quick transactional route
      message: message,
      language: 'english',
      flash: '0',
      numbers: cleanPhone
    });

    console.log(`📤 Sending SMS to ${cleanPhone}...`);
    console.log(`🔑 Using API Key: ${FAST2SMS_API_KEY ? FAST2SMS_API_KEY.substring(0, 20) + '...' : 'NOT SET'}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'authorization': FAST2SMS_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache'
      },
      body: params.toString()
    });

    const responseText = await response.text();

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.log("❌ Fast2SMS returned non-JSON response:", responseText);
      return {
        success: false,
        message: `Fast2SMS returned invalid response (HTTP ${response.status})`,
        deliveryState: 'unknown',
        providerMessageId: null,
        providerStatusCode: String(response.status),
        data: { raw: responseText }
      };
    }

    console.log("📲 Fast2SMS Response:", JSON.stringify(data));

    const providerMessageId = data.message_id || data.request_id || null;
    const providerStatusCode = data.status_code ? String(data.status_code) : String(response.status);

    if (data.return === true) {
      console.log(
        `✅ SMS accepted by provider for ${cleanPhone} (message_id: ${providerMessageId || 'n/a'}). Note: provider acceptance != handset delivery.`
      );
      return { 
        success: true, 
        message: 'SMS submitted to provider',
        deliveryState: 'submitted',
        providerMessageId,
        providerStatusCode,
        data: data
      };
    } else {
      console.log(`❌ SMS failed to ${cleanPhone}:`, data.message);
      return { 
        success: false, 
        message: data.message || 'Failed to send SMS',
        deliveryState: 'failed',
        providerMessageId,
        providerStatusCode,
        data: data
      };
    }
  } catch (error) {
    console.error("❌ Fast2SMS Error:", error.message);
    return { 
      success: false, 
      message: error.message || 'SMS sending failed',
      deliveryState: 'failed',
      providerMessageId: null,
      providerStatusCode: null
    };
  }
}

module.exports = {
  sendSMS
};
