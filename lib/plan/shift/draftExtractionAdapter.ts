/**
 * Draft extraction adapter — contract + runtime orchestrator（SR B1b-2C-4-c-1）
 *
 * 役割:
 *   - VLM 下書き抽出の **adapter contract**（DraftExtractionAdapter）を定義する。
 *   - **runtime orchestrator**（runDraftExtraction）: plan の各 chunk を adapter に直列で投げ、
 *     dayNumber で merge した最終 cells を返す。
 *
 * 重要原則（CEO 補正・2026-06-01）:
 *   - `runDraftExtraction` は Blob を受け取るため **pure ではない**（runtime 層）。
 *     pure なのは planner / prompt builder / cell mapper まで。
 *   - **dayNumber merge only / no repair / fail-hard**:
 *       - chunk 出力の day が requested dayRange 外 → fail
 *       - chunk 出力に missing day → fail
 *       - chunk 出力に duplicate day → fail
 *       - 全 chunk merge 後の重複 → fail（dayRange の重なりは plan が保証）
 *       - 1..daysInMonth の coverage が揃わなければ fail
 *     model 出力を後処理で都合よく直さない。失敗は人が再試行する。
 *   - **adapter 1つが throw したら全体を fail-hard**（後続 chunk を進めない）。
 *   - 本 module は **fetch / Gemini / Blob → base64 / Buffer.from / AbortController / retry /
 *     process.env / server-only / server action に触れない**。それらは 2C-4-c-2 以降。
 *
 * 不変原則: adapter / runtime のみ。UI / DB / 本流入口 に触れない。
 */

import type { DayKeyedShiftCell } from "./shiftExtractionContract";
import type { DraftExtractionPlan } from "./draftExtractionPlanner";

// ─────────────────────────────────────────────────────────────
// adapter contract（VLM 呼出は default 実装にのみ存在・本 module は型のみ）
// ─────────────────────────────────────────────────────────────

/** 1 chunk 分の adapter 入力（mode discriminated union）。Blob は adapter 層のみで扱う。 */
export type DraftExtractionChunkInput =
  | DraftExtractionChunkInputSplit
  | DraftExtractionChunkInputCombined;

/** split mode（既存・header + personRow の 2 枚を VLM に投げる）。 */
export interface DraftExtractionChunkInputSplit {
  mode: "split";
  headerBlob: Blob;
  personRowBlob: Blob;
  prompt: string;
  daysInMonth: number;
  dayRange: { from: number; to: number };
}

/** combined mode（SR B1b-2C-9-FIX-2・上下結合 1 枚を VLM に投げる）。 */
export interface DraftExtractionChunkInputCombined {
  mode: "combined";
  combinedBlob: Blob;
  prompt: string;
  daysInMonth: number;
  dayRange: { from: number; to: number };
}

/** adapter は 1 chunk を VLM に投げ、validated cells を返す。失敗時は throw（DraftExtractionError 推奨）。 */
export interface DraftExtractionAdapter {
  extractChunk(input: DraftExtractionChunkInput): Promise<DayKeyedShiftCell[]>;
}

// ─────────────────────────────────────────────────────────────
// error kind / class（safe error mapping）
// ─────────────────────────────────────────────────────────────

export type DraftExtractionErrorKind =
  | "timeout"
  | "rate_limited"
  | "model_error"
  | "invalid_response"
  | "auth_missing"
  /** chunk 出力が requested dayRange 外を含む / missing / duplicate */
  | "chunk_range_violation"
  /** 全 chunk merge 後の重複 */
  | "merge_duplicate"
  /** 1..daysInMonth coverage が揃わない */
  | "coverage_incomplete"
  | "unknown";

export class DraftExtractionError extends Error {
  readonly kind: DraftExtractionErrorKind;
  /** 失敗した chunk の index（chunk-scoped error のみ）。 */
  readonly chunkIndex?: number;
  /** 失敗した dayNumber 群（range violation / merge duplicate / coverage incomplete）。 */
  readonly affectedDays?: number[];

  constructor(
    kind: DraftExtractionErrorKind,
    message: string,
    extra?: { chunkIndex?: number; affectedDays?: number[] }
  ) {
    super(message);
    this.name = "DraftExtractionError";
    this.kind = kind;
    if (extra?.chunkIndex !== undefined) this.chunkIndex = extra.chunkIndex;
    if (extra?.affectedDays) this.affectedDays = [...extra.affectedDays];
  }
}

// ─────────────────────────────────────────────────────────────
// runtime orchestrator
// ─────────────────────────────────────────────────────────────

/** runtime 入力。mode に応じて画像 field が変わる。 */
export type RunDraftExtractionInput =
  | RunDraftExtractionInputSplit
  | RunDraftExtractionInputCombined;

export interface RunDraftExtractionInputSplit {
  plan: DraftExtractionPlan;
  mode: "split";
  headerBlob: Blob;
  personRowBlob: Blob;
}

export interface RunDraftExtractionInputCombined {
  plan: DraftExtractionPlan;
  mode: "combined";
  combinedBlob: Blob;
}

