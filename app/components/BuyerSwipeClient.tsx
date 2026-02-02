// app/components/BuyerSwipeClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSpring, animated, config, to as springTo } from "@react-spring/web";
import { useDrag } from "@use-gesture/react";

import RecoProfilePanel from "./RecoProfilePanel";
import SimilarUsersPanel from "./SimilarUsersPanel";
import UltimateRecommendationsPanel from "@/app/components/UltimateRecommendationsPanel";
import HybridRecommendationsPanel from "@/app/components/HybridRecommendationsPanel";

type Role = "buyer" | "seller";
type TargetType = "drop" | "shop" | "insight";
type ActionKind = "like" | "dislike" | "neutral" | "skip";

// DB制約に合わせる（recommendation_actions_action_check）
type ActionDb = "save" | "skip" | "neutral" | "click" | "purchase";

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

function actionToRating(action: ActionKind): -1 | 0 | 1 {
    if (action === "like") return 1;
    if (action === "dislike") return -1;
    return 0; // neutral / skip は 0
}

function actionToDb(action: ActionKind): ActionDb {
    // like/dislike は DB 的には save/skip に落とす（制約に合わせる）
    if (action === "like") return "save";
    if (action === "neutral") return "neutral";
    return "skip"; // dislike / skip は skip にまとめる
}

async function fetchCards(limit = 12) {
    const r = await fetch(`/api/recommendations?v=2&role=buyer&stream=cards&limit=${limit}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
    });
    const j: RecResp = await r.json().catch(() => ({ ok: false, error: "Invalid JSON response" }));
    if (!j.ok) throw new Error(j.error || "fetch failed");
    return j.items ?? [];
}

async function fetchShops(limit = 10) {
    const r = await fetch(`/api/recommendations?v=2&role=buyer&stream=shops&limit=${limit}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
    });
    const j: RecResp = await r.json().catch(() => ({ ok: false, error: "Invalid JSON response" }));
    if (!j.ok) throw new Error(j.error || "fetch failed");
    return j.items ?? [];
}

async function postRating(impressionId: string, rating: -1 | 0 | 1) {
    const r = await fetch(`/api/recommendations/rating`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ impressionId, rating, recVersion: 2 }),
    });
    const j = await r.json().catch(() => ({ ok: false, error: "Invalid JSON" }));
    if (!j.ok) throw new Error(j.error || "rating failed");
    return j;
}

async function postAction(impressionId: string, action: ActionDb, meta?: any) {
    const r = await fetch(`/api/recommendations/action`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ impressionId, action, meta, recVersion: 2 }),
    });
    const j = await r.json().catch(() => ({ ok: false, error: "Invalid JSON" }));
    if (!j.ok) throw new Error(j.error || "action failed");
    return j;
}

function normalizeImg(url: string): string {
    if (!url) return "";
    if (url.startsWith("/")) return url;
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    return "";
}

