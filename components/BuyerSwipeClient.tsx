// components/BuyerSwipeClient.tsx - ULTIMATE FIXED
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSpring, animated, config, to as springTo } from "@react-spring/web";
import { useDrag } from "@use-gesture/react";
import RecoProfilePanel from "./RecoProfilePanel";
import SimilarUsersPanel from "./SimilarUsersPanel"; // ✅ 追加

type Role = "buyer" | "seller";
type TargetType = "drop" | "shop" | "insight";
type ActionKind = "like" | "dislike" | "neutral" | "skip";

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

async function fetchCards(limit = 10) {
    const r = await fetch(
        `/api/recommendations?v=2&role=buyer&stream=cards&limit=${limit}`,
        { method: "GET", credentials: "include", cache: "no-store" }
    );
    const j: RecResp = await r.json().catch(() => ({ ok: false, error: "Invalid JSON response" }));
    if (!j.ok) throw new Error(j.error || "fetch failed");
    return j.items ?? [];
}

async function fetchShops(limit = 10) {
    const r = await fetch(
        `/api/recommendations?v=2&role=buyer&stream=shops&limit=${limit}`,
        { method: "GET", credentials: "include", cache: "no-store" }
    );
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

async function postAction(impressionId: string, action: string, meta?: any) {
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
    if (url.startsWith("/")) return url; // public 配下ならOK
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    return "";
}

function dedupeQueue(items: RecItem[]): RecItem[] {
    const seen = new Set<string>();
    const out: RecItem[] = [];
    for (const it of items) {
        const cardId = it?.payload?.card_id ? String(it.payload.card_id) : "";
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

/** ✨ Confetti：外部CSSファイル不要（globals.cssにanimate-confettiを定義する前提） */
function Confetti() {
    const particles = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        x: Math.random() * 120 - 60,      // vw
        y: Math.random() * 40 - 50,       // vh（開始位置）
        r: Math.random() * 360,           // deg
        color: ["#f97316", "#8b5cf6", "#14b8a6", "#f59e0b"][Math.floor(Math.random() * 4)],
        delay: Math.random() * 0.3,       // s
        size: 6 + Math.random() * 6,      // px
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
                        // ✅ keyframesが読むCSS変数
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

export default function BuyerSwipeClient() {
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

    const current = useMemo(() => queue[idx] ?? null, [queue, idx]);
    const remaining = Math.max(0, queue.length - idx);

    const [{ x, opacity, rotateY }, api] = useSpring<{
        x: number;
        opacity: number;
        rotateY: number;
    }>(() => ({
        x: 0,
        opacity: 1,
        rotateY: 0,
        config: config.wobbly,
    }));

    const didInit = useRef(false);

    async function init() {
        setErr(null);
        setLoading(true);
        setQueue([]);
        setIdx(0);
        try {
            const items = await fetchCards(12);
            setQueue(dedupeQueue(items));
            setIdx(0);
            setRatedCount(0);
            setSwipeCount(0);
            setHistory([]);
            setShops([]);
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
    }

    async function refillIfNeeded(nextIdx: number) {
        const remain = queue.length - nextIdx;
        if (loading) return;
        if (remain >= 5) return;
        setLoading(true);
        try {
            const more = await fetchCards(12);
            setQueue((prev) => dedupeQueue([...prev, ...more]));
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (didInit.current) return;
        didInit.current = true;
        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        refillIfNeeded(idx);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idx]);

    useEffect(() => {
        return () => api.stop();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function undo() {
        if (history.length === 0) return;
        const last = history[history.length - 1];
        setIdx(last.idx);
        setHistory((h) => h.slice(0, -1));
        setSwipeCount((c) => Math.max(0, c - 1));

        const rating = last.action === "like" ? 1 : last.action === "dislike" ? -1 : 0;
        if (rating !== 0) setRatedCount((c) => Math.max(0, c - 1));

        api.set({ x: 0, opacity: 1, rotateY: 0 });
    }

    async function safePost(impressionId: string, rating: -1 | 0 | 1) {
        try {
            await postRating(impressionId, rating);
            // MVP: like=>save, それ以外=>skip
            const action = rating === 1 ? "save" : "skip";
            await postAction(impressionId, action);
        } catch (e: any) {
            console.error("post error:", e);
        }
    }

    async function onAction(action: ActionKind, skipAnimation = false) {
        if (!current || processing) return;

        setErr(null);

        if (!current.impressionId) {
            setErr("impressionId が null です（impressions insert失敗の可能性）");
            setIdx((v) => v + 1);
            return;
        }

        setProcessing(true);

        const rating: -1 | 0 | 1 = action === "like" ? 1 : action === "dislike" ? -1 : 0;
        setHistory((h) => [...h, { idx, action, impressionId: current.impressionId! }]);

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

        safePost(current.impressionId, rating);

        setSwipeCount((c) => c + 1);
        if (rating !== 0) setRatedCount((c) => c + 1);

        setIdx((v) => v + 1);
        api.set({ x: 0, opacity: 1, rotateY: 0 });
        setProcessing(false);
    }

    const bind = useDrag(
        ({ down, movement: [mx], velocity: [vx], cancel }) => {
            if (processing) return;

            if (down) {
                const r = Math.max(-22, Math.min(22, mx * 0.06));
                api.start({ x: mx, rotateY: r, immediate: true });
            } else {
                const trigger = Math.abs(mx) > 120 || Math.abs(vx) > 0.5;
                if (trigger) {
                    cancel();
                    onAction(mx > 0 ? "like" : "dislike");
                } else {
                    api.start({ x: 0, rotateY: 0 });
                }
            }
        },
        { axis: "x", filterTaps: true }
    );

    useEffect(() => {
        function handleKey(e: KeyboardEvent) {
            const target = e.target as HTMLElement;
            if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

            if (e.key === "ArrowLeft") {
                e.preventDefault();
                onAction("dislike");
            }
            if (e.key === "ArrowDown") {
                e.preventDefault();
                onAction("neutral");
            }
            if (e.key === "ArrowRight") {
                e.preventDefault();
                onAction("like");
            }
            if (e.key === " ") {
                e.preventDefault();
                onAction("skip");
            }
            if (e.key.toLowerCase() === "z" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                undo();
            }
        }
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [current, processing, history]);

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
    const imgUrl = card ? normalizeImg(String(card.image_url ?? "")) : "";

    const dragDirection = x.get();
    const shadowColor =
        dragDirection > 50
            ? "shadow-[0_0_40px_rgba(34,197,94,0.6)]"
            : dragDirection < -50
                ? "shadow-[0_0_40px_rgba(239,68,68,0.6)]"
                : "";

    const emptyNow = !loading && (!queue.length || idx >= queue.length);

    return (
        <div className="space-y-6">
            {showConfetti && <Confetti />}

            {err && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700 animate-slide-down">
                    {err}
                </div>
            )}

            {/* ====== CARD AREA ====== */}
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                        <div className="text-sm text-gray-500">{current?.recType ?? "buyer_swipe_card"}</div>
                        <div className="text-lg font-semibold">{card?.title ?? "Swipe Cards"}</div>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-purple-600">
                            残り {remaining} 枚
                            {remaining < 5 && remaining > 0 && " 🔄"}
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
                        カードがありません（curated_cards 空 / is_active=false / 全部seen などの可能性）
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
                                            key={item.impressionId ?? `cur-${i}`}
                                            {...bind()}
                                            style={{
                                                x,
                                                opacity,
                                                transform: springTo([x, rotateY], (xVal, r) =>
                                                    `translate3d(${xVal}px, 0, 0) perspective(1000px) rotateY(${r}deg)`
                                                ),
                                                touchAction: "pan-y",
                                            }}
                                            className={`shrink-0 w-full rounded-xl border bg-gray-50 overflow-hidden transition-shadow ${shadowColor}`}
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
                                        key={item.impressionId ?? `next-${i}`}
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
                                {card.tags.slice(0, 14).map((t: string) => (
                                    <span
                                        key={t}
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

            {/* ✅ プロフィール表示 */}
            <div className="rounded-2xl border bg-white p-5">
                <RecoProfilePanel />
            </div>

            {/* ✅ 類似ユーザー推薦（追加） */}
            <div className="rounded-2xl border bg-white p-5">
                <h3 className="text-2xl font-black text-gray-900 mb-4">👥 似たユーザーの好み</h3>
                <SimilarUsersPanel />
            </div>

            {/* おすすめショップ */}
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
