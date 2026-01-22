// app/api/_debug/orders/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const { data, error } = await supabaseAdmin
        .from("orders")
        .select("id,buyer_user_id")
        .limit(1);

    return NextResponse.json({
        ok: !error,
        error: error?.message ?? null,
        url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null, // どのSupabaseを叩いてるか確認用
        data,
    });
}
