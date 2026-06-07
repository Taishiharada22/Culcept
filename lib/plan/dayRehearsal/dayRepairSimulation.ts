/**
 * lib/plan/dayRehearsal/dayRepairSimulation.ts — What-if / Draft Preview v0（pure）
 *
 * 「その候補を**仮に採用したら** 1 日の見通しがどう変わるか」を、**予定を一切書き換えず**
 * counterfactual re-simulation（rehearseDay の再実行）で試算する pure layer。
 *
 * 不変原則（CEO 2026-06-08 GO・audit: `…-repair-simulation-v0-audit.md`）:
 *   - ★pure / READ のみ / Date 不使用 / 実予定変更なし / apply・DB write なし / UI なし。
 *   - ★数値を捏造しない: leave_earlier の counterfactual は対象 transition を
 *     bufferStatus="sufficient" + slackMin/shortfallMin=null（= 数値を作らず「解消できれば」を表現）に置換。
 *     before/after は **質的差分のみ**（level/outlook は internal・summary は仮説トーンの自然文）。
 *   - ★捏造しない: pure simulation できない候補は **不可として分類**（uncertain / ambiguous_target）。
 *     preserves（保全）は delta を作らない（diff=null）。protect は「守っても strain/friction は残る」を改善に偽らない。
 *   - generation（dayRepairCandidates）の targetStepIndex / kind を single source とする。
 */
import { rehearseDay } from "./dayRehearsal";
import {
  DEFAULT_REHEARSAL_CONFIG,
  type RehearsalInput,
  type RehearsalTransitionInput,
  type DayRehearsalConfig,
  type DayRehearsal,
  type EstimateLevel,
  type ViabilityOutlook,
  type ConvergenceFactor,
  type Evidence,
} from "./dayRehearsalTypes";
import type { DayRepairCandidate, DayRepairKind } from "./dayRepairCandidates";

/**
 * 候補を仮採用した場合の試算結果の分類。
 * - eases_conditionally: leave_earlier（余白不足が解消できれば緩む・条件付き・magnitude 未確定）。
 * - preserves:           protect_buffer / use_recovery_window（守れれば現状を保てる・改善でなく維持・delta なし）。
 * - uncertain:           confirm_uncertain（移動の余白が未確定 → 試算不可）。
 * - ambiguous_target:    reduce_density（対象 step が無い → 試算不可）。
 */
export type RepairSimulationStatus =
  | "eases_conditionally"
  | "preserves"
  | "uncertain"
  | "ambiguous_target";

/** before/after の**質的**差分（生数値なし。level/outlook は internal・UI 非表示）。 */
export interface RepairSimulationDiff {
  readonly targetStepIndex: number;
  /** 対象 step の convergence level（before→after・marker なしは null）。internal。 */
  readonly convergenceBefore: EstimateLevel | null;
  readonly convergenceAfter: EstimateLevel | null;
  /** counterfactual で解消された convergence factor（例: ["buffer_short"]）。 */
  readonly factorsResolved: readonly ConvergenceFactor[];
  /** 対象区間の慌ただしさが和らいだか（convergence level が下がった）。 */
  readonly localEased: boolean;
  /** day outlook（before→after）。internal。 */
  readonly outlookBefore: ViabilityOutlook;
  readonly outlookAfter: ViabilityOutlook;
  /** 1 日全体の見通しが改善方向に動いたか。 */
  readonly outlookEased: boolean;
}

export interface RepairSimulationResult {
  readonly kind: DayRepairKind;
  readonly status: RepairSimulationStatus;
  /** eases_conditionally / preserves = true、uncertain / ambiguous_target = false。 */
  readonly simulatable: boolean;
  readonly targetStepIndex: number | null;
  /** eases_conditionally のみ（preserves / 不可 は null=delta を作らない）。 */
  readonly diff: RepairSimulationDiff | null;
  /** UI 候補の自然文（仮説トーン・条件付き・生数値/level 名なし）。 */
  readonly summary: string;
  readonly evidence: Evidence;
}

// ───────────────────────── helpers（pure） ─────────────────────────

const CONVERGENCE_ORDER: Readonly<Record<EstimateLevel, number>> = { low: 0, moderate: 1, high: 2, unknown: -1 };
const OUTLOOK_ORDER: Readonly<Record<ViabilityOutlook, number>> = { holds: 0, tight: 1, breaks: 2, unknown: -1 };

/** counterfactual: 対象 transition の余白不足を「解消できれば」に置換（数値を作らない）。 */
function resolveBufferAt(input: RehearsalInput, i: number): RehearsalInput {
  const steps = input.steps.map((s, idx) => {
    if (idx !== i || !s.transitionAfter) return s;
    const t: RehearsalTransitionInput = { ...s.transitionAfter, bufferStatus: "sufficient", slackMin: null, shortfallMin: null };
    return { ...s, transitionAfter: t };
  });
  return { ...input, steps };
}

/** 改善方向に動いたか（unknown は比較対象外＝false）。 */
function eased(beforeOrder: number, afterOrder: number): boolean {
  if (beforeOrder < 0 || afterOrder < 0) return false;
  return afterOrder < beforeOrder;
}

// ───────────────────────── main（pure・predict でなく simulate） ─────────────────────────

/**
 * 候補を仮採用した場合の 1 日の見通し変化を、予定変更なしで試算する（pure・read-only）。
 * 入力は candidate を生成した **同一の** RehearsalInput（targetStepIndex が一致する前提）。
 */
