// app/me/saved/page.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { removeSavedDropFromForm, removeSavedShopFromForm } from "./actions";

export const dynamic = "force-dynamic";

type SavedDropRow = { drop_id: string; created_at: string };
type DropRow = {
    id: string;
    created_at: string;
    title: string;
    brand: string | null;
    size: string | null;
    condition: string | null;
    price: number | null;
    cover_image_url: string | null;
    purchase_url: string | null;
    url: string | null;
};

type SavedShopRow = { shop_slug: string; created_at: string };
type ShopRow = {
    slug: string;
    name_ja: string | null;
    name_en: string | null;
    headline: string | null;
    avatar_url: string | null;
    is_active?: boolean | null;
};

type SP = Record<string, string | string[] | undefined>;

function spStr(v: unknown) {
    return String(Array.isArray(v) ? v[0] : v ?? "").trim();
}

function addQuery(url: string, params: Record<string, string | null | undefined>) {
    const qs = Object.entries(params)
        .filter(([, v]) => v != null && String(v).trim() !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&");
    if (!qs) return url;
    return url + (url.includes("?") ? "&" : "?") + qs;
}

function safeDecode(s: string) {
    try {
        return decodeURIComponent(s);
    } catch {
        return s;
    }
}

function fmtYen(n: unknown) {
    const num = typeof n === "number" ? n : Number(String(n ?? ""));
    if (!Number.isFinite(num)) return "0";
    return Math.round(num).toLocaleString("ja-JP");
}

function msgText(m?: string | null) {
    switch (m) {
        case "drop_removed":
            return { kind: "ok" as const, text: "Saved Drop を解除しました。" };
        case "shop_removed":
            return { kind: "ok" as const, text: "Saved Shop を解除しました。" };
        case "invalid":
            return { kind: "ng" as const, text: "入力が不正です（id/slug が空）。" };
        case "not_signed_in":
            return { kind: "ng" as const, text: "ログインが必要です。" };
        default:
            return null;
    }
}

export default async function SavedPage({ searchParams }: { searchParams?: Promise<SP> }) {
    const sp = (await searchParams) ?? {};
    const imp = spStr(sp.imp || sp.impressionId || sp.impression_id) || null;
    const m = spStr(sp.m) || null;
    const e = spStr(sp.e) || null;

    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    const flash = msgText(m);
    const errText = e ? safeDecode(e) : null;

    if (!auth?.user) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-pink-50/30 to-violet-50/20">
                <div className="max-w-2xl mx-auto px-4 py-16">
                    <div className="rounded-3xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-xl p-12 text-center">
                        <div className="text-6xl mb-6">❤️</div>
                        <h1 className="text-3xl font-black text-gray-800 mb-4">お気に入り</h1>
                        <p className="text-gray-500 mb-8">ログインすると保存一覧が見れます。</p>
                        <Link
                            href={addQuery("/login", { imp })}
                            className="inline-block rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 px-8 py-4 font-bold text-white shadow-lg shadow-pink-500/25 hover:shadow-pink-500/40 transition-all no-underline"
                        >
                            🔓 Login
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    const userId = auth.user.id;

    // Saved Products
    const { data: savedDropsRaw, error: sdErr } = await supabase
        .from("saved_drops")
        .select("drop_id,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);

    if (sdErr) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-pink-50/30 to-violet-50/20 p-6">
                <div className="max-w-6xl mx-auto">
                    <div className="rounded-3xl bg-red-50 border border-red-200 p-8 shadow-xl">
                        <div className="text-lg font-bold text-red-600 mb-2">Error</div>
                        <div className="text-sm text-red-700">{sdErr.message}</div>
                    </div>
                </div>
            </div>
        );
    }

    const savedDrops = (savedDropsRaw ?? []) as SavedDropRow[];
    const dropIds = savedDrops.map((x) => x.drop_id).filter(Boolean);

    let dropMap = new Map<string, DropRow>();
    if (dropIds.length) {
        const { data: dropRows, error: dErr } = await supabase
            .from("drops")
            .select("id,created_at,title,brand,size,condition,price,cover_image_url,purchase_url,url")
            .in("id", dropIds);

        if (!dErr) {
            dropMap = new Map((dropRows ?? []).map((d: any) => [d.id, d as DropRow]));
        }
    }

    const dropItems = savedDrops.map((s) => ({
        saved_at: s.created_at,
        id: s.drop_id,
        drop: dropMap.get(s.drop_id) ?? null,
    }));

    // Saved Shops
    const { data: savedShopsRaw, error: ssErr } = await supabase
        .from("saved_shops")
        .select("shop_slug,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);

    const savedShops = (savedShopsRaw ?? []) as SavedShopRow[];

    let shopMap = new Map<string, ShopRow>();
    if (!ssErr) {
        const slugs = savedShops.map((x) => x.shop_slug).filter(Boolean);
        if (slugs.length) {
            const { data: shopRows } = await supabase
                .from("shops")
                .select("slug,name_ja,name_en,headline,avatar_url,is_active")
                .in("slug", slugs);

            if (shopRows) {
                shopMap = new Map((shopRows ?? []).map((s: any) => [s.slug, s as ShopRow]));
            }
        }
    }

    const shopItems = savedShops.map((s) => ({
        saved_at: s.created_at,
        slug: s.shop_slug,
        shop: shopMap.get(s.shop_slug) ?? null,
    }));

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-pink-50/30 to-violet-50/20">
            {/* ヘッダー */}
            <div className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 border-b border-white/60 shadow-sm">
                <div className="max-w-6xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link
                                href="/my"
                                className="w-10 h-10 rounded-xl bg-white/50 border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 hover:text-gray-800 transition-all shadow-sm"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </Link>
                            <div>
                                <h1 className="text-xl font-bold text-gray-800">❤️ お気に入り</h1>
                                <p className="text-xs text-gray-400">保存した商品・ショップ</p>
                            </div>
                        </div>
                        <Link
                            href={addQuery("/products", { imp })}
                            className="rounded-xl bg-white/50 border border-white/60 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-white/80 transition-all shadow-sm no-underline"
                        >
                            ← Products
                        </Link>
                    </div>
                </div>
            </div>

            {/* メインコンテンツ */}
            <div className="max-w-6xl mx-auto px-4 py-8 space-y-10">
                {/* フラッシュメッセージ */}
                {flash && (
                    <div
                        className={`rounded-2xl border p-5 shadow-lg ${
                            flash.kind === "ok"
                                ? "bg-emerald-50 border-emerald-200"
                                : "bg-red-50 border-red-200"
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <span className={`font-medium ${flash.kind === "ok" ? "text-emerald-700" : "text-red-700"}`}>
                                {flash.text}
                            </span>
                            <Link
                                href={addQuery("/me/saved", { imp })}
                                className="text-sm opacity-70 hover:opacity-100 underline"
                            >
                                閉じる
                            </Link>
                        </div>
                    </div>
                )}

                {errText && (
                    <div className="rounded-2xl bg-red-50 border border-red-200 p-5 shadow-lg">
                        <div className="flex items-center justify-between">
                            <span className="font-medium text-red-700">エラー: {errText}</span>
                            <Link
                                href={addQuery("/me/saved", { imp })}
                                className="text-sm opacity-70 hover:opacity-100 underline"
                            >
                                閉じる
                            </Link>
                        </div>
                    </div>
                )}

                {/* Saved Products Section */}
                <section>
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-black text-gray-800 flex items-center gap-3">
                            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-lg shadow-md">
                                👕
                            </span>
                            保存した商品
                        </h2>
                        <span className="rounded-full bg-pink-100 border border-pink-200 px-4 py-1.5 text-sm font-bold text-pink-700">
                            {savedDrops.length} saved
                        </span>
                    </div>

                    {dropItems.length === 0 ? (
                        <div className="rounded-2xl bg-white/70 backdrop-blur-sm border border-white/60 shadow-lg p-12 text-center">
                            <div className="text-5xl mb-4">📦</div>
                            <p className="text-gray-500">まだ保存した商品がありません。</p>
                        </div>
                    ) : (
                        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                            {dropItems.map((it, index) => {
                                const d = it.drop;

                                if (!d) {
                                    return (
                                        <li
                                            key={it.id}
                                            className="rounded-2xl bg-white/70 backdrop-blur-sm border border-white/60 shadow-lg p-6"
                                            style={{ animation: `fadeIn 0.3s ease-out ${index * 0.05}s both` }}
                                        >
                                            <div className="text-base font-bold text-gray-500 mb-2">(deleted / unavailable)</div>
                                            <div className="text-xs text-gray-400 break-words mb-4">id: {it.id}</div>
                                            <form action={removeSavedDropFromForm}>
                                                <input type="hidden" name="drop_id" value={it.id} />
                                                <button
                                                    type="submit"
                                                    className="w-full rounded-xl bg-gray-100 border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-200 transition-all"
                                                >
                                                    解除
                                                </button>
                                            </form>
                                        </li>
                                    );
                                }

                                return (
                                    <li
                                        key={d.id}
                                        className="group rounded-2xl bg-white/70 backdrop-blur-sm border border-white/60 shadow-lg overflow-hidden hover:shadow-xl transition-all"
                                        style={{ animation: `fadeIn 0.3s ease-out ${index * 0.05}s both` }}
                                    >
                                        <Link href={addQuery(`/drops/${d.id}`, { imp })} className="block no-underline">
                                            <div className="aspect-square bg-gray-100 overflow-hidden">
                                                {d.cover_image_url && (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={d.cover_image_url}
                                                        alt={d.title}
                                                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                    />
                                                )}
                                            </div>
                                            <div className="p-5">
                                                <h3 className="line-clamp-2 text-base font-bold text-gray-800 mb-1 group-hover:text-pink-600 transition-colors">
                                                    {d.title ?? "(no title)"}
                                                </h3>
                                                <div className="text-xs text-gray-500 uppercase tracking-wide">
                                                    {[d.brand, d.size, d.condition].filter(Boolean).join(" · ") || " "}
                                                </div>
                                                {d.price != null && (
                                                    <div className="mt-3 text-lg font-bold text-pink-600">¥{fmtYen(d.price)}</div>
                                                )}
                                            </div>
                                        </Link>

                                        <div className="border-t border-gray-100 p-4 flex items-center justify-between gap-3">
                                            <form action={removeSavedDropFromForm}>
                                                <input type="hidden" name="drop_id" value={d.id} />
                                                <button
                                                    type="submit"
                                                    className="rounded-xl bg-gray-100 border border-gray-200 px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-200 transition-all"
                                                >
                                                    解除
                                                </button>
                                            </form>

                                            {d.purchase_url && (
                                                <a
                                                    href={d.purchase_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 px-5 py-2 text-sm font-bold text-white shadow-md hover:shadow-lg transition-all no-underline"
                                                >
                                                    Buy
                                                </a>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>

                {/* Saved Shops Section */}
                <section>
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-black text-gray-800 flex items-center gap-3">
                            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-lg shadow-md">
                                🏪
                            </span>
                            保存したショップ
                        </h2>
                        <span className="rounded-full bg-violet-100 border border-violet-200 px-4 py-1.5 text-sm font-bold text-violet-700">
                            {savedShops.length} saved
                        </span>
                    </div>

                    {ssErr ? (
                        <div className="rounded-2xl bg-red-50 border border-red-200 p-6 shadow-lg">
                            <div className="font-medium text-red-700">saved_shops の取得でエラー: {ssErr.message}</div>
                        </div>
                    ) : shopItems.length === 0 ? (
                        <div className="rounded-2xl bg-white/70 backdrop-blur-sm border border-white/60 shadow-lg p-12 text-center">
                            <div className="text-5xl mb-4">🏪</div>
                            <p className="text-gray-500">まだ保存したショップがありません。</p>
                        </div>
                    ) : (
                        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                            {shopItems.map((it, index) => {
                                const s = it.shop;

                                if (!s) {
                                    return (
                                        <li
                                            key={it.slug}
                                            className="rounded-2xl bg-white/70 backdrop-blur-sm border border-white/60 shadow-lg p-6"
                                            style={{ animation: `fadeIn 0.3s ease-out ${index * 0.05}s both` }}
                                        >
                                            <div className="text-base font-bold text-gray-500 mb-2">(deleted / unavailable)</div>
                                            <div className="text-xs text-gray-400 break-words mb-4">slug: {it.slug}</div>
                                            <form action={removeSavedShopFromForm}>
                                                <input type="hidden" name="shop_slug" value={it.slug} />
                                                <button
                                                    type="submit"
                                                    className="w-full rounded-xl bg-gray-100 border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-200 transition-all"
                                                >
                                                    解除
                                                </button>
                                            </form>
                                        </li>
                                    );
                                }

                                const shopName = s.name_ja || s.name_en || s.slug;
                                const inactive = s.is_active === false;

                                return (
                                    <li
                                        key={s.slug}
                                        className="group rounded-2xl bg-white/70 backdrop-blur-sm border border-white/60 shadow-lg p-6 hover:shadow-xl transition-all"
                                        style={{ animation: `fadeIn 0.3s ease-out ${index * 0.05}s both` }}
                                    >
                                        <Link
                                            href={addQuery(`/shops/${encodeURIComponent(s.slug)}`, { imp })}
                                            className="flex gap-4 items-start mb-4 no-underline"
                                        >
                                            <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-violet-100 to-purple-50 overflow-hidden shrink-0 border border-violet-200">
                                                {s.avatar_url && (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={s.avatar_url}
                                                        alt={shopName}
                                                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                    />
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h3 className="text-base font-bold text-gray-800 truncate group-hover:text-violet-600 transition-colors">
                                                    {shopName}
                                                    {inactive && <span className="ml-2 text-xs text-gray-400">(inactive)</span>}
                                                </h3>
                                                {s.headline && (
                                                    <div className="text-xs text-gray-500 line-clamp-2 mt-1">{s.headline}</div>
                                                )}
                                            </div>
                                        </Link>

                                        <form action={removeSavedShopFromForm}>
                                            <input type="hidden" name="shop_slug" value={s.slug} />
                                            <button
                                                type="submit"
                                                className="w-full rounded-xl bg-gray-100 border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-200 transition-all"
                                            >
                                                解除
                                            </button>
                                        </form>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            </div>

        </div>
    );
}
