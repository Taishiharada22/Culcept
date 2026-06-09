/**
 * lib/plan/dayRehearsal/scenarioComparison.ts — A3 What-if slice 3: candidate comparison（pure・未配線）
 *
 * ★目的: 同じ 1 日を「手堅い（慎重）/ 現状 / 積極的（思い切った・冒険的）」の **3 つの診断レンズ**で
 *   `rehearseDay` を再実行し、見え方の違いを **定性的に**整理する。
 *   ★これは **予定を変更する案ではなく、診断上の比較シナリオ**（event duration / order / 実 plan は触らない）。
 *
 * ★CEO 制約（2026-06-09）厳守:
 *   - pure / local / read-only / UI なし / Day Rehearsal 本流反映なし / 実 store・予定・input を mutate しない。
 *   - 「最適案」や断定にしない（どれが良いと決めない・neutral な比較）。
 *   - 数字 / % / score / probability を出さない。「失敗/危険/X分/30%/スコア」禁止。
 *   - ★差が弱い / 3 案が同じ / unknown / evidence 不足 → 沈黙（contrast gate）。
 *
 * ★honesty 機構（数値捏造なし・slice 2 と同型）:
 *   - protective: tight な所（insufficient buffer）を「守る」= sufficient へ（slack/shortfall は null）。
 *   - aggressive: 余白/recovery を「薄く見る」= sufficient buffer を insufficient へ + recovery 素材(slack/gap) を null。
 *   - baseline: 現状のまま。いずれも **observed margin への診断的再解釈**（event/order は不触）。
 *   rehearseDay の category/level ロジックが差を計算。差は **独立 day-level 指標**(outlook/peakStrain level/
 *   convergencePoints 件数/recoveryWindows 件数)で数え、≥2 整合した時だけ compared。
 *
 * pure / READ のみ / Date 不使用 / DB・network なし / 予定を動かさない。
 */
import { rehearseDay } from "@/lib/plan/dayRehearsal/dayRehearsal";
import {
  DEFAULT_REHEARSAL_CONFIG,
  type DayRehearsalConfig,
  type RehearsalInput,
  type Evidence,
} from "@/lib/plan/dayRehearsal/dayRehearsalTypes";
import {
  magnitudeWord,
  outlookWorseningWord,
  isLevelWorsened,
} from "@/lib/plan/dayRehearsal/whatIfMagnitude";

/** ★scenario comparison flag（**default OFF**・dev-only・将来の配線用）。production hard block。 */
export const DAY_REHEARSAL_SCENARIO_COMPARISON_ENABLED = false;
export function isScenarioComparisonEnabled(): boolean {
  return DAY_REHEARSAL_SCENARIO_COMPARISON_ENABLED && process.env.NODE_ENV !== "production"; // ★production hard block
}

/** 診断レンズ（予定変更でない）。 */
export type ComparisonStance = "protective" | "baseline" | "aggressive";

export type ScenarioComparisonStatus = "compared" | "identical" | "insufficient";

export interface ScenarioComparisonResult {
  readonly status: ScenarioComparisonStatus;
  /** 「手堅い（慎重な）見方では…」（compared かつ該当時のみ・他は null）。 */
  readonly protectiveNote: string | null;
  /** 「積極的（思い切った・冒険的な）見方では…」（compared かつ該当時のみ・他は null）。 */
  readonly aggressiveNote: string | null;
  /** 整合した差分シグナル数（internal）。 */
  readonly coherentSignals: number;
  readonly evidence: Evidence;
}

function evidenceOf(basis: string[], known: string[], unknown: string[], inferred: string[]): Evidence {
  return { basis, known, unknown, inferred };
}

/**
 * ★stance を観測 margin に適用した **新** RehearsalInput（immutable・event/order を触らない・数値捏造なし）。
 */
