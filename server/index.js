const express = require('express');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { Resend } = require('resend');
const crypto = require('crypto');
const showBanner = require('./banner');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const { createServer } = require('http');
const { Server } = require('socket.io');

// Import User model early to avoid circular dependency
const User = require('./models/user');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://veraawell.com',
      'https://www.veraawell.com',
      'https://veraawell.vercel.app', // Main Vercel URL
      'https://veraawell-projects-veraawell.vercel.app' // Vercel preview URL
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  },
  allowEIO3: true,
  transports: ['websocket', 'polling'],
  cookie: {
    name: 'io',
    httpOnly: true,
    sameSite: 'lax'
  }
});

const PORT = process.env.PORT || 8000;

// Basic route to test if server is running
app.get('/', (req, res) => {
  res.json({ message: 'Veraawell Backend is running!', timestamp: new Date().toISOString() });
});

app.use(express.json());
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://veraawell.com',
    'https://www.veraawell.com',
    'https://veraawell.vercel.app', // Main Vercel URL
    'https://veraawell-projects-veraawell.vercel.app' // Vercel preview URL
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(cookieParser());

// Generate secure secrets if not provided in environment
const JWT_SECRET = process.env.JWT_SECRET || 'veraawell_jwt_secret_key_2024_development_environment_secure_token_generation';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex');

// Session middleware with MongoDB store for persistence
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI || 'mongodb://localhost:27017/verocare',
    ttl: 30 * 24 * 60 * 60, // 30 days in seconds
    touchAfter: 24 * 3600, // Lazy session update (24 hours)
    crypto: {
      secret: SESSION_SECRET
    }
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    domain: process.env.NODE_ENV === 'production' ? '.veraawell.com' : undefined
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// MongoDB connection with better error handling
let isMongoConnected = false;

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/verocare', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(async () => {
  console.log('MongoDB connected');
  isMongoConnected = true;
  
  // Run migration to fix reset tokens
  try {
    console.log('Starting reset token migration...');
    const migratedCount = await User.migrateResetTokens();
    console.log(`Migration completed: Fixed ${migratedCount} users with inconsistent reset tokens`);
    
    // Verify migration
    try {
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
    } catch (verificationError) {
      console.warn('Could not verify migration results:', verificationError.message);
    }
  } catch (error) {
    console.error('Migration failed:', error);
    // Don't crash the server if migration fails
    console.log('Continuing server startup despite migration failure...');
  }
})
.catch((err) => {
  console.error('MongoDB connection error:', err);
  console.log('Please check your MONGO_URI environment variable');
  isMongoConnected = false;
  // Don't exit the process, let it continue and retry
});

// Monitor connection status
mongoose.connection.on('connected', () => {
  isMongoConnected = true;
  console.log('MongoDB connection established');
});

mongoose.connection.on('disconnected', () => {
  isMongoConnected = false;
  console.log('MongoDB connection lost');
});

mongoose.connection.on('error', (err) => {
  isMongoConnected = false;
  console.error('MongoDB connection error:', err);
});

