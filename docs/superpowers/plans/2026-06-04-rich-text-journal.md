# Rich Text Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the journal page from a plain textarea to a Tiptap rich text editor with S3 image uploads, day/week/month period scoping, trade linking, and PDF export.

**Architecture:** Tiptap JSON is stored in the existing `content TEXT` column. `JournalEntry` gains a `periodType` column and a new `JournalTrade` join table links entries to trades. The uploads route is replaced with S3 presigned PUT URLs. PDF export is rendered client-side via `@react-pdf/renderer`.

**Tech Stack:** Tiptap v2 (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-link`), `@react-pdf/renderer` v3, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, Prisma, Next.js 16, React 19, vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-rich-text-journal-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `packages/database/prisma/schema.prisma` | Add `periodType`, `JournalTrade`, update relations |
| Create | `apps/web/src/lib/journalPeriod.ts` | Pure period calculation utilities |
| Create | `apps/web/src/lib/journalPeriod.test.ts` | Unit tests for period utilities |
| Modify | `apps/api/src/lib/validators.ts` | Update `journalSchema` |
| Modify | `apps/api/src/routes/journal.ts` | Update GET/POST, add `GET /:id/trades` |
| Modify | `apps/api/src/routes/uploads.ts` | Replace multer/disk with S3 presigned URL |
| Create | `apps/web/src/components/journal/RichTextEditor.tsx` | Tiptap editor + toolbar + image upload |
| Create | `apps/web/src/components/journal/RichTextEditor.module.css` | Editor and toolbar styles |
| Create | `apps/web/src/components/journal/TradePicker.tsx` | Trade linking panel |
| Create | `apps/web/src/components/journal/TradePicker.module.css` | Picker styles |
| Create | `apps/web/src/components/journal/JournalPDFDocument.tsx` | @react-pdf/renderer document |
| Modify | `apps/web/src/app/dashboard/journal/page.tsx` | Full page refactor |
| Modify | `apps/web/src/app/dashboard/journal/page.module.css` | New styles for period nav, editor, etc. |

---

## Task 1: Period Utilities (TDD)

**Files:**
- Create: `apps/web/src/lib/journalPeriod.ts`
- Create: `apps/web/src/lib/journalPeriod.test.ts`

- [ ] **Step 1.1: Write the failing tests**

Create `apps/web/src/lib/journalPeriod.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  periodStart,
  periodEnd,
  periodLabel,
  navigatePeriod,
  toISODate,
} from './journalPeriod';

describe('periodStart', () => {
  it('DAY returns the same date at midnight', () => {
    const d = new Date('2025-01-15T14:30:00');
    expect(toISODate(periodStart(d, 'DAY'))).toBe('2025-01-15');
  });

  it('WEEK returns the Monday of the week', () => {
    // 2025-01-15 is a Wednesday
    const d = new Date('2025-01-15');
    expect(toISODate(periodStart(d, 'WEEK'))).toBe('2025-01-13');
  });

  it('WEEK returns Monday when input is Sunday', () => {
    // 2025-01-19 is a Sunday
    const d = new Date('2025-01-19');
    expect(toISODate(periodStart(d, 'WEEK'))).toBe('2025-01-13');
  });

  it('WEEK returns itself when input is Monday', () => {
    // 2025-01-13 is a Monday
    const d = new Date('2025-01-13');
    expect(toISODate(periodStart(d, 'WEEK'))).toBe('2025-01-13');
  });

  it('MONTH returns the 1st of the month', () => {
    const d = new Date('2025-01-15');
    expect(toISODate(periodStart(d, 'MONTH'))).toBe('2025-01-01');
  });
});

describe('periodEnd', () => {
  it('DAY end equals start', () => {
    const start = new Date('2025-01-15');
    expect(toISODate(periodEnd(start, 'DAY'))).toBe('2025-01-15');
  });

  it('WEEK end is 6 days after start', () => {
    const start = new Date('2025-01-13'); // Monday
    expect(toISODate(periodEnd(start, 'WEEK'))).toBe('2025-01-19');
  });

  it('MONTH end is the last day of the month', () => {
    const start = new Date('2025-02-01');
    expect(toISODate(periodEnd(start, 'MONTH'))).toBe('2025-02-28');
  });

  it('MONTH end handles leap year', () => {
    const start = new Date('2024-02-01');
    expect(toISODate(periodEnd(start, 'MONTH'))).toBe('2024-02-29');
  });
});

