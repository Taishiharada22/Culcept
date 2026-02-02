// app/api/recommendations/reset-seen/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Role = "buyer" | "seller";
type Scope = "cards" | "shops" | "all";

function clampInt(v: any, lo: number, hi: number, fallback: number) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, Math.trunc(n)));
}

function parseBool(v: any) {
    const s = String(v ?? "").trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes";
}

async function handle(req: Request) {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);

    // URL params (default)
    let role = (String(url.searchParams.get("role") ?? "buyer") as Role);
    let v = clampInt(url.searchParams.get("v"), 1, 2, 2);
    let scope = (String(url.searchParams.get("scope") ?? "cards") as Scope);
    const dryRun = parseBool(url.searchParams.get("dryRun"));

    // POST body override (optional)
    if (req.method === "POST") {
        try {
            const body = await req.json();
            if (body?.role) role = String(body.role) as Role;
            if (body?.v != null) v = clampInt(body.v, 1, 2, v);
            if (body?.scope) scope = String(body.scope) as Scope;
        } catch {
            // ignore
        }
    }

    // impressions filter builder
    let impSel = supabaseAdmin
        .from("recommendation_impressions")
        .select("id", { count: "exact" })
        .eq("user_id", user.id)
        .eq("role", role)
        .eq("rec_version", v);

    // v=2 buyer swipe cards は insight + buyer_swipe_*
    if (role === "buyer" && v === 2 && scope === "cards") {
        impSel = impSel
            .eq("target_type", "insight")
            .in("rec_type", ["buyer_swipe_card", "buyer_swipe_summary", "buyer_swipe_no_cards"]);
    } else if (scope === "shops") {
        impSel = impSel.eq("target_type", "shop");
    } else if (scope === "cards") {
        impSel = impSel.in("target_type", ["drop", "insight"]);
    } else {
        // all: no extra filter
    }

    const { data: impRows, error: impSelErr, count: impCount } = await impSel;

    if (impSelErr) {
        return NextResponse.json({ ok: false, error: impSelErr.message }, { status: 500 });
    }

    const impressionIds = (impRows ?? []).map((r: any) => String(r.id)).filter(Boolean);

    // dryRun: 削除対象だけ返す
    if (dryRun) {
        return NextResponse.json({
            ok: true,
            dryRun: true,
            role,
            v,
            scope,
            impressionsMatched: impCount ?? impressionIds.length,
            sampleImpressionIds: impressionIds.slice(0, 10),
        });
    }

    // 0件なら終了
    if (impressionIds.length === 0) {
        return NextResponse.json({
            ok: true,
            deleted: { actions: 0, ratings: 0, impressions: 0 },
            role,
            v,
            scope,
            impressionsMatched: 0,
        });
    }

    // ✅ FKを踏まえて、子 → 親の順に削除
    const delActions = await supabaseAdmin
        .from("recommendation_actions")
        .delete({ count: "exact" })
        .eq("user_id", user.id)
        .in("impression_id", impressionIds);

    if (delActions.error) {
        return NextResponse.json({ ok: false, error: delActions.error.message, step: "delete_actions" }, { status: 500 });
    }

    const delRatings = await supabaseAdmin
        .from("recommendation_ratings")
        .delete({ count: "exact" })
        .eq("user_id", user.id)
        .in("impression_id", impressionIds);

    if (delRatings.error) {
        return NextResponse.json({ ok: false, error: delRatings.error.message, step: "delete_ratings" }, { status: 500 });
    }

    const delImps = await supabaseAdmin
        .from("recommendation_impressions")
        .delete({ count: "exact" })
        .eq("user_id", user.id)
        .in("id", impressionIds);

    if (delImps.error) {
        return NextResponse.json({ ok: false, error: delImps.error.message, step: "delete_impressions" }, { status: 500 });
    }

    return NextResponse.json({
        ok: true,
        deleted: {
            actions: delActions.count ?? 0,
            ratings: delRatings.count ?? 0,
            impressions: delImps.count ?? 0,
        },
        role,
        v,
        scope,
        impressionsMatched: impCount ?? impressionIds.length,
    });
}

export async function GET(req: Request) {
    return handle(req);
}

export async function POST(req: Request) {
    return handle(req);
}
