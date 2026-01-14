import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ALLOW = new Set(["spam", "scam", "counterfeit", "abusive", "other"]);

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const targetType = String(body?.targetType ?? "");
        const targetId = String(body?.targetId ?? "");
        const reason = String(body?.reason ?? "other");
        const details = String(body?.details ?? "").slice(0, 2000);

        if (targetType !== "drop") return NextResponse.json({ ok: false }, { status: 400 });
        if (!targetId) return NextResponse.json({ ok: false }, { status: 400 });

        const r = ALLOW.has(reason) ? reason : "other";

        // ユーザー取れれば入れる（匿名通報も許可）
        let reporterId: string | null = null;
        try {
            const supabase = await supabaseServer();
            const { data } = await supabase.auth.getUser();
            reporterId = data.user?.id ?? null;
        } catch {
            reporterId = null;
        }

        const { error } = await supabaseAdmin.from("reports").insert({
            target_type: "drop",
            target_id: targetId,
            reporter_id: reporterId,
            reason: r,
            details: details || null,
            status: "open",
        } as any);

        if (error) return NextResponse.json({ ok: false }, { status: 500 });
        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ ok: false }, { status: 500 });
    }
}
