/**
 * Implicit Observatory - 暗黙的行動観測エンジン
 *
 * ユーザーの明示的入力なしに行動パターンを観測し、
 * Stargazer性格軸 (MatchingVector) を漸進的に調整する。
 * 指数平滑法で既存値と新規観測をブレンドする。
 */

import type { MatchingVector } from "@/lib/rendezvous/types";

// ============================================================
// Types
// ============================================================

export type BehaviorEventType =
  | "profile_view_duration"
  | "message_reply_latency"
  | "message_length_pattern"
  | "swipe_hesitation"
  | "activity_completion_rate"
  | "conversation_initiation"
  | "emoji_usage_frequency"
  | "voice_message_frequency"
  | "peak_activity_hours"
  | "deep_question_engagement"
  | "conflict_avoidance_signal"
  | "session_depth"
  | "return_pattern"
  | "save_vs_pass_ratio"
  | "photo_carousel_behavior"
  | "conversation_view_start"
  | "conversation_view_duration";

export type ObservableEvent = {
  type: BehaviorEventType;
  metadata: Record<string, unknown>;
  timestamp: string;
};

export type AxisAdjustment = {
  axis: keyof MatchingVector;
  delta: number; // -0.1..+0.1
  confidence: number; // 0..1
  reason: string;
};

export type ObservationSummary = {
  adjustments: AxisAdjustment[];
  totalEventsProcessed: number;
  lastProcessedAt: string;
  insights: ObservationInsight[];
};

export type ObservationInsight = {
  type: "pattern_detected" | "shift_detected" | "contradiction_detected";
  axis: string;
  description: string; // Japanese
  significance: number; // 0..1
};

// ============================================================
// Constants
// ============================================================

/** Clamp helper: keep value within [min, max] */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Maximum absolute delta per single event */
const MAX_DELTA = 0.1;

/** Default learning rate for exponential smoothing */
const DEFAULT_LEARNING_RATE = 0.15;

// ============================================================
// Event -> Axis Adjustment Mappings
// ============================================================

/**
 * Convert a single observable event into zero or more axis adjustments.
 * Each mapping function interprets `event.metadata` to decide direction & magnitude.
 */
export function processEvent(event: ObservableEvent): AxisAdjustment[] {
  const handler = EVENT_HANDLERS[event.type];
  if (!handler) return [];
  return handler(event.metadata).map((adj) => ({
    ...adj,
    delta: clamp(adj.delta, -MAX_DELTA, MAX_DELTA),
    confidence: clamp(adj.confidence, 0, 1),
  }));
}

type EventHandler = (meta: Record<string, unknown>) => AxisAdjustment[];

