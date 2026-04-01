// app/api/stargazer/expansion-log/route.ts
// P4 Phase C: 拡張軸の解放条件ログ API
// CEO条件: 解放率と未解放理由のログが見える状態にする
//
// GET  — 指定ユーザー（or 自分）の最新の解放判定ログを返す
// POST — 解放条件を評価してログを記録・返却する

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  evaluateExpansionEligibility,
  type ExpansionEligibilityLog,
  type DiscoveryInput,
} from "@/lib/stargazer/expansionDiscovery";
import { TRAIT_AXES, isExpansionAxis, type TraitAxisKey } from "@/lib/stargazer/traitAxes";
import { deserializeBeliefs } from "@/lib/stargazer/bayesianAxisUpdater";

export const dynamic = "force-dynamic";

/**
 * POST: 解放条件を評価してログを返す
 * Body は不要（サーバー側でユーザーデータから自動計算）
 */
export async function POST() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── データ収集 ──
    const [
      { data: profile },
      { data: observations },
      { data: contradictionRows },
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("total_sessions, observation_mode, created_at")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("stargazer_star_maps")
        .select("axis_beliefs, created_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("stargazer_axis_snapshots")
        .select("axis_id, observation_layer, session_date")
        .eq("user_id", user.id)
        .order("session_date", { ascending: false })
        .limit(1000),
    ]);

    // precision マップの構築
    const axisPrecisions: Partial<Record<TraitAxisKey, number>> = {};
    if (observations?.axis_beliefs) {
      const beliefs = deserializeBeliefs(
        observations.axis_beliefs as Record<string, { mu: number; precision: number }>
      );
      for (const [key, belief] of Object.entries(beliefs)) {
        axisPrecisions[key as TraitAxisKey] = belief.precision;
      }
    }

    // 矛盾カウントの構築（簡易: 同一日に同じ軸で矛盾するスコアが観測された回数）
    const contradictionCounts = new Map<string, number>();
    // 現状は矛盾検出の永続化がないため、0として扱う
    // Phase D以降で stargazer_contradictions テーブルから読み取り予定

    // 観測深度の計算
    const totalObservations = profile?.total_sessions ?? 0;
    const createdAt = profile?.created_at ?? observations?.created_at;
    const daysSinceFirst = createdAt
      ? Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // フェーズ判定
    type Phase = "surface" | "awakening" | "maturity" | "deep";
    let phase: Phase = "surface";
    if (totalObservations >= 200 && daysSinceFirst >= 60) phase = "deep";
    else if (totalObservations >= 100 && daysSinceFirst >= 31) phase = "maturity";
    else if (totalObservations >= 20 && daysSinceFirst >= 7) phase = "awakening";

    // 既発見軸（将来的にDBから読み取り。現在は空）
    const discoveredAxes = new Set<TraitAxisKey>();

    // ── 判定実行 ──
    const input: DiscoveryInput = {
      userId: user.id,
      axisPrecisions,
      contradictionCounts,
      totalObservations,
      daysSinceFirst,
      phase,
      discoveredAxes,
    };

    const log = evaluateExpansionEligibility(input);

    // ── ログ記録（console + 将来的にDB） ──
    console.log("[expansion-eligibility]", JSON.stringify({
      userId: user.id,
      timestamp: log.timestamp,
      conditionsMet: log.conditionsMet,
      released: log.released,
      precisionSaturation: log.precisionSaturation,
      contradictionAccumulation: log.contradictionAccumulation,
      observationDepth: log.observationDepth,
      releasedAxes: log.releasedAxes,
    }));

    return NextResponse.json({
      ok: true,
      log,
      // 追加の可視化情報
      summary: {
        conditionsMet: log.conditionsMet,
        released: log.released,
        unmetReasons: buildUnmetReasons(log),
        phase,
        daysSinceFirst,
        totalObservations,
      },
    });
  } catch (error) {
    console.error("[expansion-log] error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** 未達条件の理由を人間が読める形で返す */
function buildUnmetReasons(log: ExpansionEligibilityLog): string[] {
  const reasons: string[] = [];

  if (!log.precisionSaturation.met) {
    reasons.push(
      `精度飽和: ${log.precisionSaturation.current}/${log.precisionSaturation.threshold}軸が高精度（τ>30）に到達`
    );
  }
  if (!log.contradictionAccumulation.met) {
    reasons.push(
      `矛盾蓄積: 最大${log.contradictionAccumulation.maxPairCount}/${log.contradictionAccumulation.threshold}回（同一ペアの矛盾検出）`
    );
  }
  if (!log.observationDepth.met) {
    const parts: string[] = [];
    if (log.observationDepth.totalObservations < 100) {
      parts.push(`観測数 ${log.observationDepth.totalObservations}/100`);
    }
    if (!log.observationDepth.phaseMet) {
      parts.push(`フェーズ未到達（maturity以上が必要、現在 ${log.observationDepth.daysSinceFirst}日目）`);
    }
    reasons.push(`観測深度: ${parts.join("、")}`);
  }

  return reasons;
}
