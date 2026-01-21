import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/isAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvEscape(v: unknown) {
    const s = String(v ?? "");
    if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

export async function GET(req: NextRequest) {
    // auth（cookieから）
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isAdminEmail(user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const daysRaw = String(searchParams.get("days") ?? "30");
    const days = daysRaw === "7" ? 7 : daysRaw === "90" ? 90 : 30;

    // 直近N日のログを取得（最大 50k）
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
        .from("outbound_clicks")
        .select("created_at,kind,url,drop_id,drops(title)")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(50000);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as any[];

    const header = ["created_at", "kind", "drop_id", "drop_title", "url"];
    const lines: string[] = [];
    lines.push(header.join(","));

    for (const r of rows) {
        lines.push(
            [
                csvEscape(r.created_at),
                csvEscape(r.kind),
                csvEscape(r.drop_id),
                csvEscape(r.drops?.title ?? ""),
                csvEscape(r.url),
            ].join(",")
        );
    }

    const csv = lines.join("\n");
    return new NextResponse(csv, {
        status: 200,
        headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="outbound_clicks_${days}d.csv"`,
        },
    });
}
