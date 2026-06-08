'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Clock, Edit3, ChevronLeft, ChevronRight } from 'lucide-react';
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

const PDFExportButton = dynamic(
  () => import('@/components/journal/PDFExportButton'),
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

  const openNew = useCallback(() => {
    setEditingEntry(null);
    setSavedEntryId(null);
    setMood('NEUTRAL');
    setConfidence(5);
    setContentJSON(EMPTY_DOC);
    setTradeIds([]);
    setShowForm(true);
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

  const openEdit = (entry: JournalEntry) => {
    setEditingEntry(entry);
    setSavedEntryId(entry.id);
    setCurrentPeriodStart(periodStart(new Date(entry.entryDate), entry.periodType as PeriodType));
    setActivePeriodType(entry.periodType as PeriodType);
    setMood(entry.mood);
    setConfidence(entry.confidenceLevel ?? 5);
    setContentJSON(parseContent(entry.content) as object);
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
              let html = '';
              try {
                html = generateHTML(
                  parseContent(entry.content) as Parameters<typeof generateHTML>[0],
                  htmlExtensions
                );
              } catch { html = '<p><em>Unable to render content</em></p>'; }
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
                      <PDFExportButton
                        entry={entry}
                        fileName={`journal-${entry.periodType.toLowerCase()}-${toISODate(new Date(entry.entryDate))}.pdf`}
                        className={styles.editEntryBtn}
                      />
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
