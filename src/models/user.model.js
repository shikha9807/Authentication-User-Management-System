import { query } from '../config/db.js';

const PUBLIC_FIELDS = `id, email, first_name, last_name, role, is_verified, is_active, created_at, updated_at`;

export async function createUser({ email, passwordHash, firstName, lastName }) {
  const result = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name)
     VALUES ($1, $2, $3, $4)
     RETURNING ${PUBLIC_FIELDS}`,
    [email.toLowerCase(), passwordHash, firstName || null, lastName || null]
  );
  return result.rows[0];
}

export async function findUserByEmail(email) {
  const result = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  return result.rows[0] || null;
}

export async function findUserById(id) {
  const result = await query(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

export async function updatePasswordHash(userId, passwordHash) {
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
}

export async function incrementFailedLoginAttempts(userId) {
  const result = await query(
    `UPDATE users
     SET failed_login_attempts = failed_login_attempts + 1
     WHERE id = $1
     RETURNING failed_login_attempts`,
    [userId]
  );
  return result.rows[0]?.failed_login_attempts;
}

export async function resetFailedLoginAttempts(userId) {
  await query(
    'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
    [userId]
  );
}

export async function lockUserAccount(userId, lockedUntil) {
  await query('UPDATE users SET locked_until = $1 WHERE id = $2', [lockedUntil, userId]);
}
