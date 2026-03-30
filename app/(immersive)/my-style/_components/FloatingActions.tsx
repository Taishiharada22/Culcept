"use client";
import { motion, AnimatePresence } from "framer-motion";
import { fabPulse, springSnappy } from "../_lib/animations";

export default function FloatingActions({
  showPhotoAdd,
  showQuickAdd,
  wardrobeCount,
  onPhotoAdd,
  onQuickAdd,
}: {
  showPhotoAdd: boolean;
  showQuickAdd: boolean;
  wardrobeCount: number;
  onPhotoAdd: () => void;
  onQuickAdd: () => void;
}) {
  if (showPhotoAdd || showQuickAdd) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
      <AnimatePresence>
        {wardrobeCount < 50 && (
          <motion.button
            key="photo-add-fab"
            initial={{ opacity: 0, scale: 0, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            transition={springSnappy}
            onClick={onPhotoAdd}
            className="flex h-11 items-center gap-2 rounded-full bg-indigo-600 px-4 text-white shadow-lg"
            aria-label="写真で追加"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2"/></svg>
            <span className="text-xs font-bold">写真で追加</span>
          </motion.button>
        )}
        {wardrobeCount < 50 && (
          <motion.button
            key="quick-add-fab"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, ...fabPulse.animate }}
            exit={{ opacity: 0, scale: 0 }}
            whileHover={{ scale: 1.12 }}
            whileTap={{ scale: 0.88 }}
            transition={fabPulse.transition}
            onClick={onQuickAdd}
            className="grid h-14 w-14 place-items-center rounded-full bg-slate-900 text-white shadow-xl"
            aria-label="アイテムを追加"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