export interface RunDraftExtractionResult {
  /** dayNumber 昇順の merge 結果。 */
  cells: DayKeyedShiftCell[];
  /** 各 chunk から得た cell 数（chunk index 順）。 */
  perChunkCounts: number[];
}

/** chunk 出力の validate: day が dayRange 内 / missing 無し / duplicate 無し。 */
function validateChunkOutput(
  cells: readonly DayKeyedShiftCell[],
  dayRange: { from: number; to: number },
  chunkIndex: number
): void {
  const { from, to } = dayRange;
  const seen = new Set<number>();
  const offRange: number[] = [];
  const dup: number[] = [];
  for (const c of cells) {
    if (!Number.isInteger(c.day) || c.day < from || c.day > to) {
      offRange.push(c.day);
      continue;
    }
    if (seen.has(c.day)) dup.push(c.day);
    seen.add(c.day);
  }
  if (offRange.length) {
    throw new DraftExtractionError(
      "chunk_range_violation",
      `chunk ${chunkIndex}: dayRange ${from}-${to} 外の day が含まれます`,
      { chunkIndex, affectedDays: offRange.sort((a, b) => a - b) }
    );
  }
  if (dup.length) {
    throw new DraftExtractionError(
      "chunk_range_violation",
      `chunk ${chunkIndex}: 同一 day が重複しています`,
      { chunkIndex, affectedDays: [...new Set(dup)].sort((a, b) => a - b) }
    );
  }
  // missing チェック
  const missing: number[] = [];
  for (let d = from; d <= to; d++) if (!seen.has(d)) missing.push(d);
  if (missing.length) {
    throw new DraftExtractionError(
      "chunk_range_violation",
      `chunk ${chunkIndex}: dayRange ${from}-${to} に未出力の day があります`,
      { chunkIndex, affectedDays: missing }
    );
  }
}

/**
 * 全 chunk を **直列**で adapter に投げ、dayNumber で merge。
 *   - 直列実行（並列にしない＝rate limit 緩和 + 失敗時の挙動が明確）
 *   - 1 chunk でも throw したら**そのまま伝播**（fail-hard・後続 chunk 進めない）
 *   - chunk 出力の range / missing / duplicate を adapter 通過後に検証
 *   - merge 後の重複 / coverage 不足を最終検証
 *   - **後処理で都合よく補正しない**（CEO 補正）
 */
export async function runDraftExtraction(
  input: RunDraftExtractionInput,
  adapter: DraftExtractionAdapter
): Promise<RunDraftExtractionResult> {
  const { plan } = input;

  // mode 一貫性チェック（plan と runtime input の mode が一致していること）。
  // server がここに到達する前に env で plan.vlmInputMode を決め、同じ env を見て
  // runtime input を作るため、ここで mismatch は host バグ → unknown。
  if (plan.vlmInputMode !== input.mode) {
    throw new DraftExtractionError(
      "unknown",
      "読み取りに失敗しました。原稿をご確認の上もう一度お試しください。"
    );
  }

  const merged = new Map<number, DayKeyedShiftCell>();
  const perChunkCounts: number[] = [];

  for (let i = 0; i < plan.chunks.length; i++) {
    const chunk = plan.chunks[i];
    // mode に応じた chunk input を組み立てる。combined は同じ 1 枚を毎 chunk で使う
    // （Z 案: 画像 1 枚 + 違う chunk-prompt で 2 回呼ぶ）。split は header + person を毎回。
    const chunkInput: DraftExtractionChunkInput =
      input.mode === "combined"
        ? {
            mode: "combined",
            combinedBlob: input.combinedBlob,
            prompt: chunk.prompt,
            daysInMonth: plan.daysInMonth,
            dayRange: chunk.dayRange,
          }
        : {
            mode: "split",
            headerBlob: input.headerBlob,
            personRowBlob: input.personRowBlob,
            prompt: chunk.prompt,
            daysInMonth: plan.daysInMonth,
            dayRange: chunk.dayRange,
          };
    const cells = await adapter.extractChunk(chunkInput);
    validateChunkOutput(cells, chunk.dayRange, i);
    perChunkCounts.push(cells.length);
    for (const c of cells) {
      if (merged.has(c.day)) {
        throw new DraftExtractionError(
          "merge_duplicate",
          `chunk merge 中に同一 day(${c.day}) が複数 chunk から出力されました`,
          { affectedDays: [c.day] }
        );
      }
      merged.set(c.day, c);
    }
  }

  // 全体 coverage（1..daysInMonth）
  const missing: number[] = [];
  for (let d = 1; d <= plan.daysInMonth; d++) {
    if (!merged.has(d)) missing.push(d);
  }
  if (missing.length) {
    throw new DraftExtractionError(
      "coverage_incomplete",
      `merge 結果に 1..${plan.daysInMonth} の coverage 欠落があります`,
      { affectedDays: missing }
    );
  }

  const cells = [...merged.values()].sort((a, b) => a.day - b.day);
  return { cells, perChunkCounts };
}
