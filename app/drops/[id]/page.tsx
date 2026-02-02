// app/drops/[id]/page.tsx
import Link from "next/link";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase/server";
import { deleteDropAction } from "./actions";
import ImageModalGallery from "@/app/drops/ImageModalGallery";
import DropCard from "@/app/drops/DropCard";
import RecoOutboundWrap from "@/app/drops/RecoOutboundWrap";
import BidBox from "./BidBox";
import RecoImpressionPing from "@/app/drops/RecoImpressionPing";
import { toggleSavedDropAction } from "@/app/_actions/saved";
import SavedToggleButton from "@/app/_components/saved/SavedToggleButton";
import {
    createDropCheckoutAction,
    createAuctionBuyNowCheckoutAction,
    createAuctionAcceptedBidCheckoutAction,
} from "./checkoutAction";

// ✅ Added
import PriceAlertButton from "@/components/price-alerts/PriceAlertButton";
import ProductReviewsSection from "@/components/reviews/ProductReviewsSection";

export const dynamic = "force-dynamic";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

type DropRow = {
    id: string;
    created_at: string;
    title: string;
    brand: string | null;
    size: string | null;
    condition: string | null;
    price: number | null;
    url: string | null;
    purchase_url: string | null;
    description: string | null;
    user_id: string | null;
    tags: string[] | null;
    cover_image_url: string | null;

    sale_mode: "fixed" | "auction" | null;
    buy_now_price: number | null;
    auction_floor_price: number | null;
    auction_end_at: string | null;
    auction_allow_buy_now: boolean | null;
    auction_status: string | null;
    accepted_bid_id: string | null;

    sold_at: string | null;
    is_sold: boolean | null;

    // もし drops 側にあるなら（なくてもOK）
    display_price?: number | null;
};

type RankRow = {
    sale_mode: "fixed" | "auction" | null;
    auction_floor_price: number | string | null;
    auction_end_at: string | null;
    auction_allow_buy_now: boolean | null;
    auction_status: string | null;
    accepted_bid_id: string | null;

    highest_bid_30d: number | string | null;
    display_price: number | string | null;
    is_auction_live: boolean | null;

    shop_slug?: string | null;
    shop_name_ja?: string | null;
    shop_name_en?: string | null;
    shop_avatar_url?: string | null;
    shop_headline?: string | null;
};

type DropImage = { id: string; sort: number; public_url: string };

type ClickStats30d = {
    clicks_total_30d: number;
    clicks_buy_30d: number;
    clicks_link_30d: number;
    last_click_at_30d: string | null;
};

type SP = Record<string, string | string[] | undefined>;

function spStr(v: unknown) {
    return String(Array.isArray(v) ? v[0] : v ?? "").trim();
}

function fmt(n: unknown) {
    const num = typeof n === "number" ? n : Number(String(n ?? ""));
    if (!Number.isFinite(num)) return "0";
    return Math.round(num).toLocaleString("ja-JP");
}

