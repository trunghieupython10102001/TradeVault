'use client';

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  success: () => {},
  error: () => {},
  info: () => {},
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const add = useCallback(
    (message: string, type: ToastType) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => remove(id), 4000);
    },
    [remove]
  );

  const success = useCallback((m: string) => add(m, 'success'), [add]);
  const error = useCallback((m: string) => add(m, 'error'), [add]);
  const info = useCallback((m: string) => add(m, 'info'), [add]);

  return (
    <ToastContext.Provider value={{ success, error, info }}>
      {children}
      {/* Toast Container */}
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          maxWidth: '360px',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onRemove={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onRemove }: { toast: ToastItem; onRemove: (id: string) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const colors: Record<ToastType, { bg: string; border: string; icon: string }> = {
    success: { bg: 'linear-gradient(135deg, rgba(34, 197, 94, 0.14), rgba(10, 16, 30, 0.92))', border: 'rgba(34, 197, 94, 0.26)', icon: '#4ade80' },
    error:   { bg: 'linear-gradient(135deg, rgba(248, 113, 113, 0.16), rgba(10, 16, 30, 0.92))', border: 'rgba(248, 113, 113, 0.28)', icon: '#f87171' },
    info:    { bg: 'linear-gradient(135deg, rgba(124, 140, 255, 0.18), rgba(10, 16, 30, 0.92))', border: 'rgba(124, 140, 255, 0.3)', icon: '#98a6ff' },
  };

  const icons = {
    success: <CheckCircle size={16} />,
    error:   <AlertCircle size={16} />,
    info:    <Info size={16} />,
  };

  const c = colors[toast.type];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '14px 15px',
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: '18px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.34)',
        pointerEvents: 'all',
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.97)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.25s ease',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        overflow: 'hidden',
      }}
    >
      <span style={{ color: c.icon, flexShrink: 0, marginTop: 1 }}>{icons[toast.type]}</span>
      <span style={{ flex: 1, fontSize: '0.875rem', color: '#f1f5f9', lineHeight: 1.5 }}>
        {toast.message}
      </span>
      <button
        onClick={() => onRemove(toast.id)}
        style={{
          background: 'none',
          border: 'none',
          color: '#64748b',
          cursor: 'pointer',
          padding: 0,
          display: 'flex',
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export const useToast = () => useContext(ToastContext);
