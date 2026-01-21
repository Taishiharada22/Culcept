import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/isAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function viewName(days: number) {
    if (days === 7) return "v_outbound_insights_7d";
    if (days === 90) return "v_outbound_insights_90d";
    return "v_outbound_insights_30d";
}

function csvEscape(v: unknown) {
    const s = String(v ?? "");
    if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

export async function GET(req: NextRequest) {
    // cookieから user 取得
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isAdminEmail(user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const daysRaw = String(searchParams.get("days") ?? "30");
    const days = daysRaw === "7" ? 7 : daysRaw === "90" ? 90 : 30;

    const v = viewName(days);

    const { data, error } = await supabaseAdmin
        .from(v)
        .select(
            "drop_id,created_at,title,brand,size,condition,price,purchase_url,link_url,clicks_total,clicks_buy,clicks_link,buy_click_rate,link_click_rate,last_click_at,has_buy_link,has_link,flag_low_buy_rate,flag_missing_buy_link,flag_high_interest"
        )
        .order("clicks_total", { ascending: false })
        .limit(5000);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []) as any[];

    const header = [
        "drop_id",
        "created_at",
        "title",
        "brand",
        "size",
        "condition",
        "price",
        "purchase_url",
        "link_url",
        "clicks_total",
        "clicks_buy",
        "clicks_link",
        "buy_click_rate",
        "link_click_rate",
        "last_click_at",
        "has_buy_link",
        "has_link",
        "flag_low_buy_rate",
        "flag_missing_buy_link",
        "flag_high_interest",
    ];

    const lines: string[] = [];
    lines.push(header.join(","));

    for (const r of rows) {
        lines.push(
            header
                .map((k) => csvEscape(r[k]))
                .join(",")
        );
    }

    const csv = lines.join("\n");
    return new NextResponse(csv, {
        status: 200,
        headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="outbound_insights_${days}d.csv"`,
        },
    });
}
