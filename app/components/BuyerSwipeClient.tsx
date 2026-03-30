// app/components/BuyerSwipeClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSpring, animated, config, to as springTo } from "@react-spring/web";
import { useDrag } from "@use-gesture/react";

import RecoProfilePanel from "./RecoProfilePanel";
import SimilarUsersPanel from "./SimilarUsersPanel";
import UltimateRecommendationsPanel from "@/app/components/UltimateRecommendationsPanel";
import HybridRecommendationsPanel from "@/app/components/HybridRecommendationsPanel";
import {
    GlassBadge,
    GlassButton,
    GlassCard,
} from "@/components/ui/glassmorphism-design";

type Role = "buyer" | "seller";
type TargetType = "drop" | "shop" | "insight";
type ActionKind = "like" | "dislike" | "neutral" | "skip";

// DB制約に合わせる（recommendation_actions_action_check）
type ActionDb = "save" | "skip" | "neutral" | "click" | "purchase";
type PriceBand = "low" | "mid" | "high" | "unknown";

type RecItem = {
    impressionId: string | null;
    role: Role;
    recType: string;
    targetType: TargetType;
    targetId: string | null;
    rank: number;
    explain?: string | null;
    payload: any;
};

type RecResp = {
    ok: boolean;
    error?: string;
    role?: Role;
    recVersion?: number;
    items?: RecItem[];
};

type HistoryEntry = {
    idx: number;
    action: ActionKind;
    impressionId: string;
};

const PRICE_BAND_META: Record<PriceBand, { label: string; className: string }> = {
    low: { label: "Low", className: "bg-emerald-500/15 text-emerald-700 border-emerald-300/40" },
    mid: { label: "Mid", className: "bg-amber-500/15 text-amber-700 border-amber-300/40" },
    high: { label: "High", className: "bg-rose-500/15 text-rose-700 border-rose-300/40" },
    unknown: { label: "Style", className: "bg-slate-500/10 text-slate-600 border-slate-200/60" },
};

function getPriceBandMeta(band?: string) {
    const key = (band ?? "unknown") as PriceBand;
    return PRICE_BAND_META[key] ?? PRICE_BAND_META.unknown;
}

function actionToRating(action: ActionKind): -1 | 0 | 1 {
    if (action === "like") return 1;
    if (action === "dislike") return -1;
    return 0;
}

function actionToDb(action: ActionKind): ActionDb {
    if (action === "like") return "save";
    if (action === "neutral") return "neutral";
    return "skip";
}

async function fetchCards(limit = 12) {
    const r = await fetch(`/api/recommendations?v=2&role=buyer&stream=cards&limit=${limit}`, {
        method: "GET", credentials: "include", cache: "no-store",
    });
    const j: RecResp = await r.json().catch(() => ({ ok: false, error: "Invalid JSON response" }));
    if (!j.ok) throw new Error(j.error || "fetch failed");
    return j.items ?? [];
}

async function fetchShops(limit = 10) {
    const r = await fetch(`/api/recommendations?v=2&role=buyer&stream=shops&limit=${limit}`, {
        method: "GET", credentials: "include", cache: "no-store",
    });
    const j: RecResp = await r.json().catch(() => ({ ok: false, error: "Invalid JSON response" }));
    if (!j.ok) throw new Error(j.error || "fetch failed");
    return j.items ?? [];
}

async function postRating(impressionId: string, rating: -1 | 0 | 1) {
    const r = await fetch(`/api/recommendations/rating`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ impressionId, rating, recVersion: 2 }),
    });
    const j = await r.json().catch(() => ({ ok: false, error: "Invalid JSON" }));
    if (!j.ok) throw new Error(j.error || "rating failed");
    return j;
}

async function postAction(impressionId: string, action: ActionDb, meta?: any) {
    const r = await fetch(`/api/recommendations/action`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ impressionId, action, meta, recVersion: 2 }),
    });
    const j = await r.json().catch(() => ({ ok: false, error: "Invalid JSON" }));
    if (!j.ok) throw new Error(j.error || "action failed");
    return j;
}

