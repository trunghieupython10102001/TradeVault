'use client';

import { PDFDownloadLink } from '@react-pdf/renderer';
import { FileDown } from 'lucide-react';
import JournalPDFDocument from './JournalPDFDocument';

interface JournalEntry {
  id: string;
  entryDate: string | Date;
  periodType: string;
  content: string;
  mood: 'GREAT' | 'GOOD' | 'NEUTRAL' | 'BAD' | 'TERRIBLE';
  confidenceLevel: number;
  linkedTrades: { id: string; symbol: string; side: string; pnl: string | null; entryDate: string; exitDate?: string | null }[];
}

interface Props {
  entry: JournalEntry;
  fileName: string;
  className?: string;
}

export default function PDFExportButton({ entry, fileName, className }: Props) {
  return (
    <PDFDownloadLink
      document={<JournalPDFDocument entry={entry} />}
      fileName={fileName}
      className={className}
    >
      {({ loading }) => (
        <><FileDown size={13} />{loading ? 'PDF...' : 'Export PDF'}</>
      )}
    </PDFDownloadLink>
  );
}
