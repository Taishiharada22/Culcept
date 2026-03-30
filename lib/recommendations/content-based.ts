/**
 * コンテンツベース推薦エンジン
 *
 * ユーザーが「いいね」したカードのタグやembeddingを分析し、
 * 類似したコンテンツを推薦する
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface CardWithTags {
  card_id: string;
  tags: string[];
  image_url: string;
}

interface UserProfile {
  userId: string;
  tagPreferences: Map<string, number>; // タグ → 重み
  likedCards: string[];
}

/**
 * ユーザーのタグプロファイルを構築
 */
export async function buildUserProfile(userId: string): Promise<UserProfile> {
  // いいねしたカードを取得
  const { data: actions } = await supabase
    .from('recommendation_actions')
    .select('impression_id, action')
    .eq('user_id', userId)
    .eq('action', 'save');

  if (!actions || actions.length === 0) {
    return { userId, tagPreferences: new Map(), likedCards: [] };
  }

  const impressionIds = actions.map(a => a.impression_id);
  const { data: impressions } = await supabase
    .from('recommendation_impressions')
    .select('target_id')
    .in('id', impressionIds);

  const cardIds = impressions?.map(i => i.target_id).filter(Boolean) || [];

  // カードのタグを取得
  const { data: cards } = await supabase
    .from('curated_cards')
    .select('card_id, tags')
    .in('card_id', cardIds);

  // タグの重みを計算
  const tagPreferences = new Map<string, number>();

  cards?.forEach(card => {
    card.tags?.forEach((tag: string) => {
      const current = tagPreferences.get(tag) || 0;
      tagPreferences.set(tag, current + 1);
    });
  });

  return {
    userId,
    tagPreferences,
    likedCards: cardIds,
  };
}

/**
 * タグベースの類似度計算
 */
function calculateTagSimilarity(
  cardTags: string[],
  userPreferences: Map<string, number>
): number {
  if (!cardTags || cardTags.length === 0) return 0;

  let score = 0;
  const maxWeight = Math.max(...userPreferences.values(), 1);

  cardTags.forEach(tag => {
    const preference = userPreferences.get(tag) || 0;
    score += preference / maxWeight;
  });

  return score / cardTags.length;
}

/**
 * コンテンツベース推薦
 */
export async function getContentBasedRecommendations(
  userId: string,
  limit: number = 20
): Promise<CardWithTags[]> {
  const profile = await buildUserProfile(userId);

  if (profile.tagPreferences.size === 0) {
    // プロファイルがない場合はランダムに返す
    const { data: randomCards } = await supabase
      .from('curated_cards')
      .select('card_id, tags, image_url')
      .eq('is_active', true)
      .limit(limit);

    return randomCards || [];
  }

  // 全アクティブカードを取得
  const { data: allCards } = await supabase
    .from('curated_cards')
    .select('card_id, tags, image_url')
    .eq('is_active', true);

  if (!allCards) return [];

  // スコア計算
  const scoredCards = allCards
    .filter(card => !profile.likedCards.includes(card.card_id))
    .map(card => ({
      ...card,
      score: calculateTagSimilarity(card.tags || [], profile.tagPreferences),
    }))
    .sort((a, b) => b.score - a.score);

  return scoredCards.slice(0, limit);
}

/**
 * embedding類似度による推薦 — pgvector未セットアップ時はタグ類似度フォールバック
 *
 * pgvector が利用可能な場合はベクトル類似検索を行う。
 * 利用不可の場合は、ユーザーのインタラクション履歴からタグプロファイルを構築し、
 * タグ重複数でスコアリングした結果を返す。
 */
export async function getEmbeddingBasedRecommendations(
  userId: string,
  limit: number = 20
): Promise<string[]> {
  const profile = await buildUserProfile(userId);

  if (profile.likedCards.length === 0) return [];

  // ── pgvector が使える場合（将来対応） ──
  // try {
  //   const { data } = await supabase.rpc('match_embeddings', {
  //     query_embedding: averageEmbedding,
  //     match_count: limit,
  //   });
  //   if (data && data.length > 0) return data.map(d => d.card_id);
  // } catch {}

  // ── タグ類似度フォールバック ──
  // ユーザーが「いいね」したカードのタグ分布を元に、
  // 未インタラクションのカードをタグ重複数でスコアリングする
  try {
    if (profile.tagPreferences.size === 0) return [];

    const { data: allCards } = await supabase
      .from('curated_cards')
      .select('card_id, tags')
      .eq('is_active', true);

    if (!allCards || allCards.length === 0) return [];

    const likedSet = new Set(profile.likedCards);

    // 各カードのタグ重複スコアを計算
    const scored = allCards
      .filter((card) => !likedSet.has(card.card_id))
      .map((card) => {
        const tags: string[] = card.tags ?? [];
        let score = 0;
        for (const tag of tags) {
          const weight = profile.tagPreferences.get(tag);
          if (weight) score += weight;
        }
        return { cardId: card.card_id, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map((item) => item.cardId);
  } catch (err) {
    console.warn('[content-based] Tag-based fallback failed:', err);
    return [];
  }
}

export default {
  buildUserProfile,
  getContentBasedRecommendations,
  getEmbeddingBasedRecommendations,
};
