// app/api/cron/expire-orders/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthed(req: Request) {
    const url = new URL(req.url);

    // どっちでも通るようにしておく（Dashboardやcurlが楽）
    const q = url.searchParams.get("secret");
    const h = req.headers.get("x-cron-secret");

    const secret = process.env.CRON_SECRET || "";
    if (!secret) return false;

    return q === secret || h === secret;
}

export async function GET(req: Request) {
    try {
        if (!isAuthed(req)) {
            return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }

        // 30分以上前の pending を expired にする例
        const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();

        const { data, error } = await supabaseAdmin
            .from("orders")
            .update({ status: "expired" })
            .eq("status", "pending")
            .lt("created_at", cutoff)
            .select("id,status,created_at");

        if (error) throw error;

        return NextResponse.json({ ok: true, expired: data?.length ?? 0 });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
    }
}
