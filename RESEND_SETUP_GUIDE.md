# 🚀 Simple Email Setup with Resend

## Why Resend?
- ✅ **Free tier**: 3,000 emails/month
- ✅ **No complex setup**: Just API key
- ✅ **Reliable delivery**: 99.9% delivery rate
- ✅ **No Gmail issues**: No 2FA, App passwords, etc.

## Step 1: Get Resend API Key

1. **Go to Resend**: https://resend.com/
2. **Sign up** with your email
3. **Get API Key**: 
   - Go to API Keys section
   - Click "Create API Key"
   - Copy the key (starts with `re_`)

## Step 2: Update Environment Variables

Add this to your `server/.env` file:

```env
# Email Configuration (Resend)
RESEND_API_KEY=re_your_api_key_here

# Keep your existing variables
PORT=5001
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
MONGO_URI=your-mongo-uri
JWT_SECRET=your-jwt-secret
SESSION_SECRET=your-session-secret
```

## Step 3: Test Email

1. **Restart your server**:
   ```bash
   npm run dev
   ```

2. **Test forgot password**:
   - Go to login page
   - Click "Forgot password?"
   - Enter your email
   - Check your inbox!

## ✅ Benefits of This Solution:

1. **No Gmail complexity** - No 2FA, App passwords
2. **Reliable delivery** - 99.9% success rate
3. **Professional emails** - Beautiful HTML templates
4. **Free tier** - 3,000 emails/month
5. **Simple setup** - Just API key

## 🔧 Troubleshooting:

### If emails not sending:
1. Check your API key is correct
2. Verify the API key starts with `re_`
3. Check server console for error messages
4. Ensure you've restarted the server

### If you want to use Gmail instead:
- Keep the old Gmail configuration
- Use App passwords as before

## 📧 Email Features:
- ✅ Professional Veraawell branding
- ✅ Secure reset links (1-hour expiry)
- ✅ Mobile-responsive design
- ✅ Fallback text links
- ✅ Error handling

## 🎯 Next Steps:
1. Get your Resend API key
2. Update `.env` file
3. Restart server
4. Test forgot password feature
5. Enjoy reliable email delivery!

This solution is much simpler and more reliable than Gmail SMTP! 