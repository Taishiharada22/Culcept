import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isDuplicate(err: any) {
    const code = String(err?.code ?? "");
    return code === "23505";
}

export async function POST(req: Request) {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const impression_id = String(body?.impression_id ?? "").trim();
    const ratingRaw = Number(body?.rating);

    if (!impression_id) return NextResponse.json({ ok: false, error: "impression_id required" }, { status: 400 });
    if (ratingRaw !== 1 && ratingRaw !== -1 && ratingRaw !== 0) {
        return NextResponse.json({ ok: false, error: "rating must be -1/0/+1" }, { status: 400 });
    }

    // できれば unique(user_id, impression_id) がある想定で upsert
    const payload = { user_id: user.id, impression_id, rating: ratingRaw };

    const { error: upErr } = await supabaseAdmin
        .from("recommendation_ratings")
        .upsert(payload as any, { onConflict: "user_id,impression_id" });

    if (!upErr) return NextResponse.json({ ok: true });

    // unique が無い等で upsert が失敗しても “保存は通す”
    const { error: insErr } = await supabaseAdmin.from("recommendation_ratings").insert(payload as any);
    if (!insErr || isDuplicate(insErr)) return NextResponse.json({ ok: true });

    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
}
