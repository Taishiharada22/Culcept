// app/api/recommendations/action/route.ts - FIXED VERSION
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ✅ DB制約に完全準拠
const ALLOWED_DB_ACTIONS = new Set(["save", "click", "purchase", "skip", "neutral"]);

// ✅ フロントから来る action を DB用に正規化
function normalizeAction(action: string): string | null {
    const normalized = action.toLowerCase().trim();

    // フロントの like/dislike を DB用に変換
    if (normalized === "like") return "save";
    if (normalized === "dislike") return "skip";

    // それ以外はそのまま（ただしDB許可チェック済み）
    if (ALLOWED_DB_ACTIONS.has(normalized)) return normalized;

    // 許可外は null
    return null;
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json(
                { ok: false, error: "Unauthorized" },
                { status: 401 }
            );
        }

        const body = await req.json();
        const { impressionId, action, meta, recVersion } = body;

        if (!impressionId || typeof impressionId !== "string") {
            return NextResponse.json(
                { ok: false, error: "Invalid impressionId" },
                { status: 400 }
            );
        }

        if (!action || typeof action !== "string") {
            return NextResponse.json(
                { ok: false, error: "Invalid action" },
                { status: 400 }
            );
        }

        // ✅ action を正規化（like/dislike を save/skip に変換）
        const dbAction = normalizeAction(action);

        if (!dbAction) {
            return NextResponse.json(
                {
                    ok: false,
                    error: `Action "${action}" is not allowed. Use: ${Array.from(ALLOWED_DB_ACTIONS).join(", ")}, or like/dislike (auto-converted)`
                },
                { status: 400 }
            );
        }

        // impressionId の所有者確認（supabaseAdmin 使用）
        const supabaseAdmin = await supabaseServer(); // Admin権限で確認
        const { data: impression, error: impErr } = await supabaseAdmin
            .from("recommendation_impressions")
            .select("user_id, rec_version, target_type, target_id, target_key")
            .eq("id", impressionId)
            .maybeSingle();

        if (impErr || !impression) {
            return NextResponse.json(
                { ok: false, error: "Impression not found" },
                { status: 404 }
            );
        }

        // 所有者チェック
        if (impression.user_id !== auth.user.id) {
            return NextResponse.json(
                { ok: false, error: "Not your impression" },
                { status: 403 }
            );
        }

        // meta にターゲット情報を追加（分析用）
        const enrichedMeta = {
            ...(meta || {}),
            target_type: impression.target_type,
            target_id: impression.target_id,
            target_key: impression.target_key,
            original_action: action, // フロントが送った元のaction（like/dislike等）
            rec_version: impression.rec_version,
        };

        // ✅ recommendation_actions に insert（正規化済みaction使用）
        const { error: insertErr } = await supabase
            .from("recommendation_actions")
            .insert({
                user_id: auth.user.id,
                impression_id: impressionId,
                action: dbAction, // ✅ 正規化済み（save/skip/neutral/click/purchase）
                meta: enrichedMeta,
                rec_version: recVersion || impression.rec_version || 2,
            });

        if (insertErr) {
            console.error("Insert error:", insertErr);
            return NextResponse.json(
                { ok: false, error: insertErr.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            ok: true,
            action: dbAction, // 実際にDBに入れたaction
            original_action: action, // フロントが送ったaction
        });
    } catch (err: any) {
        console.error("POST /api/recommendations/action error:", err);
        return NextResponse.json(
            { ok: false, error: err.message || "Internal server error" },
            { status: 500 }
        );
    }
}
