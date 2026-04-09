// ============================================================
// Counselor Orchestrator — 既存資産の上位制御層
//
// 設計書 §3.7 (2026-04-09 CEO決定):
//   Counselorが既存資産を「いつ・何を・なぜ」判断して発動する。
//   個々の機能が独立して動くのではなく、Counselorが
//   最適タイミングで既存機能を発動する指揮者。
//
// Phase 2 最小骨格:
//   1. evaluateRelationshipState() — 関係状態の評価
//   2. recommendAction() — 推薦アクションの決定
//   3. 各ディスパッチ関数 — 段階的に接続
// ============================================================

import { detectTemperatureGap, type TemperatureGapResult } from "../temperatureGapDetector";
import { computeClimate, type ClimateState, type ConversationClimate } from "../conversationClimate";
import { getUserTendencies } from "./tendencyTracker";
import { detectSafetyTopics, type SafetyDetectionResult } from "./safetyLayer";
import { supabaseServer } from "@/lib/supabase/server";
import { getAvailableGames, type CoupleGame, type GameCategory, type RelationshipPhase } from "../coupleGames";

// ── 型定義 ──

export type RelationshipState = {
  candidateId: string;
  userId: string;
  counterpartId: string;
  /** 会話温度（0-1） */
  temperature: number;
  climateState: ClimateState;
  /** 双方温度差 */
  temperatureGap: TemperatureGapResult | null;
  /** 安全トピック検出 */
  safetyDetection: SafetyDetectionResult | null;
  /** メッセージ総数 */
  messageCount: number;
  /** 接続からの経過日数 */
  daysSinceStart: number;
  /** 最後のやり取りからの経過日数 */
  daysSinceLastActivity: number;
  /** 関係フェーズ（ゲーム用） */
  relationshipPhase: RelationshipPhase;
  /** 傾向パターン数 */
  tendencyPatternCount: number;
};

export type RecommendationType =
  | "suggest_game"
  | "suggest_mission"
  | "trigger_nudge"
  | "adjust_pacing"
  | "flag_escalation"
  | "celebrate_milestone"
  | "highlight_crystal"
  | "no_action";

export type CounselorRecommendation = {
  type: RecommendationType;
  reason: string;
  priority: "low" | "medium" | "high" | "critical";
  payload: Record<string, unknown>;
};

// ── 関係状態の評価 ──

/**
 * 候補ペアの関係状態を総合評価する。
 * weeklyBriefing等が個別に集めていたデータを、
 * Counselor判断の共通基盤として構造化する。
 */
export async function evaluateRelationshipState(params: {
  candidateId: string;
  userId: string;
  counterpartId: string;
}): Promise<RelationshipState> {
  const { candidateId, userId, counterpartId } = params;
  const supabase = await supabaseServer();

  // 1. メッセージ統計
  const { count: msgCount } = await supabase
    .from("rendezvous_messages")
    .select("id", { count: "exact", head: true })
    .eq("candidate_id", candidateId);

  const messageCount = msgCount ?? 0;

  // 2. 候補メタデータ（開始日・最終活動）
  const { data: candidate } = await supabase
    .from("rendezvous_candidates")
    .select("created_at, last_activity_at")
    .eq("id", candidateId)
    .maybeSingle();

  const now = Date.now();
  const startedAt = candidate?.created_at ? new Date(candidate.created_at).getTime() : now;
  const lastActivity = candidate?.last_activity_at
    ? new Date(candidate.last_activity_at).getTime()
    : startedAt;
  const daysSinceStart = Math.floor((now - startedAt) / (1000 * 60 * 60 * 24));
  const daysSinceLastActivity = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24));

  // 3. 会話温度
  const { data: messages } = await supabase
    .from("rendezvous_messages")
    .select("sender_id, content, created_at")
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false })
    .limit(50);

  const msgs = messages ?? [];
  const selfMsgs = msgs.filter((m) => m.sender_id === userId);
  const otherMsgs = msgs.filter((m) => m.sender_id !== userId);

  const avgLen = (arr: typeof msgs) =>
    arr.length > 0 ? arr.reduce((s, m) => s + (m.content?.length ?? 0), 0) / arr.length : 0;

  const questionCount = selfMsgs.filter((m) => /[？?]/.test(m.content ?? "")).length;

  // 応答時間（粗い近似）
  let avgResponseMinutes = 30;
  if (msgs.length >= 2) {
    const times = msgs.map((m) => new Date(m.created_at).getTime()).sort((a, b) => a - b);
    const diffs = times.slice(1).map((t, i) => (t - times[i]) / 60000);
    avgResponseMinutes = diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 30;
  }

  const lastMsgTime = msgs[0]?.created_at ? new Date(msgs[0].created_at).getTime() : now;
  const lastMessageMinutesAgo = (now - lastMsgTime) / 60000;

  const climate = computeClimate({
    selfCount: selfMsgs.length,
    otherCount: otherMsgs.length,
    avgSelfLength: avgLen(selfMsgs),
    avgOtherLength: avgLen(otherMsgs),
    questionRatio: selfMsgs.length > 0 ? questionCount / selfMsgs.length : 0,
    avgResponseMinutes,
    lastMessageMinutesAgo,
  });

  // 4. 温度差検出（メッセージ十分な場合のみ）
  let temperatureGap: TemperatureGapResult | null = null;
  if (messageCount >= 10) {
    try {
      temperatureGap = await detectTemperatureGap({
        candidateId,
        userAId: userId,
        userBId: counterpartId,
      });
    } catch {
      // fail-open
    }
  }

  // 5. 安全トピック検出（直近メッセージ）
  let safetyDetection: SafetyDetectionResult | null = null;
  const recentContent = msgs.slice(0, 10).map((m) => m.content ?? "").join(" ");
  if (recentContent.length > 0) {
    safetyDetection = detectSafetyTopics(recentContent);
  }

  // 6. 傾向パターン
  const tendencies = await getUserTendencies(userId);

  // 7. 関係フェーズの推定
  const relationshipPhase: RelationshipPhase =
    daysSinceStart >= 30 && messageCount >= 100 ? "constellation" :
    daysSinceStart >= 14 && messageCount >= 40 ? "glow" :
    daysSinceStart >= 3 && messageCount >= 10 ? "flame" :
    "spark";

  return {
    candidateId,
    userId,
    counterpartId,
    temperature: climate.temperature,
    climateState: climate.state,
    temperatureGap,
    safetyDetection,
    messageCount,
    daysSinceStart,
    daysSinceLastActivity,
    relationshipPhase,
    tendencyPatternCount: tendencies.length,
  };
}

