"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { SavedState } from "../_lib/types";
import type { SwipeLearningState } from "../_lib/swipeLearningAxes";
import { computeStyleDna, generateBlobPath } from "../_lib/styleDna";

type Props = {
    state: SavedState;
    swipeState: SwipeLearningState | null;
    compact?: boolean;
};

const BLOB_SIZE = 236;
const BLOB_CENTER = BLOB_SIZE / 2;
const BLOB_RADIUS = 86;

export default function StyleDnaVisualization({ state, swipeState, compact }: Props) {
    const [expanded, setExpanded] = useState(false);

    const dna = useMemo(() => computeStyleDna(state, swipeState), [state, swipeState]);

    const blobPath = useMemo(
        () => generateBlobPath(dna.points, BLOB_CENTER, BLOB_CENTER, BLOB_RADIUS),
        [dna.points],
    );

    const gradientId = "dna-gradient";

    if (compact) {
        return (
            <button
                type="button"
                onClick={() => setExpanded(true)}
                className="flex items-center gap-3 rounded-xl border border-violet-200/50 bg-white/75 px-3 py-2.5 transition hover:bg-white/90"
            >
                <svg width={40} height={40} viewBox={`0 0 ${BLOB_SIZE} ${BLOB_SIZE}`}>
                    <defs>
                        <linearGradient id={`${gradientId}-sm`} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor={dna.gradientColors[0]} />
                            <stop offset="100%" stopColor={dna.gradientColors[1]} />
                        </linearGradient>
                    </defs>
                    <path d={blobPath} fill={`url(#${gradientId}-sm)`} opacity={0.8} />
                </svg>
                <div className="text-left">
                    <p className="text-[11px] font-semibold text-slate-500">スタイルDNA</p>
                    <p className="max-w-[180px] truncate text-[12px] font-medium leading-tight text-slate-700">
                        {dna.catchphrase}
                    </p>
                </div>
            </button>
        );
    }

    return (
        <div className="relative">
            {/* Main blob */}
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="relative mx-auto block"
            >
                <svg
                    width={BLOB_SIZE}
                    height={BLOB_SIZE}
                    viewBox={`0 0 ${BLOB_SIZE} ${BLOB_SIZE}`}
                    className="mx-auto"
                >
                    <defs>
                        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor={dna.gradientColors[0]} />
                            <stop offset="100%" stopColor={dna.gradientColors[1]} />
                        </linearGradient>
                        <filter id="dna-glow">
                            <feGaussianBlur stdDeviation="6" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>

                    {/* Background glow */}
                    <motion.path
                        d={blobPath}
                        fill={`url(#${gradientId})`}
                        opacity={0.24}
                        filter="url(#dna-glow)"
                        animate={{
                            scale: [1, 1.07, 1],
                            opacity: [0.24, 0.38, 0.24],
                        }}
                        transition={{
                            duration: 5,
                            ease: "easeInOut",
                            repeat: Infinity,
                        }}
                        style={{ transformOrigin: `${BLOB_CENTER}px ${BLOB_CENTER}px` }}
                    />

                    {/* Main blob with breathing animation */}
                    <motion.path
                        d={blobPath}
                        fill={`url(#${gradientId})`}
                        opacity={0.92}
                        stroke="rgba(255,255,255,0.85)"
                        strokeWidth="2"
                        animate={{
                            scale: [1, 1.03, 0.97, 1],
                        }}
                        transition={{
                            duration: 4,
                            ease: "easeInOut",
                            repeat: Infinity,
                        }}
                        style={{ transformOrigin: `${BLOB_CENTER}px ${BLOB_CENTER}px` }}
                    />

                    {/* Center text */}
                    <text
                        x={BLOB_CENTER}
                        y={BLOB_CENTER - 6}
                        textAnchor="middle"
                        fill="white"
                        fontSize="14"
                        fontWeight="800"
                        opacity={0.98}
                    >
                        スタイルDNA
                    </text>
                    <text
                        x={BLOB_CENTER}
                        y={BLOB_CENTER + 14}
                        textAnchor="middle"
                        fill="white"
                        fontSize="10"
                        fontWeight="700"
                        opacity={0.88}
                    >
                        {Math.round(dna.overallIntensity * 100)}%
                    </text>

                    {/* Dimension labels around the blob */}
                    {dna.points.map((p, i) => {
                        const labelRadius = BLOB_RADIUS + 24;
                        const lx = BLOB_CENTER + Math.cos(p.angle - Math.PI / 2) * labelRadius;
                        const ly = BLOB_CENTER + Math.sin(p.angle - Math.PI / 2) * labelRadius;
                        if (i % 2 !== 0) return null; // show every other label to avoid crowding
                        return (
                            <text
                                key={p.label}
                                x={lx}
                                y={ly}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fill="#475569"
                                fontSize="7"
                                fontWeight="700"
                            >
                                {p.label.split("↔")[0]}
                            </text>
                        );
                    })}
                </svg>
            </button>

            {/* Catchphrase */}
            <motion.p
                className="mt-2.5 text-center text-[13px] font-semibold leading-relaxed text-slate-700"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
            >
                「{dna.catchphrase}」
            </motion.p>

            {/* Trait badges */}
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                {dna.dominantTraits.map((trait) => (
                    <span
                        key={trait}
                        className="rounded-full border border-slate-300/70 bg-white/85 px-2.5 py-1 text-[11px] font-medium text-slate-700"
                    >
                        {trait}
                    </span>
                ))}
            </div>

            {/* Expanded detail view */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-4 overflow-hidden"
                    >
                        <div className="space-y-3 rounded-xl border border-violet-200/50 bg-white/80 p-4">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-violet-500">
                                DNA 詳細
                            </p>
                            <div className="space-y-2">
                                {dna.points.map((p) => (
                                    <div key={p.label} className="flex items-center gap-2">
                                        <span className="w-24 shrink-0 truncate text-[11px] font-medium text-slate-600">
                                            {p.label}
                                        </span>
                                        <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                                            <div className="absolute inset-0 flex">
                                                <div className="w-1/2" />
                                                <div className="w-px bg-slate-300" />
                                                <div className="w-1/2" />
                                            </div>
                                            <motion.div
                                                className="absolute top-0 h-full rounded-full"
                                                style={{
                                                    backgroundColor: dna.gradientColors[0],
                                                    left: p.value >= 0 ? "50%" : `${50 + p.value * 50}%`,
                                                    width: `${Math.abs(p.value) * 50}%`,
                                                }}
                                                initial={{ width: 0 }}
                                                animate={{ width: `${Math.abs(p.value) * 50}%` }}
                                                transition={{ duration: 0.5, delay: 0.1 }}
                                            />
                                        </div>
                                        <span className="w-8 text-right font-mono text-[11px] font-semibold text-slate-500">
                                            {p.value > 0 ? "+" : ""}
                                            {(p.value * 100).toFixed(0)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
