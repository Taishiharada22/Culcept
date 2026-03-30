import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { RendezvousCategory } from "./types";
import { convertToMatchingVector } from "@/lib/stargazer/crossSystemBridge";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { MatchingVector } from "./types";

// ============================================================
// 5分匿名セッション — マッチングエンジン
// Stargazerプロファイルベースの高品質ペアリング
// ============================================================

const SESSION_DURATION_MS = 5 * 60 * 1000; // 5分

export type SessionQueueEntry = {
  userId: string;
  category: RendezvousCategory;
  mode: "text" | "voice";
  joinedAt: string;
};

/**
 * セッションキューに参加し、マッチを試みる
 * - キューに待機中の相手がいればマッチ成立 → セッション作成
 * - いなければキューに追加して待機
 */
export async function joinSessionQueue(params: {
  userId: string;
  category: RendezvousCategory;
  mode?: "text" | "voice";
}): Promise<
  | { status: "matched"; sessionId: string }
  | { status: "queued"; queuePosition: number }
> {
  const { userId, category, mode = "text" } = params;
  const today = new Date().toISOString().slice(0, 10);

  // 今日すでにセッション参加済みか確認（1日1回制限）
  const { data: existingSession } = await supabaseAdmin
    .from("rendezvous_sessions")
    .select("id, state")
    .eq("session_date", today)
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .not("state", "eq", "queued")
    .limit(1)
    .maybeSingle();

  if (existingSession) {
    // 既にセッション済みの場合、そのセッションを返す
    return { status: "matched", sessionId: existingSession.id };
  }

  // 自分が既にキューにいるか確認
  const { data: myQueue } = await supabaseAdmin
    .from("rendezvous_sessions")
    .select("id")
    .eq("user_a", userId)
    .eq("state", "queued")
    .eq("session_date", today)
    .maybeSingle();

  if (myQueue) {
    // 既にキュー中 → キュー位置を返す
    const { count } = await supabaseAdmin
      .from("rendezvous_sessions")
      .select("id", { count: "exact", head: true })
      .eq("state", "queued")
      .eq("session_date", today)
      .eq("category", category);
    return { status: "queued", queuePosition: count ?? 1 };
  }

  // マッチング: 同カテゴリで待機中の相手を探す
  const matchPartner = await findBestMatch(userId, category, today);

  if (matchPartner) {
    // マッチ成立 → セッション作成
    const now = new Date();
    const endsAt = new Date(now.getTime() + SESSION_DURATION_MS);

    const { data: session, error } = await supabaseAdmin
      .from("rendezvous_sessions")
      .update({
        user_b: userId,
        state: "matched",
        started_at: now.toISOString(),
        ends_at: endsAt.toISOString(),
      })
      .eq("id", matchPartner.sessionId)
      .eq("state", "queued")
      .select("id")
      .single();

    if (error || !session) {
      // 競合 → 自分をキューに入れる
      return await createQueueEntry(userId, category, mode, today);
    }

    return { status: "matched", sessionId: session.id };
  }

  // マッチなし → キューに追加
  return await createQueueEntry(userId, category, mode, today);
}

async function createQueueEntry(
  userId: string,
  category: RendezvousCategory,
  mode: string,
  today: string,
): Promise<{ status: "queued"; queuePosition: number }> {
  await supabaseAdmin.from("rendezvous_sessions").insert({
    user_a: userId,
    category,
    mode,
    session_date: today,
    state: "queued",
  });

  const { count } = await supabaseAdmin
    .from("rendezvous_sessions")
    .select("id", { count: "exact", head: true })
    .eq("state", "queued")
    .eq("session_date", today)
    .eq("category", category);

  return { status: "queued", queuePosition: count ?? 1 };
}

/**
 * MatchingVector同士のコサイン類似度を計算（0〜1）
 * 両ベクトルの10次元で相性を評価する
 */
