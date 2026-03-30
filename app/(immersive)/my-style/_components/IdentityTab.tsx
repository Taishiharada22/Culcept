"use client";

import { useState, type ReactNode, type SetStateAction } from "react";
import PersonaPanel from "./PersonaPanel";
import CrossFeaturePanel from "./CrossFeaturePanel";
import type { CrossFeatureData } from "./CrossFeaturePanel";
import {
    BECOME_RESULT_OPTIONS,
    BECOME_TRIGGER_OPTIONS,
    ELEMENT_GROUPS,
    STYLE_LANE_OPTIONS,
    TENSION_OPTIONS,
    WORLDVIEW_OPTIONS,
    getElementLabel,
    getStyleLaneLabel,
    normalizeElementId,
    normalizeStyleLaneId,
} from "../_lib/catalog";
import type {
    BecomePair,
    SavedState,
    SelectedPreferenceTag,
} from "../_lib/types";

/* ─────────────────────── types ─────────────────────── */

type IdentityMode = "iam" | "iseek" | "ibecome";

type BridgePulse = {
    pcSeason: string | null;
    pcBase: string | null;
    bodyType: string | null;
    bodySubtype: string | null;
} | null | undefined;

type CandidateChoice = {
    code: string;
    group: SelectedPreferenceTag["group"];
    label?: string;
    description?: string;
};

/* ─────────────────────── utils ─────────────────────── */

function cx(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(" ");
}

function reorderByKey<T>(list: T[], sourceKey: string, targetKey: string, getKey: (item: T) => string) {
    const sourceIndex = list.findIndex((item) => getKey(item) === sourceKey);
    const targetIndex = list.findIndex((item) => getKey(item) === targetKey);
    if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return list;
    const next = [...list];
    const [source] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, source);
    return next;
}

function getDisplayLabel(code: string) {
    const laneId = normalizeStyleLaneId(code);
    if (laneId) return getStyleLaneLabel(laneId);
    return getElementLabel(code);
}

function createTag(code: string, group: SelectedPreferenceTag["group"], priority: number): SelectedPreferenceTag {
    return { code, group, priority, createdAt: new Date().toISOString() };
}

/* ─────────────────────── constants ─────────────────────── */

const IAM_LIKED_GROUPS = new Set(["silhouette", "color", "texture", "composition", "detail", "mood"]);
const IAM_NATURAL_GROUPS = new Set(["mood", "worldview", "impression"]);
const ISEEK_ELEMENT_GROUPS = new Set(["impression", "composition", "detail", "mood", "color"]);
const ISEEK_AVOID_GROUPS = new Set(["tension", "composition", "detail", "impression"]);

const SHELF_TONES = {
    core: { shell: "border-slate-200/60 bg-white/80", chip: "border-slate-900 bg-slate-900 text-white", accent: "text-slate-500", badge: "ink" as const },
    rare: { shell: "border-sky-200/60 bg-sky-50/50", chip: "border-sky-200 bg-sky-100 text-sky-800", accent: "text-sky-600", badge: "sky" as const },
    secret: { shell: "border-amber-200/60 bg-amber-50/50", chip: "border-amber-200 bg-amber-100 text-amber-800", accent: "text-amber-600", badge: "amber" as const },
    unexpected: { shell: "border-rose-200/60 bg-rose-50/50", chip: "border-rose-200 bg-rose-100 text-rose-800", accent: "text-rose-600", badge: "amber" as const },
} as const;

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

function Card({ id, className, children, gradient }: { id?: string; className?: string; children: ReactNode; gradient?: boolean }) {
    return (
        <section
            id={id}
            className={cx(
                "rounded-2xl border p-5",
                gradient
                    ? "border-white/50 bg-gradient-to-br from-white/95 to-white/80 shadow-lg shadow-slate-900/[0.04] backdrop-blur-xl"
                    : "border-slate-200/70 bg-white/90 shadow-sm backdrop-blur",
                className
            )}
        >
            {children}
        </section>
    );
}

