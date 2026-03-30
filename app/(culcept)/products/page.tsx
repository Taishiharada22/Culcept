// app/products/page.tsx
import { randomUUID } from "crypto";
import { supabaseServer } from "@/lib/supabase/server";
import ProductsPageClient from "./ProductsPageClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SP = Record<string, string | string[] | undefined>;

function spStr(v: unknown) {
    return String(Array.isArray(v) ? v[0] : v ?? "").trim();
}

export default async function ProductsPage({ searchParams }: { searchParams?: Promise<SP> }) {
    const sp = (await searchParams) ?? {};

    // Filters
    const q = spStr(sp.q);
    const shop = spStr(sp.shop);
    const brand = spStr(sp.brand);
    const size = spStr(sp.size);
    const condition = spStr(sp.condition);
    const tags = spStr(sp.tags);
    const minPrice = spStr(sp.minPrice);
    const maxPrice = spStr(sp.maxPrice);
    const saleMode = spStr(sp.saleMode);
    const hasImage = spStr(sp.hasImage) === "1";
    const hasBuy = spStr(sp.hasBuy) === "1";
    const sort = spStr(sp.sort) || "new";
    const mine = spStr(sp.mine) === "1";

    const impFromUrl = spStr(sp.imp || sp.impressionId || sp.impression_id) || null;
    const imp = impFromUrl || randomUUID();

    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id ?? null;

    // Build query - まだ drops テーブルを使用（後方互換性）
    let query = supabase
        .from("v_drops_ranked_30d_v2")
        .select(
            "id,title,brand,size,condition,price,cover_image_url,display_price,highest_bid_30d,sale_mode,is_auction_live,hot_score,shop_slug,shop_name_ja,shop_name_en,shop_avatar_url,shop_headline,tags,description,url,purchase_url,sold_at,is_sold"
        );

    // Apply filters
    if (shop) query = query.eq("shop_slug", shop);
    if (q) query = query.or(`title.ilike.%${q}%,brand.ilike.%${q}%,description.ilike.%${q}%`);
    if (brand) query = query.ilike("brand", `%${brand}%`);
    if (size) query = query.eq("size", size);
    if (condition) query = query.eq("condition", condition);
    if (tags) {
        const tagList = tags.split(",").map(t => t.trim()).filter(Boolean);
        if (tagList.length > 0) {
            query = query.contains("tags", tagList);
        }
    }
    if (minPrice) {
        const min = Number(minPrice);
        if (Number.isFinite(min)) query = query.gte("display_price", min);
    }
    if (maxPrice) {
        const max = Number(maxPrice);
        if (Number.isFinite(max)) query = query.lte("display_price", max);
    }
    if (saleMode) query = query.eq("sale_mode", saleMode);
    if (hasImage) query = query.not("cover_image_url", "is", null);
    if (hasBuy) query = query.not("purchase_url", "is", null);
    if (mine && userId) query = query.eq("user_id", userId);

    // Sorting
    switch (sort) {
        case "popular":
            query = query.order("hot_score", { ascending: false });
            break;
        case "old":
            query = query.order("created_at", { ascending: true });
            break;
        case "price_asc":
            query = query.order("display_price", { ascending: true, nullsFirst: false });
            break;
        case "price_desc":
            query = query.order("display_price", { ascending: false, nullsFirst: false });
            break;
        default: // "new"
            query = query.order("created_at", { ascending: false });
    }

    query = query.limit(90);

    const { data, error } = await query;

    // Get saved state
    const productIds = (data ?? []).map((d: any) => d?.id).filter(Boolean) as string[];
    let savedSet = new Set<string>();

    if (userId && productIds.length) {
        const { data: sd } = await supabase
            .from("saved_drops")
            .select("drop_id")
            .eq("user_id", userId)
            .in("drop_id", productIds);

        if (sd) savedSet = new Set(sd.map((r: any) => r.drop_id));
    }

    const filters = {
        q, shop, brand, size, condition, tags, minPrice, maxPrice, saleMode,
        hasImage: hasImage ? "1" : "",
        hasBuy: hasBuy ? "1" : "",
        sort, mine: mine ? "1" : "",
    };

    return (
        <ProductsPageClient
            products={data ?? []}
            error={error?.message ?? null}
            savedSet={savedSet}
            userId={userId}
            imp={imp}
            filters={filters}
        />
    );
}
