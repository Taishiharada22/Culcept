// app/api/outbound/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { supabaseServer } from "@/lib/supabase/server";
import crypto from "crypto";

export const runtime = "nodejs";

function firstIpFromXff(xff: string) {
    // "a, b, c" の先頭がクライアントIP想定
    return xff.split(",")[0]?.trim() ?? "";
}

function getClientIp(req: NextRequest): string | null {
    // 代表的なヘッダーを順に見る（環境により入るものが違う）
    const xff = req.headers.get("x-forwarded-for") ?? "";
    const xr = req.headers.get("x-real-ip") ?? "";
    const cf = req.headers.get("cf-connecting-ip") ?? "";

    const ip = firstIpFromXff(xff) || xr.trim() || cf.trim();
    return ip ? ip : null;
}

function sha256(s: string) {
    return crypto.createHash("sha256").update(s).digest("hex");
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const dropId = String(body?.dropId ?? "");
        const kind = String(body?.kind ?? "");
        const url = String(body?.url ?? "");

        if (!dropId || !url) return NextResponse.json({ ok: false }, { status: 400 });
        if (kind !== "buy" && kind !== "link") return NextResponse.json({ ok: false }, { status: 400 });

        // ユーザー取れれば入れる（取れなくてもOK）
        let userId: string | null = null;
        try {
            const supabase = await supabaseServer();
            const { data } = await supabase.auth.getUser();
            userId = data.user?.id ?? null;
        } catch {
            userId = null;
        }

        const referrer = req.headers.get("referer");
        const ua = req.headers.get("user-agent");

        const ip = getClientIp(req);
        const ip_hash = ip ? sha256(ip) : null;

        const { error } = await supabaseAdmin.from("outbound_clicks").insert({
            drop_id: dropId,
            kind,
            url,
            user_id: userId,
            referrer,
            ua,
            ip_hash,
        } as any);

        if (error) return NextResponse.json({ ok: false }, { status: 500 });
        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ ok: false }, { status: 500 });
    }
}
