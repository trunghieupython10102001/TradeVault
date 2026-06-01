'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X, Clock } from 'lucide-react';
import styles from './DateTimePicker.module.css';

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  timezone?: string;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function getNowInTimezone(tz: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', hour12: false,
    }).formatToParts(new Date());
    const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? '0');
    return { year: get('year'), month: get('month') - 1, day: get('day'), hours: get('hour') % 24, minutes: get('minute') };
  } catch {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), hours: d.getHours(), minutes: d.getMinutes() };
  }
}

function toLocalParts(dateStr: string) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    const parts = dateStr.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!parts) return null;
    return {
      year: parseInt(parts[1]),
      month: parseInt(parts[2]) - 1,
      day: parseInt(parts[3]),
      hours: parseInt(parts[4]),
      minutes: parseInt(parts[5]),
    };
  }
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    day: d.getDate(),
    hours: d.getHours(),
    minutes: d.getMinutes(),
  };
}

function formatDisplay(dateStr: string): string {
  const p = toLocalParts(dateStr);
  if (!p) return '';
  const monthName = MONTHS[p.month].slice(0, 3);
  return `${monthName} ${p.day}, ${p.year} ${pad(p.hours)}:${pad(p.minutes)}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export default function DateTimePicker({
  value,
  onChange,
  placeholder = 'Select date & time',
  required,
  disabled,
  timezone,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const now = timezone ? getNowInTimezone(timezone) : (() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), hours: d.getHours(), minutes: d.getMinutes() }; })();
  const parsed = toLocalParts(value);

  const [viewYear, setViewYear] = useState(parsed?.year ?? now.year);
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? now.month);
  const [hours, setHours] = useState(parsed ? pad(parsed.hours) : pad(now.hours));
  const [minutes, setMinutes] = useState(parsed ? pad(parsed.minutes) : pad(now.minutes));

  const buildValue = useCallback((year: number, month: number, day: number, h: string, m: string) => {
    return `${year}-${pad(month + 1)}-${pad(day)}T${h}:${m}`;
  }, []);

  const handleDayClick = (day: number, isOutside: boolean) => {
    if (isOutside) return;
    const val = buildValue(viewYear, viewMonth, day, hours, minutes);
    onChange(val);
  };

  const handleTimeChange = (type: 'hours' | 'minutes', raw: string) => {
    const num = raw.replace(/\D/g, '').slice(0, 2);
    if (type === 'hours') {
      setHours(num);
      if (parsed && num.length <= 2) {
        const clamped = Math.min(23, Math.max(0, parseInt(num) || 0));
        onChange(buildValue(parsed.year, parsed.month, parsed.day, pad(clamped), minutes));
      }
    } else {
      setMinutes(num);
      if (parsed && num.length <= 2) {
        const clamped = Math.min(59, Math.max(0, parseInt(num) || 0));
        onChange(buildValue(parsed.year, parsed.month, parsed.day, hours, pad(clamped)));
      }
    }
  };

  const handleTimeBlur = (type: 'hours' | 'minutes') => {
    if (type === 'hours') {
      const clamped = Math.min(23, Math.max(0, parseInt(hours) || 0));
      setHours(pad(clamped));
    } else {
      const clamped = Math.min(59, Math.max(0, parseInt(minutes) || 0));
      setMinutes(pad(clamped));
    }
  };

  const goToToday = () => {
    const n = timezone ? getNowInTimezone(timezone) : (() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), hours: d.getHours(), minutes: d.getMinutes() }; })();
    setViewYear(n.year);
    setViewMonth(n.month);
    const h = pad(n.hours);
    const m = pad(n.minutes);
    setHours(h);
    setMinutes(m);
    onChange(buildValue(n.year, n.month, n.day, h, m));
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);
  const prevMonthDays = getDaysInMonth(viewYear, viewMonth - 1);

  const calendarDays: { day: number; outside: boolean }[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    calendarDays.push({ day: prevMonthDays - i, outside: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push({ day: d, outside: false });
  }
  const remaining = 42 - calendarDays.length;
  for (let d = 1; d <= remaining; d++) {
    calendarDays.push({ day: d, outside: true });
  }

  const isToday = (day: number, outside: boolean) =>
    !outside &&
    day === now.day &&
    viewMonth === now.month &&
    viewYear === now.year;

  const isSelected = (day: number, outside: boolean) =>
    !outside &&
    parsed != null &&
    day === parsed.day &&
    viewMonth === parsed.month &&
    viewYear === parsed.year;

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''} ${disabled ? styles.triggerDisabled : ''}`}
        onClick={() => !disabled && setOpen(!open)}
        tabIndex={0}
      >
        <Calendar size={15} className={styles.triggerIcon} />
        <span className={`${styles.triggerText} ${!value ? styles.placeholder : ''}`}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        {value && !required && !disabled && (
          <span
            className={styles.clearBtn}
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            role="button"
            tabIndex={-1}
          >
            <X size={14} />
          </span>
        )}
      </button>

      {open && (
        <>
          <div className={styles.dropdown}>
            {/* Calendar header */}
            <div className={styles.calHeader}>
              <span className={styles.calTitle}>
                {MONTHS[viewMonth]} {viewYear}
              </span>
              <div className={styles.calNav}>
                <button type="button" className={styles.calNavBtn} onClick={prevMonth}>
                  <ChevronLeft size={14} />
                </button>
                <button type="button" className={styles.calNavBtn} onClick={nextMonth}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            {/* Weekday labels */}
            <div className={styles.weekdays}>
              {WEEKDAYS.map((wd) => (
                <span key={wd} className={styles.weekday}>{wd}</span>
              ))}
            </div>

            {/* Days */}
            <div className={styles.days}>
              {calendarDays.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  className={`${styles.day} ${isToday(d.day, d.outside) ? styles.dayToday : ''} ${isSelected(d.day, d.outside) ? styles.daySelected : ''} ${d.outside ? styles.dayOutside : ''}`}
                  onClick={() => handleDayClick(d.day, d.outside)}
                  disabled={d.outside}
                >
                  {d.day}
                </button>
              ))}
            </div>

            {/* Time */}
            <div className={styles.timeSection}>
              <Clock size={14} className={styles.triggerIcon} />
              <span className={styles.timeLabel}>Time</span>
              <input
                type="text"
                className={styles.timeInput}
                value={hours}
                onChange={(e) => handleTimeChange('hours', e.target.value)}
                onBlur={() => handleTimeBlur('hours')}
                maxLength={2}
                placeholder="HH"
              />
              <span className={styles.timeSep}>:</span>
              <input
                type="text"
                className={styles.timeInput}
                value={minutes}
                onChange={(e) => handleTimeChange('minutes', e.target.value)}
                onBlur={() => handleTimeBlur('minutes')}
                maxLength={2}
                placeholder="MM"
              />
            </div>

            {/* Footer */}
            <div className={styles.footer}>
              <button type="button" className={styles.todayBtn} onClick={goToToday}>
                Now
              </button>
              <button type="button" className={styles.doneBtn} onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
