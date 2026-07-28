# Auth System — JWT + Redis + PostgreSQL + Docker

A production-style authentication and user management API.

## Features

- **Registration & login** with bcrypt password hashing (12 salt rounds)
- **JWT access tokens** (short-lived, 15m default) + **refresh tokens** (7d default) with rotation
- **Redis-backed session store**: refresh tokens are whitelisted in Redis so they can be revoked individually or all at once ("logout everywhere")
- **Access token revocation**: logout blacklists the token's `jti` in Redis until natural expiry
- **Account lockout**: 5 failed login attempts locks the account for 15 minutes
- **Rate limiting** on `/register` and `/login` to slow down brute force / credential stuffing
- **Role-based access control** middleware (`requireRole('admin')`)
- **Input validation** via `express-validator`
- **PostgreSQL** for durable user storage, **Redis** for ephemeral session/token state
- Security headers via `helmet`, CORS lockdown, HTTP-only refresh cookie
- Fully dockerized with health checks for all three services

## Architecture

```
Client → Express API (JWT verify) → PostgreSQL (users)
                    ↓
                  Redis (refresh token whitelist, access token blacklist)
```

- **Access token**: sent in `Authorization: Bearer <token>` header, verified stateless via JWT signature, but checked against a Redis blacklist so logout can invalidate it immediately.
- **Refresh token**: stored in an `httpOnly`, `sameSite=strict` cookie scoped to `/api/auth`. Each refresh rotates the token (old one revoked, new one issued) and its `jti` is tracked in Redis so it can be revoked server-side.

## Project structure

```
auth-system/
├── src/
│   ├── config/       # DB pool, Redis client, migration runner
│   ├── controllers/  # Route handler logic
│   ├── middleware/   # Auth guard, rate limiter, validation, error handler
│   ├── models/       # SQL data-access layer
│   ├── routes/       # Express routers
│   ├── utils/        # Password hashing, JWT + Redis token helpers
│   ├── app.js         # Express app wiring
│   └── server.js      # Entry point / graceful shutdown
├── init.sql            # DB schema (users table, triggers)
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── package.json
```

## Quick start (Docker — recommended)

1. Copy the environment template and fill in real secrets:
   ```bash
   cp .env.example .env
   ```
   At minimum, change `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET` to strong random values, e.g.:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

2. Build and start everything:
   ```bash
   docker compose up --build
   ```
   This starts the API on `:4000`, PostgreSQL on `:5432` (schema auto-applied from `init.sql`), and Redis on `:6379`.

3. Confirm health:
   ```bash
   curl http://localhost:4000/health
   ```

## Local development (without Docker)

1. Start PostgreSQL and Redis yourself (or run just those two via `docker compose up postgres redis`).
2. `cp .env.example .env` and set `POSTGRES_HOST=localhost`, `REDIS_HOST=localhost`.
3. Install dependencies and run the migration:
   ```bash
   npm install
   npm run migrate
   npm run dev
   ```

## API Reference

All routes are prefixed with `/api/auth` unless noted.

| Method | Route | Auth required | Description |
|---|---|---|---|
| POST | `/register` | No | Create a new account |
| POST | `/login` | No | Log in, returns access token + sets refresh cookie |
| POST | `/refresh` | Refresh cookie | Rotate refresh token, issue new access token |
| POST | `/logout` | Yes | Revoke current session |
| POST | `/logout-all` | Yes | Revoke every session for this user |
| GET | `/me` | Yes | Get current user's profile |
| POST | `/change-password` | Yes | Change password, revokes all sessions |
| GET | `/api/users/dashboard` | Yes | Example protected resource |
| GET | `/api/users/admin/overview` | Yes (role: admin) | Example role-gated resource |

### Register
```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","password":"Sup3rSecret","firstName":"Jane"}'
```

### Login
```bash
curl -i -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"jane@example.com","password":"Sup3rSecret"}'
```
Response includes `accessToken`; the refresh token is set as an `httpOnly` cookie (saved to `cookies.txt` above).

### Call a protected route
```bash
curl http://localhost:4000/api/auth/me \
  -H "Authorization: Bearer <accessToken>"
```

### Refresh the access token
```bash
curl -X POST http://localhost:4000/api/auth/refresh -b cookies.txt
```

### Logout
```bash
curl -X POST http://localhost:4000/api/auth/logout \
  -H "Authorization: Bearer <accessToken>" -b cookies.txt
```

## Security notes / production checklist

- Rotate `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` to long random values — never use the example placeholders.
- Put the API behind HTTPS/TLS in production; the refresh cookie only sets `secure` when `NODE_ENV=production`.
- Tighten `CLIENT_ORIGIN` to your real frontend origin(s).
- Consider adding email verification (the `is_verified` column is already in the schema) and a password-reset flow using short-lived signed tokens.
- The `.env` file is git-ignored — never commit real secrets.

## Extending

- **Email verification / password reset**: reuse the Redis token pattern in `src/utils/jwt.js` with a dedicated short-lived signed token.
- **Multi-role permissions**: `requireRole()` already accepts multiple roles, e.g. `requireRole('admin', 'moderator')`.
- **Horizontal scaling**: because refresh/blacklist state lives in Redis (not in-process memory), you can run multiple API replicas behind a load balancer.
