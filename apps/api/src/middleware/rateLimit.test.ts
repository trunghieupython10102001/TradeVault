import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { loginEmailLimiter, loginIpLimiter, registerLimiter } from './rateLimit';

function makeApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.post('/login', loginIpLimiter, loginEmailLimiter, (_req, res) => res.json({ ok: true }));
  app.post('/register', registerLimiter, (_req, res) => res.json({ ok: true }));
  return app;
}

describe('rate limiters', () => {
  beforeEach(() => {
    loginIpLimiter.resetKey('1.2.3.4');
    loginEmailLimiter.resetKey('email:victim@example.com');
    registerLimiter.resetKey('7.7.7.7');
  });

  it('allows 5 login requests then 429s the 6th from the same IP', async () => {
    const app = makeApp();

    for (let i = 0; i < 5; i += 1) {
      const res = await request(app)
        .post('/login')
        .set('X-Forwarded-For', '1.2.3.4')
        .send({ email: `user${i}@example.com`, password: 'x' });
      expect(res.status).toBe(200);
    }

    const res = await request(app)
      .post('/login')
      .set('X-Forwarded-For', '1.2.3.4')
      .send({ email: 'user6@example.com', password: 'x' });
    expect(res.status).toBe(429);
  });

  it('limits login attempts per email regardless of IP', async () => {
    const app = makeApp();

    for (let i = 0; i < 5; i += 1) {
      const res = await request(app)
        .post('/login')
        .set('X-Forwarded-For', `9.9.9.${i + 1}`)
        .send({ email: 'victim@example.com', password: 'guess' });
      expect(res.status).toBe(200);
    }

    const res = await request(app)
      .post('/login')
      .set('X-Forwarded-For', '9.9.9.99')
      .send({ email: 'victim@example.com', password: 'guess' });
    expect(res.status).toBe(429);
  });

  it('allows 5 registrations then 429s the 6th from the same IP', async () => {
    const app = makeApp();

    for (let i = 0; i < 5; i += 1) {
      const res = await request(app)
        .post('/register')
        .set('X-Forwarded-For', '7.7.7.7')
        .send({ email: `n${i}@x.com`, password: 'x', name: 'x' });
      expect(res.status).toBe(200);
    }

    const res = await request(app)
      .post('/register')
      .set('X-Forwarded-For', '7.7.7.7')
      .send({ email: 'n6@x.com', password: 'x', name: 'x' });
    expect(res.status).toBe(429);
  });
});
