// app/me/saved/page.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { removeSavedDropFromForm, removeSavedShopFromForm } from "./actions";
import SavedClient from "./SavedClient";

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
            <SavedClient>
                <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/20 to-purple-50/20 p-6">
                    <div className="mx-auto max-w-2xl">
                        <div className="rounded-3xl border-2 border-slate-200 bg-white p-12 shadow-2xl text-center">
                            <div className="text-6xl mb-6">❤️</div>
                            <h1
                                className="text-5xl font-black text-slate-900 mb-4"
                                style={{ fontFamily: "'Cormorant Garamond', serif" }}
                            >
                                Saved
                            </h1>
                            <p className="text-base font-semibold text-slate-600 mb-8">ログインすると保存一覧が見れます。</p>
                            <Link
                                className="inline-block rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 border-2 border-teal-400 px-8 py-4 font-black text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 no-underline"
                                href={addQuery("/login", { imp })}
                            >
                                🔓 Login
                            </Link>
                        </div>
                    </div>
                </div>
            </SavedClient>
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
            <SavedClient>
                <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/20 to-purple-50/20 p-6">
                    <div className="mx-auto max-w-6xl">
                        <div className="rounded-3xl border-2 border-red-200 bg-gradient-to-br from-red-50 to-white p-8 shadow-xl">
                            <div className="text-lg font-black text-red-600 mb-2">Error</div>
                            <div className="text-sm font-semibold text-slate-700">{sdErr.message}</div>
                        </div>
                    </div>
                </div>
            </SavedClient>
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
        <SavedClient>
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/20 to-purple-50/20">
                {/* Header */}
                <div className="border-b-2 border-slate-200 bg-gradient-to-r from-white via-teal-50/30 to-purple-50/30 py-12">
                    <div className="mx-auto max-w-6xl px-6">
                        <div className="flex items-end justify-between gap-6">
                            <div>
                                <h1
                                    className="text-6xl font-black tracking-tight text-slate-900 mb-3"
                                    style={{ fontFamily: "'Cormorant Garamond', serif" }}
                                >
                                    ❤️ Saved
                                </h1>
                                <div className="text-sm font-bold text-slate-600">あなたが保存したDrop / Shop</div>
                            </div>

                            <Link
                                href={addQuery("/drops", { imp })}
                                className="rounded-xl bg-white border-2 border-slate-300 px-6 py-3 text-sm font-black text-slate-700 shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 no-underline"
                            >
                                ← Products
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div className="mx-auto max-w-6xl px-6 py-12 grid gap-12">
                    {/* Flash Messages */}
                    {flash ? (
                        <div
                            className={`
                rounded-3xl border-2 p-6 shadow-xl
                ${flash.kind === "ok"
                                    ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white"
                                    : "border-red-200 bg-gradient-to-br from-red-50 to-white"
                                }
              `}
                            style={{ animation: "slideIn 0.4s ease-out" }}
                        >
                            <div className="flex items-center justify-between gap-3">
                                <div className={`text-base font-bold ${flash.kind === "ok" ? "text-emerald-800" : "text-red-700"}`}>
                                    {flash.text}
                                </div>
                                <Link
                                    href={addQuery("/me/saved", { imp })}
                                    className="text-sm font-bold underline opacity-80 hover:opacity-100"
                                >
                                    閉じる
                                </Link>
                            </div>
                        </div>
                    ) : null}

                    {errText ? (
                        <div
                            className="rounded-3xl border-2 border-red-200 bg-gradient-to-br from-red-50 to-white p-6 shadow-xl"
                            style={{ animation: "slideIn 0.4s ease-out" }}
                        >
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-base font-bold text-red-700">エラー: {errText}</div>
                                <Link
                                    href={addQuery("/me/saved", { imp })}
                                    className="text-sm font-bold underline opacity-80 hover:opacity-100"
                                >
                                    閉じる
                                </Link>
                            </div>
                        </div>
                    ) : null}

                    {/* Saved Products Section */}
                    <section>
                        <div className="flex items-center justify-between gap-3 mb-6">
                            <h2 className="text-4xl font-black tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                                Saved Products
                            </h2>
                            <span className="rounded-full bg-orange-100 border border-orange-300 px-4 py-1.5 text-sm font-black text-orange-700">
                                {savedDrops.length} saved
                            </span>
                        </div>

                        {dropItems.length === 0 ? (
                            <div className="rounded-3xl border-2 border-slate-200 bg-gradient-to-br from-white to-slate-50 p-12 shadow-xl text-center">
                                <div className="text-6xl mb-4">📦</div>
                                <div className="text-base font-bold text-slate-600">まだ保存したDropがありません。</div>
                            </div>
                        ) : (
                            <ul className="grid list-none gap-6 p-0 md:grid-cols-2 lg:grid-cols-3">
                                {dropItems.map((it) => {
                                    const d = it.drop;

                                    if (!d) {
                                        return (
                                            <li
                                                key={it.id}
                                                className="rounded-3xl border-2 border-slate-200 bg-gradient-to-br from-slate-50 to-white shadow-lg p-6"
                                            >
                                                <div className="text-base font-black text-slate-600 mb-2">(deleted / unavailable)</div>
                                                <div className="text-xs font-semibold text-slate-500 break-words mb-4">id: {it.id}</div>
                                                <form action={removeSavedDropFromForm}>
                                                    <input type="hidden" name="drop_id" value={it.id} />
                                                    <button
                                                        type="submit"
                                                        className="w-full rounded-xl bg-slate-100 border-2 border-slate-200 px-4 py-2 text-sm font-black text-slate-800 transition-all duration-200 hover:bg-slate-200"
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
                                            className="group rounded-3xl border-2 border-slate-200 bg-white shadow-lg overflow-hidden transition-all duration-300 hover:shadow-2xl hover:-translate-y-1"
                                        >
                                            <Link href={addQuery(`/drops/${d.id}`, { imp })} className="block">
                                                <div className="aspect-square bg-slate-100 overflow-hidden">
                                                    {d.cover_image_url ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={d.cover_image_url}
                                                            alt={d.title}
                                                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                        />
                                                    ) : null}
                                                </div>
                                                <div className="p-5">
                                                    <h3
                                                        className="line-clamp-2 text-lg font-black text-slate-900 mb-2"
                                                        style={{ fontFamily: "'Cormorant Garamond', serif" }}
                                                    >
                                                        {d.title ?? "(no title)"}
                                                    </h3>
                                                    <div className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                                                        {[d.brand, d.size, d.condition].filter(Boolean).join(" · ") || " "}
                                                    </div>
                                                    {d.price != null ? (
                                                        <div className="mt-3 text-base font-black text-orange-600">¥{fmtYen(d.price)}</div>
                                                    ) : null}
                                                </div>
                                            </Link>

                                            <div className="border-t-2 border-slate-100 p-5 flex items-center justify-between gap-3">
                                                <form action={removeSavedDropFromForm}>
                                                    <input type="hidden" name="drop_id" value={d.id} />
                                                    <button
                                                        type="submit"
                                                        className="rounded-xl bg-slate-100 border-2 border-slate-200 px-4 py-2 text-sm font-black text-slate-800 transition-all duration-200 hover:bg-slate-200"
                                                    >
                                                        解除
                                                    </button>
                                                </form>

                                                <div className="flex gap-2">
                                                    {d.purchase_url ? (
                                                        <a
                                                            href={d.purchase_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 px-4 py-2 text-sm font-black text-white shadow-md transition-all duration-200 hover:scale-105 no-underline"
                                                        >
                                                            Buy
                                                        </a>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>

                    {/* Saved Shops Section */}
                    <section>
                        <div className="flex items-center justify-between gap-3 mb-6">
                            <h2 className="text-4xl font-black tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                                Saved Shops
                            </h2>
                            <span className="rounded-full bg-purple-100 border border-purple-300 px-4 py-1.5 text-sm font-black text-purple-700">
                                {savedShops.length} saved
                            </span>
                        </div>

                        {ssErr ? (
                            <div className="rounded-3xl border-2 border-red-200 bg-gradient-to-br from-red-50 to-white p-6 shadow-xl">
                                <div className="text-base font-bold text-red-700">saved_shops の取得でエラー: {ssErr.message}</div>
                            </div>
                        ) : shopItems.length === 0 ? (
                            <div className="rounded-3xl border-2 border-slate-200 bg-gradient-to-br from-white to-slate-50 p-12 shadow-xl text-center">
                                <div className="text-6xl mb-4">🏪</div>
                                <div className="text-base font-bold text-slate-600">まだ保存したShopがありません。</div>
                            </div>
                        ) : (
                            <ul className="grid list-none gap-6 p-0 md:grid-cols-2 lg:grid-cols-3">
                                {shopItems.map((it) => {
                                    const s = it.shop;

                                    if (!s) {
                                        return (
                                            <li
                                                key={it.slug}
                                                className="rounded-3xl border-2 border-slate-200 bg-gradient-to-br from-slate-50 to-white shadow-lg p-6"
                                            >
                                                <div className="text-base font-black text-slate-600 mb-2">(deleted / unavailable)</div>
                                                <div className="text-xs font-semibold text-slate-500 break-words mb-4">slug: {it.slug}</div>
                                                <form action={removeSavedShopFromForm}>
                                                    <input type="hidden" name="shop_slug" value={it.slug} />
                                                    <button
                                                        type="submit"
                                                        className="w-full rounded-xl bg-slate-100 border-2 border-slate-200 px-4 py-2 text-sm font-black text-slate-800 transition-all duration-200 hover:bg-slate-200"
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
                                            className="group rounded-3xl border-2 border-slate-200 bg-white shadow-lg p-6 transition-all duration-300 hover:shadow-2xl hover:-translate-y-1"
                                        >
                                            <Link
                                                href={addQuery(`/shops/${encodeURIComponent(s.slug)}`, { imp })}
                                                className="flex gap-4 items-start mb-4 no-underline"
                                            >
                                                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-purple-100 to-purple-50 overflow-hidden shrink-0 border-2 border-slate-200">
                                                    {s.avatar_url ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={s.avatar_url}
                                                            alt={shopName}
                                                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                        />
                                                    ) : null}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <h3
                                                        className="text-lg font-black text-slate-900 truncate mb-1"
                                                        style={{ fontFamily: "'Cormorant Garamond', serif" }}
                                                    >
                                                        {shopName}
                                                        {inactive ? <span className="ml-2 text-xs font-black text-slate-500">(inactive)</span> : null}
                                                    </h3>
                                                    {s.headline ? (
                                                        <div className="text-xs font-semibold text-slate-600 line-clamp-2">{s.headline}</div>
                                                    ) : null}
                                                </div>
                                            </Link>

                                            <form action={removeSavedShopFromForm}>
                                                <input type="hidden" name="shop_slug" value={s.slug} />
                                                <button
                                                    type="submit"
                                                    className="w-full rounded-xl bg-slate-100 border-2 border-slate-200 px-4 py-2 text-sm font-black text-slate-800 transition-all duration-200 hover:bg-slate-200"
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
        </SavedClient>
    );
}
