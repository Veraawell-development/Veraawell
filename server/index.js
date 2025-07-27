const express = require('express');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: './config.env' });
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const showBanner = require('./banner');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.json());
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:5173',
      'https://veraawell.vercel.app'
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
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

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch((err) => console.error('MongoDB connection error:', err));

const User = require('./models/user');

// Passport configuration
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.NODE_ENV === 'production' 
      ? "https://veraawell-backend.onrender.com/api/auth/google/callback"
      : "http://localhost:5001/api/auth/google/callback"
  },
  async function(accessToken, refreshToken, profile, cb) {
    try {
      console.log('Google profile:', profile);
      // Check if user exists
      let user = await User.findOne({ googleId: profile.id });
      
      if (!user) {
        // Create new user
        user = new User({
          googleId: profile.id,
          email: profile.emails[0].value,
          firstName: profile.name.givenName,
          lastName: profile.name.familyName,
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

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Google OAuth routes
app.get('/api/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/api/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    console.log('Google OAuth callback - user:', req.user);
    // Successful authentication, redirect to frontend
    const token = jwt.sign({ username: req.user.email }, process.env.JWT_SECRET || 'testsecret', { expiresIn: '30d' });
    
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
    
    // Redirect to frontend with success
    const redirectUrl = process.env.NODE_ENV === 'production' 
      ? 'https://veraawell.vercel.app?auth=success'
      : 'http://localhost:5173?auth=success';
    
    console.log('Redirecting to:', redirectUrl);
    res.redirect(redirectUrl);
  }
);

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
}); 