/**
 * 混同しやすいコードの検出（pure・golden-free）— SR A1A（VLM 抽出精度トラック）
 *
 * 役割: VLM が **高 confidence で誤読しやすいコードペア**（例: E ↔ E-18）を、
 *   confidence に関係なく「要確認（soft）」として review hint 化する。
 *
 * 設計核心（CEO 補正・2026-06-05）:
 *   - 既存の安全網（低 confidence / 空欄隣接 / 未知コード）は **高 conf の似コード誤読を捕まえない**。
 *     ここが silent 誤読（F5）。これを「誤読を消す」のではなく「確実に人間確認へ回す」ための層。
 *   - **soft のみ**（即 hard block しない）。confidence に関係なく hint を出す（高 conf でも対象）。
 *   - error / wrong / failed は使わず needs_review トーン（既存 shiftDraftRiskModel と同方針）。
 *
 * 不変原則: pure（IO / LLM / DB / Date / random / env なし）・**throw しない**・deterministic。
 *   辞書の `normalizeRawCode`（trim + toUpperCase・ハイフン保持）でキー比較する。
 *   ※ 本 module は **分類のみ**。review UI への表示・DraftRiskReport への統合は別ステップ（A1B）。
 */

import { normalizeRawCode } from "./shiftCodeDictionary";

/** 混同しやすいコードの 2 つ組（normalize 前の表記でよい・内部で正規化する）。 */
export type ConfusablePair = readonly [string, string];

/**
 * HARADA_SPRIX で混同しやすいペアの初期案（CEO 確定）。
 *   - E ↔ E-18  : 終業 14:00 vs 18:00（4 時間差）。ハイフン/数字の落としで高 conf 誤読。
 *   - H ↔ HREQ : 公休 vs 希望休（休み種別の意味が違う）。接頭一致。
 *   - H ↔ N    : 公休 vs 夜勤（縦長記号・フォント次第で混同しうる）。
 */
export const HARADA_CONFUSABLE_PAIRS: readonly ConfusablePair[] = [
  ["E", "E-18"],
  ["H", "HREQ"],
  ["H", "N"],
];

/** 非 string を安全に文字列化（throw 回避）。 */
function safeRaw(raw: unknown): string {
  return typeof raw === "string" ? raw : "";
}

/**
 * 指定コードの「混同しやすい相手」を返す（normalized・dedup・昇順）。無ければ []。
 * 空コード（"")や非 string は [] （空欄は別の blank-risk が担当）。
 */
export function confusablePartners(
  rawCode: unknown,
  pairs: readonly ConfusablePair[] = HARADA_CONFUSABLE_PAIRS
): string[] {
  const code = normalizeRawCode(safeRaw(rawCode));
  if (code === "") return [];
  const partners = new Set<string>();
  for (const [a, b] of pairs) {
    const na = normalizeRawCode(safeRaw(a));
    const nb = normalizeRawCode(safeRaw(b));
    if (code === na) partners.add(nb);
    if (code === nb) partners.add(na);
  }
  partners.delete(code);
  return [...partners].sort();
}

/** 混同しやすいか（confidence は見ない）。 */
export function isConfusableCode(
  rawCode: unknown,
  pairs: readonly ConfusablePair[] = HARADA_CONFUSABLE_PAIRS
): boolean {
  return confusablePartners(rawCode, pairs).length > 0;
}

/** detect 入力の最小契約（confidence は **意図的に持たない** — 高 conf でも flag するため）。 */
export interface ConfusableCell {
  day: number;
  rawCode: string;
}

/** 1 件の混同しやすいコード hint（soft = 要確認）。 */
export interface ConfusableCodeHint {
  day: number;
  /** normalized rawCode。 */
  rawCode: string;
  /** 混同しやすい相手（normalized・昇順）。 */
  confusableWith: string[];
  /** 常に soft（即 hard block しない・要確認）。 */
  severity: "soft";
  /** needs_review トーンの safe copy。 */
  message: string;
}

/**
 * draft cells から「混同しやすいコード」hint を算出する（pure・confidence 非依存）。
 * 各該当セルにつき 1 件。day 昇順。空欄/非該当はスキップ。throw しない。
 */
export function detectConfusableCells(
  cells: readonly ConfusableCell[],
  pairs: readonly ConfusablePair[] = HARADA_CONFUSABLE_PAIRS
): ConfusableCodeHint[] {
  const hints: ConfusableCodeHint[] = [];
  for (const c of cells ?? []) {
    const partners = confusablePartners(c?.rawCode, pairs);
    if (partners.length === 0) continue;
    const code = normalizeRawCode(safeRaw(c?.rawCode));
    hints.push({
      day: c.day,
      rawCode: code,
      confusableWith: partners,
      severity: "soft",
      message: `「${code}」は「${partners.join("・")}」と見間違えやすいコードです。原稿と照合してください。`,
    });
  }
  return hints.sort((a, b) => a.day - b.day);
}
