"use client";

import { useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PRESENCE_SCREENSHOT } from "../_lib/presenceDefaults";

export default function PresenceShareButton() {
    const [copied, setCopied] = useState(false);
    const content = PRESENCE_SCREENSHOT.hero;

    const shareText = `${content.title}\n\n「${content.archetype}」タイプ — ${content.description}\n\n#Aneurasync #Presence`;

    const handleShare = useCallback(async () => {
        // Web Share API (mobile)
        if (typeof navigator !== "undefined" && navigator.share) {
            try {
                await navigator.share({
                    title: `Presence — ${content.archetype}`,
                    text: shareText,
                    url: window.location.href,
                });
                return;
            } catch {
                // User cancelled or API not supported — fall through to clipboard
            }
        }

        // Clipboard fallback (desktop)
        try {
            await navigator.clipboard.writeText(`${shareText}\n${window.location.href}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* ignore */ }
    }, [shareText, content.archetype]);

    return (
        <button
            type="button"
            onClick={() => void handleShare()}
            className="relative flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
            aria-label="プロフィールをシェア"
        >
            <AnimatePresence mode="wait">
                {copied ? (
                    <motion.span
                        key="copied"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="text-emerald-500"
                    >
                        ✓ コピー済み
                    </motion.span>
                ) : (
                    <motion.span
                        key="share"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                    >
                        📤 シェア
                    </motion.span>
                )}
            </AnimatePresence>
        </button>
    );
}
