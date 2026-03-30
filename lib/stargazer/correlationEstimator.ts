// lib/stargazer/correlationEstimator.ts
// 軸間相関係数の経験的再推定
//
// 用途: ユーザーデータが蓄積された後（50+ユーザー目安）、
// ハードコードされた相関係数を実データから再推定する。
//
// 実行タイミング: cron ジョブまたは手動スクリプト (CEO承認後)
// 出力: ハードコード値と経験的推定値の比較レポート

import type { SupabaseClient } from "@supabase/supabase-js";
import { TRAIT_AXIS_KEYS, type TraitAxisKey } from "./traitAxes";

export interface CorrelationEstimate {
  axisA: TraitAxisKey;
  axisB: TraitAxisKey;
  /** 経験的 Pearson 相関 */
  empiricalR: number;
  /** ハードコード値 */
  hardcodedR: number | null;
  /** 経験的推定に使ったユーザー数 */
  sampleSize: number;
  /** |empirical - hardcoded| */
  deviation: number;
  /** 推定が信頼できるか (n >= 50 && |r| > 0.15) */
  reliable: boolean;
}

/**
 * 全ユーザーの axis_beliefs から軸間 Pearson 相関を推定
 *
 * @param supabase Supabase クライアント
 * @param minUsers 最低必要ユーザー数 (default: 30)
 * @returns 全軸ペアの相関推定値
 */
export async function estimateCorrelationsFromData(
  supabase: SupabaseClient,
  minUsers: number = 30,
): Promise<{
  estimates: CorrelationEstimate[];
  userCount: number;
  axisCount: number;
}> {
  // 1. 全ユーザーの axis_beliefs を取得
  const { data: profiles, error } = await supabase
    .from("stargazer_profiles")
    .select("user_id, axis_beliefs")
    .not("axis_beliefs", "is", null);

  if (error || !profiles) {
    throw new Error(`Failed to fetch profiles: ${error?.message}`);
  }

  // 2. axis_beliefs → mu 値の行列に変換
  const userScores: Record<TraitAxisKey, number>[] = [];

  for (const profile of profiles) {
    const beliefs = profile.axis_beliefs as Record<string, { mu: number; precision: number }> | null;
    if (!beliefs) continue;

    const scores: Partial<Record<TraitAxisKey, number>> = {};
    let hasData = false;
    for (const key of TRAIT_AXIS_KEYS) {
      if (beliefs[key] && beliefs[key].precision > 1.0) {
        // precision > 1.0 = 少なくとも1回以上の有意な観測あり
        scores[key] = beliefs[key].mu;
        hasData = true;
      }
    }

    if (hasData) {
      // 欠損値は 0 で埋める（中立値）
      const fullScores: Record<TraitAxisKey, number> = {} as Record<TraitAxisKey, number>;
      for (const key of TRAIT_AXIS_KEYS) {
        fullScores[key] = scores[key] ?? 0;
      }
      userScores.push(fullScores);
    }
  }

  if (userScores.length < minUsers) {
    return {
      estimates: [],
      userCount: userScores.length,
      axisCount: TRAIT_AXIS_KEYS.length,
    };
  }

  // 3. Pearson 相関を計算（全軸ペア）
  const { getCorrelatedAxes } = await import("./informationGain");

  const estimates: CorrelationEstimate[] = [];
  const n = userScores.length;

  for (let i = 0; i < TRAIT_AXIS_KEYS.length; i++) {
    for (let j = i + 1; j < TRAIT_AXIS_KEYS.length; j++) {
      const axisA = TRAIT_AXIS_KEYS[i];
      const axisB = TRAIT_AXIS_KEYS[j];

      // Pearson 相関
      const valuesA = userScores.map((s) => s[axisA]);
      const valuesB = userScores.map((s) => s[axisB]);

      const meanA = valuesA.reduce((a, b) => a + b, 0) / n;
      const meanB = valuesB.reduce((a, b) => a + b, 0) / n;

      let covAB = 0;
      let varA = 0;
      let varB = 0;
      for (let k = 0; k < n; k++) {
        const dA = valuesA[k] - meanA;
        const dB = valuesB[k] - meanB;
        covAB += dA * dB;
        varA += dA * dA;
        varB += dB * dB;
      }

      const denom = Math.sqrt(varA * varB);
      const r = denom > 0 ? covAB / denom : 0;

      // ハードコード値との比較
      const correlated = getCorrelatedAxes(axisA);
      const hardcoded = correlated.find((c) => c.peer === axisB);
      const hardcodedR = hardcoded?.r ?? null;

      const deviation = hardcodedR !== null ? Math.abs(r - hardcodedR) : 0;
      const reliable = n >= 50 && Math.abs(r) > 0.15;

      // 有意な相関のみ記録（|r| > 0.2 または ハードコード値あり）
      if (Math.abs(r) > 0.2 || hardcodedR !== null) {
        estimates.push({
          axisA,
          axisB,
          empiricalR: Math.round(r * 1000) / 1000,
          hardcodedR,
          sampleSize: n,
          deviation: Math.round(deviation * 1000) / 1000,
          reliable,
        });
      }
    }
  }

  // 乖離度で降順ソート（最も修正が必要なペアが先頭）
  estimates.sort((a, b) => b.deviation - a.deviation);

  return {
    estimates,
    userCount: n,
    axisCount: TRAIT_AXIS_KEYS.length,
  };
}

/**
 * 推定結果のサマリーレポートを生成
 */
export function generateCorrelationReport(
  result: Awaited<ReturnType<typeof estimateCorrelationsFromData>>,
): string {
  const lines: string[] = [];
  lines.push(`=== 軸間相関 経験的再推定レポート ===`);
  lines.push(`ユーザー数: ${result.userCount}`);
  lines.push(`軸数: ${result.axisCount}`);
  lines.push(`推定ペア数: ${result.estimates.length}`);
  lines.push("");

  // ハードコード値ありで乖離が大きいもの
  const divergent = result.estimates.filter(
    (e) => e.hardcodedR !== null && e.deviation > 0.2 && e.reliable,
  );

  if (divergent.length > 0) {
    lines.push(`--- 要修正候補（乖離 > 0.2、信頼可能）---`);
    for (const e of divergent) {
      lines.push(
        `  ${e.axisA} ↔ ${e.axisB}: hardcoded=${e.hardcodedR}, empirical=${e.empiricalR}, deviation=${e.deviation}`,
      );
    }
    lines.push("");
  }

  // ハードコード値なしで強い経験的相関が見つかったもの（追加候補）
  const newCorrelations = result.estimates.filter(
    (e) => e.hardcodedR === null && Math.abs(e.empiricalR) > 0.3 && e.reliable,
  );

  if (newCorrelations.length > 0) {
    lines.push(`--- 新規追加候補（|r| > 0.3、未定義）---`);
    for (const e of newCorrelations) {
      lines.push(`  ${e.axisA} ↔ ${e.axisB}: empirical=${e.empiricalR}`);
    }
    lines.push("");
  }

  // 符号一致率
  const withHardcoded = result.estimates.filter((e) => e.hardcodedR !== null && e.reliable);
  const signMatch = withHardcoded.filter(
    (e) => Math.sign(e.empiricalR) === Math.sign(e.hardcodedR!),
  ).length;
  if (withHardcoded.length > 0) {
    lines.push(
      `符号一致率: ${signMatch}/${withHardcoded.length} (${((signMatch / withHardcoded.length) * 100).toFixed(1)}%)`,
    );
  }

  return lines.join("\n");
}
