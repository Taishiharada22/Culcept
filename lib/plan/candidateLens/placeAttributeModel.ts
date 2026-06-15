/**
 * lib/plan/candidateLens/placeAttributeModel.ts
 *   — Purpose-Adaptive Candidate Lens / Phase 1: 根拠付き属性モデル（pure）
 *
 * ★各属性に「根拠の種類(evidenceType)」を持たせ、確からしさごとに見せ方を変える土台。
 *   - A `fact`        確定事実: name / address / category(Google 分類)
 *   - B `computed`    Aneurasync 計算: 徒歩概算 / 予定接続 / 余白への影響 / 相性理由
 *   - C `weak`        Aneurasync 推定（弱・明示ラベル）: ★Phase 1 では **emit しない**（根拠が弱い 静か/会話/雰囲気 は出さない）
 *   - D `unconfirmed` 未確認: wifi / power / quiet / crowd / hours / photo → **value=null（捏造しない）**
 *
 * ★捏造しない: 持っていないデータは null。徒歩概算は haversine **直線距離**ベースゆえ route 補正(1.3)+「約」表記。
 *   pure / Date 不使用 / DB・network・外部 API なし / lib は app component に依存しない（構造的 input 型で受ける）。
 */

/** 候補の構造的入力（PlaceCandidate と同形・app に依存しない）。distanceMeters は haversine 直線距離。 */
export interface CandidateInput {
  readonly name: string;
  readonly address: string | null;
  readonly lat: number;
  readonly lng: number;
  readonly types: readonly string[];
  readonly distanceMeters: number | null;
}

export type EvidenceType = "fact" | "computed" | "weak" | "unconfirmed";

export type AttributeKey =
  | "category"
  | "address"
  | "walk_estimate"
  | "schedule_fit"
  | "margin_impact"
  | "affinity_reason"
  | "social_fit"
  | "wifi"
  | "power"
  | "quiet"
  | "crowd"
  | "hours"
  | "photo";

export interface PlaceAttribute {
  readonly key: AttributeKey;
  readonly evidenceType: EvidenceType;
  /** 表示文字列。★null = 未確認/データなし（捏造しない）。 */
  readonly value: string | null;
  /** 比較で「優位」を出すための順序量（高いほど良い・null=比較不可）。既存 helper 由来で捏造数値でない。 */
  readonly orderableScore: number | null;
}

/** 各属性の既定 evidenceType（D=unconfirmed の属性はデータが無い限りこの型で null）。 */
const DEFAULT_EVIDENCE: Record<AttributeKey, EvidenceType> = {
  category: "fact",
  address: "fact",
  walk_estimate: "computed",
  schedule_fit: "computed",
  margin_impact: "computed",
  affinity_reason: "computed",
  social_fit: "weak",
  wifi: "unconfirmed",
  power: "unconfirmed",
  quiet: "unconfirmed",
  crowd: "unconfirmed",
  hours: "unconfirmed",
  photo: "unconfirmed",
};

export const ATTRIBUTE_LABEL: Record<AttributeKey, string> = {
  category: "種別",
  address: "住所",
  walk_estimate: "徒歩",
  schedule_fit: "予定との接続",
  margin_impact: "余白への影響",
  affinity_reason: "相性",
  social_fit: "会話のしやすさ",
  wifi: "Wi-Fi",
  power: "電源",
  quiet: "静かさ",
  crowd: "混雑",
  hours: "営業時間",
  photo: "写真",
};

// types → 読みやすい種別ラベル（Google 分類＝fact・最初に一致したもの）。
const CATEGORY_LABEL: ReadonlyArray<{ readonly type: string; readonly label: string }> = [
  { type: "cafe", label: "カフェ" },
  { type: "coffee_shop", label: "カフェ" },
  { type: "bakery", label: "ベーカリー" },
  { type: "restaurant", label: "レストラン" },
  { type: "meal_takeaway", label: "テイクアウト" },
  { type: "bar", label: "バー" },
  { type: "library", label: "図書館" },
  { type: "book_store", label: "書店" },
  { type: "park", label: "公園" },
  { type: "gym", label: "ジム" },
  { type: "shopping_mall", label: "商業施設" },
  { type: "store", label: "店舗" },
];

/** types → 種別ラベル（Google 分類＝fact）。該当なし→null。 */
export function placeCategoryLabel(types: readonly string[]): string | null {
  for (const { type, label } of CATEGORY_LABEL) {
    if (types.includes(type)) return label;
  }
  return null;
}

