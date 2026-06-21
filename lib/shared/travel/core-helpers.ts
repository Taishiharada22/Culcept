/**
 * T1B — Travel core pure helpers（**additive pure helpers only**・未配線）
 *
 * 設計: docs/t1a-closeout-and-contract-alignment.md Part 5（T1B）+ CEO GO 2026-06-12
 *
 * 厳守:
 *   - **決定論 pure のみ**: Date.now / Math.random / process.env / fetch / DB・client import /
 *     app・route import を一切含まない。import は core-types（型 + as-const 定数）のみ。
 *   - solver / scoring / 経路・場所解決は**やらない**（T3+ の責務）。
 *   - **source-agnostic 規則**: helper は source の「形」を検証してよいが、source kind から
 *     traits / consent / priority / partner 性 / fairness を**推論してはならない**。
 *     旧 /talk pair は 1 つの source kind としてのみ扱い、特別扱いしない。
 */

import {
  CONSTRAINT_SEVERITIES,
  UNCERTAINTY_LEVELS,
  type BudgetBand,
  type ConstraintSeverity,
  type ParticipantSourceRef,
  type ReversalCost,
  type TravelConstraint,
  type TravelNode,
  type TravelParticipant,
  type TravelPlanWindow,
  type UncertaintyLevel,
} from "./core-types";

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

// ─────────────────────────────────────────────────────────────────────────────
// §1 Constraint severity ordering（Idea 5/13 の比較基盤）
// ─────────────────────────────────────────────────────────────────────────────

/** severity の強さ。大きいほど強い（red_line=3 … preference=0） */
export function severityRank(s: ConstraintSeverity): number {
  switch (s) {
    case "red_line":
      return 3;
    case "hard":
      return 2;
    case "soft":
      return 1;
    case "preference":
      return 0;
  }
}

/** comparator: 強い severity が先に来る（降順 sort 用）。同位は 0。 */
export function compareSeverityDesc(a: ConstraintSeverity, b: ConstraintSeverity): number {
  return severityRank(b) - severityRank(a);
}

/** a が min 以上の強さか */
export function isAtLeastSevere(a: ConstraintSeverity, min: ConstraintSeverity): boolean {
  return severityRank(a) >= severityRank(min);
}

