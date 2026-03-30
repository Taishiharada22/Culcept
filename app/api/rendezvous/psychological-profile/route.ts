import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { deriveAttachmentProfile, classifyAttachment } from "@/lib/rendezvous/attachmentProfile";
import { computeConflictRepairProfile } from "@/lib/rendezvous/conflictRepair";
import { deriveSDTProfile } from "@/lib/rendezvous/sdtAxes";
import type { MatchingVector } from "@/lib/rendezvous/types";

/**
 * POST /api/rendezvous/psychological-profile
 * Stargazer + MatchingVector から心理学3プロファイルを自動生成してDBに保存
 *
 * オンボーディング完了時 & Stargazer更新時に呼ばれる
 */
export async function POST() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // MatchingVector取得（rendezvous_preferences.matching_vector に格納）
    const { data: prefsRow } = await supabaseAdmin
      .from("rendezvous_preferences")
      .select("matching_vector")
      .eq("user_id", user.id)
      .single();

    if (!prefsRow?.matching_vector) {
      return NextResponse.json(
        { error: "MatchingVector not found. Complete onboarding first." },
        { status: 404 },
      );
    }

    const vector = prefsRow.matching_vector as MatchingVector;

    // Stargazer axis_scores 取得（あれば使う）
    const { data: stargazerRow } = await supabaseAdmin
      .from("stargazer_profiles")
      .select("axis_scores")
      .eq("user_id", user.id)
      .eq("context", "self")
      .maybeSingle();

    const stargazerScores = (stargazerRow?.axis_scores ?? {}) as Record<string, number>;

    // 3プロファイルを導出
    const attachmentProfile = deriveAttachmentProfile({
      matchingVector: vector,
      stargazerScores,
    });
    const conflictRepairProfile = computeConflictRepairProfile({
      tensionResponses: [], // 初回は空 — デフォルトプロファイルが返る
    });
    const sdtProfile = deriveSDTProfile({
      matchingVector: vector,
      stargazerScores,
    });

    const attachmentStyle = classifyAttachment(attachmentProfile);

    // DB に upsert（3テーブル並行）
    const [attachRes, conflictRes, sdtRes] = await Promise.all([
      supabaseAdmin.from("rendezvous_attachment_profiles").upsert(
        {
          user_id: user.id,
          anxiety_level: attachmentProfile.anxietyLevel,
          avoidance_level: attachmentProfile.avoidanceLevel,
          secure_base: attachmentProfile.secureBase,
          protest_behavior: attachmentProfile.protestBehavior,
          attachment_style: attachmentStyle,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      ),
      supabaseAdmin.from("rendezvous_conflict_profiles").upsert(
        {
          user_id: user.id,
          repair_initiative: conflictRepairProfile.repairInitiative,
          responsiveness: conflictRepairProfile.responsiveness,
          escalation_tendency: conflictRepairProfile.escalationTendency,
          recovery_speed: conflictRepairProfile.recoverySpeed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      ),
      supabaseAdmin.from("rendezvous_sdt_profiles").upsert(
        {
          user_id: user.id,
          autonomy_satisfaction: sdtProfile.autonomySatisfaction,
          competence_satisfaction: sdtProfile.competenceSatisfaction,
          relatedness_satisfaction: sdtProfile.relatednessSatisfaction,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      ),
    ]);

    const errors = [attachRes.error, conflictRes.error, sdtRes.error].filter(Boolean);
    if (errors.length > 0) {
      console.error("[psychological-profile] DB errors:", errors);
      return NextResponse.json({ error: "Partial save failure" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      profiles: {
        attachment: { ...attachmentProfile, style: attachmentStyle },
        conflictRepair: conflictRepairProfile,
        sdt: sdtProfile,
      },
    });
  } catch (err) {
    console.error("[psychological-profile] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
