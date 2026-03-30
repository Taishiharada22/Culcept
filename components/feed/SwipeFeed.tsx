// components/feed/SwipeFeed.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ActionKind = "like" | "dislike" | "neutral" | "skip";

type Role = "buyer" | "seller";
type TargetType = "drop" | "shop" | "insight" | "card";

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
    algorithm?: string;
    abGroup?: number;
    items?: RecItem[];
};

type SwipeCard = {
    card_id: string;
    image_url: string;
    tags?: string[] | null;
    is_active?: boolean;
    created_at?: string | null;
    impressionId?: string | null;
};

type SwipeCardsResp = { ok: true; cards: SwipeCard[] } | { ok: false; error: string };

type QueueItem =
    | {
        kind: "card";
        card_id: string;
        image_url: string;
        tags: string[];
        impressionId: string | null;
        recType: string;
        explain?: string | null;
        source: "recommendations" | "swipe";
    }
    | {
        kind: "insight";
        impressionId: string | null;
        recType: string;
        explain?: string | null;
        payload: any;
        source: "recommendations";
    };

// -----------------------------
// helpers
// -----------------------------
function normalizeImg(url: string): string {
    if (!url) return "";
    if (url.startsWith("/")) return url;
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    if (url.startsWith("file://")) return "";
    return "";
}

// underscore / dash 違いを同一視するキー
function normKey(cardId: string): string {
    return String(cardId || "")
        .trim()
        .toLowerCase()
        .replace(/_/g, "-")
        .replace(/-+/g, "-");
}

// /cards の壊れURLでも生きる候補を並べる（存在チェックはしない：img onError で試す）
function buildCardImgCandidates(src: string): string[] {
    const s = String(src || "").trim();
    if (!s) return [];

    // /cards/ 以外はそのまま
    if (!s.startsWith("/cards/")) return [s];

    let decoded = s;
    try {
        decoded = decodeURIComponent(s);
    } catch {
        // ignore
    }

    const pathOnly = decoded.split("?")[0];
    const filename = pathOnly.replace(/^\/cards\//, "");

    if (!filename.toLowerCase().endsWith(".png")) {
        // 念のため
        return [s, `/cards/${filename}.png`];
    }

    const base = filename.replace(/\.png$/i, "");

    const bases = Array.from(
        new Set([
            base,
            base.replace(/-/g, "_"),
            base.replace(/_/g, "-"),
            base.replace(/\s+/g, "_"),
        ])
    );

    const out: string[] = [];
    const push = (b: string) => {
        if (!b) return;
        out.push(`/cards/${b}.png`);
    };

    for (const b of bases) {
        // 1) そのまま
        push(b);

        // 2) "_2" or "-2" → "_2_2"
        if (/_2$/i.test(b)) push(`${b}_2`);
        if (/-2$/i.test(b)) push(`${b.replace(/-2$/i, "_2")}_2`);

        // 3) suffix 無しでも "_2_2" / "_2" を試す
        if (!/_2(_2)?$/i.test(b) && !/-2$/i.test(b)) {
            push(`${b}_2_2`);
            push(`${b}_2`);
        }
    }

    // 重複削除
    return Array.from(new Set(out));
}

// img が 404 でも候補を順番に試す
function ResilientCardImage({
    src,
    alt,
    className,
}: {
    src: string;
    alt: string;
    className?: string;
}) {
    const candidates = useMemo(() => buildCardImgCandidates(src), [src]);
    const [tryIdx, setTryIdx] = useState(0);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on prop change
        setTryIdx(0);
    }, [src]);

    const cur = candidates[tryIdx] ?? src;

    if (!cur) {
        return (
            <div className="flex h-64 items-center justify-center text-sm text-gray-500">
                画像URLが不正です（/cards/...）
            </div>
        );
    }

    const onError = () => {
        // 次の候補へ（無限ループ防止）
        setTryIdx((i) => {
            const next = i + 1;
            if (next >= candidates.length) return i; // 打ち止め
            return next;
        });
    };

    return <img src={cur} alt={alt} className={className} onError={onError} />;
}

// -----------------------------
// API fetchers
// -----------------------------
async function fetchRecoCards(limit = 12) {
    const r = await fetch(`/api/recommendations?v=2&role=buyer&stream=cards&limit=${limit}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
    });
    const j: RecResp = await r.json().catch(() => ({ ok: false, error: "Invalid JSON response" } as any));
    if (!j.ok) throw new Error(j.error || `recommendations failed (${r.status})`);
    return j.items ?? [];
}

async function fetchSwipeCards(limit = 20) {
    const r = await fetch(`/api/swipe/cards?limit=${limit}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
    });
    const j: SwipeCardsResp = await r.json().catch(() => ({ ok: false, error: "Invalid JSON response" } as any));
    if (!r.ok || !j.ok) throw new Error((j as any)?.error || `swipe/cards failed (${r.status})`);
    return (j as any).cards as SwipeCard[];
}