function normalizeImg(url: string): string {
    const s = String(url ?? "").trim();
    if (!s) return "";
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    if (s.startsWith("data:") || s.startsWith("blob:")) return s;
    const cleaned = s.replace(/\\/g, "/").replace(/^public\//, "");
    if (cleaned.startsWith("/")) return cleaned;
    return `/${cleaned}`;
}

function dedupeQueue(items: RecItem[]): RecItem[] {
    const seen = new Set<string>();
    const out: RecItem[] = [];
    for (const it of items) {
        const cardId =
            it?.payload?.card_id != null ? String(it.payload.card_id)
            : it?.payload?.id != null ? String(it.payload.id) : "";
        const key =
            (it.impressionId ? `imp:${it.impressionId}` : "") ||
            (it.targetId ? `t:${it.targetId}` : "") ||
            (cardId ? `c:${cardId}` : "") ||
            `r:${it.rank}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(it);
    }
    return out;
}

function splitSwipeItems(items: RecItem[]) {
    const info: {
        summaryTags?: string[];
        noCards?: { hint?: string; active_cards?: number; seen_count_14d?: number };
    } = {};

    const cards = (items ?? [])
        .filter((it) => it?.payload?.kind === "swipe_card")
        .map((it) => {
            const cardId = String(it?.payload?.card_id ?? it?.payload?.id ?? "");
            const rawImg = it?.payload?.image_url ?? (cardId ? `/cards/${cardId}.png` : "");
            const imageUrl = normalizeImg(String(rawImg ?? ""));
            return { ...it, payload: { ...it.payload, image_url: imageUrl } };
        })
        .filter((it) => !!it?.payload?.image_url);

    for (const it of items ?? []) {
        if (it?.payload?.kind === "swipe_summary") {
            const topA = Array.isArray(it.payload?.top_tags) ? it.payload.top_tags.map(String) : [];
            const topB = Array.isArray(it.payload?.tags) ? it.payload.tags.map(String) : [];
            const top = (topA.length ? topA : topB).filter(Boolean);
            info.summaryTags = top.slice(0, 12);
        }
        if (it?.payload?.kind === "no_cards") {
            info.noCards = {
                hint: String(it.payload?.hint ?? ""),
                active_cards: Number(it.payload?.debug?.active_cards ?? it.payload?.active_cards ?? 0) || 0,
                seen_count_14d: Number(it.payload?.debug?.seen_count_14d ?? it.payload?.seen_count_14d ?? 0) || 0,
            };
        }
    }

    return { cards, info };
}

function Confetti() {
    const particles = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        x: Math.random() * 120 - 60,
        y: Math.random() * 40 - 50,
        r: Math.random() * 360,
        color: ["#f97316", "#8b5cf6", "#14b8a6", "#f59e0b"][Math.floor(Math.random() * 4)],
        delay: Math.random() * 0.3,
        size: 6 + Math.random() * 6,
    }));

    return (
        <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
            {particles.map((p) => (
                <div
                    key={p.id}
                    className="absolute left-1/2 top-1/2 animate-confetti"
                    style={{
                        width: `${p.size}px`,
                        height: `${p.size}px`,
                        backgroundColor: p.color,
                        ["--confetti-x" as any]: `${p.x}vw`,
                        ["--confetti-y" as any]: `${p.y}vh`,
                        ["--confetti-r" as any]: `${p.r}deg`,
                        animationDelay: `${p.delay}s`,
                    }}
                />
            ))}
        </div>
    );
}

/* ─── Main Component ─── */

export default function BuyerSwipeClient({ limit = 12 }: { limit?: number }) {
    const [queue, setQueue] = useState<RecItem[]>([]);
    const [idx, setIdx] = useState(0);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);
    const [swipeCount, setSwipeCount] = useState(0);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [showConfetti, setShowConfetti] = useState(false);
    const [focusMode, setFocusMode] = useState(false);
    const [showDetails, setShowDetails] = useState(true);
    const [imageError, setImageError] = useState(false);
    const [activeTab, setActiveTab] = useState<"profile" | "similar" | "recommendations" | "shops">("profile");
    const [mountedTabs, setMountedTabs] = useState<Record<string, boolean>>({ profile: true });
    const [tagSignals, setTagSignals] = useState<Record<string, "more" | "less">>({});
    const [shops, setShops] = useState<RecItem[]>([]);
    const [shopsLoading, setShopsLoading] = useState(false);
    const autoLoadedShopsRef = useRef(false);
    const [summaryTags, setSummaryTags] = useState<string[]>([]);
    const [noCardsDebug, setNoCardsDebug] = useState<{
        hint?: string; active_cards?: number; seen_count_14d?: number;
    } | null>(null);
    const [baseHistory, setBaseHistory] = useState<{ total: number; likes: number; dislikes: number; neutral: number }>({
        total: 0, likes: 0, dislikes: 0, neutral: 0,
    });

    const current = useMemo(() => queue[idx] ?? null, [queue, idx]);
    const remaining = Math.max(0, queue.length - idx);
    const progress = queue.length > 0 ? Math.min(100, Math.round((idx / queue.length) * 100)) : 0;

    const stats = useMemo(() => {
        const out = { likes: 0, dislikes: 0, neutral: 0, skips: 0 };
        for (const h of history) {
            if (h.action === "like") out.likes += 1;
            else if (h.action === "dislike") out.dislikes += 1;
            else if (h.action === "neutral") out.neutral += 1;
            else if (h.action === "skip") out.skips += 1;
        }
        return out;
    }, [history]);

    const totalStats = useMemo(() => {
        const total = baseHistory.total + swipeCount;
        const likes = baseHistory.likes + stats.likes;
        const dislikes = baseHistory.dislikes + stats.dislikes;
        const neutral = baseHistory.neutral + stats.neutral + stats.skips;
        return { total, likes, dislikes, neutral };
    }, [baseHistory, stats, swipeCount]);

    const [{ x, opacity, rotateY }, api] = useSpring<{ x: number; opacity: number; rotateY: number }>(() => ({
        x: 0, opacity: 1, rotateY: 0, config: config.wobbly,
    }));

    const didInit = useRef(false);
    const currentRef = useRef<RecItem | null>(null);
    const processingRef = useRef(false);
    const onActionRef = useRef<((action: ActionKind, skipAnimation?: boolean) => Promise<void>) | null>(null);
    const undoRef = useRef<(() => void) | null>(null);

    useEffect(() => { currentRef.current = current; setImageError(false); }, [current]);
    useEffect(() => { processingRef.current = processing; }, [processing]);

    async function init() {
        setErr(null); setLoading(true); setQueue([]); setIdx(0);
        setSummaryTags([]); setNoCardsDebug(null);
        try {
            const items = await fetchCards(limit);
            const { cards, info } = splitSwipeItems(items);
            setQueue(dedupeQueue(cards)); setIdx(0); setSwipeCount(0);
            setHistory([]); setShops([]);
            if (info.summaryTags?.length) setSummaryTags(info.summaryTags);
            if (info.noCards) setNoCardsDebug(info.noCards);
        } catch (e: any) { setErr(String(e?.message ?? e)); }
        finally { setLoading(false); }
    }

    async function refillIfNeeded(nextIdx: number, currentLen: number) {
        const remain = currentLen - nextIdx;
        if (loading) return;
        if (remain >= 5) return;
        setLoading(true);
        try {
            const items = await fetchCards(limit);
            const { cards, info } = splitSwipeItems(items);
            setQueue((prev) => dedupeQueue([...prev, ...cards]));
            if (info.summaryTags?.length) setSummaryTags(info.summaryTags);
            if (info.noCards) setNoCardsDebug(info.noCards);
        } catch (e: any) { setErr(String(e?.message ?? e)); }
        finally { setLoading(false); }
    }

    useEffect(() => {
        if (didInit.current) return;
        didInit.current = true;
        void init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const res = await fetch("/api/style-profile?lite=1", { cache: "no-store" });
                const data = await res.json();
                if (data?.history) {
                    setBaseHistory({
                        total: Number(data.history.total ?? 0) || 0,
                        likes: Number(data.history.likes ?? 0) || 0,
                        dislikes: Number(data.history.dislikes ?? 0) || 0,
                        neutral: Number(data.history.neutral ?? 0) || 0,
                    });
                }
            } catch (e) { console.warn("[BuyerSwipe] history fetch failed:", e); }
        };
        void fetchHistory();
    }, []);

    useEffect(() => {
        void refillIfNeeded(idx, queue.length);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idx, queue.length]);

    useEffect(() => {
        return () => { try { api.stop(); } catch { /* ignore */ } };
    }, [api]);

    const undo = useCallback(() => {
        if (history.length === 0) return;
        const last = history[history.length - 1];
        setIdx(last.idx);
        setHistory((h) => h.slice(0, -1));
        setSwipeCount((c) => Math.max(0, c - 1));
        api.set({ x: 0, opacity: 1, rotateY: 0 });
    }, [api, history]);

    async function safePost(impressionId: string, actionKind: ActionKind, meta?: any) {
        const rating = actionToRating(actionKind);
        const actionDb = actionToDb(actionKind);
        try {
            if (rating !== 0) await postRating(impressionId, rating);
            await postAction(impressionId, actionDb, meta);
        } catch (e: any) { console.error("post error:", e); }
    }

    async function onAction(action: ActionKind, skipAnimation = false) {
        const curr = currentRef.current;
        if (!curr || processingRef.current) return;
        setErr(null);
        if (!curr.impressionId) {
            setErr("impressionId が null です（impressions insert失敗の可能性）");
            setIdx((v) => v + 1);
            return;
        }
        setProcessing(true);
        try {
            setHistory((h) => [...h, { idx, action, impressionId: curr.impressionId! }]);
            if (action === "like") { setShowConfetti(true); setTimeout(() => setShowConfetti(false), 1500); }
            if (!skipAnimation) {
                if (action === "like") await api.start({ x: 520, opacity: 0, rotateY: 18 });
                else if (action === "dislike") await api.start({ x: -520, opacity: 0, rotateY: -18 });
                else await api.start({ opacity: 0 });
            }
            const card = curr?.payload?.kind === "swipe_card" ? curr.payload : null;
            const meta = {
                kind: "swipe", action,
                card_id: card?.card_id ?? null,
                tags: Array.isArray(card?.tags) ? card.tags.slice(0, 30) : [],
                title: card?.title ?? null, image_url: card?.image_url ?? null,
                targetId: curr.targetId ?? null, recType: curr.recType ?? null,
                rank: curr.rank ?? null, ts: new Date().toISOString(),
            };
            void safePost(curr.impressionId, action, meta);
            setSwipeCount((c) => c + 1);
            setIdx((v) => v + 1);
            api.set({ x: 0, opacity: 1, rotateY: 0 });
        } finally { setProcessing(false); }
    }

    function sendTagFeedback(tag: string, signal: "more" | "less") {
        const curr = currentRef.current;
        if (!curr?.impressionId) { setErr("impressionId が null です"); return; }
        setTagSignals((prev) => ({ ...prev, [tag]: signal }));
        void postAction(curr.impressionId, "neutral", {
            kind: "tag_feedback", tag, signal, ts: new Date().toISOString(),
        }).catch((e: any) => { console.error("tag feedback error:", e); });
    }

    useEffect(() => {
        onActionRef.current = onAction;
        undoRef.current = undo;
    }, [undo]);

    const openTab = useCallback(
        (tab: "profile" | "similar" | "recommendations" | "shops") => {
            setActiveTab(tab);
            setMountedTabs((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));
        }, []
    );

    const bind = useDrag(
        ({ down, movement: [mx], velocity: [vx], cancel }) => {
            if (processingRef.current) return;
            if (down) {
                const r = Math.max(-22, Math.min(22, mx * 0.06));
                api.start({ x: mx, rotateY: r, immediate: true });
            } else {
                const trigger = Math.abs(mx) > 120 || Math.abs(vx) > 0.5;
                if (trigger) { cancel?.(); void onAction(mx > 0 ? "like" : "dislike"); }
                else { api.start({ x: 0, rotateY: 0 }); }
            }
        },
        { axis: "x", filterTaps: true }
    );

    useEffect(() => {
        function handleKey(e: KeyboardEvent) {
            const target = e.target as HTMLElement | null;
            if (target) {
                const tag = target.tagName;
                if (tag === "INPUT" || tag === "TEXTAREA" || (target as any).isContentEditable) return;
            }
            if (e.repeat || processingRef.current || !currentRef.current) return;
            const key = e.key;
            const code = e.code;
            if ((e.metaKey || e.ctrlKey) && !e.shiftKey && key.toLowerCase() === "z") { e.preventDefault(); undoRef.current?.(); return; }
            if (key === "ArrowLeft") { e.preventDefault(); void onActionRef.current?.("dislike"); return; }
            if (key === "ArrowDown") { e.preventDefault(); void onActionRef.current?.("neutral"); return; }
            if (key === "ArrowRight") { e.preventDefault(); void onActionRef.current?.("like"); return; }
            if (code === "Space" || key === " " || key === "Spacebar") { e.preventDefault(); void onActionRef.current?.("skip"); return; }
        }
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, []);

    async function loadShopRecs() {
        setErr(null); setShopsLoading(true);
        try { const items = await fetchShops(10); setShops(items); }
        catch (e: any) { setErr(String(e?.message ?? e)); }
        finally { setShopsLoading(false); }
    }

    useEffect(() => {
        if (autoLoadedShopsRef.current || shopsLoading || shops.length > 0 || swipeCount < 10) return;
        autoLoadedShopsRef.current = true;
        void loadShopRecs();
    }, [swipeCount, shopsLoading, shops.length]);

    const card = current?.payload?.kind === "swipe_card" ? current.payload : null;
    const emptyNow = !loading && (!queue.length || idx >= queue.length);
    const priceMeta = getPriceBandMeta(card?.price_band);
    const cardTags = Array.isArray(card?.tags) ? [...new Set<string>(card.tags.map(String))].slice(0, 14) : [];

    const likeOpacity = x.to((xVal) => (xVal > 30 ? Math.min(1, (xVal - 30) / 120) : 0));
    const nopeOpacity = x.to((xVal) => (xVal < -30 ? Math.min(1, (-xVal - 30) / 120) : 0));

    const TABS = [
        { id: "profile", label: "プロファイル", icon: "🧠" },
        { id: "similar", label: "似たユーザー", icon: "👥" },
        { id: "recommendations", label: "おすすめ", icon: "✨" },
        { id: "shops", label: "ショップ", icon: "🏪" },
    ] as const;

    return (
        <div className="space-y-6">
            {showConfetti && <Confetti />}

            {err && (
                <GlassCard variant="bordered" className="p-4 text-sm font-semibold text-rose-600">
                    {err}
                </GlassCard>
            )}

            {/* ── Style DNA バー ── */}
            {!!summaryTags.length && (
                <GlassCard className="p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">🧬</span>
                            <div>
                                <div className="text-[10px] uppercase tracking-[0.15em] text-slate-400 font-bold">Style DNA</div>
                                <div className="text-sm font-black text-slate-800">あなたの好み</div>
                            </div>
                        </div>
                        <GlassBadge variant="gradient" size="sm">{summaryTags.length} tags</GlassBadge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {summaryTags.slice(0, 12).map((t) => (
                            <span key={t} className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-600">
                                {t}
                            </span>
                        ))}
                    </div>
                </GlassCard>
            )}

            {/* ── No Cards Debug ── */}
            {!!noCardsDebug && (
                <GlassCard className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-2xl shrink-0">⚠️</div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <div className="text-base font-black text-slate-900">カード候補が空です</div>
                                <GlassBadge variant="warning" size="sm">No Cards</GlassBadge>
                            </div>
                            <div className="mt-1 text-sm text-slate-600">{noCardsDebug.hint ?? "利用可能なカードが不足しています。"}</div>
                            <div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs">
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700 font-bold">
                                    active: {noCardsDebug.active_cards ?? 0}
                                </div>
                                <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sky-700 font-bold">
                                    seen: {noCardsDebug.seen_count_14d ?? 0}
                                </div>
                                <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-violet-700 font-bold">
                                    推奨: カード追加
                                </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <GlassButton size="sm" variant="default" onClick={async () => {
                                    try {
                                        const r = await fetch("/api/recommendations/reset-seen", {
                                            method: "POST", credentials: "include",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ role: "buyer", v: 2, scope: "cards" }),
                                        });
                                        const j = await r.json().catch(() => ({ ok: false, error: "Invalid JSON" }));
                                        if (!j.ok) throw new Error(j.error || "reset failed");
                                        await init();
                                    } catch (e: any) { setErr(String(e?.message ?? e)); }
                                }}>見たカードをリセット</GlassButton>
                                <GlassButton size="sm" variant="default" onClick={init}>Reload</GlassButton>
                                <GlassButton size="sm" variant="ghost" href="/admin/cards">管理画面</GlassButton>
                            </div>
                        </div>
                    </div>
                </GlassCard>
            )}

            {/* ── メイングリッド ── */}
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                {/* 左カラム */}
                <div className="space-y-5">
                    {/* ── コンパクトステータスヘッダー ── */}
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 rounded-2xl bg-white/80 backdrop-blur-sm border border-white/80 px-4 py-2 shadow-sm">
                                <span className="text-sm font-black text-slate-900">{totalStats.total}</span>
                                <span className="text-[10px] text-slate-400 uppercase font-bold">Swipes</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1">
                                    <span className="text-xs">💚</span>
                                    <span className="text-xs font-black text-emerald-600">{totalStats.likes}</span>
                                </div>
                                <div className="flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2.5 py-1">
                                    <span className="text-xs">❌</span>
                                    <span className="text-xs font-black text-red-500">{totalStats.dislikes}</span>
                                </div>
                                <div className="flex items-center gap-1 rounded-full bg-slate-50 border border-slate-200 px-2.5 py-1">
                                    <span className="text-xs">⏭️</span>
                                    <span className="text-xs font-black text-slate-500">{totalStats.neutral}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => setFocusMode((v) => !v)}
                                className={`rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition ${
                                    focusMode
                                        ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg"
                                        : "bg-white/80 border border-slate-200 text-slate-500 hover:text-slate-700"
                                }`}
                            >
                                {focusMode ? "Focus ●" : "Focus"}
                            </button>
                            <button
                                onClick={undo}
                                disabled={history.length === 0 || processing}
                                className="rounded-xl bg-white/80 border border-slate-200 px-3 py-1.5 text-[10px] font-black uppercase text-slate-500 hover:text-slate-700 disabled:opacity-40 transition"
                            >
                                Undo
                            </button>
                            <button
                                onClick={init}
                                disabled={loading}
                                className="rounded-xl bg-white/80 border border-slate-200 px-3 py-1.5 text-[10px] font-black uppercase text-slate-500 hover:text-slate-700 disabled:opacity-40 transition"
                            >
                                {loading ? "..." : "Reload"}
                            </button>
                        </div>
                    </div>

                    {/* プログレスバー */}
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500 transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>

                    {/* ── スワイプカード ── */}
                    <GlassCard variant="elevated" className="p-5 overflow-hidden">
                        {/* タイトル行 */}
                        <div className="flex items-center justify-between gap-3 mb-4">
                            <div className="flex items-center gap-2">
                                <span className="text-lg">🃏</span>
                                <div className="text-base font-black text-slate-900">
                                    {card?.title ?? "Swipe Cards"}
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <GlassBadge size="sm" className="bg-violet-50 text-violet-600 border-violet-200">
                                    残り {remaining}
                                </GlassBadge>
                                <GlassBadge size="sm" className={priceMeta.className}>
                                    {priceMeta.label}
                                </GlassBadge>
                            </div>
                        </div>

                        {emptyNow ? (
                            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-8 text-center">
                                <div className="text-4xl mb-3">🎴</div>
                                <div className="text-sm font-bold text-slate-600">カードがありません</div>
                                <div className="text-xs text-slate-400 mt-1">全部seen / is_active=false など</div>
                                <div className="mt-4">
                                    <GlassButton size="sm" variant="default" onClick={init}>Reload</GlassButton>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* カード本体 */}
                                <div className="relative">
                                    {/* グロー */}
                                    <div className="absolute -inset-4 rounded-[32px] bg-gradient-to-br from-violet-500/15 via-cyan-400/8 to-pink-400/15 blur-2xl" />

                                    <div className="relative mx-auto max-w-md">
                                        {/* カードスタック */}
                                        <div className="absolute inset-0 -z-10 flex items-center justify-center">
                                            <div className="absolute h-full w-full rounded-[28px] border border-white/50 bg-white/40 backdrop-blur-xl" />
                                            <div className="absolute h-[96%] w-[96%] -rotate-2 rounded-[26px] border border-white/30 bg-white/30" />
                                            <div className="absolute h-[92%] w-[92%] rotate-2 rounded-[24px] border border-white/20 bg-white/20" />
                                        </div>

                                        <animated.div
                                            key={current?.impressionId ?? `cur-${idx}`}
                                            {...bind()}
                                            style={{
                                                x, opacity,
                                                transform: springTo([x, rotateY], (xVal, r) =>
                                                    `translate3d(${xVal}px, 0, 0) perspective(1000px) rotateY(${r}deg)`
                                                ),
                                                boxShadow: x.to((xVal) => {
                                                    if (xVal > 50) return "0 0 50px rgba(34,197,94,0.5)";
                                                    if (xVal < -50) return "0 0 50px rgba(239,68,68,0.5)";
                                                    return "0 0 0 rgba(0,0,0,0)";
                                                }),
                                                touchAction: "pan-y",
                                            }}
                                            className="relative aspect-[3/4] w-full overflow-hidden rounded-[28px] border border-white/70 bg-white/50 shadow-2xl shadow-slate-900/10"
                                        >
                                            {card?.image_url && !imageError ? (
                                                <img
                                                    src={card.image_url}
                                                    alt={card?.title ?? "card"}
                                                    className="absolute inset-0 h-full w-full object-cover select-none pointer-events-none"
                                                    draggable={false}
                                                    onError={() => setImageError(true)}
                                                />
                                            ) : (
                                                <div className="flex h-full items-center justify-center text-sm text-slate-600 bg-gradient-to-br from-slate-100/80 via-white/60 to-violet-100/60">
                                                    画像を準備中です
                                                </div>
                                            )}

                                            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-slate-900/15 to-transparent" />

                                            {/* LIKE / NOPE オーバーレイ */}
                                            <animated.div
                                                style={{ opacity: likeOpacity }}
                                                className="absolute left-4 top-4 rounded-2xl border-2 border-emerald-400 bg-emerald-500/20 px-4 py-1.5 text-base font-black text-emerald-100 backdrop-blur-md shadow-lg"
                                            >
                                                LIKE ♥
                                            </animated.div>
                                            <animated.div
                                                style={{ opacity: nopeOpacity }}
                                                className="absolute right-4 top-4 rounded-2xl border-2 border-rose-400 bg-rose-500/20 px-4 py-1.5 text-base font-black text-rose-100 backdrop-blur-md shadow-lg"
                                            >
                                                NOPE ✕
                                            </animated.div>

                                            {card?.source && (
                                                <div className="absolute right-4 top-4">
                                                    <span className="rounded-full border border-white/40 bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/80 backdrop-blur-md">
                                                        {card.source}
                                                    </span>
                                                </div>
                                            )}

                                            <div className="absolute bottom-0 left-0 right-0 p-5">
                                                <div className="text-xl font-black text-white drop-shadow-lg">
                                                    {card?.title ?? "Swipe Cards"}
                                                </div>
                                                {!!cardTags.length && (
                                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                                        {cardTags.slice(0, 6).map((t) => (
                                                            <span key={t} className="rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5 text-[11px] font-bold text-white/90 backdrop-blur-md">
                                                                {t}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </animated.div>
                                    </div>
                                </div>

                                {showDetails && card?.reason && (
                                    <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/50 p-3 text-sm text-slate-700">
                                        <span className="mr-2 text-[10px] uppercase tracking-wider text-violet-400 font-bold">AI Reason</span>
                                        {card.reason}
                                    </div>
                                )}

                                {/* ── アクションボタン（プレミアム版） ── */}
                                <div className="mt-6 flex items-center justify-center gap-4">
                                    <button
                                        className="group relative w-16 h-16 rounded-full bg-white border-2 border-red-200 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 hover:border-red-400 active:scale-95 transition-all disabled:opacity-40"
                                        onClick={() => onAction("dislike")}
                                        disabled={processing || !current}
                                    >
                                        <span className="text-2xl">✕</span>
                                        <span className="absolute -bottom-5 text-[9px] font-black uppercase text-red-400">Nope</span>
                                    </button>

                                    <button
                                        className="group relative w-12 h-12 rounded-full bg-white border-2 border-amber-200 flex items-center justify-center shadow-md hover:shadow-lg hover:scale-110 hover:border-amber-400 active:scale-95 transition-all disabled:opacity-40"
                                        onClick={() => onAction("neutral")}
                                        disabled={processing || !current}
                                    >
                                        <span className="text-lg">🟡</span>
                                        <span className="absolute -bottom-5 text-[9px] font-black uppercase text-amber-500">Meh</span>
                                    </button>

                                    <button
                                        className="group relative w-12 h-12 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center shadow-md hover:shadow-lg hover:scale-110 hover:border-slate-400 active:scale-95 transition-all disabled:opacity-40"
                                        onClick={() => onAction("skip")}
                                        disabled={processing || !current}
                                    >
                                        <span className="text-lg">⏭️</span>
                                        <span className="absolute -bottom-5 text-[9px] font-black uppercase text-slate-400">Skip</span>
                                    </button>

                                    <button
                                        className="group relative w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 border-2 border-emerald-300 flex items-center justify-center shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/40 hover:scale-110 active:scale-95 transition-all disabled:opacity-40"
                                        onClick={() => onAction("like")}
                                        disabled={processing || !current}
                                    >
                                        <span className="text-2xl text-white">♥</span>
                                        <span className="absolute -bottom-5 text-[9px] font-black uppercase text-emerald-500">Like</span>
                                    </button>
                                </div>

                                {/* Next Up */}
                                {queue.slice(idx + 1, idx + 4).length > 0 && (
                                    <div className="mt-8">
                                        <div className="text-[10px] uppercase tracking-[0.15em] text-slate-400 font-bold mb-2">Next Up</div>
                                        <div className="flex gap-2 overflow-x-auto pb-1">
                                            {queue.slice(idx + 1, idx + 4).map((item, i) => {
                                                const c = item?.payload?.kind === "swipe_card" ? item.payload : null;
                                                const u = c ? normalizeImg(String(c.image_url ?? "")) : "";
                                                return (
                                                    <div key={item.impressionId ?? `next-${idx}-${i}`} className="shrink-0 w-24 rounded-2xl border border-white/80 bg-white/70 p-1.5 shadow-sm">
                                                        {u ? (
                                                            <img src={u} alt="" className="h-20 w-full rounded-xl object-cover" />
                                                        ) : (
                                                            <div className="h-20 flex items-center justify-center text-xs text-slate-400 bg-slate-50 rounded-xl">No img</div>
                                                        )}
                                                        <div className="mt-1 truncate text-[10px] font-bold text-slate-500 px-1">{c?.title ?? "Next"}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* ショートカットヒント */}
                                <div className="mt-4 flex justify-center">
                                    <div className="flex items-center gap-3 rounded-full bg-slate-50 border border-slate-100 px-4 py-1.5 text-[10px] text-slate-400 font-bold">
                                        <span>← Nope</span>
                                        <span className="text-slate-200">|</span>
                                        <span>→ Like</span>
                                        <span className="text-slate-200">|</span>
                                        <span>↓ Meh</span>
                                        <span className="text-slate-200">|</span>
                                        <span>Space Skip</span>
                                    </div>
                                </div>
                            </>
                        )}
                    </GlassCard>
                </div>

                {/* 右カラム（サイドバー） */}
                {!focusMode && (
                    <div className="space-y-5">
                        {/* カード詳細 */}
                        <GlassCard className="relative overflow-hidden p-5">
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-cyan-500/5" />
                            <div className="relative">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm">🧭</span>
                                        <span className="text-sm font-black text-slate-800">カード詳細</span>
                                    </div>
                                    <GlassBadge size="sm" className={priceMeta.className}>{priceMeta.label}</GlassBadge>
                                </div>

                                <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3 mb-3">
                                    <div className="text-[10px] uppercase tracking-wider text-violet-400 font-bold">AI Reason</div>
                                    <div className="mt-1 text-sm text-slate-700 leading-relaxed">
                                        {card?.reason ?? "スワイプを続けるほど、推薦理由が具体的に"}
                                    </div>
                                    {current?.explain && (
                                        <div className="mt-1 text-xs text-slate-500">note: {current.explain}</div>
                                    )}
                                </div>

                                {/* タグ微調整 */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">タグ微調整</div>
                                        <div className="text-[9px] text-slate-400">+ 増 / - 減</div>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {cardTags.length ? (
                                            cardTags.map((t) => {
                                                const signal = tagSignals[t];
                                                const stateClass =
                                                    signal === "more" ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                                    : signal === "less" ? "border-rose-300 bg-rose-50 text-rose-700"
                                                    : "border-slate-200 bg-white text-slate-600";
                                                return (
                                                    <div key={t} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-bold ${stateClass}`}>
                                                        <span>{t}</span>
                                                        <button type="button" className="rounded-full bg-emerald-100 px-1 text-[9px] text-emerald-600 hover:bg-emerald-200 transition" onClick={() => sendTagFeedback(t, "more")}>＋</button>
                                                        <button type="button" className="rounded-full bg-rose-100 px-1 text-[9px] text-rose-600 hover:bg-rose-200 transition" onClick={() => sendTagFeedback(t, "less")}>－</button>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="text-xs text-slate-400">タグがありません</div>
                                        )}
                                    </div>
                                </div>

                                {/* クレジット */}
                                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                                    {card?.source && (
                                        <span className="rounded-full border border-slate-100 bg-slate-50 px-2 py-0.5 font-bold">
                                            {card.source}
                                        </span>
                                    )}
                                    {card?.credit?.photographer_name && (
                                        <span className="rounded-full border border-slate-100 bg-slate-50 px-2 py-0.5 font-bold">
                                            📷 {card.credit.photographer_name}
                                        </span>
                                    )}
                                </div>

                                {card?.credit?.source_page_url && (
                                    <a
                                        href={card.credit.source_page_url}
                                        className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        🔗 元ページを見る
                                    </a>
                                )}
                            </div>
                        </GlassCard>

                        {/* キーボードショートカット */}
                        <GlassCard className="p-4">
                            <div className="text-xs font-black text-slate-700 mb-2">⌨️ ショートカット</div>
                            <div className="space-y-1.5 text-[11px]">
                                {[
                                    { keys: "← / →", desc: "Nope / Like" },
                                    { keys: "↓", desc: "Meh" },
                                    { keys: "Space", desc: "Skip" },
                                    { keys: "⌘Z", desc: "Undo" },
                                ].map((s) => (
                                    <div key={s.keys} className="flex items-center justify-between">
                                        <span className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 font-mono font-bold text-slate-600">{s.keys}</span>
                                        <span className="text-slate-500 font-bold">{s.desc}</span>
                                    </div>
                                ))}
                            </div>
                        </GlassCard>
                    </div>
                )}
            </div>

            {/* ── タブセクション ── */}
            {!focusMode && (
                <GlassCard className="p-5">
                    <div className="flex flex-wrap gap-2 mb-4">
                        {TABS.map((tab) => {
                            const active = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => openTab(tab.id)}
                                    className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-black transition ${
                                        active
                                            ? "border-violet-500 bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/20"
                                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300"
                                    }`}
                                >
                                    <span>{tab.icon}</span>
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    <div>
                        {mountedTabs.profile && activeTab === "profile" && (
                            <div className="rounded-2xl border border-slate-100 bg-white/80 p-4">
                                <RecoProfilePanel />
                            </div>
                        )}

                        {mountedTabs.similar && activeTab === "similar" && (
                            <div className="rounded-2xl border border-slate-100 bg-white/80 p-4">
                                <h3 className="text-lg font-black text-slate-900 mb-4">👥 似たユーザーの好み</h3>
                                <SimilarUsersPanel />
                            </div>
                        )}

                        {mountedTabs.recommendations && activeTab === "recommendations" && (
                            <div className="rounded-2xl border border-slate-100 bg-white/80 p-4 space-y-4">
                                <h3 className="text-lg font-black text-slate-900">✨ 次世代レコメンドエンジン</h3>
                                <UltimateRecommendationsPanel />
                                <div className="pt-2"><HybridRecommendationsPanel /></div>
                            </div>
                        )}

                        {mountedTabs.shops && activeTab === "shops" && (
                            <div className="rounded-2xl border border-slate-100 bg-white/80 p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="font-black text-slate-800">🏪 おすすめショップ</div>
                                    <GlassButton size="xs" variant="default" onClick={loadShopRecs} loading={shopsLoading}>Load</GlassButton>
                                </div>
                                <div className="text-[11px] text-slate-400 mb-3">Like/Dislikeを10枚以上すると出やすい</div>
                                <div className="space-y-2">
                                    {shops.map((it, i) => (
                                        <div key={it.impressionId ?? `${it.targetId}-${i}`} className="rounded-xl border border-slate-100 bg-white p-3">
                                            <div className="text-[10px] text-slate-400 font-bold">{it.recType}</div>
                                            <div className="mt-0.5 text-sm font-black text-slate-800">
                                                {it.targetType === "shop"
                                                    ? `shop: ${it.targetId ?? it.payload?.shop_id ?? it.payload?.shopKey ?? ""}`
                                                    : it.payload?.kind ?? it.targetType}
                                            </div>
                                            {it.explain && <div className="mt-1 text-xs text-slate-600">{it.explain}</div>}
                                        </div>
                                    ))}
                                    {!shops.length && (
                                        <div className="text-sm text-slate-400">まだ未取得（Loadを押して）</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </GlassCard>
            )}
        </div>
    );
}
