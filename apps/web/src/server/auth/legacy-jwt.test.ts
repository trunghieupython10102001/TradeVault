import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { getUserIdFromRequest } from './legacy-jwt';

const SECRET = 'test-secret';

function makeRequest(authHeader?: string): Request {
  return new Request('http://localhost/api/x', {
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

describe('getUserIdFromRequest', () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = SECRET;
  });

  it('returns the user id from a valid Bearer token', () => {
    const token = jwt.sign({ id: 'user-123', email: 'a@b.com' }, SECRET);
    expect(getUserIdFromRequest(makeRequest(`Bearer ${token}`))).toEqual({ userId: 'user-123' });
  });

  it('returns an error when no header is present', () => {
    expect(getUserIdFromRequest(makeRequest())).toEqual({ error: 'Not authenticated', status: 401 });
  });

  it('returns an error when the token is malformed', () => {
    expect(getUserIdFromRequest(makeRequest('Bearer not-a-real-token'))).toEqual({
      error: 'Invalid or expired token',
      status: 401,
    });
  });

  it('returns an error when the header is not Bearer-prefixed', () => {
    const token = jwt.sign({ id: 'user-123', email: 'a@b.com' }, SECRET);
    expect(getUserIdFromRequest(makeRequest(token))).toEqual({ error: 'Not authenticated', status: 401 });
  });

  it('returns an error when the token is signed with a different secret', () => {
    const token = jwt.sign({ id: 'user-123', email: 'a@b.com' }, 'wrong-secret');
    expect(getUserIdFromRequest(makeRequest(`Bearer ${token}`))).toEqual({
      error: 'Invalid or expired token',
      status: 401,
    });
  });
});
