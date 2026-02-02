import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * cron: レコメンドの事前計算
 * ※ このファイルで「余計なexport」をしない（helperは別ファイルに切り出す）
 */
export async function GET(_req: Request): Promise<Response> {
    try {
        const supabase = await supabaseServer();

        // TODO: あなたの実装ロジックをここに入れる
        // 例: データ集計、キャッシュ更新など

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error("GET /api/cron/precompute-recommendations error:", err);
        return NextResponse.json(
            { ok: false, error: err?.message || "Internal server error" },
            { status: 500 }
        );
    }
}