function computeVectorSimilarity(a: MatchingVector, b: MatchingVector): number {
  const keys: (keyof MatchingVector)[] = [
    "conversation_temperature", "distance_need", "depth_speed",
    "stability_need", "stimulation_need", "initiative",
    "emotional_openness", "conflict_directness", "social_energy",
    "structure_preference",
  ];
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (const k of keys) {
    const va = a[k];
    const vb = b[k];
    dotProduct += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

/**
 * Stargazerプロファイルベースのベストマッチ検索
 * 同カテゴリの待機中ユーザーから、Stargazer軸スコアによる
 * MatchingVector類似度が最も高い相手を選択する。
 * Stargazerデータがない場合はFIFO（先着順）にフォールバック。
 */
async function findBestMatch(
  userId: string,
  category: RendezvousCategory,
  today: string,
): Promise<{ sessionId: string; userId: string } | null> {
  // 待機中のセッションを取得（自分以外）
  const { data: waiting } = await supabaseAdmin
    .from("rendezvous_sessions")
    .select("id, user_a")
    .eq("state", "queued")
    .eq("session_date", today)
    .eq("category", category)
    .neq("user_a", userId)
    .order("created_at", { ascending: true })
    .limit(10);

  if (!waiting || waiting.length === 0) return null;

  // ─── Stargazerスコアベースのマッチング ───
  try {
    const allUserIds = [userId, ...waiting.map((w) => w.user_a)];

    const { data: profiles } = await supabaseAdmin
      .from("stargazer_profiles")
      .select("user_id, dimensions")
      .in("user_id", allUserIds);

    // 自分のプロファイルを取得
    const myProfile = profiles?.find((p) => p.user_id === userId);

    if (myProfile?.dimensions && typeof myProfile.dimensions === "object") {
      const myAxisScores = myProfile.dimensions as Partial<Record<TraitAxisKey, number>>;
      const myVector = convertToMatchingVector(myAxisScores);

      // 各候補のスコアを計算
      let bestScore = -1;
      let bestEntry = waiting[0];

      for (const entry of waiting) {
        const candidateProfile = profiles?.find(
          (p) => p.user_id === entry.user_a,
        );

        if (
          candidateProfile?.dimensions &&
          typeof candidateProfile.dimensions === "object"
        ) {
          const candidateAxisScores = candidateProfile.dimensions as Partial<
            Record<TraitAxisKey, number>
          >;
          const candidateVector = convertToMatchingVector(candidateAxisScores);
          const score = computeVectorSimilarity(myVector, candidateVector);

          if (score > bestScore) {
            bestScore = score;
            bestEntry = entry;
          }
        }
      }

      return { sessionId: bestEntry.id, userId: bestEntry.user_a };
    }
  } catch (err) {
    // Stargazerデータ取得失敗時はFIFOフォールバック
    console.warn("[sessionMatcher] Stargazer scoring failed, using FIFO:", err);
  }

  // フォールバック: FIFO（先着順）
  const best = waiting[0];
  return { sessionId: best.id, userId: best.user_a };
}

/**
 * セッションの状態を「アクティブ」に更新
 */
export async function activateSession(sessionId: string): Promise<boolean> {
  const now = new Date();
  const endsAt = new Date(now.getTime() + SESSION_DURATION_MS);

  const { error } = await supabaseAdmin
    .from("rendezvous_sessions")
    .update({
      state: "active",
      started_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
    })
    .eq("id", sessionId)
    .eq("state", "matched");

  return !error;
}

/**
 * セッション終了後の判定を記録
 */
export async function submitSessionDecision(params: {
  sessionId: string;
  userId: string;
  decision: "again" | "pass";
}): Promise<{ isMutual: boolean | null }> {
  const { sessionId, userId, decision } = params;

  // セッション取得
  const { data: session } = await supabaseAdmin
    .from("rendezvous_sessions")
    .select("id, user_a, user_b, decision_a, decision_b")
    .eq("id", sessionId)
    .single();

  if (!session) return { isMutual: null };

  // どちらのユーザーか判定
  const isA = session.user_a === userId;
  const isB = session.user_b === userId;
  if (!isA && !isB) return { isMutual: null };

  const updateField = isA ? "decision_a" : "decision_b";
  const otherDecision = isA ? session.decision_b : session.decision_a;

  await supabaseAdmin
    .from("rendezvous_sessions")
    .update({ [updateField]: decision })
    .eq("id", sessionId);

  // 両方の判定が揃ったか確認
  if (otherDecision) {
    const isMutual = decision === "again" && otherDecision === "again";

    await supabaseAdmin
      .from("rendezvous_sessions")
      .update({
        mutual_result: isMutual,
        state: "ended",
      })
      .eq("id", sessionId);

    // 相互マッチ成立 → rendezvous_candidates にレコード作成
    if (isMutual) {
      await createMutualCandidate(
        session.user_a,
        session.user_b,
        sessionId,
      );
    }

    return { isMutual };
  }

  return { isMutual: null }; // 相手の判定待ち
}

/**
 * 相互マッチ成立時に rendezvous_candidates レコードを作成する。
 * セッションから得られた相互 "again" 判定を永続化し、
 * 後続のチャット開放・通知フローに繋げる。
 */
async function createMutualCandidate(
  userA: string,
  userB: string,
  sourceSessionId: string,
): Promise<void> {
  try {
    // 既に同ペアの candidate が存在しないか確認（重複防止）
    const { data: existing } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id")
      .or(
        `and(user_a.eq.${userA},user_b.eq.${userB}),and(user_a.eq.${userB},user_b.eq.${userA})`,
      )
      .in("state", ["matched", "mutual_liked", "chat_opened"])
      .maybeSingle();

    if (existing) return; // 既にマッチ済み

    // セッションからカテゴリを取得
    const { data: sessionData } = await supabaseAdmin
      .from("rendezvous_sessions")
      .select("category")
      .eq("id", sourceSessionId)
      .single();

    const category = sessionData?.category ?? "friendship";

    const { error } = await supabaseAdmin
      .from("rendezvous_candidates")
      .insert({
        user_a: userA,
        user_b: userB,
        source_event_id: sourceSessionId,
        category,
        state: "matched",
        matched_at: new Date().toISOString(),
        a_to_b_score: 0,
        b_to_a_score: 0,
        overall_score: 0,
        reason_codes: [],
        reason_texts: ["5分セッションで相互マッチ"],
        caution_codes: [],
        caution_texts: [],
      });

    if (error) {
      console.error("[sessionMatcher] Failed to create mutual candidate:", error);
    }

    // TODO: 通知システムが実装されたら、両ユーザーにマッチ通知を送信する
    // await sendMatchNotification(userA, userB, candidateId);
  } catch (err) {
    console.error("[sessionMatcher] createMutualCandidate error:", err);
  }
}
