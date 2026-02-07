require('dotenv').config();
const { sendSMS } = require('./services/twilioService');

async function runTest() {
    console.log('🚀 Initiating Twilio Test...');
    const phoneNumber = '+918595192809';
    const message = 'Hello! This is a successful test notification from your Veerawell Backend. Twilio is working perfectly! ✅';

    try {
        const result = await sendSMS(phoneNumber, message);
        if (result.success) {
            console.log('✅ Test Passed! Message sent successfully.');
            console.log('SID:', result.sid);
        } else {
            console.error('❌ Test Failed. Error:', result.error);
        }
    } catch (error) {
        console.error('❌ Unexpected Error:', error);
    }
}

runTest();
