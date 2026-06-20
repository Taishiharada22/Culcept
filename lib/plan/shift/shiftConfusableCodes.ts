/**
 * 混同しやすいコードの検出（pure・golden-free）— SR A1A + A1-tune-1（tier + directionality）
 *
 * 役割: VLM が高 confidence で誤読しやすいコードを「要確認（soft）」review hint 化する。
 *
 * A1-tune-1（CEO 2026-06-05・confusable 過剰 19/31 = 61% の調整）:
 *   - **tier**（strong / medium / weak）をペアに付与（全て soft = 非ブロック維持）。
 *   - **directionality**: 誤読リスクは方向性がある。flag は VLM の **出力 rawCode** に付くので、
 *     「その出力が**短い/曖昧な側**で、実は相手コードの誤読かもしれない」ものだけ at-risk として flag する。
 *       E↔E-18: 出力 "E" のみ at-risk（"E-18" は接尾辞があり信頼できる出力）。
 *       H↔HREQ: 出力 "H" のみ at-risk（"HREQ" は信頼できる出力）。
 *       H↔N   : weak（実データで false positive が多くなりやすい → 観測用）。
 *   - 表示振り分け: **cell amber = strong のみ** / panel summary = strong(日付) + medium(件数) /
 *     weak = UI 非表示（observation only）。
 *   - **soft のみ**（hard block しない）・confidence 非依存・error/誤/失敗/間違 不使用（needs_review トーン）。
 *
 * 不変原則: pure（IO / LLM / DB / Date / random / env なし）・**throw しない**・deterministic。
 */

import { normalizeRawCode } from "./shiftCodeDictionary";

/** 混同しやすいコードの 2 つ組（normalize 前の表記でよい・内部で正規化する）。 */
export type ConfusablePair = readonly [string, string];

/** 紛らわしさの強さ（全て soft = 非ブロック。表示の絞り込みに使う）。 */
export type ConfusableTier = "strong" | "medium" | "weak";

/** ペア + tier + directionality（at-risk 出力）。 */
export interface ConfusableSpec {
  readonly pair: ConfusablePair;
  readonly tier: ConfusableTier;
  /** 出力がこのコードのとき at-risk（= 相手コードの誤読かもしれない短い/曖昧な側）。normalize 前でよい。 */
  readonly atRisk: readonly string[];
}

/**
 * HARADA_SPRIX 混同ペア仕様（CEO 確定・A1-tune-1）。
 *   - E↔E-18  : **strong**。終業 14:00 vs 18:00（4h 差・影響大）。"E" が E-18 の接尾辞落としかも → "E" のみ at-risk。
 *   - H↔HREQ : **medium**。公休 vs 希望休（休み種別が変わる）。"H" が HREQ の接尾辞落としかも → "H" のみ at-risk。
 *   - H↔N    : **weak**。公休 vs 夜勤。実データで false positive が多くなりやすい → 観測用（UI 非表示）。
 */
export const HARADA_CONFUSABLE_SPECS: readonly ConfusableSpec[] = [
  { pair: ["E", "E-18"], tier: "strong", atRisk: ["E"] },
  { pair: ["H", "HREQ"], tier: "medium", atRisk: ["H"] },
  { pair: ["H", "N"], tier: "weak", atRisk: ["H", "N"] },
];

/** 後方互換: ペア一覧（**対称**・directionality を見ない原関係）。 */
export const HARADA_CONFUSABLE_PAIRS: readonly ConfusablePair[] =
  HARADA_CONFUSABLE_SPECS.map((s) => s.pair);

/** 非 string を安全に文字列化（throw 回避）。 */
function safeRaw(raw: unknown): string {
  return typeof raw === "string" ? raw : "";
}

/**
 * 指定コードの「混同しやすい相手」を返す（**対称**・normalized・dedup・昇順）。directionality は見ない。
 * 空コード（""）や非 string は []（空欄は別の blank-risk が担当）。
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

/** 混同しやすいか（**対称**・confidence は見ない）。 */
export function isConfusableCode(
  rawCode: unknown,
  pairs: readonly ConfusablePair[] = HARADA_CONFUSABLE_PAIRS
): boolean {
  return confusablePartners(rawCode, pairs).length > 0;
}

const TIER_RANK: Record<ConfusableTier, number> = { weak: 0, medium: 1, strong: 2 };