function dedupeQueue(items: RecItem[]): RecItem[] {
    const seen = new Set<string>();
    const out: RecItem[] = [];
    for (const it of items) {
        const cardId =
            it?.payload?.card_id != null
                ? String(it.payload.card_id)
                : it?.payload?.id != null
                    ? String(it.payload.id)
                    : "";

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

/**
 * API items を「カード」と「情報」に分離
 */
function splitSwipeItems(items: RecItem[]) {
    const info: {
        summaryTags?: string[];
        noCards?: { hint?: string; active_cards?: number; seen_count_14d?: number };
    } = {};

    const cards = (items ?? [])
        .filter((it) => it?.payload?.kind === "swipe_card")
        .map((it) => ({
            ...it,
            payload: {
                ...it.payload,
                image_url: normalizeImg(String(it?.payload?.image_url ?? "")),
            },
        }));

    for (const it of items ?? []) {
        if (it?.payload?.kind === "swipe_summary") {
            // API側が top_tags の想定だけど、tags も来たら拾う
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

/**
 * Confetti
 * - app/globals.css に .animate-confetti を定義している前提
 *   （--confetti-x / --confetti-y / --confetti-r を使う版）
 */
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

export default function BuyerSwipeClient({ limit = 12 }: { limit?: number }) {
    const [queue, setQueue] = useState<RecItem[]>([]);
    const [idx, setIdx] = useState(0);

    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);

    const [ratedCount, setRatedCount] = useState(0);
    const [swipeCount, setSwipeCount] = useState(0);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [showConfetti, setShowConfetti] = useState(false);

    const [shops, setShops] = useState<RecItem[]>([]);
    const [shopsLoading, setShopsLoading] = useState(false);

    const [summaryTags, setSummaryTags] = useState<string[]>([]);
    const [noCardsDebug, setNoCardsDebug] = useState<{
        hint?: string;
        active_cards?: number;
        seen_count_14d?: number;
    } | null>(null);

    const current = useMemo(() => queue[idx] ?? null, [queue, idx]);
    const remaining = Math.max(0, queue.length - idx);

    const [{ x, opacity, rotateY }, api] = useSpring<{ x: number; opacity: number; rotateY: number }>(() => ({
        x: 0,
        opacity: 1,
        rotateY: 0,
        config: config.wobbly,
    }));

    const didInit = useRef(false);

    // --- refs: キーボード操作が「最新の state/closure」を必ず使うため ---
    const currentRef = useRef<RecItem | null>(null);
    const processingRef = useRef(false);
    const onActionRef = useRef<((action: ActionKind, skipAnimation?: boolean) => Promise<void>) | null>(null);
    const undoRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        currentRef.current = current;
    }, [current]);

    useEffect(() => {
        processingRef.current = processing;
    }, [processing]);

    async function init() {
        setErr(null);
        setLoading(true);
        setQueue([]);
        setIdx(0);
        setSummaryTags([]);
        setNoCardsDebug(null);

        try {
            const items = await fetchCards(limit);
            const { cards, info } = splitSwipeItems(items);

            setQueue(dedupeQueue(cards));
            setIdx(0);
            setRatedCount(0);
            setSwipeCount(0);
            setHistory([]);
            setShops([]);

            if (info.summaryTags?.length) setSummaryTags(info.summaryTags);
            if (info.noCards) setNoCardsDebug(info.noCards);
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
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
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (didInit.current) return;
        didInit.current = true;
        void init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        void refillIfNeeded(idx, queue.length);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idx, queue.length]);

    // cleanup（eslintに素直）
    useEffect(() => {
        return () => {
            try {
                api.stop();
            } catch {
                // ignore
            }
        };
    }, [api]);

    const undo = useCallback(() => {
        if (history.length === 0) return;
        const last = history[history.length - 1];

        setIdx(last.idx);
        setHistory((h) => h.slice(0, -1));
        setSwipeCount((c) => Math.max(0, c - 1));

        const rating = actionToRating(last.action);
        if (rating !== 0) setRatedCount((c) => Math.max(0, c - 1));

        api.set({ x: 0, opacity: 1, rotateY: 0 });
    }, [api, history]);

    async function safePost(impressionId: string, actionKind: ActionKind, meta?: any) {
        const rating = actionToRating(actionKind);
        const actionDb = actionToDb(actionKind);

        try {
            if (rating !== 0) {
                await postRating(impressionId, rating);
            }
            await postAction(impressionId, actionDb, meta);
        } catch (e: any) {
            console.error("post error:", e);
            // setErr(String(e?.message ?? e));
        }
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
            const rating = actionToRating(action);
            setHistory((h) => [...h, { idx, action, impressionId: curr.impressionId! }]);

            if (action === "like") {
                setShowConfetti(true);
                setTimeout(() => setShowConfetti(false), 1500);
            }

            if (!skipAnimation) {
                if (action === "like") {
                    await api.start({ x: 520, opacity: 0, rotateY: 18 });
                } else if (action === "dislike") {
                    await api.start({ x: -520, opacity: 0, rotateY: -18 });
                } else {
                    await api.start({ opacity: 0 });
                }
            }

            const card = curr?.payload?.kind === "swipe_card" ? curr.payload : null;
            const meta = {
                kind: "swipe",
                action,
                card_id: card?.card_id ?? null,
                tags: Array.isArray(card?.tags) ? card.tags.slice(0, 30) : [],
                title: card?.title ?? null,
                image_url: card?.image_url ?? null,
                targetId: curr.targetId ?? null,
                recType: curr.recType ?? null,
                rank: curr.rank ?? null,
                ts: new Date().toISOString(),
            };

            // fire-and-forget（UIを止めない）
            void safePost(curr.impressionId, action, meta);

            setSwipeCount((c) => c + 1);
            if (rating !== 0) setRatedCount((c) => c + 1);

            setIdx((v) => v + 1);
            api.set({ x: 0, opacity: 1, rotateY: 0 });
        } finally {
            setProcessing(false);
        }
    }

    // refsに最新版を入れる（keydownは常にref経由で最新ロジックを呼ぶ）
    useEffect(() => {
        onActionRef.current = onAction;
        undoRef.current = undo;
    }, [undo]);

    const bind = useDrag(
        ({ down, movement: [mx], velocity: [vx], cancel }) => {
            if (processingRef.current) return;

            if (down) {
                const r = Math.max(-22, Math.min(22, mx * 0.06));
                api.start({ x: mx, rotateY: r, immediate: true });
            } else {
                const trigger = Math.abs(mx) > 120 || Math.abs(vx) > 0.5;
                if (trigger) {
                    cancel?.();
                    void onAction(mx > 0 ? "like" : "dislike");
                } else {
                    api.start({ x: 0, rotateY: 0 });
                }
            }
        },
        { axis: "x", filterTaps: true }
    );

    // ✅ キーボード操作：1回だけ登録＋ref経由で最新ロジックを呼ぶ
    useEffect(() => {
        function handleKey(e: KeyboardEvent) {
            const target = e.target as HTMLElement | null;
            if (target) {
                const tag = target.tagName;
                if (tag === "INPUT" || tag === "TEXTAREA" || (target as any).isContentEditable) return;
            }

            if (e.repeat) return;
            if (processingRef.current) return;
            if (!currentRef.current) return;

            const key = e.key;
            const code = e.code;

            // Undo: Cmd/Ctrl+Z
            if ((e.metaKey || e.ctrlKey) && !e.shiftKey && key.toLowerCase() === "z") {
                e.preventDefault();
                undoRef.current?.();
                return;
            }

            if (key === "ArrowLeft") {
                e.preventDefault();
                void onActionRef.current?.("dislike");
                return;
            }
            if (key === "ArrowDown") {
                e.preventDefault();
                void onActionRef.current?.("neutral");
                return;
            }
            if (key === "ArrowRight") {
                e.preventDefault();
                void onActionRef.current?.("like");
                return;
            }

            // Space: ブラウザ差異に強く
            if (code === "Space" || key === " " || key === "Spacebar") {
                e.preventDefault();
                void onActionRef.current?.("skip");
                return;
            }
        }

        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, []);

    async function loadShopRecs() {
        setErr(null);
        setShopsLoading(true);
        try {
            const items = await fetchShops(10);
            setShops(items);
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setShopsLoading(false);
        }
    }

    const card = current?.payload?.kind === "swipe_card" ? current.payload : null;
    const emptyNow = !loading && (!queue.length || idx >= queue.length);

    return (
        <div className="space-y-6">
            {showConfetti && <Confetti />}

            {err && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700 animate-slide-down">
                    {err}
                </div>
            )}

            {!!summaryTags.length && (
                <div className="rounded-2xl border bg-white p-4">
                    <div className="text-sm text-gray-500">あなたの好み（上位タグ）</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {summaryTags.slice(0, 12).map((t) => (
                            <span key={t} className="rounded-full border bg-white px-2 py-1 text-xs text-gray-700">
                                {t}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {!!noCardsDebug && (
                <div className="rounded-2xl border bg-white p-4">
                    <div className="text-sm font-bold text-gray-800">カード候補が空です</div>
                    <div className="mt-1 text-sm text-gray-600">{noCardsDebug.hint ?? ""}</div>
                    <div className="mt-2 text-xs text-gray-500">
                        debug: active_cards={noCardsDebug.active_cards ?? 0}, seen_count_14d={noCardsDebug.seen_count_14d ?? 0}
                    </div>

                    {/* 任意：seenをリセット（ボタンが不要なら消してOK） */}
                    <div className="mt-3">
                        <button
                            onClick={async () => {
                                try {
                                    const r = await fetch("/api/recommendations/reset-seen", {
                                        method: "POST",
                                        credentials: "include",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ role: "buyer", v: 2, scope: "cards" }),
                                    });
                                    const j = await r.json().catch(() => ({ ok: false, error: "Invalid JSON" }));
                                    if (!j.ok) throw new Error(j.error || "reset failed");
                                    await init();
                                } catch (e: any) {
                                    setErr(String(e?.message ?? e));
                                }
                            }}
                            className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
                        >
                            見たカードをリセット
                        </button>
                    </div>
                </div>
            )}

            {/* ====== Card Area ====== */}
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                        <div className="text-sm text-gray-500">{current?.recType ?? "buyer_swipe_card"}</div>
                        <div className="text-lg font-semibold">{card?.title ?? "Swipe Cards"}</div>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-purple-600">
                            残り {remaining} 枚{remaining < 5 && remaining > 0 && " 🔄"}
                        </span>
                        <span className="text-sm text-gray-600">swipes: {swipeCount}</span>
                        <span className="text-sm text-gray-600">rated: {ratedCount}</span>

                        <button
                            onClick={undo}
                            disabled={history.length === 0 || processing}
                            className="rounded-md border px-3 py-1 text-sm transition-all hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            title="直前の操作を取り消し (Cmd/Ctrl+Z)"
                        >
                            ↩️ Undo
                        </button>

                        <button className="rounded-md border px-3 py-1 text-sm" onClick={init} disabled={loading}>
                            {loading ? "Loading..." : "Reload"}
                        </button>
                    </div>
                </div>

                {emptyNow ? (
                    <div className="rounded-xl border bg-gray-50 p-6 text-sm text-gray-600">
                        カードがありません（全部seen / is_active=false など）
                        <div className="mt-3">
                            <button className="rounded-md border bg-white px-3 py-2 text-sm" onClick={init}>
                                Reload
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex gap-4 overflow-x-auto pb-2">
                            {queue.slice(idx, idx + 4).map((item, i) => {
                                const c = item?.payload?.kind === "swipe_card" ? item.payload : null;
                                const u = c ? normalizeImg(String(c.image_url ?? "")) : "";

                                if (i === 0) {
                                    return (
                                        <animated.div
                                            key={item.impressionId ?? `cur-${idx}`}
                                            {...bind()}
                                            style={{
                                                x,
                                                opacity,
                                                transform: springTo([x, rotateY], (xVal, r) => {
                                                    return `translate3d(${xVal}px, 0, 0) perspective(1000px) rotateY(${r}deg)`;
                                                }),
                                                // ✅ ドラッグ中にリアルタイムで赤/緑に光らせる
                                                boxShadow: x.to((xVal) => {
                                                    if (xVal > 50) return "0 0 40px rgba(34,197,94,0.6)";
                                                    if (xVal < -50) return "0 0 40px rgba(239,68,68,0.6)";
                                                    return "0 0 0 rgba(0,0,0,0)";
                                                }),
                                                touchAction: "pan-y",
                                            }}
                                            className="shrink-0 w-full rounded-xl border bg-gray-50 overflow-hidden transition-shadow"
                                        >
                                            {u ? (
                                                <img
                                                    src={u}
                                                    alt={c?.title ?? "card"}
                                                    className="h-auto w-full object-cover select-none pointer-events-none"
                                                    draggable={false}
                                                />
                                            ) : (
                                                <div className="flex h-64 items-center justify-center text-sm text-gray-500">
                                                    画像URLが不正です
                                                </div>
                                            )}
                                        </animated.div>
                                    );
                                }

                                return (
                                    <div
                                        key={item.impressionId ?? `next-${idx}-${i}`}
                                        className="shrink-0 w-32 rounded-xl border bg-gray-50 overflow-hidden opacity-40 hover:opacity-60 transition-opacity"
                                    >
                                        {u ? (
                                            <img src={u} alt="" className="h-40 w-full object-cover" />
                                        ) : (
                                            <div className="h-40 flex items-center justify-center text-xs text-gray-400">No img</div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {card?.tags?.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {[...new Set<string>(card.tags)].slice(0, 14).map((t, idx) => (
                                    <span
                                        key={`${t}-${idx}`}
                                        className="rounded-full border bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                                    >
                                        {t}
                                    </span>
                                ))}
                            </div>
                        ) : null}

                        <div className="mt-4 grid grid-cols-3 gap-2">
                            <button
                                className="rounded-xl border bg-white px-3 py-3 text-sm hover:bg-red-50 hover:border-red-300 transition-all disabled:opacity-50"
                                onClick={() => onAction("dislike")}
                                disabled={processing || !current}
                            >
                                👎 Dislike
                            </button>

                            <button
                                className="rounded-xl border bg-white px-3 py-3 text-sm hover:bg-gray-100 transition-all disabled:opacity-50"
                                onClick={() => onAction("neutral")}
                                disabled={processing || !current}
                            >
                                😐 Neutral
                            </button>

                            <button
                                className="rounded-xl border bg-white px-3 py-3 text-sm hover:bg-green-50 hover:border-green-300 transition-all disabled:opacity-50"
                                onClick={() => onAction("like")}
                                disabled={processing || !current}
                            >
                                👍 Like
                            </button>

                            <button
                                className="col-start-2 rounded-xl border bg-white px-3 py-3 text-sm hover:bg-blue-50 hover:border-blue-300 transition-all disabled:opacity-50"
                                onClick={() => onAction("skip")}
                                disabled={processing || !current}
                            >
                                ⏭ Skip
                            </button>
                        </div>

                        <div className="mt-3 text-xs text-gray-500 text-center">
                            ⌨️ ← Dislike / ↓ Neutral / → Like / Space Skip / Cmd(Ctrl)+Z Undo
                        </div>

                        {current?.explain && <div className="mt-2 text-xs text-gray-500">note: {current.explain}</div>}
                    </>
                )}
            </div>

            {/* Profile */}
            <div className="rounded-2xl border bg-white p-5">
                <RecoProfilePanel />
            </div>

            {/* Similar Users */}
            <div className="rounded-2xl border bg-white p-5">
                <h3 className="text-2xl font-black text-gray-900 mb-4">👥 似たユーザーの好み</h3>
                <SimilarUsersPanel />
            </div>

            {/* Ultimate Recommendations + Hybrid */}
            <div className="rounded-2xl border bg-white p-5 space-y-4">
                <h3 className="text-2xl font-black text-gray-900 mb-1">🤖 次世代レコメンドエンジン</h3>

                {/* 既存 */}
                <UltimateRecommendationsPanel />

                {/* 追加（統合） */}
                <div className="mt-4">
                    <HybridRecommendationsPanel />
                </div>
            </div>

            {/* Shops */}
            <div className="rounded-2xl border bg-white p-4">
                <div className="flex items-center justify-between">
                    <div className="font-semibold">おすすめショップ（Swipe学習から）</div>
                    <button
                        className="rounded-md border px-3 py-1 text-sm"
                        onClick={loadShopRecs}
                        disabled={shopsLoading}
                    >
                        {shopsLoading ? "Loading..." : "Load"}
                    </button>
                </div>

                <div className="mt-2 text-sm text-gray-600">目安：Like/Dislike を10枚以上すると出やすい</div>

                <div className="mt-3 space-y-3">
                    {shops.map((it, i) => (
                        <div
                            key={it.impressionId ?? `${it.targetId}-${i}`}
                            className="rounded-xl border p-3 hover:shadow-md transition-shadow"
                        >
                            <div className="text-xs text-gray-500">{it.recType}</div>
                            <div className="mt-1 font-semibold">
                                {it.targetType === "shop"
                                    ? `shop: ${it.targetId ?? it.payload?.shop_id ?? it.payload?.shopKey ?? ""}`
                                    : it.payload?.kind ?? it.targetType}
                            </div>
                            {it.explain && <div className="mt-1 text-sm text-gray-700">{it.explain}</div>}
                        </div>
                    ))}
                    {!shops.length && <div className="text-sm text-gray-500">まだ未取得（Load を押して）</div>}
                </div>
            </div>
        </div>
    );
}
