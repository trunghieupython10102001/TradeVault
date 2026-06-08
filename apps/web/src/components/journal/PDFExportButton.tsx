'use client';

import { Component, type ReactNode } from 'react';
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

class PDFErrorBoundary extends Component<{ children: ReactNode; className?: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) {
      return (
        <span className={this.props.className} style={{ opacity: 0.4, cursor: 'default' }}>
          <FileDown size={13} /> PDF unavailable
        </span>
      );
    }
    return this.props.children;
  }
}

export default function PDFExportButton({ entry, fileName, className }: Props) {
  return (
    <PDFErrorBoundary className={className}>
      <PDFDownloadLink
        document={<JournalPDFDocument entry={entry} />}
        fileName={fileName}
        className={className}
      >
        {({ loading }) => (
          <><FileDown size={13} />{loading ? 'PDF...' : 'Export PDF'}</>
        )}
      </PDFDownloadLink>
    </PDFErrorBoundary>
  );
}
