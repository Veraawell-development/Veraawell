const express = require('express');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { Resend } = require('resend');
const crypto = require('crypto');
const showBanner = require('./banner');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 8000;

// Basic route to test if server is running
app.get('/', (req, res) => {
  res.json({ message: 'Veraawell Backend is running!', timestamp: new Date().toISOString() });
});

app.use(express.json());
app.use(cors({
  origin: true, // Allow all origins for now
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(cookieParser());

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// MongoDB connection with better error handling
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/verocare', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch((err) => {
  console.error('MongoDB connection error:', err);
  console.log('Please check your MONGO_URI environment variable');
});

const User = require('./models/user');

// Passport configuration with error handling
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "https://veraawell-backend.onrender.com/api/auth/google/callback"
    },
    async function(accessToken, refreshToken, profile, cb) {
      try {
        console.log('Google profile received:', {
          id: profile.id,
          email: profile.emails?.[0]?.value,
          name: profile.name
        });
        
        // Check if user exists
        let user = await User.findOne({ googleId: profile.id });
        
        if (!user) {
          // Create new user with better fallback handling
          const firstName = profile.name?.givenName || profile.displayName || 'Google';
          const lastName = profile.name?.familyName || 'User';
          
          // Get role from state if available, default to 'patient'
          const role = profile.state?.role || 'patient';
          
          user = new User({
            googleId: profile.id,
            email: profile.emails[0].value,
            firstName: firstName,
            lastName: lastName,
            username: profile.emails[0].value,
            password: 'google-auth-' + Math.random().toString(36).substring(7), // Random password for Google users
            role: role // Add role here
          });
          await user.save();
          console.log('New Google user created:', user.email);
        } else {
          console.log('Existing Google user found:', user.email);
        }
        
        return cb(null, user);
      } catch (error) {
        console.error('Google OAuth error:', error);
        return cb(error, null);
      }
    }
  ));
} else {
  console.log('Google OAuth credentials not found. Google OAuth will be disabled.');
}

passport.serializeUser((user, done) => {
  console.log('Serializing user:', user.id);
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    console.log('Deserializing user ID:', id);
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    console.error('Deserialize error:', error);
    done(error, null);
  }
});

// Debug route to check if backend is working
app.get('/api/health', (req, res) => {
  res.json({ 
    message: 'Backend is running', 
    timestamp: new Date().toISOString(),
    mongoConnected: mongoose.connection.readyState === 1,
    googleOAuthEnabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    envVars: {
      hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      hasMongoUri: !!process.env.MONGO_URI,
      hasJwtSecret: !!process.env.JWT_SECRET
    }
  });
});

// Test route to check if Google OAuth routes exist
app.get('/api/test-google-routes', (req, res) => {
  res.json({
    googleOAuthEnabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    routes: {
      '/api/auth/google': 'Available',
      '/api/auth/google/callback': 'Available'
    }
  });
});

// Google OAuth routes (only if credentials are available)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  app.get('/api/auth/google',
    (req, res, next) => {
      // Store role in state
      const role = req.query.role || 'patient';
      if (!['patient', 'doctor'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role specified' });
      }
      passport.authenticate('google', {
        scope: ['profile', 'email'],
        state: JSON.stringify({ role }) // Pass role through state
      })(req, res, next);
    }
  );

  app.get('/api/auth/google/callback', 
    (req, res, next) => {
      // Parse state to get role
      let role = 'patient';
      try {
        const state = JSON.parse(req.query.state || '{}');
        role = state.role || 'patient';
      } catch (e) {
        console.error('Error parsing state:', e);
      }

      passport.authenticate('google', async (err, user) => {
        if (err) {
          console.error('Google callback error:', err);
          return res.redirect('https://veraawell.vercel.app/login?error=google-auth-failed');
        }
        
        if (!user) {
          return res.redirect('https://veraawell.vercel.app/login?error=no-user');
        }

        // Update user's role if it's different
        if (role !== user.role) {
          user.role = role;
          await user.save();
        }

        // Log the user in
        req.logIn(user, (err) => {
          if (err) {
            console.error('Login error:', err);
            return res.redirect('https://veraawell.vercel.app/login?error=login-failed');
          }
          
          // Redirect to frontend with success parameters including role
          return res.redirect(`https://veraawell.vercel.app/?auth=success&username=${encodeURIComponent(user.username)}&role=${user.role}`);
        });
      })(req, res, next);
    }
  );
} else {
  // Fallback routes if Google OAuth is not configured
  app.get('/api/auth/google', (req, res) => {
    res.status(400).json({ message: 'Google OAuth not configured' });
  });
  
  app.get('/api/auth/google/callback', (req, res) => {
    res.status(400).json({ message: 'Google OAuth not configured' });
  });
}

