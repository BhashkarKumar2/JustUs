import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
console.log('JWT_SECRET:', JWT_SECRET);
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET is not defined in environment variables.');
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';

export const generateToken = (userId, username) => {
  return jwt.sign(
    { userId, username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    console.log('[JWT] Verification failed:', error.message);
    return null;
  }
};

export const parseUserId = (token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.userId;
  } catch (error) {
    return null;
  }
};
