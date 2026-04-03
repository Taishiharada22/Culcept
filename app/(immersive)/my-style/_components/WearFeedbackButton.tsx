"use client";

import { motion, AnimatePresence } from "framer-motion";

interface WearFeedbackButtonProps {
    accepted: boolean;
    satisfactionRecorded: boolean;
    showSatisfaction: boolean;
    onAccept: () => void;
    onSatisfaction: (rating: number) => void;
}

/**
 * 着用提案の承認 + 満足度フィードバック UI
 *
 * WeatherOutfitPanel から抽出。表示ロジックのみ担当し、
 * 状態管理は親コンポーネントに委譲する。
 */
export default function WearFeedbackButton({
    accepted,
    satisfactionRecorded,
    showSatisfaction,
    onAccept,
    onSatisfaction,
}: WearFeedbackButtonProps) {
    if (!accepted) {
        return (
            <button
                type="button"
                onClick={onAccept}
                className="w-full rounded-xl bg-slate-900 py-2.5 text-[13px] font-bold text-white transition active:scale-[0.98]"
            >
                これ着る
            </button>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200/50 py-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-emerald-600">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[12px] font-bold text-emerald-700">記録しました</span>
            </div>
            <AnimatePresence>
                {showSatisfaction && !satisfactionRecorded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="flex items-center justify-center gap-3 py-1">
                            <span className="text-[10px] text-slate-400">満足度</span>
                            {[1, 2, 3, 4, 5].map((n) => (
                                <button
                                    key={n}
                                    type="button"
                                    onClick={() => onSatisfaction(n)}
                                    className="text-lg text-slate-300 transition-colors hover:text-amber-400 active:text-amber-500"
                                >
                                    ★
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            {satisfactionRecorded && (
                <p className="text-center text-[10px] text-slate-400">フィードバック記録済み</p>
            )}
        </div>
    );
}
