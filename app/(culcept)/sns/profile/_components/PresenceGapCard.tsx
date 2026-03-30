"use client";

import { motion } from "framer-motion";
import { PresenceCard, SectionHeading, GapRing, OneWordCard } from "./Primitives";
import { EASE_OUT_EXPO } from "../_lib/presenceConstants";
import { PRESENCE_SCREENSHOT } from "../_lib/presenceDefaults";

interface SelfGapDimension {
    axis: string;
    normal: number;
    stressed: number;
    delta: number;
}

interface PresenceGapCardProps {
    selfGap?: SelfGapDimension[] | null;
}

export default function PresenceGapCard({ selfGap }: PresenceGapCardProps) {
    const gap = PRESENCE_SCREENSHOT.gap;

    // Dynamic gap percentage from selfGap data
    const dynamicPercent = selfGap && selfGap.length > 0
        ? Math.round(selfGap.reduce((sum, d) => sum + Math.abs(d.delta), 0) / selfGap.length * 100)
        : null;
    const percentNum = dynamicPercent ?? gap.percentNum;
    const percentStr = dynamicPercent ? `${dynamicPercent}%` : gap.percent;

    return (
        <PresenceCard padding="lg" data-testid="presence-gap-card">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.1),transparent_50%),radial-gradient(circle_at_bottom_left,rgba(139,92,246,0.08),transparent_50%)] dark:opacity-30" />
            <div className="relative">
                <SectionHeading
                    title="自分と周りのズレ"
                    subtitle="あなたが思う自分と、周りから見えるあなた"
                    gradient
                />

                {/* Self vs Others split */}
                <div className="grid items-stretch gap-4 md:grid-cols-[1fr_auto_1fr]">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5, delay: 0.1, ease: EASE_OUT_EXPO }}
                        className="flex flex-col rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/80 to-violet-50/60 p-4 dark:border-indigo-700/50 dark:from-indigo-950/40 dark:to-violet-950/30"
                    >
                        <div className="mb-3 flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400">
                                内
                            </div>
                            <span className="text-xs font-bold uppercase tracking-[0.15em] text-indigo-500">
                                自分が思う自分
                            </span>
                        </div>
                        <p className="flex-1 text-sm font-semibold leading-8 text-slate-800 dark:text-slate-200">
                            {gap.selfImage}
                        </p>
                    </motion.div>

                    {/* VS divider */}
                    <div className="flex items-center justify-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-rose-100 text-sm font-bold text-amber-600 shadow-sm md:h-14 md:w-14 dark:from-amber-900/60 dark:to-rose-900/60">
                            VS
                        </div>
                    </div>

                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5, delay: 0.2, ease: EASE_OUT_EXPO }}
                        className="flex flex-col rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/80 to-fuchsia-50/60 p-4 dark:border-violet-700/50 dark:from-violet-950/40 dark:to-fuchsia-950/30"
                    >
                        <div className="mb-3 flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-600 dark:bg-violet-900 dark:text-violet-400">
                                外
                            </div>
                            <span className="text-xs font-bold uppercase tracking-[0.15em] text-violet-500">
                                他者から見た自分
                            </span>
                        </div>
                        <p className="flex-1 text-sm font-semibold leading-8 text-slate-800 dark:text-slate-200">
                            {gap.othersImage}
                        </p>
                    </motion.div>
                </div>

                {/* Gap meter */}
                <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:gap-8">
                    <GapRing percent={percentNum} />
                    <div className="flex-1 text-center sm:text-left">
                        <div className="mb-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                            ギャップ度 {percentStr}
                        </div>
                        <p className="text-sm leading-8 text-slate-600 dark:text-slate-400">
                            {gap.description}
                        </p>
                        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                            {percentNum < 40
                                ? "平均は50〜60%。あなたは自己認識が正確な方です"
                                : percentNum < 65
                                  ? "平均は50〜60%。ほどよいズレがあります"
                                  : "平均は50〜60%。周りの目と自分の認識に大きな差があります"}
                        </p>
                    </div>
                </div>

                <OneWordCard text={gap.oneWord} />
            </div>
        </PresenceCard>
    );
}
