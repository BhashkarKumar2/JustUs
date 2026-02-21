import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  displayName: {
    type: String,
    required: true,
    trim: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationCode: {
    type: String
  },
  verificationCodeExpires: {
    type: Date
  },
  inviteCode: {
    type: String,
    unique: true,
    sparse: true
  },
  contacts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  publicKey: {
    type: String,
    sparse: true
  },
  preferredLanguage: {
    type: String,
    default: 'en',
    enum: [
      'en', 'hi', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa', 'ur', 'as' // Indian Languages Only
    ]
  },
  encryptedSecretKey: {
    type: String,
    sparse: true
  },
  avatarUrl: {
    type: String,
    default: null
  },
  hasCompletedTour: {
    type: Boolean,
    default: false
  },
  resetPasswordToken: {
    type: String
  },
  resetPasswordExpires: {
    type: Date
  }
}, {
  timestamps: true,
  collection: 'users'
});

// Indexes for scalability
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ inviteCode: 1 }, { unique: true, sparse: true });
userSchema.index({ contacts: 1 }); // For users with many contacts

const User = mongoose.model('User', userSchema);

export default User;
