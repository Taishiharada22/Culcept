/**
 * Metamorphosis Engine - 関係の変態
 *
 * 会話パターンの時間的変化（頻度・深さ・時間帯・応答速度）を検出し、
 * 関係の「変態」シグナルとしてユーザーに静かに届ける。
 *
 * データダンプではなく、Animaからの囁きとして。
 */

// =============================================================================
// Types
// =============================================================================

export type MetamorphosisSignalType =
  | "frequency_change"
  | "depth_shift"
  | "time_shift"
  | "warmth_rising"
  | "warmth_cooling";

export interface MetamorphosisSignal {
  type: MetamorphosisSignalType;
  direction: "rising" | "cooling" | "shifting";
  magnitude: number; // 0..1
  whisperJa: string;
  dataSnapshot: Record<string, unknown>;
}

interface MessageStats {
  period: "recent" | "previous";
  count: number;
  avgLength: number;
  avgReplyMs: number;
  peakHour: number;
}

// =============================================================================
// Stats Computation
// =============================================================================

export function computeMessageStats(
  messages: { body: string; sender_id: string; created_at: string }[],
  userId: string,
  periodStart: Date,
  periodEnd: Date,
): MessageStats {
  const filtered = messages.filter((m) => {
    const t = new Date(m.created_at).getTime();
    return t >= periodStart.getTime() && t < periodEnd.getTime();
  });

  const userMsgs = filtered.filter((m) => m.sender_id === userId);
  const avgLength =
    userMsgs.length > 0
      ? userMsgs.reduce((s, m) => s + (m.body?.length || 0), 0) /
        userMsgs.length
      : 0;

  // Compute average reply time
  let totalReplyMs = 0;
  let replyCount = 0;
  for (let i = 1; i < filtered.length; i++) {
    if (
      filtered[i].sender_id === userId &&
      filtered[i - 1].sender_id !== userId
    ) {
      const diff =
        new Date(filtered[i].created_at).getTime() -
        new Date(filtered[i - 1].created_at).getTime();
      if (diff > 0 && diff < 24 * 60 * 60 * 1000) {
        totalReplyMs += diff;
        replyCount++;
      }
    }
  }

  // Peak hour
  const hourCounts: Record<number, number> = {};
  for (const m of userMsgs) {
    const h = new Date(m.created_at).getHours();
    hourCounts[h] = (hourCounts[h] || 0) + 1;
  }
  const peakHour =
    Object.entries(hourCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "12";

  return {
    period:
      periodStart.getTime() <
      periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000
        ? "previous"
        : "recent",
    count: filtered.length,
    avgLength,
    avgReplyMs: replyCount > 0 ? totalReplyMs / replyCount : 0,
    peakHour: parseInt(peakHour as string),
  };
}

// =============================================================================
// Signal Detection
// =============================================================================

export function detectMetamorphosis(
  recentStats: MessageStats,
  previousStats: MessageStats,
): MetamorphosisSignal[] {
  const signals: MetamorphosisSignal[] = [];

  if (previousStats.count < 5 || recentStats.count < 5) return signals;

  const freqRatio = recentStats.count / previousStats.count;
  const depthRatio = recentStats.avgLength / (previousStats.avgLength || 1);
  const replyRatio =
    previousStats.avgReplyMs > 0
      ? recentStats.avgReplyMs / previousStats.avgReplyMs
      : 1;

  // Frequency change (+/-50%)
  if (freqRatio > 1.5) {
    signals.push({
      type: "frequency_change",
      direction: "rising",
      magnitude: Math.min(1, (freqRatio - 1) / 2),
      whisperJa: "この方との会話の頻度が増えています",
      dataSnapshot: {
        freqRatio,
        recentCount: recentStats.count,
        previousCount: previousStats.count,
      },
    });
  } else if (freqRatio < 0.5) {
    signals.push({
      type: "frequency_change",
      direction: "cooling",
      magnitude: Math.min(1, (1 - freqRatio) / 2),
      whisperJa: "この方との会話が、少し静かになっています",
      dataSnapshot: {
        freqRatio,
        recentCount: recentStats.count,
        previousCount: previousStats.count,
      },
    });
  }

  // Depth shift (+/-40%)
  if (depthRatio > 1.4) {
    signals.push({
      type: "depth_shift",
      direction: "rising",
      magnitude: Math.min(1, (depthRatio - 1) / 1.5),
      whisperJa:
        "以前より深い話が増えています。あなたの心が開いているのかもしれません",
      dataSnapshot: {
        depthRatio,
        recentAvg: recentStats.avgLength,
        previousAvg: previousStats.avgLength,
      },
    });
  } else if (depthRatio < 0.6) {
    signals.push({
      type: "depth_shift",
      direction: "cooling",
      magnitude: Math.min(1, (1 - depthRatio) / 1.5),
      whisperJa: "会話が少し浅くなっています。忙しい時期でしょうか",
      dataSnapshot: { depthRatio },
    });
  }

  // Time shift
  if (Math.abs(recentStats.peakHour - previousStats.peakHour) >= 4) {
    const isToNight =
      recentStats.peakHour >= 21 || recentStats.peakHour < 5;
    signals.push({
      type: "time_shift",
      direction: "shifting",
      magnitude: 0.6,
      whisperJa: isToNight
        ? "この方との会話が、夜に移り始めています"
        : "この方との会話の時間帯が変わってきています",
      dataSnapshot: {
        recentPeak: recentStats.peakHour,
        previousPeak: previousStats.peakHour,
      },
    });
  }

  // Compound: warmth rising (freq up + depth up + reply faster)
  if (freqRatio > 1.3 && depthRatio > 1.2 && replyRatio < 0.8) {
    signals.push({
      type: "warmth_rising",
      direction: "rising",
      magnitude: Math.min(1, (freqRatio + depthRatio - 2) / 2),
      whisperJa: "この方との会話のリズムが、最近変わってきています",
      dataSnapshot: { freqRatio, depthRatio, replyRatio },
    });
  }

  // Compound: warmth cooling (freq down + depth down + reply slower)
  if (freqRatio < 0.7 && depthRatio < 0.8 && replyRatio > 1.3) {
    signals.push({
      type: "warmth_cooling",
      direction: "cooling",
      magnitude: Math.min(1, (2 - freqRatio - depthRatio) / 2),
      whisperJa:
        "最近、この方との距離感に変化があります。あなた自身の状態の変化かもしれません",
      dataSnapshot: { freqRatio, depthRatio, replyRatio },
    });
  }

  return signals;
}

// =============================================================================
// Whisper Generator
// =============================================================================

export function generateMetamorphosisWhisper(
  signal: MetamorphosisSignal,
): string {
  return signal.whisperJa;
}
