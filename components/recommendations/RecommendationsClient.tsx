// components/recommendations/RecommendationsClient.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { logRecoAction, logRecoRating, WHERE } from "@/lib/recoLog";
import RecoOutboundWrap from "@/app/drops/RecoOutboundWrap";

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

function money(v: any) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    return Math.round(n).toLocaleString("ja-JP");
}

function Avatar({ url, alt }: { url?: string | null; alt: string }) {
    if (!url) {
        return <div className="h-10 w-10 rounded-full bg-neutral-200" aria-label={alt} />;
    }
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={String(url)} alt={alt} className="h-10 w-10 rounded-full object-cover bg-neutral-100" />;
}

function InsightCard({ item }: { item: RecItem }) {
    const p = item.payload ?? {};
    const title =
        p.kind === "no_candidates"
            ? "おすすめ候補が空です"
            : p.kind === "cooldown"
                ? "おすすめを見切りました"
                : p.kind === "next_steps"
                    ? "次の一手"
                    : p.kind === "market_price_band"
                        ? "相場の目安"
                        : p.kind === "quality_tip"
                            ? "改善ヒント"
                            : p.kind === "price_hint"
                                ? "価格ヒント"
                                : "Insight";

    return (
        <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className="p-5">
                <div className="text-xs font-semibold text-neutral-500">Insight</div>
                <div className="mt-2 text-lg font-extrabold">{title}</div>
                {item.explain ? <div className="mt-2 text-sm font-semibold text-neutral-600">{item.explain}</div> : null}

                <div className="mt-3 text-sm text-neutral-700 whitespace-pre-wrap break-words">
                    {p.hint ?? p.note ?? p.suggestion ?? null}
                </div>

                {Array.isArray(p.checklist) ? (
                    <ul className="mt-3 list-disc pl-5 text-sm text-neutral-700 space-y-1">
                        {p.checklist.map((x: any, i: number) => (
                            <li key={i}>{String(x)}</li>
                        ))}
                    </ul>
                ) : null}

                {Array.isArray(p.tips) ? (
                    <ul className="mt-3 list-disc pl-5 text-sm text-neutral-700 space-y-1">
                        {p.tips.map((x: any, i: number) => (
                            <li key={i}>{String(x)}</li>
                        ))}
                    </ul>
                ) : null}

                {p.market_median != null ? (
                    <div className="mt-3 text-sm font-semibold text-neutral-700">相場中央値（簡易）：¥{money(p.market_median)}</div>
                ) : null}
            </div>
        </div>
    );
}

function ShopCard({ item, pending }: { item: RecItem; pending: boolean }) {
    const p = item.payload ?? {};
    const slug = String(p.shop_slug ?? item.targetId ?? "");
    const name = p.shop_name_ja ?? p.shop_name_en ?? slug ?? "(shop)";
    const avatar = p.shop_avatar_url ?? null;

    return (
        <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className="p-5 space-y-3">
                <div className="text-xs font-semibold text-neutral-500">Buyer Pick（Shop）</div>

                <div className="flex items-center gap-3">
                    <Avatar url={avatar} alt={String(name)} />
                    <div className="min-w-0">
                        <div className="text-lg font-extrabold truncate">{String(name)}</div>
                        {p.shop_headline ? <div className="text-sm font-semibold text-neutral-600 truncate">{String(p.shop_headline)}</div> : null}
                    </div>
                </div>

                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold text-neutral-700">
                    {p.drops_count != null ? <span>Drop数: {String(p.drops_count)}</span> : null}
                    {p.hot_score_avg != null ? <span>熱量avg: {String(p.hot_score_avg)}</span> : null}
                    {p.buy_rate_30d != null ? <span>buy率: {String(p.buy_rate_30d)}</span> : null}
                </div>

                {item.explain ? <div className="text-sm font-semibold text-neutral-600">おすすめ理由：{item.explain}</div> : null}

                {slug ? (
                    <Link
                        href={`/shops/${encodeURIComponent(slug)}`}
                        className="inline-flex rounded-xl bg-black text-white px-4 py-2 text-sm font-extrabold hover:opacity-90"
                        onClick={() => {
                            // impressionがあればclickにしてもいいが、shopカードはまずUI優先
                            // ここでrecoAction追加したければ後でOK
                            void pending;
                        }}
                    >
                        Shopを見る
                    </Link>
                ) : null}
            </div>
        </div>
    );
}

