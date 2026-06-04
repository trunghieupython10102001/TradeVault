# Rich Text Journal with Image Support and PDF Export

**Date:** 2026-06-04
**Status:** Approved

## Overview

Upgrade the journal page from a plain textarea to a full rich text editor (Tiptap) that supports images hosted on S3, planning entries scoped to day/week/month, trade linking, and PDF export via `@react-pdf/renderer`.

---

## 1. Data Model

### `JournalEntry` changes

- Add `periodType String` — values `DAY`, `WEEK`, `MONTH`. Defaults to `DAY` on migration so all existing entries are preserved.
- Change unique constraint from `@@unique([userId, entryDate])` to `@@unique([userId, periodType, entryDate])` — allows a DAY entry and a WEEK entry to coexist on the same start date.
- `entryDate` retains its name but now means **period start date**: the day itself for DAY, Monday for WEEK, the 1st for MONTH.
- `content` stays `String @db.Text` but stores **Tiptap JSON** (serialized via `JSON.stringify(editor.getJSON())`) instead of plain text.

### New `JournalTrade` join table

```prisma
model JournalTrade {
  journalId String @map("journal_id")
  tradeId   String @map("trade_id")

  journal JournalEntry @relation(fields: [journalId], references: [id], onDelete: Cascade)
  trade   Trade        @relation(fields: [tradeId], references: [id], onDelete: Cascade)

  @@id([journalId, tradeId])
  @@map("journal_trades")
}
```

Add the corresponding relation fields to `JournalEntry` and `Trade` models.

---

## 2. API Changes

### `GET /api/journal`
Returns all entries for the authenticated user, ordered by `entryDate` descending. Each entry includes `periodType` and a `tradeIds: string[]` array (IDs of linked trades) for rendering badges in the list.

### `POST /api/journal`
Upserts an entry. After upsert, syncs the `JournalTrade` join table: deletes removed links, inserts new ones.

Request body:
```json
{
  "periodType": "WEEK",
  "entryDate": "2025-01-06",
  "content": "{ ...tiptap json string... }",
  "mood": "GREAT",
  "confidenceLevel": 8,
  "tradeIds": ["uuid-1", "uuid-2"]
}
```

### `GET /api/journal/:id/trades`
Returns trades available to link for a given journal entry. Filters the user's trades where `entryDate` falls within the entry's period window:
- `DAY`: that single day
- `WEEK`: Monday–Sunday of the week
- `MONTH`: first–last day of the month

Response shape per trade: `{ id, symbol, side, pnl, entryDate }`.

### `GET /api/uploads/presigned`
Replaces the existing multer/disk `POST /api/uploads` route entirely. Query params: `filename`, `contentType`. Returns `{ uploadUrl, publicUrl }` where `uploadUrl` is a 5-minute presigned S3 PUT URL and `publicUrl` is the permanent S3 object URL. File bytes never touch the API server.

New dependencies on the API: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.

New env vars required:
```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
AWS_S3_BUCKET
```

---

## 3. Frontend Architecture

### `JournalPage` (refactored)
- Period type toggle at the top: `DAY / WEEK / MONTH` with prev/next navigation arrows.
- Entry list is filtered and displayed per period type.
- "New Entry" pre-fills the editor with the current period's start date.

### `RichTextEditor` (new component)
- Tiptap editor with a toolbar above the content area.
- Toolbar actions: Bold, Italic, H1, H2, H3, Bullet list, Ordered list, Blockquote, Code block, Image upload, Link.
- Tiptap extensions: `StarterKit`, `Image`, `Link`.
- Image upload trigger (button, paste, drag-and-drop):
  1. Call `GET /api/uploads/presigned?filename=...&contentType=...`
  2. PUT file bytes directly to `uploadUrl`
  3. Insert `publicUrl` as Tiptap `Image` node
- Content saved as `JSON.stringify(editor.getJSON())`; loaded back via `editor.commands.setContent(JSON.parse(content))`.

### `TradePicker` (new component)
- Panel rendered below the editor (not a modal — keeps content visible).
- Loads available trades via `GET /api/journal/:id/trades` after first save, or uses a client-side period filter against already-loaded trades before save.
- Checkboxes per trade showing symbol, direction, and P&L.
- Selected trade IDs are included in the `POST /api/journal` payload.

### `JournalEntryCard` (refactored)
- Displays period type badge (`DAY` / `WEEK` / `MONTH`), start date, mood, confidence level.
- Shows linked trade count badge (e.g. "3 trades").
- Renders rich text content read-only using Tiptap's `generateHTML(JSON.parse(content), extensions)` — no editor instance needed.
- "Export PDF" button triggers the PDF download.

### `JournalPDFDocument` (new component)
- Built with `@react-pdf/renderer`.
- Props: `entry` (journal fields) + `trades` (linked trade records).
- Triggered client-side via `PDFDownloadLink` — no server round-trip.

---

## 4. Image Upload Flow

```
User selects/pastes/drops image
  → Frontend: GET /api/uploads/presigned?filename=x.jpg&contentType=image/jpeg
  → API: generates presigned S3 PUT URL (5-min expiry), returns { uploadUrl, publicUrl }
  → Frontend: PUT file bytes directly to S3 uploadUrl
  → Tiptap: inserts publicUrl as Image node into document
```

---

## 5. PDF Export Layout

```
┌─────────────────────────────────────────┐
│  Week of Jan 6 – 12, 2025               │
│  🚀 Great   |   Confidence: 8/10        │
├─────────────────────────────────────────┤
│                                         │
│  [Rich text content]                    │
│                                         │
├─────────────────────────────────────────┤
│  Linked Trades                          │
│  Symbol  Direction  Entry   Exit   P&L  │
│  AAPL    LONG       $150    $155  +$500 │
└─────────────────────────────────────────┘
```

Tiptap JSON nodes are walked and mapped to `@react-pdf/renderer` primitives (`Text`, `View`). Images in the content are included via the `Image` primitive using the S3 public URLs.

---

## 6. New Dependencies

| Package | Location | Purpose |
|---|---|---|
| `@tiptap/react` | web | Editor framework |
| `@tiptap/starter-kit` | web | Core extensions (bold, italic, headings, lists, etc.) |
| `@tiptap/extension-image` | web | Image node |
| `@tiptap/extension-link` | web | Link node |
| `@react-pdf/renderer` | web | Client-side PDF generation |
| `@aws-sdk/client-s3` | api | S3 client |
| `@aws-sdk/s3-request-presigner` | api | Presigned URL generation |

---

## 7. Migration Notes

- Existing `JournalEntry` rows get `periodType = 'DAY'` via a default value — no data loss.
- The unique constraint change requires a Prisma migration that drops the old constraint and adds the new one.
- The existing `POST /api/uploads` (multer + disk) is removed; any callers outside the journal (e.g. trade images) need to be audited and migrated to the presigned URL pattern.
