const express = require('express');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const showBanner = require('./banner');

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
          // Create new user
          user = new User({
            googleId: profile.id,
            email: profile.emails[0].value,
            firstName: profile.name.givenName || 'Google',
            lastName: profile.name.familyName || 'User',
            username: profile.emails[0].value,
            password: 'google-auth-' + Math.random().toString(36).substring(7) // Random password for Google users
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
    passport.authenticate('google', { scope: ['profile', 'email'] })
  );

  app.get('/api/auth/google/callback', 
    (req, res, next) => {
      console.log('Google callback route hit');
      passport.authenticate('google', { failureRedirect: 'https://veraawell.vercel.app/login?error=google_auth_failed' })(req, res, next);
    },
    (req, res) => {
      try {
        console.log('Google OAuth callback - user:', req.user);
        
        if (!req.user) {
          console.error('No user found in Google OAuth callback');
          return res.redirect('https://veraawell.vercel.app/login?error=no_user');
        }
        
        // Successful authentication, redirect to frontend with success
        const token = jwt.sign({ username: req.user.email }, process.env.JWT_SECRET || 'testsecret', { expiresIn: '30d' });
        
        res.cookie('token', token, {
          httpOnly: true,
          secure: true,
          sameSite: 'none',
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        });
        
        // Redirect to frontend with success and user info
        const redirectUrl = `https://veraawell.vercel.app?auth=success&username=${encodeURIComponent(req.user.email)}`;
        
        console.log('Redirecting to:', redirectUrl);
        res.redirect(redirectUrl);
      } catch (error) {
        console.error('Error in Google OAuth callback:', error);
        res.redirect('https://veraawell.vercel.app/login?error=callback_error');
      }
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

// Register (Signup)
app.post('/api/auth/register', async (req, res) => {
  const { firstName, lastName, email, password } = req.body;
  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({ message: 'All required fields must be filled' });
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
      username: email, // use email as username
      password
    });
    await newUser.save();
    const token = jwt.sign({ username: email }, process.env.JWT_SECRET || 'testsecret', { expiresIn: '30d' });
    res.cookie('token', token, {
      httpOnly: true,
      secure: true, // must be true for cross-site cookies
      sameSite: 'none', // must be 'none' for cross-site cookies
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
    res.json({ message: 'Registration successful' });
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
    const token = jwt.sign({ username: user.email }, process.env.JWT_SECRET || 'testsecret', { expiresIn: '30d' });
    res.cookie('token', token, {
      httpOnly: true,
      secure: true, // must be true for cross-site cookies
      sameSite: 'none', // must be 'none' for cross-site cookies
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
    res.json({ message: 'Login successful' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Protected route (checks JWT from cookie and user existence)
app.get('/api/protected', async (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ message: 'No token provided' });
  jwt.verify(token, process.env.JWT_SECRET || 'testsecret', async (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    const dbUser = await User.findOne({ username: user.username });
    if (!dbUser) {
      res.clearCookie('token', {
        httpOnly: true,
        secure: true, // must be true for cross-site cookies
        sameSite: 'none', // must be 'none' for cross-site cookies
      });
      return res.status(401).json({ message: 'User does not exist' });
    }
    res.json({ message: 'Protected data', user: { username: dbUser.username } });
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