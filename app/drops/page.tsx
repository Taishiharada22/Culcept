// app/drops/page.tsx
import Link from "next/link";
import { randomUUID } from "crypto";
import { supabaseServer } from "@/lib/supabase/server";
import DropCard from "@/app/drops/DropCard";
import { toggleSavedDropAction } from "@/app/_actions/saved";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

export default async function DropsPage({ searchParams }: { searchParams?: SP }) {
    const sp = searchParams ?? {};
    const q = spStr(sp.q);
    const shop = spStr(sp.shop);

    const impFromUrl = spStr(sp.imp || sp.impressionId || sp.impression_id) || null;
    const imp = impFromUrl || randomUUID();

    const supabase = await supabaseServer();

    const [{ data: auth }, { data, error }] = await Promise.all([
        supabase.auth.getUser(),
        (async () => {
            let query = supabase
                .from("v_drops_ranked_30d_v2")
                .select(
                    "id,title,brand,size,condition,price,cover_image_url,display_price,highest_bid_30d,sale_mode,is_auction_live,hot_score,shop_slug,shop_name_ja,shop_name_en,shop_avatar_url,shop_headline"
                )
                .order("hot_score", { ascending: false })
                .limit(90);

            if (shop) query = query.eq("shop_slug", shop);
            if (q) query = query.or(`title.ilike.%${q}%,brand.ilike.%${q}%`);

            return await query;
        })(),
    ]);

    const userId = auth?.user?.id ?? null;

    const dropIds = (data ?? []).map((d: any) => d?.id).filter(Boolean) as string[];

    // ----------------------------
    // Saved
    // ----------------------------
    let savedSet = new Set<string>();
    if (userId && dropIds.length) {
        const { data: sd, error: sdErr } = await supabase
            .from("saved_drops")
            .select("drop_id")
            .eq("user_id", userId)
            .in("drop_id", dropIds);

        if (!sdErr) savedSet = new Set((sd ?? []).map((r: any) => r.drop_id));
    }

    // ----------------------------
    // Reviews stats (v_product_review_stats)
    // NOTE:
    // 本当は `select("*, stats:v_product_review_stats(...)")` で一発JOINしたいけど、
    // PostgREST的に relationship が無いと embed が失敗するので、確実に動く2段階取得で合体する。
    // ----------------------------
    type StatRow = { product_id: string; average_rating: any; total_reviews: any };
    const statsMap = new Map<string, { average_rating: number | null; total_reviews: number }>();

    if (dropIds.length) {
        const { data: statsRows, error: statsErr } = await supabase
            .from("v_product_review_stats")
            .select("product_id, average_rating, total_reviews")
            .in("product_id", dropIds);

        if (!statsErr && statsRows?.length) {
            for (const r of statsRows as StatRow[]) {
                const pid = String(r.product_id || "");
                if (!pid) continue;

                const avgNum = r.average_rating == null ? null : Number(r.average_rating);
                const avg = Number.isFinite(avgNum as any) ? (avgNum as number) : null;

                const cntNum = r.total_reviews == null ? 0 : Number(r.total_reviews);
                const cnt = Number.isFinite(cntNum) ? cntNum : 0;

                statsMap.set(pid, { average_rating: avg, total_reviews: cnt });
            }
        }
    }

    // ✅ DropCard が読む形に flatten
    const rows =
        (data ?? []).map((d: any) => {
            const st = statsMap.get(d.id);
            return {
                ...d,
                average_rating: st?.average_rating ?? null,
                review_count: st?.total_reviews ?? 0, // DropCard 側で表示条件チェックしてる
            };
        }) ?? [];

    const clickMeta = { where: "drops_list_click", where_shop: "drops_list_shop_click" };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50/10 to-purple-50/10">
            {/* Hero Header */}
            <div className="border-b-2 border-slate-200 bg-gradient-to-r from-white via-orange-50/20 to-purple-50/20 py-12">
                <div className="mx-auto max-w-7xl px-6">
                    <div className="flex items-end justify-between gap-6 mb-8">
                        <div>
                            <h1
                                className="text-7xl font-black tracking-tight text-slate-900 mb-3"
                                style={{ fontFamily: "'Cormorant Garamond', serif" }}
                            >
                                Products
                            </h1>
                            <p className="text-base font-bold text-slate-600">Discover unique items from curated stores</p>
                        </div>

                        <div className="flex gap-3">
                            <Link
                                href={addQuery("/drops/new", { imp })}
                                className="rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 border-2 border-orange-400 px-6 py-3 text-sm font-black text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 no-underline"
                            >
                                + List Product
                            </Link>

                            <Link
                                href={addQuery("/shops/me", { imp })}
                                className="rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 border-2 border-purple-400 px-6 py-3 text-sm font-black text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 no-underline"
                            >
                                My Store
                            </Link>

                            <Link
                                href={addQuery("/me/saved", { imp })}
                                className="rounded-xl bg-white border-2 border-slate-300 px-6 py-3 text-sm font-black text-slate-700 shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 hover:border-teal-400 hover:text-teal-600 no-underline"
                            >
                                ❤️ Saved
                            </Link>
                        </div>
                    </div>

                    {/* Active Filters */}
                    {(shop || q) && (
                        <div className="flex flex-wrap gap-2 mb-4">
                            {shop && (
                                <span className="rounded-full bg-purple-100 border-2 border-purple-300 px-4 py-1.5 text-sm font-black text-purple-700">
                                    Store: {shop}
                                </span>
                            )}
                            {q && (
                                <span className="rounded-full bg-orange-100 border-2 border-orange-300 px-4 py-1.5 text-sm font-black text-orange-700">
                                    Search: "{q}"
                                </span>
                            )}
                            <Link
                                href={addQuery("/drops", { imp })}
                                className="rounded-full bg-slate-100 border-2 border-slate-300 px-4 py-1.5 text-sm font-black text-slate-700 hover:bg-slate-200 no-underline"
                            >
                                Clear
                            </Link>
                        </div>
                    )}

                    {/* Search */}
                    <form action="/drops" method="GET" className="relative max-w-2xl">
                        <input type="hidden" name="imp" value={imp || ""} />
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl text-slate-400 pointer-events-none">
                            🔍
                        </span>
                        <input
                            type="text"
                            name="q"
                            defaultValue={q}
                            placeholder="Search products, brands, styles..."
                            className="w-full rounded-xl border-2 border-slate-200 bg-white pl-12 pr-4 py-4 text-base font-semibold text-slate-900 transition-all duration-200 focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-100"
                        />
                    </form>
                </div>
            </div>

            {/* Main Content */}
            <div className="mx-auto max-w-7xl px-6 py-12">
                {error ? (
                    <div className="rounded-3xl border-2 border-red-200 bg-gradient-to-br from-red-50 to-white p-8 shadow-xl">
                        <div className="text-lg font-black text-red-600 mb-2">Error</div>
                        <div className="text-sm font-semibold text-slate-700 break-words">{error.message}</div>
                    </div>
                ) : null}

                {/* Product Count */}
                {rows?.length ? (
                    <div className="mb-6 text-sm font-bold text-slate-600">
                        <span className="text-2xl font-black text-slate-900">{rows.length}</span> products found
                    </div>
                ) : null}

                {rows?.length ? (
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" style={{ perspective: "1000px" }}>
                        {rows.map((d: any, idx: number) => (
                            <div
                                key={d.id}
                                style={{
                                    animationDelay: `${idx * 0.03}s`,
                                }}
                            >
                                <DropCard
                                    d={d}
                                    imp={imp}
                                    clickMeta={clickMeta}
                                    showSave={!!userId}
                                    initialSaved={savedSet.has(d.id)}
                                    toggleSaveAction={toggleSavedDropAction}
                                />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="rounded-3xl border-2 border-slate-200 bg-gradient-to-br from-white to-slate-50 p-16 shadow-xl text-center">
                        <div className="text-8xl mb-6 opacity-20">🔍</div>
                        <h3 className="text-2xl font-black text-slate-900 mb-3">No Products Found</h3>
                        <p className="text-base font-semibold text-slate-600 mb-6">Try adjusting your search or browse all products</p>
                        <Link
                            href={addQuery("/drops", { imp })}
                            className="inline-block rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3 text-sm font-black text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 no-underline"
                        >
                            View All Products
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}
