// app/api/ai-search/suggestions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// drops.status は pending/approved/rejected のみ（あなたのenumより）
const PUBLISHED_STATUS = "approved";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const qRaw = searchParams.get("q") ?? "";
        const q = qRaw.trim();

        if (!q) {
            return NextResponse.json({ ok: true, suggestions: [] });
        }

        const supabase = await supabaseServer();

        // ざっくり候補を拾って、メモリ側でブランド/タグを候補化
        const { data, error } = await supabase
            .from("drops")
            .select("brand,tags,title")
            .eq("status", PUBLISHED_STATUS)
            .eq("is_sold", false)
            .or(`title.ilike.%${q}%,brand.ilike.%${q}%`)
            .limit(200);

        if (error) throw error;

        const qLower = q.toLowerCase();

        const brandSet = new Set<string>();
        const tagSet = new Set<string>();

        for (const row of data ?? []) {
            const b = (row as any)?.brand;
            if (typeof b === "string" && b.trim()) {
                if (b.toLowerCase().includes(qLower)) brandSet.add(b.trim());
            }

            const tags = (row as any)?.tags;
            if (Array.isArray(tags)) {
                for (const t of tags) {
                    if (typeof t === "string" && t.trim()) {
                        if (t.toLowerCase().includes(qLower)) tagSet.add(t.trim());
                    }
                }
            }
        }

        // 返すのはシンプルに string[]（フロントが扱いやすい）
        const suggestions = [
            ...[...brandSet].slice(0, 8),
            ...[...tagSet].slice(0, 12),
        ].slice(0, 20);

        return NextResponse.json({ ok: true, suggestions });
    } catch (err: any) {
        console.error("GET /api/ai-search/suggestions error:", err);
        // 失敗してもJSONを返す（HTMLにならないように）
        return NextResponse.json({ ok: false, suggestions: [], error: err?.message ?? "error" }, { status: 200 });
    }
}
