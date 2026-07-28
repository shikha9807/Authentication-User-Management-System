import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

export const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    return Math.min(times * 200, 2000);
  }
});

redis.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Redis connection error', err);
});

redis.on('connect', () => {
  // eslint-disable-next-line no-console
  console.log('Connected to Redis');
});

export async function checkRedisConnection() {
  await redis.ping();
}
