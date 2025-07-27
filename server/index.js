const express = require('express');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: './config.env' });
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
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

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch((err) => console.error('MongoDB connection error:', err));

const User = require('./models/user');

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
    const token = jwt.sign({ username: email }, process.env.JWT_SECRET || 'testsecret', { expiresIn: '15m' });
    res.cookie('token', token, {
      httpOnly: true,
      secure: true, // must be true for cross-site cookies
      sameSite: 'none', // must be 'none' for cross-site cookies
      maxAge: 15 * 60 * 1000, // 15 minutes
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
    const token = jwt.sign({ username: user.email }, process.env.JWT_SECRET || 'testsecret', { expiresIn: '15m' });
    res.cookie('token', token, {
      httpOnly: true,
      secure: true, // must be true for cross-site cookies
      sameSite: 'none', // must be 'none' for cross-site cookies
      maxAge: 15 * 60 * 1000, // 15 minutes
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