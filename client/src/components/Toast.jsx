import { useState, useEffect, useCallback } from 'react';
import './Toast.css';

/**
 * Self-contained toast notification system.
 * Usage:
 *   const { toasts, showToast } = useToasts();
 *   <ToastContainer toasts={toasts} />
 */

export function useToasts() {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback(({ message, type = 'info', duration = 3000 }) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  return { toasts, showToast };
}

export function ToastContainer({ toasts }) {
  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.type}`}>
          <span className="toast-icon">
            {t.type === 'join'  && '👋'}
            {t.type === 'leave' && '🚪'}
            {t.type === 'info'  && 'ℹ️'}
            {t.type === 'error' && '⚠️'}
          </span>
          <span className="toast-message">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
