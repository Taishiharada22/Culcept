// lib/architecture/edgeMicroInsights.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Edge-Computed Micro-Insights（エッジ即時洞察）
//
// 脳科学的根拠:
// オペラント条件づけは「即時強化」が最も効果的（Skinner, 1938）。
// 回答→0.05秒→insight の速度が「このアプリは生きている」感覚を作る。
// 遅延が1秒を超えると、強化効果は50%以上低下する。
//
// 設計思想:
// - ユーザーが回答した瞬間に < 50ms で micro-insight を返す
// - contradictionMapの簡易版をクライアントサイドで実行
// - 重い分析（ahaEngine等）はバックグラウンドで非同期
// - 即座のフィードバック → 考える時間 → 深い分析結果の段階的提示
//
// アーキテクチャ:
// 1. クライアントサイド: 軽量矛盾検出（<50ms）
// 2. Edge Function: 中程度の分析（<200ms）（将来的にEdge Runtimeに移行可能）
// 3. Server Function: 重い分析（<3s、非同期）
//
// 世界参照: GitHub Copilot（タイプ中にリアルタイム応答）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** マイクロインサイト（回答直後に即座に表示） */
export interface MicroInsight {
  /** インサイトのタイプ */
  type: MicroInsightType;
  /** 表示テキスト（1行） */
  text: string;
  /** 詳細テキスト（展開時に表示） */
  detail: string | null;
  /** 関連する軸 */
  axisId: string;
  /** 信頼度（0-1） */
  confidence: number;
  /** 驚き度（0-1、高いほどユーザーにとって予想外） */
  surprise: number;
  /** 生成にかかった時間（ms） */
  generationTimeMs: number;
}

export type MicroInsightType =
  | "contradiction_hint"     // 矛盾の予兆（前回と違う回答）
  | "pattern_confirmation"   // パターンの確認（いつもと同じ回答）
  | "context_shift"          // 文脈依存の変化（朝と夕方で違う等）
  | "speed_signal"           // 応答速度からの洞察（迷い vs 確信）
  | "trend_change"           // トレンド変化（過去数日と異なる方向）
  | "rare_answer"            // レアな回答（過去に選んだことがない選択肢）
  | "flip_detection"         // フリップ検出（前回と逆の回答）
  | "stability_note";        // 安定性の観測（この軸はいつも同じ）