function numOrNull(v: unknown) {
    if (v == null) return null;
    const n = typeof v === "number" ? v : Number(String(v));
    return Number.isFinite(n) ? n : null;
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

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<Metadata> {
    const p = await params;
    const id = String(p?.id ?? "");
    if (!id || id === "undefined") return { title: "Product not found", robots: { index: false, follow: false } };

    const supabase = await supabaseServer();
    const { data: drop } = await supabase
        .from("drops")
        .select(
            "id,title,description,cover_image_url,tags,sale_mode,buy_now_price,auction_floor_price,auction_end_at,auction_allow_buy_now,auction_status"
        )
        .eq("id", id)
        .maybeSingle();

    if (!drop) return { title: "Product not found", robots: { index: false, follow: false } };

    const title = String(drop.title ?? "Product");
    const desc = String(drop.description ?? "").slice(0, 160) || "View this product on Culcept.";
    const img = drop.cover_image_url ? [drop.cover_image_url] : [];

    return {
        title,
        description: desc,
        alternates: { canonical: `/drops/${id}` },
        openGraph: { type: "article", title, description: desc, url: `/drops/${id}`, images: img },
        twitter: { card: "summary_large_image", title, description: desc, images: img },
    };
}

export default async function DropDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    const p = await params;
    const sp = (await searchParams) ?? ({} as SP);

    const id = String(p?.id ?? "");
    const imp = spStr(sp.imp || sp.impressionId || sp.impression_id) || null;

    if (!id || id === "undefined") {
        return (
            <div className="grid gap-3">
                <Link href={addQuery("/drops", { imp })} className="text-sm font-extrabold text-zinc-700 hover:text-zinc-950">
                    ← Back
                </Link>
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">Invalid id</p>
            </div>
        );
    }

    const supabase = await supabaseServer();

    // ✅ auth
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user ?? null;

    // ✅ まずdrop取得（seller_id / title などメッセージリンク生成に必要）
    const [
        { data: drop, error: dropErr },
        { data: images, error: imgErr },
        { data: stat },
        { data: rank, error: rankErr },
    ] = await Promise.all([
        supabase
            .from("drops")
            .select(
                "id,created_at,title,brand,size,condition,price,url,purchase_url,description,user_id,tags,cover_image_url,sale_mode,buy_now_price,auction_floor_price,auction_end_at,auction_allow_buy_now,auction_status,accepted_bid_id,sold_at,is_sold,display_price"
            )
            .eq("id", id)
            .single(),
        supabase.from("drop_images").select("id,sort,public_url").eq("drop_id", id).order("sort", { ascending: true }),
        supabase
            .from("v_drops_public_with_clicks_30d")
            .select("clicks_total_30d,clicks_buy_30d,clicks_link_30d,last_click_at_30d")
            .eq("id", id)
            .maybeSingle(),
        supabase
            .from("v_drops_ranked_30d_v2")
            .select(
                "sale_mode,auction_floor_price,auction_end_at,auction_allow_buy_now,auction_status,accepted_bid_id,highest_bid_30d,display_price,is_auction_live,shop_slug,shop_name_ja,shop_name_en,shop_avatar_url,shop_headline"
            )
            .eq("id", id)
            .maybeSingle(),
    ]);

    if (dropErr || !drop) {
        return (
            <div className="grid gap-3">
                <Link href={addQuery("/drops", { imp })} className="text-sm font-extrabold text-zinc-700 hover:text-zinc-950">
                    ← Back
                </Link>
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                    {dropErr?.message ?? "Not found"}
                </p>
            </div>
        );
    }

    if (imgErr) {
        return (
            <div className="grid gap-3">
                <Link href={addQuery("/drops", { imp })} className="text-sm font-extrabold text-zinc-700 hover:text-zinc-950">
                    ← Back
                </Link>
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{imgErr.message}</p>
            </div>
        );
    }

    if (rankErr) console.warn("rank view error:", rankErr.message);

    const d = drop as unknown as DropRow;
    const r = (rank ?? null) as unknown as RankRow | null;

    // ✅ View tracking（RPCが無くても落ちないように）
    try {
        await supabase.rpc("track_product_view", { p_product_id: d.id });
    } catch (e: any) {
        console.warn("track_product_view rpc failed (ignored):", e?.message ?? e);
    }

    // ✅ shop
    const { data: shop } = await supabase
        .from("shops")
        .select("slug,name_ja,name_en,headline,bio,avatar_url,style_tags,is_active,owner_id")
        .eq("owner_id", d.user_id)
        .eq("is_active", true)
        .maybeSingle();

    const imgs = (images ?? []) as DropImage[];
    const tags = Array.isArray(d.tags) ? d.tags : [];
    const isOwner = !!user && !!d.user_id && user.id === d.user_id;
    const isSold = Boolean(d.sold_at || d.is_sold);

    // Saved state（非owner & ログイン時のみ）
    let isSaved = false;
    if (!isOwner && user) {
        const { data: savedRow, error: savedErr } = await supabase
            .from("saved_drops")
            .select("id")
            .eq("user_id", user.id)
            .eq("drop_id", d.id)
            .maybeSingle();
        if (savedErr) console.warn("saved_drops check error:", savedErr.message);
        isSaved = !!savedRow;
    }

    const s =
        (stat ??
            ({
                clicks_total_30d: 0,
                clicks_buy_30d: 0,
                clicks_link_30d: 0,
                last_click_at_30d: null,
            } as ClickStats30d)) as ClickStats30d;

    const sale_mode = (r?.sale_mode ?? d.sale_mode ?? "fixed") as "fixed" | "auction";
    const auction_allow_buy_now = Boolean(r?.auction_allow_buy_now ?? d.auction_allow_buy_now ?? true);
    const is_auction_live = Boolean(r?.is_auction_live ?? false);

    // ✅ “現在価格”の統一：rank.display_price → drops.display_price → drops.price
    const displayPrice = Number(r?.display_price ?? d.display_price ?? d.price ?? 0);
    const highestBidNow = Number(r?.highest_bid_30d ?? 0);
    const buyNowPrice = Number(d.buy_now_price ?? 0);

    // ✅ Price Alert state（非owner & ログイン時のみ）
    let hasAlert = false;
    let alertPrice: number | undefined = undefined;
    if (!isOwner && user && displayPrice > 0) {
        const { data: alertRow, error: aErr } = await supabase
            .from("price_alerts")
            .select("target_price")
            .eq("user_id", user.id)
            .eq("product_id", d.id)
            .eq("is_active", true)
            .maybeSingle();
        if (aErr) console.warn("price_alerts check error:", aErr.message);
        hasAlert = !!alertRow;
        const ap = (alertRow as any)?.target_price;
        alertPrice = ap != null ? Number(ap) : undefined;
    }

    // ✅ 外部Buy（shop系）
    const canShowExternalBuy =
        !isSold &&
        !isOwner &&
        !!d.purchase_url &&
        (sale_mode === "fixed" ||
            (sale_mode === "auction" && auction_allow_buy_now && (buyNowPrice > 0 || d.price != null)));

    // ✅ Stripe Buy（fixed）
    const canShowStripeFixedBuy =
        !isSold && !isOwner && !d.purchase_url && sale_mode === "fixed" && d.price != null && Number(d.price) > 0;

    // ✅ Stripe Buy Now（auction）
    const canShowStripeAuctionBuyNow =
        !isSold && !isOwner && !d.purchase_url && sale_mode === "auction" && auction_allow_buy_now && buyNowPrice > 0;

    // ✅ Stripe 落札者支払い（auction accepted）
    const canShowStripeAuctionAccepted =
        !isSold && !isOwner && !d.purchase_url && sale_mode === "auction" && !!d.accepted_bid_id;

    const shopSlug = (shop?.slug ?? r?.shop_slug ?? null) as string | null;

    // Related card click log 用（DropCardは clickMeta を読む）
    const baseMeta = { from_drop_id: d.id };
    const clickMetaMore = { ...baseMeta, where: "drop_detail_more_click", where_shop: "drop_detail_more_shop_click" };
    const clickMetaSimilar = { ...baseMeta, where: "drop_detail_similar_click", where_shop: "drop_detail_similar_shop_click" };

    const shopCard = shopSlug
        ? {
            slug: shopSlug,
            name: shop?.name_ja || shop?.name_en || r?.shop_name_ja || r?.shop_name_en || shopSlug,
            avatar: shop?.avatar_url ?? r?.shop_avatar_url ?? null,
            headline: shop?.headline ?? r?.shop_headline ?? null,
            style_tags: Array.isArray(shop?.style_tags) ? (shop!.style_tags as string[]) : [],
        }
        : null;

    const shopHref = shopCard ? addQuery(`/shops/${encodeURIComponent(shopCard.slug)}`, { imp }) : null;
    const shopInDropsHref = shopCard ? addQuery(`/drops?shop=${encodeURIComponent(shopCard.slug)}`, { imp }) : null;

    const moreFromShop =
        shopSlug
            ? (
                await supabase
                    .from("v_drops_ranked_30d_v2")
                    .select(
                        "id,created_at,title,brand,size,condition,price,cover_image_url,purchase_url,url,display_price,highest_bid_30d,sale_mode,auction_allow_buy_now,auction_status,is_auction_live,hot_score,shop_slug,shop_name_ja,shop_name_en,shop_avatar_url,shop_headline"
                    )
                    .eq("shop_slug", shopSlug)
                    .neq("id", d.id)
                    .limit(6)
                    .order("hot_score", { ascending: false })
            ).data ?? []
            : [];

    let simQuery = supabase
        .from("v_drops_ranked_30d_v2")
        .select(
            "id,created_at,title,brand,size,condition,price,cover_image_url,purchase_url,url,sale_mode,auction_allow_buy_now,auction_status,is_auction_live,highest_bid_30d,display_price,shop_slug,shop_name_ja,shop_name_en,shop_avatar_url,shop_headline,hot_score"
        )
        .neq("id", d.id)
        .limit(12)
        .order("hot_score", { ascending: false });

    if (shopSlug) simQuery = simQuery.neq("shop_slug", shopSlug);
    if (d.brand) simQuery = simQuery.ilike("brand", `%${d.brand}%`);
    else if (d.size) simQuery = simQuery.eq("size", d.size);

    const { data: similar } = await simQuery;
    const simRows = (similar ?? []) as any[];

    const relatedIds = Array.from(new Set([...moreFromShop, ...simRows].map((x: any) => x?.id).filter(Boolean) as string[]));

    let relatedSavedSet = new Set<string>();
    if (user && relatedIds.length) {
        const { data: rsd, error: rsdErr } = await supabase
            .from("saved_drops")
            .select("drop_id")
            .eq("user_id", user.id)
            .in("drop_id", relatedIds);

        if (!rsdErr) relatedSavedSet = new Set((rsd ?? []).map((rr: any) => rr.drop_id));
    }

    const offerPrice = sale_mode === "auction" ? (buyNowPrice > 0 ? buyNowPrice : displayPrice) : displayPrice;

    const jsonLd: Record<string, any> = {
        "@context": "https://schema.org",
        "@type": "Product",
        name: d.title,
        image: imgs.map((x) => x.public_url).slice(0, 8),
        description: d.description ?? undefined,
        brand: d.brand ? { "@type": "Brand", name: d.brand } : undefined,
        url: `${siteUrl}/drops/${d.id}`,
    };

    if (offerPrice > 0) {
        jsonLd.offers = {
            "@type": "Offer",
            priceCurrency: "JPY",
            price: String(offerPrice),
            url: d.purchase_url ?? `${siteUrl}/drops/${d.id}`,
            availability: isSold ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
        };
    }

    const auctionFloor = numOrNull(r?.auction_floor_price ?? d.auction_floor_price);
    const loginNext = addQuery(`/drops/${d.id}`, { imp });

    // =========================================================
    // ✅ Reviews & Stats fetch
    // =========================================================
    const { data: statsRow, error: statsErr } = await supabase
        .from("v_product_review_stats")
        .select("*")
        .eq("product_id", d.id)
        .maybeSingle();
    if (statsErr) console.warn("review stats fetch error:", statsErr.message);

    let reviewsRaw: any[] = [];
    {
        const { data: rev1, error: revErr1 } = await supabase
            .from("product_reviews")
            .select(
                `
          id,product_id,user_id,rating,title,content,verified_purchase,helpful_count,created_at,updated_at,
          user:user_id ( raw_user_meta_data )
        `
            )
            .eq("product_id", d.id)
            .order("created_at", { ascending: false });

        if (revErr1) {
            console.warn("reviews embed user fetch error (fallback to no-user):", revErr1.message);
            const { data: rev2, error: revErr2 } = await supabase
                .from("product_reviews")
                .select("id,product_id,user_id,rating,title,content,verified_purchase,helpful_count,created_at,updated_at")
                .eq("product_id", d.id)
                .order("created_at", { ascending: false });
            if (revErr2) console.warn("reviews fetch error:", revErr2.message);
            reviewsRaw = (rev2 ?? []) as any[];
        } else {
            reviewsRaw = (rev1 ?? []) as any[];
        }
    }

    const formattedReviews = (reviewsRaw || []).map((r0: any) => ({
        ...r0,
        user_name: r0?.user?.raw_user_meta_data?.name ?? null,
        user_avatar: r0?.user?.raw_user_meta_data?.avatar_url ?? null,
    }));

    const userReview = user ? (formattedReviews.find((x: any) => x.user_id === user.id) as any) || null : null;

    const reviewStats = {
        product_id: d.id,
        total_reviews: Number((statsRow as any)?.total_reviews ?? 0),
        average_rating: Number((statsRow as any)?.average_rating ?? 0),
        rating_distribution: {
            1: Number((statsRow as any)?.rating_1_count ?? 0),
            2: Number((statsRow as any)?.rating_2_count ?? 0),
            3: Number((statsRow as any)?.rating_3_count ?? 0),
            4: Number((statsRow as any)?.rating_4_count ?? 0),
            5: Number((statsRow as any)?.rating_5_count ?? 0),
        },
        last_review_at: (statsRow as any)?.last_review_at ?? null,
    };

    const canReview = !!user && !isOwner;

    // ✅ Message Seller link（非ownerのみ）
    const messageSellerHref = !isOwner && d.user_id
        ? `/messages/new?product_id=${encodeURIComponent(d.id)}&seller_id=${encodeURIComponent(d.user_id)}`
        : null;

    return (
        <div className="grid gap-4">
            {imp ? <RecoImpressionPing impressionId={imp} action="click" meta={{ where: "drop_detail_view", drop_id: d.id }} /> : null}

            <div className="flex items-center justify-between gap-3">
                <Link href={addQuery("/drops", { imp })} className="text-sm font-extrabold text-zinc-700 hover:text-zinc-950">
                    ← Back
                </Link>

                <div className="flex items-center gap-3">
                    {isOwner ? (
                        <>
                            <Link href={`/drops/${d.id}/edit`} className="text-sm font-extrabold text-zinc-700 hover:text-zinc-950">
                                Edit
                            </Link>
                            <form action={deleteDropAction.bind(null, d.id)}>
                                <button
                                    type="submit"
                                    className="rounded-md border border-red-200 px-3 py-2 text-sm font-extrabold text-red-700 hover:bg-red-50"
                                >
                                    Delete
                                </button>
                            </form>
                        </>
                    ) : null}

                    {!isOwner && user ? (
                        <SavedToggleButton kind="drop" id={d.id} initialSaved={isSaved} toggleAction={toggleSavedDropAction} size="sm" />
                    ) : null}

                    {!isOwner && user && displayPrice > 0 ? (
                        <PriceAlertButton productId={d.id} currentPrice={displayPrice} hasAlert={hasAlert} alertPrice={alertPrice} />
                    ) : null}

                    {/* ✅ Message Seller（非ownerのみ） */}
                    {!isOwner && messageSellerHref ? (
                        <Link
                            href={messageSellerHref}
                            className="rounded-xl border-2 border-purple-300 bg-purple-50 px-6 py-3 text-sm font-black text-purple-700 transition-all hover:bg-purple-100 no-underline"
                        >
                            💬 Message Seller
                        </Link>
                    ) : null}
                </div>
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight">{d.title}</h1>

            {isSold ? (
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm font-extrabold text-zinc-800">SOLD OUT</div>
            ) : null}

            {shopCard && shopHref ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <Link href={shopHref} className="block no-underline hover:opacity-95">
                        <div className="flex gap-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {shopCard.avatar ? (
                                <img src={shopCard.avatar} alt="shop" className="h-12 w-12 rounded-xl border border-zinc-200 object-cover" />
                            ) : (
                                <div className="h-12 w-12 rounded-xl border border-zinc-200 bg-zinc-50" />
                            )}

                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="truncate text-sm font-extrabold text-zinc-900">{shopCard.name}</div>
                                    <span className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-[11px] font-black text-zinc-700">Shop</span>
                                </div>

                                {shopCard.headline ? (
                                    <div className="mt-1 line-clamp-2 text-xs font-semibold text-zinc-600">{shopCard.headline}</div>
                                ) : (
                                    <div className="mt-1 text-xs font-semibold text-zinc-400">（headline 未設定）</div>
                                )}

                                {shopCard.style_tags.length > 0 ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {shopCard.style_tags.slice(0, 6).map((t) => (
                                            <span key={t} className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-[11px] font-black text-zinc-700">
                                                #{t}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </Link>

                    {shopInDropsHref ? (
                        <div className="mt-3 flex items-center justify-end">
                            <Link href={shopInDropsHref} className="text-xs font-black text-zinc-700 no-underline hover:text-zinc-950">
                                View this shop in Products →
                            </Link>
                        </div>
                    ) : null}
                </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold text-zinc-700">
                {d.brand && <span>{d.brand}</span>}
                {d.size && <span>{d.size}</span>}
                {d.condition && <span>{d.condition}</span>}

                {displayPrice > 0 ? (
                    <span className="font-extrabold text-zinc-950">
                        {sale_mode === "auction" && is_auction_live ? "Current: " : "¥"}
                        {sale_mode === "auction" && is_auction_live ? `¥${fmt(displayPrice)}` : fmt(displayPrice)}
                    </span>
                ) : null}

                {sale_mode === "auction" && highestBidNow > 0 ? (
                    <span className="text-xs font-semibold text-zinc-600">
                        bid: <span className="font-black text-zinc-900">¥{fmt(highestBidNow)}</span>
                    </span>
                ) : null}

                <span className="text-xs font-semibold text-zinc-500">{new Date(d.created_at).toLocaleString()}</span>

                {/* 外部Buy */}
                {canShowExternalBuy ? (
                    <RecoOutboundWrap
                        impressionId={imp}
                        recoAction="purchase"
                        meta={{ kind: "buy" }}
                        dropId={d.id}
                        kind="buy"
                        url={d.purchase_url!}
                        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-extrabold text-white no-underline hover:bg-zinc-800"
                    >
                        Buy
                    </RecoOutboundWrap>
                ) : null}

                {/* Stripe fixed Buy */}
                {canShowStripeFixedBuy ? (
                    user ? (
                        <form action={createDropCheckoutAction.bind(null, d.id, imp)} className="inline">
                            <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-extrabold text-white hover:bg-zinc-800">
                                Buy
                            </button>
                        </form>
                    ) : (
                        <Link
                            href={`/login?next=${encodeURIComponent(loginNext)}`}
                            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-extrabold text-white no-underline hover:bg-zinc-800"
                        >
                            Login to Buy
                        </Link>
                    )
                ) : null}

                {/* Stripe auction Buy Now */}
                {canShowStripeAuctionBuyNow ? (
                    user ? (
                        <form action={createAuctionBuyNowCheckoutAction.bind(null, d.id, imp)} className="inline">
                            <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-extrabold text-white hover:bg-zinc-800">
                                Buy Now
                            </button>
                        </form>
                    ) : (
                        <Link
                            href={`/login?next=${encodeURIComponent(loginNext)}`}
                            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-extrabold text-white no-underline hover:bg-zinc-800"
                        >
                            Login to Buy Now
                        </Link>
                    )
                ) : null}

                {/* Stripe auction accepted bid payment */}
                {canShowStripeAuctionAccepted ? (
                    user ? (
                        <form action={createAuctionAcceptedBidCheckoutAction.bind(null, d.id, imp)} className="inline">
                            <button
                                type="submit"
                                className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-extrabold text-zinc-900 hover:bg-zinc-50"
                            >
                                Pay accepted bid
                            </button>
                        </form>
                    ) : (
                        <Link
                            href={`/login?next=${encodeURIComponent(loginNext)}`}
                            className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-extrabold text-zinc-900 no-underline hover:bg-zinc-50"
                        >
                            Login to Pay
                        </Link>
                    )
                ) : null}

                {d.url ? (
                    <RecoOutboundWrap
                        impressionId={imp}
                        recoAction="click"
                        meta={{ kind: "link" }}
                        dropId={d.id}
                        kind="link"
                        url={d.url}
                        className="text-sm font-extrabold text-zinc-800 no-underline hover:text-zinc-950"
                    >
                        Link
                    </RecoOutboundWrap>
                ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-600">
                <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">
                    30d clicks: <span className="font-black text-zinc-900">{fmt(s.clicks_total_30d)}</span>
                </span>
                <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">
                    buy: <span className="font-black text-zinc-900">{fmt(s.clicks_buy_30d)}</span>
                </span>
                <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">
                    link: <span className="font-black text-zinc-900">{fmt(s.clicks_link_30d)}</span>
                </span>
                {s.last_click_at_30d ? <span className="text-xs font-semibold text-zinc-500">last: {new Date(s.last_click_at_30d).toLocaleString()}</span> : null}
            </div>

            {/* ✅ BidBox */}
            <BidBox
                dropId={d.id}
                isOwner={isOwner}
                sale_mode={sale_mode}
                auction_status={r?.auction_status ?? d.auction_status ?? null}
                auction_end_at={r?.auction_end_at ?? d.auction_end_at ?? null}
                auction_floor_price={auctionFloor}
                accepted_bid_id={r?.accepted_bid_id ?? d.accepted_bid_id ?? null}
                highest_bid_now={highestBidNow}
            />

            {tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                    {tags.map((t) => (
                        <Link
                            key={t}
                            href={addQuery(`/drops?q=${encodeURIComponent(t)}`, { imp })}
                            className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-extrabold text-zinc-900 no-underline hover:bg-zinc-50"
                        >
                            {t}
                        </Link>
                    ))}
                </div>
            ) : null}

            <ImageModalGallery title={d.title} images={imgs.map((x) => ({ id: x.id, public_url: x.public_url }))} />

            {d.description ? <p className="leading-8 text-zinc-800">{d.description}</p> : null}

            {/* ✅ Reviews Section */}
            <section className="mt-6">
                <ProductReviewsSection
                    productId={d.id}
                    productTitle={d.title}
                    reviews={formattedReviews}
                    stats={reviewStats}
                    userReview={userReview}
                    isAuthenticated={!!user}
                    canReview={canReview}
                />
            </section>

            {shopSlug && moreFromShop.length > 0 ? (
                <section className="mt-6 grid gap-3">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-lg font-extrabold tracking-tight">More from this shop</h2>
                        <Link href={addQuery(`/shops/${encodeURIComponent(shopSlug)}`, { imp })} className="text-sm font-extrabold text-zinc-700 hover:text-zinc-950">
                            View shop →
                        </Link>
                    </div>

                    <ul className="grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
                        {moreFromShop.map((x: any) => (
                            <DropCard
                                key={x.id}
                                d={x}
                                imp={imp}
                                clickMeta={clickMetaMore}
                                showSave={!!user}
                                initialSaved={relatedSavedSet.has(x.id)}
                                toggleSaveAction={toggleSavedDropAction}
                            />
                        ))}
                    </ul>
                </section>
            ) : null}

            {simRows.length > 0 ? (
                <section className="mt-6 grid gap-3">
                    <h2 className="text-lg font-extrabold tracking-tight">Similar</h2>
                    <ul className="grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
                        {simRows.map((x: any) => (
                            <DropCard
                                key={x.id}
                                d={x}
                                imp={imp}
                                clickMeta={clickMetaSimilar}
                                showSave={!!user}
                                initialSaved={relatedSavedSet.has(x.id)}
                                toggleSaveAction={toggleSavedDropAction}
                            />
                        ))}
                    </ul>
                </section>
            ) : null}

            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        </div>
    );
}
