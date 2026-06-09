/**
 * lib/plan/dayRehearsal/inverseWhatIf.ts — A3 What-if slice 2: inverse what-if（pure・未配線）
 *
 * ★目的: 「この保護（守る余白 / 一息つける区間）を**守らない**と、何が悪化しそうか」を、
 *   既存 `rehearseDay`（pure）の **counterfactual 再シミュレーション**で読む。
 *   ★悪化を作りに行かない。整合した悪化が複数見えた時だけ「守る意味」を定性語で説明し、それ以外は沈黙。
 *
 * ★CEO 補正（2026-06-09）を厳守:
 *   1. counterfactual は **typed scenario**（destructive mutation でない）。実 store/予定/UI/入力を一切 mutate しない
 *      （input.steps.map で新 input を immutable に構成。既存 resolveBufferAt と同パターン）。
 *   2. **coherence gate を強化**: outlook 悪化 / 負荷上昇 / 重なり増加 / 一息減少 の **複数(≥2)が整合**した時だけ emit。
 *   3. 出力は「悪化断定」でなく **「守る意味の説明」**（hedge・数字なし・「悪化/失敗/壊れる/危険/X分/%」禁止）。
 *
 * ★honesty 機構（rehearseDay 本体に基づく・数値を捏造しない）:
 *   - without_protect_buffer: bufferStatus "sufficient"→"insufficient"（slack/shortfall は **null**＝数値捏造なし）。
 *     rehearseDay は anyInsufficient(boolean) で outlook を holds→tight に動かす（category 由来・偽数値でない）。
 *   - without_recovery_window: recovery 素材（slackMin/gapMin）を **null** に（消費）。rehearseDay は累積 strain から
 *     recovery を引かなくなり負荷が上がる（L221）。
 *   - without_leave_earlier / without_lightening: base 入力から honest に表現できない（fabrication 回避）→ null → 沈黙。
 *
 * pure / READ のみ / Date 不使用 / DB・network なし / 予定を動かさない。
 */
import {
  rehearseDay,
} from "@/lib/plan/dayRehearsal/dayRehearsal";
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

/** ★inverse what-if flag（**default OFF**・dev-only・将来の配線用）。production hard block。 */
export const DAY_REHEARSAL_INVERSE_ENABLED = false;
export function isInverseWhatIfEnabled(): boolean {
  return DAY_REHEARSAL_INVERSE_ENABLED && process.env.NODE_ENV !== "production"; // ★production hard block
}

/** 守らない対象の typed scenario（実予定を壊す変更でない）。 */
export type CounterfactualScenarioKind =
  | "without_protect_buffer"
  | "without_recovery_window"
  | "without_leave_earlier"
  | "without_lightening";

export interface CounterfactualScenario {
  readonly kind: CounterfactualScenarioKind;
  readonly targetStepIndex: number;
}

export type InverseWhatIfStatus = "protect_matters" | "resilient" | "insufficient";

export interface InverseWhatIfResult {
  readonly scenario: CounterfactualScenario;
  readonly status: InverseWhatIfStatus;
  /** protect_matters のときのみ定性語（少し/中程度/大きめ）。他は null。 */
  readonly magnitude: string | null;
  /** 整合した悪化シグナル数（internal）。 */
  readonly coherentSignals: number;
  readonly evidence: Evidence;
}

function evidenceOf(basis: string[], known: string[], unknown: string[], inferred: string[]): Evidence {
  return { basis, known, unknown, inferred };
}

/** 対象 transition だけを fn で差し替えた **新** RehearsalInput（immutable・入力を mutate しない）。 */
function withTransitionAt(
  input: RehearsalInput,
  i: number,
  fn: (t: NonNullable<RehearsalInput["steps"][number]["transitionAfter"]>) => RehearsalInput["steps"][number]["transitionAfter"],
): RehearsalInput {
  const steps = input.steps.map((s, idx) => {
    if (idx !== i || !s.transitionAfter) return s;
    return { ...s, transitionAfter: fn(s.transitionAfter) };
  });
  return { ...input, steps };
}

/**
 * ★typed scenario から counterfactual 入力を構成（immutable・数値捏造なし）。
 *   表現できない / 守る対象が無い → null（沈黙）。
 */
export function buildCounterfactualInput(
  input: RehearsalInput,
  scenario: CounterfactualScenario,
): RehearsalInput | null {
  const i = scenario.targetStepIndex;
  const step = input.steps[i];
  const t = step?.transitionAfter ?? null;
  if (!t) return null;
  switch (scenario.kind) {
    case "without_protect_buffer":
      if (t.bufferStatus !== "sufficient") return null; // 守る余白が無い
      // ★余白を守らない = insufficient（数値は null＝捏造しない）
      return withTransitionAt(input, i, (tr) => ({ ...tr, bufferStatus: "insufficient", slackMin: null, shortfallMin: null }));
    case "without_recovery_window":
      if (t.bufferStatus !== "sufficient") return null;
      // ★一息を削る = recovery 素材（slack/gap）を消費（null＝捏造しない）
      return withTransitionAt(input, i, (tr) => ({ ...tr, slackMin: null, gapMin: null }));
    case "without_leave_earlier":
    case "without_lightening":
      return null; // base からは honest に表現できない（fabrication 回避）
  }
}

