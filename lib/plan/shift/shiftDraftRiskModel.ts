/**
 * シフト下書き risk model（pure・golden-free）— SR B1b-2A
 *
 * 役割: VLM 下書き（draft cells）に対し、「**ここを原稿と照合してください**」という
 *   review hint を出す。**誤りの確定検出ではない**（本番には golden が無いので silent shift を
 *   確定できない）。人が source-of-truth review で確定する前提の補助。
 *
 * 重要原則（CEO 補正・2026-05-31）:
 *   - golden 非依存（正解を一切参照しない）。入力は draft cells + 辞書 + daysInMonth のみ。
 *   - 表現は needs_review / suspicious / confirm 寄り。error / failed / wrong は使わない。
 *   - severity 2 分:
 *       hard = 保存前に解消必須（missing day / duplicate day / unknown(unresolved/invalid) code）
 *       soft = 確認を促すが、ユーザー確認後は保存可（blank-risk / adjacent duplicate /
 *              suspicious shift / low confidence / chunk boundary）
 *   - adjacent duplicate は **soft**（HREQ/HREQ・L/L・H/H は本当に連続し得る → block しない）。
 *
 * 不変原則: pure（IO / LLM / DB / Date / random / env なし）、throw しない。UI 非接続。
 */

import {
  lookupCode,
  normalizeRawCode,
  type ShiftCodeDictionary,
} from "./shiftCodeDictionary";
import { detectConfusableCells } from "./shiftConfusableCodes";

/** review hint の重大度。 */
export type RiskSeverity = "hard" | "soft";

/** review hint の種別。 */
export type RiskKind =
  // hard（保存前に解消必須）
  | "missing_day"
  | "duplicate_day"
  | "unknown_code"
  // soft（確認後は保存可）
  | "blank_risk"
  | "adjacent_duplicate"
  | "suspicious_shift"
  | "low_confidence"
  | "chunk_boundary"
  // soft（A1B: 似たコードの見間違い。confidence に関係なく要確認）
  | "confusable_code";

/** 下書き 1 セル（day-keyed・golden なし）。 */
export interface DraftRiskCell {
  day: number;
  rawCode: string;
  /** VLM 信頼度（任意・0..1） */
  confidence?: number | null;
}

/** 1 件の review hint。 */
export interface RiskHint {
  kind: RiskKind;
  severity: RiskSeverity;
  /** 該当する日番号（昇順・重複なし） */
  dayNumbers: number[];
  /** user-facing safe copy（needs_review トーン・error/wrong 不使用） */
  message: string;
}

export interface DraftRiskReport {
  hints: RiskHint[];
  hardCount: number;
  softCount: number;
  /** hard hint が 1 つでもあれば保存前に解消必須。 */
  hasBlockingRisk: boolean;
}

export interface DraftRiskOptions {
  /** その月の日数（coverage 判定に必須）。 */
  daysInMonth: number;
  /** これ未満の confidence を low_confidence とする（既定 0.7）。 */
  lowConfidenceThreshold?: number;
  /** chunk の境目（例: [15] = 1-15 / 16-末 の seam）。指定時のみ chunk_boundary hint。 */
  chunkBoundaries?: number[];
}

export const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.7;

const HARD_KINDS: ReadonlySet<RiskKind> = new Set<RiskKind>([
  "missing_day",
  "duplicate_day",
  "unknown_code",
]);

/** 日番号リストを安全な文言にする（多すぎる時は省略）。 */
function formatDays(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length <= 8) return sorted.map((d) => `${d}日`).join("、");
  return `${sorted.slice(0, 8).map((d) => `${d}日`).join("、")} ほか${sorted.length - 8}件`;
}

function hint(kind: RiskKind, days: number[], message: string): RiskHint {
  const dayNumbers = [...new Set(days)].sort((a, b) => a - b);
  return {
    kind,
    severity: HARD_KINDS.has(kind) ? "hard" : "soft",
    dayNumbers,
    message,
  };
}

/**
 * draft cells に対し golden-free に review hint を算出する（pure）。
 */
