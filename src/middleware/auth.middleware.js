import { verifyAccessToken, isAccessTokenBlacklisted } from '../utils/jwt.js';

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired access token.' });
    }

    const blacklisted = await isAccessTokenBlacklisted(payload.jti);
    if (blacklisted) {
      return res.status(401).json({ error: 'Token has been revoked.' });
    }

    req.auth = payload; // { sub, email, role, jti }
    return next();
  } catch (err) {
    return next(err);
  }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }
    return next();
  };
}