export function applyStance(input: RehearsalInput, stance: ComparisonStance): RehearsalInput {
  if (stance === "baseline") return input;
  const steps = input.steps.map((s) => {
    const t = s.transitionAfter;
    if (!t) return s;
    if (stance === "protective") {
      // 手堅い: tight な所を守る（insufficient→sufficient・数値は null）
      if (t.bufferStatus !== "insufficient") return s;
      return { ...s, transitionAfter: { ...t, bufferStatus: "sufficient" as const, slackMin: null, shortfallMin: null } };
    }
    // aggressive: 余白/recovery を薄く（sufficient→insufficient + recovery 素材 null）
    if (t.bufferStatus !== "sufficient") return s;
    return { ...s, transitionAfter: { ...t, bufferStatus: "insufficient" as const, slackMin: null, shortfallMin: null, gapMin: null } };
  });
  return { ...input, steps };
}

/**
 * ★core: 3 レンズで比較（pure・未配線）。protective↔aggressive の **独立 day-level 差**が ≥2 整合した時のみ compared。
 *   3 案がほぼ同じ → identical / unknown → insufficient。いずれも数字を出さず、最適案も断定もしない。
 */
export function compareScenarios(
  input: RehearsalInput,
  config: DayRehearsalConfig = DEFAULT_REHEARSAL_CONFIG,
): ScenarioComparisonResult {
  const baseline = rehearseDay(input, config);
  if (baseline.viability.outlook === "unknown") {
    return { status: "insufficient", protectiveNote: null, aggressiveNote: null, coherentSignals: 0, evidence: evidenceOf([], [], ["1日の見通しを確かめる情報が不足"], []) };
  }
  const protective = rehearseDay(applyStance(input, "protective"), config);
  const aggressive = rehearseDay(applyStance(input, "aggressive"), config);

  // ── protective↔aggressive の独立 day-level 差（数字を使わず level/件数比較） ──
  const outlookSpread = outlookWorseningWord(protective.viability.outlook, aggressive.viability.outlook); // 積極的が際どい方向
  const strainSpread = isLevelWorsened(protective.peakStrain.level, aggressive.peakStrain.level);
  const convSpread = aggressive.convergencePoints.length > protective.convergencePoints.length;
  const recoverySpread = protective.recoveryWindows.length > aggressive.recoveryWindows.length;

  const coherentSignals = [Boolean(outlookSpread), strainSpread, convSpread, recoverySpread].filter(Boolean).length;

  if (coherentSignals < 2) {
    return { status: "identical", protectiveNote: null, aggressiveNote: null, coherentSignals, evidence: evidenceOf(["3つの見方に十分な差がない"], [], [], ["診断レンズ間の差は弱い（仮説）"]) };
  }

  // ── 手堅い側のノート（少なめに見える点）。★ラベルは「手堅い」を 1 つ採用（括弧で全列挙しない）。 ──
  let protectiveNote: string | null = null;
  if (convSpread) protectiveNote = "手堅い見方では、この前後の重なりは少なめに見えます。";
  else if (strainSpread) protectiveNote = "手堅い見方では、全体の負荷は控えめに見えます。";
  else if (recoverySpread) protectiveNote = "手堅い見方では、一息つける区間が多めに見えます。";

  // ── 積極的側のノート（際どくなる方向・magnitude は定性語）。★ラベルは「積極的」を 1 つ採用。 ──
  const aggMagnitude = outlookSpread ?? (strainSpread ? magnitudeWord(aggressive.peakStrain.level) : convSpread ? magnitudeWord("high") : null);
  const aggressiveNote = aggMagnitude
    ? `積極的な見方では、後半の見通しが${aggMagnitude}際どくなるかもしれません。`
    : null;

  const basis: string[] = [];
  if (outlookSpread) basis.push("見通しの違い");
  if (strainSpread) basis.push("負荷の違い");
  if (convSpread) basis.push("重なりやすさの違い");
  if (recoverySpread) basis.push("一息つける区間の違い");

  return {
    status: "compared",
    protectiveNote,
    aggressiveNote,
    coherentSignals,
    evidence: evidenceOf(basis, ["予定の並び", "移動の余白"], [], ["3つの診断レンズの比較（仮説・予定は変えない）"]),
  };
}

/**
 * ★result → 表示する定性ノート（hedge・数字なし・最適案/断定なし）。
 *   compared のときのみ非空。identical/insufficient → []（沈黙）。
 */
export function scenarioComparisonReasonLines(result: ScenarioComparisonResult): readonly string[] {
  if (result.status !== "compared") return [];
  return [result.protectiveNote, result.aggressiveNote].filter((x): x is string => Boolean(x));
}
