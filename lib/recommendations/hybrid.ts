/**
 * ハイブリッド推薦エンジン
 *
 * 協調フィルタリング + コンテンツベース + diversity を組み合わせ
 * 重み付けを調整可能
 */

import { getCollaborativeRecommendations } from './collaborative';
import { getContentBasedRecommendations, buildUserProfile } from './content-based';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface HybridWeights {
  collaborative: number;  // 協調フィルタリングの重み (0-1)
  contentBased: number;   // コンテンツベースの重み (0-1)
  diversity: number;      // 多様性の重み (0-1)
  popularity: number;     // 人気度の重み (0-1)
}

export const DEFAULT_WEIGHTS: HybridWeights = {
  collaborative: 0.3,
  contentBased: 0.3,
  diversity: 0.2,
  popularity: 0.2,
};

interface ScoredCard {
  card_id: string;
  image_url: string;
  tags: string[];
  score: number;
  sources: string[];
}

/**
 * 人気度スコアを取得
 */
async function getPopularityScores(): Promise<Map<string, number>> {
  const { data: actions } = await supabase
    .from('recommendation_actions')
    .select('impression_id, action');

  const { data: impressions } = await supabase
    .from('recommendation_impressions')
    .select('id, target_id');

  const impressionMap = new Map(impressions?.map(i => [i.id, i.target_id]) || []);
  const scores = new Map<string, number>();

  actions?.forEach(a => {
    const targetId = impressionMap.get(a.impression_id);
    if (targetId) {
      const current = scores.get(targetId) || 0;
      const delta = a.action === 'save' ? 1 : a.action === 'skip' ? -0.5 : 0;
      scores.set(targetId, current + delta);
    }
  });

  return scores;
}

/**
 * 多様性スコアを計算
 * 既に選ばれたカードのタグと被らないほど高スコア
 */
function calculateDiversityScore(
  card: { tags: string[] },
  selectedTags: Set<string>
): number {
  if (!card.tags || card.tags.length === 0) return 0.5;

  const newTags = card.tags.filter(t => !selectedTags.has(t));
  return newTags.length / card.tags.length;
}

/**
 * ハイブリッド推薦
 */
export async function getHybridRecommendations(
  userId: string,
  limit: number = 20,
  weights: HybridWeights = DEFAULT_WEIGHTS
): Promise<ScoredCard[]> {
  // 1. 協調フィルタリング
  const collabIds = await getCollaborativeRecommendations(userId, limit * 2);
  const collabSet = new Set(collabIds);

  // 2. コンテンツベース
  const contentCards = await getContentBasedRecommendations(userId, limit * 2);
  const contentMap = new Map(contentCards.map(c => [c.card_id, c]));

  // 3. 人気度
  const popularityScores = await getPopularityScores();

  // 4. 全カード取得
  const { data: allCards } = await supabase
    .from('curated_cards')
    .select('card_id, tags, image_url')
    .eq('is_active', true);

  if (!allCards) return [];

  // ユーザーが既にアクションしたカードを除外
  const profile = await buildUserProfile(userId);
  const seenCards = new Set(profile.likedCards);

  // 5. スコア計算
  const scoredCards: ScoredCard[] = [];
  const selectedTags = new Set<string>();

  const candidates = allCards.filter(c => !seenCards.has(c.card_id));

  for (const card of candidates) {
    const sources: string[] = [];
    let totalScore = 0;

    // 協調フィルタリングスコア
    if (collabSet.has(card.card_id)) {
      totalScore += weights.collaborative;
      sources.push('collaborative');
    }

    // コンテンツベーススコア
    const contentCard = contentMap.get(card.card_id);
    if (contentCard) {
      totalScore += weights.contentBased * 0.8; // コンテンツマッチは80%
      sources.push('content');
    }

    // 人気度スコア
    const popScore = popularityScores.get(card.card_id) || 0;
    const normalizedPop = Math.max(0, Math.min(1, (popScore + 10) / 20)); // -10~10 を 0~1 に正規化
    totalScore += weights.popularity * normalizedPop;
    if (popScore > 0) sources.push('popularity');

    // 多様性スコア
    const divScore = calculateDiversityScore(card, selectedTags);
    totalScore += weights.diversity * divScore;
    if (divScore > 0.5) sources.push('diversity');

    scoredCards.push({
      card_id: card.card_id,
      image_url: card.image_url,
      tags: card.tags || [],
      score: totalScore,
      sources,
    });
  }

  // スコア順にソート
  scoredCards.sort((a, b) => b.score - a.score);

  // 多様性を保ちながら選択
  const result: ScoredCard[] = [];

  for (const card of scoredCards) {
    if (result.length >= limit) break;

    // 既に選択したタグと被りすぎないかチェック
    const overlap = card.tags.filter(t => selectedTags.has(t)).length;
    if (overlap < card.tags.length * 0.7) { // 70%以上被りはスキップ
      result.push(card);
      card.tags.forEach(t => selectedTags.add(t));
    }
  }

  // 足りない場合はスコア順に追加
  if (result.length < limit) {
    for (const card of scoredCards) {
      if (result.length >= limit) break;
      if (!result.find(r => r.card_id === card.card_id)) {
        result.push(card);
      }
    }
  }

  return result;
}

/**
 * API用のラッパー
 */
export async function recommend(
  userId: string,
  options: {
    limit?: number;
    weights?: Partial<HybridWeights>;
  } = {}
) {
  const { limit = 20, weights = {} } = options;

  const finalWeights = { ...DEFAULT_WEIGHTS, ...weights };

  // 重みを正規化
  const total = Object.values(finalWeights).reduce((a, b) => a + b, 0);
  if (total > 0) {
    Object.keys(finalWeights).forEach(key => {
      finalWeights[key as keyof HybridWeights] /= total;
    });
  }

  return getHybridRecommendations(userId, limit, finalWeights);
}

export default {
  getHybridRecommendations,
  recommend,
  DEFAULT_WEIGHTS,
};
