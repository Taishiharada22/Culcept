/**
 * Phase 3: 推薦アルゴリズム強化
 *
 * 3-1. 協調フィルタリング実装
 * 3-2. コンテンツベース推薦
 * 3-3. ハイブリッド推薦
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// 3-1. 協調フィルタリング
// ============================================================

function createCollaborativeFiltering() {
  console.log('\n' + '='.repeat(60));
  console.log('🤝 Phase 3-1: 協調フィルタリング実装');
  console.log('='.repeat(60));

  const libDir = '/Users/haradataishi/Aneurasync/lib/recommendations';
  if (!fs.existsSync(libDir)) {
    fs.mkdirSync(libDir, { recursive: true });
  }

  const code = `/**
 * 協調フィルタリング推薦エンジン
 *
 * 似たユーザーの行動パターンを分析し、
 * まだ見ていないアイテムを推薦する
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface UserActions {
  userId: string;
  likes: Set<string>;
  dislikes: Set<string>;
}

interface SimilarUser {
  userId: string;
  similarity: number;
}

/**
 * ユーザーの行動履歴を取得
 */
export async function getUserActions(userId: string): Promise<UserActions> {
  const { data: actions } = await supabase
    .from('recommendation_actions')
    .select('action, impression_id')
    .eq('user_id', userId);

  const likes = new Set<string>();
  const dislikes = new Set<string>();

  // インプレッションIDからターゲットIDを取得
  if (actions && actions.length > 0) {
    const impressionIds = actions.map(a => a.impression_id);
    const { data: impressions } = await supabase
      .from('recommendation_impressions')
      .select('id, target_id')
      .in('id', impressionIds);

    const impressionMap = new Map(impressions?.map(i => [i.id, i.target_id]) || []);

    actions.forEach(a => {
      const targetId = impressionMap.get(a.impression_id);
      if (targetId) {
        if (a.action === 'save') likes.add(targetId);
        if (a.action === 'skip') dislikes.add(targetId);
      }
    });
  }

  return { userId, likes, dislikes };
}

/**
 * コサイン類似度を計算
 */
