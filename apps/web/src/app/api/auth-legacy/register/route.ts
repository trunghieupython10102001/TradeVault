import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@repo/database';
import { z } from 'zod';
import { signLegacyToken } from '@/server/auth/legacy-jwt';
import { checkRateLimit, ipLimitKey } from '@/server/auth/rate-limit';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function POST(request: Request) {
  if (checkRateLimit(ipLimitKey(request, 'register-ip'))) {
    return NextResponse.json({ error: 'Too many registration attempts from this IP. Try again in 15 minutes.' }, { status: 429 });
  }

  try {
    const result = registerSchema.safeParse(await request.json());
    if (!result.success) {
      return NextResponse.json({ error: 'Invalid input', details: result.error.issues }, { status: 400 });
    }

    const { name, email, password } = result.data;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const passwordHash = await hash(password, 12);
    const user = await prisma.user.create({ data: { name, email, passwordHash } });

    await Promise.all([
      prisma.account.create({ data: { userId: user.id, name: 'Default Account', isDefault: true } }),
      prisma.userSettings.create({ data: { userId: user.id } }),
    ]);

    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email },
      token: signLegacyToken({ id: user.id, email: user.email }),
    }, { status: 201 });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
