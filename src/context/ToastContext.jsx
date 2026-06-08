import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState({ message: '', visible: false, isSuccess: false });

  const showToast = useCallback((message, success = false) => {
    setToast({ message, visible: true, isSuccess: Boolean(success) });
    window.clearTimeout(ToastProvider.timer);
    ToastProvider.timer = window.setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 2800);
  }, []);

  const value = useMemo(() => ({ toast, showToast }), [toast, showToast]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
