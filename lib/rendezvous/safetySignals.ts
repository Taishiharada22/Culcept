// ============================================================
// Phase 6: 行動安全シグナル検出
// NLP不要のパターンベース安全性チェック
// ============================================================

export type SafetySignal = {
  type: SafetySignalType;
  severity: 1 | 2 | 3 | 4 | 5;
  action: "log" | "warn" | "hold" | "block";
  evidence: Record<string, unknown>;
  detectedAt: string;
};

export type SafetySignalType =
  | "rapid_like_all"      // 大量一括いいね（スパム疑い）
  | "message_escalation"  // 急激なメッセージ頻度増加
  | "multiple_reports"    // 複数ユーザーからの通報
  | "ghosting_pattern"    // マッチ後の反復無応答
  | "boundary_violation"  // 不在期間中の反復メッセージ
  | "obsessive_viewing";  // 同一ユーザーの反復閲覧

type BehaviorLog = {
  likeCount24h: number;
  passCount24h: number;
  totalSwipes24h: number;
  messageCountPerCandidate: Record<string, { sent: number; received: number; lastSentAt: string }>;
  reportCount: number;
  reporterCount: number;
  mutualLikeCount: number;
  chatOpenedCount: number;
  chatRespondedCount: number;
  viewingCountPerCandidate?: Record<string, number>;
};

/**
 * ユーザーの行動ログから安全シグナルを検出
 */
export function evaluateSafetySignals(
  userId: string,
  behavior: BehaviorLog,
): SafetySignal[] {
  const signals: SafetySignal[] = [];
  const now = new Date().toISOString();

  // 1. 大量一括いいね
  if (behavior.totalSwipes24h >= 20) {
    const likeRate = behavior.likeCount24h / behavior.totalSwipes24h;
    if (likeRate > 0.80) {
      signals.push({
        type: "rapid_like_all",
        severity: 3,
        action: "warn",
        evidence: {
          likeRate,
          totalSwipes: behavior.totalSwipes24h,
          likeCount: behavior.likeCount24h,
        },
        detectedAt: now,
      });
    }
  }

  // 2. メッセージエスカレーション
  for (const [candidateId, stats] of Object.entries(behavior.messageCountPerCandidate)) {
    // 送信10以上、受信0 → 一方的メッセージ
    if (stats.sent >= 10 && stats.received === 0) {
      signals.push({
        type: "message_escalation",
        severity: 4,
        action: "hold",
        evidence: { candidateId, sent: stats.sent, received: stats.received },
        detectedAt: now,
      });
    }
    // 送信が受信の5倍以上
    if (stats.sent >= 15 && stats.received > 0 && stats.sent / stats.received >= 5) {
      signals.push({
        type: "message_escalation",
        severity: 3,
        action: "warn",
        evidence: { candidateId, ratio: stats.sent / stats.received },
        detectedAt: now,
      });
    }
  }

  // 3. 複数ユーザーからの通報
  if (behavior.reporterCount >= 3) {
    signals.push({
      type: "multiple_reports",
      severity: 5,
      action: "block",
      evidence: { reportCount: behavior.reportCount, reporterCount: behavior.reporterCount },
      detectedAt: now,
    });
  } else if (behavior.reporterCount >= 2) {
    signals.push({
      type: "multiple_reports",
      severity: 4,
      action: "hold",
      evidence: { reportCount: behavior.reportCount, reporterCount: behavior.reporterCount },
      detectedAt: now,
    });
  }

  // 4. ゴースティングパターン
  if (behavior.mutualLikeCount >= 5 && behavior.chatRespondedCount === 0) {
    signals.push({
      type: "ghosting_pattern",
      severity: 2,
      action: "warn",
      evidence: {
        mutualLikes: behavior.mutualLikeCount,
        responded: behavior.chatRespondedCount,
      },
      detectedAt: now,
    });
  }

  // 5. 反復閲覧
  if (behavior.viewingCountPerCandidate) {
    for (const [candidateId, count] of Object.entries(behavior.viewingCountPerCandidate)) {
      if (count >= 15) {
        signals.push({
          type: "obsessive_viewing",
          severity: 2,
          action: "log",
          evidence: { candidateId, viewCount: count },
          detectedAt: now,
        });
      }
    }
  }

  return signals;
}

/**
 * シグナルの最も深刻なアクションを決定
 */
export function determineAction(signals: SafetySignal[]): "none" | "log" | "warn" | "hold" | "block" {
  if (signals.length === 0) return "none";

  const actionPriority: Record<string, number> = {
    log: 1,
    warn: 2,
    hold: 3,
    block: 4,
  };

  let maxPriority = 0;
  let maxAction: "log" | "warn" | "hold" | "block" = "log";

  for (const signal of signals) {
    const priority = actionPriority[signal.action] ?? 0;
    if (priority > maxPriority) {
      maxPriority = priority;
      maxAction = signal.action;
    }
  }

  return maxAction;
}
