const fs = require('fs');
const path = require('path');

console.log('🔧 Email Setup for Veraawell Password Reset');
console.log('============================================\n');

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
const envExists = fs.existsSync(envPath);

if (envExists) {
  console.log('✅ .env file already exists');
  console.log('📝 Please add the following lines to your .env file:\n');
} else {
  console.log('📝 Creating .env file...\n');
}

const emailConfig = `# Email Configuration for Password Reset
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=your-16-character-app-password

# Other environment variables (update with your actual values)
MONGO_URI=mongodb://localhost:27017/verocare
JWT_SECRET=your-jwt-secret
SESSION_SECRET=your-session-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
`;

if (!envExists) {
  fs.writeFileSync(envPath, emailConfig);
  console.log('✅ .env file created successfully!\n');
}

console.log('📋 Next Steps:');
console.log('1. Enable 2-Factor Authentication on your Gmail account');
console.log('2. Generate an App Password:');
console.log('   - Go to Google Account settings');
console.log('   - Security → 2-Step Verification → App passwords');
console.log('   - Select "Mail" and "Other (Custom name)"');
console.log('   - Name it "Veraawell Password Reset"');
console.log('   - Copy the 16-character password');
console.log('3. Update the .env file with your Gmail and App Password');
console.log('4. Restart your server: npm run dev');
console.log('5. Test the forgot password feature\n');

console.log('🔗 For detailed instructions, see: EMAIL_SETUP_GUIDE.md');
console.log('📧 The email will be sent to the address you enter in the forgot password form'); 