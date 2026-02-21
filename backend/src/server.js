import 'dotenv/config';
import express from 'express';
import webpush from 'web-push';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';

import { configureSocketIO } from './websocket/socketHandler.js';
import authRoutes from './routes/authRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import mediaRoutes from './routes/mediaRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import configRoutes from './routes/configRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import botRoutes from './routes/botRoutes.js';
import ttsRoutes from './routes/ttsRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import groupRoutes from './routes/groupRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import path from 'path';
import { fileURLToPath } from "url";



const app = express();
const httpServer = createServer(app);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set('trust proxy', 1);

// CORS configuration
// Unified CORS Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(origin => origin.trim()) || [];

console.log('Allowed CORS Origins:', allowedOrigins);

const getCorsOrigin = (origin, callback) => {
  // Allow requests with no origin (like mobile apps, curl, or Postman)
  if (!origin) return callback(null, true);

  // Allow Ngrok (Dynamic subdomains)
  if (origin.endsWith('.ngrok-free.app') || origin.endsWith('.ngrok.io')) {
    return callback(null, true);
  }

  // Check against allowed origins (if configured in env)
  if (allowedOrigins.includes(origin)) {
    return callback(null, true);
  }

  // Development flexibility: Allow localhost/127.0.0.1 on any port
  if (process.env.NODE_ENV !== 'production') {
    const isLocal = origin.startsWith('http://localhost') ||
      origin.startsWith('https://localhost') ||
      origin.startsWith('http://127.0.0.1') ||
      origin.startsWith('https://127.0.0.1');

    if (isLocal) {
      return callback(null, true);
    }
  }

  console.log('Blocked by CORS:', origin);
  return callback(new Error('Not allowed by CORS'));
};

const corsOptions = {
  origin: getCorsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'ngrok-skip-browser-warning'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));


// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"], // Allow WebSockets and API calls
      imgSrc: ["'self'", "data:", "blob:", "https:", "http:"], // Allow images from any source (avatars)
      mediaSrc: ["'self'", "data:", "blob:", "https:", "http:"], // Allow video/audio
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Needed for development/React
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"], // Prevent clickjacking
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" } // Allow cross-origin image loading
}));


// Compression middleware
app.use(compression());

// Middleware with size limits for security
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Get NODE_ENV
const NODE_ENV = process.env.NODE_ENV || 'development';

// Request logging in development
// Request logging in development
if (NODE_ENV === 'development') {
  // app.use((req, res, next) => { console.log(`${req.method} ${req.path}`); next(); });
}

// Apply rate limiting to all API routes
app.use('/api/', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/config', configRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/tts', ttsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/groups', groupRoutes);



// Handle API 404s (Prevent falling through to frontend)
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Serve frontend build (Works for both local dev build and production)
// Serve frontend build
app.use(express.static(path.join(__dirname, "..", "build")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "build", "index.html"));
});




// Error handler
app.use(errorHandler);




// --- Socket.IO Setup ---
const io = new Server(httpServer, {
  cors: corsOptions,
  pingTimeout: 60000,
  pingInterval: 25000
});

configureSocketIO(io);

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/justus';
const PORT = process.env.PORT || 5000;

console.log(`Starting server in ${NODE_ENV} mode...`);
console.log("CONNECTION STRING FOR MONGO :  ", MONGODB_URI);
console.log("=== BACKEND SERVER RESTARTING (Auth CORS Fix): " + new Date().toISOString() + " ===");

// Initialize Web Push
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_MAILTO || 'mailto:example@yourdomain.org',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  console.log('[OK] Web Push configured');
} else {
  console.warn('[WARN] Web Push keys missing in .env');
}

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10,
  minPoolSize: 2,
  socketTimeoutMS: 45000,
  serverSelectionTimeoutMS: 5000
})
  .then(async () => {
    console.log('[OK] Connected to MongoDB');

    // Health check on startup
    try {
      const adminDb = mongoose.connection.db.admin();
      const pingResult = await adminDb.ping();
      console.log('[OK] MongoDB ping successful:', pingResult);

      const collections = await mongoose.connection.db.listCollections().toArray();
      console.log(`[OK] Available collections: ${collections.map(c => c.name).join(', ')}`);

      // Check GridFS files
      const filesCollection = mongoose.connection.db.collection('fs.files');
      const fileCount = await filesCollection.countDocuments();
      console.log(`[OK] GridFS files count: ${fileCount}`);
    } catch (error) {
      console.error('[FAIL] Startup health check failed:', error.message);
    }

    // Start server
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`[OK] Server is running on port ${PORT}`);
      console.log(`[OK] Environment: ${NODE_ENV}`);
      console.log(`[OK] Allowed Origins: ${allowedOrigins.join(', ')}`);
    });
  })
  .catch(err => {
    console.error('[FAIL] MongoDB connection error:', err);
    process.exit(1);
  });

// Global Error Handling to prevent silent crashes
process.on('uncaughtException', (error) => {
  console.error('CRITICAL: UNCAUGHT EXCEPTION:', error);
  console.error(error.stack);
  // Optional: keep process alive or exit gracefully
  // process.exit(1); 
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: UNHANDLED REJECTION:', reason);
  // Log promise details if possible
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  httpServer.close(() => {
    console.log('HTTP server closed');
  });
  await mongoose.connection.close();
  process.exit(0);
});