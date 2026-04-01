"use client";

import { useMemo, useState, type ReactNode, type SetStateAction } from "react";
import FlatLayComposer from "./FlatLayComposer";
import {
    SETUP_MOOD_OPTIONS,
    getSetupMoodLabel,
    getStyleLaneMeta,
} from "../_lib/catalog";
import { deriveMyStyleSignals } from "../_lib/state";
import type {
    SavedSetup,
    SavedState,
    SetupMoodCode,
    WardrobeItem,
} from "../_lib/types";

/* ─────────────────────── utils ─────────────────────── */

function cx(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(" ");
}

function uniqueList(values: string[]) {
    return Array.from(new Set(values.filter(Boolean)));
}

function formatDateLabel(value: string | null | undefined) {
    if (!value) return "未保存";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "未保存";
    return date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

const CATEGORY_LABELS: Record<WardrobeItem["category"], string> = {
    outerwear: "アウター", tops: "トップス", bottoms: "ボトムス",
    shoes: "靴", accessories: "アクセサリー", hat: "帽子", other: "その他",
};

function groupWardrobeByCategory(items: WardrobeItem[]) {
    const grouped: Record<WardrobeItem["category"], WardrobeItem[]> = {
        outerwear: [], tops: [], bottoms: [], shoes: [], accessories: [], hat: [], other: [],
    };
    items.forEach((item) => grouped[item.category].push(item));
    return grouped;
}

function buildSetupLaneHints(setup: SavedSetup, items: WardrobeItem[]) {
    const used = setup.itemIds.map((id) => items.find((item) => item.id === id)).filter((item): item is WardrobeItem => Boolean(item));
    const labels = uniqueList(
        used.flatMap((item) => {
            const laneLabels: string[] = [];
            if (["black", "white", "navy", "charcoal"].includes(item.color)) laneLabels.push("クリーン", "ミニマル");
            if (item.formality === "smart" || item.formality === "dress") laneLabels.push("エレガント", "クラシック");
            if ((item.materialFamily ?? []).includes("material.denim")) laneLabels.push("アメカジ", "ワークウェア");
            if ((item.materialFamily ?? []).includes("material.tech_nylon")) laneLabels.push("テックウェア", "スポーティ");
            return laneLabels;
        })
    );
    return labels.slice(0, 3);
}

function deriveSuggestedSetupTitle(moodTags: SetupMoodCode[], becomeLabel: string | null) {
    const moodLabel = moodTags[0] ? getSetupMoodLabel(moodTags[0]) : "";
    if (becomeLabel) return `${becomeLabel} を試す組み方`;
    if (moodLabel) return `${moodLabel} 日のセット`;
    return "いまの自分を整えるセット";
}

function deriveSetupDirection(analysis: { laneHints: string[]; impressionHints: string[] }, moodTags: SetupMoodCode[], focusedBecome: string | null) {
    if (focusedBecome) return `「${focusedBecome}」に寄せる組み方`;
    if (analysis.impressionHints[0] && analysis.impressionHints[1]) return `「${analysis.impressionHints[0]}」を残しつつ「${analysis.impressionHints[1]}」へ`;
    if (analysis.laneHints[0]) return `「${analysis.laneHints[0]}」の空気感`;
    if (moodTags[0]) return `${getSetupMoodLabel(moodTags[0])} を優先した組み方`;
    return "自然体と整いのバランスを探索中";
}

/* ─────────────────────── local primitives ─────────────────────── */

function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "ink" | "sky" | "emerald" | "amber" }) {
    const tones = {
        slate: "border-slate-200 bg-slate-50 text-slate-600",
        ink: "border-slate-800 bg-slate-900 text-white",
        sky: "border-sky-200 bg-sky-50 text-sky-700",
        emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
        amber: "border-amber-200 bg-amber-50 text-amber-700",
    };
    return <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide", tones[tone])}>{children}</span>;
}

function Chip({ label, active, onClick, tone = "default" }: { label: string; active?: boolean; onClick: () => void; tone?: "default" | "sky" | "amber" | "rose" }) {
    const styles = {
        default: active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
        sky: active ? "border-sky-600 bg-sky-600 text-white" : "border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300",
        amber: active ? "border-amber-600 bg-amber-600 text-white" : "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300",
        rose: active ? "border-rose-600 bg-rose-600 text-white" : "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300",
    };
    return (
        <button type="button" onClick={onClick} className={cx("rounded-full border px-3 py-1.5 text-xs font-bold transition-all", styles[tone])}>
            {label}
        </button>
    );
}