// Forgot Password
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }
  
  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(404).json({ message: 'No account found with this email. Please create a new account.' });
    }
    if (user.googleId) {
      return res.status(400).json({ message: 'This account uses Google login. Please use Google Sign-In.' });
    }
    
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now
    
    // Save reset token to user
    user.resetToken = resetToken;
    user.resetTokenExpiry = resetTokenExpiry;
    await user.save();
    
    // Create reset URL
    const frontendResetUrl = `https://veraawell.vercel.app/reset-password?token=${resetToken}`;

    // Configure nodemailer transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    // Email content
    const mailOptions = {
      from: `Veraawell <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Veraawell - Password Reset Request',
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset</title>
        </head>
        <body style="margin:0;padding:0;background:#f6f8fa;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f8fa;padding:0;margin:0;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:420px;margin:40px auto;background:#fff;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,0.04);overflow:hidden;">
                  <tr>
                    <td style="background:#18181b;padding:32px 0;text-align:center;">
                      <span style="font-size:2rem;font-weight:700;letter-spacing:1px;color:#10b981;">Veraawell</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:32px 24px 16px 24px;text-align:center;">
                      <h2 style="margin:0 0 16px 0;font-size:1.4rem;font-weight:600;color:#18181b;">Password Reset Request</h2>
                      <p style="margin:0 0 24px 0;color:#52525b;font-size:1rem;line-height:1.6;">You requested a password reset for your Veraawell account. Click the button below to reset your password:</p>
                      <a href="${frontendResetUrl}" style="display:inline-block;padding:14px 32px;background:#10b981;color:#fff;font-weight:600;font-size:1rem;border-radius:32px;text-decoration:none;box-shadow:0 2px 8px rgba(16,185,129,0.08);margin-bottom:24px;">Reset Password</a>
                      <p style="margin:24px 0 0 0;color:#71717a;font-size:0.95rem;">If you have any trouble resetting your password, just reply to this email and we’ll help you out.</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 24px 0 24px;">
                      <hr style="border:none;border-top:1px solid #ececec;margin:24px 0 0 0;">
                    </td>
                  </tr>
                  <tr>
                    <td style="background:#f6f8fa;text-align:center;padding:18px 0 8px 0;color:#b0b0b0;font-size:0.93rem;letter-spacing:0.01em;">
                      &copy; 2025 VeroCare. All rights reserved.<br>
                      <span style="color:#b0b0b0;font-size:0.92rem;">This email was sent automatically. Please do not share your reset link with anyone.</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `
    };

    try {
      await transporter.sendMail(mailOptions);
      res.json({ message: 'Password reset link has been sent to your email.' });
    } catch (emailError) {
      console.error('❌ Email sending failed:', emailError.message);
      res.status(500).json({ message: 'Failed to send reset email. Please try again later.' });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DEBUG: List all reset tokens (for troubleshooting only, remove in production!)
app.get('/api/debug/reset-tokens', async (req, res) => {
  const users = await User.find({}, 'email resetToken resetTokenExpiry');
  res.json(users);
});

// DEBUG: Echo token and show user info (for troubleshooting only, remove in production!)
app.get('/api/debug/echo-token', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ message: 'Token required' });
  const user = await User.findOne({ resetToken: token });
  if (!user) return res.status(404).json({ message: 'No user found for this token' });
  res.json({ email: user.email, resetToken: user.resetToken, resetTokenExpiry: user.resetTokenExpiry });
});