function cosineSimilarity(user1: UserActions, user2: UserActions): number {
  const allItems = new Set([...user1.likes, ...user1.dislikes, ...user2.likes, ...user2.dislikes]);

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  allItems.forEach(item => {
    const v1 = user1.likes.has(item) ? 1 : user1.dislikes.has(item) ? -1 : 0;
    const v2 = user2.likes.has(item) ? 1 : user2.dislikes.has(item) ? -1 : 0;

    dotProduct += v1 * v2;
    norm1 += v1 * v1;
    norm2 += v2 * v2;
  });

  if (norm1 === 0 || norm2 === 0) return 0;
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * 類似ユーザーを検索
 */
export async function findSimilarUsers(
  userId: string,
  limit: number = 10
): Promise<SimilarUser[]> {
  const targetUser = await getUserActions(userId);

  // 全ユーザーのアクションを取得
  const { data: allActions } = await supabase
    .from('recommendation_actions')
    .select('user_id')
    .neq('user_id', userId);

  const uniqueUserIds = [...new Set(allActions?.map(a => a.user_id) || [])];

  const similarities: SimilarUser[] = [];

  for (const otherUserId of uniqueUserIds.slice(0, 100)) { // 最大100ユーザーまで
    const otherUser = await getUserActions(otherUserId);
    const similarity = cosineSimilarity(targetUser, otherUser);

    if (similarity > 0.1) { // 閾値以上のみ
      similarities.push({ userId: otherUserId, similarity });
    }
  }

  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/**
 * 協調フィルタリングによる推薦
 */
export async function getCollaborativeRecommendations(
  userId: string,
  limit: number = 20
): Promise<string[]> {
  const targetUser = await getUserActions(userId);
  const similarUsers = await findSimilarUsers(userId, 5);

  // 類似ユーザーが「いいね」したアイテムを収集
  const candidateScores = new Map<string, number>();

  for (const { userId: simUserId, similarity } of similarUsers) {
    const simUser = await getUserActions(simUserId);

    simUser.likes.forEach(itemId => {
      // 既に見たアイテムはスキップ
      if (targetUser.likes.has(itemId) || targetUser.dislikes.has(itemId)) return;

      const currentScore = candidateScores.get(itemId) || 0;
      candidateScores.set(itemId, currentScore + similarity);
    });
  }

  // スコア順にソートして返す
  return [...candidateScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([itemId]) => itemId);
}

export default {
  getUserActions,
  findSimilarUsers,
  getCollaborativeRecommendations,
};
`;

  fs.writeFileSync(path.join(libDir, 'collaborative.ts'), code);
  console.log(`✅ 作成: ${libDir}/collaborative.ts`);
}

// ============================================================
// 3-2. コンテンツベース推薦
// ============================================================

function createContentBasedRecommendation() {
  console.log('\n' + '='.repeat(60));
  console.log('📝 Phase 3-2: コンテンツベース推薦');
  console.log('='.repeat(60));

  const libDir = '/Users/haradataishi/Aneurasync/lib/recommendations';

  const code = `/**
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
 * embedding類似度による推薦 (drop_embeddingsテーブルがある場合)
 */
export async function getEmbeddingBasedRecommendations(
  userId: string,
  limit: number = 20
): Promise<string[]> {
  // 注: この機能はdrop_embeddingsテーブルとpgvectorが必要
  // 現状はプレースホルダーとして実装

  const profile = await buildUserProfile(userId);

  if (profile.likedCards.length === 0) return [];

  // TODO: pgvector RPC呼び出しで類似アイテムを取得
  // const { data } = await supabase.rpc('match_embeddings', {
  //   query_embedding: averageEmbedding,
  //   match_count: limit,
  // });

  console.log('⚠️ Embedding推薦はpgvectorセットアップ後に有効化');
  return [];
}

export default {
  buildUserProfile,
  getContentBasedRecommendations,
  getEmbeddingBasedRecommendations,
};
`;

  fs.writeFileSync(path.join(libDir, 'content-based.ts'), code);
  console.log(`✅ 作成: ${libDir}/content-based.ts`);
}

// ============================================================
// 3-3. ハイブリッド推薦
// ============================================================

function createHybridRecommendation() {
  console.log('\n' + '='.repeat(60));
  console.log('🔀 Phase 3-3: ハイブリッド推薦');
  console.log('='.repeat(60));

  const libDir = '/Users/haradataishi/Aneurasync/lib/recommendations';

  const code = `/**
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
`;

  fs.writeFileSync(path.join(libDir, 'hybrid.ts'), code);
  console.log(`✅ 作成: ${libDir}/hybrid.ts`);

  // インデックスファイルを作成
  const indexCode = `/**
 * 推薦エンジン
 */

export * from './collaborative';
export * from './content-based';
export * from './hybrid';

export { default as collaborative } from './collaborative';
export { default as contentBased } from './content-based';
export { default as hybrid } from './hybrid';
`;

  fs.writeFileSync(path.join(libDir, 'index.ts'), indexCode);
  console.log(`✅ 作成: ${libDir}/index.ts`);
}

// ============================================================
// メイン実行
// ============================================================

async function main() {
  console.log('='.repeat(60));
  console.log('🚀 Phase 3: 推薦アルゴリズム強化');
  console.log('='.repeat(60));

  try {
    // 3-1. 協調フィルタリング
    createCollaborativeFiltering();

    // 3-2. コンテンツベース推薦
    createContentBasedRecommendation();

    // 3-3. ハイブリッド推薦
    createHybridRecommendation();

    console.log('\n' + '='.repeat(60));
    console.log('🎉 Phase 3 完了！');
    console.log('='.repeat(60));
    console.log('\n📝 作成されたファイル:');
    console.log('  - lib/recommendations/collaborative.ts');
    console.log('  - lib/recommendations/content-based.ts');
    console.log('  - lib/recommendations/hybrid.ts');
    console.log('  - lib/recommendations/index.ts');
    console.log('\n📝 使用方法:');
    console.log('  import { recommend } from "@/lib/recommendations"');
    console.log('  const cards = await recommend(userId, { limit: 20 })');
  } catch (error) {
    console.error('❌ エラー:', error);
    process.exit(1);
  }
}

main();
