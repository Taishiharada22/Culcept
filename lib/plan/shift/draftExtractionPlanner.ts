/**
 * Draft extraction planner — pure（SR B1b-2C-4-a）
 *
 * 役割: VLM 下書き抽出の「計画」だけを作る pure 層。
 *   - chunk 範囲（既定 1-15 / 16-末）+ 各 chunk の硬化 prompt を返す。
 *   - **Blob / base64 / dataURL / File を一切扱わない**（runtime/adapter 層に分離）。
 *   - 画像本体・VLM 呼出・fetch・env・server-only は触らない。
 *
 * 不変原則（CEO 補正・2026-06-01）:
 *   - planner = 画像本体を知らない（pure）。runtime = Blob を扱う。
 *   - 計画は year/month/daysInMonth/knownCodes/chunkBoundaries だけで作れる。
 *   - testは Blob を作らずに完結する。
 */

import { buildHardenedDayKeyedPrompt } from "./hardenedDayKeyedPrompt";

/** chunk 1 区間 [from, to]（両端含む・1-based dayNumber）。 */
export interface ChunkRange {
  from: number;
  to: number;
}

/** chunk 1 件の計画。VLM の 1 call 分。 */
export interface DraftExtractionChunkPlan {
  dayRange: ChunkRange;
  /** その chunk に投げる硬化済 prompt（B1b-1R 知見を反映）。 */
  prompt: string;
}

/**
 * planner の入力。**Blob / base64 / dataURL / File を field に持たない**（型で構造的に禁止）。
 */
export interface DraftExtractionPlanInput {
  year: number;
  /** 1..12 */
  month: number;
  /** 28..31 */
  daysInMonth: number;
  /** 任意: 辞書の既知コード（prompt の参考行に並べる）。 */
  knownCodes?: string[];
  /**
   * 任意: chunk 境目（既定 [15] = 1-15 / 16-末 の 2 chunk）。
   * 値は 1..daysInMonth-1 の整数。重複・範囲外は無視（防御的）。
   */
  chunkBoundaries?: number[];
  /** 任意: 本人名（prompt の対象指定に使う）。 */
  personName?: string;
}

/** planner の出力。Blob/画像は一切含まない。 */
export interface DraftExtractionPlan {
  year: number;
  month: number;
  daysInMonth: number;
  chunks: DraftExtractionChunkPlan[];
}

/** 既定 chunk 境目（B1b-1R 採用方式・最良 92.8%）。 */
export const DEFAULT_CHUNK_BOUNDARIES: readonly number[] = [15];

/** chunkBoundaries を validate して [1..N-1] の unique sorted 整数に正規化（pure・防御的）。 */
export function normalizeChunkBoundaries(
  boundaries: readonly number[] | undefined,
  daysInMonth: number
): number[] {
  const src = boundaries ?? DEFAULT_CHUNK_BOUNDARIES;
  const valid = new Set<number>();
  for (const b of src) {
    if (!Number.isFinite(b)) continue;
    const v = Math.trunc(b);
    if (v >= 1 && v <= daysInMonth - 1) valid.add(v);
  }
  return [...valid].sort((a, b) => a - b);
}

/**
 * chunkBoundaries から [from,to] の区間配列を作る（pure）。
 * 例: daysInMonth=31, boundaries=[15] → [[1,15],[16,31]]
 *     boundaries=[10,20]              → [[1,10],[11,20],[21,31]]
 *     boundaries=[]                   → [[1,31]]
 */
export function buildChunkRanges(
  daysInMonth: number,
  boundaries: readonly number[] | undefined
): ChunkRange[] {
  const norm = normalizeChunkBoundaries(boundaries, daysInMonth);
  const ranges: ChunkRange[] = [];
  let from = 1;
  for (const b of norm) {
    ranges.push({ from, to: b });
    from = b + 1;
  }
  ranges.push({ from, to: daysInMonth });
  return ranges;
}

/**
 * 抽出計画を作る（pure・Blob 非依存・throw しない）。
 *   - daysInMonth が 1 未満なら chunks=[] を返す（防御的）。
 */
export function planDraftExtraction(
  input: DraftExtractionPlanInput
): DraftExtractionPlan {
  const { year, month, daysInMonth, knownCodes, chunkBoundaries, personName } = input;
  if (!Number.isFinite(daysInMonth) || daysInMonth < 1) {
    return { year, month, daysInMonth, chunks: [] };
  }
  const ranges = buildChunkRanges(daysInMonth, chunkBoundaries);
  const chunks: DraftExtractionChunkPlan[] = ranges.map((r) => ({
    dayRange: r,
    prompt: buildHardenedDayKeyedPrompt({
      year,
      month,
      daysInMonth,
      dayRange: [r.from, r.to],
      ...(knownCodes ? { knownCodes } : {}),
      ...(personName ? { personName } : {}),
    }),
  }));
  return { year, month, daysInMonth, chunks };
}
