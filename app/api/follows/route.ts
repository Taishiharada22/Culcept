// app/api/follows/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/follows - ストアをフォロー
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
        const { shop_slug } = body;

        if (!shop_slug || typeof shop_slug !== "string") {
            return NextResponse.json(
                { ok: false, error: "Invalid shop_slug" },
                { status: 400 }
            );
        }

        // Check if shop exists
        const { data: shop, error: shopErr } = await supabase
            .from("shops")
            .select("slug")
            .eq("slug", shop_slug)
            .single();

        if (shopErr || !shop) {
            return NextResponse.json(
                { ok: false, error: "Shop not found" },
                { status: 404 }
            );
        }

        // Check if already following
        const { data: existing } = await supabase
            .from("shop_follows")
            .select("id")
            .eq("user_id", auth.user.id)
            .eq("shop_slug", shop_slug)
            .maybeSingle();

        if (existing) {
            return NextResponse.json(
                { ok: false, error: "Already following" },
                { status: 409 }
            );
        }

        // Insert follow
        const { error: insertErr } = await supabase
            .from("shop_follows")
            .insert({
                user_id: auth.user.id,
                shop_slug,
            });

        if (insertErr) {
            throw insertErr;
        }

        return NextResponse.json({ ok: true, isFollowing: true });
    } catch (err: any) {
        console.error("POST /api/follows error:", err);
        return NextResponse.json(
            { ok: false, error: err.message || "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/follows - ストアのフォローを解除
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
        const { shop_slug } = body;

        if (!shop_slug || typeof shop_slug !== "string") {
            return NextResponse.json(
                { ok: false, error: "Invalid shop_slug" },
                { status: 400 }
            );
        }

        // Delete follow
        const { error: deleteErr } = await supabase
            .from("shop_follows")
            .delete()
            .eq("user_id", auth.user.id)
            .eq("shop_slug", shop_slug);

        if (deleteErr) {
            throw deleteErr;
        }

        return NextResponse.json({ ok: true, isFollowing: false });
    } catch (err: any) {
        console.error("DELETE /api/follows error:", err);
        return NextResponse.json(
            { ok: false, error: err.message || "Internal server error" },
            { status: 500 }
        );
    }
}