async function fetchShops(limit = 10) {
    const r = await fetch(`/api/recommendations?v=2&role=buyer&stream=shops&limit=${limit}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
    });
    const j: RecResp = await r.json().catch(() => ({ ok: false, error: "Invalid JSON response" } as any));
    if (!j.ok) throw new Error(j.error || "Unauthorized / fetch failed");
    return j.items ?? [];
}

async function postRating(impressionId: string, rating: -1 | 0 | 1) {
    const r = await fetch(`/api/recommendations/rating`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ impressionId, rating, recVersion: 2 }),
    });
    const j = await r.json().catch(() => ({ ok: false, error: "Invalid JSON response" }));
    if (!j.ok) throw new Error(j.error || "rating failed");
    return j;
}

async function postAction(impressionId: string, action: ActionKind) {
    const r = await fetch(`/api/recommendations/action`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ impressionId, action, recVersion: 2 }),
    });
    const j = await r.json().catch(() => ({ ok: false, error: "Invalid JSON response" }));
    if (!j.ok) throw new Error(j.error || "action failed");
    return j;
}

// -----------------------------
// Queue builders
// -----------------------------
function toQueueFromReco(items: RecItem[]): QueueItem[] {
    const out: QueueItem[] = [];

    for (const it of items) {
        const p = it?.payload ?? null;

        // insight扱い（no_cards含む）
        if (p?.kind === "no_cards" || it.targetType === "insight") {
            out.push({
                kind: "insight",
                impressionId: it.impressionId ?? null,
                recType: it.recType ?? "insight",
                explain: it.explain ?? p?.hint ?? null,
                payload: p,
                source: "recommendations",
            });
            continue;
        }

        // card扱い（image_url必須）
        const cardId = String(p?.card_id ?? p?.cardId ?? it.targetId ?? "");
        const imageUrl = String(p?.image_url ?? p?.imageUrl ?? "");
        if (!cardId || !imageUrl) continue;

        const tags: string[] = Array.isArray(p?.tags) ? p.tags.filter((x: any) => typeof x === "string") : [];

        out.push({
            kind: "card",
            card_id: cardId,
            image_url: imageUrl,
            tags,
            impressionId: it.impressionId ?? null,
            recType: it.recType ?? "reco_card",
            explain: it.explain ?? null,
            source: "recommendations",
        });
    }

    return out;
}

function toQueueFromSwipe(cards: SwipeCard[]): QueueItem[] {
    const out: QueueItem[] = [];
    for (const c of cards) {
        if (!c?.card_id || !c?.image_url) continue;
        out.push({
            kind: "card",
            card_id: String(c.card_id),
            image_url: String(c.image_url),
            tags: Array.isArray(c.tags) ? c.tags.filter((x) => typeof x === "string") : [],
            impressionId: (c as any).impressionId ?? null,
            recType: "swipe_cards_api",
            explain: null,
            source: "swipe",
        });
    }
    return out;
}

// localSeen を使って “二度と同じカード（正規化）を出さない”
function dedupeQueue(items: QueueItem[], localSeen: Set<string>): QueueItem[] {
    const seen = new Set<string>();
    const out: QueueItem[] = [];

    for (const it of items) {
        if (it.kind !== "card") {
            out.push(it);
            continue;
        }

        const key = normKey(it.card_id);
        if (!key) continue;

        if (localSeen.has(key)) continue;
        if (seen.has(key)) continue;

        seen.add(key);
        out.push(it);
    }

    return out;
}

// -----------------------------
// Component
// -----------------------------
export default function SwipeFeed() {
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [idx, setIdx] = useState(0);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const [ratedCount, setRatedCount] = useState(0);
    const [swipeCount, setSwipeCount] = useState(0);

    const [shops, setShops] = useState<RecItem[]>([]);
    const [shopsLoading, setShopsLoading] = useState(false);

    const current = useMemo(() => queue[idx] ?? null, [queue, idx]);
    const didInit = useRef(false);

    // Reloadしても同じカードを出さない（正規化キーで保持）
    const localSeenRef = useRef<Set<string>>(new Set());

    const LS_KEY = "culcept_swipe_seen_card_normkeys_v2";

    function loadLocalSeen() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return;
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
                localSeenRef.current = new Set(arr.filter((x) => typeof x === "string"));
            }
        } catch {
            // ignore
        }
    }

    function saveLocalSeen() {
        try {
            const arr = Array.from(localSeenRef.current);
            const trimmed = arr.slice(-5000); // 肥大化防止
            localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
        } catch {
            // ignore
        }
    }

    function markSeen(cardId: string) {
        const k = normKey(cardId);
        if (!k) return;
        localSeenRef.current.add(k);
        saveLocalSeen();
    }

    function clearLocalSeen() {
        localSeenRef.current = new Set();
        try {
            localStorage.removeItem(LS_KEY);
        } catch {
            // ignore
        }
    }

    // まず recommendations → 足りなければ swipe/cards fallback
    async function loadCardsBatch(batchSize = 20) {
        // 1) recommendations
        const reco = await fetchRecoCards(batchSize);
        const q1 = toQueueFromReco(reco);

        const recoCards = q1.filter((x) => x.kind === "card") as QueueItem[];
        const insights = q1.filter((x) => x.kind === "insight") as QueueItem[];
        const insightOne = insights.slice(0, 1);

        const dedupedReco = dedupeQueue([...recoCards, ...insightOne], localSeenRef.current);
        const dedupedRecoCards = dedupedReco.filter((x) => x.kind === "card");

        if (dedupedRecoCards.length >= 6) return dedupedReco;

        // 2) fallback: swipe/cards
        const swipe = await fetchSwipeCards(batchSize);
        const q2 = toQueueFromSwipe(swipe);
        const dedupedSwipe = dedupeQueue(q2, localSeenRef.current);

        return [...insightOne, ...dedupedSwipe];
    }

    async function init() {
        setErr(null);
        setLoading(true);
        try {
            loadLocalSeen();
            const items = await loadCardsBatch(24);
            setQueue(items);
            setIdx(0);
            setRatedCount(0);
            setSwipeCount(0);
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
        if (remain >= 8) return;

        setLoading(true);
        try {
            const more = await loadCardsBatch(24);

            setQueue((prev) => {
                const merged = [...prev, ...more];

                // 画面内の重複防止（正規化キー）
                const screenSeen = new Set<string>();
                const out: QueueItem[] = [];

                for (const it of merged) {
                    if (it.kind !== "card") {
                        if (out.some((x) => x.kind === "insight")) continue; // insightは最大1個
                        out.push(it);
                        continue;
                    }
                    const k = normKey(it.card_id);
                    if (!k) continue;
                    if (screenSeen.has(k)) continue;
                    screenSeen.add(k);
                    out.push(it);
                }

                return out;
            });
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

    async function onAction(action: ActionKind) {
        if (!current) return;

        setErr(null);

        if (current.kind !== "card") {
            setIdx((v) => v + 1);
            return;
        }

        const rating: -1 | 0 | 1 = action === "like" ? 1 : action === "dislike" ? -1 : 0;

        try {
            // ✅ Reloadしても同じカードを出さない
            markSeen(current.card_id);

            // ✅ impressionId がある時だけ学習を入れる
            if (current.impressionId) {
                await postRating(current.impressionId, rating);
                await postAction(current.impressionId, action);
            }

            setSwipeCount((c) => c + 1);
            if (rating !== 0) setRatedCount((c) => c + 1);
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        } finally {
            setIdx((v) => v + 1);
        }
    }

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

    async function reloadKeepSeen() {
        await init();
    }

    async function resetLocalSeenAndReload() {
        clearLocalSeen();
        await init();
    }

    const card = current?.kind === "card" ? current : null;
    const insight = current?.kind === "insight" ? current : null;
    const img = card ? normalizeImg(String(card.image_url ?? "")) : "";

    return (
        <div className="space-y-6">
            {err ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{err}</div>
            ) : null}

            <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm text-gray-500">{card ? card.recType : insight ? insight.recType : "buyer_swipe_card"}</div>
                        <div className="text-lg font-semibold">Swipe Cards</div>
                        <div className="mt-1 text-xs text-gray-500">
                            {queue.length ? `${idx + 1}/${queue.length}` : "0/0"}
                            {card?.source ? ` ・source: ${card.source}` : ""}
                            {card?.impressionId ? ` ・imp: ${card.impressionId.slice(0, 8)}…` : ""}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
                        <span className="text-gray-600">swipes: {swipeCount}</span>
                        <span className="text-gray-600">rated: {ratedCount}</span>

                        <button className="rounded-md border px-3 py-1" onClick={reloadKeepSeen} disabled={loading}>
                            Reload
                        </button>

                        <button
                            className="rounded-md border px-3 py-1 text-blue-600"
                            onClick={resetLocalSeenAndReload}
                            disabled={loading}
                        >
                            ローカルseenをリセット
                        </button>
                    </div>
                </div>

                {/* insight（no_cardsなど） */}
                {insight ? (
                    <div className="mt-3 rounded-xl border bg-amber-50 p-3 text-sm text-amber-900">
                        <div className="font-bold">insight</div>
                        <div className="mt-1">{insight.explain ?? "no message"}</div>
                        {insight.payload?.debug ? (
                            <div className="mt-2 text-xs text-amber-800">
                                debug: active_cards={String(insight.payload.debug.active_cards ?? "")} / seen_count_14d=
                                {String(insight.payload.debug.seen_count_14d ?? "")}
                            </div>
                        ) : null}
                        <div className="mt-2">
                            <button
                                className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
                                onClick={() => setIdx((v) => v + 1)}
                            >
                                次へ
                            </button>
                        </div>
                    </div>
                ) : null}

                {/* card */}
                <div className="mt-3 overflow-hidden rounded-xl border bg-gray-50">
                    {card ? (
                        img ? (
                            <ResilientCardImage src={img} alt={card.card_id ?? "card"} className="h-auto w-full object-cover" />
                        ) : (
                            <div className="flex h-64 items-center justify-center text-sm text-gray-500">
                                画像URLが不正です（image_url を /cards/... に統一して）
                            </div>
                        )
                    ) : (
                        <div className="flex h-64 items-center justify-center text-sm text-gray-500">
                            カードがありません（curated_cards 空 / is_active=false / seenが多すぎる など）
                        </div>
                    )}
                </div>

                {card?.tags?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {card.tags.slice(0, 14).map((t: string) => (
                            <span key={t} className="rounded-full border bg-white px-2 py-1 text-xs text-gray-700">
                                {t}
                            </span>
                        ))}
                    </div>
                ) : null}

                <div className="mt-4 grid grid-cols-3 gap-2">
                    <button className="rounded-xl border bg-white px-3 py-3 text-sm hover:bg-gray-50" onClick={() => onAction("dislike")} disabled={loading}>
                        👎 Dislike
                    </button>
                    <button className="rounded-xl border bg-white px-3 py-3 text-sm hover:bg-gray-50" onClick={() => onAction("neutral")} disabled={loading}>
                        😐 Neutral
                    </button>
                    <button className="rounded-xl border bg-white px-3 py-3 text-sm hover:bg-gray-50" onClick={() => onAction("like")} disabled={loading}>
                        👍 Like
                    </button>
                    <button className="col-start-2 rounded-xl border bg-white px-3 py-3 text-sm hover:bg-gray-50" onClick={() => onAction("skip")} disabled={loading}>
                        ⏭ Skip
                    </button>
                </div>

                {card?.explain ? <div className="mt-2 text-xs text-gray-500">note: {card.explain}</div> : null}
            </div>

            <div className="rounded-2xl border bg-white p-4">
                <div className="flex items-center justify-between">
                    <div className="font-semibold">おすすめショップ（Swipe学習から）</div>
                    <button className="rounded-md border px-3 py-1 text-sm" onClick={loadShopRecs} disabled={shopsLoading}>
                        {shopsLoading ? "Loading..." : "Load"}
                    </button>
                </div>

                <div className="mt-2 text-sm text-gray-600">目安：Like/Dislike を10枚以上すると出やすい</div>

                <div className="mt-3 space-y-3">
                    {shops.map((it, i) => (
                        <div key={it.impressionId ?? `${it.targetId}-${i}`} className="rounded-xl border p-3">
                            <div className="text-xs text-gray-500">{it.recType}</div>
                            <div className="mt-1 font-semibold">
                                {it.targetType === "shop"
                                    ? `shop: ${it.targetId ?? it.payload?.shop_id ?? it.payload?.shopKey ?? ""}`
                                    : it.payload?.kind ?? it.targetType}
                            </div>
                            {it.explain ? <div className="mt-1 text-sm text-gray-700">{it.explain}</div> : null}
                        </div>
                    ))}
                    {!shops.length ? <div className="text-sm text-gray-500">まだ未取得（Load を押して）</div> : null}
                </div>
            </div>
        </div>
    );
}
