// app/components/RecommendatiosClients.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { logRecoAction, logRecoRating, WHERE } from "@/lib/recoLog";
import { toggleSavedDropAction, toggleSavedShopAction } from "@/app/_actions/saved";

type Role = "buyer" | "seller";
type TargetType = "drop" | "shop" | "insight";

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

type ApiResponse = {
    ok: boolean;
    role: Role;
    recVersion?: number;
    items: RecItem[];
    error?: string;
};

function money(v: any) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return new Intl.NumberFormat("ja-JP").format(n);
}

function isLikelyUrl(s: any) {
    const x = String(s ?? "");
    return x.startsWith("http://") || x.startsWith("https://");
}

function clean(v: any) {
    return String(v ?? "").trim();
}

/** ========== Toast ========== */
function Toast({ text }: { text: string }) {
    return (
        <div className="fixed bottom-4 right-4 z-50 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-lg">
            <div className="text-sm font-extrabold text-zinc-900">{text}</div>
        </div>
    );
}

/** ========== Drop Card ========== */
function DropCard({
    item,
    pending,
    onRate,
    onSave,
    onSkip,
    onOpenDetail,
    onPurchase,
}: {
    item: RecItem;
    pending: boolean;
    onRate: (v: 1 | 0 | -1) => void;
    onSave: () => void;
    onSkip: () => void;
    onOpenDetail: () => void;
    onPurchase: () => void;
}) {
    const p = item.payload ?? {};
    const price = money(p.display_price ?? p.price);

    const href = (() => {
        if (!p.id) return null;
        const imp = item.impressionId ? String(item.impressionId) : "";
        return imp ? `/drops/${p.id}?imp=${encodeURIComponent(imp)}` : `/drops/${p.id}`;
    })();

    return (
        <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className="p-5 space-y-3">
                <div className="text-xs font-semibold text-neutral-500">Buyer Pick（Drop）</div>

                <div className="grid gap-3 md:grid-cols-[120px_1fr]">
                    <div className="rounded-xl bg-neutral-100 overflow-hidden flex items-center justify-center">
                        {p.cover_image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={String(p.cover_image_url)} alt="" className="h-[120px] w-full object-cover" />
                        ) : (
                            <div className="text-xs font-semibold text-neutral-500">No Image</div>
                        )}
                    </div>

                    <div className="min-w-0">
                        <div className="text-lg font-extrabold break-words">{p.title ?? "(no title)"}</div>

                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold text-neutral-700">
                            {p.brand ? <span>{p.brand}</span> : null}
                            {p.size ? <span>Size: {p.size}</span> : null}
                            {p.condition ? <span>{p.condition}</span> : null}
                            {price ? <span>¥{price}</span> : null}
                        </div>

                        {p.shop_slug ? (
                            <div className="mt-2 text-xs font-semibold text-neutral-500">
                                Shop: {p.shop_name_ja ?? p.shop_name_en ?? p.shop_slug}
                            </div>
                        ) : null}

                        {item.explain ? <div className="mt-3 text-sm font-semibold text-neutral-600">おすすめ理由：{item.explain}</div> : null}

                        <div className="mt-4 flex flex-wrap gap-2">
                            <button
                                disabled={pending}
                                onClick={() => onRate(1)}
                                className="rounded-xl border px-3 py-2 text-sm font-extrabold hover:bg-neutral-50 disabled:opacity-60"
                            >
                                👍
                            </button>
                            <button
                                disabled={pending}
                                onClick={() => onRate(0)}
                                className="rounded-xl border px-3 py-2 text-sm font-extrabold hover:bg-neutral-50 disabled:opacity-60"
                            >
                                😐
                            </button>
                            <button
                                disabled={pending}
                                onClick={() => onRate(-1)}
                                className="rounded-xl border px-3 py-2 text-sm font-extrabold hover:bg-neutral-50 disabled:opacity-60"
                            >
                                👎
                            </button>
                            <button
                                disabled={pending}
                                onClick={onSave}
                                className="rounded-xl border px-3 py-2 text-sm font-extrabold hover:bg-neutral-50 disabled:opacity-60"
                            >
                                ♡保存
                            </button>
                            <button
                                disabled={pending}
                                onClick={onSkip}
                                className="rounded-xl border px-3 py-2 text-sm font-extrabold hover:bg-neutral-50 disabled:opacity-60"
                            >
                                スキップ
                            </button>
                            <Link href="/me/saved" className="rounded-xl border px-3 py-2 text-sm font-extrabold hover:bg-neutral-50">
                                保存一覧
                            </Link>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                            {href ? (
                                <Link
                                    href={href}
                                    onClick={onOpenDetail}
                                    className="rounded-xl bg-black text-white px-4 py-2 text-sm font-extrabold hover:opacity-90"
                                >
                                    詳細を見る
                                </Link>
                            ) : null}

                            {p.purchase_url ? (
                                <button
                                    disabled={pending}
                                    onClick={onPurchase}
                                    className="rounded-xl border px-4 py-2 text-sm font-extrabold hover:bg-neutral-50 disabled:opacity-60"
                                >
                                    購入リンクへ
                                </button>
                            ) : null}
                        </div>

                        {item.impressionId ? <div className="mt-2 text-[11px] font-semibold text-neutral-400">imp: {item.impressionId}</div> : null}
                    </div>
                </div>
            </div>
        </div>
    );
}