const EVENT_HANDLERS: Record<BehaviorEventType, EventHandler> = {
  // ----------------------------------------------------------
  profile_view_duration: (meta) => {
    const durationSec = Number(meta.duration_seconds ?? 0);
    if (durationSec <= 0) return [];
    const adjustments: AxisAdjustment[] = [];
    if (durationSec > 30) {
      adjustments.push({
        axis: "depth_speed",
        delta: clamp(0.02 + (durationSec - 30) * 0.001, 0, 0.05),
        confidence: Math.min(durationSec / 120, 0.8),
        reason: "プロフィールを深く閲覧 (>30秒)",
      });
    }
    if (durationSec < 5) {
      adjustments.push({
        axis: "stimulation_need",
        delta: 0.02,
        confidence: 0.4,
        reason: "プロフィール閲覧が非常に短い (<5秒)",
      });
    }
    return adjustments;
  },

  // ----------------------------------------------------------
  message_reply_latency: (meta) => {
    const latencyMinutes = Number(meta.latency_minutes ?? -1);
    if (latencyMinutes < 0) return [];
    const adjustments: AxisAdjustment[] = [];
    if (latencyMinutes < 5) {
      adjustments.push({
        axis: "conversation_temperature",
        delta: 0.03,
        confidence: 0.6,
        reason: "メッセージへの返信が早い (<5分)",
      });
      adjustments.push({
        axis: "initiative",
        delta: 0.02,
        confidence: 0.4,
        reason: "即座に返信する傾向",
      });
    } else if (latencyMinutes > 120) {
      adjustments.push({
        axis: "distance_need",
        delta: 0.03,
        confidence: 0.5,
        reason: "返信に時間をかける傾向 (>2時間)",
      });
    }
    return adjustments;
  },

  // ----------------------------------------------------------
  message_length_pattern: (meta) => {
    const avgLength = Number(meta.avg_length ?? 0);
    if (avgLength <= 0) return [];
    const adjustments: AxisAdjustment[] = [];
    if (avgLength > 100) {
      adjustments.push({
        axis: "emotional_openness",
        delta: 0.04,
        confidence: 0.6,
        reason: "長文メッセージが多い (平均>100文字)",
      });
      adjustments.push({
        axis: "depth_speed",
        delta: 0.03,
        confidence: 0.5,
        reason: "詳細な表現を好む傾向",
      });
    } else if (avgLength < 20) {
      adjustments.push({
        axis: "distance_need",
        delta: 0.02,
        confidence: 0.4,
        reason: "短文メッセージが多い (平均<20文字)",
      });
    }
    return adjustments;
  },

  // ----------------------------------------------------------
  swipe_hesitation: (meta) => {
    const hesitationMs = Number(meta.hesitation_ms ?? 0);
    if (hesitationMs <= 0) return [];
    const adjustments: AxisAdjustment[] = [];
    if (hesitationMs > 3000) {
      adjustments.push({
        axis: "stability_need",
        delta: 0.04,
        confidence: 0.5,
        reason: "判断に慎重 (>3秒の逡巡)",
      });
      adjustments.push({
        axis: "structure_preference",
        delta: 0.02,
        confidence: 0.4,
        reason: "慎重な意思決定パターン",
      });
    } else if (hesitationMs < 800) {
      adjustments.push({
        axis: "stimulation_need",
        delta: 0.03,
        confidence: 0.5,
        reason: "即断即決の傾向 (<0.8秒)",
      });
    }
    return adjustments;
  },

  // ----------------------------------------------------------
  activity_completion_rate: (meta) => {
    const rate = Number(meta.completion_rate ?? -1);
    if (rate < 0 || rate > 1) return [];
    const adjustments: AxisAdjustment[] = [];
    if (rate > 0.8) {
      adjustments.push({
        axis: "structure_preference",
        delta: 0.04,
        confidence: 0.6,
        reason: "アクティビティ完遂率が高い (>80%)",
      });
      adjustments.push({
        axis: "stability_need",
        delta: 0.02,
        confidence: 0.4,
        reason: "責任感の強さを示唆",
      });
    } else if (rate < 0.3) {
      adjustments.push({
        axis: "stimulation_need",
        delta: 0.03,
        confidence: 0.5,
        reason: "アクティビティの途中離脱が多い (<30%)",
      });
    }
    return adjustments;
  },

  // ----------------------------------------------------------
  conversation_initiation: (meta) => {
    const initiated = Boolean(meta.is_initiator);
    const adjustments: AxisAdjustment[] = [];
    if (initiated) {
      adjustments.push({
        axis: "initiative",
        delta: 0.05,
        confidence: 0.7,
        reason: "自ら会話を開始",
      });
      adjustments.push({
        axis: "social_energy",
        delta: 0.03,
        confidence: 0.5,
        reason: "積極的なコミュニケーション意欲",
      });
    } else {
      adjustments.push({
        axis: "initiative",
        delta: -0.02,
        confidence: 0.3,
        reason: "会話開始を待つ傾向",
      });
    }
    return adjustments;
  },

  // ----------------------------------------------------------
  emoji_usage_frequency: (meta) => {
    const ratio = Number(meta.emoji_ratio ?? -1); // emojis per message
    if (ratio < 0) return [];
    const adjustments: AxisAdjustment[] = [];
    if (ratio > 1.5) {
      adjustments.push({
        axis: "emotional_openness",
        delta: 0.03,
        confidence: 0.5,
        reason: "絵文字の使用頻度が高い",
      });
      adjustments.push({
        axis: "conversation_temperature",
        delta: 0.02,
        confidence: 0.4,
        reason: "感情豊かなコミュニケーション",
      });
    } else if (ratio < 0.1) {
      adjustments.push({
        axis: "emotional_openness",
        delta: -0.02,
        confidence: 0.3,
        reason: "絵文字をほとんど使わない",
      });
    }
    return adjustments;
  },

  // ----------------------------------------------------------
  voice_message_frequency: (meta) => {
    const ratio = Number(meta.voice_ratio ?? -1); // voice msgs / total msgs
    if (ratio < 0) return [];
    const adjustments: AxisAdjustment[] = [];
    if (ratio > 0.3) {
      adjustments.push({
        axis: "emotional_openness",
        delta: 0.04,
        confidence: 0.6,
        reason: "ボイスメッセージを多用 (>30%)",
      });
      adjustments.push({
        axis: "social_energy",
        delta: 0.03,
        confidence: 0.5,
        reason: "声でのコミュニケーションを好む",
      });
    }
    return adjustments;
  },

  // ----------------------------------------------------------
  peak_activity_hours: (meta) => {
    const hour = Number(meta.peak_hour ?? -1);
    if (hour < 0 || hour > 23) return [];
    const adjustments: AxisAdjustment[] = [];
    // Late-night activity (22:00-02:00)
    if (hour >= 22 || hour < 2) {
      adjustments.push({
        axis: "stimulation_need",
        delta: 0.02,
        confidence: 0.3,
        reason: "深夜帯にアクティブ (22:00-02:00)",
      });
    }
    // Early morning (5:00-7:00)
    if (hour >= 5 && hour <= 7) {
      adjustments.push({
        axis: "structure_preference",
        delta: 0.02,
        confidence: 0.3,
        reason: "早朝にアクティブ (5:00-7:00)",
      });
    }
    return adjustments;
  },

  // ----------------------------------------------------------
  deep_question_engagement: (meta) => {
    const isDeep = Boolean(meta.is_deep_topic);
    const engagementScore = Number(meta.engagement_score ?? 0); // 0..1
    const adjustments: AxisAdjustment[] = [];
    if (isDeep && engagementScore > 0.6) {
      adjustments.push({
        axis: "depth_speed",
        delta: 0.05,
        confidence: engagementScore * 0.8,
        reason: "深いトピックへの高い関与",
      });
      adjustments.push({
        axis: "emotional_openness",
        delta: 0.03,
        confidence: engagementScore * 0.6,
        reason: "深い会話で感情を開示",
      });
    } else if (!isDeep && engagementScore > 0.7) {
      adjustments.push({
        axis: "social_energy",
        delta: 0.03,
        confidence: 0.5,
        reason: "軽い話題での高い活性",
      });
    }
    return adjustments;
  },

  // ----------------------------------------------------------
  conflict_avoidance_signal: (meta) => {
    const avoided = Boolean(meta.conflict_avoided);
    const adjustments: AxisAdjustment[] = [];
    if (avoided) {
      adjustments.push({
        axis: "conflict_directness",
        delta: -0.04,
        confidence: 0.6,
        reason: "緊張場面で回避行動",
      });
      adjustments.push({
        axis: "stability_need",
        delta: 0.03,
        confidence: 0.5,
        reason: "衝突を避けて安定を維持する傾向",
      });
    } else {
      adjustments.push({
        axis: "conflict_directness",
        delta: 0.03,
        confidence: 0.5,
        reason: "緊張場面でも直接的に対応",
      });
    }
    return adjustments;
  },

  // ----------------------------------------------------------
  session_depth: (meta) => {
    const pagesViewed = Number(meta.pages_viewed ?? 0);
    const durationMin = Number(meta.duration_minutes ?? 0);
    if (pagesViewed <= 0 || durationMin <= 0) return [];
    const adjustments: AxisAdjustment[] = [];
    if (pagesViewed > 10 && durationMin > 15) {
      adjustments.push({
        axis: "depth_speed",
        delta: 0.04,
        confidence: 0.5,
        reason: "セッションが深い (>10ページ、>15分)",
      });
    }
    if (durationMin > 30) {
      adjustments.push({
        axis: "stimulation_need",
        delta: -0.02,
        confidence: 0.3,
        reason: "長時間の集中利用 (>30分)",
      });
    }
    return adjustments;
  },

  // ----------------------------------------------------------
  return_pattern: (meta) => {
    const pattern = String(meta.pattern ?? ""); // "daily" | "sporadic" | "binge"
    const adjustments: AxisAdjustment[] = [];
    switch (pattern) {
      case "daily":
        adjustments.push({
          axis: "structure_preference",
          delta: 0.04,
          confidence: 0.6,
          reason: "毎日安定的に利用",
        });
        adjustments.push({
          axis: "stability_need",
          delta: 0.03,
          confidence: 0.5,
          reason: "ルーティーン的な利用パターン",
        });
        break;
      case "sporadic":
        adjustments.push({
          axis: "distance_need",
          delta: 0.03,
          confidence: 0.4,
          reason: "散発的な利用パターン",
        });
        break;
      case "binge":
        adjustments.push({
          axis: "stimulation_need",
          delta: 0.04,
          confidence: 0.5,
          reason: "集中的・没入型の利用パターン",
        });
        break;
    }
    return adjustments;
  },

  // ----------------------------------------------------------
  save_vs_pass_ratio: (meta) => {
    const saveRatio = Number(meta.save_ratio ?? -1); // 0..1
    if (saveRatio < 0 || saveRatio > 1) return [];
    const adjustments: AxisAdjustment[] = [];
    if (saveRatio > 0.6) {
      adjustments.push({
        axis: "stability_need",
        delta: 0.04,
        confidence: 0.6,
        reason: "保存率が高い (>60%) - 慎重な判断者",
      });
      adjustments.push({
        axis: "structure_preference",
        delta: 0.02,
        confidence: 0.4,
        reason: "後で見返すための保存傾向",
      });
    } else if (saveRatio < 0.15) {
      adjustments.push({
        axis: "stimulation_need",
        delta: 0.03,
        confidence: 0.5,
        reason: "即決傾向 (保存<15%)",
      });
    }
    return adjustments;
  },

  // ----------------------------------------------------------
  photo_carousel_behavior: (meta) => {
    const avgViewTimeMs = Number(meta.avg_view_time_ms ?? 0);
    const photosViewed = Number(meta.photos_viewed ?? 0);
    const totalPhotos = Number(meta.total_photos ?? 0);
    if (totalPhotos <= 0) return [];
    const adjustments: AxisAdjustment[] = [];
    const viewRatio = photosViewed / totalPhotos;
    if (viewRatio > 0.8 && avgViewTimeMs > 2000) {
      adjustments.push({
        axis: "depth_speed",
        delta: 0.03,
        confidence: 0.5,
        reason: "写真を丁寧に全て確認",
      });
    }
    if (avgViewTimeMs < 500 && photosViewed <= 2) {
      adjustments.push({
        axis: "stimulation_need",
        delta: 0.02,
        confidence: 0.3,
        reason: "写真を素早く流し見",
      });
    }
    return adjustments;
  },

  conversation_view_start: () => [],
  conversation_view_duration: () => [],
};

