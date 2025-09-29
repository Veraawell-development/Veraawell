const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const VALID_ROLES = ['patient', 'doctor', 'admin'];

// Schema definition with strict mode enabled
const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: false,
    trim: true,
    default: ''
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    required: true,
    enum: VALID_ROLES,
    default: 'patient'
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  resetToken: {
    type: String,
    default: null,
    get: v => v || null
  },
  resetTokenExpiry: {
    type: Date,
    default: null,
    get: v => v || null
  }
}, {
  timestamps: true,
  strict: true,
  strictQuery: true
});

// Add compound index for reset token fields
userSchema.index({ resetToken: 1, resetTokenExpiry: 1 });

// Virtual to check if password reset is active
userSchema.virtual('isResetActive').get(function() {
  return !!(this.resetToken && this.resetTokenExpiry && this.resetTokenExpiry > new Date());
});

// Ensure reset token fields are always in sync
userSchema.pre('save', async function(next) {
  // If either field is being modified, ensure they are in sync
  if (this.isModified('resetToken') || this.isModified('resetTokenExpiry')) {
    // If either field is null/empty/undefined, clear both
    if (!this.resetToken || !this.resetTokenExpiry) {
      this.resetToken = null;
      this.resetTokenExpiry = null;
    }
    
    // If token exists but expiry is in the past, clear both
    if (this.resetTokenExpiry && this.resetTokenExpiry < new Date()) {
      this.resetToken = null;
      this.resetTokenExpiry = null;
    }
  }
  next();
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  try {
    if (!this.isModified('password')) return next();
    if (this.googleId) return next();
    
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    if (this.googleId) return false;
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Initialize reset token
userSchema.methods.initializeResetToken = async function() {
  try {
    const buffer = await crypto.randomBytes(48);
    const token = buffer.toString('hex');
    
    this.resetToken = token;
    this.resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour
    
    await this.save();
    return token;
  } catch (error) {
    throw new Error('Failed to initialize reset token');
  }
};

// Clear reset token
userSchema.methods.clearResetToken = async function() {
  try {
    this.resetToken = null;
    this.resetTokenExpiry = null;
    await this.save();
  } catch (error) {
    throw new Error('Failed to clear reset token');
  }
};

// Update password
userSchema.methods.updatePassword = async function(newPassword) {
  try {
    this.password = newPassword;
    await this.clearResetToken();
  } catch (error) {
    throw new Error('Failed to update password');
  }
};

// Static method to migrate existing documents
userSchema.statics.migrateResetTokens = async function() {
  try {
    console.log('Starting reset token migration...');
    
    // First, let's check for any corrupted users that might cause issues
    const corruptedUsers = await this.find({
      $or: [
        { firstName: { $exists: false } },
        { username: { $exists: false } },
        { password: { $exists: false } },
        { email: { $exists: false } }
      ]
    });
    
    if (corruptedUsers.length > 0) {
      console.warn(`Found ${corruptedUsers.length} corrupted users. Attempting to fix or remove them...`);
      
      for (const user of corruptedUsers) {
        try {
          // Try to fix the user if possible
          if (!user.firstName) user.firstName = 'Unknown';
          if (!user.username) user.username = user.email || `user_${user._id}`;
          if (!user.password) user.password = 'temp_password_' + Math.random().toString(36).substring(7);
          if (!user.email) {
            console.warn(`User ${user._id} has no email, removing...`);
            await this.findByIdAndDelete(user._id);
            continue;
          }
          
          await user.save();
          console.log(`Fixed corrupted user: ${user._id}`);
        } catch (fixError) {
          console.error(`Failed to fix user ${user._id}, removing:`, fixError.message);
          await this.findByIdAndDelete(user._id);
        }
      }
    }

    // Now handle reset token migration
    const usersWithResetTokens = await this.find({
      $or: [
        { resetToken: { $exists: false } },
        { resetTokenExpiry: { $exists: false } },
        { resetToken: '' },
        { resetToken: { $ne: null, $type: 'string' }, resetTokenExpiry: null },
        { resetToken: null, resetTokenExpiry: { $ne: null } },
        { resetTokenExpiry: { $lt: new Date() } }
      ]
    });

    console.log(`Found ${usersWithResetTokens.length} users with inconsistent reset tokens`);

    if (usersWithResetTokens.length === 0) {
      console.log('No users need reset token migration');
      return 0;
    }

    // Use bulk update operation to avoid validation issues
    const result = await this.updateMany(
      {
        $or: [
          { resetToken: { $exists: false } },
          { resetTokenExpiry: { $exists: false } },
          { resetToken: '' },
          { resetToken: { $ne: null, $type: 'string' }, resetTokenExpiry: null },
          { resetToken: null, resetTokenExpiry: { $ne: null } },
          { resetTokenExpiry: { $lt: new Date() } }
        ]
      },
      {
        $set: {
          resetToken: null,
          resetTokenExpiry: null
        }
      }
    );

    console.log(`Reset token migration completed successfully. Updated ${result.modifiedCount} users.`);
    return result.modifiedCount;
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
};

// Static method to check if a role is valid
userSchema.statics.isValidRole = function(role) {
  return VALID_ROLES.includes(role);
};

// Static method to create admin
userSchema.statics.createAdmin = async function(adminData) {
  const admin = new this({
    ...adminData,
    role: 'admin'
  });
  return admin.save();
};

module.exports = mongoose.model('User', userSchema); 