/** ========== Shop Card ========== */
function ShopCard({
    item,
    pending,
    onRate,
    onSave,
    onSkip,
    onOpenShop,
}: {
    item: RecItem;
    pending: boolean;
    onRate: (v: 1 | 0 | -1) => void;
    onSave: () => void;
    onSkip: () => void;
    onOpenShop: () => void;
}) {
    const p: any = item.payload ?? {};
    const slug = clean(p.shop_slug || item.targetId || "");

    const name = clean(p.shop_name_ja || p.shop_name_en || p.display_name || p.shop_display_name || slug || "Shop");
    const headline = clean(p.shop_headline || p.headline || p.bio_ja || p.bio_en || "");

    const avatarUrl = (() => {
        const u = p.shop_avatar_url ?? p.avatar_url ?? p.image_url ?? null;
        if (u && isLikelyUrl(u)) return String(u);
        return null;
    })();

    const href = slug ? `/shops/${encodeURIComponent(slug)}` : null;

    return (
        <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className="p-5 space-y-3">
                <div className="text-xs font-semibold text-neutral-500">Buyer Pick（Shop）</div>

                <div className="flex gap-3 items-start">
                    <div className="h-14 w-14 rounded-2xl bg-neutral-100 overflow-hidden flex items-center justify-center shrink-0">
                        {avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                            <div className="text-sm font-extrabold text-neutral-500">{name.slice(0, 1).toUpperCase()}</div>
                        )}
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="text-lg font-extrabold break-words">{name}</div>
                        {headline ? <div className="mt-1 text-sm font-semibold text-neutral-600 break-words">{headline}</div> : null}
                        {item.explain ? <div className="mt-2 text-sm font-semibold text-neutral-600">おすすめ理由：{item.explain}</div> : null}

                        <div className="mt-4 flex flex-wrap gap-2">
                            <button disabled={pending} onClick={() => onRate(1)} className="rounded-xl border px-3 py-2 text-sm font-extrabold hover:bg-neutral-50 disabled:opacity-60">
                                👍
                            </button>
                            <button disabled={pending} onClick={() => onRate(0)} className="rounded-xl border px-3 py-2 text-sm font-extrabold hover:bg-neutral-50 disabled:opacity-60">
                                😐
                            </button>
                            <button disabled={pending} onClick={() => onRate(-1)} className="rounded-xl border px-3 py-2 text-sm font-extrabold hover:bg-neutral-50 disabled:opacity-60">
                                👎
                            </button>

                            <button disabled={pending} onClick={onSave} className="rounded-xl border px-3 py-2 text-sm font-extrabold hover:bg-neutral-50 disabled:opacity-60">
                                ♡保存
                            </button>
                            <button disabled={pending} onClick={onSkip} className="rounded-xl border px-3 py-2 text-sm font-extrabold hover:bg-neutral-50 disabled:opacity-60">
                                スキップ
                            </button>

                            {href ? (
                                <Link
                                    href={href}
                                    onClick={onOpenShop}
                                    className="rounded-xl bg-black text-white px-4 py-2 text-sm font-extrabold hover:opacity-90"
                                >
                                    Shopを見る
                                </Link>
                            ) : null}
                        </div>

                        {item.impressionId ? <div className="mt-2 text-[11px] font-semibold text-neutral-400">imp: {item.impressionId}</div> : null}
                    </div>
                </div>
            </div>
        </div>
    );
}