// ============================================================
// Aggregation
// ============================================================

/**
 * Merge multiple axis adjustments into a single partial MatchingVector update.
 * Uses confidence-weighted averaging when the same axis appears multiple times.
 */
export function aggregateAdjustments(
  adjustments: AxisAdjustment[],
): Partial<MatchingVector> {
  const byAxis: Record<string, { weightedSum: number; weightSum: number }> = {};

  for (const adj of adjustments) {
    if (!byAxis[adj.axis]) {
      byAxis[adj.axis] = { weightedSum: 0, weightSum: 0 };
    }
    byAxis[adj.axis].weightedSum += adj.delta * adj.confidence;
    byAxis[adj.axis].weightSum += adj.confidence;
  }

  const result: Partial<MatchingVector> = {};
  for (const [axis, { weightedSum, weightSum }] of Object.entries(byAxis)) {
    if (weightSum > 0) {
      const avgDelta = weightedSum / weightSum;
      (result as Record<string, number>)[axis] = clamp(avgDelta, -MAX_DELTA, MAX_DELTA);
    }
  }
  return result;
}

// ============================================================
// Pattern Detection
// ============================================================

/**
 * Analyze a stream of events to detect behavioral patterns, shifts, and contradictions.
 */
export function detectPatterns(events: ObservableEvent[]): ObservationInsight[] {
  if (events.length < 5) return [];

  const insights: ObservationInsight[] = [];

  // --- Pattern: Consistent reply speed ---
  const replyEvents = events.filter((e) => e.type === "message_reply_latency");
  if (replyEvents.length >= 3) {
    const latencies = replyEvents.map((e) => Number(e.metadata.latency_minutes ?? 0));
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const stdDev = Math.sqrt(
      latencies.reduce((sum, l) => sum + (l - avg) ** 2, 0) / latencies.length,
    );
    if (stdDev < avg * 0.3 && avg < 10) {
      insights.push({
        type: "pattern_detected",
        axis: "conversation_temperature",
        description: `返信速度に一貫性あり (平均${avg.toFixed(0)}分, 偏差小)`,
        significance: 0.7,
      });
    }
  }

  // --- Pattern: Deepening engagement over time ---
  const sortedByTime = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  const half = Math.floor(sortedByTime.length / 2);
  const firstHalf = sortedByTime.slice(0, half);
  const secondHalf = sortedByTime.slice(half);

  const avgSessionDepth = (evts: ObservableEvent[]) => {
    const sessionEvents = evts.filter((e) => e.type === "session_depth");
    if (sessionEvents.length === 0) return 0;
    return (
      sessionEvents.reduce((sum, e) => sum + Number(e.metadata.pages_viewed ?? 0), 0) /
      sessionEvents.length
    );
  };

  const firstDepth = avgSessionDepth(firstHalf);
  const secondDepth = avgSessionDepth(secondHalf);
  if (firstDepth > 0 && secondDepth > firstDepth * 1.5) {
    insights.push({
      type: "shift_detected",
      axis: "depth_speed",
      description: "利用の深さが時間とともに増加傾向",
      significance: 0.6,
    });
  }

  // --- Contradiction: Long messages but avoids deep topics ---
  const longMsgEvents = events.filter(
    (e) => e.type === "message_length_pattern" && Number(e.metadata.avg_length ?? 0) > 100,
  );
  const shallowEngagement = events.filter(
    (e) =>
      e.type === "deep_question_engagement" &&
      !e.metadata.is_deep_topic &&
      Number(e.metadata.engagement_score ?? 0) > 0.5,
  );
  if (longMsgEvents.length >= 2 && shallowEngagement.length >= 2) {
    insights.push({
      type: "contradiction_detected",
      axis: "emotional_openness",
      description:
        "長文を書くが深いトピックを避ける傾向 - 表面的な親密さと内面の距離感の矛盾",
      significance: 0.8,
    });
  }

  // --- Pattern: Night owl with impulsive decisions ---
  const lateNightEvents = events.filter((e) => {
    const hour = new Date(e.timestamp).getHours();
    return hour >= 22 || hour < 2;
  });
  const quickSwipes = events.filter(
    (e) => e.type === "swipe_hesitation" && Number(e.metadata.hesitation_ms ?? 9999) < 800,
  );
  if (lateNightEvents.length >= 3 && quickSwipes.length >= 2) {
    insights.push({
      type: "pattern_detected",
      axis: "stimulation_need",
      description: "深夜帯に即断傾向 - 刺激追求型の行動パターン",
      significance: 0.6,
    });
  }

  // --- Shift: Initiative changing ---
  const initiationEvents = events.filter((e) => e.type === "conversation_initiation");
  if (initiationEvents.length >= 4) {
    const firstInitiations = initiationEvents.slice(0, Math.floor(initiationEvents.length / 2));
    const secondInitiations = initiationEvents.slice(Math.floor(initiationEvents.length / 2));
    const firstRate =
      firstInitiations.filter((e) => e.metadata.is_initiator).length / firstInitiations.length;
    const secondRate =
      secondInitiations.filter((e) => e.metadata.is_initiator).length / secondInitiations.length;
    if (Math.abs(secondRate - firstRate) > 0.3) {
      const direction = secondRate > firstRate ? "積極的" : "受動的";
      insights.push({
        type: "shift_detected",
        axis: "initiative",
        description: `会話開始の傾向が${direction}に変化`,
        significance: 0.7,
      });
    }
  }

  return insights;
}

// ============================================================
// Exponential Smoothing Blend
// ============================================================

/**
 * Blend observed axis updates into an existing MatchingVector using exponential smoothing.
 *
 * new_value = current + learningRate * observed_delta
 *
 * All values are clamped to [0, 1].
 */
export function blendWithExisting(
  current: MatchingVector,
  observed: Partial<MatchingVector>,
  learningRate: number = DEFAULT_LEARNING_RATE,
): MatchingVector {
  const rate = clamp(learningRate, 0.01, 0.5);
  const result = { ...current };

  for (const [key, delta] of Object.entries(observed) as [keyof MatchingVector, number][]) {
    if (key in result && typeof delta === "number") {
      // `delta` from aggregateAdjustments is already a weighted-average delta
      const updated = result[key] + rate * delta;
      result[key] = clamp(updated, 0, 1);
    }
  }

  return result;
}
