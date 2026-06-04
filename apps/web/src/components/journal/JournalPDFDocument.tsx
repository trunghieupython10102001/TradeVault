import React from 'react';
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
  GREAT: 'Great', GOOD: 'Good', NEUTRAL: 'Neutral', BAD: 'Bad', TERRIBLE: 'Terrible',
};

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderTextNode(node: TiptapNode, key: number) {
  const isBold = node.marks?.some((m) => m.type === 'bold');
  const isItalic = node.marks?.some((m) => m.type === 'italic');
  let fontFamily = 'Helvetica';
  if (isBold && isItalic) fontFamily = 'Helvetica-BoldOblique';
  else if (isBold) fontFamily = 'Helvetica-Bold';
  else if (isItalic) fontFamily = 'Helvetica-Oblique';
  return <Text key={key} style={{ fontFamily }}>{node.text ?? ''}</Text>;
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
