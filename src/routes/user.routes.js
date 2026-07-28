import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { findUserById } from '../models/user.model.js';

const router = Router();

// Any authenticated user can view their own dashboard data
router.get('/dashboard', requireAuth, async (req, res, next) => {
  try {
    const user = await findUserById(req.auth.sub);
    return res.status(200).json({ message: `Welcome back, ${user.first_name || user.email}!`, user });
  } catch (err) {
    return next(err);
  }
});

// Example admin-only route demonstrating role-based access control
router.get('/admin/overview', requireAuth, requireRole('admin'), (req, res) => {
  return res.status(200).json({ message: 'Admin overview data.' });
});

export default router;
