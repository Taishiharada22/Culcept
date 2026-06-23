/**
 * P2 — solver ネイティブ当日分岐（当日の備え）（**pure・決定論・捏造ゼロ**）
 *
 * 役割: 既存 solver `generateTravelItineraries` の出力（3 pareto 候補 + scoreBreakdown の
 *   transitionRisks/paretoAxis + feasibilityNotes の天候 flag）から、**事前の当日分岐**
 *   「雨なら / 疲れたら / 移動が長い区間」を precompute する。
 *
 * なぜ solver ネイティブか（原則①の結論）:
 *   - readiness-core / contingency-core は **skeleton engine 世界**（DecisionResult/ProposalComparison 入力）で
 *     live solver と噛み合わない（cross-world adapter は大きく記述対象もズレる）。
 *   - solver は **3 pareto 候補**（＝事前の代替案）と risk シグナルを既に持つ。これを fallback に使うのが
 *     最も honest かつ整合的。**新規 solver/エンジンは作らない**（solver 出力を読むだけ）。
 *
 * 厳守（honesty）:
 *   - solver が出した事実（pareto/risk/天候 flag）からのみ導く。無いものは generic 助言に留める（捏造しない）。
 *   - 実天気 API・実時刻監視なし（事前計算のみ）。raw score 非漏洩。
 */

import type { TravelItineraryGeneratorOutput } from "@/lib/coalter/travel/itinerary";

export interface DayContingencyBranch {
  /** 起点（例「雨なら」「疲れたら」）。 */
  trigger: string;
  /** 事前の備え（solver の代替候補/risk に基づく）。 */
  advice: string;
}

export interface DayContingencyVM {
  branches: DayContingencyBranch[];
}

const PARETO_SLOW_JA = "ゆっくり案";

/**
 * solver 出力 → 当日分岐（候補ゼロ→null）。決定論・副作用なし。
 */
export function buildCoAlterDayContingency(output: TravelItineraryGeneratorOutput): DayContingencyVM | null {
  const cands = output.rankedCandidates;
  if (cands.length === 0) return null;

  const branches: DayContingencyBranch[] = [];

  // ── 疲れ: slow_pace 候補があれば切替先に、無ければ休憩を増やす ──
  const hasSlow = cands.some((c) => c.scoreBreakdown.paretoAxis === "slow_pace");
  branches.push({
    trigger: "疲れたら",
    advice: hasSlow ? `「${PARETO_SLOW_JA}」に切り替えると軽くなります` : "休憩を 1 つ増やして無理なく進めます",
  });

  // ── 天候: 天候依存 warning を持つ候補と持たない候補が両方あれば、屋外少なめへ寄せる ──
  const weatherFlagged = new Set(
    output.feasibilityNotes
      .filter((n) => n.reasonCode === "weather_dependent_in_rain_warning" && n.candidateId)
      .map((n) => n.candidateId),
  );
  const hasSafe = cands.some((c) => !weatherFlagged.has(c.candidate.candidateId));
  branches.push({
    trigger: "雨なら",
    advice:
      weatherFlagged.size > 0 && hasSafe
        ? "屋外が少なめの案に寄せると崩れにくいです"
        : "屋内中心に寄せると安心です",
  });

  // ── 移動: high/extreme の transition risk があれば余裕を促す（無ければ出さない＝捏造しない）──
  const hasHighRisk = cands.some((c) =>
    c.scoreBreakdown.transitionRisks.some((r) => r === "high" || r === "extreme"),
  );
  if (hasHighRisk) {
    branches.push({ trigger: "移動が長い区間", advice: "乗り継ぎに余裕をもって動きましょう" });
  }

  return { branches };
}
