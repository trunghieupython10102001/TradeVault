'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload, FileText, CheckCircle, AlertCircle, X } from 'lucide-react';
import Topbar from '@/components/layout/Topbar';
import styles from './page.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface SkippedRow {
  row: number;
  reason: string;
}

interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  skippedDetails: SkippedRow[];
}

export default function ImportTradesPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [csvContent, setCsvContent] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file.');
      return;
    }
    setError('');
    setResult(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      setCsvContent((e.target?.result as string) || '');
    };
    reader.readAsText(file);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    if (!csvContent) return;
    setImporting(true);
    setError('');
    setResult(null);

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(`${API_BASE}/trades/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ csv: csvContent }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Import failed');
        return;
      }

      setResult(data);
    } catch {
      setError('Network error. Make sure the API server is running.');
    } finally {
      setImporting(false);
    }
  };

  const handleClear = () => {
    setFileName('');
    setCsvContent('');
    setResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className={styles.pageWrapper}>
      <Topbar title="Import Trades" />
      <div className={styles.page}>
        <div className={styles.header}>
          <button className={styles.backBtn} onClick={() => router.push('/dashboard/trades')}>
            <ArrowLeft size={16} />
            Back to Trades
          </button>
          <h1 className={styles.title}>Import Trades from CSV</h1>
          <p className={styles.subtitle}>
            Upload a CSV export from your broker. Supported format: MT4/MT5 trade history export.
          </p>
        </div>

        <div className={styles.formatCard}>
          <h3 className={styles.formatTitle}>Expected CSV Format</h3>
          <p className={styles.formatDesc}>
            The CSV must have these columns in order:
          </p>
          <div className={styles.columnList}>
            {[
              'Ticket', 'Open (date)', 'Type (buy/sell)', 'Volume', 'Symbol',
              'Price (entry)', 'SL', 'TP', 'Close (date)', 'Price (exit)',
              'Swap', 'Commissions', 'Profit', 'Pips', 'Duration',
            ].map((col) => (
              <span key={col} className={styles.colBadge}>{col}</span>
            ))}
          </div>
        </div>

        <div className={styles.uploadSection}>
          {!csvContent ? (
            <div
              className={`${styles.dropzone} ${dragging ? styles.dragging : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={40} className={styles.uploadIcon} />
              <p className={styles.dropText}>Drag & drop your CSV file here</p>
              <p className={styles.dropSub}>or click to browse</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className={styles.hiddenInput}
                onChange={onFileChange}
              />
            </div>
          ) : (
            <div className={styles.fileReady}>
              <FileText size={24} className={styles.fileIcon} />
              <div className={styles.fileInfo}>
                <span className={styles.fileName}>{fileName}</span>
                <span className={styles.fileRows}>
                  {csvContent.trim().split('\n').length - 1} rows detected
                </span>
              </div>
              <button className={styles.clearBtn} onClick={handleClear}>
                <X size={16} />
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className={styles.errorBanner}>
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {result && (
          <div className={styles.resultCard}>
            <div className={styles.resultHeader}>
              <CheckCircle size={20} className={styles.successIcon} />
              <span className={styles.resultTitle}>Import Complete</span>
            </div>
            <div className={styles.resultStats}>
              <div className={styles.statItem}>
                <span className={styles.statValue}>{result.imported}</span>
                <span className={styles.statLabel}>Imported</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.statItem}>
                <span className={`${styles.statValue} ${result.skipped > 0 ? styles.statWarn : ''}`}>
                  {result.skipped}
                </span>
                <span className={styles.statLabel}>Skipped</span>
              </div>
            </div>

            {result.skippedDetails.length > 0 && (
              <div className={styles.skippedList}>
                <p className={styles.skippedTitle}>Skipped rows:</p>
                {result.skippedDetails.map((s) => (
                  <div key={s.row} className={styles.skippedRow}>
                    <span className={styles.skippedRowNum}>Row {s.row}</span>
                    <span className={styles.skippedReason}>{s.reason}</span>
                  </div>
                ))}
              </div>
            )}

            <button
              className={styles.viewBtn}
              onClick={() => router.push('/dashboard/trades')}
            >
              View Trades
            </button>
          </div>
        )}

        {csvContent && !result && (
          <div className={styles.actions}>
            <button
              className={styles.importBtn}
              onClick={handleImport}
              disabled={importing}
            >
              {importing ? 'Importing...' : `Import ${csvContent.trim().split('\n').length - 1} Trades`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