// Reset Password
app.post('/api/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  
  console.log('--- Password Reset Attempt ---');
  console.log('Received token:', token);

  // List all tokens for debug
  const allUsers = await User.find({}, 'email resetToken resetTokenExpiry googleId');
  console.log('All tokens in DB:', allUsers.map(u => ({ email: u.email, resetToken: u.resetToken, resetTokenExpiry: u.resetTokenExpiry, googleId: u.googleId })));

  if (!token || !newPassword) {
    console.log('Missing token or newPassword');
    return res.status(400).json({ message: 'Token and new password are required' });
  }
  
  try {
    const user = await User.findOne({ 
      resetToken: token,
      resetTokenExpiry: { $gt: Date.now() }
    });
    console.log('DB Query:', { resetToken: token, resetTokenExpiry: { $gt: Date.now() } });
    console.log('User found:', user ? user.email : null);
    
    if (!user) {
      console.log('Invalid or expired token');
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }
    if (user.googleId) {
      console.log('Attempted password reset for Google user:', user.email);
      return res.status(400).json({ message: 'You signed up with Google. Please use Google Sign-In to log in. Password reset is not available for Google accounts.' });
    }
    
    // Update password
    user.password = newPassword;
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();
    console.log('Password reset successful for:', user.email);
    
    res.json({ message: 'Password reset successful' });
    
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin middleware
const isAdmin = async (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ message: 'No token provided' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'testsecret');
    const user = await User.findOne({ username: decoded.username });
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};

// Register (Signup)
app.post('/api/auth/register', async (req, res) => {
  const { firstName, lastName, email, password, role = 'patient' } = req.body; // Default to patient if no role specified
  
  // Validate required fields
  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({ message: 'All required fields must be filled' });
  }

  // Validate role
  if (!['patient', 'doctor'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role specified. Must be either patient or doctor.' });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'User already exists' });
    }

    const newUser = new User({
      firstName,
      lastName,
      email,
      username: email,
      password,
      role,
      resetToken: null,
      resetTokenExpiry: null
    });

    await newUser.save();
    
    const token = jwt.sign(
      { username: email, role: newUser.role }, 
      process.env.JWT_SECRET || 'testsecret', 
      { expiresIn: '30d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.json({ 
      message: 'Registration successful',
      user: {
        username: newUser.email,
        role: newUser.role,
        firstName: newUser.firstName,
        lastName: newUser.lastName
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    // Allow login by email (username is email)
    const user = await User.findOne({ email: username });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { username: user.email, role: user.role },
      process.env.JWT_SECRET || 'testsecret',
      { expiresIn: '30d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.json({ 
      message: 'Login successful',
      user: {
        username: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create Admin (admin only)
app.post('/api/auth/create-admin', isAdmin, async (req, res) => {
  const { firstName, lastName, email, password } = req.body;

  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'User already exists' });
    }

    const admin = await User.createAdmin({
      firstName,
      lastName,
      email,
      username: email,
      password
    });

    res.json({ message: 'Admin created successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Protected route (checks JWT from cookie and user existence)
app.get('/api/protected', async (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ message: 'No token provided' });
  
  jwt.verify(token, process.env.JWT_SECRET || 'testsecret', async (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    
    const dbUser = await User.findOne({ username: decoded.username });
    if (!dbUser) {
      res.clearCookie('token', {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
      });
      return res.status(401).json({ message: 'User does not exist' });
    }
    
    res.json({ 
      message: 'Protected data', 
      user: { 
        username: dbUser.username,
        role: dbUser.role,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName
      } 
    });
  });
});

// Logout (clears cookie)
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: true, // must be true for cross-site cookies
    sameSite: 'none', // must be 'none' for cross-site cookies
  });
  res.json({ message: 'Logged out successfully' });
});

showBanner();
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment variables:');
  console.log('- MONGO_URI:', process.env.MONGO_URI ? 'Set' : 'Not set');
  console.log('- GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Not set');
  console.log('- GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'Set' : 'Not set');
  console.log('- JWT_SECRET:', process.env.JWT_SECRET ? 'Set' : 'Not set');
  console.log('- SESSION_SECRET:', process.env.SESSION_SECRET ? 'Set' : 'Not set');
}); 