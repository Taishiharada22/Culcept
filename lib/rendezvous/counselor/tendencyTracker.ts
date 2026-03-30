import "server-only";

import { supabaseServer } from "@/lib/supabase/server";
import type {
  DisconnectAnalysis,
  TendencyPatternRow,
} from "./types";

// ============================================================
// 傾向トラッカー
// 複数の切断から傾向パターンを追跡し、長期的な成長インサイトを提供
// ============================================================

/** 分析結果から傾向パターンを抽出・記録する */
export async function trackTendency(
  userId: string,
  analysis: DisconnectAnalysis,
): Promise<void> {
  const supabase = await supabaseServer();
  const now = new Date().toISOString();

  // 分析からパターンキーを抽出（理由コード + 関連軸の組み合わせ）
  const patternKeys = extractPatternKeys(analysis);

  for (const key of patternKeys) {
    const { data: existing } = await supabase
      .from("rendezvous_tendency_patterns")
      .select("id, occurrence_count, pattern_data")
      .eq("user_id", userId)
      .eq("pattern_key", key)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("rendezvous_tendency_patterns")
        .update({
          occurrence_count: existing.occurrence_count + 1,
          last_detected_at: now,
          updated_at: now,
          pattern_data: {
            ...(existing.pattern_data as Record<string, unknown>),
            tendency: analysis.tendencyInsight.tendency,
            explanation: analysis.tendencyInsight.explanation,
            relatedAxes: analysis.tendencyInsight.relatedAxes,
            lastReasonCode: analysis.reasonCode,
          },
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("rendezvous_tendency_patterns").insert({
        user_id: userId,
        pattern_key: key,
        pattern_data: {
          tendency: analysis.tendencyInsight.tendency,
          explanation: analysis.tendencyInsight.explanation,
          relatedAxes: analysis.tendencyInsight.relatedAxes,
          lastReasonCode: analysis.reasonCode,
        },
        occurrence_count: 1,
        improving: false,
        first_detected_at: now,
        last_detected_at: now,
      });
    }
  }
}

/** ユーザーの全傾向パターンを取得 */
export async function getUserTendencies(
  userId: string,
): Promise<TendencyPatternRow[]> {
  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("rendezvous_tendency_patterns")
    .select("*")
    .eq("user_id", userId)
    .order("occurrence_count", { ascending: false });

  if (error) {
    console.error("[counselor/tendencyTracker] getUserTendencies error:", error);
    return [];
  }

  return (data ?? []) as TendencyPatternRow[];
}

/** 特定パターンの改善状況をチェック */
export async function checkPatternImprovement(
  userId: string,
  patternKey: string,
): Promise<{
  improving: boolean;
  recentCount: number;
  historicalCount: number;
  daysSinceFirst: number;
}> {
  const supabase = await supabaseServer();

  const { data: pattern } = await supabase
    .from("rendezvous_tendency_patterns")
    .select("*")
    .eq("user_id", userId)
    .eq("pattern_key", patternKey)
    .maybeSingle();

  if (!pattern) {
    return {
      improving: false,
      recentCount: 0,
      historicalCount: 0,
      daysSinceFirst: 0,
    };
  }

  const row = pattern as TendencyPatternRow;
  const firstDetected = new Date(row.first_detected_at);
  const lastDetected = new Date(row.last_detected_at);
  const now = new Date();
  const daysSinceFirst = Math.floor(
    (now.getTime() - firstDetected.getTime()) / (1000 * 60 * 60 * 24),
  );

  // 最近30日間の切断分析を取得してこのパターンの出現頻度を確認
  const thirtyDaysAgo = new Date(
    now.getTime() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { count: recentAnalysesCount } = await supabase
    .from("rendezvous_disconnect_analyses")
    .select("id", { count: "exact", head: true })
    .eq("disconnected_user_id", userId)
    .gte("created_at", thirtyDaysAgo);

  // 全期間の切断分析数
  const { count: totalAnalysesCount } = await supabase
    .from("rendezvous_disconnect_analyses")
    .select("id", { count: "exact", head: true })
    .eq("disconnected_user_id", userId);

  const totalCount = totalAnalysesCount ?? 0;
  const recentCount = recentAnalysesCount ?? 0;

  // 改善判定:
  // - 全体の出現率より最近の出現率が低い → 改善傾向
  // - または最後の検出から30日以上経過 → 改善とみなす
  const daysSinceLast = Math.floor(
    (now.getTime() - lastDetected.getTime()) / (1000 * 60 * 60 * 24),
  );

  const improving =
    daysSinceLast > 30 ||
    (totalCount > 3 &&
      recentCount > 0 &&
      recentCount / totalCount < row.occurrence_count / totalCount * 0.7);

  // improving フラグを更新
  if (improving !== row.improving) {
    await supabase
      .from("rendezvous_tendency_patterns")
      .update({ improving, updated_at: new Date().toISOString() })
      .eq("id", row.id);
  }

  return {
    improving,
    recentCount,
    historicalCount: row.occurrence_count,
    daysSinceFirst,
  };
}

/** 上位パターンのサマリーを取得（成長インサイト用） */
export async function getTopPatterns(
  userId: string,
  limit = 5,
): Promise<
  Array<{
    patternKey: string;
    tendency: string;
    occurrenceCount: number;
    improving: boolean;
  }>
> {
  const patterns = await getUserTendencies(userId);

  return patterns.slice(0, limit).map((p) => ({
    patternKey: p.pattern_key,
    tendency:
      (p.pattern_data as Record<string, unknown>)?.tendency as string ??
      p.pattern_key,
    occurrenceCount: p.occurrence_count,
    improving: p.improving,
  }));
}

// ---------- 内部ヘルパー ----------

/** 分析結果からパターンキーを抽出 */
function extractPatternKeys(analysis: DisconnectAnalysis): string[] {
  const keys: string[] = [];

  // 1. 理由コードベースのキー
  keys.push(analysis.reasonCode);

  // 2. 理由コード + 主要な関連軸のキー
  if (analysis.tendencyInsight.relatedAxes.length > 0) {
    const primaryAxis = analysis.tendencyInsight.relatedAxes[0]
      .toLowerCase()
      .replace(/\s+/g, "_");
    keys.push(`${analysis.reasonCode}_${primaryAxis}`);
  }

  // 3. ミスマッチポイントのdimensionベースのキー
  for (const point of analysis.structuralAnalysis.mismatchPoints) {
    const dimKey = point.dimension.toLowerCase().replace(/\s+/g, "_");
    if (!keys.includes(dimKey)) {
      keys.push(dimKey);
    }
  }

  return keys;
}