/**
 * ★core: inverse what-if（pure・未配線）。base と counterfactual を rehearse し、**整合した悪化**を数える。
 *   ≥2 で protect_matters（守る意味あり）・<2 は resilient・対象不適は insufficient。いずれも数字を出さない。
 */
export function previewInverseProtection(
  input: RehearsalInput,
  scenario: CounterfactualScenario,
  config: DayRehearsalConfig = DEFAULT_REHEARSAL_CONFIG,
): InverseWhatIfResult {
  const i = scenario.targetStepIndex;
  const base = rehearseDay(input, config);
  const insufficient = (reason: string): InverseWhatIfResult => ({
    scenario,
    status: "insufficient",
    magnitude: null,
    coherentSignals: 0,
    evidence: evidenceOf([], [], [reason], []),
  });

  const t = input.steps[i]?.transitionAfter ?? null;
  if (!t) return insufficient("対象区間に移動・余白の情報がありません");
  if (scenario.kind === "without_leave_earlier" || scenario.kind === "without_lightening") {
    return insufficient("この観点は既存の観測からは確かめられません");
  }
  if (scenario.kind === "without_protect_buffer" && t.bufferStatus !== "sufficient") {
    return insufficient("守る余白が見当たりません");
  }
  if (scenario.kind === "without_recovery_window" && !base.recoveryWindows.includes(i)) {
    return insufficient("一息つける区間としては観測されていません");
  }

  const cfInput = buildCounterfactualInput(input, scenario);
  if (!cfInput) return insufficient("反実仮想を構成できません");
  const cf = rehearseDay(cfInput, config);

  // ── 整合した悪化シグナル（★独立した day-level 指標のみ・悪化方向のみ・数字を使わず level/件数比較） ──
  //   同一因果の二重計上を避けるため、局所 step level でなく day-level（outlook/peakStrain level/
  //   convergencePoints 件数/recoveryWindows 件数）で数える。
  const outlookWorse = outlookWorseningWord(base.viability.outlook, cf.viability.outlook); // string | null
  const strainWorse = isLevelWorsened(base.peakStrain.level, cf.peakStrain.level);
  const convergenceIncreased = cf.convergencePoints.length > base.convergencePoints.length;
  const recoveryLost = cf.recoveryWindows.length < base.recoveryWindows.length;
  const convWorse = convergenceIncreased; // 別名（basis/magnitude 用に保持）

  const coherentSignals = [Boolean(outlookWorse), strainWorse, convWorse, recoveryLost].filter(Boolean).length;

  if (coherentSignals < 2) {
    return {
      scenario,
      status: "resilient",
      magnitude: null,
      coherentSignals,
      evidence: evidenceOf(["差がはっきりしない"], [], [], ["この保護を外しても整合した悪化は見えない（仮説）"]),
    };
  }

  // ── magnitude: outlook 悪化があればそれ、無ければ負荷 level / 新規 convergence(=high) を定性語に ──
  const magnitude =
    outlookWorse ?? (strainWorse ? magnitudeWord(cf.peakStrain.level) : convergenceIncreased ? magnitudeWord("high") : null);

  const basis: string[] = [];
  if (outlookWorse) basis.push("1日の見通しが悪化方向");
  if (strainWorse) basis.push("負荷の高まり");
  if (convWorse) basis.push("重なりやすさの増加");
  if (recoveryLost) basis.push("一息つける区間の減少");

  return {
    scenario,
    status: "protect_matters",
    magnitude,
    coherentSignals,
    evidence: evidenceOf(basis, ["予定の並び", "移動の余白"], [], ["反実仮想: この保護を外した場合（仮説）"]),
  };
}

/**
 * ★result → 「守る意味の説明」1 行（hedge・数字なし・断定しない）。
 *   protect_matters かつ magnitude あり のときのみ。resilient/insufficient → null（沈黙）。
 *   ★「悪化/失敗/壊れる/危険/X分/%」は使わない。
 */
export function inverseProtectionReasonLine(result: InverseWhatIfResult): string | null {
  if (result.status !== "protect_matters" || !result.magnitude) return null;
  switch (result.scenario.kind) {
    case "without_protect_buffer":
      return `この余白を外すと、この前後が${result.magnitude}慌ただしくなりそうです。`;
    case "without_recovery_window":
      return `この一息を削ると、後半の見通しが${result.magnitude}際どくなるかもしれません。`;
    default:
      return null;
  }
}
