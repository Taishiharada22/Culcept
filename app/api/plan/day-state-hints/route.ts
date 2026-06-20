/**
 * GET /api/plan/day-state-hints — Alter タブの server 供給系（W3b・read-only）
 *
 * 正本: docs/day-state-w3-execution-plan.md §3（b-1 dailyModeHint / b-3 estimatedWalkLevel）
 *
 * 取得元（bounded read のみ・RLS 強制・write ゼロ）:
 *  - stargazer_profiles（dimensions, total_sessions）1 行
 *  - stargazer_resolved_types（axis_scores）1 行
 *  - alter_morning_plan_history（当日 plan）1 行 — 既存 reader fetchPreviousDayPlan を再利用
 *    （このテーブルの読み手を増やさない。date+1 を渡すと plan_date=date を読む）
 *
 * fallback / 失敗時:
 *  - flag OFF → 404 + 全 null（production では本 route は常時 404 = inert）
 *  - 未認証 → 401 + 全 null
 *  - 信号ゼロ ∧ 軸スコア証拠なし → dailyModeHint null（client は W2 の保守的 fallback）
 *  - 例外 → 200 + 全 null（fail-open。client は unknown / 「—」へ degrade）
 *
 * 規律: LLM なし・通知なし・外部送信なし・dialogues 等の会話データは読まない。
 */

import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { buildAxisScores, calcObservationDepth } from "@/lib/stargazer/sharedRouteUtils";
import { resolveArchetype } from "@/lib/stargazer/archetypeResolver";
import { getArchetypeByCode } from "@/lib/stargazer/archetypeTypes";
import { buildAlterPersonality } from "@/lib/stargazer/alter";
import { resolveDailyMode } from "@/lib/stargazer/alterHomeAdapter";
import { fetchPreviousDayPlan } from "@/lib/alter-morning/persistence/planHistory";
import {
  addDaysIso,
  extractWalkLevel,
  resolveHintConfidence,
  synthesizeGuidanceFrame,
  type DayStateHintFacts,
} from "@/lib/plan/alterTab/dayStateHints";
import type { ActivityMoodCode } from "@/lib/coalter/activity/intent";
import type { SleepQualityInput } from "@/lib/plan/dayState/dayStateTypes";

export const dynamic = "force-dynamic";

const EMPTY = {
  dailyModeHint: null as string | null,
  dailyModeHintConfidence: null as number | null,
  estimatedWalkLevel: null as string | null,
};

const MOOD_VALUES: ReadonlyArray<ActivityMoodCode> = [
  "relaxed",
  "energetic",
  "curious",
  "tired",
  "casual",
  "unknown",
];
const SLEEP_VALUES: ReadonlyArray<SleepQualityInput> = ["good", "shallow", "short"];

export async function GET(req: NextRequest) {
  try {
    // W3a と同じ flag（OFF = production 既定では本 route は inert）
    if (!PLAN_FLAGS.alterTabEnabled) {
      return NextResponse.json(EMPTY, { status: 404 });
    }

    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json(EMPTY, { status: 401 });
    }
    const userId = auth.user.id;

    const sp = req.nextUrl.searchParams;
    const date = sp.get("date") ?? "";
    // 形式 + 実在する暦日（"2026-02-30" 等の coerce を弾く roundtrip 検証）
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date
    ) {
      return NextResponse.json(EMPTY, { status: 400 });
    }
    // facts summary は allowlist 検証（client 入力を信用しない）
    const moodRaw = sp.get("mood");
    const sleepRaw = sp.get("sleep");
    const facts: DayStateHintFacts = {
      moodCode: MOOD_VALUES.includes(moodRaw as ActivityMoodCode)
        ? (moodRaw as ActivityMoodCode)
        : undefined,
      sleepQuality: SLEEP_VALUES.includes(sleepRaw as SleepQualityInput)
        ? (sleepRaw as SleepQualityInput)
        : undefined,
      isNightShift: sp.get("nightShift") === "1",
    };

    // bounded read ×2（personality 材料。会話 dialogues は読まない）
    const [{ data: profile }, { data: resolvedTypeRow }] = await Promise.all([
      supabase
        .from("stargazer_profiles")
        .select("dimensions, total_sessions")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("stargazer_resolved_types")
        .select("axis_scores")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    const { axisScores, hasEvidence } = buildAxisScores(
      profile?.dimensions ?? null,
      resolvedTypeRow?.axis_scores ?? null,
      false,
    );

    const frame = synthesizeGuidanceFrame(facts);
    const confidence = resolveHintConfidence(frame, hasEvidence);

    let dailyModeHint: string | null = null;
    if (confidence !== null) {
      const archetype = resolveArchetype(axisScores);
      const personality = buildAlterPersonality({
        archetypeCode: archetype.code,
        shadowCode: getArchetypeByCode(archetype.code)?.shadowCode ?? archetype.code,
        axisScores,
        observationDepth: calcObservationDepth(Number(profile?.total_sessions) || 0),
      });
      // recentModes は W4（履歴永続化）から供給。W3b では連続抑制なし
      dailyModeHint = resolveDailyMode(frame, personality);
    }

    // bounded read ×1: 当日 plan（fetchPreviousDayPlan は date-1 を読むため +1 で渡す）
    const todayPlan = await fetchPreviousDayPlan(supabase, userId, addDaysIso(date, 1));
    const estimatedWalkLevel = extractWalkLevel(todayPlan);

    return NextResponse.json({
      dailyModeHint,
      dailyModeHintConfidence: confidence,
      estimatedWalkLevel,
    });
  } catch {
    // fail-open: client は undefined 扱い → W2 fallback / unknown 表示へ degrade
    return NextResponse.json(EMPTY);
  }
}
