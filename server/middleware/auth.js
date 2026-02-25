/**
 * Auth middleware - verifies Supabase JWT via JWKS (supports new ECC signing keys).
 * Expects Authorization: Bearer <token>
 */

import * as jose from 'jose';

const SUPABASE_URL = process.env.SUPABASE_URL?.trim() || '';
const JWKS_URL = SUPABASE_URL
  ? `${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`
  : '';

let jwks = null;

function getJWKS() {
  if (!JWKS_URL) return null;
  if (!jwks) {
    jwks = jose.createRemoteJWKSet(new URL(JWKS_URL));
  }
  return jwks;
}

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  if (!SUPABASE_URL) {
    console.error('[Auth] SUPABASE_URL not set in server env');
    return res.status(500).json({ error: 'Server missing SUPABASE_URL' });
  }

  const jwksInstance = getJWKS();
  if (!jwksInstance) {
    return res.status(500).json({ error: 'Server could not build JWKS URL' });
  }

  try {
    const { payload } = await jose.jwtVerify(token, jwksInstance);
    req.user = {
      id: payload.sub,
      email: payload.email,
    };
    next();
  } catch (err) {
    if (err?.code === 'ERR_JWT_EXPIRED') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}
