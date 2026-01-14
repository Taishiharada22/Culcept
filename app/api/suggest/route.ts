import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function norm(s: string) {
    return s.trim().toLowerCase();
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const kind = String(searchParams.get("kind") ?? "");
    const q = norm(String(searchParams.get("q") ?? ""));
    if (kind !== "brand" && kind !== "tag") return NextResponse.json({ items: [] });

    // 最新N件からざっくり拾う（DB加工なしで確実に動く）
    const { data, error } = await supabaseAdmin
        .from("drops")
        .select("brand,tags")
        .order("created_at", { ascending: false })
        .limit(600);

    if (error) return NextResponse.json({ items: [] });

    const set = new Set<string>();

    for (const r of data ?? []) {
        if (kind === "brand") {
            const b = norm(String((r as any).brand ?? ""));
            if (b) set.add(b);
        } else {
            const tags = (r as any).tags;
            if (Array.isArray(tags)) {
                for (const t0 of tags) {
                    const t = norm(String(t0 ?? ""));
                    if (t) set.add(t);
                }
            }
        }
    }

    let items = Array.from(set);
    if (q) items = items.filter((x) => x.includes(q));
    items = items.slice(0, 10);

    return NextResponse.json({ items });
}