function SectionHeading({ title, sub, badge, children }: { title: string; sub?: string; badge?: ReactNode; children?: ReactNode }) {
    return (
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h3 className="text-lg font-bold text-slate-900">{title}</h3>
                {sub ? <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{sub}</p> : null}
            </div>
            <div className="flex items-center gap-2">
                {badge}
                {children}
            </div>
        </div>
    );
}

function SelectionPill({ label, onRemove, priority, tone = "core" }: { label: string; onRemove: () => void; priority?: number; tone?: keyof typeof SHELF_TONES }) {
    const palette = SHELF_TONES[tone];
    return (
        <div className={cx("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition hover:-translate-y-0.5", palette.chip)}>
            {typeof priority === "number" ? <span className="grid h-5 w-5 place-items-center rounded-full bg-white/20 text-[10px]">{priority + 1}</span> : null}
            <span>{label}</span>
            <button type="button" onClick={onRemove} className="text-current/50 hover:text-current">×</button>
        </div>
    );
}

type AccumulatingSelectionProps = {
    title: string;
    description?: string;
    selected: SelectedPreferenceTag[];
    candidates: CandidateChoice[];
    max?: number;
    emptyMessage?: string;
    tone?: keyof typeof SHELF_TONES;
    getKey: (item: SelectedPreferenceTag) => string;
    onSelect: (item: CandidateChoice) => void;
    onRemove: (item: SelectedPreferenceTag) => void;
    onReorder?: (items: SelectedPreferenceTag[]) => void;
    renderSelected: (item: SelectedPreferenceTag) => ReactNode;
    renderCandidate: (item: CandidateChoice) => ReactNode;
};

