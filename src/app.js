import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { checkDbConnection } from './config/db.js';
//import { checkRedisConnection } from './config/redis.js';

dotenv.config();

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
    credentials: true
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/health', async (req, res) => {
  const status = { server: 'ok', database: 'unknown', redis: 'unknown' };
  //try {
    //await checkDbConnection();
    //status.database = 'ok';
 // } catch {
   // status.database = 'error';
 // }
  try {
    await checkRedisConnection();
    status.redis = 'ok';
  } catch {
    status.redis = 'error';
  }
  const allOk = Object.values(status).every((v) => v === 'ok');
  return res.status(allOk ? 200 : 503).json(status);
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
