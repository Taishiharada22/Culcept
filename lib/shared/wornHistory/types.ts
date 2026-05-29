/**
 * shared WornHistory — canonical domain types（Phase 3-A: pure・storage/runtime 非接続）
 *
 * 将来の「着用履歴 正本」のドメイン土台。 storage / IO / engine / server には一切接続しない。
 * /plan の隔離 store（PlanWornRecord）と /calendar の WornRecord を、 学習可否を含む単一の
 * canonical entry に正規化するための「型・ルール」だけをここに固定する。
 *
 * 重要原則:
 *   - mock / hydrated_mock は学習に絶対に流さない（eligibility で hard ban）。
 *   - source === "engine"（実推薦）または "calendar_form"（既存 calendar 記録）かつ、
 *     satisfaction があり itemIds が実在 wardrobe id のときだけ learningEligible になる。
 *   - 本ファイル群は read/write/server/engine いずれにも接続しない pure module。
 */

/** 満足度（1-5）。 plan / calendar 双方の評価レンジに一致。 */
export type SatisfactionLevel = 1 | 2 | 3 | 4 | 5;

/**
 * 着用記録の出所。
 *   - engine        : /plan の実推薦（実 wardrobe id を持つ）→ 学習候補
 *   - mock          : 素の mock 提案（学習に流さない）
 *   - hydrated_mock : 画像ハイドレートした mock（slot は mock id のまま → 学習に流さない）
 *   - calendar_form : 既存 /calendar の着用フォーム由来（実 wardrobe id）→ 学習候補
 */
export type WornHistorySource = "engine" | "mock" | "hydrated_mock" | "calendar_form";

/** 記録がどの体験面で作られたか（衝突解決で calendar 優先判定に使う）。 */
export type WornHistoryOrigin = "plan" | "calendar";

/**
 * canonical な着用履歴エントリ（1 日 1 件想定の正規形）。
 *   - plan / calendar の差異を吸収した単一表現。
 *   - learningEligible は「変換時点の判定」。 knownWardrobeIds を後から与えて
 *     recomputeLearningEligibility で精緻化できる。
 */
export interface WornHistoryEntry {
  /** YYYY-MM-DD */
  date: string;
  /** ISO 時刻（着用＝確定時刻）。 calendar は時刻を持たないため date 深夜に既定化される。 */
  wornAt: string;
  /** ISO 時刻（評価時刻、 あれば）。 */
  ratedAt?: string;
  /** 着用アイテムの id 群（plan: proposal item id / calendar: card id）。 */
  itemIds: string[];
  /** 満足度（1-5、 未評価は undefined）。 */
  satisfaction?: SatisfactionLevel;
  /** 出所。 */
  source: WornHistorySource;
  /** 体験面（plan / calendar）。 */
  origin: WornHistoryOrigin;
  /**
   * 学習に使ってよいか（変換時点の判定）。
   * computeLearningEligibility の結果と完全に一致する。
   */
  learningEligible: boolean;
}
