// app/shops/page.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

import DropCard from "@/app/drops/DropCard";
import { toggleSavedDropAction } from "@/app/_actions/saved";

export const dynamic = "force-dynamic";

type ShopRow = {
    slug: string;
    name_ja: string | null;
    name_en: string | null;
    avatar_url: string | null;
    headline: string | null;
    style_tags: string[]; // normalize後は必ず配列
    cover_url: string | null;
    banner_url: string | null;
    is_active: boolean;
    tag_scores?: Record<string, number>; // optional
};

// Supabase “生” の戻りは unknown が混ざりがち
type ShopRowRaw = Omit<ShopRow, "style_tags" | "tag_scores" | "is_active"> & {
    style_tags: unknown;
    tag_scores?: unknown;
    is_active: unknown;
};

type HotDropRow = {
    id: string;
    title: string | null;
    brand: string | null;
    size: string | null;
    condition: string | null;
    price: number | null;
    cover_image_url: string | null;
    display_price: string | null;
    highest_bid_30d: number | null;
    sale_mode: string | null;
    is_auction_live: boolean | null;
    hot_score: number | null;
    shop_slug: string | null;
    shop_name_ja: string | null;
    shop_name_en: string | null;
    shop_avatar_url: string | null;
    shop_headline: string | null;
};

function pickName(s: ShopRow) {
    return s.name_ja || s.name_en || s.slug;
}

type SP = Record<string, string | string[] | undefined>;
function spStr(v: unknown) {
    return String(Array.isArray(v) ? v[0] : v ?? "").trim();
}

function clampScore(n: unknown) {
    const x = Math.round(Number(n));
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(100, x));
}

function normalizeScoreMap(raw: unknown): Record<string, number> {
    if (!raw) return {};
    if (Array.isArray(raw)) {
        const out: Record<string, number> = {};
        for (const it of raw as any[]) {
            const tag = String((it as any)?.tag ?? "").trim().toLowerCase();
            if (!tag) continue;
            out[tag] = clampScore((it as any)?.score);
        }
        return out;
    }
    if (typeof raw === "object") {
        const out: Record<string, number> = {};
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
            const tag = String(k ?? "").trim().toLowerCase();
            if (!tag) continue;
            out[tag] = clampScore(v);
        }
        return out;
    }
    return {};
}

function normalizeTags(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return Array.from(
        new Set(
            (raw as unknown[])
                .map((x) => String(x ?? "").trim().toLowerCase())
                .filter(Boolean)
                .slice(0, 20)
        )
    );
}

function toShopRow(r: ShopRowRaw): ShopRow {
    const style_tags = normalizeTags(r.style_tags);
    const tag_scores = r.tag_scores != null ? normalizeScoreMap(r.tag_scores) : undefined;
    const is_active = !!r.is_active;

    return {
        slug: String(r.slug ?? "").trim(),
        name_ja: r.name_ja ?? null,
        name_en: r.name_en ?? null,
        avatar_url: r.avatar_url ?? null,
        headline: r.headline ?? null,
        style_tags,
        cover_url: r.cover_url ?? null,
        banner_url: r.banner_url ?? null,
        is_active,
        tag_scores,
    };
}