describe('navigatePeriod', () => {
  it('DAY advances by one day', () => {
    const start = new Date('2025-01-15');
    expect(toISODate(navigatePeriod(start, 'DAY', 1))).toBe('2025-01-16');
    expect(toISODate(navigatePeriod(start, 'DAY', -1))).toBe('2025-01-14');
  });

  it('WEEK advances by one week', () => {
    const start = new Date('2025-01-13'); // Monday
    expect(toISODate(navigatePeriod(start, 'WEEK', 1))).toBe('2025-01-20');
    expect(toISODate(navigatePeriod(start, 'WEEK', -1))).toBe('2025-01-06');
  });

  it('MONTH advances by one month', () => {
    const start = new Date('2025-01-01');
    expect(toISODate(navigatePeriod(start, 'MONTH', 1))).toBe('2025-02-01');
    expect(toISODate(navigatePeriod(start, 'MONTH', -1))).toBe('2024-12-01');
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
cd apps/web && npx vitest run src/lib/journalPeriod.test.ts
```

Expected: `FAIL` — module not found.

- [ ] **Step 1.3: Implement the utility**

Create `apps/web/src/lib/journalPeriod.ts`:

```typescript
export type PeriodType = 'DAY' | 'WEEK' | 'MONTH';

export function periodStart(date: Date, type: PeriodType): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  if (type === 'DAY') return d;
  if (type === 'WEEK') {
    const day = d.getDay(); // 0=Sun ... 6=Sat
    const diff = day === 0 ? -6 : 1 - day; // shift to Monday
    d.setDate(d.getDate() + diff);
    return d;
  }
  // MONTH
  d.setDate(1);
  return d;
}

export function periodEnd(start: Date, type: PeriodType): Date {
  const d = new Date(start);
  if (type === 'DAY') return d;
  if (type === 'WEEK') { d.setDate(d.getDate() + 6); return d; }
  // MONTH: last day = day 0 of next month
  d.setMonth(d.getMonth() + 1, 0);
  return d;
}

export function periodLabel(start: Date, type: PeriodType): string {
  if (type === 'DAY') {
    return start.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });
  }
  if (type === 'WEEK') {
    const end = periodEnd(start, 'WEEK');
    const s = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const e = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `Week of ${s} – ${e}`;
  }
  return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function navigatePeriod(start: Date, type: PeriodType, direction: -1 | 1): Date {
  const d = new Date(start);
  if (type === 'DAY') d.setDate(d.getDate() + direction);
  else if (type === 'WEEK') d.setDate(d.getDate() + direction * 7);
  else d.setMonth(d.getMonth() + direction);
  return periodStart(d, type);
}

export function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function parseContent(raw: string): object {
  try { return JSON.parse(raw); }
  catch {
    return {
      type: 'doc',
      content: raw ? [{ type: 'paragraph', content: [{ type: 'text', text: raw }] }] : [],
    };
  }
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
cd apps/web && npx vitest run src/lib/journalPeriod.test.ts
```

Expected: all tests `PASS`.

- [ ] **Step 1.5: Commit**

```bash
git add apps/web/src/lib/journalPeriod.ts apps/web/src/lib/journalPeriod.test.ts
git commit -m "feat: add period utilities for journal (TDD)"
```

---

## Task 2: Prisma Schema + Migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

- [ ] **Step 2.1: Update the schema**

In `packages/database/prisma/schema.prisma`, replace the `JournalEntry` model and add the `JournalTrade` model. Also add the `journalTrades` relation to the `Trade` model.

Replace the `JournalEntry` model:

```prisma
model JournalEntry {
  id              String         @id @default(uuid())
  userId          String         @map("user_id")
  entryDate       DateTime       @map("entry_date") @db.Date
  periodType      String         @default("DAY") @map("period_type")
  content         String         @db.Text
  mood            String?
  confidenceLevel Int?           @map("confidence_level")
  createdAt       DateTime       @default(now()) @map("created_at")
  updatedAt       DateTime       @updatedAt @map("updated_at")
  user            User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  trades          JournalTrade[]

  @@unique([userId, periodType, entryDate])
  @@map("journal_entries")
}

model JournalTrade {
  journalId String       @map("journal_id")
  tradeId   String       @map("trade_id")
  journal   JournalEntry @relation(fields: [journalId], references: [id], onDelete: Cascade)
  trade     Trade        @relation(fields: [tradeId], references: [id], onDelete: Cascade)

  @@id([journalId, tradeId])
  @@map("journal_trades")
}
```

Add `journalTrades JournalTrade[]` to the `Trade` model (after the `images TradeImage[]` line):

```prisma
  journalTrades   JournalTrade[]
```

- [ ] **Step 2.2: Generate and apply the migration**

```bash
cd packages/database && npx prisma migrate dev --name journal_rich_text
```

Expected output ends with:
```
✔ Generated Prisma Client
```

- [ ] **Step 2.3: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat: add periodType and JournalTrade to schema"
```

---

## Task 3: API Validators

**Files:**
- Modify: `apps/api/src/lib/validators.ts`

- [ ] **Step 3.1: Update `journalSchema`**

Replace the `journalSchema` in `apps/api/src/lib/validators.ts`:

```typescript
export const journalSchema = z.object({
  entryDate: z.coerce.date(),
  periodType: z.enum(['DAY', 'WEEK', 'MONTH']).default('DAY'),
  content: z.string().min(1, 'Content is required'),
  mood: z.enum(['GREAT', 'GOOD', 'NEUTRAL', 'BAD', 'TERRIBLE']).optional().nullable(),
  confidenceLevel: z.coerce.number().int().min(1).max(10).optional().nullable(),
  tradeIds: z.array(z.string().uuid()).optional().default([]),
});

export type JournalInput = z.infer<typeof journalSchema>;
```

- [ ] **Step 3.2: Commit**

```bash
git add apps/api/src/lib/validators.ts
git commit -m "feat: update journalSchema with periodType and tradeIds"
```

---

## Task 4: API Journal Routes

**Files:**
- Modify: `apps/api/src/routes/journal.ts`

- [ ] **Step 4.1: Rewrite the journal routes**

Replace the entire contents of `apps/api/src/routes/journal.ts`:

```typescript
import { Router, Request, Response } from 'express';
import { prisma } from '@repo/database';
import { requireAuth } from '../middleware/auth';
import { journalSchema } from '../lib/validators';

const router = Router();
router.use(requireAuth);

// GET /api/journal
router.get('/', async (req: Request, res: Response) => {
  try {
    const entries = await prisma.journalEntry.findMany({
      where: { userId: req.userId },
      orderBy: { entryDate: 'desc' },
      include: {
        trades: {
          include: {
            trade: {
              select: { id: true, symbol: true, side: true, pnl: true, entryDate: true, exitDate: true },
            },
          },
        },
      },
    });
    const result = entries.map((e) => ({
      ...e,
      linkedTrades: e.trades.map((t) => t.trade),
      trades: undefined,
    }));
    res.json(result);
  } catch (error) {
    console.error('Error fetching journal entries:', error);
    res.status(500).json({ error: 'Failed to fetch journal entries' });
  }
});

// POST /api/journal
router.post('/', async (req: Request, res: Response) => {
  try {
    const result = journalSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Invalid input', details: result.error.issues });
      return;
    }
    const { entryDate, periodType, content, mood, confidenceLevel, tradeIds } = result.data;

    const entry = await prisma.journalEntry.upsert({
      where: { userId_periodType_entryDate: { userId: req.userId!, periodType, entryDate } },
      update: { content, mood, confidenceLevel },
      create: { userId: req.userId!, entryDate, periodType, content, mood, confidenceLevel },
    });

    await prisma.journalTrade.deleteMany({ where: { journalId: entry.id } });
    if (tradeIds.length > 0) {
      await prisma.journalTrade.createMany({
        data: tradeIds.map((tradeId) => ({ journalId: entry.id, tradeId })),
      });
    }

    const updated = await prisma.journalEntry.findUnique({
      where: { id: entry.id },
      include: {
        trades: {
          include: {
            trade: {
              select: { id: true, symbol: true, side: true, pnl: true, entryDate: true, exitDate: true },
            },
          },
        },
      },
    });
    res.json({ ...updated, linkedTrades: updated!.trades.map((t) => t.trade), trades: undefined });
  } catch (error) {
    console.error('Error saving journal entry:', error);
    res.status(500).json({ error: 'Failed to save journal entry' });
  }
});

// GET /api/journal/:id/trades
router.get('/:id/trades', async (req: Request, res: Response) => {
  try {
    const entry = await prisma.journalEntry.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!entry) { res.status(404).json({ error: 'Not found' }); return; }

    const start = new Date(entry.entryDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);

    if (entry.periodType === 'WEEK') {
      end.setDate(end.getDate() + 6);
    } else if (entry.periodType === 'MONTH') {
      end.setMonth(end.getMonth() + 1, 0);
    }
    end.setHours(23, 59, 59, 999);

    const trades = await prisma.trade.findMany({
      where: { userId: req.userId, entryDate: { gte: start, lte: end } },
      select: { id: true, symbol: true, side: true, pnl: true, entryDate: true, exitDate: true },
      orderBy: { entryDate: 'asc' },
    });
    res.json(trades);
  } catch (error) {
    console.error('Error fetching trades for journal:', error);
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
});

export default router;
```

- [ ] **Step 4.2: Commit**

```bash
git add apps/api/src/routes/journal.ts
git commit -m "feat: update journal routes — periodType, trade linking, GET /:id/trades"
```

---

## Task 5: API Uploads → S3 Presigned URL

**Files:**
- Modify: `apps/api/src/routes/uploads.ts`

- [ ] **Step 5.1: Install AWS SDK packages**

```bash
cd apps/api && npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

Expected: packages added to `apps/api/package.json`.

- [ ] **Step 5.2: Add env vars**

Add these lines to your API `.env` file (values from AWS console):

```
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name
```

The S3 bucket needs a CORS policy allowing PUT from your web domain:
```json
[{
  "AllowedHeaders": ["*"],
  "AllowedMethods": ["PUT"],
  "AllowedOrigins": ["http://localhost:3000", "https://your-production-domain.com"],
  "MaxAgeSeconds": 300
}]
```

- [ ] **Step 5.3: Replace the uploads route**

Replace the entire contents of `apps/api/src/routes/uploads.ts`:

```typescript
import { Router, Request, Response } from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// GET /api/uploads/presigned?filename=photo.jpg&contentType=image/jpeg
router.get('/presigned', async (req: Request, res: Response) => {
  const { filename, contentType } = req.query as { filename: string; contentType: string };
  if (!filename || !contentType) {
    res.status(400).json({ error: 'filename and contentType are required' });
    return;
  }
  if (!contentType.startsWith('image/')) {
    res.status(400).json({ error: 'Only image files are allowed' });
    return;
  }

  const ext = filename.split('.').pop() ?? 'png';
  const key = `journal-images/${req.userId}/${randomUUID()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
  const publicUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

  res.json({ uploadUrl, publicUrl });
});

export default router;
```

- [ ] **Step 5.4: Remove unused multer dependency**

```bash
cd apps/api && npm uninstall multer @types/multer
```

- [ ] **Step 5.5: Commit**

```bash
git add apps/api/src/routes/uploads.ts apps/api/package.json apps/api/package-lock.json
git commit -m "feat: replace multer/disk uploads with S3 presigned URLs"
```

---

## Task 6: RichTextEditor Component

**Files:**
- Create: `apps/web/src/components/journal/RichTextEditor.tsx`
- Create: `apps/web/src/components/journal/RichTextEditor.module.css`

- [ ] **Step 6.1: Install Tiptap packages**

```bash
cd apps/web && npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-image @tiptap/extension-link
```

- [ ] **Step 6.2: Create `RichTextEditor.tsx`**

Create `apps/web/src/components/journal/RichTextEditor.tsx`:

```tsx
'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Image as TiptapImage } from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { useRef } from 'react';
import { apiFetch } from '@/lib/api';
import styles from './RichTextEditor.module.css';

interface Props {
  content: object;
  onChange: (json: object) => void;
}

export default function RichTextEditor({ content, onChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadImage = async (file: File) => {
    const res = await apiFetch(
      `/api/uploads/presigned?filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}`
    );
    const { uploadUrl, publicUrl } = await res.json();
    await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
    editor?.chain().focus().setImage({ src: publicUrl }).run();
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      TiptapImage.configure({ inline: false }),
      Link.configure({ openOnClick: false }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
    editorProps: {
      handlePaste: (_view, event) => {
        const items = Array.from(event.clipboardData?.items ?? []);
        const imageItem = items.find((item) => item.type.startsWith('image/'));
        if (imageItem) {
          const file = imageItem.getAsFile();
          if (file) { uploadImage(file); return true; }
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []);
        const imageFile = files.find((f) => f.type.startsWith('image/'));
        if (imageFile) { uploadImage(imageFile); return true; }
        return false;
      },
    },
  });

  if (!editor) return null;

  const btn = (label: string, action: () => void, active: boolean) => (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); action(); }}
      className={`${styles.toolbarBtn} ${active ? styles.active : ''}`}
    >
      {label}
    </button>
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        {btn('B', () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'))}
        {btn('I', () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'))}
        <div className={styles.divider} />
        {btn('H1', () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }))}
        {btn('H2', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }))}
        {btn('H3', () => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive('heading', { level: 3 }))}
        <div className={styles.divider} />
        {btn('• —', () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'))}
        {btn('1.', () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'))}
        <div className={styles.divider} />
        {btn('" "', () => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote'))}
        {btn('{ }', () => editor.chain().focus().toggleCodeBlock().run(), editor.isActive('codeBlock'))}
        <div className={styles.divider} />
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); fileInputRef.current?.click(); }}
          className={styles.toolbarBtn}
        >
          IMG
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadImage(file);
            e.target.value = '';
          }}
        />
      </div>
      <EditorContent editor={editor} className={styles.editor} />
    </div>
  );
}
```

- [ ] **Step 6.3: Create `RichTextEditor.module.css`**

Create `apps/web/src/components/journal/RichTextEditor.module.css`:

```css
.wrapper {
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  overflow: hidden;
  transition: border-color var(--transition-fast);
}

.wrapper:focus-within {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px var(--accent-muted);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-tertiary);
  flex-wrap: wrap;
}

.toolbarBtn {
  padding: 2px 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  line-height: 1.6;
}

.toolbarBtn:hover {
  background: var(--bg-card);
  border-color: var(--border-primary);
  color: var(--text-primary);
}

.active {
  background: var(--accent-muted);
  border-color: var(--accent);
  color: var(--accent);
}

.divider {
  width: 1px;
  height: 18px;
  background: var(--border-primary);
  margin: 0 var(--space-1);
}

.editor {
  padding: var(--space-4);
  min-height: 180px;
  color: var(--text-primary);
  font-size: var(--text-sm);
  line-height: var(--leading-relaxed);
}

.editor :global(.ProseMirror) {
  outline: none;
  min-height: 180px;
}

.editor :global(h1) { font-size: var(--text-2xl); font-weight: 700; margin: var(--space-4) 0 var(--space-2); }
.editor :global(h2) { font-size: var(--text-xl); font-weight: 600; margin: var(--space-3) 0 var(--space-2); }
.editor :global(h3) { font-size: var(--text-lg); font-weight: 600; margin: var(--space-2) 0 var(--space-1); }
.editor :global(p) { margin: var(--space-2) 0; }
.editor :global(ul), .editor :global(ol) { padding-left: var(--space-6); margin: var(--space-2) 0; }
.editor :global(li) { margin: var(--space-1) 0; }
.editor :global(blockquote) {
  border-left: 3px solid var(--accent);
  padding-left: var(--space-4);
  margin: var(--space-3) 0;
  color: var(--text-secondary);
  font-style: italic;
}
.editor :global(pre) {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  padding: var(--space-3) var(--space-4);
  margin: var(--space-3) 0;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  overflow-x: auto;
}
.editor :global(code) {
  background: var(--bg-tertiary);
  border-radius: 3px;
  padding: 1px 4px;
  font-family: var(--font-mono);
  font-size: 0.9em;
}
.editor :global(img) {
  max-width: 100%;
  border-radius: var(--radius-md);
  margin: var(--space-2) 0;
}
.editor :global(strong) { font-weight: 700; }
.editor :global(em) { font-style: italic; }
```

- [ ] **Step 6.4: Commit**

```bash
git add apps/web/src/components/journal/ apps/web/package.json apps/web/package-lock.json
git commit -m "feat: add RichTextEditor component with Tiptap"
```

---

## Task 7: TradePicker Component

**Files:**
- Create: `apps/web/src/components/journal/TradePicker.tsx`
- Create: `apps/web/src/components/journal/TradePicker.module.css`

- [ ] **Step 7.1: Create `TradePicker.tsx`**

Create `apps/web/src/components/journal/TradePicker.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import styles from './TradePicker.module.css';

interface LinkedTrade {
  id: string;
  symbol: string;
  side: string;
  pnl: string | null;
  entryDate: string;
}

interface Props {
  journalId: string | null;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function TradePicker({ journalId, selectedIds, onChange }: Props) {
  const [trades, setTrades] = useState<LinkedTrade[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!journalId) return;
    setLoading(true);
    apiFetch(`/api/journal/${journalId}/trades`)
      .then((r) => r.json())
      .then(setTrades)
      .catch(() => setTrades([]))
      .finally(() => setLoading(false));
  }, [journalId]);

  const toggle = (id: string) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>Link Trades</span>
      {!journalId ? (
        <p className={styles.hint}>Save entry first to link trades from this period.</p>
      ) : loading ? (
        <p className={styles.hint}>Loading...</p>
      ) : trades.length === 0 ? (
        <p className={styles.hint}>No trades found in this period.</p>
      ) : (
        <div className={styles.list}>
          {trades.map((t) => {
            const pnl = t.pnl != null ? Number(t.pnl) : null;
            return (
              <label key={t.id} className={styles.row}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(t.id)}
                  onChange={() => toggle(t.id)}
                  className={styles.checkbox}
                />
                <span className={styles.symbol}>{t.symbol}</span>
                <span className={`${styles.side} ${t.side === 'LONG' ? styles.long : styles.short}`}>
                  {t.side}
                </span>
                {pnl != null && (
                  <span
                    className={styles.pnl}
                    style={{ color: pnl >= 0 ? 'var(--green, #22c55e)' : 'var(--red, #ef4444)' }}
                  >
                    {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(2)}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7.2: Create `TradePicker.module.css`**

Create `apps/web/src/components/journal/TradePicker.module.css`:

```css
.wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-secondary);
}

.hint {
  font-size: var(--text-sm);
  color: var(--text-muted);
  padding: var(--space-3) 0;
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-height: 240px;
  overflow-y: auto;
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color var(--transition-fast);
}

.row:hover { border-color: var(--border-secondary); }

.checkbox {
  accent-color: var(--accent);
  width: 14px;
  height: 14px;
  cursor: pointer;
}

.symbol {
  font-weight: 600;
  font-size: var(--text-sm);
  color: var(--text-primary);
  min-width: 60px;
}

.side {
  font-size: var(--text-xs);
  font-weight: 500;
  padding: 1px 6px;
  border-radius: var(--radius-full);
}

.long  { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
.short { background: rgba(239, 68, 68, 0.15);  color: #ef4444; }

.pnl {
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  font-weight: 600;
  margin-left: auto;
}
```

- [ ] **Step 7.3: Commit**

```bash
git add apps/web/src/components/journal/TradePicker.tsx apps/web/src/components/journal/TradePicker.module.css
git commit -m "feat: add TradePicker component for linking trades to journal entries"
```

---

## Task 8: JournalPDFDocument Component

**Files:**
- Create: `apps/web/src/components/journal/JournalPDFDocument.tsx`

- [ ] **Step 8.1: Install `@react-pdf/renderer`**

```bash
cd apps/web && npm install @react-pdf/renderer
```

- [ ] **Step 8.2: Create `JournalPDFDocument.tsx`**

Create `apps/web/src/components/journal/JournalPDFDocument.tsx`:

```tsx
import {
  Document,
  Page,
  Text,
  View,
  Image as PDFImage,
  StyleSheet,
} from '@react-pdf/renderer';

interface LinkedTrade {
  id: string;
  symbol: string;
  side: string;
  pnl: string | null;
  entryDate: string;
  exitDate?: string | null;
}

interface JournalEntry {
  periodType: string;
  entryDate: string | Date;
  mood: string | null;
  confidenceLevel: number | null;
  content: string;
  linkedTrades: LinkedTrade[];
}

interface TiptapNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: { type: string }[];
}

const s = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#1e293b' },
  header: { marginBottom: 16 },
  period: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  meta: { flexDirection: 'row', gap: 16, fontSize: 10, color: '#64748b' },
  divider: { borderBottomWidth: 1, borderBottomColor: '#e2e8f0', marginVertical: 12 },
  body: { marginBottom: 16 },
  p: { marginBottom: 6, lineHeight: 1.5 },
  h1: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 8, marginTop: 10 },
  h2: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 6, marginTop: 8 },
  h3: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 4, marginTop: 6 },
  bold: { fontFamily: 'Helvetica-Bold' },
  italic: { fontFamily: 'Helvetica-Oblique' },
  listItem: { flexDirection: 'row', marginBottom: 3 },
  bullet: { width: 16, color: '#64748b' },
  listContent: { flex: 1 },
  blockquote: { borderLeftWidth: 3, borderLeftColor: '#6366f1', paddingLeft: 10, marginVertical: 6, color: '#64748b' },
  codeBlock: { fontFamily: 'Courier', fontSize: 9, backgroundColor: '#f1f5f9', padding: 8, marginVertical: 4 },
  img: { maxWidth: '100%', marginVertical: 8 },
  tradesTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 8 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f1f5f9', padding: '6 8', borderRadius: 3 },
  tableRow: { flexDirection: 'row', padding: '5 8', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  col1: { width: '22%' },
  col2: { width: '16%' },
  col3: { width: '20%' },
  col4: { width: '20%' },
  col5: { width: '22%', textAlign: 'right' },
  headerText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#64748b' },
});

