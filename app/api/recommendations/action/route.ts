import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ALLOWED = new Set(["save", "click", "purchase", "skip"]);

export async function POST(req: Request) {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const impressionId = String(body?.impressionId ?? "").trim();
    const action = String(body?.action ?? "").trim();
    const rawMeta = body?.meta;
    const meta =
        rawMeta && typeof rawMeta === "object" && !Array.isArray(rawMeta)
            ? rawMeta
            : {};


    if (!impressionId) return NextResponse.json({ ok: false, error: "impressionId required" }, { status: 400 });
    if (!ALLOWED.has(action)) return NextResponse.json({ ok: false, error: "invalid action" }, { status: 400 });

    const { data: imp } = await supabaseAdmin
        .from("recommendation_impressions")
        .select("id, user_id, rec_version")
        .eq("id", impressionId)
        .maybeSingle();

    if (!imp || String((imp as any).user_id) !== user.id) {
        return NextResponse.json({ ok: false, error: "impression not found" }, { status: 404 });
    }

    const recVersion = Number((imp as any).rec_version ?? 1) || 1;

    const { error } = await supabaseAdmin.from("recommendation_actions").insert({
        user_id: user.id,
        impression_id: impressionId,
        action,
        meta,
        rec_version: recVersion,
    } as any);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
}
