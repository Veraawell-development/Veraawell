# Email Setup Guide for Password Reset Feature

## Step 1: Create Gmail App Password

1. **Enable 2-Factor Authentication** on your Gmail account
2. **Generate App Password**:
   - Go to Google Account settings
   - Navigate to Security → 2-Step Verification → App passwords
   - Select "Mail" and "Other (Custom name)"
   - Name it "Veraawell Password Reset"
   - Copy the generated 16-character password

## Step 2: Create Environment File

Create a `.env` file in the `server` directory with the following content:

```env
# Email Configuration
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=your-16-character-app-password

# Other existing variables (keep your current values)
MONGO_URI=your-mongo-uri
JWT_SECRET=your-jwt-secret
SESSION_SECRET=your-session-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

## Step 3: Test the Email Functionality

1. **Start the server**:
   ```bash
   cd server
   npm run dev
   ```

2. **Test the forgot password flow**:
   - Go to your app's login page
   - Click "Forgot password?"
   - Enter your email address
   - Check your email for the reset link

## Alternative: Use a Different Email Service

If you prefer not to use Gmail, you can use other services:

### Option 1: SendGrid
```javascript
// In server/index.js, replace the transporter configuration:
const transporter = nodemailer.createTransporter({
  host: 'smtp.sendgrid.net',
  port: 587,
  secure: false,
  auth: {
    user: 'apikey',
    pass: process.env.SENDGRID_API_KEY
  }
});
```

### Option 2: Mailgun
```javascript
const transporter = nodemailer.createTransporter({
  host: 'smtp.mailgun.org',
  port: 587,
  secure: false,
  auth: {
    user: process.env.MAILGUN_USER,
    pass: process.env.MAILGUN_PASS
  }
});
```

## Troubleshooting

### Common Issues:

1. **"Invalid login" error**:
   - Make sure you're using an App Password, not your regular Gmail password
   - Ensure 2-Factor Authentication is enabled

2. **"Less secure app access" error**:
   - Google no longer supports less secure apps
   - You must use App Passwords

3. **Email not sending**:
   - Check server console for error messages
   - Verify your `.env` file is in the correct location
   - Ensure the server was restarted after adding environment variables

### Testing Without Email:

If you want to test without setting up email, the current implementation will:
1. Show the reset URL in the server console
2. Return the reset URL in the API response
3. Allow you to manually copy and paste the reset link

## Security Notes:

- Never commit your `.env` file to version control
- Use App Passwords instead of your main Gmail password
- Consider using a dedicated email service for production
- The reset tokens expire after 1 hour for security

## Production Deployment:

For production deployment, consider:
1. Using a dedicated email service (SendGrid, Mailgun, etc.)
2. Setting up proper DNS records for email deliverability
3. Monitoring email delivery rates
4. Implementing rate limiting for password reset requests 