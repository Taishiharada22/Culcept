/**
 * SR A4-2b（pure orchestration）— source-cell consistency 算出のコア（DI reader・**canvas/DOM 非依存**）
 *
 * 役割: review 画面の imageSrc + geometry + cells から、**空欄セル（rawCode=""）だけ**を対象に
 *   原稿セルの content score を読み（reader は DI）、`detectSourceMismatches` で P1 不一致を算出する。
 *   実際の canvas 読取は **A4-2b hook の defaultCanvasReader**（別ファイル・client）。本 module は配列だけ。
 *
 * 設計（CEO/GPT A4-2b 指示）:
 *   - **blank cells only**: rawCode=="" のセルだけ検査（P1 目的・性能・flood 回避。P2 はやらない）。
 *   - **fail-open**: imageSrc/geometry 無・空欄なし・reader throw → 空配列（throw しない）。
 *   - **transient review-only**: 戻り値は structured hint のみ。raw 画像/base64 を持たず、save に混ぜない。
 *
 * 不変原則: pure（DOM/canvas/VLM/DB/save/Date/random なし）・**throw しない**・deterministic（reader 次第）。
 */

import { normalizeRawCode } from "./shiftCodeDictionary";
import {
  cellCropRegion,
  sourceColumnForDay,
  type ShiftGridGeometry,
  type CropRegion,
} from "./shiftGridGeometry";
import {
  detectSourceMismatches,
  type SourceMismatchHint,
  type SourceConsistencyOptions,
} from "./sourceCellConsistency";

/** 空欄セル 1 件の読取対象（day + source 列の crop region）。 */
export interface SourceCellTarget {
  day: number;
  region: CropRegion;
}

/**
 * DI 可能な content score reader: 対象セル群 → 各 day の content score（0..1）。
 * 失敗は throw か、該当 day を欠落で返してよい（呼び元が fail-open 処理する）。
 */
export type SourceCellScoreReader = (
  imageSrc: string,
  geometry: ShiftGridGeometry,
  targets: readonly SourceCellTarget[]
) => Promise<ReadonlyArray<{ day: number; score: number }>>;

export interface SourceConsistencyInput {
  imageSrc?: string;
  geometry?: ShiftGridGeometry;
  /** 抽出セル（day + rawCode）。 */
  cells: ReadonlyArray<{ day: number; rawCode: string }>;
  /** 詰めスキップ対象の day（sourceColumnForDay の列写像用）。 */
  blankDays: readonly number[];
  options?: SourceConsistencyOptions;
}

function isBlankCode(rawCode: unknown): boolean {
  return typeof rawCode !== "string" || normalizeRawCode(rawCode) === "";
}

/** blank cell（rawCode=""）だけの読取対象を作る（pure）。imageSrc/geometry 無や空欄なしは空配列。 */
export function buildBlankCellTargets(input: SourceConsistencyInput): SourceCellTarget[] {
  const { imageSrc, geometry, cells, blankDays } = input;
  if (!imageSrc || !geometry || !Array.isArray(cells) || cells.length === 0) return [];
  const out: SourceCellTarget[] = [];
  for (const c of cells) {
    if (!c || typeof c.day !== "number") continue;
    if (!isBlankCode(c.rawCode)) continue; // blank cells only
    out.push({ day: c.day, region: cellCropRegion(geometry, sourceColumnForDay(c.day, blankDays ?? [])) });
  }
  return out;
}

/**
 * blank cell only で source/result mismatch（P1）を算出する（pure・fail-open・throw しない）。
 *   reader が throw / 非配列を返す → 空配列。score は blank day ごとに reader 結果（無ければ 0）。
 */
export async function computeSourceConsistencyMismatches(
  input: SourceConsistencyInput,
  reader: SourceCellScoreReader
): Promise<SourceMismatchHint[]> {
  const targets = buildBlankCellTargets(input);
  if (targets.length === 0) return [];
  let scores: ReadonlyArray<{ day: number; score: number }>;
  try {
    scores = await reader(input.imageSrc as string, input.geometry as ShiftGridGeometry, targets);
  } catch {
    return []; // fail-open（canvas failure 等）
  }
  if (!Array.isArray(scores)) return [];
  const scoreByDay = new Map<number, number>();
  for (const s of scores) {
    if (s && typeof s.day === "number" && typeof s.score === "number" && Number.isFinite(s.score)) {
      scoreByDay.set(s.day, s.score);
    }
  }
  // 対象は全て blank なので rawCode="" を渡す → detectSourceMismatches は P1 のみ算出。
  const signals = targets.map((t) => ({ day: t.day, rawCode: "", contentScore: scoreByDay.get(t.day) ?? 0 }));
  return detectSourceMismatches(signals, input.options);
}