/** ========== Insight Card ========== */
function InsightCard({
    item,
    onRate,
    onSave,
    onSkip,
    pending,
}: {
    item: RecItem;
    onRate: (v: 1 | 0 | -1) => void;
    onSave: () => void;
    onSkip: () => void;
    pending: boolean;
}) {
    const p = item.payload ?? {};
    const kind = String(p.kind ?? "insight");

    const headline = (() => {
        if (kind === "trend_brand") return `人気ブランド：${p.brand ?? ""}`;
        if (kind === "trend_size") return `人気サイズ：${p.size ?? ""}`;
        if (kind === "waiting_buyers") return `“保存”が集まりやすい：${p.combo ?? ""}`;
        if (kind === "price_hint") return `価格ヒント：${p.title ?? ""}`;
        if (kind === "no_candidates") return "おすすめ候補がありません";
        if (kind === "cooldown") return "少し時間をおいて再生成";
        return kind;
    })();

    const detail = (() => {
        if (kind === "trend_brand") return `直近人気Dropに多い（頻度: ${p.frequency ?? "?"}）`;
        if (kind === "trend_size") return `直近人気Dropに多い（頻度: ${p.frequency ?? "?"}）`;
        if (kind === "waiting_buyers") return `30日で保存: ${p.save_count_30d ?? "?"}`;
        if (kind === "price_hint") {
            const your = money(p.your_price);
            const mid = money(p.market_median);
            const diff = p.diff_pct != null ? `${p.diff_pct}%` : "?";
            return `あなた: ¥${your ?? "?"} / 相場中央値: ¥${mid ?? "?"}（差: ${diff}）\n提案: ${p.suggestion ?? ""}`;
        }
        if (kind === "no_candidates") return String(p.hint ?? "");
        if (kind === "cooldown") return String(p.note ?? "");
        return "";
    })();

    return (
        <div className="rounded-2xl border bg-white shadow-sm p-5 space-y-3">
            <div className="text-xs font-semibold text-neutral-500">{item.role === "seller" ? "Seller Insight" : "Buyer Insight"}</div>
            <div className="text-lg font-extrabold">{headline}</div>

            {item.explain ? <div className="text-sm font-semibold text-neutral-600">理由：{item.explain}</div> : null}
            {detail ? (
                <pre className="whitespace-pre-wrap rounded-xl border bg-neutral-50 p-3 text-sm font-semibold text-neutral-700">{detail}</pre>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2">
                    <button disabled={pending} onClick={() => onRate(1)} className="rounded-xl border px-3 py-2 hover:bg-neutral-50 disabled:opacity-60">
                        👍
                    </button>
                    <button disabled={pending} onClick={() => onRate(0)} className="rounded-xl border px-3 py-2 hover:bg-neutral-50 disabled:opacity-60">
                        😐
                    </button>
                    <button disabled={pending} onClick={() => onRate(-1)} className="rounded-xl border px-3 py-2 hover:bg-neutral-50 disabled:opacity-60">
                        👎
                    </button>
                </div>
                <div className="flex gap-2">
                    <button disabled={pending} onClick={onSave} className="rounded-xl border px-3 py-2 hover:bg-neutral-50 disabled:opacity-60">
                        ♡保存
                    </button>
                    <button disabled={pending} onClick={onSkip} className="rounded-xl border px-3 py-2 hover:bg-neutral-50 disabled:opacity-60">
                        スキップ
                    </button>
                </div>
            </div>

            <details className="pt-2">
                <summary className="cursor-pointer text-xs font-semibold text-neutral-500">payload</summary>
                <pre className="mt-2 text-xs bg-neutral-50 border rounded-xl p-3 overflow-auto">{JSON.stringify(p, null, 2)}</pre>
            </details>
        </div>
    );
}

/** ========== Main Client ========== */
export default function RecommendationsClient({ role = "buyer", limit = 10 }: { role?: Role; limit?: number }) {
    const [loading, setLoading] = React.useState(true);
    const [items, setItems] = React.useState<RecItem[]>([]);
    const [error, setError] = React.useState<string | null>(null);
    const [recVersion, setRecVersion] = React.useState<number | null>(null);
    const [pending, setPending] = React.useState(false);

    const [toast, setToast] = React.useState<string | null>(null);

    const refillingRef = React.useRef(false);
    const requestKeyRef = React.useRef<string>("");
    const consumingRef = React.useRef(false);

    function keyOf(r: Role, n: number) {
        return `${r}:${n}`;
    }

    function itemKey(x: RecItem) {
        return x.impressionId ?? `${x.targetType}:${x.targetId ?? "null"}:${x.recType}:${x.rank}`;
    }

    function showToast(msg: string) {
        setToast(msg);
        window.setTimeout(() => setToast(null), 1400);
    }

    async function fetchBatch(r: Role, n: number): Promise<ApiResponse> {
        const res = await fetch(`/api/recommendations?role=${r}&limit=${n}`, { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as ApiResponse;
        if (!res.ok || !json?.ok) throw new Error((json as any)?.error ?? "failed");
        return json;
    }

    async function loadInitial() {
        const k = keyOf(role, limit);
        requestKeyRef.current = k;

        setLoading(true);
        setError(null);

        try {
            const json = await fetchBatch(role, limit);
            if (requestKeyRef.current !== k) return;
            setItems(json.items ?? []);
            setRecVersion((json as any).recVersion ?? null);
        } catch (e: any) {
            if (requestKeyRef.current !== k) return;
            setError(String(e?.message ?? e));
            setItems([]);
        } finally {
            if (requestKeyRef.current === k) setLoading(false);
        }
    }

    async function refillIfNeeded(nextItems: RecItem[]) {
        if (nextItems.length >= 3) return;
        if (refillingRef.current) return;

        const k = keyOf(role, limit);
        refillingRef.current = true;

        try {
            const json = await fetchBatch(role, limit);
            if (requestKeyRef.current !== k) return;

            const more = json.items ?? [];
            if ((json as any).recVersion != null) setRecVersion((json as any).recVersion);

            if (!more.length) return;

            setItems((prev) => {
                const seen = new Set(prev.map(itemKey));
                const merged = [...prev];
                for (const m of more) {
                    const mk = itemKey(m);
                    if (!seen.has(mk)) {
                        merged.push(m);
                        seen.add(mk);
                    }
                }
                return merged;
            });
        } catch {
            // 体験優先：補充失敗は黙る
        } finally {
            refillingRef.current = false;
        }
    }

    React.useEffect(() => {
        void loadInitial();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role, limit]);

    const top = items[0] ?? null;

    async function consumeAndRefill(actionFn?: (cur: RecItem) => void) {
        if (!top) return;
        if (consumingRef.current) return;

        consumingRef.current = true;
        setPending(true);

        const current = top;
        const next = items.slice(1);

        setItems(next);
        void refillIfNeeded(next);

        try {
            if (actionFn) actionFn(current);
        } finally {
            window.setTimeout(() => {
                consumingRef.current = false;
                setPending(false);
            }, 120);
        }

        return current;
    }

    async function rate(v: 1 | 0 | -1) {
        await consumeAndRefill((cur) => logRecoRating(cur.impressionId, v));
    }

    async function save() {
        await consumeAndRefill((cur) => {
            // ログは先に送る（体験優先）
            logRecoAction(cur.impressionId, "save", {
                recType: cur.recType,
                targetType: cur.targetType,
                targetId: cur.targetId,
                kind: cur.payload?.kind ?? null,
            });

            // DB保存は裏で実行（Drop/Shopのみ）
            void (async () => {
                try {
                    if (cur.targetType === "drop") {
                        const dropId = clean(cur.payload?.id ?? cur.targetId);
                        if (!dropId) return showToast("保存できませんでした");
                        const res = await toggleSavedDropAction(dropId);
                        if (!res.ok) return showToast(res.error ?? "保存失敗");
                        showToast(res.saved ? "保存しました" : "保存を解除しました");
                        return;
                    }

                    if (cur.targetType === "shop") {
                        const slug = clean(cur.payload?.shop_slug ?? cur.targetId);
                        if (!slug) return showToast("保存できませんでした");
                        const res = await toggleSavedShopAction(slug);
                        if (!res.ok) return showToast(res.error ?? "保存失敗");
                        showToast(res.saved ? "Shopを保存しました" : "Shop保存を解除しました");
                        return;
                    }

                    // insight はDB保存しない（ログのみ）
                    showToast("保存しました");
                } catch (e: any) {
                    showToast(String(e?.message ?? "保存失敗"));
                }
            })();
        });
    }

    async function skip() {
        await consumeAndRefill((cur) => {
            logRecoAction(cur.impressionId, "skip", {
                recType: cur.recType,
                targetType: cur.targetType,
                targetId: cur.targetId,
                kind: cur.payload?.kind ?? null,
            });
        });
    }

    function openDetail(item: RecItem) {
        logRecoAction(item.impressionId, "click", {
            recType: item.recType,
            targetType: item.targetType,
            targetId: item.targetId,
            kind: item.payload?.kind ?? null,
            where: WHERE.OPEN_DROP_DETAIL,
        });
    }

    function openShop(item: RecItem) {
        logRecoAction(item.impressionId, "click", {
            recType: item.recType,
            targetType: item.targetType,
            targetId: item.targetId,
            where: WHERE.OPEN_SHOP,
        });
    }

    async function purchase() {
        await consumeAndRefill((cur) => {
            const p = cur.payload ?? {};
            const url = p.purchase_url ? String(p.purchase_url) : "";

            logRecoAction(cur.impressionId, "purchase", {
                recType: cur.recType,
                targetType: cur.targetType,
                targetId: cur.targetId,
                kind: cur.payload?.kind ?? null,
                where: WHERE.OUTBOUND_BUY,
                purchase_url: url || null,
            });

            if (url) window.open(url, "_blank", "noopener,noreferrer");
        });
    }

    React.useEffect(() => {
        if (!loading && !error && items.length < 3) void refillIfNeeded(items);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items.length, loading, error]);

    if (loading) return <div className="text-neutral-600 font-semibold">Loading...</div>;

    if (error)
        return (
            <div className="rounded-2xl border bg-white p-5">
                {toast ? <Toast text={toast} /> : null}
                <div className="text-red-600 font-extrabold">Error</div>
                <div className="mt-1 text-sm font-semibold text-neutral-700 break-words">{error}</div>
                <button onClick={loadInitial} className="mt-4 rounded-xl bg-black text-white px-4 py-2 font-extrabold hover:opacity-90">
                    もう一度
                </button>
            </div>
        );

    if (!top)
        return (
            <div className="rounded-2xl border bg-white p-5 text-sm font-semibold text-neutral-600">
                {toast ? <Toast text={toast} /> : null}
                いま出せる提案がありません。{" "}
                <button className="underline" onClick={loadInitial}>
                    再読み込み
                </button>
                {recVersion != null ? <div className="mt-2 text-xs text-neutral-400">recVersion: {recVersion}</div> : null}
            </div>
        );

    return (
        <>
            {toast ? <Toast text={toast} /> : null}

            {/* seller or insight */}
            {top.targetType === "insight" || role === "seller" ? (
                <InsightCard item={top} onRate={rate} onSave={save} onSkip={skip} pending={pending} />
            ) : top.targetType === "shop" ? (
                <ShopCard item={top} pending={pending} onRate={rate} onSave={save} onSkip={skip} onOpenShop={() => openShop(top)} />
            ) : (
                <DropCard item={top} pending={pending} onRate={rate} onSave={save} onSkip={skip} onOpenDetail={() => openDetail(top)} onPurchase={purchase} />
            )}
        </>
    );
}
