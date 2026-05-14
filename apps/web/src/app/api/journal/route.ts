import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { getUserIdFromRequest } from '@/server/auth/legacy-jwt';
import { journalSchema } from '@/server/lib/validators';

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

export async function GET(request: Request) {
  const auth = getAuthenticatedUserId(request);
  if (auth.response) return auth.response;

  try {
    const journalEntries = await prisma.journalEntry.findMany({
      where: { userId: auth.userId },
      orderBy: { entryDate: 'desc' },
    });
    return NextResponse.json(journalEntries);
  } catch (error) {
    console.error('Error fetching journal entries:', error);
    return NextResponse.json({ error: 'Failed to fetch journal entries' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = getAuthenticatedUserId(request);
  if (auth.response) return auth.response;

  try {
    const result = journalSchema.safeParse(await request.json());
    if (!result.success) {
      return NextResponse.json({ error: 'Invalid input', details: result.error.issues }, { status: 400 });
    }

    const data = result.data;
    const entry = await prisma.journalEntry.upsert({
      where: {
        userId_entryDate: {
          userId: auth.userId,
          entryDate: data.entryDate,
        },
      },
      update: {
        content: data.content,
        mood: data.mood,
        confidenceLevel: data.confidenceLevel,
      },
      create: {
        userId: auth.userId,
        entryDate: data.entryDate,
        content: data.content,
        mood: data.mood,
        confidenceLevel: data.confidenceLevel,
      },
    });

    return NextResponse.json(entry);
  } catch (error) {
    console.error('Error saving journal entry:', error);
    return NextResponse.json({ error: 'Failed to save journal entry' }, { status: 500 });
  }
}
