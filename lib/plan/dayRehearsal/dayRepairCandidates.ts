/**
 * lib/plan/dayRehearsal/dayRepairCandidates.ts — Day Rehearsal Repair Candidate v0（pure・read-only）
 *
 * Day Rehearsal が出した「詰まり / 移動余白不足 / 未確定 / 一息できる区間 / 密度」から、
 * ユーザーへの **read-only な対処候補** を生成する。★予定変更・自動修正・保存・DB 書き込み・Repair 実行は一切しない。
 *
 * 不変原則（CEO/GPT 2026-06-07 GO・Aneurasync 哲学=最適化でなく自己理解→穏やかな示唆）:
 *   - 候補は **suggestion トーンのみ**（「〜するとよさそう」「〜できると安心かもしれません」）。命令・断定・警告にしない。
 *   - 「危険」「警告」「失敗」「疲れる」「壊れる」「絶対」「すべき」禁止。生スコア・係数・内部点数を出さない。
 *   - 各候補は **evidence trace** を持つ（basis/known/unknown/inferred）。
 *   - **根拠が弱い場合は候補を出さない**（viability unknown → 空配列・シグナルが無い step は候補なし）。
 *   - pure / Date 不使用 / 予定を動かさない / UI 配線しない。
 */
import type { DayRehearsal, Evidence } from "./dayRehearsalTypes";

/** 対処候補の種類（read-only・実処理なし）。 */
export type DayRepairKind =
  | "protect_buffer" // この前後は余白を守るとよさそう
  | "leave_earlier" // 出発を少し早める余地があるかも
  | "confirm_uncertain" // 未確定の移動/余白を確認するとよさそう
  | "use_recovery_window" // ここで一息入れられそう
  | "reduce_density"; // 予定が立て込む区間を軽くできるかも

export interface DayRepairCandidate {
  readonly kind: DayRepairKind;
  /** 自然言語の示唆（suggestion トーン・断定/命令/警告なし・生スコアなし）。 */
  readonly suggestion: string;
  /** 該当 transition/step の index（全体的な候補は null）。 */
  readonly targetStepIndex: number | null;
  /** 根拠 trace（basis/known/unknown/inferred）。 */
  readonly evidence: Evidence;
}

/** 任意の文脈（recovery は WPM-2b の raw-slack 由来 set を渡せる。無ければ rehearsal.recoveryWindows を使う）。 */
export interface DayRepairContext {
  readonly recoverySteps?: ReadonlySet<number>;
}

const COPY: Readonly<Record<DayRepairKind, string>> = {
  protect_buffer: "この前後は余白を守ると、予定が重なりにくそうです",
  leave_earlier: "ここは出発を少し早める余地があるかもしれません",
  confirm_uncertain: "未確定の移動の余白を確認できると安心かもしれません",
  use_recovery_window: "ここで一息入れられそうです",
  reduce_density: "予定が立て込む区間を少し軽くできると、ゆとりが生まれそうです",
};

/**
 * Day Rehearsal 出力から read-only な対処候補を生成（純粋・予定変更なし）。
 * - viability unknown（入力不足）→ 空配列（根拠が弱いので出さない）。
 * - leave_earlier: 移動余白が insufficient な transition。
 * - protect_buffer: 重なりやすい(convergence)が insufficient ではない transition（leave_earlier と排他）。
 * - confirm_uncertain: 移動余白が確認できない(not_applicable)な transition のみ（最終 event=friction null は除外）。
 * - use_recovery_window: 一息つけそうな step（context.recoverySteps 優先・無ければ recoveryWindows）。
 * - reduce_density: density が packed のとき全体に 1 件。
 */
export function generateDayRepairCandidates(
  rehearsal: DayRehearsal,
  context?: DayRepairContext,
): readonly DayRepairCandidate[] {
  const candidates: DayRepairCandidate[] = [];

  // 入力不足（見通し不能）→ 候補を出さない。
  if (rehearsal.viability.outlook === "unknown") return candidates;

  const convergenceSet = new Set<number>(rehearsal.convergencePoints);
  const recoverySet = context?.recoverySteps ?? new Set<number>(rehearsal.recoveryWindows);

  for (const step of rehearsal.steps) {
    const i = step.stepIndex;

    // 移動余白が不足 → 出発を早める余地（最も actionable）。
    if (step.bufferStatus === "insufficient") {
      candidates.push({
        kind: "leave_earlier",
        suggestion: COPY.leave_earlier,
        targetStepIndex: i,
        evidence: { basis: ["feasibility insufficient"], known: ["移動の余白が不足"], unknown: [], inferred: [] },
      });
    } else if (convergenceSet.has(i)) {
      // 重なりやすい（余白不足ではない）→ 余白を守る。
      const factors = step.convergence?.factors ?? [];
      candidates.push({
        kind: "protect_buffer",
        suggestion: COPY.protect_buffer,
        targetStepIndex: i,
        evidence: { basis: factors.map((f) => f), known: [], unknown: [], inferred: ["重なりやすさ (hypothesis)"] },
      });
    }

    // 移動余白が確認できない（transition のみ・最終 event は除外）→ 確認候補。
    if (step.bufferStatus === "not_applicable" && step.friction !== null) {
      candidates.push({
        kind: "confirm_uncertain",
        suggestion: COPY.confirm_uncertain,
        targetStepIndex: i,
        evidence: { basis: ["feasibility not_applicable"], known: [], unknown: ["移動の余白が未確定"], inferred: [] },
      });
    }

    // 一息つけそうな区間 → 活用候補。
    if (recoverySet.has(i)) {
      candidates.push({
        kind: "use_recovery_window",
        suggestion: COPY.use_recovery_window,
        targetStepIndex: i,
        evidence: { basis: ["recovery window"], known: ["余白が確保されている"], unknown: [], inferred: [] },
      });
    }
  }

  // 予定が立て込む（packed）→ 全体に 1 件（軽くする余地）。
  if (rehearsal.density === "packed") {
    candidates.push({
      kind: "reduce_density",
      suggestion: COPY.reduce_density,
      targetStepIndex: null,
      evidence: { basis: ["density packed"], known: ["予定の密度が高め"], unknown: [], inferred: [] },
    });
  }

  return candidates;
}
