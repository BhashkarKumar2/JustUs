import express from 'express';
import { uploadFile, uploadMiddleware, getFile } from '../controllers/mediaController.js';
import { authenticateJWT } from '../middleware/auth.js';

const router = express.Router();

// Middleware to handle token from query parameter as fallback (for ngrok/tunnels)
const tokenFromQuery = (req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim());

  // SECURITY: Only allow explicitly configured origins, no wildcard fallback
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!req.headers.authorization && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
};

router.post('/upload', authenticateJWT, uploadMiddleware, uploadFile);
router.get('/file/:id', tokenFromQuery, authenticateJWT, getFile);

export default router;
