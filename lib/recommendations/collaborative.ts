/**
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
