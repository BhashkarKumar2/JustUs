import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import mongoose from 'mongoose';
import multer from 'multer';
import { GridFsStorage } from 'multer-gridfs-storage';
import User from '../models/User.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import { generateToken } from '../utils/jwtUtil.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/emailService.js';
import RefreshToken from '../models/RefreshToken.js';

// Create GridFS storage for avatars
const avatarStorage = new GridFsStorage({
  db: mongoose.connection,
  file: (req, file) => {
    return {
      filename: `avatar_${req.userId}_${Date.now()}`,
      bucketName: 'avatars',
      metadata: {
        userId: req.userId,
        uploadedAt: new Date()
      }
    };
  }
});

export const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: (req, file, cb) => {
    // Only allow image files
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

export const avatarUploadMiddleware = avatarUpload.single('avatar');

// Helper to generate 6-digit code
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const register = async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // SECURITY: Password complexity validation
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }
    if (!/[A-Z]/.test(password)) {
      return res.status(400).json({ message: 'Password must contain at least one uppercase letter' });
    }
    if (!/[0-9]/.test(password)) {
      return res.status(400).json({ message: 'Password must contain at least one number' });
    }

    // Check if username or email exists
    const existingUser = await User.findOne({
      $or: [{ username: username.trim() }, { email: email.trim().toLowerCase() }]
    });

    if (existingUser) {
      if (existingUser.username === username.trim()) {
        return res.status(409).json({ message: 'Username already exists' });
      }
      return res.status(409).json({ message: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const verificationCode = generateVerificationCode();
    const verificationCodeExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
    const inviteCode = crypto.randomBytes(4).toString('hex');

    const user = new User({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      displayName: displayName || username.trim(),
      passwordHash,
      verificationCode,
      verificationCodeExpires,
      isVerified: false,
      inviteCode,
      contacts: []
    });

    const saved = await user.save();

    // Send email
    await sendVerificationEmail(saved.email, saved.displayName, verificationCode);

    // Send System Message with Invite Link
    const systemId = '000000000000000000000000';
    const userId = saved._id.toString();

    // Create conversation with System
    const key = systemId < userId ? `${systemId}:${userId}` : `${userId}:${systemId}`;
    let conversation = await Conversation.findOne({ key });
    if (!conversation) {
      conversation = new Conversation({
        participantA: systemId < userId ? systemId : userId,
        participantB: systemId < userId ? userId : systemId,
        key
      });
      await conversation.save();
    }

    const systemMessage = new Message({
      senderId: systemId,
      receiverId: userId,
      conversationId: conversation._id,
      type: 'text',
      senderDisplayName: `Welcome to ${saved.displayName}!`,
      content: `Welcome to JustUs!\n\nHere is your unique invite code to connect with others:\n${inviteCode}\n\nHow to connect with someone:\n1) Ask your friend to share their 8-character invite code.\n2) Click the Contacts button (person-with-plus icon) in the chat header.\n3) Enter their invite code in the Add Contact box and press Add.\n\nTip: Your own invite code is above — share it to let others connect with you.`,
      timestamp: new Date()
    });
    await systemMessage.save();

    res.status(201).json({
      message: 'Registration successful. Please check your email for verification code.',
      userId: saved._id,
      email: saved.email,
      requiresVerification: true
    });

  } catch (error) {
    console.error('Registration error:', error.message);
    res.status(500).json({
      message: `Registration failed: ${error.message}`
    });
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const { email, code } = req.body;

    const user = await User.findOne({ email: email.trim().toLowerCase() });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: 'Email already verified' });
    }

    if (user.verificationCode !== code) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    if (user.verificationCodeExpires < Date.now()) {
      return res.status(400).json({ message: 'Verification code expired' });
    }

    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpires = undefined;
    await user.save();

    // Auto login after verification
    // Auto login after verification
    const token = generateToken(user._id.toString(), user.username);
    const refreshToken = crypto.randomBytes(40).toString('hex');
    const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await new RefreshToken({
      token: refreshToken,
      user: user._id,
      expiryDate
    }).save();

    res.cookie('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 15 * 60 * 1000, // 15 mins
      sameSite: 'lax',
      path: '/'
    });

    res.cookie('refresh-token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      path: '/'
    });

    res.json({
      message: 'Email verified successfully',
      token,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        hasCompletedTour: user.hasCompletedTour || false
      }
    });

  } catch (error) {
    console.error('Verification error:', error.message);
    res.status(500).json({ message: 'Verification failed' });
  }
};

