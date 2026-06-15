/**
 * lib/plan/candidateLens/candidateLensResolver.ts
 *   — Purpose-Adaptive Candidate Lens / Phase 1 ★本丸: 目的レンズで**比較行が変わる** pure resolver
 *
 * ★CEO/GPT 2026-06-15: 固定比較表でなく「目的レンズ × ユーザー嗜好 × 持っているデータ」で比較行が変わる。
 *   - 各行は **evidenceType（根拠の種類）** を持つ（A 事実 / B 計算 / C 弱推定 / D 未確認）。
 *   - **捏造しない**: 両側データが無い属性は隠す（showUnconfirmed=true なら「未確認」行で見せる）。
 *   - **優位ハイライト**は orderableScore で比較可能な属性のみ（捏造数値でない・順序が付くものだけ）。
 *   - 推薦は honest: 比較で勝った軸（basis）から導く・甲乙つけがたければ null（沈黙）。
 *
 * pure / Date 不使用 / DB・network・外部 API・store なし / UI なし。
 */
import {
  ATTRIBUTE_LABEL,
  type AttributeKey,
  type EvidenceType,
  type PlaceAttribute,
} from "@/lib/plan/candidateLens/placeAttributeModel";
import type { PurposeLens } from "@/lib/plan/candidateLens/purposeLens";
import {
  applyPreferenceToAxes,
  EMPTY_USER_PLACE_PREFERENCE,
  type UserPlacePreference,
} from "@/lib/plan/candidateLens/userPlacePreference";

/**
 * ★目的レンズごとの「見るべき軸」（順序＝重要度）。固定比較表でなく、目的で行が変わる中核。
 *   focus_work の quiet/wifi/power・conversation の social_fit は Phase 1 では未確認（null）→ 既定で隠れる。
 */
export const LENS_AXES: Record<PurposeLens, readonly AttributeKey[]> = {
  meeting_prep: ["walk_estimate", "schedule_fit", "margin_impact", "affinity_reason", "category", "address"],
  focus_work: ["walk_estimate", "quiet", "wifi", "power", "affinity_reason", "category"],
  conversation: ["walk_estimate", "margin_impact", "social_fit", "affinity_reason", "category"],
  errand: ["walk_estimate", "schedule_fit", "category", "address"],
  generic: ["walk_estimate", "affinity_reason", "category", "address"],
};

export interface ComparisonCell {
  readonly value: string | null;
  /** 比較可能な行で優位側のみ true（薄紫＋👍 用）。 */
  readonly isBest: boolean;
}

export interface ComparisonRow {
  readonly key: AttributeKey;
  readonly label: string;
  readonly evidenceType: EvidenceType;
  readonly left: ComparisonCell;
  readonly right: ComparisonCell;
  /** 両側 value が null（データなし）。showUnconfirmed=true の時のみ「未確認」として行に残す。 */
  readonly unconfirmed: boolean;
}

export interface LensComparisonInput {
  readonly lens: PurposeLens;
  readonly leftAttrs: Record<AttributeKey, PlaceAttribute>;
  readonly rightAttrs: Record<AttributeKey, PlaceAttribute>;
  /** ★future input（Phase 1 は fake/empty）。軸順をユーザー嗜好で前方へ寄せる。 */
  readonly preference?: UserPlacePreference;
  /** true: 両側 null の軸も「未確認」行で見せる / false(既定): 隠す。 */
  readonly showUnconfirmed?: boolean;
}

export interface LensComparisonResult {
  readonly lens: PurposeLens;
  readonly rows: readonly ComparisonRow[];
  /** どちらが合いそうか（比較で勝った軸 basis から導く）。甲乙つけがたい/比較不可 → null（沈黙）。 */
  readonly recommendation: { readonly side: "left" | "right"; readonly basis: readonly AttributeKey[] } | null;
}

/**
 * 1 軸の優位判定（pure）。両側に orderableScore があり、**かつ表示値が異なる**時のみ優位を出す。
 * ★honesty: 表示文言が同じ（＝ユーザーに見える差がない）なら、score の微差でハイライト/推薦しない
 *   （見えない差を主張しない・粗い直線距離由来の過剰精度を避ける）。
 */
function decideBest(l: PlaceAttribute, r: PlaceAttribute): "left" | "right" | null {
  if (l.orderableScore == null || r.orderableScore == null) return null;
  if (l.value === r.value) return null; // 表示が同じ＝引き分け（見える差なし）
  if (l.orderableScore > r.orderableScore) return "left";
  if (r.orderableScore > l.orderableScore) return "right";
  return null;
}

/**
 * ★core: 目的レンズで比較を解決（pure）。lens の軸を嗜好で並べ替え、各軸の行を生成、優位をハイライト、
 *   勝った軸から推薦を導く。両側 null は隠す（showUnconfirmed=true なら未確認行）。
 */
export function buildLensComparison(input: LensComparisonInput): LensComparisonResult {
  const preference = input.preference ?? EMPTY_USER_PLACE_PREFERENCE;
  const axes = applyPreferenceToAxes(LENS_AXES[input.lens], input.lens, preference);

  const rows: ComparisonRow[] = [];
  let leftWeight = 0;
  let rightWeight = 0;
  const leftBasis: AttributeKey[] = [];
  const rightBasis: AttributeKey[] = [];

  axes.forEach((key, index) => {
    const l = input.leftAttrs[key];
    const r = input.rightAttrs[key];
    const bothNull = l.value == null && r.value == null;
    if (bothNull && !input.showUnconfirmed) return; // 隠す

    const best = bothNull ? null : decideBest(l, r);
    if (best === "left") {
      leftWeight += axes.length - index; // 上位軸ほど重い
      leftBasis.push(key);
    } else if (best === "right") {
      rightWeight += axes.length - index;
      rightBasis.push(key);
    }

    rows.push({
      key,
      label: ATTRIBUTE_LABEL[key],
      evidenceType: l.evidenceType,
      left: { value: l.value, isBest: best === "left" },
      right: { value: r.value, isBest: best === "right" },
      unconfirmed: bothNull,
    });
  });

  let recommendation: LensComparisonResult["recommendation"] = null;
  if (leftWeight > rightWeight) recommendation = { side: "left", basis: leftBasis };
  else if (rightWeight > leftWeight) recommendation = { side: "right", basis: rightBasis };
  // 同点 / 比較可能軸なし → null（甲乙つけがたい・沈黙）

  return { lens: input.lens, rows, recommendation };
}

/**
 * ★推薦の根拠を定性語にする（pure・place 名は呼び側が付ける・捏造数値なし）。
 *   basis の軸ラベルを「・」で繋いだ短い句。recommendation が null → null。
 */
export function recommendationBasisPhrase(result: LensComparisonResult): string | null {
  if (!result.recommendation || result.recommendation.basis.length === 0) return null;
  const labels = result.recommendation.basis.map((k) => ATTRIBUTE_LABEL[k]);
  return `${labels.join("・")}の点で合いそうです`;
}
