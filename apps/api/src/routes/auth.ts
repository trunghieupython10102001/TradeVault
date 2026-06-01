import { Router, Request, Response } from 'express';
import { compare, hash } from 'bcryptjs';
import { prisma } from '@repo/database';
import { z } from 'zod';
import { signLegacyToken, requireAuth } from '../middleware/auth';
import { checkRateLimit, ipLimitKey, emailLimitKey } from '../middleware/rateLimit';

const router = Router();

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// POST /api/auth-legacy/login
router.post('/login', async (req: Request, res: Response) => {
  if (checkRateLimit(ipLimitKey(req, 'login-ip'))) {
    res.status(429).json({ error: 'Too many login attempts from this IP. Try again in 15 minutes.' });
    return;
  }

  try {
    const body = req.body;
    if (typeof body?.email === 'string' && checkRateLimit(emailLimitKey(body.email))) {
      res.status(429).json({ error: 'Too many login attempts for this email. Try again in 15 minutes.' });
      return;
    }

    const result = loginSchema.safeParse(body);
    if (!result.success) {
      res.status(400).json({ error: 'Invalid input', details: result.error.issues });
      return;
    }

    const { email, password } = result.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const valid = await compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    res.json({
      user: { id: user.id, name: user.name, email: user.email },
      token: signLegacyToken({ id: user.id, email: user.email }),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth-legacy/register
router.post('/register', async (req: Request, res: Response) => {
  if (checkRateLimit(ipLimitKey(req, 'register-ip'))) {
    res.status(429).json({ error: 'Too many registration attempts from this IP. Try again in 15 minutes.' });
    return;
  }

  try {
    const result = registerSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Invalid input', details: result.error.issues });
      return;
    }

    const { name, email, password } = result.data;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const passwordHash = await hash(password, 12);
    const user = await prisma.user.create({ data: { name, email, passwordHash } });

    await Promise.all([
      prisma.account.create({ data: { userId: user.id, name: 'Default Account', isDefault: true } }),
      prisma.userSettings.create({ data: { userId: user.id } }),
    ]);

    res.status(201).json({
      user: { id: user.id, name: user.name, email: user.email },
      token: signLegacyToken({ id: user.id, email: user.email }),
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// GET /api/auth-legacy/me
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, name: true, email: true, createdAt: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

export default router;
