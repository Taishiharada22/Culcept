"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GlassCard, GlassButton } from "@/components/ui/glassmorphism-design";

const STORAGE_KEY = "presence_first_visit";

const STEPS = [
    {
        icon: "🪞",
        title: "Presenceへようこそ",
        body: "ここは「他者から見た、あなたの人物像」を映す鏡です。\n自分では気づかない魅力やギャップが見えてきます。",
    },
    {
        icon: "🔭",
        title: "5つの視点であなたを映す",
        body: "いまの像・深層・変化・関係・わたし。\n5つのタブが、それぞれ異なる角度からあなたを観測します。",
    },
    {
        icon: "✨",
        title: "観測するほど精度が上がる",
        body: "Stargazerで自分を観測するたびに、\nPresenceの分析が深く、正確になっていきます。",
    },
];

export default function PresenceWelcome() {
    const [show, setShow] = useState(() => {
        if (typeof window === "undefined") return false;
        try {
            return !localStorage.getItem(STORAGE_KEY);
        } catch { return false; }
    });
    const [step, setStep] = useState(0);

    const handleDismiss = useCallback(() => {
        setShow(false);
        try {
            localStorage.setItem(STORAGE_KEY, new Date().toISOString());
        } catch { /* ignore */ }
    }, []);

    const handleNext = useCallback(() => {
        if (step < STEPS.length - 1) {
            setStep((s) => s + 1);
        } else {
            handleDismiss();
        }
    }, [step, handleDismiss]);

    if (!show) return null;

    const current = STEPS[step];

    return (
        <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-6 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="w-full max-w-sm"
            >
                <GlassCard variant="elevated" padding="lg" className="text-center">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={step}
                            initial={{ opacity: 0, x: 30 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -30 }}
                            transition={{ duration: 0.2 }}
                        >
                            <div className="text-4xl">{current.icon}</div>
                            <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">
                                {current.title}
                            </h2>
                            <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600 dark:text-slate-400">
                                {current.body}
                            </p>
                        </motion.div>
                    </AnimatePresence>

                    {/* Progress dots */}
                    <div className="mt-6 flex items-center justify-center gap-2">
                        {STEPS.map((_, i) => (
                            <div
                                key={i}
                                className={`h-2 rounded-full transition-all ${
                                    i === step
                                        ? "w-6 bg-violet-500"
                                        : i < step
                                          ? "w-2 bg-violet-300"
                                          : "w-2 bg-slate-200 dark:bg-slate-600"
                                }`}
                            />
                        ))}
                    </div>

                    {/* Actions */}
                    <div className="mt-6 flex items-center justify-center gap-3">
                        <button
                            type="button"
                            onClick={handleDismiss}
                            className="text-xs font-bold text-slate-400 transition hover:text-slate-600"
                        >
                            スキップ
                        </button>
                        <GlassButton variant="primary" size="md" onClick={handleNext}>
                            {step < STEPS.length - 1 ? "次へ" : "はじめる"}
                        </GlassButton>
                    </div>
                </GlassCard>
            </motion.div>
        </motion.div>
    );
}
