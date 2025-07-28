const { Resend } = require('resend');
require('dotenv').config();

console.log('🧪 Testing Resend Email Configuration...\n');

// Check environment variables
console.log('Environment Variables:');
console.log('RESEND_API_KEY:', process.env.RESEND_API_KEY ? '✅ Set' : '❌ NOT SET');
console.log('');

if (!process.env.RESEND_API_KEY) {
  console.log('❌ Resend API key not found!');
  console.log('Please add RESEND_API_KEY to your .env file');
  console.log('Get your API key from: https://resend.com/');
  process.exit(1);
}

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// Test email
const testEmail = {
  from: 'onboarding@resend.dev', // Use Resend's sandbox domain
  to: [process.env.EMAIL_USER || 'test@example.com'],
  subject: '🧪 Veraawell Email Test - Resend',
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="background-color: #1f2937; color: white; padding: 20px; border-radius: 10px; text-align: center;">
        <h1 style="margin: 0; color: #10b981;">Veraawell</h1>
      </div>
      <div style="background-color: white; padding: 30px; border-radius: 10px; margin-top: 20px;">
        <h2 style="color: #1f2937; margin-bottom: 20px;">Email Test Successful! 🎉</h2>
        <p style="color: #6b7280; line-height: 1.6;">
          This is a test email to verify that your Resend email configuration is working correctly.
          If you received this email, your password reset functionality should work perfectly!
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="background-color: #10b981; color: white; padding: 12px 30px; border-radius: 25px; display: inline-block; font-weight: bold;">
            ✅ Resend Configuration Working
          </span>
        </div>
        <p style="color: #6b7280; font-size: 14px;">
          You can now test the forgot password feature in your application.
        </p>
      </div>
      <div style="text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px;">
        © 2025 VeroCare. All rights reserved.
      </div>
    </div>
  `
};

console.log('📧 Sending test email via Resend...');

resend.emails.send(testEmail)
  .then(({ data, error }) => {
    if (error) {
      console.log('❌ Test email failed:');
      console.log('Error:', error.message);
      console.log('');
      console.log('🔧 Troubleshooting:');
      console.log('1. Check your RESEND_API_KEY is correct');
      console.log('2. Verify the API key starts with "re_"');
      console.log('3. Make sure you\'ve verified your domain in Resend');
      console.log('4. Check Resend dashboard for any issues');
    } else {
      console.log('✅ Test email sent successfully!');
      console.log('Email ID:', data?.id);
      console.log('Check your inbox for the test email.');
    }
  })
  .catch(error => {
    console.log('❌ Test email failed:');
    console.log('Error:', error.message);
  }); 