import { Request } from 'express';

type Hit = { count: number; resetAt: number };

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const hits = new Map<string, Hit>();

export function checkRateLimit(key: string, max = 5): boolean {
  const now = Date.now();
  const hit = hits.get(key);
  if (!hit || hit.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + FIFTEEN_MINUTES });
    return false;
  }
  hit.count += 1;
  return hit.count > max;
}

export function ipLimitKey(req: Request, scope: string): string {
  const forwarded = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  const ip = forwarded || req.ip || 'unknown';
  return `${scope}:${ip}`;
}

export function emailLimitKey(email: string): string {
  return `login-email:${email.toLowerCase().trim()}`;
}