export function detectDraftRisks(
  cells: DraftRiskCell[],
  dictionary: ShiftCodeDictionary,
  options: DraftRiskOptions
): DraftRiskReport {
  const N = options.daysInMonth;
  const threshold =
    options.lowConfidenceThreshold ?? DEFAULT_LOW_CONFIDENCE_THRESHOLD;
  const hints: RiskHint[] = [];

  // 日番号 → 出現回数 / 正規化コード
  const countByDay = new Map<number, number>();
  for (const c of cells) countByDay.set(c.day, (countByDay.get(c.day) ?? 0) + 1);

  // ── hard ──
  // missing day（1..N で欠け）
  const missing: number[] = [];
  for (let d = 1; d <= N; d++) if (!countByDay.has(d)) missing.push(d);
  if (missing.length)
    hints.push(
      hint("missing_day", missing, `読み取りが欠けている日があります（${formatDays(missing)}）。原稿を確認して補ってください。`)
    );

  // duplicate day
  const dups = [...countByDay.entries()].filter(([, n]) => n > 1).map(([d]) => d);
  if (dups.length)
    hints.push(
      hint("duplicate_day", dups, `重複して読まれた日があります（${formatDays(dups)}）。原稿を確認してください。`)
    );

  // unknown（辞書未登録・非空）= unresolved/invalid
  const unknownDays = cells
    .filter((c) => {
      const norm = normalizeRawCode(c.rawCode);
      return norm !== "" && lookupCode(dictionary, c.rawCode) === null;
    })
    .map((c) => c.day);
  if (unknownDays.length)
    hints.push(
      hint("unknown_code", unknownDays, `辞書にないコードがあります（${formatDays(unknownDays)}）。原稿と照合して修正してください。`)
    );

  // ── soft ──
  // low confidence
  const lowConf = cells
    .filter((c) => typeof c.confidence === "number" && (c.confidence ?? 1) < threshold)
    .map((c) => c.day);
  if (lowConf.length)
    hints.push(
      hint("low_confidence", lowConf, `読み取り信頼度が低い日があります（${formatDays(lowConf)}）。原稿と照合してください。`)
    );

  // blank-risk（空欄として読まれた日）
  const blanks = cells
    .filter((c) => normalizeRawCode(c.rawCode) === "")
    .map((c) => c.day);
  if (blanks.length)
    hints.push(
      hint("blank_risk", blanks, `空欄として読まれた日があります（${formatDays(blanks)}）。原稿で空欄か確認してください。`)
    );

  // suspicious shift（空欄の直後＝前詰めずれが起きやすい窓 [E+1, E+2]）
  const shiftDays: number[] = [];
  for (const e of blanks) {
    for (const d of [e + 1, e + 2]) if (d >= 1 && d <= N) shiftDays.push(d);
  }
  if (shiftDays.length)
    hints.push(
      hint("suspicious_shift", shiftDays, `空欄の直後でずれが起きやすい箇所です（${formatDays(shiftDays)}）。原稿と照合してください。`)
    );

  // adjacent duplicate run（連続同一・非空。本当に連続し得るので soft）
  const sorted = [...cells].sort((a, b) => a.day - b.day);
  const adjDays: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const code = normalizeRawCode(sorted[i].rawCode);
    if (code === "") continue;
    let j = i;
    while (
      j + 1 < sorted.length &&
      sorted[j + 1].day === sorted[j].day + 1 &&
      normalizeRawCode(sorted[j + 1].rawCode) === code
    )
      j++;
    if (j > i) for (let k = i; k <= j; k++) adjDays.push(sorted[k].day);
    i = j;
  }
  if (adjDays.length)
    hints.push(
      hint("adjacent_duplicate", adjDays, `同じコードが連続しています（${formatDays(adjDays)}）。原稿と照合してください。`)
    );

  // chunk boundary（seam の前後）
  const boundaryDays: number[] = [];
  for (const b of options.chunkBoundaries ?? [])
    for (const d of [b, b + 1]) if (d >= 1 && d <= N) boundaryDays.push(d);
  if (boundaryDays.length)
    hints.push(
      hint("chunk_boundary", boundaryDays, `読み取りの境目です（${formatDays(boundaryDays)}）。前後のずれがないか確認してください。`)
    );

  // confusable code（A1B）= 似たコードの見間違い（E↔E-18 等）。**confidence に関係なく** soft 要確認。
  //   高 conf 誤読（F5）は既存の低 conf / 空欄隣接 / 未知コードでは捕まらないため、ここで要確認に回す。
  const confusableDays = detectConfusableCells(
    cells.map((c) => ({ day: c.day, rawCode: c.rawCode }))
  ).map((h) => h.day);
  if (confusableDays.length)
    hints.push(
      hint(
        "confusable_code",
        confusableDays,
        `似た形で紛らわしいコードの日があります（${formatDays(confusableDays)}）。原稿と照合してください。`
      )
    );

  const hardCount = hints.filter((h) => h.severity === "hard").length;
  const softCount = hints.length - hardCount;
  return { hints, hardCount, softCount, hasBlockingRisk: hardCount > 0 };
}
