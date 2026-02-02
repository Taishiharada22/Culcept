/**
 * A/Bテスト基盤
 *
 * experiment_assignments テーブルを活用
 * アルゴリズム別の効果測定
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface Experiment {
  id: string;
  name: string;
  variants: string[];
  weights: number[]; // 各variantの割り当て確率
  isActive: boolean;
  startDate: Date;
  endDate?: Date;
}

export interface Assignment {
  experimentId: string;
  userId: string;
  variant: string;
  assignedAt: Date;
}

/**
 * ユーザーをvariantに割り当て
 */
export async function assignVariant(
  experimentId: string,
  userId: string,
  variants: string[],
  weights?: number[]
): Promise<string> {
  // 既存の割り当てを確認
  const { data: existing } = await supabase
    .from('experiment_assignments')
    .select('variant')
    .eq('experiment_id', experimentId)
    .eq('user_id', userId)
    .single();

  if (existing) {
    return existing.variant;
  }

  // 新規割り当て
  const normalizedWeights = weights || variants.map(() => 1 / variants.length);
  const random = Math.random();
  let cumulative = 0;
  let selectedVariant = variants[0];

  for (let i = 0; i < variants.length; i++) {
    cumulative += normalizedWeights[i];
    if (random < cumulative) {
      selectedVariant = variants[i];
      break;
    }
  }

  // 保存
  await supabase.from('experiment_assignments').insert({
    experiment_id: experimentId,
    user_id: userId,
    variant: selectedVariant,
    assigned_at: new Date().toISOString(),
  });

  return selectedVariant;
}

/**
 * ユーザーの割り当てを取得
 */
export async function getAssignment(
  experimentId: string,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('experiment_assignments')
    .select('variant')
    .eq('experiment_id', experimentId)
    .eq('user_id', userId)
    .single();

  return data?.variant || null;
}

/**
 * 実験結果を集計
 */
export async function getExperimentResults(experimentId: string): Promise<{
  variant: string;
  users: number;
  impressions: number;
  actions: number;
  saves: number;
  ctr: number;
}[]> {
  // 各variantのユーザー数を取得
  const { data: assignments } = await supabase
    .from('experiment_assignments')
    .select('variant, user_id')
    .eq('experiment_id', experimentId);

  if (!assignments) return [];

  const variantUsers = new Map<string, Set<string>>();
  assignments.forEach(a => {
    if (!variantUsers.has(a.variant)) {
      variantUsers.set(a.variant, new Set());
    }
    variantUsers.get(a.variant)!.add(a.user_id);
  });

  const results: {
    variant: string;
    users: number;
    impressions: number;
    actions: number;
    saves: number;
    ctr: number;
  }[] = [];

  for (const [variant, userIds] of variantUsers) {
    const userIdArray = [...userIds];

    // インプレッション数
    const { count: impressions } = await supabase
      .from('recommendation_impressions')
      .select('*', { count: 'exact', head: true })
      .in('user_id', userIdArray);

    // アクション数
    const { data: actions } = await supabase
      .from('recommendation_actions')
      .select('action')
      .in('user_id', userIdArray);

    const saves = actions?.filter(a => a.action === 'save').length || 0;
    const totalActions = actions?.length || 0;

    results.push({
      variant,
      users: userIds.size,
      impressions: impressions || 0,
      actions: totalActions,
      saves,
      ctr: impressions && impressions > 0 ? (saves / impressions) * 100 : 0,
    });
  }

  return results;
}

/**
 * 推薦アルゴリズムA/Bテスト
 */
export async function getRecommendationAlgorithm(userId: string): Promise<string> {
  const experimentId = 'rec_algorithm_v1';
  const variants = ['hybrid', 'collaborative', 'content_based', 'random'];
  const weights = [0.4, 0.2, 0.2, 0.2]; // hybridを40%に

  return assignVariant(experimentId, userId, variants, weights);
}

export default {
  assignVariant,
  getAssignment,
  getExperimentResults,
  getRecommendationAlgorithm,
};