export function previewRepairSimulation(
  input: RehearsalInput,
  candidate: DayRepairCandidate,
  config: DayRehearsalConfig = DEFAULT_REHEARSAL_CONFIG,
): RepairSimulationResult {
  const { kind, targetStepIndex } = candidate;

  // ── 不可（試算できない）: 捏造せず分類 ──
  // reduce_density: 対象 step が無い（HARD GATE: 対象 step が無いなら停止＝不可分類）。
  if (kind === "reduce_density" || targetStepIndex == null) {
    return {
      kind, status: "ambiguous_target", simulatable: false, targetStepIndex: targetStepIndex ?? null, diff: null,
      summary: "どの予定を軽くするかが定まっていないので、ここは試算できません。",
      evidence: { basis: ["対象 step なし"], known: [], unknown: ["どの予定を軽くするか未特定"], inferred: [] },
    };
  }
  // confirm_uncertain: 移動の余白が未確定 → どちらにも捏造不可。
  if (kind === "confirm_uncertain") {
    return {
      kind, status: "uncertain", simulatable: false, targetStepIndex, diff: null,
      summary: "移動の余白がまだ未確定なので、ここは試算できません。確認できると、見通しが立てやすくなりそうです。",
      evidence: { basis: ["feasibility not_applicable"], known: [], unknown: ["移動の余白が未確定"], inferred: [] },
    };
  }

  // ── 保全（preserves）: delta を作らない（改善を捏造しない） ──
  if (kind === "protect_buffer") {
    return {
      kind, status: "preserves", simulatable: true, targetStepIndex, diff: null,
      summary: "この前後の余白はいまのところ確保できています。守れれば、この状態を保てそうです。",
      evidence: { basis: ["余白は不足していない"], known: ["この前後の余白は確保されている"], unknown: [], inferred: ["守れた場合に保てる (hypothesis)"] },
    };
  }
  if (kind === "use_recovery_window") {
    return {
      kind, status: "preserves", simulatable: true, targetStepIndex, diff: null,
      summary: "この一息つけそうな区間はいまのところ確保できています。守れれば、次の予定に向けて保てそうです。",
      evidence: { basis: ["一息つけそうな区間"], known: ["余白が確保されている"], unknown: [], inferred: ["守れた場合に保てる (hypothesis)"] },
    };
  }

  // ── leave_earlier: counterfactual re-simulation（唯一 before/after delta） ──
  const step = input.steps[targetStepIndex];
  const t = step?.transitionAfter ?? null;
  // 防御的: 対象が無い / 余白不足でない（generation は insufficient を保証）→ 試算不可（捏造しない）。
  if (!step || !t || t.bufferStatus !== "insufficient") {
    return {
      kind, status: "uncertain", simulatable: false, targetStepIndex, diff: null,
      summary: "対象の余白の状態が確認できないので、ここは試算できません。",
      evidence: { basis: ["target 不整合"], known: [], unknown: ["対象 transition の余白状態"], inferred: [] },
    };
  }

  const before = rehearseDay(input, config);
  const after = rehearseDay(resolveBufferAt(input, targetStepIndex), config);

  const cBefore = before.steps[targetStepIndex]?.convergence?.level ?? null;
  const cAfter = after.steps[targetStepIndex]?.convergence?.level ?? null;
  const fBefore = before.steps[targetStepIndex]?.convergence?.factors ?? [];
  const fAfter = after.steps[targetStepIndex]?.convergence?.factors ?? [];
  const factorsResolved = fBefore.filter((f) => !fAfter.includes(f));

  const localEased = eased(
    cBefore ? CONVERGENCE_ORDER[cBefore] : -1,
    cAfter ? CONVERGENCE_ORDER[cAfter] : -1,
  ) || (isMarker(before, targetStepIndex) && !isMarker(after, targetStepIndex));
  const outlookEased = eased(OUTLOOK_ORDER[before.viability.outlook], OUTLOOK_ORDER[after.viability.outlook]);

  const diff: RepairSimulationDiff = {
    targetStepIndex,
    convergenceBefore: cBefore,
    convergenceAfter: cAfter,
    factorsResolved,
    localEased,
    outlookBefore: before.viability.outlook,
    outlookAfter: after.viability.outlook,
    outlookEased,
  };

  return {
    kind, status: "eases_conditionally", simulatable: true, targetStepIndex, diff,
    summary: leaveEarlierSummary(localEased, outlookEased),
    evidence: {
      basis: ["対象区間の余白が不足", "counterfactual: 余白不足を解消"],
      known: ["移動の余白が不足 (feasibility insufficient)"],
      unknown: ["どのくらい早めれば足りるか (magnitude)"],
      inferred: ["余白不足が解消した場合の見通し (hypothesis)"],
    },
  };
}

/** その step に convergence marker（level high）が立っているか。 */
function isMarker(r: DayRehearsal, i: number): boolean {
  return r.convergencePoints.includes(i);
}

/** leave_earlier の自然文（仮説トーン・条件付き・生数値/level 名なし）。 */
function leaveEarlierSummary(localEased: boolean, outlookEased: boolean): string {
  if (!localEased) {
    return "出発を少し早めても、この前後の慌ただしさは大きくは変わらないかもしれません。";
  }
  if (outlookEased) {
    return "出発を少し早めて余白の不足が解消できれば、この前後の慌ただしさが和らいで、その日の見通しにもゆとりが出そうです。（どのくらい早めれば足りるかは未確定です）";
  }
  return "出発を少し早めて余白の不足が解消できれば、この前後の慌ただしさは和らぎそうです。ただ、ほかにも余白の不足があり、その日全体ではまだゆとりは出にくいかもしれません。";
}

/** 複数候補の一括試算（read-only・順序保持）。 */
export function previewRepairSimulations(
  input: RehearsalInput,
  candidates: readonly DayRepairCandidate[],
  config: DayRehearsalConfig = DEFAULT_REHEARSAL_CONFIG,
): readonly RepairSimulationResult[] {
  return candidates.map((c) => previewRepairSimulation(input, c, config));
}
