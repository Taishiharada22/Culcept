import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type RatingValue = -1 | 0 | 1;

function clampRating(v: any): RatingValue {
    const n = Number(v);
    if (n === 1) return 1;
    if (n === -1) return -1;
    return 0;
}

function clampInt(v: any, lo: number, hi: number, fallback: number) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, Math.trunc(n)));
}

function getRecVersionFromBody(body: any): 1 | 2 {
    const v = clampInt(body?.recVersion ?? body?.v, 1, 2, 1);
    return (v === 2 ? 2 : 1) as 1 | 2;
}

/**
 * Body例:
 * {
 *   "impressionId": "uuid",
 *   "rating": 1,                 // 1=Like, -1=Dislike, 0=Skip
 *   "recVersion": 2
 * }
 */
export async function POST(req: Request) {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    let body: any = null;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const impressionId = body?.impressionId ? String(body.impressionId) : "";
    if (!impressionId) {
        return NextResponse.json({ ok: false, error: "impressionId is required" }, { status: 400 });
    }

    const rating = clampRating(body?.rating);
    const recVersion = getRecVersionFromBody(body);

    // impression の所有チェック（他人のimpressionにratingできないように）
    const { data: imp, error: impErr } = await supabaseAdmin
        .from("recommendation_impressions")
        .select("id, user_id, role, rec_version, target_type, rec_type, target_id")
        .eq("id", impressionId)
        .maybeSingle();

    if (impErr) {
        return NextResponse.json({ ok: false, error: "Failed to load impression" }, { status: 500 });
    }
    if (!imp?.id) {
        return NextResponse.json({ ok: false, error: "Impression not found" }, { status: 404 });
    }
    if (String((imp as any).user_id) !== String(user.id)) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // recVersionの整合（body優先だけど、impression側が正）
    const finalRecVersion = Number((imp as any).rec_version ?? recVersion) === 2 ? 2 : 1;

    // upsert: 同じ impressionId は上書き
    const { data, error } = await supabaseAdmin
        .from("recommendation_ratings")
        .upsert(
            [
                {
                    user_id: user.id,
                    impression_id: impressionId,
                    rating,
                    rec_version: finalRecVersion,
                },
            ] as any,
            { onConflict: "user_id,impression_id" }
        )
        .select("id, rating, impression_id, rec_version");

    if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        ok: true,
        saved: data?.[0] ?? null,
        hint: "Like/Dislikeが溜まると stream=shops が有効になります",
    });
}
