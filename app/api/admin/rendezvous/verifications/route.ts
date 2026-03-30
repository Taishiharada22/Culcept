import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminEmail } from "@/lib/auth/isAdmin";

/**
 * GET /api/admin/rendezvous/verifications — 本人確認キュー
 *   ?status=pending (default) | approved | rejected | frozen | all
 * PATCH /api/admin/rendezvous/verifications — 審査処理（approve / reject / freeze / unfreeze）
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user || !isAdminEmail(auth.user.email)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const filterStatus = request.nextUrl.searchParams.get("status") ?? "pending";

    let query = supabaseAdmin
      .from("rendezvous_profiles")
      .select(
        "user_id, display_name, verification_status, review_status, verification_level, verification_submitted_at, verification_reviewed_at, verification_reviewer_note, document_type, id_document_path, selfie_path, birth_date, frozen_at, frozen_reason, manual_review_required",
      )
      .order("verification_submitted_at", { ascending: true })
      .limit(50);

    if (filterStatus === "pending") {
      query = query.eq("review_status", "pending");
    } else if (filterStatus === "approved") {
      query = query.eq("review_status", "approved");
    } else if (filterStatus === "rejected") {
      query = query.eq("review_status", "rejected");
    } else if (filterStatus === "frozen") {
      query = query.not("frozen_at", "is", null);
    }
    // "all" → no filter

    const { data, error } = await query;

    if (error) {
      console.error("[admin/verifications] GET error:", error);
      return NextResponse.json({ ok: true, verifications: [] });
    }

    return NextResponse.json({ ok: true, verifications: data ?? [] });
  } catch (err: unknown) {
    console.error("[admin/verifications] GET error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}

const VALID_ACTIONS = ["approve", "reject", "request_resubmit", "freeze", "unfreeze"] as const;

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user || !isAdminEmail(auth.user.email)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { userId, action, note } = body as {
      userId?: string;
      action?: string;
      note?: string;
    };

    if (!userId || !action || !VALID_ACTIONS.includes(action as typeof VALID_ACTIONS[number])) {
      return NextResponse.json(
        { ok: false, error: `userId and action (${VALID_ACTIONS.join("/")}) required` },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const adminId = auth.user.id;

    // 現在のプロファイルを取得（監査ログ用）
    const { data: current } = await supabaseAdmin
      .from("rendezvous_profiles")
      .select("review_status, verification_level, verification_status, frozen_at")
      .eq("user_id", userId)
      .single();

    if (action === "approve") {
      // review_status=approved, verification_level を再計算
      // L3 に到達（L2 は写真承認時に設定済みと想定）
      const newLevel = Math.max(current?.verification_level ?? 0, 3);
      const { error } = await supabaseAdmin
        .from("rendezvous_profiles")
        .update({
          verification_status: "verified",   // ユーザー向け: 確認済み
          review_status: "approved",           // 管理側: 承認
          verification_level: newLevel,
          age_verified_at: now,
          verification_reviewed_at: now,
          verification_reviewer_note: note ?? null,
        })
        .eq("user_id", userId);

      if (error) {
        console.error("[admin/verifications] approve error:", error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      await writeAuditLog(userId, "approve", adminId, {
        review_status: current?.review_status,
        verification_level: current?.verification_level,
      }, {
        review_status: "approved",
        verification_level: newLevel,
      }, note);

    } else if (action === "reject" || action === "request_resubmit") {
      const { error } = await supabaseAdmin
        .from("rendezvous_profiles")
        .update({
          verification_status: "rejected",   // ユーザー向け: 却下
          review_status: "rejected",           // 管理側: 却下
          verification_reviewed_at: now,
          verification_reviewer_note: note ?? null,
        })
        .eq("user_id", userId);

      if (error) {
        console.error("[admin/verifications] reject error:", error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      await writeAuditLog(userId, "reject", adminId, {
        review_status: current?.review_status,
      }, {
        review_status: "rejected",
      }, note);

    } else if (action === "freeze") {
      if (!note) {
        return NextResponse.json(
          { ok: false, error: "凍結には frozen_reason (note) が必要です" },
          { status: 400 },
        );
      }
      const { error } = await supabaseAdmin
        .from("rendezvous_profiles")
        .update({
          frozen_at: now,
          frozen_reason: note,
        })
        .eq("user_id", userId);

      if (error) {
        console.error("[admin/verifications] freeze error:", error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      await writeAuditLog(userId, "freeze", adminId, {
        frozen_at: current?.frozen_at,
      }, {
        frozen_at: now,
        frozen_reason: note,
      }, note);

    } else if (action === "unfreeze") {
      const { error } = await supabaseAdmin
        .from("rendezvous_profiles")
        .update({
          frozen_at: null,
          frozen_reason: null,
        })
        .eq("user_id", userId);

      if (error) {
        console.error("[admin/verifications] unfreeze error:", error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      await writeAuditLog(userId, "unfreeze", adminId, {
        frozen_at: current?.frozen_at,
        frozen_reason: (current as any)?.frozen_reason,
      }, {
        frozen_at: null,
        frozen_reason: null,
      }, note);
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[admin/verifications] PATCH error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}

// ── 監査ログ書き込み ──
async function writeAuditLog(
  userId: string,
  action: string,
  actorId: string,
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown>,
  note?: string | null,
) {
  const { error } = await supabaseAdmin
    .from("verification_audit_logs")
    .insert({
      user_id: userId,
      action,
      actor_id: actorId,
      old_value: oldValue,
      new_value: newValue,
      note: note ?? null,
    });
  if (error) {
    console.warn("[admin/verifications] audit log write failed:", error);
  }
}