const moodLabels: Record<string, string> = {
  GREAT: '🚀 Great', GOOD: '😊 Good', NEUTRAL: '😐 Neutral', BAD: '😞 Bad', TERRIBLE: '💀 Terrible',
};

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderTextNode(node: TiptapNode, key: number) {
  const isBold = node.marks?.some((m) => m.type === 'bold');
  const isItalic = node.marks?.some((m) => m.type === 'italic');
  const style = [isBold && s.bold, isItalic && s.italic].filter(Boolean) as object[];
  return <Text key={key} style={style}>{node.text ?? ''}</Text>;
}

function renderNode(node: TiptapNode, key: number): React.ReactElement | null {
  const headingStyles = [s.h1, s.h2, s.h3];
  switch (node.type) {
    case 'paragraph':
      return <Text key={key} style={s.p}>{(node.content ?? []).map((n, i) => renderTextNode(n, i))}</Text>;
    case 'heading':
      return (
        <Text key={key} style={headingStyles[(node.attrs?.level as number ?? 1) - 1]}>
          {(node.content ?? []).map((n, i) => renderTextNode(n, i))}
        </Text>
      );
    case 'bulletList':
      return (
        <View key={key}>
          {(node.content ?? []).map((item, i) => (
            <View key={i} style={s.listItem}>
              <Text style={s.bullet}>• </Text>
              <View style={s.listContent}>{(item.content ?? []).map((n, j) => renderNode(n, j))}</View>
            </View>
          ))}
        </View>
      );
    case 'orderedList':
      return (
        <View key={key}>
          {(node.content ?? []).map((item, i) => (
            <View key={i} style={s.listItem}>
              <Text style={s.bullet}>{i + 1}. </Text>
              <View style={s.listContent}>{(item.content ?? []).map((n, j) => renderNode(n, j))}</View>
            </View>
          ))}
        </View>
      );
    case 'blockquote':
      return (
        <View key={key} style={s.blockquote}>
          {(node.content ?? []).map((n, i) => renderNode(n, i))}
        </View>
      );
    case 'codeBlock':
      return <Text key={key} style={s.codeBlock}>{(node.content ?? []).map((n) => n.text ?? '').join('')}</Text>;
    case 'image':
      return <PDFImage key={key} src={node.attrs?.src as string} style={s.img} />;
    default:
      return null;
  }
}

