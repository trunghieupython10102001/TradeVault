import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: string;
}

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is not set. Refusing to start with a fallback secret.');
  }
  return secret;
}

export function signToken(payload: { id: string; email: string }): string {
  return jwt.sign(payload, getAuthSecret(), { expiresIn: '7d' });
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const decoded = jwt.verify(token, getAuthSecret()) as { id: string; email: string };
    req.userId = decoded.id;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}
