'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Edit3,
  Trash2,
  Clock,
  X,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import Topbar from '@/components/layout/Topbar';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/calculations';
import { formatDate } from '@/lib/utils';
import styles from './page.module.css';

export default function TradeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tradeId = params.id as string;

  const [trade, setTrade] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const imageAttachments = trade?.images?.filter(
    (img: Record<string, string>) => img.type !== 'tradingview'
  ) ?? [];

  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIndex(null);
      if (e.key === 'ArrowRight') setLightboxIndex((i) => (i !== null && i < imageAttachments.length - 1 ? i + 1 : i));
      if (e.key === 'ArrowLeft') setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxIndex, imageAttachments.length]);

  useEffect(() => {
    async function fetchTrade() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(`/api/trades/${tradeId}`);
        if (res.ok) {
          const data = await res.json();
          setTrade(data.data ?? data);
        } else if (res.status === 404) {
          setError('Trade not found');
        } else {
          setError('Failed to load trade');
        }
      } catch {
        setError('Failed to load trade');
      } finally {
        setLoading(false);
      }
    }
    if (tradeId) fetchTrade();
  }, [tradeId]);

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this trade? This cannot be undone.')) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/trades/${tradeId}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/dashboard/trades');
        router.refresh();
      } else {
        alert('Failed to delete trade');
      }
    } catch {
      alert('Failed to delete trade');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <>
        <Topbar title="Trade Details" />
        <div className={styles.page}>
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <span>Loading trade...</span>
          </div>
        </div>
      </>
    );
  }

  if (error || !trade) {
    return (
      <>
        <Topbar title="Trade Details" />
        <div className={styles.page}>
          <div className={styles.error}>
            <h2>{error || 'Trade not found'}</h2>
            <p>The trade you&apos;re looking for doesn&apos;t exist or has been removed.</p>
            <Link href="/dashboard/trades" className={styles.errorBtn}>
              <ArrowLeft size={16} /> Back to Trade Log
            </Link>
          </div>
        </div>
      </>
    );
  }

  const pnl = trade.pnl != null ? Number(trade.pnl) : null;
  const rMult = trade.rMultiple != null ? Number(trade.rMultiple) : null;

  return (
    <>
      <Topbar title="Trade Details" subtitle={trade.symbol} />
      <div className={styles.page}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <button className={styles.backBtn} onClick={() => router.push('/dashboard/trades')}>
              <ArrowLeft size={18} />
            </button>
            <div className={styles.symbolGroup}>
              <div className={styles.symbolRow}>
                <span className={styles.symbol}>{trade.symbol}</span>
                <span className={`badge ${trade.side === 'LONG' ? 'badge-long' : 'badge-short'}`}>
                  {trade.side}
                </span>
                <span className={`badge ${trade.status === 'OPEN' ? 'badge-open' : 'badge-closed'}`}>
                  {trade.status}
                </span>
              </div>
              <div className={styles.meta}>
                <Clock size={13} />
                <span>{formatDate(trade.entryDate, 'MMM dd, yyyy HH:mm')}</span>
                {trade.strategy && (
                  <span className={styles.strategyBadge}>{trade.strategy}</span>
                )}
              </div>
            </div>
          </div>
          <div className={styles.headerActions}>
            <Link href={`/dashboard/trades/${tradeId}/edit`} className={styles.editBtn}>
              <Edit3 size={14} /> Edit
            </Link>
            <button
              className={styles.deleteBtn}
              onClick={handleDelete}
              disabled={deleting}
              title="Delete trade"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* P&L Summary */}
        <div className={styles.pnlCard}>
          <div className={styles.pnlItem}>
            <span className={styles.pnlLabel}>P&L</span>
            <span className={`${styles.pnlValue} ${pnl != null ? (pnl >= 0 ? styles.pnlPositive : styles.pnlNegative) : styles.pnlNeutral}`}>
              {pnl != null ? formatCurrency(pnl) : '—'}
            </span>
          </div>
          <div className={styles.pnlItem}>
            <span className={styles.pnlLabel}>R-Multiple</span>
            <span className={`${styles.pnlValue} ${rMult != null ? (rMult >= 0 ? styles.pnlPositive : styles.pnlNegative) : styles.pnlNeutral}`}>
              {rMult != null ? `${rMult >= 0 ? '+' : ''}${rMult.toFixed(2)}R` : '—'}
            </span>
          </div>
          <div className={styles.pnlItem}>
            <span className={styles.pnlLabel}>Rating</span>
            <div className={styles.stars}>
              {[1, 2, 3, 4, 5].map((s) => (
                <span key={s} className={s <= (trade.rating || 0) ? styles.starFilled : styles.starEmpty}>
                  ★
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Detail Grid */}
        <div className={styles.grid}>
          {/* Trade Info */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Trade Info</h2>
            <div className={styles.detailGrid}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Entry Price</span>
                <span className={styles.detailValue}>${Number(trade.entryPrice).toFixed(2)}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Exit Price</span>
                <span className={styles.detailValue}>
                  {trade.exitPrice ? `$${Number(trade.exitPrice).toFixed(2)}` : '—'}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Quantity</span>
                <span className={styles.detailValue}>{Number(trade.quantity)}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Commission</span>
                <span className={styles.detailValue}>${Number(trade.commission).toFixed(2)}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Stop Loss</span>
                <span className={styles.detailValue}>
                  {trade.stopLoss ? `$${Number(trade.stopLoss).toFixed(2)}` : '—'}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Take Profit</span>
                <span className={styles.detailValue}>
                  {trade.takeProfit ? `$${Number(trade.takeProfit).toFixed(2)}` : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Dates & Classification */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Dates & Classification</h2>
            <div className={styles.detailGrid}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Entry Date</span>
                <span className={styles.detailValue}>{formatDate(trade.entryDate, 'MMM dd, yyyy HH:mm')}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Exit Date</span>
                <span className={styles.detailValue}>
                  {trade.exitDate ? formatDate(trade.exitDate, 'MMM dd, yyyy HH:mm') : '—'}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Strategy</span>
                <span className={styles.detailValueText}>
                  {trade.strategy || '—'}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Timeframe</span>
                <span className={styles.detailValueText}>
                  {trade.timeframe || '—'}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Account</span>
                <span className={styles.detailValueText}>
                  {trade.account?.name || 'Default'}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Created</span>
                <span className={styles.detailValue}>{formatDate(trade.createdAt, 'MMM dd, yyyy')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Images & Charts */}
        {trade.images && trade.images.length > 0 && (
          <div className={`${styles.section} ${styles.fullWidth}`} style={{ marginBottom: 'var(--space-6)' }}>
            <h2 className={styles.sectionTitle}>Screenshots & Charts</h2>
            <div className={styles.attachmentGrid}>
              {trade.images.map((img: Record<string, string>, i: number) => {
                const isTv = img.type === 'tradingview';
                return isTv ? (
                  <a
                    key={img.id || i}
                    href={img.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.tvEmbed}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect width="24" height="24" rx="4" fill="#2962FF" />
                      <path d="M5 17l4-8 3 5 2-3 5 6H5z" fill="white" />
                    </svg>
                    <div>
                      <div className={styles.tvLinkTitle}>TradingView Chart</div>
                      <div className={styles.tvLink}>{img.caption || img.url}</div>
                    </div>
                    <span className={styles.tvOpen}>Open ↗</span>
                  </a>
                ) : (
                  <div key={img.id || i} className={styles.attachmentItem}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.caption || `Trade screenshot ${i + 1}`}
                      className={styles.attachmentImage}
                      onClick={() => setLightboxIndex(imageAttachments.findIndex((a: Record<string, string>) => a.id === img.id || a.url === img.url))}
                    />
                    {img.caption && (
                      <span className={styles.attachmentCaption}>{img.caption}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Lightbox */}
        {lightboxIndex !== null && imageAttachments[lightboxIndex] && (
          <div className={styles.lightboxOverlay} onClick={() => setLightboxIndex(null)}>
            <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
              <button className={styles.lightboxClose} onClick={() => setLightboxIndex(null)}>
                <X size={20} />
              </button>
              <a
                href={imageAttachments[lightboxIndex].url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.lightboxExternal}
                title="Open original"
              >
                <ExternalLink size={16} />
              </a>
              {lightboxIndex > 0 && (
                <button
                  className={`${styles.lightboxNav} ${styles.lightboxPrev}`}
                  onClick={() => setLightboxIndex(lightboxIndex - 1)}
                >
                  <ChevronLeft size={28} />
                </button>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageAttachments[lightboxIndex].url}
                alt={imageAttachments[lightboxIndex].caption || `Screenshot ${lightboxIndex + 1}`}
                className={styles.lightboxImage}
              />
              {lightboxIndex < imageAttachments.length - 1 && (
                <button
                  className={`${styles.lightboxNav} ${styles.lightboxNext}`}
                  onClick={() => setLightboxIndex(lightboxIndex + 1)}
                >
                  <ChevronRight size={28} />
                </button>
              )}
              {imageAttachments[lightboxIndex].caption && (
                <div className={styles.lightboxCaption}>{imageAttachments[lightboxIndex].caption}</div>
              )}
              <div className={styles.lightboxCounter}>
                {lightboxIndex + 1} / {imageAttachments.length}
              </div>
            </div>
          </div>
        )}

        {/* Notes Section */}
        {(trade.setupDescription || trade.notes || trade.mistakes || trade.lessons) && (
          <div className={`${styles.section} ${styles.fullWidth}`} style={{ marginBottom: 'var(--space-6)' }}>
            <h2 className={styles.sectionTitle}>Notes & Analysis</h2>
            <div className={styles.detailGrid}>
              {trade.setupDescription && (
                <div className={styles.detailItem} style={{ gridColumn: '1 / -1' }}>
                  <span className={styles.detailLabel}>Setup Description</span>
                  <p className={styles.notesContent}>{trade.setupDescription}</p>
                </div>
              )}
              {trade.notes && (
                <div className={styles.detailItem} style={{ gridColumn: '1 / -1' }}>
                  <span className={styles.detailLabel}>Notes</span>
                  <p className={styles.notesContent}>{trade.notes}</p>
                </div>
              )}
              {trade.mistakes && (
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Mistakes</span>
                  <p className={styles.notesContent}>{trade.mistakes}</p>
                </div>
              )}
              {trade.lessons && (
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Lessons Learned</span>
                  <p className={styles.notesContent}>{trade.lessons}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
