/**
 * Arrival Risk Memory Reader — Phase 3 J-1d (= interface only)。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-1d / §3.4 Phase 3-M
 *
 * 役割:
 *   過去 anchor 観測の到着乖離データを返す reader の **抽象 interface のみ**。
 *   Phase 3-J では `NULL_ARRIVAL_RISK_READER` (= 常に null) のみ提供。
 *   Phase 3-M で実 reader (= localStorage 由来) を実装、 Departure Correction が機能開始。
 *
 * 設計意図:
 *   future-proof interface を J で確保することで、 Phase 3-M で実装追加時に
 *   既存 J 実装の改修なしで接続可能 (= Open/Closed Principle)。
 *
 * 不変原則:
 *   - Phase 3-J では実データ保存 zero (= localStorage 書込みなし)
 *   - Phase 3-M で Minimal Memory + Settings Export/Delete で privacy 保証
 *   - sensitive anchor の deviation は記録対象外 (= Invariant 4、 Phase 3-M で強制)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Anchor 文脈 — 過去観測と照合するための feature vector。
 *
 * Phase 3-M で Analogical Pattern Bridging が cosine similarity を計算する際の入力。
 */
export interface AnchorContext {
  /** anchor title (= identity ヒント) */
  readonly title?: string;
  /** location text (= 場所ヒント) */
  readonly locationText?: string;
  /** 時刻 (= 0-23) */
  readonly hourOfDay?: number;
  /** 曜日 ("Mon" | "Tue" | ... | "Sun") */
  readonly dayOfWeek?: string;
}

/**
 * 過去観測の乖離 record。
 *
 * Phase 3-M で実 deviation データ (= 過去 N 回観測の平均乖延 min) を返す。
 */
export interface ArrivalDeviation {
  /** 平均乖離 (= min、 + は遅刻寄り / - は早すぎ寄り) */
  readonly avgDeviationMin: number;
  /** sample 数 (= 過去観測の信頼度) */
  readonly sampleCount: number;
}

/**
 * Reader interface — Phase 3-J では null reader、 Phase 3-M で実装注入。
 */
export interface ArrivalRiskMemoryReader {
  /**
   * 過去 anchor context に対する到着乖離を返す。
   *
   * @returns deviation or null (= データなし or null reader)
   */
  getPastDeviation(context: AnchorContext): ArrivalDeviation | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 3-J 用 NULL reader (= 常に null、 データなし)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Phase 3-J で使用する NULL reader。
 *
 * 実 reader が Phase 3-M で実装されるまでの placeholder。
 * 全 anchor context に対し null を返す (= deviation データなし)。
 */
export const NULL_ARRIVAL_RISK_READER: ArrivalRiskMemoryReader = Object.freeze({
  getPastDeviation(): ArrivalDeviation | null {
    return null;
  },
});
