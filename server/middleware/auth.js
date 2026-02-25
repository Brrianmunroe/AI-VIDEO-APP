/**
 * Auth middleware - verifies Supabase JWT.
 * Expects Authorization: Bearer <token>
 */

import jwt from 'jsonwebtoken';

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!jwtSecret) {
    console.error('[Auth] SUPABASE_JWT_SECRET not set in server/.env');
    return res.status(500).json({ error: 'Server missing SUPABASE_JWT_SECRET. Add it to server/.env (from Supabase → Project Settings → API → JWT Settings)' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = {
      id: decoded.sub,
      email: decoded.email,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}