export const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email: email.trim().toLowerCase() });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: 'Email already verified' });
    }

    const verificationCode = generateVerificationCode();
    user.verificationCode = verificationCode;
    user.verificationCodeExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    await sendVerificationEmail(user.email, user.displayName, verificationCode);

    res.json({ message: 'Verification code resent' });

  } catch (error) {
    console.error('Resend error:', error.message);
    res.status(500).json({ message: 'Failed to resend code' });
  }
};

export const login = async (req, res) => {
  try {
    const { username, password } = req.body; // username can be email or username

    if (!username || !password) {
      return res.status(400).json({ message: 'Username/Email and password are required' });
    }

    // Allow login with email or username
    const user = await User.findOne({
      $or: [{ username: username.trim() }, { email: username.trim().toLowerCase() }]
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        message: 'Please verify your email first',
        requiresVerification: true,
        email: user.email
      });
    }

    // Generate invite code if missing (migration for existing users)
    if (!user.inviteCode) {
      user.inviteCode = crypto.randomBytes(4).toString('hex');
      await user.save();
    }

    const token = generateToken(user._id.toString(), user.username);
    const refreshToken = crypto.randomBytes(40).toString('hex');
    const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await new RefreshToken({
      token: refreshToken,
      user: user._id,
      expiryDate
    }).save();

    res.cookie('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 15 * 60 * 1000, // 15 mins
      sameSite: 'lax',
      path: '/'
    });

    res.cookie('refresh-token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      path: '/'
    });

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        hasCompletedTour: user.hasCompletedTour || false
      }
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ message: 'Login failed' });
  }
};

export const refreshToken = async (req, res) => {
  try {
    const refreshToken = req.cookies['refresh-token'];
    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh Token Required' });
    }

    const tokenDoc = await RefreshToken.findOne({ token: refreshToken }).populate('user');
    if (!tokenDoc || tokenDoc.revoked || tokenDoc.expiryDate < Date.now()) {
      return res.status(403).json({ message: 'Refresh Token Expired or Invalid' });
    }

    const user = tokenDoc.user;
    const newToken = generateToken(user._id.toString(), user.username);

    // Rotate refresh token
    const newRefreshToken = crypto.randomBytes(40).toString('hex');
    tokenDoc.revoked = true;
    tokenDoc.replacedByToken = newRefreshToken;
    await tokenDoc.save();

    await new RefreshToken({
      token: newRefreshToken,
      user: user._id,
      expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }).save();

    res.cookie('auth-token', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 15 * 60 * 1000,
      sameSite: 'lax',
      path: '/'
    });

    res.cookie('refresh-token', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      path: '/'
    });

    res.json({ token: newToken });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ message: 'Failed to refresh token' });
  }
};

export const logout = async (req, res) => {
  try {
    // Clear the auth cookies
    res.cookie('auth-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 0,
      sameSite: 'lax',
      path: '/'
    });
    res.cookie('refresh-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 0,
      sameSite: 'lax',
      path: '/'
    });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error.message);
    res.status(500).json({
      message: `Logout failed: ${error.message}`
    });
  }
};

export const connectUser = async (req, res) => {
  try {
    const { inviteCode } = req.body;
    const currentUserId = req.userId; // From middleware

    if (!inviteCode) {
      return res.status(400).json({ message: 'Invite code is required' });
    }

    const targetUser = await User.findOne({ inviteCode });
    if (!targetUser) {
      return res.status(404).json({ message: 'Invalid invite code' });
    }

    if (targetUser._id.toString() === currentUserId) {
      return res.status(400).json({ message: 'You cannot connect with yourself' });
    }

    const currentUser = await User.findById(currentUserId);

    // Check if already connected
    if (currentUser.contacts.some(c => c.toString() === targetUser._id.toString())) {
      return res.status(200).json({
        message: 'Already connected', user: {
          id: targetUser._id,
          username: targetUser.username,
          displayName: targetUser.displayName
        }
      });
    }

    // Add to contacts (bidirectional)
    currentUser.contacts.push(targetUser._id);
    targetUser.contacts.push(currentUser._id);

    await currentUser.save();
    await targetUser.save();

    res.json({
      message: 'Connected successfully',
      user: {
        id: targetUser._id,
        username: targetUser.username,
        displayName: targetUser.displayName
      }
    });

  } catch (error) {
    console.error('Connect error:', error);
    res.status(500).json({ message: 'Failed to connect' });
  }
};

