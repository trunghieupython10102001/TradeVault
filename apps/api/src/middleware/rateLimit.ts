import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

function ipKey(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

export const loginIpLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts from this IP. Try again in 15 minutes.' },
  keyGenerator: ipKey,
});

export const loginEmailLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts for this email. Try again in 15 minutes.' },
  keyGenerator: (req: Request) => {
    const email = (req.body?.email as string | undefined)?.toLowerCase().trim();
    return email ? `email:${email}` : ipKey(req);
  },
  skip: (req: Request) => !req.body?.email,
});

export const registerLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts from this IP. Try again in 15 minutes.' },
  keyGenerator: ipKey,
});