function renderContent(contentStr: string) {
  let doc: { type: string; content?: TiptapNode[] };
  try { doc = JSON.parse(contentStr); }
  catch { return <Text style={s.p}>{contentStr}</Text>; }
  return (doc.content ?? []).map((node, i) => renderNode(node, i));
}

export default function JournalPDFDocument({ entry }: { entry: JournalEntry }) {
  const periodStr =
    entry.periodType === 'DAY'
      ? fmtDate(entry.entryDate)
      : entry.periodType === 'WEEK'
      ? `Week of ${fmtDate(entry.entryDate)}`
      : new Date(entry.entryDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.period}>{periodStr}</Text>
          <View style={s.meta}>
            {entry.mood && <Text>{moodLabels[entry.mood] ?? entry.mood}</Text>}
            {entry.confidenceLevel != null && <Text>Confidence: {entry.confidenceLevel}/10</Text>}
          </View>
        </View>

        <View style={s.divider} />
        <View style={s.body}>{renderContent(entry.content)}</View>

        {entry.linkedTrades.length > 0 && (
          <>
            <View style={s.divider} />
            <Text style={s.tradesTitle}>Linked Trades</Text>
            <View style={s.tableHeader}>
              <Text style={[s.col1, s.headerText]}>SYMBOL</Text>
              <Text style={[s.col2, s.headerText]}>SIDE</Text>
              <Text style={[s.col3, s.headerText]}>ENTRY DATE</Text>
              <Text style={[s.col4, s.headerText]}>EXIT DATE</Text>
              <Text style={[s.col5, s.headerText]}>P&L</Text>
            </View>
            {entry.linkedTrades.map((t) => {
              const pnl = t.pnl != null ? Number(t.pnl) : null;
              return (
                <View key={t.id} style={s.tableRow}>
                  <Text style={s.col1}>{t.symbol}</Text>
                  <Text style={s.col2}>{t.side}</Text>
                  <Text style={s.col3}>{fmtDate(t.entryDate)}</Text>
                  <Text style={s.col4}>{t.exitDate ? fmtDate(t.exitDate) : '—'}</Text>
                  <Text style={[s.col5, { color: pnl == null ? '#64748b' : pnl >= 0 ? '#16a34a' : '#dc2626' }]}>
                    {pnl != null ? `${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(2)}` : '—'}
                  </Text>
                </View>
              );
            })}
          </>
        )}
      </Page>
    </Document>
  );
}
```

- [ ] **Step 8.3: Commit**

```bash
git add apps/web/src/components/journal/JournalPDFDocument.tsx apps/web/package.json apps/web/package-lock.json
git commit -m "feat: add JournalPDFDocument component with @react-pdf/renderer"
```

---

## Task 9: JournalPage Full Refactor

**Files:**
- Modify: `apps/web/src/app/dashboard/journal/page.tsx`
- Modify: `apps/web/src/app/dashboard/journal/page.module.css`

- [ ] **Step 9.1: Replace `page.tsx`**

Replace the entire contents of `apps/web/src/app/dashboard/journal/page.tsx`:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Clock, Edit3, ChevronLeft, ChevronRight, FileDown } from 'lucide-react';
import Topbar from '@/components/layout/Topbar';
import RichTextEditor from '@/components/journal/RichTextEditor';
import TradePicker from '@/components/journal/TradePicker';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import {
  PeriodType,
  periodStart,
  periodLabel,
  navigatePeriod,
  toISODate,
  parseContent,
} from '@/lib/journalPeriod';
import { generateHTML } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Image as TiptapImage } from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import styles from './page.module.css';

// @react-pdf/renderer must be client-only
const PDFDownloadLink = dynamic(
  () => import('@react-pdf/renderer').then((m) => m.PDFDownloadLink),
  { ssr: false }
);
const JournalPDFDocument = dynamic(
  () => import('@/components/journal/JournalPDFDocument'),
  { ssr: false }
);

const moodIcons: Record<string, { icon: string; label: string; color: string }> = {
  GREAT:    { icon: '🚀', label: 'Great',    color: '#22c55e' },
  GOOD:     { icon: '😊', label: 'Good',     color: '#86efac' },
  NEUTRAL:  { icon: '😐', label: 'Neutral',  color: '#94a3b8' },
  BAD:      { icon: '😞', label: 'Bad',      color: '#fca5a5' },
  TERRIBLE: { icon: '💀', label: 'Terrible', color: '#ef4444' },
};

interface LinkedTrade {
  id: string;
  symbol: string;
  side: string;
  pnl: string | null;
  entryDate: string;
  exitDate?: string | null;
}

interface JournalEntry {
  id: string;
  entryDate: string | Date;
  periodType: string;
  content: string;
  mood: 'GREAT' | 'GOOD' | 'NEUTRAL' | 'BAD' | 'TERRIBLE';
  confidenceLevel: number;
  linkedTrades: LinkedTrade[];
}

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };
const htmlExtensions = [StarterKit, TiptapImage, Link];

export default function JournalPage() {
  const toast = useToast();
  const [activePeriodType, setActivePeriodType] = useState<PeriodType>('DAY');
  const [currentPeriodStart, setCurrentPeriodStart] = useState<Date>(() =>
    periodStart(new Date(), 'DAY')
  );
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [savedEntryId, setSavedEntryId] = useState<string | null>(null);
  const [mood, setMood] = useState<JournalEntry['mood']>('NEUTRAL');
  const [confidence, setConfidence] = useState(5);
  const [contentJSON, setContentJSON] = useState<object>(EMPTY_DOC);
  const [tradeIds, setTradeIds] = useState<string[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch('/api/journal')
      .then((r) => r.json())
      .then(setEntries)
      .catch(() => toast.error('Failed to load journal entries'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const date = params.get('date');
    if (!date) return;
    const parsed = new Date(`${date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return;
    setCurrentPeriodStart(periodStart(parsed, 'DAY'));
    openNew();
  }, []);

  const switchPeriodType = (type: PeriodType) => {
    setActivePeriodType(type);
    setCurrentPeriodStart(periodStart(new Date(), type));
  };

  const navigate = (direction: -1 | 1) => {
    setCurrentPeriodStart((prev) => navigatePeriod(prev, activePeriodType, direction));
  };

  const openNew = useCallback(() => {
    setEditingEntry(null);
    setSavedEntryId(null);
    setMood('NEUTRAL');
    setConfidence(5);
    setContentJSON(EMPTY_DOC);
    setTradeIds([]);
    setShowForm(true);
  }, []);

  const openEdit = (entry: JournalEntry) => {
    setEditingEntry(entry);
    setSavedEntryId(entry.id);
    setCurrentPeriodStart(periodStart(new Date(entry.entryDate), entry.periodType as PeriodType));
    setActivePeriodType(entry.periodType as PeriodType);
    setMood(entry.mood);
    setConfidence(entry.confidenceLevel ?? 5);
    setContentJSON(parseContent(entry.content));
    setTradeIds(entry.linkedTrades.map((t) => t.id));
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingEntry(null);
    setSavedEntryId(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/journal', {
        method: 'POST',
        body: JSON.stringify({
          entryDate: toISODate(currentPeriodStart),
          periodType: activePeriodType,
          content: JSON.stringify(contentJSON),
          mood,
          confidenceLevel: confidence,
          tradeIds,
        }),
      });
      if (res.ok) {
        const saved: JournalEntry = await res.json();
        setSavedEntryId(saved.id);
        setEditingEntry(saved);
        setEntries((prev) => {
          const filtered = prev.filter((e) => e.id !== saved.id);
          return [saved, ...filtered].sort(
            (a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime()
          );
        });
        toast.success(editingEntry ? 'Entry updated' : 'Entry saved');
      } else {
        toast.error('Failed to save entry');
      }
    } catch {
      toast.error('Failed to save entry');
    } finally {
      setSaving(false);
    }
  };

  const filteredEntries = entries.filter((e) => e.periodType === activePeriodType);

  const formTitle = editingEntry
    ? `Editing — ${periodLabel(new Date(editingEntry.entryDate), editingEntry.periodType as PeriodType)}`
    : `New Entry — ${periodLabel(currentPeriodStart, activePeriodType)}`;

  return (
    <>
      <Topbar title="Journal" subtitle="Plan and reflect on your trading" />
      <div className={styles.page}>

        {/* Period selector + navigation */}
        <div className={styles.toolbar}>
          <div className={styles.periodTabs}>
            {(['DAY', 'WEEK', 'MONTH'] as PeriodType[]).map((t) => (
              <button
                key={t}
                className={`${styles.periodTab} ${activePeriodType === t ? styles.periodTabActive : ''}`}
                onClick={() => switchPeriodType(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className={styles.periodNav}>
            <button className={styles.navBtn} onClick={() => navigate(-1)}><ChevronLeft size={16} /></button>
            <span className={styles.periodCurrent}>{periodLabel(currentPeriodStart, activePeriodType)}</span>
            <button className={styles.navBtn} onClick={() => navigate(1)}><ChevronRight size={16} /></button>
          </div>
          <button className={styles.addBtn} onClick={openNew}><Plus size={16} />New Entry</button>
        </div>

        {/* Entry Form */}
        {showForm && (
          <div className={styles.newEntry}>
            <div className={styles.entryHeader}><h3>{formTitle}</h3></div>

            <div className={styles.moodRow}>
              <span className={styles.moodLabel}>How are you feeling?</span>
              <div className={styles.moodOptions}>
                {Object.entries(moodIcons).map(([key, { icon, label, color }]) => (
                  <button
                    key={key}
                    className={`${styles.moodBtn} ${mood === key ? styles.moodActive : ''}`}
                    onClick={() => setMood(key as JournalEntry['mood'])}
                    style={mood === key ? { borderColor: color, background: `${color}15` } : undefined}
                  >
                    <span className={styles.moodEmoji}>{icon}</span>
                    <span className={styles.moodText}>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.confidenceRow}>
              <span className={styles.moodLabel}>Confidence Level</span>
              <div className={styles.confidenceSlider}>
                <input
                  type="range" min="1" max="10" value={confidence}
                  onChange={(e) => setConfidence(parseInt(e.target.value))}
                  className={styles.slider}
                />
                <span className={styles.confidenceValue}>{confidence}/10</span>
              </div>
            </div>

            <RichTextEditor
              key={editingEntry?.id ?? 'new'}
              content={contentJSON}
              onChange={setContentJSON}
            />

            <TradePicker
              journalId={savedEntryId}
              selectedIds={tradeIds}
              onChange={setTradeIds}
            />

            <div className={styles.entryActions}>
              <button className={styles.cancelBtn} onClick={cancelForm}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editingEntry ? 'Update Entry' : 'Save Entry'}
              </button>
            </div>
          </div>
        )}

        {/* Entries List */}
        <div className={styles.entriesList}>
          {loading ? (
            <div className={styles.loading}>Loading...</div>
          ) : filteredEntries.length === 0 ? (
            <div className={styles.empty}>No {activePeriodType.toLowerCase()} entries yet.</div>
          ) : (
            filteredEntries.map((entry) => {
              const html = generateHTML(
                parseContent(entry.content) as Parameters<typeof generateHTML>[0],
                htmlExtensions
              );
              return (
                <div key={entry.id} className={styles.entryCard}>
                  <div className={styles.entryMeta}>
                    <div className={styles.entryDate}>
                      <Clock size={14} />
                      {periodLabel(new Date(entry.entryDate), entry.periodType as PeriodType)}
                    </div>
                    <div className={styles.entryBadges}>
                      <span className={styles.periodBadge}>{entry.periodType}</span>
                      {entry.mood && (
                        <span className={styles.moodBadge} style={{ color: moodIcons[entry.mood]?.color }}>
                          {moodIcons[entry.mood]?.icon} {moodIcons[entry.mood]?.label}
                        </span>
                      )}
                      <span className={styles.confBadge}>Confidence: {entry.confidenceLevel}/10</span>
                      {entry.linkedTrades.length > 0 && (
                        <span className={styles.tradesBadge}>
                          {entry.linkedTrades.length} trade{entry.linkedTrades.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      <button className={styles.editEntryBtn} onClick={() => openEdit(entry)}>
                        <Edit3 size={13} />Edit
                      </button>
                      <PDFDownloadLink
                        document={<JournalPDFDocument entry={entry} />}
                        fileName={`journal-${entry.periodType.toLowerCase()}-${toISODate(new Date(entry.entryDate))}.pdf`}
                        className={styles.editEntryBtn}
                      >
                        {({ loading: pdfLoading }) => (
                          <><FileDown size={13} />{pdfLoading ? 'PDF...' : 'Export PDF'}</>
                        )}
                      </PDFDownloadLink>
                    </div>
                  </div>
                  <div className={styles.entryContent} dangerouslySetInnerHTML={{ __html: html }} />
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 9.2: Update `page.module.css`**

Find and replace the existing `.toolbar` rule:

```css
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-6);
  gap: var(--space-4);
  flex-wrap: wrap;
}
```

Then append these new rules at the end of the file:

```css
/* Period tabs */
.periodTabs {
  display: flex;
  gap: var(--space-1);
  background: var(--bg-tertiary);
  padding: 3px;
  border-radius: var(--radius-md);
}

.periodTab {
  padding: var(--space-1) var(--space-3);
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.periodTabActive {
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}

/* Period navigation */
.periodNav {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.navBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.navBtn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.periodCurrent {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  min-width: 200px;
  text-align: center;
}

/* Period badge on entry cards */
.periodBadge {
  font-size: var(--text-xs);
  color: var(--accent);
  padding: 1px 6px;
  background: var(--accent-muted);
  border-radius: var(--radius-full);
  font-weight: 600;
}

/* Rich text content in read-only entry cards */
.entryContent h1 { font-size: var(--text-xl); font-weight: 700; margin: var(--space-3) 0 var(--space-2); color: var(--text-primary); }
.entryContent h2 { font-size: var(--text-lg); font-weight: 600; margin: var(--space-2) 0 var(--space-1); color: var(--text-primary); }
.entryContent h3 { font-size: var(--text-base); font-weight: 600; margin: var(--space-2) 0 var(--space-1); color: var(--text-primary); }
.entryContent p  { margin: var(--space-1) 0; font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-relaxed); }
.entryContent ul, .entryContent ol { padding-left: var(--space-5); margin: var(--space-1) 0; }
.entryContent li { font-size: var(--text-sm); color: var(--text-secondary); margin: 2px 0; }
.entryContent blockquote { border-left: 3px solid var(--accent); padding-left: var(--space-3); color: var(--text-muted); font-style: italic; margin: var(--space-2) 0; }
.entryContent pre { background: var(--bg-tertiary); border-radius: var(--radius-sm); padding: var(--space-2) var(--space-3); font-family: var(--font-mono); font-size: var(--text-xs); overflow-x: auto; }
.entryContent img { max-width: 100%; border-radius: var(--radius-sm); margin: var(--space-2) 0; }
```

- [ ] **Step 9.3: Commit**

```bash
git add apps/web/src/app/dashboard/journal/
git commit -m "feat: refactor journal page — rich text editor, period nav, trade linking, PDF export"
```

---

## Self-Review Checklist

- [x] Period utilities with tests — Task 1
- [x] Schema `periodType` + `JournalTrade` join table — Task 2
- [x] Validator update with `periodType` + `tradeIds` — Task 3
- [x] `GET /api/journal` includes `linkedTrades` array — Task 4
- [x] `POST /api/journal` syncs `JournalTrade` rows — Task 4
- [x] `GET /api/journal/:id/trades` filters by period window — Task 4
- [x] S3 presigned URL endpoint — Task 5
- [x] `multer` removed — Task 5
- [x] Tiptap editor with toolbar (bold/italic/headings/lists/blockquote/code/image) — Task 6
- [x] Image upload via button, paste, and drag-and-drop — Task 6
- [x] TradePicker with checkboxes — Task 7
- [x] PDF with period header, mood, confidence, rich text body, linked trades table — Task 8
- [x] Period tabs + prev/next navigation — Task 9
- [x] `key={editingEntry?.id ?? 'new'}` forces editor remount on entry switch — Task 9
- [x] `PDFDownloadLink` and `JournalPDFDocument` use `next/dynamic` with `ssr: false` — Task 9
- [x] Legacy plain-text content wrapped via `parseContent` — Tasks 1 + 9
- [x] `tradeIds` saved on `handleSave` and re-synced via `PUT` — Task 9