export const getUsers = async (req, res) => {
  try {
    // Only return contacts + System User
    const currentUser = await User.findById(req.userId).populate('contacts', 'username displayName _id avatarUrl');

    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const contacts = currentUser.contacts.map(user => ({
      id: user._id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl
    }));

    const systemUser = {
      id: '000000000000000000000000',
      username: 'system',
      displayName: 'JustUs System'
    };

    res.json([systemUser, ...contacts]);
  } catch (error) {
    console.error('Get users error:', error.message);
    res.status(500).json({
      message: `Failed to get users: ${error.message}`
    });
  }
};

export const getUserById = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId, 'username displayName email avatarUrl preferredLanguage');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      id: user._id.toString(),
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      preferredLanguage: user.preferredLanguage || 'en'
    });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({ message: 'Failed to fetch user' });
  }
};

export const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Store the file ID as avatar URL (will be retrieved from GridFS by ID)
    user.avatarUrl = `/api/auth/avatar/${req.file.id.toString()}`;
    await user.save();

    res.json({
      message: 'Avatar uploaded successfully',
      avatarUrl: user.avatarUrl,
      fileId: req.file.id.toString()
    });
  } catch (error) {
    console.error('[auth] Avatar upload error:', error);
    res.status(500).json({ message: 'Failed to upload avatar' });
  }
};

export const getAvatar = async (req, res) => {
  try {
    const { fileId } = req.params;
    const objectId = mongoose.Types.ObjectId.createFromHexString(fileId);

    // Access GridFS bucket from mongoose connection
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'avatars'
    });

    // Check if file exists
    const files = await mongoose.connection.db.collection('avatars.files').findOne({ _id: objectId });
    if (!files) {
      return res.status(404).json({ message: 'Avatar not found' });
    }

    // Set CORS headers for image loading
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Content-Type', files.contentType || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

    const downloadStream = bucket.openDownloadStream(objectId);
    downloadStream.pipe(res);
  } catch (error) {
    console.error('[auth] Avatar retrieval error:', error);
    res.status(500).json({ message: 'Failed to retrieve avatar' });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const userId = req.userId;
    const { displayName, preferredLanguage } = req.body;

    const updates = {};
    if (displayName) updates.displayName = displayName;
    if (preferredLanguage) updates.preferredLanguage = preferredLanguage;

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true }
    ).select('-passwordHash -verificationCode -verificationCodeExpires');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        preferredLanguage: user.preferredLanguage
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      // For security reasons, don't reveal if user exists or not
      return res.json({ message: 'If an account exists with this email, you will receive a verification code shortly.' });
    }

    // Generate 6-digit code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

    user.resetPasswordToken = resetCode; // Store directly like verificationCode
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
    await user.save();

    // Send email
    const emailSent = await sendPasswordResetEmail(user.email, user.displayName, resetCode);

    if (!emailSent) {
      return res.status(500).json({ message: 'Failed to send reset email' });
    }

    res.json({ message: 'If an account exists with this email, you will receive a verification code shortly.' });
  } catch (error) {
    console.error('Forgot password error:', error.message);
    res.status(500).json({ message: 'An error occurred. Please try again later.' });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Find user with matching email and code, and check expiration
    const user = await User.findOne({
      email: email.trim().toLowerCase(),
      resetPasswordToken: code,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired verification code' });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = passwordHash;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Revoke all refresh tokens for this user for security
    await RefreshToken.deleteMany({ user: user._id });

    res.json({ message: 'Password has been reset successfully. You can now log in with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error.message);
    res.status(500).json({ message: 'Failed to reset password' });
  }
};

export const completeTour = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.userId, { hasCompletedTour: true });
    res.json({ message: 'Tour completed' });
  } catch (error) {
    console.error('Complete tour error:', error);
    res.status(500).json({ message: 'Failed to update tour status' });
  }
};