function AccumulatingSelectionSection({
    title, description, selected, candidates, max, emptyMessage = "下の候補から選ぶと、ここに積み上がります。",
    tone = "core", getKey, onSelect, onRemove, onReorder, renderSelected, renderCandidate,
}: AccumulatingSelectionProps) {
    const palette = SHELF_TONES[tone];
    const [expanded, setExpanded] = useState(false);
    const visibleCandidates = expanded ? candidates : candidates.slice(0, 12);

    return (
        <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h4 className="text-[15px] font-bold text-slate-900">{title}</h4>
                    {description ? <p className="mt-0.5 text-[13px] text-slate-500">{description}</p> : null}
                </div>
                {max ? <Badge tone={palette.badge}>{selected.length}/{max}</Badge> : null}
            </div>

            <div className={cx("mt-3 rounded-xl border p-3", palette.shell)}>
                {selected.length === 0 ? (
                    <p className="px-2 py-2 text-[13px] text-slate-400">{emptyMessage}</p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {selected.map((item) => {
                            const key = getKey(item);
                            return (
                                <div
                                    key={key}
                                    draggable
                                    onDragStart={(event) => event.dataTransfer.setData("text/plain", key)}
                                    onDragOver={(event) => event.preventDefault()}
                                    onDrop={(event) => {
                                        if (!onReorder) return;
                                        event.preventDefault();
                                        onReorder(reorderByKey(selected, event.dataTransfer.getData("text/plain"), key, getKey));
                                    }}
                                >
                                    {renderSelected(item)}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
                {visibleCandidates.map((item) => (
                    <button
                        key={item.code}
                        type="button"
                        onClick={() => onSelect(item)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                        {renderCandidate(item)}
                    </button>
                ))}
                {candidates.length > 12 && !expanded ? (
                    <button type="button" onClick={() => setExpanded(true)} className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-slate-400 hover:text-slate-600">
                        +{candidates.length - 12} もっと見る
                    </button>
                ) : null}
            </div>
        </Card>
    );
}

/* ─────────────────────── IdentityTab ─────────────────────── */

export default function IdentityTab({ state, setState, mode, setMode, pushNotice, crossFeature, bridgePulse }: {
    state: SavedState; setState: (updater: SetStateAction<SavedState>) => void; mode: IdentityMode; setMode: (mode: IdentityMode) => void; pushNotice: (text: string) => void; crossFeature?: CrossFeatureData | null; bridgePulse?: BridgePulse;
}) {
    const [draftTriggerTags, setDraftTriggerTags] = useState<SelectedPreferenceTag[]>([]);
    const [draftResultTags, setDraftResultTags] = useState<SelectedPreferenceTag[]>([]);
    const [draftBecomeNote, setDraftBecomeNote] = useState("");

    const likedCandidates = ELEMENT_GROUPS.filter((g) => IAM_LIKED_GROUPS.has(g.id));
    const naturalCandidates = ELEMENT_GROUPS.filter((g) => IAM_NATURAL_GROUPS.has(g.id));
    const impressionCandidates = ELEMENT_GROUPS.filter((g) => g.id === "impression");
    const worldviewCandidates = [...STYLE_LANE_OPTIONS.map((l) => ({ code: l.id, label: l.label, group: "worldview" as const })), ...WORLDVIEW_OPTIONS];
    const seekElementCandidates = ELEMENT_GROUPS.filter((g) => ISEEK_ELEMENT_GROUPS.has(g.id)).flatMap((g) => g.options);
    const avoidCandidates = ELEMENT_GROUPS.filter((g) => ISEEK_AVOID_GROUPS.has(g.id)).flatMap((g) => g.options);

    const updateTagList = (current: SelectedPreferenceTag[], code: string, group: SelectedPreferenceTag["group"], max: number) => {
        const normalizedCode = normalizeStyleLaneId(code) || normalizeElementId(code) || code;
        const exists = current.some((t) => t.code === normalizedCode);
        if (!exists && current.length >= max) { pushNotice("最大数に達しています"); return current; }
        const next = exists ? current.filter((t) => t.code !== normalizedCode) : [...current, createTag(normalizedCode, group, current.length)];
        return next.map((t, i) => ({ ...t, priority: i }));
    };

    const saveBecomePair = () => {
        if (draftTriggerTags.length === 0 || draftResultTags.length === 0) { pushNotice("trigger と result の両方を選んでください"); return; }
        const now = new Date().toISOString();
        const nextPair: BecomePair = {
            id: `become_${Date.now().toString(36)}`,
            triggerTags: draftTriggerTags.map((t, i) => ({ ...t, priority: i })),
            resultTags: draftResultTags.map((t, i) => ({ ...t, priority: i })),
            note: draftBecomeNote.trim(), priority: state.ibecome.pairs.length, createdAt: now,
        };
        setState((prev) => ({ ...prev, ibecome: { pairs: [...prev.ibecome.pairs, nextPair].map((p, i) => ({ ...p, priority: i })) } }));
        setDraftTriggerTags([]); setDraftResultTags([]); setDraftBecomeNote(""); pushNotice("I BECOME を保存しました");
    };

    // Helpers for common patterns
    const iamUpdate = (field: "likedTags" | "dislikedTags" | "desiredImpressions" | "naturalSelfTags") => ({
        onSelect: (item: CandidateChoice) => setState((p) => ({ ...p, iam: { ...p.iam, [field]: updateTagList(p.iam[field], item.code, item.group, field === "dislikedTags" ? 6 : 8) } })),
        onRemove: (item: SelectedPreferenceTag) => setState((p) => ({ ...p, iam: { ...p.iam, [field]: p.iam[field].filter((t) => t.code !== item.code).map((t, i) => ({ ...t, priority: i })) } })),
        onReorder: (items: SelectedPreferenceTag[]) => setState((p) => ({ ...p, iam: { ...p.iam, [field]: items.map((t, i) => ({ ...t, priority: i })) } })),
    });

    const iseekUpdate = (field: "attractedWorldviews" | "attractedElements" | "unexpectedPulls" | "avoidedElements") => ({
        onSelect: (item: CandidateChoice) => setState((p) => ({ ...p, iseek: { ...p.iseek, [field]: updateTagList(p.iseek[field], item.code, item.group === "worldview" ? "worldview" : item.group, field === "attractedWorldviews" || field === "attractedElements" ? 8 : 6) } })),
        onRemove: (item: SelectedPreferenceTag) => setState((p) => ({ ...p, iseek: { ...p.iseek, [field]: p.iseek[field].filter((t) => t.code !== item.code).map((t, i) => ({ ...t, priority: i })) } })),
        onReorder: (items: SelectedPreferenceTag[]) => setState((p) => ({ ...p, iseek: { ...p.iseek, [field]: items.map((t, i) => ({ ...t, priority: i })) } })),
    });

    const renderSelectionPill = (field: string, stateKey: "iam" | "iseek", tone: keyof typeof SHELF_TONES, item: SelectedPreferenceTag) => (
        <SelectionPill label={getDisplayLabel(item.code)} priority={item.priority} tone={tone}
            onRemove={() => setState((p) => {
                const section = p[stateKey] as unknown as Record<string, SelectedPreferenceTag[]>;
                return { ...p, [stateKey]: { ...section, [field]: section[field].filter((t: SelectedPreferenceTag) => t.code !== item.code).map((t: SelectedPreferenceTag, i: number) => ({ ...t, priority: i })) } };
            })}
        />
    );

    return (
        <div className="space-y-5">
            {/* Mode switcher */}
            <section className="rounded-2xl border border-amber-200/30 p-5 shadow-sm" style={{ backgroundColor: "rgba(255,253,247,0.92)" }}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="border-l-2 border-rose-300/40 pl-4">
                        <h3 className="text-lg font-bold text-amber-900">アイデンティティ</h3>
                        <p className="mt-0.5 text-[13px] text-amber-700/60">自分の深層を I AM / I SEEK / I BECOME の三層で育てる</p>
                    </div>
                    <div className="flex rounded-xl border border-amber-200/40 bg-white/60 p-1">
                        {([
                            { id: "iam" as const, label: "I AM", sub: "いまの自分" },
                            { id: "iseek" as const, label: "I SEEK", sub: "惹かれる世界" },
                            { id: "ibecome" as const, label: "I BECOME", sub: "変化の癖" },
                        ]).map((e) => (
                            <button key={e.id} type="button" onClick={() => setMode(e.id)}
                                className={cx("rounded-lg px-4 py-2 text-center transition", mode === e.id ? "bg-amber-800 text-white shadow-sm" : "text-amber-700/50 hover:text-amber-800")}>
                                <div className="text-[13px] font-bold">{e.label}</div>
                                <div className="text-[10px] opacity-60">{e.sub}</div>
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            {mode === "iam" ? (
                <>
                    <AccumulatingSelectionSection title="好きな要素" description="自分の根っこに近い好みを選ぶ"
                        selected={state.iam.likedTags} tone="core" max={8}
                        candidates={likedCandidates.flatMap((g) => g.options).filter((o) => !state.iam.likedTags.some((t) => t.code === o.code))}
                        getKey={(i) => i.code} {...iamUpdate("likedTags")}
                        renderSelected={(item) => renderSelectionPill("likedTags", "iam", "core", item)} renderCandidate={(i) => getDisplayLabel(i.code)} />
                    <AccumulatingSelectionSection title="苦手な要素" description="違和感を感じやすい方向"
                        selected={state.iam.dislikedTags} tone="unexpected" max={6}
                        candidates={TENSION_OPTIONS.filter((o) => !state.iam.dislikedTags.some((t) => t.code === o.code))}
                        getKey={(i) => i.code} {...iamUpdate("dislikedTags")}
                        renderSelected={(item) => renderSelectionPill("dislikedTags", "iam", "unexpected", item)} renderCandidate={(i) => getDisplayLabel(i.code)} />
                    <AccumulatingSelectionSection title="見られたい印象" description="どんな空気感で伝わりたいか"
                        selected={state.iam.desiredImpressions} tone="rare" max={6}
                        candidates={impressionCandidates.flatMap((g) => g.options).filter((o) => !state.iam.desiredImpressions.some((t) => t.code === o.code))}
                        getKey={(i) => i.code} {...iamUpdate("desiredImpressions")}
                        renderSelected={(item) => renderSelectionPill("desiredImpressions", "iam", "rare", item)} renderCandidate={(i) => getDisplayLabel(i.code)} />
                    <AccumulatingSelectionSection title="自然体の自分" description="無理なく出てくる方向"
                        selected={state.iam.naturalSelfTags} tone="rare" max={6}
                        candidates={naturalCandidates.flatMap((g) => g.options).filter((o) => !state.iam.naturalSelfTags.some((t) => t.code === o.code))}
                        getKey={(i) => i.code} {...iamUpdate("naturalSelfTags")}
                        renderSelected={(item) => renderSelectionPill("naturalSelfTags", "iam", "rare", item)} renderCandidate={(i) => getDisplayLabel(i.code)} />
                    <section className="rounded-2xl border border-amber-200/30 p-5 shadow-sm" style={{ backgroundColor: "rgba(255,253,247,0.92)" }}>
                        <h4 className="text-[15px] font-bold text-amber-900">メモ</h4>
                        <textarea value={state.iam.memo ?? ""} onChange={(e) => setState((p) => ({ ...p, iam: { ...p.iam, memo: e.target.value } }))}
                            placeholder="例: 自然体でいたいけど、だらしなくは見せたくない"
                            className="mt-3 min-h-[100px] w-full rounded-xl border border-amber-200/40 px-4 py-3 text-[13px] leading-relaxed text-slate-700 outline-none focus:border-amber-400"
                            style={{ backgroundColor: "rgba(255,253,247,0.6)", backgroundImage: "repeating-linear-gradient(to bottom, transparent, transparent 27px, rgba(0,0,0,0.03) 27px, rgba(0,0,0,0.03) 28px)" }} />
                    </section>
                </>
            ) : null}

            {mode === "iseek" ? (
                <>
                    <AccumulatingSelectionSection title="惹かれる世界観" description="どんな世界観に心が動くか"
                        selected={state.iseek.attractedWorldviews} tone="rare" max={8}
                        candidates={worldviewCandidates.filter((o) => !state.iseek.attractedWorldviews.some((t) => t.code === o.code))}
                        getKey={(i) => i.code} {...iseekUpdate("attractedWorldviews")}
                        renderSelected={(item) => renderSelectionPill("attractedWorldviews", "iseek", "rare", item)} renderCandidate={(i) => getDisplayLabel(i.code)} />
                    <AccumulatingSelectionSection title="惹かれる要素" description="特に反応しやすい空気感や構成"
                        selected={state.iseek.attractedElements} tone="core" max={8}
                        candidates={seekElementCandidates.filter((o) => !state.iseek.attractedElements.some((t) => t.code === o.code))}
                        getKey={(i) => i.code} {...iseekUpdate("attractedElements")}
                        renderSelected={(item) => renderSelectionPill("attractedElements", "iseek", "core", item)} renderCandidate={(i) => getDisplayLabel(i.code)} />
                    <AccumulatingSelectionSection title="惹かれる違和感" description="主軸とは違うのに気になる要素"
                        selected={state.iseek.unexpectedPulls} tone="unexpected" max={6}
                        candidates={TENSION_OPTIONS.filter((o) => !state.iseek.unexpectedPulls.some((t) => t.code === o.code))}
                        getKey={(i) => i.code} {...iseekUpdate("unexpectedPulls")}
                        renderSelected={(item) => renderSelectionPill("unexpectedPulls", "iseek", "unexpected", item)} renderCandidate={(i) => getDisplayLabel(i.code)} />
                    <AccumulatingSelectionSection title="避けたい要素" description="惹かれにくい方向"
                        selected={state.iseek.avoidedElements} tone="secret" max={6}
                        candidates={avoidCandidates.filter((o) => !state.iseek.avoidedElements.some((t) => t.code === o.code))}
                        getKey={(i) => i.code} {...iseekUpdate("avoidedElements")}
                        renderSelected={(item) => renderSelectionPill("avoidedElements", "iseek", "secret", item)} renderCandidate={(i) => getDisplayLabel(i.code)} />
                    <section className="rounded-2xl border border-amber-200/30 p-5 shadow-sm" style={{ backgroundColor: "rgba(255,253,247,0.92)" }}>
                        <h4 className="text-[15px] font-bold text-amber-900">メモ</h4>
                        <textarea value={state.iseek.memo ?? ""} onChange={(e) => setState((p) => ({ ...p, iseek: { ...p.iseek, memo: e.target.value } }))}
                            placeholder="例: 頑張りすぎていないのに整って見える世界観に惹かれる"
                            className="mt-3 min-h-[100px] w-full rounded-xl border border-amber-200/40 px-4 py-3 text-[13px] leading-relaxed text-slate-700 outline-none focus:border-amber-400"
                            style={{ backgroundColor: "rgba(255,253,247,0.6)", backgroundImage: "repeating-linear-gradient(to bottom, transparent, transparent 27px, rgba(0,0,0,0.03) 27px, rgba(0,0,0,0.03) 28px)" }} />
                    </section>
                </>
            ) : null}

            {mode === "ibecome" ? (
                <>
                    <AccumulatingSelectionSection title="トリガー" description="何に触れると変化が起きるか"
                        selected={draftTriggerTags} tone="rare" max={4}
                        candidates={BECOME_TRIGGER_OPTIONS.filter((o) => !draftTriggerTags.some((t) => t.code === o.code))}
                        getKey={(i) => i.code}
                        onSelect={(item) => setDraftTriggerTags((c) => updateTagList(c, item.code, item.group, 4))}
                        onRemove={(item) => setDraftTriggerTags((c) => c.filter((t) => t.code !== item.code).map((t, i) => ({ ...t, priority: i })))}
                        onReorder={(items) => setDraftTriggerTags(items.map((t, i) => ({ ...t, priority: i })))}
                        renderSelected={(item) => <SelectionPill label={getDisplayLabel(item.code)} priority={item.priority} tone="rare" onRemove={() => setDraftTriggerTags((c) => c.filter((t) => t.code !== item.code).map((t, i) => ({ ...t, priority: i })))} />}
                        renderCandidate={(i) => getDisplayLabel(i.code)} />

                    <AccumulatingSelectionSection title="現れる自分" description="どんな自分が前に出るのか"
                        selected={draftResultTags} tone="secret" max={4}
                        candidates={BECOME_RESULT_OPTIONS.filter((o) => !draftResultTags.some((t) => t.code === o.code))}
                        getKey={(i) => i.code}
                        onSelect={(item) => setDraftResultTags((c) => updateTagList(c, item.code, item.group, 4))}
                        onRemove={(item) => setDraftResultTags((c) => c.filter((t) => t.code !== item.code).map((t, i) => ({ ...t, priority: i })))}
                        onReorder={(items) => setDraftResultTags(items.map((t, i) => ({ ...t, priority: i })))}
                        renderSelected={(item) => <SelectionPill label={getDisplayLabel(item.code)} priority={item.priority} tone="secret" onRemove={() => setDraftResultTags((c) => c.filter((t) => t.code !== item.code).map((t, i) => ({ ...t, priority: i })))} />}
                        renderCandidate={(i) => getDisplayLabel(i.code)} />

                    {/* Preview card */}
                    {(draftTriggerTags.length > 0 || draftResultTags.length > 0) ? (
                        <Card className="border-amber-200/50 bg-gradient-to-br from-amber-50/50 to-white/80">
                            <div className="grid items-center gap-3 sm:grid-cols-[1fr_40px_1fr]">
                                <div className="rounded-xl border border-sky-200/50 bg-white/80 p-3">
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-sky-400">Trigger</div>
                                    <div className="mt-1.5 flex flex-wrap gap-1">
                                        {draftTriggerTags.length === 0 ? <span className="text-[12px] text-slate-400">触れるもの</span> : draftTriggerTags.map((t) => <Badge key={t.code} tone="sky">{getDisplayLabel(t.code)}</Badge>)}
                                    </div>
                                </div>
                                <div className="text-center text-2xl text-slate-300">→</div>
                                <div className="rounded-xl border border-amber-200/50 bg-white/80 p-3">
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Become</div>
                                    <div className="mt-1.5 flex flex-wrap gap-1">
                                        {draftResultTags.length === 0 ? <span className="text-[12px] text-slate-400">現れる自分</span> : draftResultTags.map((t) => <Badge key={t.code} tone="amber">{getDisplayLabel(t.code)}</Badge>)}
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ) : null}

                    <Card>
                        <h4 className="text-[15px] font-bold text-slate-900">メモ</h4>
                        <textarea value={draftBecomeNote} onChange={(e) => setDraftBecomeNote(e.target.value)}
                            placeholder="例: 強いモードに触れると、自分も背筋が伸びる感じがする"
                            className="mt-3 min-h-[80px] w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-[13px] leading-relaxed text-slate-700 outline-none focus:border-slate-400" />
                        <button type="button" onClick={saveBecomePair} className="mt-3 rounded-xl bg-slate-900 px-6 py-2.5 text-[13px] font-bold text-white transition hover:bg-slate-800">ペアを追加</button>
                    </Card>

                    {/* Saved pairs */}
                    {state.ibecome.pairs.length > 0 ? (
                        <Card>
                            <SectionHeading title="保存済みペア" badge={<Badge tone="amber">{state.ibecome.pairs.length}</Badge>} />
                            <div className="mt-3 space-y-2.5">
                                {state.ibecome.pairs.map((pair) => (
                                    <div key={pair.id} className="flex items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/50 p-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="text-[12px] font-bold text-sky-600">{pair.triggerTags.map((t) => getDisplayLabel(t.code)).join(" / ")}</span>
                                                <span className="text-slate-300">→</span>
                                                <span className="text-[12px] font-bold text-amber-600">{pair.resultTags.map((t) => getDisplayLabel(t.code)).join(" / ")}</span>
                                            </div>
                                            {pair.note ? <p className="mt-1 text-[12px] text-slate-500">{pair.note}</p> : null}
                                        </div>
                                        <button type="button" onClick={() => setState((p) => ({ ...p, ibecome: { pairs: p.ibecome.pairs.filter((e) => e.id !== pair.id).map((e, i) => ({ ...e, priority: i })) } }))}
                                            className="shrink-0 text-[11px] text-slate-300 hover:text-red-400">削除</button>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    ) : null}
                </>
            ) : null}

            {/* Context Personas */}
            <section className="rounded-2xl border border-amber-200/30 bg-gradient-to-br from-amber-50/40 to-white/90 p-5 shadow-sm">
                <SectionHeading title="コンテクスト・ペルソナ" sub="場面ごとに、自分の見せ方がどう変わるか" />
                <div className="mt-3">
                    <PersonaPanel state={state} setState={setState} />
                </div>
            </section>

            {/* Cross-Feature Bridge */}
            <section className="rounded-2xl border border-violet-200/30 bg-gradient-to-br from-violet-50/20 to-white/90 p-5 shadow-sm backdrop-blur">
                <SectionHeading title="クロス機能ブリッジ" sub="パーソナルカラー・骨格・性格分析とスタイルの交差点" />
                <div className="mt-3">
                    <CrossFeaturePanel state={state} crossFeature={crossFeature ?? null} pulse={bridgePulse ?? null} />
                </div>
            </section>
        </div>
    );
}
