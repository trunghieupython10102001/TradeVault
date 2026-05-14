type Hit = { count: number; resetAt: number };

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const hits = new Map<string, Hit>();

function keyFromRequest(request: Request, scope: string) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return `${scope}:${forwarded || 'unknown'}`;
}

export function checkRateLimit(key: string, max = 5) {
  const now = Date.now();
  const hit = hits.get(key);
  if (!hit || hit.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + FIFTEEN_MINUTES });
    return false;
  }
  hit.count += 1;
  return hit.count > max;
}

export function ipLimitKey(request: Request, scope: string) {
  return keyFromRequest(request, scope);
}

export function emailLimitKey(email: string) {
  return `login-email:${email.toLowerCase().trim()}`;
}
