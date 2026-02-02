// app/api/price-alerts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/price-alerts - 価格アラートを設定
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
        const { product_id, target_price } = body;

        if (!product_id || typeof product_id !== "string") {
            return NextResponse.json(
                { ok: false, error: "Invalid product_id" },
                { status: 400 }
            );
        }

        if (typeof target_price !== "number" || target_price <= 0) {
            return NextResponse.json(
                { ok: false, error: "Invalid target_price" },
                { status: 400 }
            );
        }

        // Get current product price
        const { data: product, error: productErr } = await supabase
            .from("drops")
            .select("id,price,display_price")
            .eq("id", product_id)
            .single();

        if (productErr || !product) {
            return NextResponse.json(
                { ok: false, error: "Product not found" },
                { status: 404 }
            );
        }

        const currentPrice = product.display_price ?? product.price ?? 0;

        if (target_price >= currentPrice) {
            return NextResponse.json(
                { ok: false, error: "Target price must be lower than current price" },
                { status: 400 }
            );
        }

        // Upsert alert
        const { data: alert, error: upsertErr } = await supabase
            .from("price_alerts")
            .upsert(
                {
                    user_id: auth.user.id,
                    product_id,
                    target_price,
                    current_price: currentPrice,
                    is_active: true,
                },
                { onConflict: "user_id,product_id" }
            )
            .select()
            .single();

        if (upsertErr) {
            throw upsertErr;
        }

        return NextResponse.json({ ok: true, alert });
    } catch (err: any) {
        console.error("POST /api/price-alerts error:", err);
        return NextResponse.json(
            { ok: false, error: err.message || "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/price-alerts - 価格アラートを削除
 */
export async function DELETE(req: NextRequest) {
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
        const { product_id } = body;

        if (!product_id || typeof product_id !== "string") {
            return NextResponse.json(
                { ok: false, error: "Invalid product_id" },
                { status: 400 }
            );
        }

        // Delete alert
        const { error: deleteErr } = await supabase
            .from("price_alerts")
            .delete()
            .eq("user_id", auth.user.id)
            .eq("product_id", product_id);

        if (deleteErr) {
            throw deleteErr;
        }

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error("DELETE /api/price-alerts error:", err);
        return NextResponse.json(
            { ok: false, error: err.message || "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * GET /api/price-alerts - ユーザーの価格アラート一覧
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json(
                { ok: false, error: "Not authenticated" },
                { status: 401 }
            );
        }

        const { data: alerts, error } = await supabase
            .from("price_alerts")
            .select(`
                *,
                product:product_id (
                    id,
                    title,
                    cover_image_url,
                    price,
                    display_price
                )
            `)
            .eq("user_id", auth.user.id)
            .eq("is_active", true)
            .order("created_at", { ascending: false });

        if (error) {
            throw error;
        }

        return NextResponse.json({ ok: true, alerts: alerts || [] });
    } catch (err: any) {
        console.error("GET /api/price-alerts error:", err);
        return NextResponse.json(
            { ok: false, error: err.message || "Internal server error" },
            { status: 500 }
        );
    }
}
