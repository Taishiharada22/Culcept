// app/api/auto-pricing/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import type { PricingSuggestion } from "@/types/auto-pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auto-pricing?product_id=xxx - AI価格提案を取得
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const productId = searchParams.get("product_id");

        if (!productId) {
            return NextResponse.json({ ok: false, error: "Missing product_id" }, { status: 400 });
        }

        // Get product
        const { data: product, error: productErr } = await supabase
            .from("drops")
            .select("*")
            .eq("id", productId)
            .single();

        if (productErr || !product) {
            return NextResponse.json({ ok: false, error: "Product not found" }, { status: 404 });
        }

        // Verify ownership（※あなたのdropsには user_id がある）
        if (product.user_id !== auth.user.id) {
            return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 });
        }

        // Generate pricing suggestion
        const suggestion = await generatePricingSuggestion(supabase, product);

        return NextResponse.json({ ok: true, suggestion });
    } catch (err: any) {
        console.error("GET /api/auto-pricing error:", err);
        return NextResponse.json({ ok: false, error: err?.message || "Internal server error" }, { status: 500 });
    }
}

async function generatePricingSuggestion(supabase: any, product: any): Promise<PricingSuggestion> {
    // あなたのdrop_statusは pending/approved/rejected のみ
    // 「公開中」扱いは approved で見る
    // 「売れた」判定は is_sold / sold_at を正にする
    const PUBLISHED_STATUS = "approved";

    // Find similar products（まずは“公開中の出品価格”の相場で出す）
    let similarQuery = supabase
        .from("drops")
        .select("price")
        .eq("status", PUBLISHED_STATUS)
        .eq("is_sold", false)
        .not("price", "is", null)
        .neq("id", product.id);

    // Match by brand
    if (product.brand) {
        similarQuery = similarQuery.eq("brand", product.brand);
    }

    // Match by condition
    if (product.condition) {
        similarQuery = similarQuery.eq("condition", product.condition);
    }

    const { data: similarProducts } = await similarQuery.limit(200);

    const prices: number[] = (similarProducts || [])
        .map((p: any) => Number(p.price))
        .filter((p: number) => Number.isFinite(p) && p > 0);

    // Calculate statistics
    const marketAverage =
        prices.length > 0
            ? Math.round(prices.reduce((a: number, b: number) => a + b, 0) / prices.length)
            : (product.price ? Number(product.price) : 5000);

    const sortedPrices = [...prices].sort((a, b) => a - b);
    const median =
        sortedPrices.length > 0
            ? sortedPrices[Math.floor(sortedPrices.length / 2)]
            : marketAverage;

    // Condition adjustment
    const conditionAdjustment = getConditionAdjustment(product.condition);

    // Brand premium
    const brandPremium = getBrandPremium(product.brand);

    // Base = median（外れ値に強い）を優先しつつ、データ少ないなら平均に寄せる
    const basePrice =
        prices.length >= 8 ? median :
            prices.length >= 3 ? Math.round((median + marketAverage) / 2) :
                marketAverage;

    // Calculate suggested price
    let suggestedPrice = Math.round(
        basePrice * (1 + conditionAdjustment / 100) * (1 + brandPremium / 100)
    );

    // Ensure reasonable bounds
    suggestedPrice = Math.max(1000, Math.min(suggestedPrice, 1000000));

    // Calculate price range
    const minPrice = Math.round(suggestedPrice * 0.8);
    const maxPrice = Math.round(suggestedPrice * 1.2);
    const optimalPrice = suggestedPrice;

    // Determine confidence
    let confidence: "high" | "medium" | "low" = "medium";
    if (prices.length >= 30) confidence = "high";
    else if (prices.length < 5) confidence = "low";

    // Market insights（売れた件数を見る：statusにsoldが無いので is_sold / sold_at）
    const recentSales = await getRecentSalesCount(supabase, product);
    const competitionLevel = prices.length > 80 ? "high" : prices.length > 25 ? "medium" : "low";
    const trendingUp = await isTrendingUp(supabase, product);

    return {
        product_id: product.id,
        current_price: product.price,
        suggested_price: suggestedPrice,
        confidence,
        reasoning: {
            market_average: marketAverage,
            similar_products_count: prices.length,
            condition_adjustment: conditionAdjustment,
            brand_premium: brandPremium,
            demand_factor: 0,
        },
        price_range: {
            min: minPrice,
            max: maxPrice,
            optimal: optimalPrice,
        },
        market_insights: {
            trending_up: trendingUp,
            competition_level: competitionLevel,
            recent_sales: recentSales,
        },
    };
}

function getConditionAdjustment(condition: string | null): number {
    switch (condition?.toLowerCase()) {
        case "almost_new":
            return 15;
        case "good":
            return 5;
        case "well":
            return -5;
        case "damaged":
            return -15;
        default:
            return 0;
    }
}

function getBrandPremium(brand: string | null): number {
    if (!brand) return 0;

    const premiumBrands = [
        "supreme",
        "gucci",
        "louis vuitton",
        "chanel",
        "dior",
        "balenciaga",
        "prada",
        "yeezy",
        "jordan",
        "off-white",
        "bape",
    ];

    const b = brand.toLowerCase();
    if (premiumBrands.some((pb) => b.includes(pb))) return 20;

    const standardBrands = ["nike", "adidas", "levi's", "carhartt", "vintage"];
    if (standardBrands.some((sb) => b.includes(sb))) return 5;

    return 0;
}

async function getRecentSalesCount(supabase: any, product: any): Promise<number> {
    // Count recent sales (past 30 days) for similar products
    const { count } = await supabase
        .from("drops")
        .select("id", { count: "exact", head: true })
        .eq("is_sold", true)
        .not("sold_at", "is", null)
        .gte("sold_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .eq("brand", product.brand || "");

    return count || 0;
}

async function isTrendingUp(supabase: any, product: any): Promise<boolean> {
    const PUBLISHED_STATUS = "approved";
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    const { count: recentCount } = await supabase
        .from("drops")
        .select("id", { count: "exact", head: true })
        .eq("status", PUBLISHED_STATUS)
        .eq("is_sold", false)
        .gte("created_at", thirtyDaysAgo)
        .eq("brand", product.brand || "");

    const { count: olderCount } = await supabase
        .from("drops")
        .select("id", { count: "exact", head: true })
        .eq("status", PUBLISHED_STATUS)
        .eq("is_sold", false)
        .gte("created_at", sixtyDaysAgo)
        .lt("created_at", thirtyDaysAgo)
        .eq("brand", product.brand || "");

    return (recentCount || 0) > (olderCount || 0);
}
