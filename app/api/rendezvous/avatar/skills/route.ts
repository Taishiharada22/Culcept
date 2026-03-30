import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  SKILL_DEFINITIONS,
  getSkillRankLabel,
  type AvatarSkill,
} from "@/lib/rendezvous/avatarPersonality";

/**
 * GET /api/rendezvous/avatar/skills
 * 現在のアバタースキルとパーソナリティ状態を取得
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const userId = auth.user.id;

    const { data: skillRow, error } = await supabaseAdmin
      .from("avatar_skills")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!skillRow) {
      return NextResponse.json({
        ok: true,
        initialized: false,
        skills: null,
        personalityState: null,
      });
    }

    const skills = (skillRow.skills as AvatarSkill[]).map((s) => ({
      ...s,
      rankLabel: getSkillRankLabel(s.skill_type, s.level),
      definition: SKILL_DEFINITIONS.find((d) => d.type === s.skill_type),
    }));

    return NextResponse.json({
      ok: true,
      initialized: true,
      skills,
      personalityState: skillRow.personality_state,
      updatedAt: skillRow.updated_at,
    });
  } catch (err: any) {
    console.error("[avatar/skills] error:", err);
    return NextResponse.json({ ok: false, error: err.message ?? "Internal error" }, { status: 500 });
  }
}
