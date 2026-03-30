// ============================================================
// Phase 5: 適応ペーシングエンジン
// 配信頻度を個人のエンゲージメントパターンに適応させる
// 「依存させない接続」の設計原則を技術的に実装
// ============================================================

export type DeliverySchedule = {
  /** 次の候補配信までの推奨遅延（分） */
  recommendedDelayMinutes: number;
  /** バッチ配信の場合、同時に配信する件数 */
  batchSize: number;
  /** 配信時のナラティブ（UIで表示） */
  deliveryNarrative: string;
  /** ペーシングの理由 */
  reason: PacingReason;
};

export type PacingReason =
  | "normal"           // 通常ペース
  | "heavy_slowdown"   // ヘビーユーザー減速
  | "light_catchup"    // ライトユーザーまとめ配信
  | "anti_addiction"    // 反依存ガード
  | "absence_return";  // 不在からの復帰

export type EngagementHistory = {
  opensLast24h: number;
  opensLast7d: number;
  swipesLast24h: number;
  avgSessionDurationMs: number;
  daysSinceLastOpen: number;
  candidatesDeliveredToday: number;
};

const MAX_NEW_CANDIDATES_PER_DAY = 3;
const HEAVY_USER_THRESHOLD_OPENS = 5;  // 24h
const LIGHT_USER_THRESHOLD_DAYS = 7;   // 最終アクセスから

/**
 * ユーザーのエンゲージメントパターンに基づき配信スケジュールを計算
 */
export function computeDeliverySchedule(
  engagement: EngagementHistory,
): DeliverySchedule {
  // 反依存ガード: 1日の上限チェック
  if (engagement.candidatesDeliveredToday >= MAX_NEW_CANDIDATES_PER_DAY) {
    return {
      recommendedDelayMinutes: 1440, // 翌日まで
      batchSize: 0,
      deliveryNarrative: "今日の新しい交差は十分です。分身も少し休んでいます",
      reason: "anti_addiction",
    };
  }

  // 不在からの復帰
  if (engagement.daysSinceLastOpen >= LIGHT_USER_THRESHOLD_DAYS) {
    const batchSize = Math.min(
      3,
      MAX_NEW_CANDIDATES_PER_DAY - engagement.candidatesDeliveredToday,
    );
    return {
      recommendedDelayMinutes: 0, // 即時
      batchSize,
      deliveryNarrative: "お帰りなさい。あなたがいない間、分身たちは忙しく探索していました",
      reason: "absence_return",
    };
  }

  // ライトユーザー（過去7日で開いた回数が少ない）
  if (engagement.opensLast7d <= 2) {
    return {
      recommendedDelayMinutes: 0, // 即時
      batchSize: Math.min(2, MAX_NEW_CANDIDATES_PER_DAY - engagement.candidatesDeliveredToday),
      deliveryNarrative: "あなたの分身が、いくつかの交差を温めていました",
      reason: "light_catchup",
    };
  }

  // ヘビーユーザー（24hで5+回オープン）
  if (engagement.opensLast24h >= HEAVY_USER_THRESHOLD_OPENS) {
    return {
      recommendedDelayMinutes: 360, // 6時間後
      batchSize: 1,
      deliveryNarrative: "分身は、急がず丁寧に探索しています",
      reason: "heavy_slowdown",
    };
  }

  // 通常ペース
  return {
    recommendedDelayMinutes: 180, // 3時間
    batchSize: 1,
    deliveryNarrative: "",
    reason: "normal",
  };
}

/**
 * 1日あたりの残り配信可能数
 */
export function remainingDeliveriesForToday(
  candidatesDeliveredToday: number,
): number {
  return Math.max(0, MAX_NEW_CANDIDATES_PER_DAY - candidatesDeliveredToday);
}
