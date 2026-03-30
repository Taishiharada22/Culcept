"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { isOnline, getPendingSyncCount, processSyncQueue } from "../_lib/offlineManager";

export default function NetworkStatusBar() {
  const [online, setOnline] = useState(() => isOnline());
  const [pendingCount, setPendingCount] = useState(() => getPendingSyncCount());
  const [syncing, setSyncing] = useState(false);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {

    const handleOnline = async () => {
      setOnline(true);
      setJustReconnected(true);
      // Auto-process queue when reconnecting
      const pending = getPendingSyncCount();
      if (pending > 0) {
        setSyncing(true);
        await processSyncQueue();
        setSyncing(false);
        setPendingCount(getPendingSyncCount());
      }
      setTimeout(() => setJustReconnected(false), 3000);
    };
    const handleOffline = () => {
      setOnline(false);
      setJustReconnected(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Periodic check
    const interval = setInterval(() => {
      setPendingCount(getPendingSyncCount());
    }, 5000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  const show = !online || syncing || justReconnected;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="overflow-hidden"
        >
          <div className={`flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium ${
            !online
              ? "bg-amber-50 text-amber-700 border-b border-amber-200/60"
              : syncing
                ? "bg-blue-50 text-blue-700 border-b border-blue-200/60"
                : "bg-emerald-50 text-emerald-700 border-b border-emerald-200/60"
          }`}>
            {!online && (
              <>
                <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                <span>オフラインモード — 変更はローカルに保存されます</span>
                {pendingCount > 0 && (
                  <span className="rounded-full bg-amber-200/60 px-2 py-0.5 text-[10px] font-bold">
                    {pendingCount}件 同期待ち
                  </span>
                )}
              </>
            )}
            {online && syncing && (
              <>
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
                <span>保存データを同期中…</span>
              </>
            )}
            {online && !syncing && justReconnected && (
              <>
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                <span>オンラインに復帰しました</span>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