function ImageSurface({ image, label, gradient, ratio = "aspect-[4/5]" }: { image?: string; label: string; gradient: string; ratio?: string }) {
    return (
        <div className={cx("overflow-hidden rounded-xl", ratio)}>
            {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt={label} className="h-full w-full object-cover" />
            ) : (
                <div className={cx("relative flex h-full w-full items-end overflow-hidden bg-gradient-to-br p-2 text-white", gradient)}>
                    <div className="text-[11px] font-bold leading-tight">{label}</div>
                </div>
            )}
        </div>
    );
}

/* ─────────────────────── SetupsTab ─────────────────────── */

export default function SetupsTab({
    state, setState, pushNotice, selectedItemIds, setSelectedItemIds, showBuilder, setShowBuilder,
}: {
    state: SavedState;
    setState: (updater: SetStateAction<SavedState>) => void;
    pushNotice: (text: string) => void;
    selectedItemIds: string[];
    setSelectedItemIds: React.Dispatch<React.SetStateAction<string[]>>;
    showBuilder: boolean;
    setShowBuilder: React.Dispatch<React.SetStateAction<boolean>>;
}) {
    const derived = useMemo(() => deriveMyStyleSignals(state), [state]);
    const grouped = useMemo(() => groupWardrobeByCategory(state.wardrobe), [state.wardrobe]);
    const [title, setTitle] = useState("");
    const [moodTags, setMoodTags] = useState<SetupMoodCode[]>([]);
    const [impressionTags, setImpressionTags] = useState<string[]>([]);
    const [memoryNote, setMemoryNote] = useState("");
    const [moodFilter, setMoodFilter] = useState<SetupMoodCode | "all">("all");
    const [focusedMood, setFocusedMood] = useState<SetupMoodCode | null>(null);
    const [focusedBecome, setFocusedBecome] = useState<string | null>(null);
    const [showFlatLay, setShowFlatLay] = useState(false);

    const selectedItems = useMemo(
        () => selectedItemIds.map((id) => state.wardrobe.find((item) => item.id === id)).filter((item): item is WardrobeItem => Boolean(item)),
        [selectedItemIds, state.wardrobe]
    );

    const suggestedSetups = useMemo(() => {
        const byMood = focusedMood ? state.setups.filter((setup) => setup.moodTags.includes(focusedMood)) : state.setups.slice(0, 3);
        if (byMood.length > 0) return byMood.slice(0, 3);
        const topItems = derived.selfFormingItems.slice(0, 4).map((entry) => state.wardrobe.find((item) => item.id === entry.itemId)).filter((item): item is WardrobeItem => Boolean(item));
        const suggestionIds = uniqueList(["tops", "bottoms", "shoes", "outerwear"].map((c) => topItems.find((i) => i.category === c)?.id ?? "").filter(Boolean));
        if (suggestionIds.length < 2) return [];
        return [{
            id: "draft", title: deriveSuggestedSetupTitle(focusedMood ? [focusedMood] : moodTags, focusedBecome),
            itemIds: suggestionIds, moodTags: focusedMood ? [focusedMood] : [], impressionTags: focusedBecome ? [focusedBecome] : [],
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        } satisfies SavedSetup];
    }, [derived.selfFormingItems, focusedBecome, focusedMood, moodTags, state.setups, state.wardrobe]);

    const filteredSetups = useMemo(
        () => (moodFilter === "all" ? state.setups : state.setups.filter((s) => s.moodTags.includes(moodFilter))),
        [moodFilter, state.setups]
    );

    const analysis = useMemo(() => {
        const laneHints = uniqueList(selectedItems.flatMap((item) => {
            const hints: string[] = [];
            if (["black", "white", "navy", "charcoal"].includes(item.color)) hints.push("クリーン", "ミニマル");
            if (item.formality === "smart" || item.formality === "dress") hints.push("エレガント", "クラシック");
            if ((item.materialFamily ?? []).includes("material.denim")) hints.push("アメカジ", "ワークウェア");
            if ((item.materialFamily ?? []).includes("material.tech_nylon")) hints.push("テックウェア");
            return hints;
        })).slice(0, 3);
        const impressionHints = uniqueList([
            ...impressionTags,
            ...selectedItems.flatMap((item) => {
                const hints: string[] = [];
                if (item.formality === "smart" || item.formality === "dress") hints.push("清潔感", "上品さ");
                if (item.formality === "casual") hints.push("自然体");
                if (["black", "navy", "charcoal"].includes(item.color)) hints.push("落ち着き");
                return hints;
            }),
        ]).slice(0, 3);
        return { laneHints, impressionHints };
    }, [impressionTags, selectedItems]);

    const toggleItem = (itemId: string) => setSelectedItemIds((c) => c.includes(itemId) ? c.filter((id) => id !== itemId) : [...c, itemId]);
    const toggleMoodTag = (mood: SetupMoodCode) => setMoodTags((c) => c.includes(mood) ? c.filter((e) => e !== mood) : [...c, mood]);

    const applySuggestedSetup = (setup: SavedSetup) => {
        setTitle(setup.title); setSelectedItemIds(setup.itemIds); setMoodTags(setup.moodTags);
        setImpressionTags(setup.impressionTags); setMemoryNote(setup.memory?.note ?? ""); setShowBuilder(true);
    };

    const saveSetup = () => {
        if (selectedItems.length < 2) { pushNotice("2 アイテム以上選んでください"); return; }
        const now = new Date().toISOString();
        const nextSetup: SavedSetup = {
            id: `setup_${Date.now().toString(36)}`, title: title.trim() || deriveSuggestedSetupTitle(moodTags, focusedBecome),
            itemIds: selectedItems.map((i) => i.id), moodTags, impressionTags,
            memory: memoryNote.trim() || moodTags.length > 0 ? { note: memoryNote.trim(), moodTags, createdAt: now } : undefined,
            createdAt: now, updatedAt: now,
        };
        setState((prev) => ({ ...prev, setups: [nextSetup, ...prev.setups] }));
        setTitle(""); setSelectedItemIds([]); setMoodTags([]); setImpressionTags([]); setMemoryNote(""); setShowBuilder(false);
        pushNotice("セットアップを保存しました");
    };

    return (
        <div className="space-y-3">
            {/* Setup Studio — compact 1-line heading */}
            <section className="rounded-xl bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[14px] font-black text-slate-900">どう見せたいかを試す</h3>
                    <button type="button" onClick={() => setShowBuilder(true)} className="rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white">+ 組む</button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {SETUP_MOOD_OPTIONS.map((o) => (
                        <Chip key={o.id} label={o.label} active={focusedMood === o.id} onClick={() => setFocusedMood((c) => c === o.id ? null : o.id)} />
                    ))}
                </div>
                {derived.repeatedBecomeResults.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {derived.repeatedBecomeResults.map((l) => (
                            <Chip key={l} label={l} active={focusedBecome === l} onClick={() => setFocusedBecome((c) => c === l ? null : l)} tone="amber" />
                        ))}
                    </div>
                )}
                {suggestedSetups.length > 0 && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        {suggestedSetups.map((setup) => {
                            const items = setup.itemIds.map((id) => state.wardrobe.find((item) => item.id === id)).filter((item): item is WardrobeItem => Boolean(item)).slice(0, 3);
                            return (
                                <button key={setup.id} type="button" onClick={() => applySuggestedSetup(setup)}
                                    className="group overflow-hidden rounded-xl border border-slate-200/60 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                                    <div className="grid grid-cols-3 gap-0.5 bg-slate-50/80 p-1.5">
                                        {items.length > 0 ? items.map((item) => (
                                            <div key={item.id} className="overflow-hidden rounded-lg">
                                                <ImageSurface image={item.imageUrl} label={item.name} gradient="from-indigo-500 to-slate-900" ratio="aspect-square" />
                                            </div>
                                        )) : (
                                            Array.from({ length: 3 }).map((_, index) => (
                                                <div key={index} className="rounded-lg bg-slate-100 p-2 aspect-square" />
                                            ))
                                        )}
                                    </div>
                                    <div className="px-2.5 py-2">
                                        <div className="text-[12px] font-bold text-slate-800">{setup.title}</div>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                            {setup.moodTags.slice(0, 2).map((tag) => <Badge key={tag} tone="sky">{getSetupMoodLabel(tag)}</Badge>)}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Flat Lay toggle */}
            <div className="flex items-center gap-2">
                <button type="button" onClick={() => setShowFlatLay(!showFlatLay)}
                    className={cx("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition",
                        showFlatLay ? "bg-violet-500 text-white shadow-md" : "bg-white text-slate-600 border border-slate-200 hover:bg-violet-50")}>
                    <span>🪞</span> フラットレイ
                </button>
            </div>
            {showFlatLay && (
                <section className="rounded-xl border border-violet-200/40 bg-violet-50/30 p-3">
                    <FlatLayComposer items={state.wardrobe} />
                </section>
            )}

            {/* Setup tray (selected items) */}
            {selectedItems.length > 0 && (
                <section className="rounded-xl bg-white p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-bold text-slate-800">編集中 ({selectedItems.length})</span>
                        <button type="button" onClick={() => setShowBuilder(true)} className="rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white">このまま組む</button>
                    </div>
                    <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                        {selectedItems.map((item) => (
                            <div key={item.id} className="flex w-28 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-1.5">
                                <div className="w-8 shrink-0 overflow-hidden rounded-lg">
                                    <ImageSurface image={item.imageUrl} label={item.name} gradient="from-indigo-500 to-slate-900" ratio="aspect-square" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-[10px] font-bold text-slate-800">{item.name}</div>
                                    <button type="button" onClick={() => toggleItem(item.id)} className="text-[9px] text-slate-400 hover:text-red-400">外す</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Builder */}
            {showBuilder && (
                <section className="rounded-xl bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="text-[13px] font-bold text-slate-900">セットアップを組む</h3>
                        <button type="button" onClick={() => setShowBuilder(false)} className="text-[11px] text-slate-400 hover:text-slate-600">閉じる</button>
                    </div>

                    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="セットアップ名（省略可）"
                        className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-[12px] text-slate-700 outline-none focus:border-slate-400" />

                    <div className="mt-3 space-y-2">
                        {(Object.entries(grouped) as [WardrobeItem["category"], WardrobeItem[]][]).map(([cat, items]) => {
                            if (items.length === 0) return null;
                            return (
                                <div key={cat}>
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{CATEGORY_LABELS[cat]}</div>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                        {items.map((item) => (
                                            <Chip key={item.id} label={item.name} active={selectedItemIds.includes(item.id)} onClick={() => toggleItem(item.id)} />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {selectedItems.length > 0 && (
                        <div className="mt-3 rounded-lg border border-slate-200/60 bg-slate-50/50 p-2.5">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">方向</span>
                                <span className="text-[12px] font-bold text-slate-600">{deriveSetupDirection(analysis, moodTags, focusedBecome)}</span>
                            </div>
                            {analysis.laneHints.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1">{analysis.laneHints.map((l) => <Badge key={l}>{l}</Badge>)}</div>
                            )}
                        </div>
                    )}

                    <div className="mt-3">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">気分</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                            {SETUP_MOOD_OPTIONS.map((o) => <Chip key={o.id} label={o.label} active={moodTags.includes(o.id)} onClick={() => toggleMoodTag(o.id)} />)}
                        </div>
                    </div>

                    <textarea value={memoryNote} onChange={(e) => setMemoryNote(e.target.value)} placeholder="メモ（省略可）"
                        className="mt-3 min-h-[60px] w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-[12px] leading-relaxed text-slate-700 outline-none focus:border-slate-400" />

                    <button type="button" onClick={saveSetup}
                        className="mt-3 w-full rounded-lg bg-slate-900 py-2.5 text-[12px] font-bold text-white transition hover:bg-slate-800">
                        保存する
                    </button>
                </section>
            )}

            {/* Saved setups — compact */}
            <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[13px] font-bold text-slate-800">保存済み <Badge tone="sky">{state.setups.length}</Badge></h3>
                    <div className="flex flex-wrap gap-1">
                        <Chip label="すべて" active={moodFilter === "all"} onClick={() => setMoodFilter("all")} />
                        {SETUP_MOOD_OPTIONS.slice(0, 4).map((o) => <Chip key={o.id} label={o.label} active={moodFilter === o.id} onClick={() => setMoodFilter(o.id)} />)}
                    </div>
                </div>

                {filteredSetups.length === 0 ? (
                    <p className="text-center text-[12px] text-slate-400 py-6">まだセットアップがありません</p>
                ) : (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {filteredSetups.map((setup) => {
                            const previewItems = setup.itemIds.map((id) => state.wardrobe.find((item) => item.id === id)).filter((item): item is WardrobeItem => Boolean(item)).slice(0, 3);
                            return (
                                <div key={setup.id} className="overflow-hidden rounded-xl border border-slate-200/60 bg-white shadow-sm">
                                    <div className="grid grid-cols-3 gap-0.5 bg-slate-50/80 p-1.5">
                                        {previewItems.length > 0 ? previewItems.map((item) => (
                                            <div key={item.id} className="overflow-hidden rounded-lg">
                                                <ImageSurface image={item.imageUrl} label={item.name} gradient="from-slate-700 to-slate-900" ratio="aspect-square" />
                                            </div>
                                        )) : (
                                            <div className="col-span-3 rounded-lg bg-slate-100 px-3 py-4 text-center text-[11px] text-slate-400">プレビューなし</div>
                                        )}
                                    </div>
                                    <div className="px-2.5 py-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <div className="text-[12px] font-bold text-slate-800">{setup.title}</div>
                                                <div className="text-[10px] text-slate-400">{formatDateLabel(setup.createdAt)}</div>
                                            </div>
                                            <button type="button" onClick={() => setState((p) => ({ ...p, setups: p.setups.filter((e) => e.id !== setup.id) }))} className="text-[10px] text-slate-300 hover:text-red-400">削除</button>
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                            {setup.moodTags.map((t) => <Badge key={t} tone="sky">{getSetupMoodLabel(t)}</Badge>)}
                                            {buildSetupLaneHints(setup, state.wardrobe).map((l) => <Badge key={l}>{l}</Badge>)}
                                        </div>
                                        {setup.memory?.note && <p className="mt-1 text-[11px] leading-relaxed text-slate-500 line-clamp-2">{setup.memory.note}</p>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