// Passport configuration with error handling
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const callbackURL = process.env.NODE_ENV === 'production' 
    ? "https://veraawell-backend.onrender.com/api/auth/google/callback"
    : `http://localhost:${PORT}/api/auth/google/callback`;
    
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: callbackURL
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
          
          // Default role for new users - will be updated in callback based on session
          const role = 'patient';
          
          user = new User({
            googleId: profile.id,
            email: profile.emails[0].value,
            firstName: firstName,
            lastName: lastName,
            username: profile.emails[0].value,
            password: 'google-auth-' + Math.random().toString(36).substring(7), // Random password for Google users
            role: role
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
    mongoConnected: isMongoConnected && mongoose.connection.readyState === 1,
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
      // Store role in session instead of state parameter
      const role = req.query.role || 'patient';
      if (!['patient', 'doctor'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role specified' });
      }
      
      // Store role in session for callback
      req.session.oauthRole = role;
      
      passport.authenticate('google', {
        scope: ['profile', 'email']
      })(req, res, next);
    }
  );

  app.get('/api/auth/google/callback', 
    (req, res, next) => {
      console.log('=== OAuth Callback Received ===');
      console.log('Query params:', req.query);
      console.log('Session:', req.session);
      console.log('Request origin:', req.headers.origin);
      console.log('Request referer:', req.headers.referer);
      
      // Get role from session instead of state parameter
      const role = req.session.oauthRole || 'patient';
      console.log('OAuth callback - role from session:', role);

      // Determine frontend URL from environment or request origin
      const getFrontendUrl = () => {
        // Priority 1: Environment variable
        if (process.env.FRONTEND_URL) {
          return process.env.FRONTEND_URL;
        }
        
        // Priority 2: Request origin (where the user came from)
        const origin = req.headers.origin || req.headers.referer;
        if (origin) {
          try {
            const url = new URL(origin);
            return url.origin;
          } catch (e) {
            console.error('Error parsing origin:', e);
          }
        }
        
        // Priority 3: Default based on NODE_ENV
        if (process.env.NODE_ENV === 'production') {
          return 'https://veraawell.com';
        }
        return 'http://localhost:5173';
      };

      const frontendBaseUrl = getFrontendUrl();
      console.log('Using frontend URL:', frontendBaseUrl);

      passport.authenticate('google', async (err, user) => {
        if (err) {
          console.error('Google callback error:', err);
          const frontendUrl = `${frontendBaseUrl}/login?error=google-auth-failed`;
          return res.redirect(frontendUrl);
        }
        
        if (!user) {
          const frontendUrl = `${frontendBaseUrl}/login?error=no-user`;
          return res.redirect(frontendUrl);
        }

        // Update user's role if it's different
        if (role !== user.role) {
          user.role = role;
          await user.save();
          console.log(`Updated user role to: ${role}`);
        }

        // Clear the OAuth role from session
        delete req.session.oauthRole;

        // Log the user in
        req.logIn(user, (err) => {
          if (err) {
            console.error('Login error:', err);
            const frontendUrl = `${frontendBaseUrl}/login?error=login-failed`;
            return res.redirect(frontendUrl);
          }

          // Create JWT token for the user
        const token = jwt.sign(
            { userId: user._id, username: user.username, role: user.role },
            JWT_SECRET,
          { expiresIn: '30d' }
        );

        // Set cookie with proper domain configuration
        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
          domain: process.env.NODE_ENV === 'production' ? '.veraawell.com' : undefined,
          path: '/'
        });

          // Redirect to frontend with success parameters AND token
          // Include token in URL as fallback for immediate auth
          const redirectUrl = new URL(frontendBaseUrl);
          redirectUrl.searchParams.set('auth', 'success');
          redirectUrl.searchParams.set('token', token);
          redirectUrl.searchParams.set('username', user.username);
          redirectUrl.searchParams.set('role', user.role);
          redirectUrl.searchParams.set('isGoogle', 'true');
          
          console.log('Redirecting to:', redirectUrl.toString());
          console.log('Token set in cookie and URL for immediate auth');
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
    const frontendBaseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://veraawell.vercel.app'
      : 'http://localhost:5173';
    const frontendResetUrl = `${frontendBaseUrl}/reset-password?token=${resetToken}`;

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


// Register (Signup)
app.post('/api/auth/register', async (req, res) => {
  const { firstName, lastName, email, password, role = 'patient', phoneNo, username } = req.body; // Default to patient if no role specified
  
  // Validate required fields (lastName is optional)
  if (!firstName || !email || !password) {
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
      lastName: lastName || '',
      email,
      username: username || email,
      password,
      phoneNo: phoneNo || '',
      role,
      resetToken: null,
      resetTokenExpiry: null
    });

    await newUser.save();
    
    const token = jwt.sign(
      { userId: newUser._id, username: newUser.username, role: newUser.role }, 
      JWT_SECRET, 
      { expiresIn: '30d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
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

    // STRICT CHECK: Block doctor login BEFORE password check if not approved
    if (user.role === 'doctor' && user.approvalStatus !== 'approved') {
      if (user.approvalStatus === 'pending') {
        return res.status(403).json({ 
          message: 'Your doctor account is pending approval. An admin will review your application soon.',
          approvalStatus: 'pending'
        });
      } else if (user.approvalStatus === 'rejected') {
        return res.status(403).json({ 
          message: 'Your doctor account has been rejected. Reason: ' + (user.rejectionReason || 'No reason provided'),
          approvalStatus: 'rejected'
        });
      }
      // Fallback for any other non-approved status
      return res.status(403).json({ 
        message: 'Your doctor account requires approval before you can login.',
        approvalStatus: user.approvalStatus
      });
    }

    // Compare password using the model method
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Double-check approval status for doctors (redundant but safe)
    if (user.role === 'doctor' && user.approvalStatus !== 'approved') {
      if (user.approvalStatus === 'pending') {
        return res.status(403).json({ 
          message: 'Your doctor account is pending approval. An admin will review your application soon.',
          approvalStatus: 'pending'
        });
      } else if (user.approvalStatus === 'rejected') {
        return res.status(403).json({ 
          message: 'Your doctor account has been rejected. Reason: ' + (user.rejectionReason || 'No reason provided'),
          approvalStatus: 'rejected'
        });
      }
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
        userId: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName
      },
      token // Include token in response for WebSocket auth
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// Profile route alias
app.get('/api/auth/profile', async (req, res) => {
  const token = req.cookies.token || req.cookies.adminToken;
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const isUserToken = !!req.cookies.token;
  const secret = isUserToken ? JWT_SECRET : process.env.ADMIN_JWT_SECRET;

  try {
    const decoded = jwt.verify(token, secret);
    
    let user;
    if (decoded.userId) {
      user = await User.findById(decoded.userId);
    } else if (decoded.username) {
      user = await User.findOne({ username: decoded.username });
    }

    if (!user) {
      const cookieName = isUserToken ? 'token' : 'adminToken';
      res.clearCookie(cookieName, { 
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
      return res.status(401).json({ message: 'User not found' });
    }

    res.json({
      userId: user._id,
      username: user.username || user.email,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      profileCompleted: user.profileCompleted
    });
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({ message: 'Invalid token' });
  }
});

// Unified protected route (checks JWT from either cookie)
app.get('/api/protected', async (req, res) => {
  const token = req.cookies.token || req.cookies.adminToken;
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  // Determine which secret to use for verification
  const isUserToken = !!req.cookies.token;
  const secret = isUserToken ? JWT_SECRET : process.env.ADMIN_JWT_SECRET;

  try {
    const decoded = jwt.verify(token, secret);
    
    // Handle different token formats for backward compatibility
    let user;
    if (decoded.userId) {
      user = await User.findById(decoded.userId);
    } else if (decoded.username) {
      // Legacy token format - find by username
      user = await User.findOne({ username: decoded.username });
    }

    if (!user) {
      // Clear the invalid cookie
      const cookieName = isUserToken ? 'token' : 'adminToken';
      res.clearCookie(cookieName, { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
      });
      return res.status(401).json({ message: 'User not found' });
    }

    res.json({
      message: 'Protected data',
      user: {
        userId: user._id,
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName
      },
      token: token // Include token for WebSocket authentication
    });
  } catch (error) {
    const cookieName = isUserToken ? 'token' : 'adminToken';
    res.clearCookie(cookieName, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    });
    return res.status(403).json({ message: 'Invalid token' });
  }
});

// Logout (clears all auth cookies)
app.post('/api/auth/logout', (req, res) => {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  };
  res.clearCookie('token', cookieOptions);
  res.clearCookie('adminToken', cookieOptions);
  res.json({ message: 'Logged out successfully' });
});

// Profile setup routes
app.post('/api/profile/setup', async (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const {
      name,
      qualification,
      languages,
      type,
      experience,
      specialization,
      pricing,
      modeOfSession,
      quote,
      quoteAuthor,
      introduction
    } = req.body;

    // If user is a doctor, create/update doctor profile
    if (user.role === 'doctor') {
      const DoctorProfile = require('./models/doctorProfile');
      
      const profileData = {
        userId: user._id,
        qualification: qualification || [],
        languages: languages || [],
        experience: experience || 0,
        specialization: specialization || [],
        treatsFor: specialization || [], // Using specialization as treatsFor
        pricing: {
          min: pricing?.discovery || pricing?.session30 || 0,
          max: pricing?.session45 || pricing?.session30 || 0
        },
        bio: introduction || '',
        isOnline: true
      };

      // Update or create doctor profile
      await DoctorProfile.findOneAndUpdate(
        { userId: user._id },
        profileData,
        { upsert: true, new: true }
      );
    }

    // Mark profile as completed
    user.profileCompleted = true;
    await user.save();

    res.json({ 
      message: 'Profile setup completed successfully',
      profileCompleted: true
    });
  } catch (error) {
    console.error('Profile setup error:', error);
    res.status(500).json({ message: 'Failed to save profile' });
  }
});

// Get profile status
app.get('/api/profile/status', async (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ 
      profileCompleted: user.profileCompleted || false
    });
  } catch (error) {
    console.error('Profile status error:', error);
    res.status(500).json({ message: 'Failed to get profile status' });
  }
});

// Import admin routes
const adminAuthRoutes = require('./routes/admin/auth');
const adminApprovalRoutes = require('./routes/admin/approvals');
const sessionRoutes = require('./routes/sessions');
const availabilityRoutes = require('./routes/availability');
const chatRoutes = require('./routes/chat');
const patientRoutes = require('./routes/patients');
const sessionToolsRoutes = require('./routes/sessionTools');

// Admin routes
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/approvals', adminApprovalRoutes);

// Session routes
app.use('/api/sessions', sessionRoutes);

// Availability routes
app.use('/api/availability', availabilityRoutes);

// Chat routes
app.use('/api/chat', chatRoutes);

// Patient routes
app.use('/api/patients', patientRoutes);

// Session Tools routes (Notes, Tasks, Reports)
app.use('/api/session-tools', sessionToolsRoutes);

// Initialize Socket.IO handlers
const socketHandler = require('./socketHandler');
socketHandler(io);

// Initialize Chat Socket.IO handler
const { initializeChatSocket } = require('./socket/chatSocket');
initializeChatSocket(io);

showBanner();
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Socket.IO server initialized for video calling');
  console.log('Environment variables:');
  console.log('- MONGO_URI:', process.env.MONGO_URI ? 'Set' : 'Not set');
  console.log('- GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Not set');
  console.log('- GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'Set' : 'Not set');
  console.log('- JWT_SECRET:', process.env.JWT_SECRET ? 'Set' : 'Not set');
  console.log('- SESSION_SECRET:', process.env.SESSION_SECRET ? 'Set' : 'Not set');
});

// Add process error handlers for better stability
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  console.log('Server will continue running...');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  console.log('Server will continue running...');
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  mongoose.connection.close(() => {
    console.log('MongoDB connection closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  mongoose.connection.close(() => {
    console.log('MongoDB connection closed.');
    process.exit(0);
  });
}); 