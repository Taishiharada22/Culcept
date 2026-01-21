import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const impressionId = String(body?.impressionId ?? "").trim();
    const ratingNum = Number(body?.rating);

    if (!impressionId) return NextResponse.json({ ok: false, error: "impressionId required" }, { status: 400 });
    if (![1, 0, -1].includes(ratingNum)) return NextResponse.json({ ok: false, error: "rating must be 1|0|-1" }, { status: 400 });

    const { data: imp } = await supabaseAdmin
        .from("recommendation_impressions")
        .select("id, user_id, rec_version")
        .eq("id", impressionId)
        .maybeSingle();

    if (!imp || String((imp as any).user_id) !== user.id) {
        return NextResponse.json({ ok: false, error: "impression not found" }, { status: 404 });
    }

    const recVersion = Number((imp as any).rec_version ?? 1) || 1;

    const { error } = await supabaseAdmin
        .from("recommendation_ratings")
        .upsert(
            {
                user_id: user.id,
                impression_id: impressionId,
                rating: ratingNum,
                rec_version: recVersion,
            } as any,
            { onConflict: "user_id,impression_id" }
        );

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
}
