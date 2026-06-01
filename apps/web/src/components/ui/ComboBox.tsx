'use client';

import { useState, useRef, useEffect } from 'react';
import styles from './ComboBox.module.css';

interface ComboBoxProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  required?: boolean;
  uppercase?: boolean;
}

export default function ComboBox({
  value,
  onChange,
  suggestions,
  placeholder,
  required,
  uppercase,
}: ComboBoxProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = value
    ? suggestions.filter((s) => s.toLowerCase().includes(value.toLowerCase()))
    : suggestions;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const select = (s: string) => {
    onChange(uppercase ? s.toUpperCase() : s);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = uppercase ? e.target.value.toUpperCase() : e.target.value;
    onChange(v);
    setOpen(true);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      select(filtered[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className={styles.input}
      />
      {open && filtered.length > 0 && (
        <ul className={styles.dropdown} role="listbox">
          {filtered.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === activeIndex}
              className={`${styles.option} ${i === activeIndex ? styles.optionActive : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                select(s);
              }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
