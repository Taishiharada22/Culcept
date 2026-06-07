/**
 * lib/plan/dayRehearsal/dayRepairCandidates.ts — Day Rehearsal Repair Candidate v1（pure・read-only）
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
 *
 * v1（target-aware / evidence-aware copy・2026-06-07 GO）— ★logic 不変・COPY 文のみ改善:
 *   - 各 kind の構造的意味に grounded した具体化のみ（生数値・factor 差分は production で無根拠＝使わない）:
 *     leave_earlier / confirm_uncertain は **必ず transition** にだけ出る → 「この移動の…」と言える。
 *     use_recovery_window は **gap（一息）** にだけ出る → 「この一息つけそうな区間…」と言える。
 *   - What-if preview の distinct value（clarity=見通し / utilization=次に入りやすい）を **candidate 文へ統合**
 *     （preview UI を増やさず候補文を自己完結させる方針）。previewRepairEffect は保持（inert）。
 *   - dedup（2026-06-07 GO・案A）: 同 kind の候補は kind 固定文で**同一文が並ぶ**ため、**display 段で代表 1 件に集約**
 *     （`dedupeRepairCandidates`・generation は full-fidelity 維持・将来 per-row anchoring と両立）。
 *   - ★production（Option D=buildRehearsalInputFromDisplay）では bufferMin=null・friction 一律 moderate・
 *     recovery 一律 low（recoveryWindows 空・use_recovery_window は raw 由来 recoverySteps 経由で到達）。
 *     **protect_buffer は Option D 到達不能**（convergencePoint=高 conv は buffer_short 必須＝insufficient→leave_earlier 分岐）。
 *     full path（buildRehearsalInput）でのみ到達するため copy は generic 維持（factor 差分の dead-path 複雑化を避ける）。
 */
import type { DayRehearsal, Evidence } from "./dayRehearsalTypes";

/** 対処候補の種類（read-only・実処理なし）。 */
export type DayRepairKind =
  | "protect_buffer" // 重なりやすい前後の余白を守るとよさそう（full path のみ到達）
  | "leave_earlier" // この移動の前後は出発を少し早める余地があるかも
  | "confirm_uncertain" // 未確定の移動の余白を確認すると見通しが立てやすそう
  | "use_recovery_window" // この一息つけそうな区間をそのまま残せるとよさそう
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
  // protect_buffer: full path のみ到達（Option D 不到達）。generic 維持。
  protect_buffer: "この前後は余白を守ると、予定が重なりにくそうです",
  // leave_earlier: 必ず transition（insufficient な移動）→「この移動」と grounded に具体化。
  leave_earlier: "この移動の前後は、出発を少し早める余地があるかもしれません",
  // confirm_uncertain: 必ず transition（travel 未確定の移動）。clarity preview の value（見通し）を統合。
  confirm_uncertain: "未確定の移動の余白を確認できると、見通しが立てやすくなりそうです",
  // use_recovery_window: 必ず gap（一息）。utilization preview の value（次に入りやすい）を統合。
  use_recovery_window: "この一息つけそうな区間は、そのまま残せると、次の予定に入りやすそうです",
  // reduce_density: 予定変更に見えやすいため弱め維持（具体的な削除/変更を促さない）。
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

/**
 * 表示用 dedup（純粋・read-only・案A 2026-06-07 GO）: **同 kind を代表 1 件に集約**する。
 * - 候補文は kind 固定（v1）で「どの移動か」を指さない（anchor 無し）→ 同一文の重複は区別不能なノイズ。
 * - **先頭（入力順=step 順の最初）を代表として残す**。代表の suggestion/targetStepIndex/evidence をそのまま保持（copy 無改変）。
 * - generation（generateDayRepairCandidates）は full-fidelity を維持（per-step 全件）。集約は **display 専用**
 *   （将来 per-marker で候補を timeline 行に紐付ける拡張と両立させるため）。
 * - 使い方は `prioritizeRepairCandidates(dedupeRepairCandidates(generateDayRepairCandidates(...)), 3)`。
 *   dedup → prioritize の順（cap の前に dedup）で top-N が「N 行」でなく「N 種の示唆」になる。
 */
export function dedupeRepairCandidates(
  candidates: readonly DayRepairCandidate[],
): readonly DayRepairCandidate[] {
  const seen = new Set<DayRepairKind>();
  const out: DayRepairCandidate[] = [];
  for (const c of candidates) {
    if (seen.has(c.kind)) continue; // 同 kind は先頭のみ採用
    seen.add(c.kind);
    out.push(c);
  }
  return out;
}

/** 表示優先度（小さいほど上位）。leave_earlier > protect_buffer > confirm_uncertain > use_recovery_window > reduce_density。 */
const REPAIR_PRIORITY: Readonly<Record<DayRepairKind, number>> = {
  leave_earlier: 0,
  protect_buffer: 1,
  confirm_uncertain: 2,
  use_recovery_window: 3,
  reduce_density: 4,
};

/**
 * 表示用に優先度でソートし上位 `limit` 件に絞る（純粋・read-only）。
 * 同 kind 内は元の順序（step 順）を保つ stable sort。UI は上位 limit 件のみ表示。
 */
export function prioritizeRepairCandidates(
  candidates: readonly DayRepairCandidate[],
  limit = 3,
): readonly DayRepairCandidate[] {
  return candidates
    .map((c, i) => ({ c, i }))
    .sort((a, b) => REPAIR_PRIORITY[a.c.kind] - REPAIR_PRIORITY[b.c.kind] || a.i - b.i)
    .slice(0, Math.max(0, limit))
    .map((x) => x.c);
}
