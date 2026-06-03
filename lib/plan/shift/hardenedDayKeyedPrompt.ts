/**
 * Hardened day-keyed extraction prompt（SR B1b-2C-4-a・pure）
 *
 * 既存 `buildDayKeyedExtractionPrompt`（列アンカー・day-keyed）に、B1b-1R で実証された
 * 失敗3モード（隣接同一併合 / 空セル skip / 前詰め shift）を直撃する追加厳守ブロックを
 * commit-grade で append する pure builder。
 *
 * 不変原則:
 *   - pure（IO / LLM / DB / Date / random / env / fetch / Blob なし）
 *   - 文字列を組むだけ。実行は別 layer（B1b-2C-4-c VLM adapter）。
 *
 * 出典: B1b-1R run（private-eval / gitignored）で chunk + 硬化文言が併合・skip を
 *       一部解消した実績。may HREQ/HREQ 連続のような知覚エラーは残るため、最終確定は
 *       人の review（ShiftReviewGrid + B1b-2B risk hint）で担保する。
 */

import { buildDayKeyedExtractionPrompt } from "./shiftExtractionPrompt";

export interface HardenedDayKeyedPromptParams {
  /** 任意: 本人名（無指定なら汎用文言）。 */
  personName?: string;
  year: number;
  month: number;
  daysInMonth: number;
  knownCodes?: string[];
  /** 任意: chunk 対象の日範囲 [from, to]。指定時は range 限定で出力させる。 */
  dayRange?: [number, number];
}

/**
 * SR B1b-2C-9-FIX-2: combined 入力（上下結合 1 枚）用の硬化 prompt。
 *
 * 役割: VLM に渡す画像が **上段=日付ヘッダ / 下段=本人行 / 同 X 軸** の 1 枚であること、
 *   同一縦列が同一日付に対応すること、前詰め禁止・空欄保持を明示する。
 *
 * 既存 buildHardenedDayKeyedPrompt との関係:
 *   - 共通の base prompt（buildDayKeyedExtractionPrompt）は流用する。
 *   - 追加厳守ブロックは **combined 専用文言**（上下2段 / 同一縦列 / 前詰め禁止 / chunk範囲）。
 *   - split prompt は変更しない（既存経路の互換維持）。
 */
export function buildHardenedCombinedDayKeyedPrompt(
  params: HardenedDayKeyedPromptParams
): string {
  const { dayRange, daysInMonth } = params;
  const base = buildDayKeyedExtractionPrompt({
    personName: params.personName ?? "本人",
    year: params.year,
    month: params.month,
    daysInMonth,
    ...(params.knownCodes ? { knownCodes: params.knownCodes } : {}),
    ...(dayRange ? { dayRange } : {}),
  });
  const [from, to] = dayRange ?? [1, daysInMonth];
  const count = to - from + 1;
  const harden = [
    "",
    "# 画像構造（combined 1 枚入力）",
    "- この画像は **上下 2 段** の構造です。",
    "- **上段** は日付ヘッダ（数字と曜日）です。",
    "- **下段** は対象者のシフト行（H / HREQ / E / E-18 / N / L / G / BD などの記号 or 空欄）です。",
    "- **同じ縦列が同じ日付に対応** します。",
    "",
    "# 列対応の絶対厳守",
    "- 上段の各日付番号と、その **真下** の下段セルだけを対応させる。",
    "- 左や右のセルを **前詰めしない**（空欄があっても次の日の値を空欄の位置に入れない）。",
    "- 空欄は **空欄として出力** する（rawCode: \"\" または空文字）。",
    "- 上段の dayNumber を読めない場合でも、下段のセル位置から推測して dayNumber を前後にずらさない。",
    "- 各 dayNumber に必ず 1 つだけ結果を返す（過不足なし）。",
    "- 隣接する同じ rawCode でも、1 日ずつ別のセルとして出力する（同じ記号が連続しても 1 つにまとめない）。",
    "",
    "# chunk 範囲",
    `- この呼び出しでは ${from} 日〜${to} 日「だけ」 を、ちょうど ${count} 件、dayNumber 昇順で出力する。`,
    "- chunk 範囲外（上記以外の日）は出力しない。",
    "- chunk 範囲内の日付は **すべて** 返す（読めない日も dayNumber は返し、rawCode を空または低 confidence にする）。",
  ];
  return base + "\n" + harden.join("\n");
}

/** B1b-1R 採用方式: chunk + day-keyed + 追加厳守（隣接・空セル・前詰めを名指し禁止）。 */
export function buildHardenedDayKeyedPrompt(
  params: HardenedDayKeyedPromptParams
): string {
  const { dayRange, daysInMonth } = params;
  const base = buildDayKeyedExtractionPrompt({
    personName: params.personName ?? "本人",
    year: params.year,
    month: params.month,
    daysInMonth,
    ...(params.knownCodes ? { knownCodes: params.knownCodes } : {}),
    ...(dayRange ? { dayRange } : {}),
  });
  const [from, to] = dayRange ?? [1, daysInMonth];
  const count = to - from + 1;
  const harden = [
    "",
    "# 失敗モード対策（追加で絶対厳守）",
    "- 各 dayNumber に必ず1つだけ結果を返す（過不足なし）。",
    "- **隣接する同じ rawCode でも、1日ずつ別のセルとして出力する**（同じ記号が連続しても1つにまとめない・併合しない）。",
    "- 空セルは rawCode: \"\" として出力する。",
    "- 空セルの後続の値を左に詰めない（空の次の日の値を空セルの位置に入れない）。",
    "- 各セルは、ヘッダの dayNumber の印字位置の**真下の列だけ**を見て読む。",
    "- 前後の並び(sequence)から推測して補完しない。読めない時は confidence を下げる。",
    `- この chunk では ${from}日〜${to}日「だけ」を、ちょうど ${count}件、dayNumber 昇順で出力する。`,
  ];
  return base + "\n" + harden.join("\n");
}
