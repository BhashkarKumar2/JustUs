import express from 'express';
import { register, login, refreshToken, logout, getUsers, getUserById, verifyEmail, resendVerification, connectUser, uploadAvatar, getAvatar, avatarUploadMiddleware, updateProfile, forgotPassword, resetPassword } from '../controllers/authController.js';
import { authenticateJWT } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Middleware to ensure CORS headers are present even on errors
const corsMiddleware = (req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim());

    // SECURITY: Only allow explicitly configured origins, no wildcard fallback
    if (origin && allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
};

router.use(corsMiddleware);

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/refresh-token', refreshToken);
router.post('/verify-email', authLimiter, verifyEmail);
router.post('/resend-verification', authLimiter, resendVerification);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPassword);
router.post('/logout', logout);
router.get('/users', authenticateJWT, getUsers);
router.get('/user/:userId', authenticateJWT, getUserById);
router.post('/connect', authenticateJWT, connectUser);
router.post('/avatar/upload', authenticateJWT, avatarUploadMiddleware, uploadAvatar);
router.get('/avatar/:fileId', authenticateJWT, getAvatar); // SECURITY: Now requires authentication
router.put('/profile', authenticateJWT, updateProfile);

export default router;
