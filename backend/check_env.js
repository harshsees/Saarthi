require('dotenv').config();

console.log('\n========================================');
console.log('Environment Variables Check');
console.log('========================================\n');

console.log('FAST2SMS_API_KEY exists:', !!process.env.FAST2SMS_API_KEY);
console.log('FAST2SMS_API_KEY value:', process.env.FAST2SMS_API_KEY);
console.log('FAST2SMS_API_KEY length:', process.env.FAST2SMS_API_KEY ? process.env.FAST2SMS_API_KEY.length : 0);
console.log('\nFAST2SMS_SENDER_ID exists:', !!process.env.FAST2SMS_SENDER_ID);
console.log('FAST2SMS_SENDER_ID value:', process.env.FAST2SMS_SENDER_ID);

console.log('\n========================================');
console.log('Expected API Key Length: 64-80 characters');
console.log('Expected Sender ID: 10-digit phone number');
console.log('========================================\n');
