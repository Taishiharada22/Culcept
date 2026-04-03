"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/glassmorphism-design";
import type { SavedState } from "../_lib/types";
import {
    mineStyleLogic,
    type StyleRule,
    type StyleRuleType,
    type DataQuality,
} from "../_lib/styleLogicMiner";
import type { WornRecord } from "@/app/calendar/_lib/types";
import { loadAllWearEvents } from "@/lib/shared/wearEvents";
const CONFIRMATIONS_KEY = "culcept_style_logic_confirmations_v1";

const TYPE_ICONS: Record<StyleRuleType, string> = {
    combo: "🤝",
    color: "🎨",
    silhouette: "📐",
    formality: "👔",
    rotation: "🔄",
    weather: "⛅",
    dayOfWeek: "📅",
    avoidance: "🚫",
    season: "🍂",
};

const TYPE_LABELS: Record<StyleRuleType, string> = {
    combo: "鉄板コンビ",
    color: "色のクセ",
    silhouette: "見え方の型",
    formality: "きちんと度",
    rotation: "着回しリズム",
    weather: "天気と気分",
    dayOfWeek: "曜日のギア",
    avoidance: "無意識の壁",
    season: "季節の切替",
};

const TYPE_COLORS: Record<StyleRuleType, { border: string; bg: string; bar: string; badge: string; leftBorder: string }> = {
    combo: {
        border: "border-indigo-200/60",
        bg: "from-indigo-50/40 to-white/80",
        bar: "from-indigo-400 to-indigo-500",
        badge: "bg-indigo-100/70 text-indigo-700",
        leftBorder: "border-l-indigo-400",
    },
    color: {
        border: "border-rose-200/60",
        bg: "from-rose-50/40 to-white/80",
        bar: "from-rose-400 to-rose-500",
        badge: "bg-rose-100/70 text-rose-700",
        leftBorder: "border-l-rose-400",
    },
    silhouette: {
        border: "border-violet-200/60",
        bg: "from-violet-50/40 to-white/80",
        bar: "from-violet-400 to-violet-500",
        badge: "bg-violet-100/70 text-violet-700",
        leftBorder: "border-l-violet-400",
    },
    formality: {
        border: "border-slate-200/60",
        bg: "from-slate-50/40 to-white/80",
        bar: "from-slate-400 to-slate-500",
        badge: "bg-slate-100/70 text-slate-700",
        leftBorder: "border-l-slate-400",
    },
    rotation: {
        border: "border-emerald-200/60",
        bg: "from-emerald-50/40 to-white/80",
        bar: "from-emerald-400 to-emerald-500",
        badge: "bg-emerald-100/70 text-emerald-700",
        leftBorder: "border-l-emerald-400",
    },
    weather: {
        border: "border-sky-200/60",
        bg: "from-sky-50/40 to-white/80",
        bar: "from-sky-400 to-sky-500",
        badge: "bg-sky-100/70 text-sky-700",
        leftBorder: "border-l-sky-400",
    },
    dayOfWeek: {
        border: "border-orange-200/60",
        bg: "from-orange-50/40 to-white/80",
        bar: "from-orange-400 to-orange-500",
        badge: "bg-orange-100/70 text-orange-700",
        leftBorder: "border-l-orange-400",
    },
    avoidance: {
        border: "border-amber-200/60",
        bg: "from-amber-50/40 to-white/80",
        bar: "from-amber-400 to-amber-500",
        badge: "bg-amber-100/70 text-amber-700",
        leftBorder: "border-l-amber-400",
    },
    season: {
        border: "border-sky-200/60",
        bg: "from-sky-50/40 to-white/80",
        bar: "from-sky-400 to-sky-500",
        badge: "bg-sky-100/70 text-sky-700",
        leftBorder: "border-l-sky-400",
    },
};

const QUALITY_CONFIG: Record<DataQuality, { label: string; color: string; description: string }> = {
    insufficient: {
        label: "観測中",
        color: "bg-slate-100 text-slate-500 border border-slate-200",
        description: "最初のルール発見まで、あと少し。",
    },
    emerging: {
        label: "傾向あり",
        color: "bg-amber-100 text-amber-700 border border-amber-200",
        description: "パターンが見え始めてる。コーデを増やすほど精度が上がります",
    },
    reliable: {
        label: "確信あり",
        color: "bg-emerald-100 text-emerald-700 border border-emerald-200",
        description: "十分なデータから、あなただけの法則が浮かび上がっています",
    },
};

/* ── Sub-components ── */

function confidenceLabel(confidence: number): string {
    const pct = Math.round(confidence * 100);
    if (pct >= 90) return "確信度: ほぼ確実";
    if (pct >= 70) return "確信度: かなり高い";
    return "確信度: 傾向あり";
}

