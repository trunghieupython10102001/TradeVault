'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Star, Tag } from 'lucide-react';
import Topbar from '@/components/layout/Topbar';
import DateTimePicker from '@/components/ui/DateTimePicker';
import ImageUpload, { TradeAttachment } from '@/components/ui/ImageUpload';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import ComboBox from '@/components/ui/ComboBox';
import styles from './page.module.css';

const timeframes = ['1m', '5m', '15m', '1H', '4H', 'Daily', 'Weekly'];

export default function NewTradePage() {
  const router = useRouter();
  const toast = useToast();

  // Core trade state
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
  const [accountId, setAccountId] = useState('');
  const [strategy, setStrategy] = useState('');
  const [timeframe, setTimeframe] = useState('');
  const [setupDescription, setSetupDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [mistakes, setMistakes] = useState('');
  const [lessonsLearned, setLessonsLearned] = useState('');
  const [attachments, setAttachments] = useState<TradeAttachment[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [timezone, setTimezone] = useState('UTC');

  // Account + Tag + Strategy lists
  const [accounts, setAccounts] = useState<{ id: string; name: string; isDefault: boolean }[]>([]);
  const [tags, setTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [strategies, setStrategies] = useState<string[]>([
    'Breakout', 'Trend Follow', 'Mean Reversion', 'Scalping', 'Swing', 'Gap Fill', 'VWAP', 'Other',
  ]);
  const [showTagDropdown, setShowTagDropdown] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/accounts').then((r) => r.ok ? r.json() : []),
      apiFetch('/api/tags').then((r) => r.ok ? r.json() : []),
      apiFetch('/api/settings').then((r) => r.ok ? r.json() : null),
      apiFetch('/api/trades/symbols').then((r) => r.ok ? r.json() : []),
    ]).then(([accs, tgs, settings, syms]) => {
      setAccounts(accs);
      setTags(tgs);
      if (settings?.settings?.strategies?.length) {
        setStrategies(settings.settings.strategies);
      }
      if (settings?.settings?.timezone) {
        setTimezone(settings.settings.timezone);
      }
      setSymbols(syms);
      const defaultAcc = (accs as { id: string; isDefault: boolean }[]).find((a) => a.isDefault);
      if (defaultAcc) setAccountId(defaultAcc.id);
    });
  }, []);

  // Auto-calc P&L preview
  const calcPnl = useMemo(() => {
    const entry = parseFloat(entryPrice);
    const exit = parseFloat(exitPrice);
    const qty = parseFloat(quantity);
    const comm = parseFloat(commission) || 0;
    if (!entry || !exit || !qty || status === 'OPEN') return null;
    const raw = side === 'LONG' ? (exit - entry) * qty : (entry - exit) * qty;
    return raw - comm;
  }, [entryPrice, exitPrice, quantity, commission, side, status]);

  // Auto-fill grossPnl when exit price changes
  useEffect(() => {
    if (status === 'CLOSED' && exitPrice && entryPrice && quantity) {
      const entry = parseFloat(entryPrice);
      const exit = parseFloat(exitPrice);
      const qty = parseFloat(quantity);
      if (entry && exit && qty) {
        const raw = side === 'LONG' ? (exit - entry) * qty : (entry - exit) * qty;
        setGrossPnl(raw.toFixed(2));
      }
    }
  }, [exitPrice, entryPrice, quantity, side, status]);

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

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
      tagIds: selectedTagIds,
    };

    if (exitPrice) payload.exitPrice = parseFloat(exitPrice);
    if (commission) payload.commission = parseFloat(commission);
    if (grossPnl) payload.grossPnl = parseFloat(grossPnl);
    if (stopLoss) payload.stopLoss = parseFloat(stopLoss);
    if (takeProfit) payload.takeProfit = parseFloat(takeProfit);
    if (exitDate) payload.exitDate = exitDate;
    if (accountId) payload.accountId = accountId;
    if (strategy) payload.strategy = strategy;
    if (timeframe) payload.timeframe = timeframe;
    if (setupDescription) payload.setupDescription = setupDescription;
    if (notes) payload.notes = notes;
    if (mistakes) payload.mistakes = mistakes;
    if (lessonsLearned) payload.lessons = lessonsLearned;
    if (attachments.length > 0) {
      payload.images = attachments.map((a) => ({ url: a.url, caption: a.caption || null, type: a.type }));
    }

    try {
      const res = await apiFetch('/api/trades', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success('Trade saved successfully');
        router.push('/dashboard/trades');
        router.refresh();
      } else {
        const error = await res.json();
        toast.error('Failed to save trade: ' + (error.error || 'Unknown error'));
      }
    } catch {
      toast.error('Error submitting trade');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Topbar title="New Trade" subtitle="Log a new trade entry" />
      <div className={styles.page}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          <ArrowLeft size={16} /> Back
        </button>

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Core Details */}
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
                  <button type="button" className={`${styles.toggleBtn} ${side === 'LONG' ? styles.toggleLong : ''}`} onClick={() => setSide('LONG')}>Long</button>
                  <button type="button" className={`${styles.toggleBtn} ${side === 'SHORT' ? styles.toggleShort : ''}`} onClick={() => setSide('SHORT')}>Short</button>
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
                <label className={styles.label}>Gross P&L <span className={styles.labelHint}>(broker reported)</span></label>
                <input type="number" step="any" placeholder="0.00" className={styles.input} disabled={status === 'OPEN'} value={grossPnl} onChange={(e) => setGrossPnl(e.target.value)} />
              </div>
            </div>

            {/* Auto-calc P&L preview */}
            {calcPnl !== null && (
              <div className={`${styles.pnlPreview} ${calcPnl >= 0 ? styles.pnlPreviewPositive : styles.pnlPreviewNegative}`}>
                Calculated P&L: <strong>{calcPnl >= 0 ? '+' : ''}{calcPnl.toFixed(2)}</strong>
                <span className={styles.pnlPreviewHint}>(entry/exit/qty/commission)</span>
              </div>
            )}

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
                  <button type="button" className={`${styles.toggleBtn} ${status === 'OPEN' ? styles.toggleOpen : ''}`} onClick={() => setStatus('OPEN')}>Open</button>
                  <button type="button" className={`${styles.toggleBtn} ${status === 'CLOSED' ? styles.toggleClosed : ''}`} onClick={() => setStatus('CLOSED')}>Closed</button>
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Account</label>
                <select className={styles.select} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">Default Account</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}{a.isDefault ? ' (Default)' : ''}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Strategy & Tags */}
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
                  {timeframes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Tags */}
            {tags.length > 0 && (
              <div className={styles.field}>
                <label className={styles.label}>Tags</label>
                <div className={styles.tagSelectorWrapper}>
                  <button
                    type="button"
                    className={styles.tagSelectorTrigger}
                    onClick={() => setShowTagDropdown((v) => !v)}
                  >
                    <Tag size={14} />
                    {selectedTagIds.length === 0
                      ? 'Select tags...'
                      : `${selectedTagIds.length} tag${selectedTagIds.length > 1 ? 's' : ''} selected`}
                  </button>
                  {showTagDropdown && (
                    <div className={styles.tagDropdown}>
                      {tags.map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          className={`${styles.tagOption} ${selectedTagIds.includes(tag.id) ? styles.tagOptionSelected : ''}`}
                          onClick={() => toggleTag(tag.id)}
                        >
                          <span className={styles.tagDot} style={{ background: tag.color }} />
                          {tag.name}
                          {selectedTagIds.includes(tag.id) && <span className={styles.tagCheck}>✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedTagIds.length > 0 && (
                  <div className={styles.selectedTags}>
                    {selectedTagIds.map((id) => {
                      const tag = tags.find((t) => t.id === id);
                      return tag ? (
                        <span key={id} className={styles.selectedTag} style={{ borderColor: tag.color, color: tag.color }}>
                          {tag.name}
                          <button type="button" onClick={() => toggleTag(id)}>×</button>
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            )}

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
              <textarea placeholder="Describe your trade setup, entry triggers, and market context..." className={styles.textarea} rows={3} value={setupDescription} onChange={(e) => setSetupDescription(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Notes</label>
              <textarea placeholder="Any additional notes about this trade..." className={styles.textarea} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.label}>Mistakes</label>
                <textarea placeholder="What did you do wrong?" className={styles.textarea} rows={2} value={mistakes} onChange={(e) => setMistakes(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Lessons Learned</label>
                <textarea placeholder="What did you learn?" className={styles.textarea} rows={2} value={lessonsLearned} onChange={(e) => setLessonsLearned(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Screenshots */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Screenshots & Charts</h2>
            <ImageUpload attachments={attachments} onChange={setAttachments} />
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={() => router.back()}>Cancel</button>
            <button type="submit" className={styles.submitBtn} disabled={saving}>
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Trade'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
