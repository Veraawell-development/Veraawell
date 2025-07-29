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
const bcrypt = require('bcryptjs'); // Added bcrypt for password hashing

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

// Generate secure secrets if not provided in environment
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex');

// Session middleware with secure configuration
app.use(session({
  secret: SESSION_SECRET,
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
.then(async () => {
  console.log('MongoDB connected');
  
  // Run migration to fix reset tokens
  try {
    const migratedCount = await User.migrateResetTokens();
    console.log(`Migration completed: Fixed ${migratedCount} users with inconsistent reset tokens`);
    
    // Verify migration
    const inconsistentUsers = await User.find({
      $or: [
        { resetToken: { $exists: false } },
        { resetTokenExpiry: { $exists: false } },
        { resetToken: null },
        { resetTokenExpiry: { $ne: null, $lt: new Date() } },
        { resetToken: { $ne: '' }, resetTokenExpiry: null },
        { resetToken: '', resetTokenExpiry: { $ne: null } }
      ]
    });
    
    if (inconsistentUsers.length > 0) {
      console.warn(`Warning: Found ${inconsistentUsers.length} users with inconsistent reset tokens after migration`);
    } else {
      console.log('All users have consistent reset token state');
    }
  } catch (error) {
    console.error('Migration failed:', error);
  }
})
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
          
          // Create JWT token for the user
          const token = jwt.sign(
            { userId: user._id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '30d' }
          );

          // Set cookie
          res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
          });
          
          // Redirect to frontend with success parameters
          const redirectUrl = new URL('https://veraawell.vercel.app/');
          redirectUrl.searchParams.set('auth', 'success');
          redirectUrl.searchParams.set('username', user.username);
          redirectUrl.searchParams.set('role', user.role);
          redirectUrl.searchParams.set('isGoogle', 'true');
          
          return res.redirect(redirectUrl.toString());
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
    
    // Clear any existing reset token
    await user.clearResetToken();
    
    // Initialize new reset token
    const resetToken = await user.initializeResetToken();
    
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

    // Email content with modern, minimal design
    const mailOptions = {
      from: `Veraawell <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Reset Your Veraawell Password',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Your Password</title>
          <style>
            /* Modern, minimal design */
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              line-height: 1.6;
              margin: 0;
              padding: 0;
              background-color: #f9fafb;
              color: #1f2937;
            }
            .container {
              max-width: 600px;
              margin: 40px auto;
              padding: 32px;
              background: #ffffff;
              border-radius: 16px;
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            }
            .logo {
              text-align: center;
              margin-bottom: 32px;
            }
            .logo-text {
              font-size: 24px;
              font-weight: 700;
              color: #10b981;
              text-decoration: none;
            }
            .header {
              font-size: 24px;
              font-weight: 600;
              color: #111827;
              margin-bottom: 16px;
              text-align: center;
            }
            .message {
              color: #4b5563;
              margin-bottom: 24px;
              font-size: 16px;
            }
            .button-container {
              text-align: center;
              margin: 32px 0;
            }
            .button {
              display: inline-block;
              background-color: #10b981;
              color: #ffffff;
              padding: 12px 32px;
              border-radius: 8px;
              text-decoration: none;
              font-weight: 500;
              font-size: 16px;
              transition: background-color 0.2s;
            }
            .button:hover {
              background-color: #059669;
            }
            .expiry {
              font-size: 14px;
              color: #6b7280;
              margin-top: 16px;
              text-align: center;
            }
            .warning {
              margin-top: 32px;
              padding: 16px;
              background-color: #fef2f2;
              border-radius: 8px;
              color: #991b1b;
              font-size: 14px;
            }
            .footer {
              margin-top: 32px;
              padding-top: 16px;
              border-top: 1px solid #e5e7eb;
              text-align: center;
              font-size: 14px;
              color: #6b7280;
            }
            @media only screen and (max-width: 600px) {
              .container {
                margin: 20px;
                padding: 24px;
              }
              .header {
                font-size: 20px;
              }
              .button {
                display: block;
                margin: 0 20px;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">
              <span class="logo-text">Veraawell</span>
            </div>
            
            <h1 class="header">Reset Your Password</h1>
            
            <p class="message">Hi ${user.firstName},</p>
            
            <p class="message">
              We received a request to reset your password for your Veraawell account. 
              Click the button below to set a new password.
            </p>

            <div class="button-container">
              <a href="${frontendResetUrl}" class="button">Reset Password</a>
            </div>

            <p class="expiry">
              This link will expire in 1 hour for security reasons.
            </p>

            <div class="warning">
              If you didn't request this password reset, you can safely ignore this email. 
              Your account security is important to us, so please contact support if you have any concerns.
            </div>

            <div class="footer">
              <p>© ${new Date().getFullYear()} Veraawell. All rights reserved.</p>
              <p>This is an automated message, please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    
    // Log success with token state
    console.log('Reset token generated:', {
      email: user.email,
      resetToken: user.resetToken,
      resetTokenExpiry: user.resetTokenExpiry,
      isResetActive: user.isResetActive
    });
    
    res.json({ message: 'Password reset instructions have been sent to your email.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error. Please try again later.' });
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
  
  if (!token || !newPassword) {
    return res.status(400).json({ message: 'Token and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long' });
  }
  
  try {
    // Find user with valid reset token
    const user = await User.findOne({ resetToken: token });
    
    if (!user) {
      return res.status(400).json({ message: 'Invalid reset token. Please request a new password reset.' });
    }

    if (!user.isResetActive) {
      await user.clearResetToken(); // Clean up expired token
      return res.status(400).json({ message: 'Reset token has expired. Please request a new password reset.' });
    }

    if (user.googleId) {
      return res.status(400).json({ message: 'You signed up with Google. Please use Google Sign-In to log in.' });
    }

    // Verify the new password is different from the current one
    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({ message: 'New password must be different from your current password' });
    }
    
    // Update password using the model method
    await user.updatePassword(newPassword);
    
    // Log success with token state
    console.log('Password reset successful:', {
      email: user.email,
      resetToken: user.resetToken,
      resetTokenExpiry: user.resetTokenExpiry,
      isResetActive: user.isResetActive
    });
    
    res.json({ message: 'Password reset successful. Please login with your new password.' });
    
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error. Please try again later.' });
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

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  const { username, password, role } = req.body;

  try {
    // Find user by email/username
    const user = await User.findOne({ 
      $or: [
        { email: username.toLowerCase() },
        { username: username.toLowerCase() }
      ]
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // For Google users, prevent password login
    if (user.googleId) {
      return res.status(400).json({ message: 'Please use Google Sign-In to log in' });
    }

    // Check if user is trying to login with a different role
    if (role && role !== user.role) {
      return res.status(400).json({ 
        message: `You are registered as a ${user.role}. Please use the correct role to login.`,
        correctRole: user.role
      });
    }

    // Compare password using the model method
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Create JWT token
    const token = jwt.sign(
      { userId: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.json({ 
      message: 'Login successful',
      user: {
        username: user.username,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
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