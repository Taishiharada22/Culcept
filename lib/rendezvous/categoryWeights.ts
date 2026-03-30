import type { CategoryWeights, RendezvousCategory } from "./types";

const ROMANTIC_WEIGHTS: CategoryWeights = {
  conversation: 0.14,
  distance: 0.16,
  depth: 0.16,
  initiative: 0.10,
  emotional: 0.16,
  conflict: 0.08,
  stability: 0.10,
  categoryAffinity: 0.10,
};

const FRIENDSHIP_WEIGHTS: CategoryWeights = {
  conversation: 0.20,
  distance: 0.15,
  depth: 0.08,
  initiative: 0.08,
  emotional: 0.10,
  conflict: 0.08,
  stability: 0.11,
  categoryAffinity: 0.20,
};

const COCREATION_WEIGHTS: CategoryWeights = {
  conversation: 0.10,
  distance: 0.06,
  depth: 0.06,
  initiative: 0.18,
  emotional: 0.06,
  conflict: 0.16,
  stability: 0.12,
  categoryAffinity: 0.26,
};

const COMMUNITY_WEIGHTS: CategoryWeights = {
  conversation: 0.16,
  distance: 0.12,
  depth: 0.05,
  initiative: 0.08,
  emotional: 0.08,
  conflict: 0.06,
  stability: 0.10,
  categoryAffinity: 0.35,
};

/**
 * パートナー（結婚前提）の重み設計思想:
 *
 * romanticとの違い: 「今惹かれるか」ではなく「10年後も一緒にいられるか」
 *
 * - stability (0.16): 最重視。安定性の欲求が近いことが持続の基盤
 * - emotional (0.16): 感情の開き方が近い。長期関係では最も摩擦が出る部分
 * - conflict (0.14): 衝突時の向き合い方。ここの不一致は離婚の最大因子
 * - distance (0.14): 距離感の取り方。同居で毎日影響する
 * - depth (0.12): 関係の深め方が噛み合うか
 * - conversation (0.10): 日常会話のテンポ。重要だが決定的ではない
 * - initiative (0.06): 主導性。パートナーシップでは補完より協調
 * - categoryAffinity (0.12): 生活リズム・価値観の総合適合
 */
const PARTNER_WEIGHTS: CategoryWeights = {
  conversation: 0.10,
  distance: 0.14,
  depth: 0.12,
  initiative: 0.06,
  emotional: 0.16,
  conflict: 0.14,
  stability: 0.16,
  categoryAffinity: 0.12,
};

export function getCategoryWeights(
  category: RendezvousCategory,
): CategoryWeights {
  switch (category) {
    case "romantic":
      return ROMANTIC_WEIGHTS;
    case "friendship":
      return FRIENDSHIP_WEIGHTS;
    case "cocreation":
      return COCREATION_WEIGHTS;
    case "community":
      return COMMUNITY_WEIGHTS;
    case "partner":
      return PARTNER_WEIGHTS;
  }
}
