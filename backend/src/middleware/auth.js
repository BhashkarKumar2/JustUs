import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not defined in environment variables.');
  process.exit(1);
}

export const authenticateJWT = (req, res, next) => {
  const path = req.path;
  const method = req.method;

  if (process.env.NODE_ENV !== 'production') {
    console.log(`JWT Middleware processing request: ${method} ${path}`);
  }

  // Skip authentication for OPTIONS requests (CORS preflight)
  if (method === 'OPTIONS') {
    console.log('Skipping JWT middleware for OPTIONS request');
    return next();
  }

  let token = null;

  // First, try to get token from Authorization header
  const authHeader = req.headers.authorization;
  console.log(`Authorization header: ${authHeader ? 'present' : 'missing'}`);

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    // If no Authorization header, try to get token from cookie
    token = req.cookies['auth-token'];
    if (token) {
      console.log('Token found in auth-token cookie');
    } else {
      console.log('No token found in Authorization header or cookies');
    }
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.userId = decoded.userId;
      req.username = decoded.username;

      if (process.env.NODE_ENV !== 'production') {
        console.log(`JWT validated successfully for user: ${req.userId}`);
      }
      next();
    } catch (error) {
      console.log(`JWT validation error: ${error.message}`);
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
  } else {
    console.log('No token provided');
    return res.status(401).json({ message: 'Authentication required' });
  }
};

export const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    token = req.cookies['auth-token'];
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.userId = decoded.userId;
      req.username = decoded.username;
    } catch (error) {
      // Token invalid, but continue anyway
    }
  }

  next();
};
