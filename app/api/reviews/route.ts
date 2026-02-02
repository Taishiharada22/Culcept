// app/api/reviews/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/reviews - レビューを投稿
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json(
                { ok: false, error: "Not authenticated" },
                { status: 401 }
            );
        }

        const body = await req.json();
        const { product_id, rating, title, content } = body;

        // Validate
        if (!product_id || typeof product_id !== "string") {
            return NextResponse.json(
                { ok: false, error: "Invalid product_id" },
                { status: 400 }
            );
        }

        if (typeof rating !== "number" || rating < 1 || rating > 5) {
            return NextResponse.json(
                { ok: false, error: "Rating must be between 1 and 5" },
                { status: 400 }
            );
        }

        // Check if product exists
        const { data: product, error: productErr } = await supabase
            .from("drops")
            .select("id,user_id")
            .eq("id", product_id)
            .single();

        if (productErr || !product) {
            return NextResponse.json(
                { ok: false, error: "Product not found" },
                { status: 404 }
            );
        }

        // Don't allow owner to review own product
        if (product.user_id === auth.user.id) {
            return NextResponse.json(
                { ok: false, error: "Cannot review your own product" },
                { status: 403 }
            );
        }

        // Check if user already reviewed
        const { data: existing } = await supabase
            .from("product_reviews")
            .select("id")
            .eq("product_id", product_id)
            .eq("user_id", auth.user.id)
            .maybeSingle();

        if (existing) {
            return NextResponse.json(
                { ok: false, error: "You have already reviewed this product" },
                { status: 409 }
            );
        }

        // Insert review
        const { data: review, error: insertErr } = await supabase
            .from("product_reviews")
            .insert({
                product_id,
                user_id: auth.user.id,
                rating,
                title: title?.trim() || null,
                content: content?.trim() || null,
                verified_purchase: false, // TODO: Check actual purchase
            })
            .select()
            .single();

        if (insertErr) {
            throw insertErr;
        }

        return NextResponse.json({ ok: true, review });
    } catch (err: any) {
        console.error("POST /api/reviews error:", err);
        return NextResponse.json(
            { ok: false, error: err.message || "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * GET /api/reviews?product_id=xxx - 商品のレビュー一覧を取得
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const productId = searchParams.get("product_id");

        if (!productId) {
            return NextResponse.json(
                { ok: false, error: "Missing product_id" },
                { status: 400 }
            );
        }

        const supabase = await supabaseServer();

        // Get reviews with user info
        const { data: reviews, error } = await supabase
            .from("product_reviews")
            .select(`
                *,
                user:user_id (
                    id,
                    raw_user_meta_data
                )
            `)
            .eq("product_id", productId)
            .order("created_at", { ascending: false });

        if (error) {
            throw error;
        }

        // Format reviews
        const formatted = (reviews || []).map((r: any) => ({
            ...r,
            user_name: r.user?.raw_user_meta_data?.name || null,
            user_avatar: r.user?.raw_user_meta_data?.avatar_url || null,
        }));

        // Calculate stats
        const stats = {
            product_id: productId,
            total_reviews: formatted.length,
            average_rating: formatted.length > 0
                ? formatted.reduce((sum: number, r: any) => sum + r.rating, 0) / formatted.length
                : 0,
            rating_distribution: {
                1: formatted.filter((r: any) => r.rating === 1).length,
                2: formatted.filter((r: any) => r.rating === 2).length,
                3: formatted.filter((r: any) => r.rating === 3).length,
                4: formatted.filter((r: any) => r.rating === 4).length,
                5: formatted.filter((r: any) => r.rating === 5).length,
            },
        };

        return NextResponse.json({ ok: true, reviews: formatted, stats });
    } catch (err: any) {
        console.error("GET /api/reviews error:", err);
        return NextResponse.json(
            { ok: false, error: err.message || "Internal server error" },
            { status: 500 }
        );
    }
}