export default async function ShopsPage({ searchParams }: { searchParams: Promise<SP> }) {
    const sp = (await searchParams) ?? {};
    const q = spStr(sp.q);
    const tag = spStr(sp.tag);

    const supabase = await supabaseServer();

    // hot Products（おすすめ）と auth は先に並列で走らせる
    const hotDropsQuery = supabase
        .from("v_drops_ranked_30d_v2")
        .select(
            "id,title,brand,size,condition,price,cover_image_url,display_price,highest_bid_30d,sale_mode,is_auction_live,hot_score,shop_slug,shop_name_ja,shop_name_en,shop_avatar_url,shop_headline"
        )
        .order("hot_score", { ascending: false })
        .limit(12);

    const hotP = hotDropsQuery;
    const authP = supabase.auth.getUser();

    // shops query（tag_scores は optional：まず入れて試し、エラーなら外して再取得）
    const buildShopsQuery = (withScores: boolean) => {
        const sel =
            "slug,name_ja,name_en,avatar_url,headline,style_tags,cover_url,banner_url,is_active" +
            (withScores ? ",tag_scores" : "");

        let shopsQuery = supabase
            .from("shops")
            .select(sel)
            .eq("is_active", true)
            .limit(60);

        if (q) {
            const safe = q.slice(0, 50).replace(/[(),]/g, " ").trim();
            const like = `%${safe.replace(/[%_]/g, "")}%`;
            if (safe) shopsQuery = shopsQuery.or(`name_ja.ilike.${like},name_en.ilike.${like},headline.ilike.${like}`);
        }

        if (tag) shopsQuery = shopsQuery.contains("style_tags", [tag]);

        return shopsQuery;
    };

    let shops: ShopRow[] = [];
    let shopsErrMsg: string | null = null;

    const r1 = await buildShopsQuery(true);
    if (!r1.error) {
        shops = ((r1.data ?? []) as any[]).map((x) => toShopRow(x as ShopRowRaw));
    } else {
        const r2 = await buildShopsQuery(false);
        if (!r2.error) {
            shops = ((r2.data ?? []) as any[]).map((x) => toShopRow(x as ShopRowRaw));
        } else {
            shopsErrMsg = r2.error.message;
            shops = [];
        }
    }

    const [{ data: hotDropsData, error: hotErr }, { data: auth }] = await Promise.all([hotP, authP]);
    const hotDrops = (hotDropsData ?? []) as HotDropRow[];

    const userId = auth?.user?.id ?? null;

    // Hot Products Saved 初期状態（まとめて）
    const hotDropIds = hotDrops.map((d) => d.id).filter(Boolean);
    let savedSet = new Set<string>();
    if (userId && hotDropIds.length) {
        const { data: sd, error: sdErr } = await supabase.from("saved_drops").select("drop_id").eq("user_id", userId).in("drop_id", hotDropIds);
        if (!sdErr) savedSet = new Set((sd ?? []).map((r: any) => r.drop_id));
    }

    // タグ候補（表示中ショップから集計）
    const tagCounts = new Map<string, number>();
    for (const s of shops) {
        for (const t of s.style_tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
    const topTags = [...tagCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([t]) => t);

    const clickMeta = { where: "shops_hot_drop_click", where_shop: "shops_hot_drop_shop_click" };

    return (
        <main className="mx-auto max-w-6xl py-2 grid gap-8">
            {/* HERO */}
            <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm grid gap-3">
                <div className="grid gap-1">
                    <h1 className="text-2xl font-extrabold tracking-tight">古着店の入り口</h1>
                    <p className="text-xs font-semibold text-zinc-600">
                        実店舗の“世界観”から選ぶ。まずは <span className="font-black">URL＋紹介</span> だけで掲載できます（ページのコーディネイトは順次拡張）。
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Link
                        href="#reco"
                        className="inline-flex rounded-md bg-zinc-900 px-3 py-2 text-xs font-black text-white no-underline hover:bg-zinc-800"
                    >
                        おすすめを見る →
                    </Link>
                    <Link
                        href="#shops"
                        className="inline-flex rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-800 no-underline hover:bg-zinc-50"
                    >
                        お店を探す →
                    </Link>
                    <Link
                        href="/"
                        className="inline-flex rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-700 no-underline hover:bg-zinc-50"
                    >
                        HOMEへ →
                    </Link>

                    <div className="grow" />

                    <Link
                        href="/shops/me"
                        className="inline-flex rounded-md border border-zinc-900 bg-white px-3 py-2 text-xs font-black text-zinc-900 no-underline hover:bg-zinc-50"
                    >
                        お店オーナー：登録 / 編集 →
                    </Link>
                </div>
            </header>

            {/* RECO */}
            <section id="reco" className="grid gap-3">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-extrabold tracking-tight">おすすめ（Hot Products）</h2>
                        <p className="mt-1 text-xs font-semibold text-zinc-600">
                            直近の反応・勢いからピックアップ（個人入口の最適化は次段）。
                        </p>
                    </div>
                    <Link href="/drops" className="text-xs font-extrabold text-zinc-700 hover:text-zinc-950 no-underline">
                        Productsへ →
                    </Link>
                </div>

                {hotErr ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{hotErr.message}</div>
                ) : hotDrops.length === 0 ? (
                    <div className="rounded-xl border bg-white p-6 text-sm font-semibold text-zinc-600">おすすめを準備中です。</div>
                ) : (
                    <ul className="grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
                        {hotDrops.map((d: any) => (
                            <DropCard
                                key={d.id}
                                d={d}
                                imp={null}
                                clickMeta={clickMeta as any}
                                showSave={!!userId}
                                initialSaved={savedSet.has(d.id)}
                                toggleSaveAction={toggleSavedDropAction}
                            />
                        ))}
                    </ul>
                )}
            </section>

            {/* SHOPS */}
            <section id="shops" className="grid gap-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-extrabold tracking-tight">お店から探す</h2>
                        <p className="mt-1 text-xs font-semibold text-zinc-600">“誰の店か” から選ぶ。世界観 → 店舗ページ（MVPはリンク中心）。</p>
                    </div>

                    <form className="flex items-center gap-2" action="/shops" method="get">
                        <input
                            name="q"
                            defaultValue={q}
                            placeholder="search shop..."
                            className="w-56 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        />
                        {tag ? <input type="hidden" name="tag" value={tag} /> : null}
                        <button className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-extrabold text-white hover:bg-zinc-800" type="submit">
                            Search
                        </button>
                    </form>
                </div>

                {topTags.length ? (
                    <div className="flex flex-wrap gap-2">
                        <Link
                            href={`/shops${q ? `?q=${encodeURIComponent(q)}` : ""}`}
                            className={[
                                "rounded-full border px-3 py-1 text-xs font-black no-underline",
                                tag ? "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50" : "border-zinc-900 bg-zinc-900 text-white",
                            ].join(" ")}
                        >
                            All
                        </Link>

                        {topTags.map((t) => {
                            const href = `/shops?${new URLSearchParams({ ...(q ? { q } : {}), tag: t }).toString()}`;
                            const active = tag === t;
                            return (
                                <Link
                                    key={t}
                                    href={href}
                                    className={[
                                        "rounded-full border px-3 py-1 text-xs font-black no-underline",
                                        active ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                                    ].join(" ")}
                                >
                                    #{t}
                                </Link>
                            );
                        })}
                    </div>
                ) : null}

                {shopsErrMsg ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{shopsErrMsg}</div>
                ) : shops.length === 0 ? (
                    <div className="rounded-xl border bg-white p-8 text-sm font-semibold text-zinc-600">ショップがまだありません。</div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                        {shops.map((s) => {
                            const name = pickName(s);
                            const cover = s.cover_url || s.banner_url || "";
                            const tags = s.style_tags;

                            return (
                                <Link
                                    key={s.slug}
                                    href={`/shops/${s.slug}`}
                                    className="group overflow-hidden rounded-2xl border bg-white shadow-sm no-underline transition hover:shadow-md"
                                >
                                    <div className="h-28 w-full bg-zinc-100">
                                        {cover ? (
                                            <>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={cover} alt="cover" className="h-full w-full object-cover" />
                                            </>
                                        ) : null}
                                    </div>

                                    <div className="p-5">
                                        <div className="flex items-start gap-3">
                                            <div className="shrink-0">
                                                {s.avatar_url ? (
                                                    <>
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={s.avatar_url} alt={name} className="h-12 w-12 rounded-full border border-zinc-200 object-cover" />
                                                    </>
                                                ) : (
                                                    <div className="h-12 w-12 rounded-full border border-zinc-200 bg-zinc-50" />
                                                )}
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-base font-extrabold text-zinc-900">{name}</div>
                                                <div className="mt-1 line-clamp-1 text-xs font-semibold text-zinc-600">{s.headline ?? " "}</div>

                                                {tags.length ? (
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        {tags.slice(0, 6).map((t) => {
                                                            const sc = s.tag_scores?.[String(t).toLowerCase()];
                                                            return (
                                                                <span
                                                                    key={t}
                                                                    className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-[11px] font-black text-zinc-700"
                                                                    title={typeof sc === "number" ? `score: ${sc}` : undefined}
                                                                >
                                                                    #{t}
                                                                    {typeof sc === "number" ? (
                                                                        <span className="ml-1 text-[10px] font-black text-zinc-400">{sc}</span>
                                                                    ) : null}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                ) : null}

                                                <div className="mt-4 text-xs font-extrabold text-zinc-400 group-hover:text-zinc-600">View shop →</div>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </section>
        </main>
    );
}
