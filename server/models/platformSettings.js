const mongoose = require('mongoose');

const platformSettingsSchema = new mongoose.Schema({
  defaultPlatformFeePercentage: {
    type: Number,
    default: 20,
    min: 0,
    max: 100,
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Ensure only one settings document exists
platformSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({ defaultPlatformFeePercentage: 20 });
  }
  return settings;
};

const PlatformSettings = mongoose.model('PlatformSettings', platformSettingsSchema);
module.exports = PlatformSettings;
