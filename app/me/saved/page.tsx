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

/** URLにクエリを足す（? があれば & で追記） */
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

export default async function SavedPage({
    searchParams,
}: {
    searchParams?: Promise<SP>;
}) {
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
            <div className="grid gap-4">
                <h1 className="text-2xl font-extrabold">Saved</h1>
                <p className="text-sm font-semibold text-zinc-700">ログインすると保存一覧が見れます。</p>

                <Link
                    className="rounded-xl bg-black text-white px-4 py-2 font-extrabold w-fit"
                    href={addQuery("/login", { imp })}
                >
                    Login
                </Link>

                <Link
                    className="text-sm font-extrabold text-zinc-700 hover:text-zinc-950"
                    href={addQuery("/drops", { imp })}
                >
                    ← Dropsへ
                </Link>
            </div>
        );
    }

    const userId = auth.user.id;

    // ===== Saved Drops =====
    const { data: savedDropsRaw, error: sdErr } = await supabase
        .from("saved_drops")
        .select("drop_id,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);

    if (sdErr) {
        return (
            <div className="grid gap-3">
                <Link href={addQuery("/drops", { imp })} className="text-sm font-extrabold text-zinc-700 hover:text-zinc-950">
                    ← Dropsへ
                </Link>
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                    {sdErr.message}
                </p>
            </div>
        );
    }

    const savedDrops = (savedDropsRaw ?? []) as SavedDropRow[];
    const dropIds = savedDrops.map((x) => x.drop_id).filter(Boolean);

    // dropId -> dropRow
    let dropMap = new Map<string, DropRow>();
    if (dropIds.length) {
        const { data: dropRows, error: dErr } = await supabase
            .from("drops")
            .select("id,created_at,title,brand,size,condition,price,cover_image_url,purchase_url,url")
            .in("id", dropIds);

        if (dErr) {
            return (
                <div className="grid gap-3">
                    <Link href={addQuery("/drops", { imp })} className="text-sm font-extrabold text-zinc-700 hover:text-zinc-950">
                        ← Dropsへ
                    </Link>
                    <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                        {dErr.message}
                    </p>
                </div>
            );
        }

        dropMap = new Map((dropRows ?? []).map((d: any) => [d.id, d as DropRow]));
    }

    // saved順で「存在しないdrop」も含めて並べる
    const dropItems = savedDrops.map((s) => ({
        saved_at: s.created_at,
        id: s.drop_id,
        drop: dropMap.get(s.drop_id) ?? null,
    }));

    // ===== Saved Shops =====
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
            // ★ is_active=true で絞ると「非公開になったShopを解除できない」ので外す
            const { data: shopRows, error: shErr } = await supabase
                .from("shops")
                .select("slug,name_ja,name_en,headline,avatar_url,is_active")
                .in("slug", slugs);

            if (!shErr) {
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
        <div className="grid gap-6">
            <div className="flex items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-extrabold">Saved</h1>
                    <div className="text-xs font-semibold text-zinc-500">あなたが保存したDrop / Shop</div>
                </div>
                <Link href={addQuery("/drops", { imp })} className="text-sm font-extrabold text-zinc-700 hover:text-zinc-950">
                    ← Dropsへ
                </Link>
            </div>

            {/* flash */}
            {flash ? (
                <div
                    className={[
                        "rounded-2xl border p-4 text-sm font-semibold",
                        flash.kind === "ok"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-red-200 bg-red-50 text-red-700",
                    ].join(" ")}
                >
                    <div className="flex items-center justify-between gap-3">
                        <div>{flash.text}</div>
                        <Link
                            href={addQuery("/me/saved", { imp })}
                            className="text-xs font-extrabold underline opacity-80 hover:opacity-100"
                        >
                            閉じる
                        </Link>
                    </div>
                </div>
            ) : null}

            {errText ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                    <div className="flex items-center justify-between gap-3">
                        <div>エラー: {errText}</div>
                        <Link
                            href={addQuery("/me/saved", { imp })}
                            className="text-xs font-extrabold underline opacity-80 hover:opacity-100"
                        >
                            閉じる
                        </Link>
                    </div>
                </div>
            ) : null}

            {/* Saved Drops */}
            <section className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-extrabold">Saved Drops</h2>
                    <span className="text-xs font-semibold text-zinc-500">{savedDrops.length} saved</span>
                </div>

                {dropItems.length === 0 ? (
                    <div className="rounded-2xl border bg-white p-5 text-sm font-semibold text-zinc-600">
                        まだ保存したDropがありません。
                    </div>
                ) : (
                    <ul className="grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
                        {dropItems.map((it) => {
                            const d = it.drop;

                            // Drop本体が無い（削除済みなど）でも解除できるカード
                            if (!d) {
                                return (
                                    <li key={it.id} className="rounded-2xl border bg-white shadow-sm overflow-hidden">
                                        <div className="aspect-[4/3] bg-zinc-100" />
                                        <div className="p-4 grid gap-2">
                                            <div className="text-sm font-extrabold line-clamp-2">(deleted / unavailable)</div>
                                            <div className="text-xs font-semibold text-zinc-500 break-words">id: {it.id}</div>
                                            <div className="text-xs font-semibold text-zinc-600">
                                                このDropは削除/非公開の可能性があります。解除だけ可能です。
                                            </div>
                                        </div>

                                        <div className="px-4 pb-4 flex items-center justify-between gap-2">
                                            <form action={removeSavedDropFromForm}>
                                                <input type="hidden" name="drop_id" value={it.id} />
                                                <button
                                                    type="submit"
                                                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-extrabold text-zinc-800 hover:bg-zinc-50"
                                                >
                                                    解除
                                                </button>
                                            </form>
                                            <span className="text-[11px] font-semibold text-zinc-400">
                                                saved_at: {String(it.saved_at ?? "")}
                                            </span>
                                        </div>
                                    </li>
                                );
                            }

                            return (
                                <li key={d.id} className="rounded-2xl border bg-white shadow-sm overflow-hidden">
                                    <Link href={addQuery(`/drops/${d.id}`, { imp })} className="block hover:opacity-95">
                                        <div className="aspect-[4/3] bg-zinc-100 overflow-hidden">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            {d.cover_image_url ? <img src={d.cover_image_url} alt="" className="h-full w-full object-cover" /> : null}
                                        </div>
                                        <div className="p-4 grid gap-2">
                                            <div className="text-sm font-extrabold line-clamp-2">{d.title ?? "(no title)"}</div>
                                            <div className="text-xs font-semibold text-zinc-600 flex flex-wrap gap-x-3 gap-y-1">
                                                {d.brand ? <span>{d.brand}</span> : null}
                                                {d.size ? <span>{d.size}</span> : null}
                                                {d.condition ? <span>{d.condition}</span> : null}
                                                {d.price != null ? <span className="font-black text-zinc-900">¥{fmtYen(d.price)}</span> : null}
                                            </div>
                                        </div>
                                    </Link>

                                    <div className="px-4 pb-4 flex items-center justify-between gap-2">
                                        <form action={removeSavedDropFromForm}>
                                            <input type="hidden" name="drop_id" value={d.id} />
                                            <button
                                                type="submit"
                                                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-extrabold text-zinc-800 hover:bg-zinc-50"
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
                                                    className="rounded-xl bg-black px-3 py-2 text-xs font-extrabold text-white hover:opacity-90"
                                                >
                                                    Buy
                                                </a>
                                            ) : null}
                                            {d.url ? (
                                                <a
                                                    href={d.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-extrabold text-zinc-800 hover:bg-zinc-50"
                                                >
                                                    Link
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

            {/* Saved Shops */}
            <section className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-extrabold">Saved Shops</h2>
                    <span className="text-xs font-semibold text-zinc-500">{savedShops.length} saved</span>
                </div>

                {ssErr ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">
                        saved_shops の取得でエラー: {ssErr.message}
                    </div>
                ) : shopItems.length === 0 ? (
                    <div className="rounded-2xl border bg-white p-5 text-sm font-semibold text-zinc-600">
                        まだ保存したShopがありません。
                    </div>
                ) : (
                    <ul className="grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
                        {shopItems.map((it) => {
                            const s = it.shop;

                            // Shop本体が無い（削除済みなど）でも解除できるカード
                            if (!s) {
                                return (
                                    <li key={it.slug} className="rounded-2xl border bg-white shadow-sm p-4 grid gap-3">
                                        <div className="text-sm font-extrabold">(deleted / unavailable)</div>
                                        <div className="text-xs font-semibold text-zinc-500 break-words">slug: {it.slug}</div>
                                        <div className="text-xs font-semibold text-zinc-600">
                                            このShopは削除/非公開の可能性があります。解除だけ可能です。
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <form action={removeSavedShopFromForm}>
                                                <input type="hidden" name="shop_slug" value={it.slug} />
                                                <button
                                                    type="submit"
                                                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-extrabold text-zinc-800 hover:bg-zinc-50"
                                                >
                                                    解除
                                                </button>
                                            </form>

                                            <span className="text-[11px] font-semibold text-zinc-400">
                                                saved_at: {String(it.saved_at ?? "")}
                                            </span>
                                        </div>
                                    </li>
                                );
                            }

                            const shopName = s.name_ja || s.name_en || s.slug;
                            const inactive = s.is_active === false;

                            return (
                                <li key={s.slug} className="rounded-2xl border bg-white shadow-sm p-4 grid gap-3">
                                    <Link
                                        href={addQuery(`/shops/${encodeURIComponent(s.slug)}`, { imp })}
                                        className="flex gap-3 items-start hover:opacity-95"
                                    >
                                        <div className="h-12 w-12 rounded-2xl bg-zinc-100 overflow-hidden shrink-0">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            {s.avatar_url ? <img src={s.avatar_url} alt="" className="h-full w-full object-cover" /> : null}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-extrabold truncate">
                                                {shopName}
                                                {inactive ? (
                                                    <span className="ml-2 text-[11px] font-black text-zinc-500">(inactive)</span>
                                                ) : null}
                                            </div>
                                            {s.headline ? (
                                                <div className="mt-1 text-xs font-semibold text-zinc-600 line-clamp-2">{s.headline}</div>
                                            ) : null}
                                            <div className="mt-1 text-[11px] font-semibold text-zinc-400">slug: {s.slug}</div>
                                        </div>
                                    </Link>

                                    <div className="flex items-center justify-between">
                                        <form action={removeSavedShopFromForm}>
                                            <input type="hidden" name="shop_slug" value={s.slug} />
                                            <button
                                                type="submit"
                                                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-extrabold text-zinc-800 hover:bg-zinc-50"
                                            >
                                                解除
                                            </button>
                                        </form>

                                        <Link
                                            href={addQuery(`/drops?shop=${encodeURIComponent(s.slug)}`, { imp })}
                                            className="text-xs font-extrabold text-zinc-700 hover:text-zinc-950"
                                        >
                                            このShopのDrops →
                                        </Link>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </div>
    );
}