/**
 * directionality 適用: 出力 rawCode が at-risk な spec を集め、effective tier（最強）と相手を返す。
 * at-risk でなければ null（= "E-18" / "HREQ" など信頼できる出力は flag しない）。
 */
export function resolveConfusable(
  rawCode: unknown,
  specs: readonly ConfusableSpec[] = HARADA_CONFUSABLE_SPECS
): { tier: ConfusableTier; confusableWith: string[] } | null {
  const code = normalizeRawCode(safeRaw(rawCode));
  if (code === "") return null;
  let best: ConfusableTier | null = null;
  const partners = new Set<string>();
  for (const spec of specs) {
    const atRisk = spec.atRisk.map((c) => normalizeRawCode(safeRaw(c)));
    if (!atRisk.includes(code)) continue;
    const na = normalizeRawCode(safeRaw(spec.pair[0]));
    const nb = normalizeRawCode(safeRaw(spec.pair[1]));
    partners.add(code === na ? nb : na);
    if (best === null || TIER_RANK[spec.tier] > TIER_RANK[best]) best = spec.tier;
  }
  partners.delete(code);
  if (best === null) return null;
  return { tier: best, confusableWith: [...partners].sort() };
}

/** detect 入力の最小契約（confidence は **意図的に持たない** — 高 conf でも flag するため）。 */
export interface ConfusableCell {
  day: number;
  rawCode: string;
}

/** 1 件の混同しやすいコード hint（soft = 要確認 + tier）。 */
export interface ConfusableCodeHint {
  day: number;
  /** normalized rawCode。 */
  rawCode: string;
  /** 混同しやすい相手（normalized・昇順）。 */
  confusableWith: string[];
  /** A1-tune-1: 紛らわしさの強さ（表示の絞り込み用）。 */
  tier: ConfusableTier;
  /** 常に soft（即 hard block しない・要確認）。 */
  severity: "soft";
  /** needs_review トーンの safe copy。 */
  message: string;
}

function tierMessage(code: string, partners: string[], tier: ConfusableTier): string {
  const w = partners.join("・");
  if (tier === "strong")
    return `「${code}」は「${w}」と似た形で紛らわしい勤務コードです。原稿と照合してください。`;
  if (tier === "medium")
    return `「${code}」は「${w}」と休み種別が紛らわしいコードです。必要に応じて確認してください。`;
  return `「${code}」は「${w}」と紛らわしい可能性があります（観測用）。`;
}

/**
 * draft cells から「混同しやすいコード」hint を算出する（pure・confidence 非依存・**directionality 適用**）。
 * at-risk な出力のみ・effective tier 付き。day 昇順。空欄/非該当/信頼できる出力はスキップ。throw しない。
 */
export function detectConfusableCells(
  cells: readonly ConfusableCell[],
  specs: readonly ConfusableSpec[] = HARADA_CONFUSABLE_SPECS
): ConfusableCodeHint[] {
  const hints: ConfusableCodeHint[] = [];
  for (const c of cells ?? []) {
    const r = resolveConfusable(c?.rawCode, specs);
    if (!r) continue;
    const code = normalizeRawCode(safeRaw(c?.rawCode));
    hints.push({
      day: c.day,
      rawCode: code,
      confusableWith: r.confusableWith,
      tier: r.tier,
      severity: "soft",
      message: tierMessage(code, r.confusableWith, r.tier),
    });
  }
  return hints.sort((a, b) => a.day - b.day);
}

/** cell amber 対象の day set（**strong のみ** — CEO D3）。medium/weak は cell amber に出さない。 */
export function confusableCellAmberDays(
  hints: readonly ConfusableCodeHint[]
): Set<number> {
  return new Set(hints.filter((h) => h.tier === "strong").map((h) => h.day));
}

/** panel summary 用の振り分け（strong = 日付つき / medium = 件数のみ / weak = 除外）。 */
export interface ConfusableSummary {
  /** strong tier の日（昇順・日付つきで表示）。 */
  strongDays: number[];
  /** medium tier の件数（日付を出さず件数 summary）。 */
  mediumCount: number;
}

export function summarizeConfusable(
  hints: readonly ConfusableCodeHint[]
): ConfusableSummary {
  const strongDays = hints
    .filter((h) => h.tier === "strong")
    .map((h) => h.day)
    .sort((a, b) => a - b);
  const mediumCount = hints.filter((h) => h.tier === "medium").length;
  return { strongDays, mediumCount };
}
