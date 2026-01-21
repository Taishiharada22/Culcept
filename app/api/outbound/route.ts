// app/api/outbound/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function safeStr(v: any, max = 2048) {
    const s = String(v ?? "").trim();
    return s.length > max ? s.slice(0, max) : s;
}

export async function POST(req: Request) {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id ?? null;

    const body = await req.json().catch(() => ({}));
    const dropId = safeStr(body?.dropId, 128);
    const kind = safeStr(body?.kind, 16); // buy|link
    const url = safeStr(body?.url, 2048);

    // 体験優先：欠けてたら 200 で終了
    if (!dropId || !url) return NextResponse.json({ ok: true });

    const { error } = await supabaseAdmin.from("drop_outbound_events").insert({
        user_id: userId,
        drop_id: dropId,
        kind,
        url,
    } as any);

    if (error) {
        // noisyなら消してOK
        console.warn("[outbound] insert error:", error.message);
    }

    return NextResponse.json({ ok: true });
}