// ── 推薦アクションの決定 ──

/**
 * 関係状態に基づき、Counselorが取るべきアクションを決定する。
 * 優先度: safety > escalation > temperature_gap > stagnation > enrichment
 */
export function recommendAction(state: RelationshipState): CounselorRecommendation {
  // 1. Safety — 最優先
  if (state.safetyDetection && state.safetyDetection.detected) {
    return {
      type: "flag_escalation",
      reason: `安全トピック検出: ${state.safetyDetection.categories.join(", ")}`,
      priority: state.safetyDetection.severity === "decision" ? "critical" : "high",
      payload: { safetyDetection: state.safetyDetection },
    };
  }

  // 2. 温度差 — critical/significant は介入
  if (state.temperatureGap?.gapDetected) {
    const sev = state.temperatureGap.severity;
    if (sev === "critical" || sev === "significant") {
      return {
        type: "adjust_pacing",
        reason: `温度差 ${sev}: δ=${state.temperatureGap.delta.toFixed(1)}`,
        priority: sev === "critical" ? "critical" : "high",
        payload: { temperatureGap: state.temperatureGap },
      };
    }
  }

  // 3. 長期無活動 — 7日以上
  if (state.daysSinceLastActivity >= 7) {
    return {
      type: "trigger_nudge",
      reason: `${state.daysSinceLastActivity}日間活動なし`,
      priority: "medium",
      payload: { daysSinceLastActivity: state.daysSinceLastActivity },
    };
  }

  // 4. 会話が冷えている — cool状態 + 一定メッセージ数以上
  if (state.climateState === "cool" && state.messageCount >= 10) {
    return {
      type: "suggest_game",
      reason: "会話が表面的になっている — ゲームで本音を引き出すタイミング",
      priority: "medium",
      payload: {
        suggestedCategory: "deepening" as GameCategory,
        relationshipPhase: state.relationshipPhase,
      },
    };
  }

  // 5. 関係が停滞 — flame以上 + 3日以上無進展
  if (
    state.relationshipPhase !== "spark" &&
    state.daysSinceLastActivity >= 3 &&
    state.messageCount >= 20
  ) {
    return {
      type: "suggest_game",
      reason: "関係が停滞気味 — 新しい切り口で刺激",
      priority: "low",
      payload: {
        suggestedCategory: "playful" as GameCategory,
        relationshipPhase: state.relationshipPhase,
      },
    };
  }

  // 6. spark フェーズ + 初期 — icebreaker推薦
  if (state.relationshipPhase === "spark" && state.messageCount >= 3 && state.messageCount < 15) {
    return {
      type: "suggest_game",
      reason: "接続初期 — アイスブレイカーで距離を縮める",
      priority: "low",
      payload: {
        suggestedCategory: "icebreaker" as GameCategory,
        relationshipPhase: state.relationshipPhase,
      },
    };
  }

  return {
    type: "no_action",
    reason: "現在推薦なし — 関係は順調",
    priority: "low",
    payload: {},
  };
}

// ── ゲーム推薦ディスパッチ ──

/**
 * Counselorの判断に基づき、最適なゲームを1つ選定する。
 */
export function selectGameForRecommendation(
  recommendation: CounselorRecommendation,
): CoupleGame | null {
  if (recommendation.type !== "suggest_game") return null;

  const category = recommendation.payload.suggestedCategory as GameCategory | undefined;
  const phase = recommendation.payload.relationshipPhase as RelationshipPhase | undefined;

  const available = getAvailableGames(phase ?? "spark", category);
  if (available.length === 0) return null;

  // ランダム選定（将来: ユーザー履歴で重複回避）
  return available[Math.floor(Math.random() * available.length)];
}

// ── ナッジ送信ディスパッチ ──

/**
 * Counselorの trigger_nudge 推薦を実行する。
 * notificationScheduler 経由で遅延通知をキューに入れる。
 */
export async function dispatchNudge(params: {
  userId: string;
  candidateId: string;
  recommendation: CounselorRecommendation;
}): Promise<{ scheduled: boolean; scheduledFor?: string }> {
  if (params.recommendation.type !== "trigger_nudge") {
    return { scheduled: false };
  }

  const { scheduleDelayedNotification } = await import("../notificationScheduler");

  const result = await scheduleDelayedNotification(params.userId, "nudge", {
    candidateId: params.candidateId,
    payload: {
      source: "counselor_orchestrator",
      reason: params.recommendation.reason,
      daysSinceLastActivity: params.recommendation.payload.daysSinceLastActivity,
    },
  });

  return {
    scheduled: result.scheduled,
    scheduledFor: result.scheduledFor,
  };
}
