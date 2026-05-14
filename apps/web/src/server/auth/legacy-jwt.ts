import jwt from 'jsonwebtoken';

export type LegacyAuthResult =
  | { userId: string; error?: never; status?: never }
  | { userId?: never; error: string; status: number };

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is not set');
  }
  return secret;
}

export function getUserIdFromRequest(req: Request): LegacyAuthResult {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    return { error: 'Not authenticated', status: 401 };
  }

  try {
    const decoded = jwt.verify(header.slice(7), getAuthSecret()) as { id: string; email: string };
    return { userId: decoded.id };
  } catch {
    return { error: 'Invalid or expired token', status: 401 };
  }
}
