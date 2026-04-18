// Quick test script to check Fast2SMS integration
// Use this file to verify your API connectivity before going live

require("dotenv").config();
const { sendSMS } = require("./fast2sms");

async function test() {
  console.log("🧪 Testing Fast2SMS Integration...\n");
  
  // Check environment variables
  console.log("📋 Environment Check:");
  console.log("FAST2SMS_API_KEY:", process.env.FAST2SMS_API_KEY ? `✅ Set (${process.env.FAST2SMS_API_KEY.length} chars)` : "❌ Missing");
  console.log("First 20 chars:", process.env.FAST2SMS_API_KEY ? process.env.FAST2SMS_API_KEY.substring(0, 20) + '...' : 'N/A');
  console.log("");
  
  // Pass phone via CLI: node test_fast2sms.js 9521007100
  const testPhone = process.argv[2] || "7984594074";
  const testMessage = "🧪 Saarthi Test: Fast2SMS SMS working! This is sent via corrected API.";
  
  console.log("📱 Testing SMS to:", testPhone);
  console.log("Message:", testMessage);
  console.log("");
  
  // Test SMS
  console.log("1️⃣ Sending SMS with corrected API...");
  const smsResult = await sendSMS(testPhone, testMessage);
  console.log("\n📊 Final Result:", smsResult);
  console.log("");
  
  if (smsResult.success) {
    console.log("✅ Test PASSED! SMS was submitted to Fast2SMS.");
    console.log("Tracking ID:", smsResult.providerMessageId || "N/A");
    console.log("If handset does not receive it, share this ID with Fast2SMS support.");
  } else {
    console.log("❌ Test FAILED!");
    console.log("Error:", smsResult.message);
    console.log("\n⚠️ Most common issues:");
    console.log("1. Account not verified (Error 412)");
    console.log("2. Insufficient credits");
    console.log("3. Wrong API key");
  }
}

test().catch(console.error);