function ConfidenceBar({
    confidence,
    gradient,
}: {
    confidence: number;
    gradient: string;
}) {
    return (
        <div className="space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <motion.div
                    className={`h-full rounded-full bg-gradient-to-r ${gradient}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round(confidence * 100)}%` }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                />
            </div>
            <p className="text-[10px] text-slate-400">{confidenceLabel(confidence)}</p>
        </div>
    );
}

function RuleCard({
    rule,
    index,
    onConfirm,
    onDeny,
}: {
    rule: StyleRule;
    index: number;
    onConfirm: (id: string) => void;
    onDeny: (id: string) => void;
}) {
    const colors = TYPE_COLORS[rule.type];
    const icon = TYPE_ICONS[rule.type];
    const typeLabel = TYPE_LABELS[rule.type];

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: index * 0.08, ease: "easeOut" }}
            className={`overflow-hidden rounded-2xl border ${colors.border} border-l-[3px] ${colors.leftBorder} bg-gradient-to-br ${colors.bg} shadow-sm`}
        >
            <div className="p-4">
                {/* Header row */}
                <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <span className="mt-0.5 text-xl leading-none">{icon}</span>
                        <div className="flex-1 min-w-0">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${colors.badge} mb-1.5`}>
                                {typeLabel}
                            </span>
                            <p className="text-[13px] font-semibold leading-snug text-slate-800">
                                {rule.description}
                            </p>
                        </div>
                    </div>

                    {/* Confidence percentage */}
                    <span className="shrink-0 text-right">
                        <span className="block text-[13px] font-black text-slate-600">
                            {Math.round(rule.confidence * 100)}%
                        </span>
                    </span>
                </div>

                {/* Confidence bar */}
                <ConfidenceBar confidence={rule.confidence} gradient={colors.bar} />

                {/* Evidence */}
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    {rule.evidence}
                </p>

                {/* Confirmation buttons */}
                <div className="mt-3 flex gap-2">
                    {rule.userConfirmed === true ? (
                        <div className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-100/80 py-2 text-[12px] font-bold text-emerald-700">
                            <span>✓</span> あなたが認めたルール
                        </div>
                    ) : rule.userConfirmed === false ? (
                        <div className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-100/80 py-2 text-[12px] font-bold text-slate-500">
                            参考にします
                        </div>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => onConfirm(rule.id)}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-200/70 bg-white/70 py-2 text-[12px] font-semibold text-emerald-700 transition hover:bg-emerald-50/60 active:scale-95"
                            >
                                <span>👍</span> たしかに！
                            </button>
                            <button
                                type="button"
                                onClick={() => onDeny(rule.id)}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200/70 bg-white/70 py-2 text-[12px] font-semibold text-slate-500 transition hover:bg-slate-50/60 active:scale-95"
                            >
                                <span>🤔</span> 違うかも
                            </button>
                        </>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

/* ── Main Component ── */

export default function StyleLogicPanel({ state }: { state: SavedState }) {
    const [wornRecords, setWornRecords] = useState<WornRecord[]>([]);
    const [confirmations, setConfirmations] = useState<Record<string, boolean | null>>({});
    const [mounted, setMounted] = useState(false);

    // Load worn history and confirmations from localStorage on mount
    useEffect(() => {
        /* eslint-disable react-hooks/set-state-in-effect -- mount-time hydration from localStorage */
        setMounted(true);
        // Read worn records via shared wearEvents layer (not direct localStorage)
        const events = loadAllWearEvents();
        setWornRecords(events.map((e) => ({
            date: e.date,
            itemIds: e.itemIds,
            satisfaction: (e.satisfaction ?? 3) as WornRecord["satisfaction"],
            note: e.note,
        })));
        try {
            const raw = localStorage.getItem(CONFIRMATIONS_KEY);
            if (raw) {
                setConfirmations(JSON.parse(raw) as Record<string, boolean | null>);
            }
        } catch {
            // ignore
        }
        /* eslint-enable react-hooks/set-state-in-effect */
    }, []);

    // Mine style logic
    const profile = useMemo(
        () => mineStyleLogic(state, wornRecords),
        [state, wornRecords],
    );

    // Merge userConfirmed from stored confirmations
    const rules: StyleRule[] = useMemo(
        () =>
            profile.rules.map((r) => ({
                ...r,
                userConfirmed: confirmations[r.id] ?? null,
            })),
        [profile.rules, confirmations],
    );

    const handleConfirm = (id: string) => {
        const updated = { ...confirmations, [id]: true };
        setConfirmations(updated);
        try {
            localStorage.setItem(CONFIRMATIONS_KEY, JSON.stringify(updated));
        } catch {
            // ignore
        }
    };

    const handleDeny = (id: string) => {
        const updated = { ...confirmations, [id]: false };
        setConfirmations(updated);
        try {
            localStorage.setItem(CONFIRMATIONS_KEY, JSON.stringify(updated));
        } catch {
            // ignore
        }
    };

    const qualityCfg = QUALITY_CONFIG[profile.dataQuality];
    const confirmedCount = rules.filter((r) => r.userConfirmed === true).length;
    const deniedCount = rules.filter((r) => r.userConfirmed === false).length;

    if (!mounted) return null;

    return (
        <div className="space-y-4">
            {/* Header */}
            <GlassCard className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-xl">🧬</span>
                            <h3 className="text-[15px] font-black tracking-tight text-slate-800">
                                あなたの着こなしDNA
                            </h3>
                        </div>
                        <p className="text-[12px] leading-relaxed text-slate-500">
                            データから浮かび上がった、無意識のスタイルルール
                        </p>
                    </div>

                    {/* Data quality badge */}
                    <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${qualityCfg.color}`}>
                        {qualityCfg.label}
                    </span>
                </div>

                {/* Discovery counter + Stats row */}
                {profile.dataQuality !== "insufficient" && (
                    <>
                        {confirmedCount > 0 && (
                            <div className="mt-3 flex items-center gap-1.5 text-[12px] font-bold text-emerald-600">
                                <span>🔍</span> {confirmedCount}個のルールを発見済み
                            </div>
                        )}
                        <div className="mt-3 flex flex-wrap gap-3 border-t border-slate-100/80 pt-3">
                            <div className="text-center">
                                <div className="text-[18px] font-black text-slate-800">{rules.length}</div>
                                <div className="text-[10px] text-slate-500">見つかった法則</div>
                            </div>
                            <div className="text-center">
                                <div className="text-[18px] font-black text-emerald-600">{confirmedCount}</div>
                                <div className="text-[10px] text-slate-500">認めたルール</div>
                            </div>
                            <div className="text-center">
                                <div className="text-[18px] font-black text-slate-400">{deniedCount}</div>
                                <div className="text-[10px] text-slate-500">違ったもの</div>
                            </div>
                            <div className="text-center">
                                <div className="text-[18px] font-black text-slate-700">{profile.totalOutfitsAnalyzed}</div>
                                <div className="text-[10px] text-slate-500">分析コーデ数</div>
                            </div>
                        </div>
                    </>
                )}

                <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                    {qualityCfg.description}
                </p>
            </GlassCard>

            {/* Insufficient data state */}
            {profile.dataQuality === "insufficient" && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-dashed border-slate-200/80 bg-white/50 p-6 text-center"
                >
                    <div className="text-4xl mb-3">🔭</div>
                    <p className="text-[14px] font-bold text-slate-700 mb-1">
                        まだ観測中…
                    </p>
                    <p className="text-[12px] text-slate-500 leading-relaxed">
                        コーデを{Math.max(0, 3 - state.setups.length)}つ追加すると、<br />
                        あなただけの法則が見え始めます
                    </p>
                    <p className="mt-2 text-[11px] text-violet-500 font-medium">
                        最初のルール発見まで、あと少し。
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-slate-200" />
                        <div className="h-2 rounded-full bg-slate-200 overflow-hidden" style={{ width: "80px" }}>
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-violet-400 to-purple-500 transition-all duration-700"
                                style={{ width: `${Math.min((state.setups.length / 3) * 100, 100)}%` }}
                            />
                        </div>
                        <span className="text-[11px] font-semibold text-slate-500">
                            {state.setups.length}/3 コーデ
                        </span>
                    </div>
                </motion.div>
            )}

            {/* Rules list */}
            {profile.dataQuality !== "insufficient" && rules.length === 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="rounded-2xl border border-dashed border-slate-200/80 bg-white/50 p-6 text-center"
                >
                    <div className="text-3xl mb-2">🌱</div>
                    <p className="text-[13px] font-bold text-slate-600 mb-1">法則の芽を探してる…</p>
                    <p className="text-[11px] text-slate-500">
                        アイテムにシルエット・TPO・カラーを登録すると、あなたの無意識のパターンが浮かび上がります
                    </p>
                </motion.div>
            )}

            {profile.dataQuality !== "insufficient" && rules.length > 0 && (
                <AnimatePresence>
                    <div className="space-y-3">
                        {rules.map((rule, i) => (
                            <RuleCard
                                key={rule.id}
                                rule={rule}
                                index={i}
                                onConfirm={handleConfirm}
                                onDeny={handleDeny}
                            />
                        ))}
                    </div>
                </AnimatePresence>
            )}

            {/* Footer note */}
            {rules.length > 0 && (
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: rules.length * 0.08 + 0.2 }}
                    className="text-center text-[10px] text-slate-400 px-4 leading-relaxed"
                >
                    「たしかに！」「違うかも」の反応で、あなたの着こなしDNAがもっと正確になります
                </motion.p>
            )}
        </div>
    );
}
