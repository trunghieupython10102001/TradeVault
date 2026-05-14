import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { z } from 'zod';
import { getUserIdFromRequest } from '@/server/auth/legacy-jwt';

const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
});

function getAuthenticatedUserId(request: Request) {
  const auth = getUserIdFromRequest(request);
  if (auth.error) {
    return { response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  }
  if (!auth.userId) {
    return { response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }
  return { userId: auth.userId };
}

export async function PATCH(request: Request) {
  const auth = getAuthenticatedUserId(request);
  if (auth.response) return auth.response;

  try {
    const result = updateProfileSchema.safeParse(await request.json());
    if (!result.success) {
      return NextResponse.json({ error: 'Invalid input', details: result.error.issues }, { status: 400 });
    }

    if (result.data.email) {
      const existing = await prisma.user.findUnique({ where: { email: result.data.email } });
      if (existing && existing.id !== auth.userId) {
        return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
      }
    }

    const user = await prisma.user.update({
      where: { id: auth.userId },
      data: result.data,
      select: { id: true, name: true, email: true, createdAt: true },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
