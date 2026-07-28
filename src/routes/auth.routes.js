import { Router } from 'express';
import {
  register,
  login,
  refresh,
  logout,
  logoutAllDevices,
  getProfile,
  changePassword
} from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { loginRateLimiter, registerRateLimiter } from '../middleware/rateLimiter.js';
import {
  registerValidation,
  loginValidation,
  changePasswordValidation
} from '../middleware/validate.js';

const router = Router();

router.post('/register', registerRateLimiter, registerValidation, register);
router.post('/login', loginRateLimiter, loginValidation, login);
router.post('/refresh', refresh);
router.post('/logout', requireAuth, logout);
router.post('/logout-all', requireAuth, logoutAllDevices);
router.get('/me', requireAuth, getProfile);
router.post('/change-password', requireAuth, changePasswordValidation, changePassword);

export default router;
