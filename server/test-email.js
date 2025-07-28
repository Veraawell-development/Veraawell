const nodemailer = require('nodemailer');
require('dotenv').config();

console.log('🧪 Testing Email Configuration...\n');

// Check environment variables
console.log('Environment Variables:');
console.log('EMAIL_USER:', process.env.EMAIL_USER ? '✅ Set' : '❌ NOT SET');
console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? '✅ Set' : '❌ NOT SET');
console.log('');

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.log('❌ Email configuration incomplete!');
  console.log('Please check your .env file and ensure EMAIL_USER and EMAIL_PASS are set.');
  process.exit(1);
}

// Create transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Test email
const testEmail = {
  from: process.env.EMAIL_USER,
  to: process.env.EMAIL_USER, // Send to yourself for testing
  subject: '🧪 Veraawell Email Test',
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="background-color: #1f2937; color: white; padding: 20px; border-radius: 10px; text-align: center;">
        <h1 style="margin: 0; color: #10b981;">Veraawell</h1>
      </div>
      <div style="background-color: white; padding: 30px; border-radius: 10px; margin-top: 20px;">
        <h2 style="color: #1f2937; margin-bottom: 20px;">Email Test Successful! 🎉</h2>
        <p style="color: #6b7280; line-height: 1.6;">
          This is a test email to verify that your email configuration is working correctly.
          If you received this email, your password reset functionality should work perfectly!
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="background-color: #10b981; color: white; padding: 12px 30px; border-radius: 25px; display: inline-block; font-weight: bold;">
            ✅ Email Configuration Working
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

console.log('📧 Sending test email...');

transporter.sendMail(testEmail)
  .then(info => {
    console.log('✅ Test email sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('Check your inbox for the test email.');
  })
  .catch(error => {
    console.log('❌ Test email failed:');
    console.log('Error:', error.message);
    console.log('');
    console.log('🔧 Troubleshooting:');
    console.log('1. Make sure 2-Factor Authentication is enabled on your Gmail');
    console.log('2. Verify you\'re using an App Password, not your regular password');
    console.log('3. Check that your .env file is in the server directory');
    console.log('4. Ensure the EMAIL_USER and EMAIL_PASS are correct');
  }); 