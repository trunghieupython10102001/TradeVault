'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, X, Plus, Link as LinkIcon } from 'lucide-react';
import styles from './ImageUpload.module.css';

export interface TradeAttachment {
  id?: string;
  type: 'image' | 'tradingview';
  url: string;
  caption?: string;
}

interface ImageUploadProps {
  attachments: TradeAttachment[];
  onChange: (attachments: TradeAttachment[]) => void;
}

function isTradingViewChartUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.includes('tradingview.com') && u.pathname.includes('/chart/');
  } catch {
    return false;
  }
}

function isTradingViewSnapshotUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.includes('tradingview.com') && /^\/x\//.test(u.pathname);
  } catch {
    return false;
  }
}

function snapshotToImageUrl(url: string): string {
  const match = url.match(/\/x\/([a-zA-Z0-9]+)/);
  if (match) {
    return `https://s3.tradingview.com/snapshots/${match[1][0].toLowerCase()}/${match[1]}.png`;
  }
  return url;
}

export default function ImageUpload({ attachments, onChange }: ImageUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) =>
      f.type.startsWith('image/')
    );
    if (fileArray.length === 0) return;

    setUploading(true);
    const newAttachments: TradeAttachment[] = [];

    for (const file of fileArray) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/uploads', {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          newAttachments.push({
            type: 'image',
            url: data.url,
            caption: file.name,
          });
        }
      } catch (err) {
        console.error('Upload failed:', err);
      }
    }

    if (newAttachments.length > 0) {
      onChange([...attachments, ...newAttachments]);
    }
    setUploading(false);
  }, [attachments, onChange]);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      handleFiles(imageFiles);
    }
  }, [handleFiles]);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleAddLink = () => {
    const url = linkValue.trim();
    if (!url) return;

    if (isTradingViewSnapshotUrl(url)) {
      onChange([
        ...attachments,
        { type: 'image', url: snapshotToImageUrl(url), caption: 'TradingView Snapshot' },
      ]);
    } else if (isTradingViewChartUrl(url)) {
      onChange([
        ...attachments,
        { type: 'tradingview', url },
      ]);
    } else if (url.match(/\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i) || url.startsWith('http')) {
      onChange([
        ...attachments,
        { type: 'image', url },
      ]);
    }
    setLinkValue('');
  };

  const handleRemove = (index: number) => {
    onChange(attachments.filter((_, i) => i !== index));
  };

  return (
    <div className={styles.wrapper}>
      {/* Upload zone */}
      <div
        className={`${styles.uploadZone} ${dragOver ? styles.uploadZoneDragOver : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Camera size={28} />
        <p className={styles.uploadZoneText}>
          Drag & drop, click to upload, or paste from clipboard
        </p>
        <span className={styles.uploadZoneHint}>PNG, JPG up to 10MB · Ctrl+V / ⌘V anywhere</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className={styles.uploadInput}
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {/* Or divider + link input */}
      <div className={styles.orDivider}>or paste a link</div>
      <div className={styles.linkRow}>
        <input
          type="text"
          className={styles.linkInput}
          placeholder="Paste TradingView chart URL or image URL..."
          value={linkValue}
          onChange={(e) => setLinkValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddLink())}
        />
        <button
          type="button"
          className={styles.addLinkBtn}
          onClick={handleAddLink}
          disabled={!linkValue.trim()}
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {/* Uploading indicator */}
      {uploading && (
        <div className={styles.uploading}>
          <div className={styles.uploadSpinner} />
          Uploading...
        </div>
      )}

      {/* Preview grid */}
      {attachments.length > 0 && (
        <div className={styles.previewGrid}>
          {attachments.map((att, i) => (
            <div key={i} className={styles.previewItem}>
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => handleRemove(i)}
              >
                <X size={12} />
              </button>
              {att.type === 'image' ? (
                <img
                  src={att.url}
                  alt={att.caption || 'Trade screenshot'}
                  className={styles.previewImage}
                />
              ) : (
                <div className={styles.previewTv}>
                  <LinkIcon size={20} />
                  <span className={styles.previewTvIcon}>TradingView</span>
                  <span className={styles.previewTvLabel}>{att.url}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
