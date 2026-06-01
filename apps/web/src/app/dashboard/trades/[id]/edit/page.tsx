'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Save,
  Star,
} from 'lucide-react';
import Topbar from '@/components/layout/Topbar';
import ComboBox from '@/components/ui/ComboBox';
import DateTimePicker from '@/components/ui/DateTimePicker';
import ImageUpload, { TradeAttachment } from '@/components/ui/ImageUpload';
import { apiFetch } from '@/lib/api';
import styles from './page.module.css';

const timeframes = ['1m', '5m', '15m', '1H', '4H', 'Daily', 'Weekly'];

function toDateTimeLocal(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EditTradePage() {
  const params = useParams();
  const router = useRouter();
  const tradeId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rating, setRating] = useState(0);
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [status, setStatus] = useState<'OPEN' | 'CLOSED'>('OPEN');
  const [symbol, setSymbol] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [commission, setCommission] = useState('0');
  const [grossPnl, setGrossPnl] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [exitDate, setExitDate] = useState('');
  const [account, setAccount] = useState('');
  const [strategy, setStrategy] = useState('');
  const [timeframe, setTimeframe] = useState('');
  const [setupDescription, setSetupDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [mistakes, setMistakes] = useState('');
  const [lessonsLearned, setLessonsLearned] = useState('');
  const [attachments, setAttachments] = useState<TradeAttachment[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [strategies, setStrategies] = useState<string[]>([
    'Breakout', 'Trend Follow', 'Mean Reversion', 'Scalping', 'Swing', 'Gap Fill', 'VWAP', 'Other',
  ]);
  const [timezone, setTimezone] = useState('UTC');

  useEffect(() => {
    async function fetchTrade() {
      try {
        const res = await apiFetch(`/api/trades/${tradeId}`);
        if (res.ok) {
          const json = await res.json();
          const t = json.data ?? json;
          setSymbol(t.symbol || '');
          setSide(t.side || 'LONG');
          setStatus(t.status || 'OPEN');
          setEntryPrice(t.entryPrice != null ? String(Number(t.entryPrice)) : '');
          setExitPrice(t.exitPrice != null ? String(Number(t.exitPrice)) : '');
          setQuantity(t.quantity != null ? String(Number(t.quantity)) : '');
          setCommission(t.commission != null ? String(Number(t.commission)) : '0');
          // grossPnl = pnl + commission (reverse the net calculation)
          if (t.pnl != null) {
            const gross = Number(t.pnl) + Number(t.commission ?? 0);
            setGrossPnl(String(gross));
          }
          setStopLoss(t.stopLoss != null ? String(Number(t.stopLoss)) : '');
          setTakeProfit(t.takeProfit != null ? String(Number(t.takeProfit)) : '');
          setEntryDate(toDateTimeLocal(t.entryDate));
          setExitDate(toDateTimeLocal(t.exitDate));
          setAccount(t.accountId || '');
          setStrategy(t.strategy || '');
          setTimeframe(t.timeframe || '');
          setRating(t.rating || 0);
          setSetupDescription(t.setupDescription || '');
          setNotes(t.notes || '');
          setMistakes(t.mistakes || '');
          setLessonsLearned(t.lessons || '');
          if (t.images && Array.isArray(t.images)) {
            setAttachments(t.images.map((img: Record<string, string>) => ({
              id: img.id,
              type: (img.type as 'image' | 'tradingview') || 'image',
              url: img.url,
              caption: img.caption || '',
            })));
          }
        }
      } catch {
        console.error('Failed to fetch trade for editing');
      } finally {
        setLoading(false);
      }
    }
    if (tradeId) fetchTrade();
  }, [tradeId]);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/settings').then((r) => r.ok ? r.json() : null),
      apiFetch('/api/trades/symbols').then((r) => r.ok ? r.json() : []),
    ]).then(([settings, syms]) => {
      if (settings?.settings?.strategies?.length) {
        setStrategies(settings.settings.strategies);
      }
      if (settings?.settings?.timezone) {
        setTimezone(settings.settings.timezone);
      }
      setSymbols(syms);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);

    const payload: Record<string, unknown> = {
      symbol,
      side,
      entryPrice: parseFloat(entryPrice || '0'),
      quantity: parseFloat(quantity || '0'),
      entryDate,
      status,
      rating,
    };

    if (exitPrice) payload.exitPrice = parseFloat(exitPrice);
    else if (status === 'OPEN') payload.exitPrice = null;
    if (commission) payload.commission = parseFloat(commission);
    if (grossPnl) payload.grossPnl = parseFloat(grossPnl);
    if (stopLoss) payload.stopLoss = parseFloat(stopLoss);
    if (takeProfit) payload.takeProfit = parseFloat(takeProfit);
    if (exitDate) payload.exitDate = exitDate;
    else if (status === 'OPEN') payload.exitDate = null;
    if (account) payload.accountId = account;
    payload.strategy = strategy || null;
    payload.timeframe = timeframe || null;
    payload.setupDescription = setupDescription || null;
    payload.notes = notes || null;
    payload.mistakes = mistakes || null;
    payload.lessons = lessonsLearned || null;
    if (attachments.length > 0) {
      payload.images = attachments.map((a) => ({ url: a.url, caption: a.caption || null, type: a.type }));
    } else {
      payload.images = [];
    }

    try {
      const res = await apiFetch(`/api/trades/${tradeId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        router.push(`/dashboard/trades/${tradeId}`);
        router.refresh();
      } else {
        const error = await res.json();
        alert('Failed to update trade: ' + JSON.stringify(error));
      }
    } catch {
      alert('Error updating trade');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <>
        <Topbar title="Edit Trade" />
        <div className={styles.page}>
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <span>Loading trade...</span>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Edit Trade" subtitle={symbol} />
      <div className={styles.page}>
        <Link href={`/dashboard/trades/${tradeId}`} className={styles.backBtn}>
          <ArrowLeft size={16} /> Back to Trade
        </Link>

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Trade Details */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Trade Details</h2>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.label}>Symbol *</label>
                <ComboBox
                  value={symbol}
                  onChange={setSymbol}
                  suggestions={symbols}
                  placeholder="e.g. AAPL"
                  required
                  uppercase
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Side *</label>
                <div className={styles.toggleGroup}>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${side === 'LONG' ? styles.toggleLong : ''}`}
                    onClick={() => setSide('LONG')}
                  >
                    Long
                  </button>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${side === 'SHORT' ? styles.toggleShort : ''}`}
                    onClick={() => setSide('SHORT')}
                  >
                    Short
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.grid4}>
              <div className={styles.field}>
                <label className={styles.label}>Entry Price *</label>
                <input type="number" step="any" placeholder="0.00" className={styles.input} required value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Exit Price</label>
                <input type="number" step="any" placeholder="0.00" className={styles.input} disabled={status === 'OPEN'} value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Quantity *</label>
                <input type="number" step="any" placeholder="0" className={styles.input} required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Commission</label>
                <input type="number" step="any" placeholder="0.00" className={styles.input} value={commission} onChange={(e) => setCommission(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Gross P&L</label>
                <input type="number" step="any" placeholder="0.00" className={styles.input} disabled={status === 'OPEN'} value={grossPnl} onChange={(e) => setGrossPnl(e.target.value)} />
              </div>
            </div>

            <div className={styles.grid4}>
              <div className={styles.field}>
                <label className={styles.label}>Stop Loss</label>
                <input type="number" step="any" placeholder="0.00" className={styles.input} value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Take Profit</label>
                <input type="number" step="any" placeholder="0.00" className={styles.input} value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Entry Date *</label>
                <DateTimePicker value={entryDate} onChange={setEntryDate} placeholder="Select entry date" required timezone={timezone} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Exit Date</label>
                <DateTimePicker value={exitDate} onChange={setExitDate} placeholder="Select exit date" disabled={status === 'OPEN'} timezone={timezone} />
              </div>
            </div>

            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.label}>Status</label>
                <div className={styles.toggleGroup}>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${status === 'OPEN' ? styles.toggleOpen : ''}`}
                    onClick={() => setStatus('OPEN')}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${status === 'CLOSED' ? styles.toggleClosed : ''}`}
                    onClick={() => setStatus('CLOSED')}
                  >
                    Closed
                  </button>
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Account</label>
                <select className={styles.select} value={account} onChange={(e) => setAccount(e.target.value)}>
                  <option value="">Default Account</option>
                </select>
              </div>
            </div>
          </div>

          {/* Strategy & Classification */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Strategy & Classification</h2>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.label}>Strategy</label>
                <ComboBox
                  value={strategy}
                  onChange={setStrategy}
                  suggestions={strategies}
                  placeholder="Select or type strategy..."
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Timeframe</label>
                <select className={styles.select} value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
                  <option value="">Select timeframe...</option>
                  {timeframes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Rating</label>
              <div className={styles.starsInput}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    className={`${styles.starBtn} ${star <= rating ? styles.starActive : ''}`}
                    onClick={() => setRating(star === rating ? 0 : star)}
                  >
                    <Star size={20} fill={star <= rating ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Notes & Analysis</h2>
            <div className={styles.field}>
              <label className={styles.label}>Setup Description</label>
              <textarea
                placeholder="Describe your trade setup, entry triggers, and market context..."
                className={styles.textarea}
                rows={3}
                value={setupDescription}
                onChange={(e) => setSetupDescription(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Notes</label>
              <textarea
                placeholder="Any additional notes about this trade..."
                className={styles.textarea}
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.label}>Mistakes</label>
                <textarea
                  placeholder="What did you do wrong?"
                  className={styles.textarea}
                  rows={2}
                  value={mistakes}
                  onChange={(e) => setMistakes(e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Lessons Learned</label>
                <textarea
                  placeholder="What did you learn?"
                  className={styles.textarea}
                  rows={2}
                  value={lessonsLearned}
                  onChange={(e) => setLessonsLearned(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Screenshots & Charts */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Screenshots & Charts</h2>
            <ImageUpload attachments={attachments} onChange={setAttachments} />
          </div>

          {/* Submit */}
          <div className={styles.actions}>
            <Link href={`/dashboard/trades/${tradeId}`} className={styles.cancelBtn}>
              Cancel
            </Link>
            <button type="submit" className={styles.submitBtn} disabled={saving}>
              <Save size={16} />
              {saving ? 'Saving...' : 'Update Trade'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