function DropCard({
    item,
    pending,
    onRate,
    onSave,
    onSkip,
    onOpenDetail,
}: {
    item: RecItem;
    pending: boolean;
    onRate: (v: 1 | 0 | -1) => void;
    onSave: () => void;
    onSkip: () => void;
    onOpenDetail: () => void;
}) {
    const p = item.payload ?? {};
    const price = money(p.display_price ?? p.price);

    const dropId = String(p.id ?? item.targetId ?? "");
    const imp = item.impressionId ? String(item.impressionId) : "";
    const href = dropId ? (imp ? `/drops/${dropId}?imp=${encodeURIComponent(imp)}` : `/drops/${dropId}`) : null;

    const shopLabel = p.shop_name_ja ?? p.shop_name_en ?? p.display_name ?? p.shop_slug ?? null;

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

                        {shopLabel ? (
                            <div className="mt-2 text-xs font-semibold text-neutral-500">Shop: {String(shopLabel)}</div>
                        ) : null}

                        {item.explain ? (
                            <div className="mt-3 text-sm font-semibold text-neutral-600">おすすめ理由：{item.explain}</div>
                        ) : null}

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
                            <Link href="/me/saved" className="rounded-xl border px-3 py-2 text-sm font-extrabold hover:bg-neutral-50">
                                保存一覧
                            </Link>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                            {href ? (
                                <Link
                                    href={href}
                                    onClick={() => {
                                        onOpenDetail(); // ✅ clickOpen系は全部ここに集約（undefined撲滅）
                                    }}
                                    className="rounded-xl bg-black text-white px-4 py-2 text-sm font-extrabold hover:opacity-90"
                                >
                                    詳細を見る
                                </Link>
                            ) : null}

                            {p.purchase_url && dropId ? (
                                <RecoOutboundWrap
                                    impressionId={item.impressionId}
                                    recoAction="purchase"
                                    dropId={dropId}
                                    kind="buy"
                                    url={String(p.purchase_url)}
                                    className="rounded-xl border px-4 py-2 text-sm font-extrabold hover:bg-neutral-50"
                                    meta={{ where: WHERE.RECO_CARD }}
                                >
                                    購入リンクへ
                                </RecoOutboundWrap>
                            ) : null}
                        </div>

                        {item.impressionId ? <div className="mt-2 text-[11px] font-semibold text-neutral-400">imp: {item.impressionId}</div> : null}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function RecommendationsClient({ limit = 10 }: { limit?: number }) {
    const [items, setItems] = React.useState<RecItem[]>([]);
    const [role, setRole] = React.useState<Role>("buyer");
    const [loading, setLoading] = React.useState(false);
    const [pending, setPending] = React.useState(false);

    async function load() {
        setLoading(true);
        try {
            const res = await fetch(`/api/recommendations?role=auto&limit=${encodeURIComponent(String(limit))}&v=2`, {
                cache: "no-store",
            });
            const json = await res.json().catch(() => null);
            if (!json?.ok) throw new Error(json?.error ?? "Failed to load recommendations");
            setRole(json.role as Role);
            setItems(Array.isArray(json.items) ? (json.items as RecItem[]) : []);
        } catch (e) {
            console.error(e);
            setItems([
                {
                    impressionId: null,
                    role: "buyer",
                    recType: "client_error",
                    targetType: "insight",
                    targetId: null,
                    rank: 0,
                    explain: "おすすめの取得に失敗しました。リロードしてください。",
                    payload: { kind: "client_error" },
                },
            ]);
        } finally {
            setLoading(false);
        }
    }

    React.useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onSkipItem = (idx: number, imp: string | null) => {
        try {
            logRecoAction(imp, "skip", { where: WHERE.RECO_CARD });
        } catch { }
        setItems((prev) => prev.filter((_, i) => i !== idx));
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="text-lg font-extrabold">おすすめ</div>
                    <div className="text-xs font-semibold text-neutral-500">role: {role}</div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        className="rounded-xl border px-3 py-2 text-sm font-extrabold hover:bg-neutral-50 disabled:opacity-60"
                        disabled={loading}
                        onClick={() => void load()}
                    >
                        {loading ? "更新中…" : "更新"}
                    </button>
                </div>
            </div>

            {items.length === 0 ? (
                <div className="rounded-2xl border bg-white p-5 text-sm font-semibold text-neutral-600">おすすめがありません</div>
            ) : null}

            <div className="space-y-3">
                {items.map((it, idx) => {
                    if (it.targetType === "insight") return <InsightCard key={`${it.rank}-${it.recType}`} item={it} />;

                    if (it.targetType === "shop") return <ShopCard key={`${it.rank}-${it.recType}`} item={it} pending={pending} />;

                    // drop
                    return (
                        <DropCard
                            key={`${it.rank}-${it.recType}-${it.targetId ?? "x"}`}
                            item={it}
                            pending={pending}
                            onRate={(v) => {
                                setPending(true);
                                try {
                                    logRecoRating(it.impressionId, v);
                                } finally {
                                    setTimeout(() => setPending(false), 250);
                                }
                            }}
                            onSave={() => {
                                setPending(true);
                                try {
                                    logRecoAction(it.impressionId, "save", { where: WHERE.RECO_CARD });
                                } finally {
                                    setTimeout(() => setPending(false), 250);
                                }
                            }}
                            onSkip={() => onSkipItem(idx, it.impressionId)}
                            onOpenDetail={() => {
                                try {
                                    logRecoAction(it.impressionId, "click", { where: WHERE.DROP_DETAIL });
                                } catch { }
                            }}
                        />
                    );
                })}
            </div>
        </div>
    );
}