/** ローカルの回答履歴（軽量版） */
export interface LocalAnswerHistory {
  axisId: string;
  /** 過去の回答スコア（直近10件） */
  scores: number[];
  /** 過去の回答時刻（直近10件） */
  timestamps: string[];
  /** 過去の応答時間（直近10件） */
  responseTimes: number[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Local Answer History Management
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const HISTORY_KEY = "aneurasync_micro_history_v1";
const MAX_HISTORY_PER_AXIS = 10;

/** ローカル履歴を読み込み */
function loadLocalHistory(): Record<string, LocalAnswerHistory> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** ローカル履歴に回答を追加 */
export function appendToLocalHistory(
  axisId: string,
  score: number,
  responseTimeMs: number,
): void {
  if (typeof window === "undefined") return;

  try {
    const history = loadLocalHistory();
    const entry = history[axisId] ?? {
      axisId,
      scores: [],
      timestamps: [],
      responseTimes: [],
    };

    entry.scores.push(score);
    entry.timestamps.push(new Date().toISOString());
    entry.responseTimes.push(responseTimeMs);

    // 上限管理
    if (entry.scores.length > MAX_HISTORY_PER_AXIS) {
      entry.scores = entry.scores.slice(-MAX_HISTORY_PER_AXIS);
      entry.timestamps = entry.timestamps.slice(-MAX_HISTORY_PER_AXIS);
      entry.responseTimes = entry.responseTimes.slice(-MAX_HISTORY_PER_AXIS);
    }

    history[axisId] = entry;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // quota exceeded
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Instant Micro-Insight Generation (<50ms)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 回答直後にマイクロインサイトを生成（<50ms）
 *
 * 全てクライアントサイドで計算。サーバー通信なし。
 * localStorageの履歴データのみを使用。
 */
export function generateMicroInsight(
  axisId: string,
  currentScore: number,
  responseTimeMs: number,
  axisLabel?: string,
): MicroInsight | null {
  const startTime = performance.now();
  const history = loadLocalHistory();
  const entry = history[axisId];

  if (!entry || entry.scores.length === 0) {
    // 初回回答 → 特別なメッセージ
    return {
      type: "pattern_confirmation",
      text: "最初のデータポイント。ここから地図が始まる",
      detail: null,
      axisId,
      confidence: 0.3,
      surprise: 0.2,
      generationTimeMs: performance.now() - startTime,
    };
  }

  const prevScores = entry.scores;
  const prevTimes = entry.responseTimes;
  const lastScore = prevScores[prevScores.length - 1];
  const label = axisLabel ?? axisId;

  // ─── 検出ロジック（優先度順） ───

  // 1. フリップ検出（前回と大きく逆の回答）
  const flip = Math.abs(currentScore - lastScore);
  if (flip >= 0.6) {
    return {
      type: "flip_detection",
      text: `前回と大きく異なる回答。何かが変わった？`,
      detail: `「${label}」について、前回と逆方向の回答。状況の変化か、心境の変化か。この差分が矛盾の手がかりになる`,
      axisId,
      confidence: 0.8,
      surprise: 0.9,
      generationTimeMs: performance.now() - startTime,
    };
  }

  // 2. 矛盾の予兆（直近3回と大きく異なる）
  if (prevScores.length >= 3) {
    const recentAvg =
      prevScores.slice(-3).reduce((s, v) => s + v, 0) / 3;
    const deviation = Math.abs(currentScore - recentAvg);
    if (deviation >= 0.4) {
      return {
        type: "contradiction_hint",
        text: `普段とは異なる回答。矛盾の入口かもしれない`,
        detail: `最近の傾向からの逸脱を検出。この軸で新しい矛盾が見つかる可能性がある`,
        axisId,
        confidence: 0.7,
        surprise: 0.8,
        generationTimeMs: performance.now() - startTime,
      };
    }
  }

  // 3. レアアンサー（過去に選んだことがないゾーン）
  const scoreBuckets = new Set(
    prevScores.map((s) => Math.round(s * 4) / 4), // 0.25刻み
  );
  const currentBucket = Math.round(currentScore * 4) / 4;
  if (!scoreBuckets.has(currentBucket) && prevScores.length >= 5) {
    return {
      type: "rare_answer",
      text: `この回答は初めて。新しい側面が見えた`,
      detail: `「${label}」で過去に選んだことのないゾーンの回答。あなたの中に新しい傾向が生まれている可能性`,
      axisId,
      confidence: 0.6,
      surprise: 0.7,
      generationTimeMs: performance.now() - startTime,
    };
  }

  // 4. 応答速度シグナル（迷い vs 確信）
  if (prevTimes.length >= 3) {
    const avgTime =
      prevTimes.slice(-3).reduce((s, t) => s + t, 0) / 3;

    // 今回の応答が平均の3倍以上遅い → 強い葛藤
    if (responseTimeMs > avgTime * 3 && responseTimeMs > 5000) {
      return {
        type: "speed_signal",
        text: `普段より長く迷った。この問いに葛藤がある`,
        detail: `「${label}」への応答に普段の3倍以上の時間をかけた。この軸が今のあなたにとって重要な意味を持っている`,
        axisId,
        confidence: 0.65,
        surprise: 0.6,
        generationTimeMs: performance.now() - startTime,
      };
    }

    // 今回の応答が平均の1/3以下速い → 強い確信
    if (responseTimeMs < avgTime / 3 && responseTimeMs < 2000 && avgTime > 3000) {
      return {
        type: "speed_signal",
        text: `即答。この問いには迷いがない`,
        detail: `「${label}」に対して普段の1/3の時間で回答。この領域は自分の中で確信がある`,
        axisId,
        confidence: 0.6,
        surprise: 0.4,
        generationTimeMs: performance.now() - startTime,
      };
    }
  }

  // 5. トレンド変化検出
  if (prevScores.length >= 5) {
    const firstHalf = prevScores.slice(0, Math.floor(prevScores.length / 2));
    const secondHalf = prevScores.slice(Math.floor(prevScores.length / 2));
    const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
    const secondAvg =
      secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;

    const trendDirection =
      secondAvg > firstAvg + 0.15
        ? "上昇"
        : secondAvg < firstAvg - 0.15
          ? "下降"
          : null;

    if (trendDirection) {
      const currentTrend =
        currentScore > secondAvg + 0.1
          ? "上昇"
          : currentScore < secondAvg - 0.1
            ? "下降"
            : null;

      // トレンド反転
      if (currentTrend && currentTrend !== trendDirection) {
        return {
          type: "trend_change",
          text: `傾向が変わった。${trendDirection}していたのが反転`,
          detail: `「${label}」は${trendDirection}傾向だったが、今回の回答で方向が変わった。内面の変化の兆し`,
          axisId,
          confidence: 0.55,
          surprise: 0.65,
          generationTimeMs: performance.now() - startTime,
        };
      }
    }
  }

  // 6. 安定性の確認（5回以上同じゾーン）
  if (prevScores.length >= 5) {
    const allInRange = prevScores.every(
      (s) => Math.abs(s - currentScore) < 0.15,
    );
    if (allInRange) {
      return {
        type: "stability_note",
        text: `この軸は安定している。あなたの確かな一面`,
        detail: null,
        axisId,
        confidence: 0.7,
        surprise: 0.2,
        generationTimeMs: performance.now() - startTime,
      };
    }
  }

  // 7. 文脈シフト（時間帯による違い）
  if (entry.timestamps.length >= 3) {
    const now = new Date();
    const currentTimeSlot = getTimeSlot(now.getHours());
    const prevTimestampsInSameSlot = entry.timestamps.filter((ts) => {
      const h = new Date(ts).getHours();
      return getTimeSlot(h) === currentTimeSlot;
    });

    if (prevTimestampsInSameSlot.length === 0 && entry.timestamps.length >= 5) {
      return {
        type: "context_shift",
        text: `この時間帯に答えるのは初めて。時間で変わる自分`,
        detail: `同じ質問でも、朝と夜で答えが変わることがある。時間帯ごとの自分の傾向が見え始める`,
        axisId,
        confidence: 0.5,
        surprise: 0.5,
        generationTimeMs: performance.now() - startTime,
      };
    }
  }

  return null; // 特筆すべきインサイトなし
}

function getTimeSlot(hour: number): string {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 4. Batch Insight Trigger (Server-Side, Async)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 重い分析をサーバーにリクエスト（非同期）
 *
 * マイクロインサイトの表示後、バックグラウンドで
 * 詳細な分析（contradictionMap, ahaEngine等）を実行。
 * 結果はpushまたはポーリングで後から表示。
 */
export async function triggerDeepAnalysis(
  sessionAnswers: Array<{
    axisId: string;
    score: number;
    responseTimeMs: number;
  }>,
): Promise<void> {
  try {
    // fire-and-forget: レスポンスを待たない
    fetch("/api/stargazer/observations", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers: sessionAnswers,
        requestDeepAnalysis: true,
      }),
    }).catch(() => {
      // 失敗しても即座のインサイトは提供済み
    });
  } catch {
    // 無視
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 5. Performance Monitoring
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** パフォーマンスメトリクスを収集 */
export interface InsightPerformanceMetrics {
  /** 平均生成時間（ms） */
  avgGenerationTimeMs: number;
  /** 最大生成時間（ms） */
  maxGenerationTimeMs: number;
  /** 50ms以内の割合 */
  under50msRate: number;
  /** 生成されたインサイトの総数 */
  totalInsightsGenerated: number;
  /** 表示されたインサイトの割合 */
  displayRate: number;
}

const performanceLog: number[] = [];

/** パフォーマンスを記録 */
export function logInsightPerformance(generationTimeMs: number): void {
  performanceLog.push(generationTimeMs);
  // 最新100件のみ保持
  if (performanceLog.length > 100) {
    performanceLog.shift();
  }
}

/** パフォーマンスメトリクスを取得 */
export function getInsightPerformanceMetrics(): InsightPerformanceMetrics {
  if (performanceLog.length === 0) {
    return {
      avgGenerationTimeMs: 0,
      maxGenerationTimeMs: 0,
      under50msRate: 1,
      totalInsightsGenerated: 0,
      displayRate: 0,
    };
  }

  const avg =
    performanceLog.reduce((s, t) => s + t, 0) / performanceLog.length;
  const max = Math.max(...performanceLog);
  const under50ms = performanceLog.filter((t) => t < 50).length;

  return {
    avgGenerationTimeMs: Math.round(avg * 100) / 100,
    maxGenerationTimeMs: Math.round(max * 100) / 100,
    under50msRate: under50ms / performanceLog.length,
    totalInsightsGenerated: performanceLog.length,
    displayRate: performanceLog.filter((t) => t > 0).length / performanceLog.length,
  };
}
