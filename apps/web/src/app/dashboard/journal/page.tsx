'use client';

import { useState, useEffect } from 'react';
import { Plus, Clock, Edit3 } from 'lucide-react';
import Topbar from '@/components/layout/Topbar';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { formatDate } from '@/lib/utils';
import styles from './page.module.css';

const moodIcons: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  GREAT:    { icon: '🚀', label: 'Great',    color: '#22c55e' },
  GOOD:     { icon: '😊', label: 'Good',     color: '#86efac' },
  NEUTRAL:  { icon: '😐', label: 'Neutral',  color: '#94a3b8' },
  BAD:      { icon: '😞', label: 'Bad',      color: '#fca5a5' },
  TERRIBLE: { icon: '💀', label: 'Terrible', color: '#ef4444' },
};

interface JournalEntry {
  id: string;
  entryDate: string | Date;
  content: string;
  mood: 'GREAT' | 'GOOD' | 'NEUTRAL' | 'BAD' | 'TERRIBLE';
  confidenceLevel: number;
}

export default function JournalPage() {
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [mood, setMood] = useState<JournalEntry['mood']>('NEUTRAL');
  const [confidence, setConfidence] = useState(5);
  const [content, setContent] = useState('');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchEntries() {
      try {
        const res = await apiFetch('/api/journal');
        if (res.ok) setEntries(await res.json());
      } catch {
        console.error('Failed to fetch journal');
      } finally {
        setLoading(false);
      }
    }
    fetchEntries();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const date = params.get('date');
    if (!date) return;
    const parsed = new Date(`${date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return;
    setEditingEntry(null);
    setSelectedDate(parsed);
    setMood('NEUTRAL');
    setConfidence(5);
    setContent('');
    setShowForm(true);
  }, []);

  const openNew = () => {
    setEditingEntry(null);
    setSelectedDate(new Date());
    setMood('NEUTRAL');
    setConfidence(5);
    setContent('');
    setShowForm(true);
  };

  const openEdit = (entry: JournalEntry) => {
    setEditingEntry(entry);
    setSelectedDate(new Date(entry.entryDate));
    setMood(entry.mood);
    setConfidence(entry.confidenceLevel ?? 5);
    setContent(entry.content);
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingEntry(null);
  };

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/journal', {
        method: 'POST',
        body: JSON.stringify({
          entryDate: editingEntry ? editingEntry.entryDate : selectedDate,
          content,
          mood,
          confidenceLevel: confidence,
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        setEntries((prev) => {
          const filtered = prev.filter((e) => e.id !== saved.id);
          return [saved, ...filtered].sort(
            (a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime()
          );
        });
        toast.success(editingEntry ? 'Journal entry updated' : 'Journal entry saved');
        cancelForm();
      } else {
        toast.error('Failed to save journal entry');
      }
    } catch {
      toast.error('Failed to save journal entry');
    } finally {
      setSaving(false);
    }
  };

  const formTitle = editingEntry
    ? `Editing — ${formatDate(editingEntry.entryDate)}`
    : `New Entry — ${formatDate(selectedDate)}`;

  return (
    <>
      <Topbar title="Journal" subtitle="Reflect on your trading day" />
      <div className={styles.page}>
        <div className={styles.toolbar}>
          <h2 className={styles.toolbarTitle}>Journal Entries</h2>
          <button className={styles.addBtn} onClick={openNew}>
            <Plus size={16} />
            New Entry
          </button>
        </div>

        {/* Entry Form */}
        {showForm && (
          <div className={styles.newEntry}>
            <div className={styles.entryHeader}>
              <h3>{formTitle}</h3>
            </div>
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
                  type="range"
                  min="1"
                  max="10"
                  value={confidence}
                  onChange={(e) => setConfidence(parseInt(e.target.value))}
                  className={styles.slider}
                />
                <span className={styles.confidenceValue}>{confidence}/10</span>
              </div>
            </div>
            <textarea
              className={styles.journalTextarea}
              placeholder="Write about your trading day... What went well? What could be improved?"
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <div className={styles.entryActions}>
              <button className={styles.cancelBtn} onClick={cancelForm}>
                Cancel
              </button>
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
          ) : entries.length === 0 ? (
            <div className={styles.empty}>No journal entries yet.</div>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className={styles.entryCard}>
                <div className={styles.entryMeta}>
                  <div className={styles.entryDate}>
                    <Clock size={14} />
                    {formatDate(entry.entryDate)}
                  </div>
                  <div className={styles.entryBadges}>
                    {entry.mood && (
                      <span
                        className={styles.moodBadge}
                        style={{ color: moodIcons[entry.mood]?.color || '#fff' }}
                      >
                        {moodIcons[entry.mood]?.icon} {moodIcons[entry.mood]?.label}
                      </span>
                    )}
                    <span className={styles.confBadge}>
                      Confidence: {entry.confidenceLevel}/10
                    </span>
                    <button
                      className={styles.editEntryBtn}
                      onClick={() => openEdit(entry)}
                      title="Edit entry"
                    >
                      <Edit3 size={13} />
                      Edit
                    </button>
                  </div>
                </div>
                <p className={styles.entryContent}>{entry.content}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
