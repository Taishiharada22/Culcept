"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { springSnappy } from "../_lib/animations";

export default function FloatingActions({
    showPhotoAdd,
    showQuickAdd,
    wardrobeCount,
    onPhotoAdd,
    onQuickAdd,
    onObservation,
}: {
    showPhotoAdd: boolean;
    showQuickAdd: boolean;
    wardrobeCount: number;
    onPhotoAdd: () => void;
    onQuickAdd: () => void;
    onObservation?: () => void;
}) {
    const [open, setOpen] = useState(false);

    if (showPhotoAdd || showQuickAdd) return null;
    if (wardrobeCount >= 50) return null;

    return (
        <>
            {/* Backdrop */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[2px]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setOpen(false)}
                    />
                )}
            </AnimatePresence>

            <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
                <AnimatePresence>
                    {open && (
                        <>
                            {/* Quick add */}
                            <motion.button
                                key="quick-add"
                                initial={{ opacity: 0, scale: 0, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0, y: 10 }}
                                transition={springSnappy}
                                onClick={() => { setOpen(false); onQuickAdd(); }}
                                className="flex h-10 items-center gap-2 rounded-full bg-white px-4 text-slate-800 shadow-lg border border-slate-200"
                                aria-label="手動で追加"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                                <span className="text-xs font-bold">手動で追加</span>
                            </motion.button>

                            {/* Photo add */}
                            <motion.button
                                key="photo-add"
                                initial={{ opacity: 0, scale: 0, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0, y: 10 }}
                                transition={{ ...springSnappy, delay: 0.05 }}
                                onClick={() => { setOpen(false); onPhotoAdd(); }}
                                className="flex h-10 items-center gap-2 rounded-full bg-white px-4 text-slate-800 shadow-lg border border-slate-200"
                                aria-label="写真で追加"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2" /></svg>
                                <span className="text-xs font-bold">写真で追加</span>
                            </motion.button>

                            {/* Observation */}
                            {onObservation && (
                                <motion.button
                                    key="observe"
                                    initial={{ opacity: 0, scale: 0, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0, y: 10 }}
                                    transition={{ ...springSnappy, delay: 0.1 }}
                                    onClick={() => { setOpen(false); onObservation(); }}
                                    className="flex h-10 items-center gap-2 rounded-full bg-white px-4 text-slate-800 shadow-lg border border-slate-200"
                                    aria-label="観測する"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" /></svg>
                                    <span className="text-xs font-bold">観測する</span>
                                </motion.button>
                            )}
                        </>
                    )}
                </AnimatePresence>

                {/* Main FAB — + rotates to × */}
                <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => setOpen((v) => !v)}
                    className="grid h-14 w-14 place-items-center rounded-full bg-slate-900 text-white shadow-xl"
                    aria-label={open ? "閉じる" : "アクションメニュー"}
                >
                    <motion.svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        animate={{ rotate: open ? 45 : 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </motion.svg>
                </motion.button>
            </div>
        </>
    );
}
