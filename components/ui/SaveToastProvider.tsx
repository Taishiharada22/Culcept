"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ━━ Types ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type ToastType = "success" | "error" | "retrying";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface SaveToastContextValue {
  showSuccess: (msg: string) => void;
  showError: (msg: string) => void;
  showRetrying: (msg: string) => (() => void);
}

const SaveToastContext = createContext<SaveToastContextValue | null>(null);

// ━━ Hook ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function useSaveToast(): SaveToastContextValue {
  const ctx = useContext(SaveToastContext);
  if (!ctx) throw new Error("useSaveToast must be used within SaveToastProvider");
  return ctx;
}

// ━━ Provider ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function SaveToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const add = useCallback(
    (message: string, type: ToastType, autoMs?: number) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-4), { id, message, type }]); // max 5 toasts
      if (autoMs) {
        setTimeout(() => remove(id), autoMs);
      }
      return id;
    },
    [remove],
  );

  const showSuccess = useCallback(
    (msg: string) => { add(msg, "success", 3000); },
    [add],
  );

  const showError = useCallback(
    (msg: string) => { add(msg, "error", 5000); },
    [add],
  );

  /** retrying toast は手動 dismiss。戻り値の関数を呼ぶと消える */
  const showRetrying = useCallback(
    (msg: string) => {
      const id = add(msg, "retrying");
      return () => remove(id);
    },
    [add, remove],
  );

  return (
    <SaveToastContext.Provider value={{ showSuccess, showError, showRetrying }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={remove} />
    </SaveToastContext.Provider>
  );
}

// ━━ Toast UI ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const COLORS: Record<ToastType, string> = {
  success: "bg-emerald-500/20 border-emerald-500/30 text-emerald-200",
  error: "bg-red-500/20 border-red-500/30 text-red-200",
  retrying: "bg-amber-500/20 border-amber-500/30 text-amber-200",
};

const ICONS: Record<ToastType, string> = {
  success: "\u2713",
  error: "\u2717",
  retrying: "\u21BB",
};

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col-reverse gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className={`pointer-events-auto px-5 py-3 rounded-xl border backdrop-blur-md cursor-pointer whitespace-nowrap ${COLORS[t.type]}`}
            onClick={() => onDismiss(t.id)}
          >
            <p className="text-sm font-medium">
              <span className="mr-1.5">{ICONS[t.type]}</span>
              {t.message}
            </p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