/** 直線距離(m) → 徒歩概算(分)。route 補正 1.3 / 80m分・最低 1 分。null は null（捏造しない）。 */
export function walkEstimateMinutes(distanceMeters: number | null): number | null {
  if (distanceMeters == null || !Number.isFinite(distanceMeters)) return null;
  return Math.max(1, Math.round((distanceMeters * 1.3) / 80));
}

/** distanceFit: 近いほど 1（既存 placeAffinity と同思想・比較の orderableScore 用）。 */
function distanceScore(distanceMeters: number | null): number | null {
  if (distanceMeters == null || !Number.isFinite(distanceMeters)) return null;
  if (distanceMeters <= 500) return 1;
  if (distanceMeters >= 10000) return 0.1;
  return Math.max(0.1, 1 - ((distanceMeters - 500) / (10000 - 500)) * 0.9);
}

export interface PlaceAttributeContext {
  /** 予定の前後 gap（分）。あれば schedule_fit / margin_impact を計算・無ければ null（捏造しない）。 */
  readonly gapMinutes?: number | null;
  /** Place Affinity の reason 行（あれば affinity_reason に使う・観測由来）。 */
  readonly affinityReason?: string | null;
  /** Place Affinity の訪問回数（あれば affinity の orderableScore に使う）。 */
  readonly visitCount?: number | null;
}

function attr(key: AttributeKey, value: string | null, orderableScore: number | null): PlaceAttribute {
  return { key, evidenceType: DEFAULT_EVIDENCE[key], value, orderableScore };
}

/**
 * ★候補 → 根拠付き属性束（pure）。**持っていないデータは null（捏造しない）**。
 *   Phase 1 で実値が入るのは: category / address / walk_estimate /（gap あれば）schedule_fit・margin_impact /
 *   （履歴あれば）affinity_reason。social_fit / wifi / power / quiet / crowd / hours / photo は **null（未確認）**。
 */
export function buildPlaceAttributes(
  candidate: CandidateInput,
  ctx: PlaceAttributeContext = {},
): Record<AttributeKey, PlaceAttribute> {
  const walkMin = walkEstimateMinutes(candidate.distanceMeters);
  const distScore = distanceScore(candidate.distanceMeters);

  // schedule_fit / margin_impact: gap が与えられた時のみ（無ければ null）。
  let scheduleFit: PlaceAttribute = attr("schedule_fit", null, null);
  let marginImpact: PlaceAttribute = attr("margin_impact", null, null);
  if (ctx.gapMinutes != null && ctx.gapMinutes > 0 && walkMin != null) {
    const ratio = walkMin / ctx.gapMinutes; // 移動が gap をどれだけ食うか
    const fitScore = Math.max(0, Math.min(1, 1 - ratio));
    scheduleFit = attr(
      "schedule_fit",
      ratio <= 0.34 ? "前後に余裕を持って入れそう" : ratio <= 0.67 ? "ちょうど良いくらい" : "やや急ぎになりそう",
      fitScore,
    );
    marginImpact = attr(
      "margin_impact",
      ratio <= 0.34 ? "余白を残しやすい" : ratio <= 0.67 ? "余白は標準的" : "余白を削りやすい",
      fitScore,
    );
  }

  // affinity_reason: Place Affinity の観測由来 reason（無ければ null）。
  const affinity: PlaceAttribute =
    ctx.affinityReason && ctx.affinityReason.trim().length > 0
      ? attr(
          "affinity_reason",
          ctx.affinityReason,
          ctx.visitCount != null && ctx.visitCount > 0 ? Math.min(1, Math.log2(1 + ctx.visitCount) / 3) : null,
        )
      : attr("affinity_reason", null, null);

  return {
    category: attr("category", placeCategoryLabel(candidate.types), null),
    address: attr("address", candidate.address && candidate.address.trim().length > 0 ? candidate.address : null, null),
    walk_estimate: attr("walk_estimate", walkMin != null ? `約${walkMin}分（目安）` : null, distScore),
    schedule_fit: scheduleFit,
    margin_impact: marginImpact,
    affinity_reason: affinity,
    // ★C 弱推定・D 未確認は Phase 1 では実値を入れない（捏造しない）。
    social_fit: attr("social_fit", null, null),
    wifi: attr("wifi", null, null),
    power: attr("power", null, null),
    quiet: attr("quiet", null, null),
    crowd: attr("crowd", null, null),
    hours: attr("hours", null, null),
    photo: attr("photo", null, null),
  };
}
