import {
  createUser,
  findUserByEmail,
  findUserById,
  updatePasswordHash,
  incrementFailedLoginAttempts,
  resetFailedLoginAttempts,
  lockUserAccount
} from '../models/user.model.js';
import { hashPassword, comparePassword, isPasswordStrong } from '../utils/password.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  isRefreshTokenValid,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  blacklistAccessToken
} from '../utils/jwt.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const REFRESH_COOKIE_NAME = 'refresh_token';
const isProd = process.env.NODE_ENV === 'production';

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
}

function sanitizeUser(user) {
  const { password_hash, failed_login_attempts, locked_until, ...safe } = user;
  return safe;
}

export async function register(req, res, next) {
  try {
    const { email, password, firstName, lastName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    if (!isPasswordStrong(password)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters and include a letter and a number.'
      });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser({ email, passwordHash, firstName, lastName });

    return res.status(201).json({ user });
  } catch (err) {
    return next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await findUserByEmail(email);
    // Use a generic error message to avoid leaking which emails are registered
    const genericError = { error: 'Invalid email or password.' };

    if (!user || !user.is_active) {
      return res.status(401).json(genericError);
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({
        error: 'Account temporarily locked due to too many failed login attempts. Try again later.'
      });
    }

    const passwordMatches = await comparePassword(password, user.password_hash);
    if (!passwordMatches) {
      const attempts = await incrementFailedLoginAttempts(user.id);
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        await lockUserAccount(user.id, new Date(Date.now() + LOCK_DURATION_MS));
        return res.status(423).json({
          error: 'Account locked due to too many failed login attempts. Try again in 15 minutes.'
        });
      }
      return res.status(401).json(genericError);
    }

    await resetFailedLoginAttempts(user.id);

    const accessToken = signAccessToken(user);
    const { token: refreshToken } = await signRefreshToken(user);

    setRefreshCookie(res, refreshToken);

    return res.status(200).json({
      user: sanitizeUser(user),
      accessToken
    });
  } catch (err) {
    return next(err);
  }
}

export async function refresh(req, res, next) {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
    if (!token) {
      return res.status(401).json({ error: 'Refresh token missing.' });
    }

    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }

    const valid = await isRefreshTokenValid(payload.sub, payload.jti);
    if (!valid) {
      return res.status(401).json({ error: 'Refresh token has been revoked. Please log in again.' });
    }

    const user = await findUserById(payload.sub);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'User not found or inactive.' });
    }

    // Rotate refresh token: revoke old, issue new
    await revokeRefreshToken(payload.sub, payload.jti);
    const accessToken = signAccessToken(user);
    const { token: newRefreshToken } = await signRefreshToken(user);
    setRefreshCookie(res, newRefreshToken);

    return res.status(200).json({ accessToken });
  } catch (err) {
    return next(err);
  }
}

export async function logout(req, res, next) {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;

    if (token) {
      try {
        const payload = verifyRefreshToken(token);
        await revokeRefreshToken(payload.sub, payload.jti);
      } catch {
        // token already invalid/expired - nothing to revoke
      }
    }

    if (req.auth?.jti) {
      await blacklistAccessToken(req.auth.jti);
    }

    clearRefreshCookie(res);
    return res.status(200).json({ message: 'Logged out successfully.' });
  } catch (err) {
    return next(err);
  }
}

export async function logoutAllDevices(req, res, next) {
  try {
    await revokeAllRefreshTokens(req.auth.sub);
    if (req.auth?.jti) {
      await blacklistAccessToken(req.auth.jti);
    }
    clearRefreshCookie(res);
    return res.status(200).json({ message: 'Logged out from all devices.' });
  } catch (err) {
    return next(err);
  }
}

export async function getProfile(req, res, next) {
  try {
    const user = await findUserById(req.auth.sub);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    return res.status(200).json({ user });
  } catch (err) {
    return next(err);
  }
}

export async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required.' });
    }
    if (!isPasswordStrong(newPassword)) {
      return res.status(400).json({
        error: 'New password must be at least 8 characters and include a letter and a number.'
      });
    }

    const user = await findUserByEmail(req.auth.email);
    const matches = await comparePassword(currentPassword, user.password_hash);
    if (!matches) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const newHash = await hashPassword(newPassword);
    await updatePasswordHash(user.id, newHash);

    // Invalidate all existing sessions so the old password can't keep a session alive
    await revokeAllRefreshTokens(user.id);
    clearRefreshCookie(res);

    return res.status(200).json({ message: 'Password changed successfully. Please log in again.' });
  } catch (err) {
    return next(err);
  }
}
