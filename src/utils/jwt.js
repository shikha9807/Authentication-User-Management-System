import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { redis } from '../config/redis.js';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// Convert '7d' / '15m' style strings to seconds for Redis TTL
function expiryToSeconds(expiry) {
  const match = /^(\d+)([smhd])$/.exec(expiry);
  if (!match) return 900; // default 15 minutes
  const value = Number(match[1]);
  const unit = match[2];
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * multipliers[unit];
}

const REFRESH_TTL_SECONDS = expiryToSeconds(REFRESH_EXPIRES_IN);
const ACCESS_TTL_SECONDS = expiryToSeconds(ACCESS_EXPIRES_IN);

function refreshKey(userId, jti) {
  return `refresh:${userId}:${jti}`;
}

function blacklistKey(jti) {
  return `blacklist:${jti}`;
}

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, jti: uuidv4() },
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRES_IN }
  );
}

// Creates a refresh token AND stores its id in Redis so it can be revoked / rotated
export async function signRefreshToken(user) {
  const jti = uuidv4();
  const token = jwt.sign({ sub: user.id, jti }, REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES_IN
  });
  await redis.set(refreshKey(user.id, jti), '1', 'EX', REFRESH_TTL_SECONDS);
  return { token, jti };
}

export function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

export async function isRefreshTokenValid(userId, jti) {
  const exists = await redis.get(refreshKey(userId, jti));
  return exists !== null;
}

export async function revokeRefreshToken(userId, jti) {
  await redis.del(refreshKey(userId, jti));
}

// Revoke every refresh token for a user (e.g. "logout all devices" or password change)
export async function revokeAllRefreshTokens(userId) {
  const pattern = `refresh:${userId}:*`;
  const stream = redis.scanStream({ match: pattern, count: 100 });
  const keysToDelete = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (keys) => keysToDelete.push(...keys));
    stream.on('end', async () => {
      if (keysToDelete.length > 0) {
        await redis.del(...keysToDelete);
      }
      resolve();
    });
    stream.on('error', reject);
  });
}

// Blacklist an access token's jti until its natural expiry, so it can't be reused after logout
export async function blacklistAccessToken(jti, expSeconds = ACCESS_TTL_SECONDS) {
  await redis.set(blacklistKey(jti), '1', 'EX', expSeconds);
}

export async function isAccessTokenBlacklisted(jti) {
  const exists = await redis.get(blacklistKey(jti));
  return exists !== null;
}
