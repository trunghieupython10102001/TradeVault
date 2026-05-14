import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { prisma } from '@repo/database';
import { z } from 'zod';
import { signLegacyToken } from '@/server/auth/legacy-jwt';
import { checkRateLimit, emailLimitKey, ipLimitKey } from '@/server/auth/rate-limit';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export async function POST(request: Request) {
  if (checkRateLimit(ipLimitKey(request, 'login-ip'))) {
    return NextResponse.json({ error: 'Too many login attempts from this IP. Try again in 15 minutes.' }, { status: 429 });
  }

  try {
    const body = await request.json();
    if (typeof body?.email === 'string' && checkRateLimit(emailLimitKey(body.email))) {
      return NextResponse.json({ error: 'Too many login attempts for this email. Try again in 15 minutes.' }, { status: 429 });
    }

    const result = loginSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Invalid input', details: result.error.issues }, { status: 400 });
    }

    const { email, password } = result.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const valid = await compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email },
      token: signLegacyToken({ id: user.id, email: user.email }),
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
