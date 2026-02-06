// app/drops/page.tsx
import Link from "next/link";
import { randomUUID } from "crypto";
import { supabaseServer } from "@/lib/supabase/server";
import DropCard from "@/app/drops/DropCard";
import { toggleSavedDropAction } from "@/app/_actions/saved";
import DropsPageWrapper from "./DropsPageWrapper";

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

export default async function DropsPage({ searchParams }: { searchParams?: Promise<SP> }) {
    const sp = (await searchParams) ?? {};
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

    // Saved
    let savedSet = new Set<string>();
    if (userId && dropIds.length) {
        const { data: sd, error: sdErr } = await supabase
            .from("saved_drops")
            .select("drop_id")
            .eq("user_id", userId)
            .in("drop_id", dropIds);

        if (!sdErr) savedSet = new Set((sd ?? []).map((r: any) => r.drop_id));
    }

    // Reviews stats
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

    const rows =
        (data ?? []).map((d: any) => {
            const st = statsMap.get(d.id);
            return {
                ...d,
                average_rating: st?.average_rating ?? null,
                review_count: st?.total_reviews ?? 0,
            };
        }) ?? [];

    const clickMeta = { where: "drops_list_click", where_shop: "drops_list_shop_click" };

    return (
        <DropsPageWrapper
            imp={imp}
            q={q}
            shop={shop}
            count={rows.length}
            hasError={!!error}
            errorMessage={error?.message}
        >
            {rows.length > 0 ? (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {rows.map((d: any, idx: number) => (
                        <DropCard
                            key={d.id}
                            d={d}
                            imp={imp}
                            clickMeta={clickMeta}
                            showSave={!!userId}
                            initialSaved={savedSet.has(d.id)}
                            toggleSaveAction={toggleSavedDropAction}
                        />
                    ))}
                </div>
            ) : (
                <div className="rounded-3xl border border-white/60 bg-white/60 backdrop-blur-xl p-16 text-center">
                    <div className="text-8xl mb-6 opacity-40">🔍</div>
                    <h3 className="text-2xl font-black text-slate-900 mb-3">No Products Found</h3>
                    <p className="text-slate-500 mb-6">Try adjusting your search or browse all products</p>
                    <Link
                        href={addQuery("/drops", { imp })}
                        className="inline-block px-6 py-3 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500 rounded-full text-sm font-black text-white shadow-lg shadow-fuchsia-500/30 hover:shadow-xl transition-all"
                    >
                        View All Products
                    </Link>
                </div>
            )}
        </DropsPageWrapper>
    );
}
