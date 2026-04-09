import "server-only";

import { supabaseServer } from "@/lib/supabase/server";
import { checkPairPhaseGate } from "./phaseGate";

// ============================================================
// Exchange Protocol — Counselor 間の構造化情報交換
//
// 設計根拠（Part 1 §3.4）:
//   - 交換されるもの（目的限定・合意済み・監査可能）:
//     温度感スコア(1-10)、関心が高かった話題カテゴリ、
//     不安/懸念のシグナル（有無のみ）、次回推奨アクション、
//     相性の構造的予測
//
//   - 交換されないもの:
//     生の会話ログ、断りの具体的理由、内面の深層データ、
//     Alterの観測原データ
//
//   - Phase 4+ のユーザーペアのみ利用可能
//
// 既存相談所との差:
//   既存は「本人→自分のカウンセラー→相手のカウンセラー」の
//   2回変換でロスが発生。Rendezvousでは両Counselorが
//   行動観測データに基づいて温度感を判定するため変換ロス最小。
// ============================================================

// ── 型定義 ──

/** Exchange で交換されるペイロード */
export type ExchangePayload = {
  /** 温度感スコア 1-10（1=冷却中, 10=非常に高い関心） */
  temperatureScore: number;
  /** 関心が高かった話題カテゴリ */
  topicCategories: string[];
  /** 不安/懸念のシグナル（有無のみ。内容は非開示） */
  hasAnxietySignal: boolean;
  /** 次回推奨アクション */
  nextRecommendedAction: string | null;
  /** 相性の構造的予測（任意） */
  compatibilityNote: string | null;
};

/** Exchange レコード */
export type ExchangeRecord = {
  id: string;
  candidateId: string;
  /** 交換を開始した側のユーザーID */
  fromUserId: string;
  /** 交換先のユーザーID */
  toUserId: string;
  /** 送信側 Counselor が生成したペイロード */
  payload: ExchangePayload;
  /** 受信確認済みか */
  acknowledged: boolean;
  createdAt: string;
};

export type ExchangeDirection = "sent" | "received";

export type ExchangeSummary = {
  candidateId: string;
  sent: ExchangeRecord | null;
  received: ExchangeRecord | null;
  /** 温度差（自分 - 相手。正=自分が高い、負=相手が高い） */
  temperatureDelta: number | null;
};

// ── 公開API ──

/**
 * Exchange を作成する。
 *
 * 前提条件: 双方が Phase 4+ であること（Phase Gate チェック内蔵）。
 */
export async function createExchange(params: {
  candidateId: string;
  fromUserId: string;
  toUserId: string;
  payload: ExchangePayload;
}): Promise<ExchangeRecord> {
  // Phase Gate: 双方 Phase 4+ が必須
  const gate = await checkPairPhaseGate(
    params.fromUserId,
    params.toUserId,
    "full_exchange",
  );
  if (!gate.allowed) {
    throw new Error(
      `Exchange Protocol requires Phase 4+: ${gate.reason}`,
    );
  }

  // バリデーション
  validatePayload(params.payload);

  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("rendezvous_exchanges")
    .insert({
      candidate_id: params.candidateId,
      from_user_id: params.fromUserId,
      to_user_id: params.toUserId,
      payload: params.payload as unknown as Record<string, unknown>,
      acknowledged: false,
    })
    .select("id, created_at")
    .single();

  if (error) {
    throw new Error(`Exchange creation failed: ${error.message}`);
  }

  return {
    id: data.id,
    candidateId: params.candidateId,
    fromUserId: params.fromUserId,
    toUserId: params.toUserId,
    payload: params.payload,
    acknowledged: false,
    createdAt: data.created_at,
  };
}

/**
 * Exchange を受信確認する。
 */
export async function acknowledgeExchange(
  exchangeId: string,
  userId: string,
): Promise<void> {
  const supabase = await supabaseServer();

  const { error } = await supabase
    .from("rendezvous_exchanges")
    .update({ acknowledged: true })
    .eq("id", exchangeId)
    .eq("to_user_id", userId);

  if (error) {
    throw new Error(`Exchange acknowledgement failed: ${error.message}`);
  }
}

/**
 * ユーザーの Exchange 一覧を取得する。
 */
export async function getUserExchanges(
  userId: string,
): Promise<ExchangeRecord[]> {
  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("rendezvous_exchanges")
    .select("*")
    .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[exchangeProtocol] getUserExchanges error:", error);
    return [];
  }

  return (data ?? []).map(mapRowToRecord);
}

/**
 * 特定の候補ペアの Exchange サマリーを取得する。
 * 温度差の可視化に使う。
 */
export async function getExchangeSummary(
  candidateId: string,
  userId: string,
): Promise<ExchangeSummary> {
  const supabase = await supabaseServer();

  const { data } = await supabase
    .from("rendezvous_exchanges")
    .select("*")
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false })
    .limit(10);

  const records = (data ?? []).map(mapRowToRecord);

  const sent = records.find((r) => r.fromUserId === userId) ?? null;
  const received = records.find((r) => r.toUserId === userId) ?? null;

  let temperatureDelta: number | null = null;
  if (sent && received) {
    temperatureDelta =
      sent.payload.temperatureScore - received.payload.temperatureScore;
  }

  return { candidateId, sent, received, temperatureDelta };
}

/**
 * 未確認の Exchange 通知数を取得する（ダッシュボード表示用）。
 */
export async function getUnacknowledgedExchangeCount(
  userId: string,
): Promise<number> {
  const supabase = await supabaseServer();

  const { count, error } = await supabase
    .from("rendezvous_exchanges")
    .select("id", { count: "exact", head: true })
    .eq("to_user_id", userId)
    .eq("acknowledged", false);

  if (error) {
    console.error("[exchangeProtocol] count error:", error);
    return 0;
  }

  return count ?? 0;
}

// ── 内部ヘルパー ──

function validatePayload(payload: ExchangePayload): void {
  if (
    payload.temperatureScore < 1 ||
    payload.temperatureScore > 10 ||
    !Number.isInteger(payload.temperatureScore)
  ) {
    throw new Error("temperatureScore must be an integer 1-10");
  }
  if (!Array.isArray(payload.topicCategories)) {
    throw new Error("topicCategories must be an array");
  }
}

type ExchangeRow = {
  id: string;
  candidate_id: string;
  from_user_id: string;
  to_user_id: string;
  payload: Record<string, unknown>;
  acknowledged: boolean;
  created_at: string;
};

function mapRowToRecord(row: ExchangeRow): ExchangeRecord {
  const p = row.payload as Record<string, unknown>;
  return {
    id: row.id,
    candidateId: row.candidate_id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    payload: {
      temperatureScore: (p.temperatureScore as number) ?? 5,
      topicCategories: (p.topicCategories as string[]) ?? [],
      hasAnxietySignal: (p.hasAnxietySignal as boolean) ?? false,
      nextRecommendedAction: (p.nextRecommendedAction as string) ?? null,
      compatibilityNote: (p.compatibilityNote as string) ?? null,
    },
    acknowledged: row.acknowledged,
    createdAt: row.created_at,
  };
}
