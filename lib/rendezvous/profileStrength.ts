// ============================================================
// プロフィール強度メーター
// Bumble式の完成度スコア + 改善提案
// ============================================================

export type ProfileStrengthItem = {
  key: string;
  label: string;
  weight: number;
  completed: boolean;
  /** 未完了時の改善提案 */
  suggestion?: string;
};

export type ProfileStrengthResult = {
  /** 0-100 のスコア */
  score: number;
  /** 強度レベル */
  level: "beginner" | "growing" | "strong" | "excellent";
  /** 各項目の詳細 */
  items: ProfileStrengthItem[];
  /** 次にやるべきこと（最優先の未完了項目） */
  nextAction: string | null;
};

type ProfileData = {
  hasPhoto: boolean;
  photoCount: number;
  hasBio: boolean;
  bioLength: number;
  hasEnabledCategories: boolean;
  enabledCategoryCount: number;
  hasMatchingVector: boolean;
  hasStargazerProfile: boolean;
  hasAttachmentProfile: boolean;
  hasProgressiveAnswers: boolean;
  progressiveAnswerCount: number;
  hasOriginProfile: boolean;
  hasDailyActivity: boolean;
};

/**
 * プロフィール強度を算出
 *
 * 重み設計:
 * - 写真(25): マッチングアプリの最重要要素
 * - 自己紹介(15): 人となりの伝達
 * - カテゴリ選択(10): マッチング範囲の決定
 * - MatchingVector(15): 適合度計算の基盤
 * - Stargazer連携(10): 深層性格データ
 * - 心理学プロファイル(5): 高度な適合性
 * - プログレッシブ回答(10): 継続的な自己理解深化
 * - Origin連携(5): 背景・経験データ
 * - 日次アクティビティ(5): エンゲージメント
 */
export function computeProfileStrength(data: ProfileData): ProfileStrengthResult {
  const items: ProfileStrengthItem[] = [
    {
      key: "photo_primary",
      label: "プロフィール写真",
      weight: 15,
      completed: data.hasPhoto,
      suggestion: "写真を追加すると、分身がより正確にあなたを表現できます",
    },
    {
      key: "photo_multiple",
      label: "複数の写真",
      weight: 10,
      completed: data.photoCount >= 3,
      suggestion: "3枚以上の写真があると、相手からの信頼度が大幅に上がります",
    },
    {
      key: "bio",
      label: "自己紹介文",
      weight: 15,
      completed: data.hasBio && data.bioLength >= 30,
      suggestion: data.hasBio
        ? "自己紹介を30文字以上に充実させましょう"
        : "あなたらしい自己紹介を書きましょう",
    },
    {
      key: "categories",
      label: "接続カテゴリ",
      weight: 10,
      completed: data.hasEnabledCategories && data.enabledCategoryCount >= 1,
      suggestion: "どんな出会いを求めているか選びましょう",
    },
    {
      key: "matching_vector",
      label: "適合ベクトル",
      weight: 15,
      completed: data.hasMatchingVector,
      suggestion: "オンボーディングを完了して、あなたの対人傾向を分身に教えましょう",
    },
    {
      key: "stargazer",
      label: "Stargazer連携",
      weight: 10,
      completed: data.hasStargazerProfile,
      suggestion: "Stargazerで性格観測を行うと、マッチング精度が大幅に向上します",
    },
    {
      key: "psychological",
      label: "深層心理プロファイル",
      weight: 5,
      completed: data.hasAttachmentProfile,
      suggestion: "オンボーディング完了後に自動生成されます",
    },
    {
      key: "progressive",
      label: "プログレッシブ質問",
      weight: 10,
      completed: data.progressiveAnswerCount >= 7,
      suggestion: `${data.progressiveAnswerCount}/14問回答済み。毎日1問ずつ答えて分身を深化させましょう`,
    },
    {
      key: "origin",
      label: "Origin連携",
      weight: 5,
      completed: data.hasOriginProfile,
      suggestion: "背景・経験データを登録すると、価値観の一致度が計測できます",
    },
    {
      key: "activity",
      label: "日次アクティビティ",
      weight: 5,
      completed: data.hasDailyActivity,
      suggestion: "定期的にアプリを使うと、分身の学習が加速します",
    },
  ];

  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const earnedWeight = items
    .filter((item) => item.completed)
    .reduce((sum, item) => sum + item.weight, 0);

  const score = Math.round((earnedWeight / totalWeight) * 100);

  const level: ProfileStrengthResult["level"] =
    score >= 90 ? "excellent" :
    score >= 70 ? "strong" :
    score >= 40 ? "growing" :
    "beginner";

  // 次にやるべきこと: 未完了のうち最もweightが大きいもの
  const nextItem = items
    .filter((item) => !item.completed)
    .sort((a, b) => b.weight - a.weight)[0];

  return {
    score,
    level,
    items,
    nextAction: nextItem?.suggestion ?? null,
  };
}
