import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import DropCard from "@/app/drops/DropCard";
import RecoImpressionPing from "@/app/drops/RecoImpressionPing";
import ShopDropsGridClient from "./ShopDropsGridClient";

import SavedToggleButton from "@/app/_components/saved/SavedToggleButton";
import { toggleSavedShopAction, toggleSavedDropAction } from "@/app/_actions/saved";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function spStr(v: unknown) {
    return String(Array.isArray(v) ? v[0] : v ?? "").trim();
}

export default async function ShopPage({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>;
    searchParams?: Promise<SP>;
}) {
    const p = await params;
    const sp = (await searchParams) ?? {};

    const slug = String(p?.slug ?? "").trim();
    const imp = spStr(sp.imp || sp.impressionId || sp.impression_id) || null;

    if (!slug) {
        return (
            <div className="grid gap-3">
                <Link href="/drops" className="text-sm font-extrabold text-zinc-700 hover:text-zinc-950">← Back</Link>
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">Invalid slug</p>
            </div>
        );
    }

    const supabase = await supabaseServer();

    const [{ data: shop, error: shopErr }, { data: drops }, { data: auth }] = await Promise.all([
        supabase
            .from("shops")
            .select("slug,name_ja,name_en,headline,bio,avatar_url,style_tags,is_active,owner_id")
            .eq("slug", slug)
            .eq("is_active", true)
            .maybeSingle(),
        supabase
            .from("v_drops_ranked_30d_v2")
            .select(
                "id,title,brand,size,condition,price,cover_image_url,display_price,highest_bid_30d,sale_mode,is_auction_live,hot_score,shop_slug,shop_name_ja,shop_name_en,shop_avatar_url,shop_headline"
            )
            .eq("shop_slug", slug)
            .order("hot_score", { ascending: false })
            .limit(60),
        supabase.auth.getUser(),
    ]);

    if (shopErr || !shop) {
        return (
            <div className="grid gap-3">
                <Link href="/drops" className="text-sm font-extrabold text-zinc-700 hover:text-zinc-950">← Back</Link>
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                    {shopErr?.message ?? "Shop not found"}
                </p>
            </div>
        );
    }

    const name = shop.name_ja || shop.name_en || shop.slug;
    const userId = auth?.user?.id ?? null;

    // Shop Saved 初期状態
    let initialShopSaved = false;
    if (userId) {
        const { data: existing } = await supabase
            .from("saved_shops")
            .select("id")
            .eq("user_id", userId)
            .eq("shop_slug", slug)
            .maybeSingle();
        initialShopSaved = !!existing?.id;
    }

    // Drops Saved 初期状態（まとめて）
    const dropIds = (drops ?? []).map((x: any) => x?.id).filter(Boolean) as string[];
    let savedDropIds: string[] = [];
    let savedSet = new Set<string>();

    if (userId && dropIds.length) {
        const { data: sd, error: sdErr } = await supabase
            .from("saved_drops")
            .select("drop_id")
            .eq("user_id", userId)
            .in("drop_id", dropIds);

        if (!sdErr) {
            savedDropIds = (sd ?? []).map((r: any) => r.drop_id);
            savedSet = new Set(savedDropIds);
        }
    }

    const clickMeta = { where: "shop_drop_click", where_shop: "shop_drop_shop_click", shop_slug: slug };

    return (
        <div className="grid gap-5">
            <RecoImpressionPing
                impressionId={imp}
                action="click"
                meta={{ where: "shop_detail_view", shop_slug: slug }}
                onceKey={imp ? `reco_ping:${imp}:shop_detail_view` : undefined}
            />

            <div className="flex items-center justify-between gap-3">
                <Link href="/drops" className="text-sm font-extrabold text-zinc-700 hover:text-zinc-950">← Back</Link>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {shop.avatar_url ? (
                        <img src={shop.avatar_url} alt="shop" className="h-16 w-16 rounded-2xl border border-zinc-200 object-cover" />
                    ) : (
                        <div className="h-16 w-16 rounded-2xl border border-zinc-200 bg-zinc-50" />
                    )}

                    <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-2xl font-extrabold text-zinc-900 truncate">{name}</div>
                                {shop.headline ? <div className="mt-1 text-sm font-semibold text-zinc-600">{shop.headline}</div> : null}
                            </div>

                            <div className="shrink-0">
                                <SavedToggleButton
                                    kind="shop"
                                    id={slug}
                                    initialSaved={initialShopSaved}
                                    toggleAction={toggleSavedShopAction}
                                    size="sm"
                                />
                            </div>
                        </div>

                        {Array.isArray(shop.style_tags) && shop.style_tags.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {shop.style_tags.slice(0, 10).map((t: string) => (
                                    <span key={t} className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-[11px] font-black text-zinc-700">
                                        #{t}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </div>

                {shop.bio ? <p className="mt-4 text-sm font-semibold text-zinc-700 leading-7">{shop.bio}</p> : null}
            </div>

            <section className="grid gap-3">
                <h2 className="text-lg font-extrabold tracking-tight">Drops</h2>

                {imp ? (
                    <ShopDropsGridClient
                        drops={(drops ?? []) as any[]}
                        shopSlug={slug}
                        impressionId={imp}
                        showSave={!!userId}
                        savedDropIds={savedDropIds}
                        toggleSaveAction={toggleSavedDropAction}
                    />
                ) : (
                    <ul className="grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
                        {(drops ?? []).map((d: any) => (
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
                    </ul>
                )}
            </section>
        </div>
    );
}