/** リスト中の最強 severity（空は null） */
export function maxSeverity(list: readonly ConstraintSeverity[]): ConstraintSeverity | null {
  let best: ConstraintSeverity | null = null;
  for (const s of list) {
    if (best === null || severityRank(s) > severityRank(best)) best = s;
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 Visibility helpers（M5: private はプラン形に影響可・相手向け根拠には使用不可）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 制約の整合性: visibility="private" は owner.kind="participant" のときのみ意味を持つ。
 * （private + shared-owner は「誰の秘密か」が定義できない不整合）
 */
export function isCoherentConstraint(c: TravelConstraint): boolean {
  if (c.visibility === "private" && c.owner.kind !== "participant") return false;
  return true;
}

/**
 * viewer に見せてよい制約だけを返す（M5 の入力側フィルタ）:
 *   - shared は全員に可視
 *   - private は owner 本人（participantId 一致）にのみ可視
 *   - 不整合な制約（isCoherentConstraint=false）は誰にも見せない（fail-closed）
 * 注意: これは「説明・表示」用の可視性フィルタであり、ソルバは private も入力にしてよい。
 */
export function filterConstraintsForViewer(
  constraints: readonly TravelConstraint[],
  viewerParticipantId: string,
): TravelConstraint[] {
  return constraints.filter((c) => {
    if (!isCoherentConstraint(c)) return false;
    if (c.visibility === "shared") return true;
    return c.owner.kind === "participant" && c.owner.participantId === viewerParticipantId;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 BudgetBand normalization（Idea 7）
// ─────────────────────────────────────────────────────────────────────────────

/** lo<=hi・非負・confidence 0..1 を満たすか */
export function isValidBudgetBand(b: BudgetBand): boolean {
  return (
    Number.isFinite(b.lo) &&
    Number.isFinite(b.hi) &&
    b.lo >= 0 &&
    b.hi >= b.lo &&
    b.confidence >= 0 &&
    b.confidence <= 1
  );
}

/**
 * 正規化: lo/hi の入替（lo>hi なら swap）・負値の 0 クランプ・confidence の 0..1 クランプ・
 * 非有限値は 0 扱い。currency は JPY 固定（MVP）。新しいオブジェクトを返す（入力不変）。
 */
export function normalizeBudgetBand(b: BudgetBand): BudgetBand {
  const rawLo = Number.isFinite(b.lo) ? b.lo : 0;
  const rawHi = Number.isFinite(b.hi) ? b.hi : 0;
  const lo = Math.max(0, Math.min(rawLo, rawHi));
  const hi = Math.max(0, Math.max(rawLo, rawHi));
  return {
    lo,
    hi,
    confidence: clamp(Number.isFinite(b.confidence) ? b.confidence : 0, 0, 1),
    currency: "JPY",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §4 時刻・期間 validation（決定論。Date.now なし）
// ─────────────────────────────────────────────────────────────────────────────

export const MINUTES_PER_DAY = 1440;

/** 0–1439 の整数分か */
export function isValidMinuteOfDay(min: number): boolean {
  return Number.isInteger(min) && min >= 0 && min < MINUTES_PER_DAY;
}

/** start < end かつ両端が有効な分か */
export function isValidMinuteRange(startMin: number, endMin: number): boolean {
  return isValidMinuteOfDay(startMin) && isValidMinuteOfDay(endMin) && startMin < endMin;
}

/** 2 ノードの時間帯が重なるか（端点接触 = 重ならない） */
export function nodeRangesOverlap(a: Pick<TravelNode, "startMin" | "endMin">, b: Pick<TravelNode, "startMin" | "endMin">): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" 形式か（実在日チェックは UTC 再構成で行う） */
export function isValidIsoDate(date: string): boolean {
  if (!ISO_DATE_RE.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d)); // 決定論（現在時刻に依存しない）
  return utc.getUTCFullYear() === y && utc.getUTCMonth() === m - 1 && utc.getUTCDate() === d;
}

/** 2 つの ISO 日付の差（end - start・日数）。不正は null。決定論。 */
export function dateSpanDays(startDate: string, endDate: string): number | null {
  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) return null;
  const toUtc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(endDate) - toUtc(startDate)) / 86_400_000);
}

/** 計画窓の妥当性: single_day=実在日 / range=実在日・start<end・nights が日数差と一致 */
export function isValidPlanWindow(window: TravelPlanWindow): boolean {
  if (window.kind === "single_day") return isValidIsoDate(window.date);
  const span = dateSpanDays(window.startDate, window.endDate);
  return span !== null && span >= 1 && span === window.nights;
}

// ─────────────────────────────────────────────────────────────────────────────
// §5 Participant validation（source-agnostic・MVP 1–2 名）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 現 MVP（CoAlter / Travel-β）の参加者上限。
 * ★ CEO note 2026-06-12: これは**恒久的なアーキテクチャ制限ではない**。
 * 将来の group mode（3 名以上）は明示的な拡張パスとして残す——上限を広げる際は
 * この定数（と validateParticipantsForMvp）だけが変更点になるよう、他の helper・型は
 * participant 数に依存させないこと。
 */
export const MVP_MAX_PARTICIPANTS = 2;

export type ParticipantValidation =
  | { ok: true }
  | { ok: false; reason: "empty" | "mvp_limit" | "duplicate_participant_id" | "duplicate_user_id" | "invalid_source" };

/** source の**形**だけを検証する（kind ごとの必須 ID が非空文字列か）。kind の意味は解釈しない。 */
export function isValidParticipantSource(ref: ParticipantSourceRef): boolean {
  const nonEmpty = (s: string) => typeof s === "string" && s.length > 0;
  switch (ref.kind) {
    case "self":
      return nonEmpty(ref.userId);
    case "talk_pair_member":
      return nonEmpty(ref.pairStateId) && nonEmpty(ref.userId);
    case "culcept_relation":
      return nonEmpty(ref.relationId) && nonEmpty(ref.userId);
    case "plan_session":
      return nonEmpty(ref.planSessionId) && nonEmpty(ref.userId);
  }
}

/**
 * MVP の参加者集合検証: 1–2 名・participantId 重複なし・userId 重複なし・各 source の形が有効。
 * **source kind は判定に使わない**（どの kind の組合せでも同じ規則。consent / 優先度 /
 * partner 性 / fairness は別層の責務であり、ここからは何も推論されない）。
 */
export function validateParticipantsForMvp(
  participants: readonly TravelParticipant[],
): ParticipantValidation {
  if (participants.length === 0) return { ok: false, reason: "empty" };
  if (participants.length > MVP_MAX_PARTICIPANTS) return { ok: false, reason: "mvp_limit" };
  const pids = new Set<string>();
  const uids = new Set<string>();
  for (const p of participants) {
    if (pids.has(p.participantId)) return { ok: false, reason: "duplicate_participant_id" };
    pids.add(p.participantId);
    if (!isValidParticipantSource(p.source)) return { ok: false, reason: "invalid_source" };
    if (uids.has(p.source.userId)) return { ok: false, reason: "duplicate_user_id" };
    uids.add(p.source.userId);
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// §6 Uncertainty / ReversalCost normalization（low-risk のみ）
// ─────────────────────────────────────────────────────────────────────────────

const UNCERTAINTY_SET: ReadonlySet<string> = new Set(UNCERTAINTY_LEVELS);
const SEVERITY_SET: ReadonlySet<string> = new Set(CONSTRAINT_SEVERITIES);

/** type guard（unknown 入力の絞り込み。fallback の既定値判断はしない） */
export function isUncertaintyLevel(v: unknown): v is UncertaintyLevel {
  return typeof v === "string" && UNCERTAINTY_SET.has(v);
}

export function isConstraintSeverity(v: unknown): v is ConstraintSeverity {
  return typeof v === "string" && SEVERITY_SET.has(v);
}

/**
 * ReversalCost の正規化: fee があれば BudgetBand を正規化、deadline は ISO 日付として
 * 不正なら除去。cancellable=false のとき deadline/fee は意味を持たないため除去。
 * 入力不変・新オブジェクトを返す。
 */
export function normalizeReversalCost(r: ReversalCost): ReversalCost {
  if (!r.cancellable) return { cancellable: false };
  const out: ReversalCost = { cancellable: true };
  if (r.deadline !== undefined && isValidIsoDate(r.deadline)) out.deadline = r.deadline;
  if (r.fee !== undefined) out.fee = normalizeBudgetBand(r.fee);
  return out;
}
