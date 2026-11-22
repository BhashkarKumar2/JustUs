// Rate limiting middleware
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 500, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

// Strict rate limiter for auth endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  // Skip OPTIONS preflight requests
  skip: (req) => req.method === 'OPTIONS',
  // Key generator to lock out based on IP + Target Account
  // This helps mitigate distributed attacks targeting a single account
  keyGenerator: (req) => {
    // ipKeyGenerator groups IPv6 addresses by subnet so one client can't rotate
    // addresses to dodge the limit. req.ip is proxy-aware ('trust proxy' is set).
    const ip = ipKeyGenerator(req.ip || 'unknown');
    const identifier = String(req.body?.email || req.body?.username || 'unknown_user').trim().toLowerCase();
    return `${ip}:${identifier}`;
  }
});

// Media upload limiter
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 uploads per minute
  message: 'Too many uploads, please slow down.',
  standardHeaders: true,
  legacyHeaders: false
});
