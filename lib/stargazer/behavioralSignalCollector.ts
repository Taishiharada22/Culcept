// lib/stargazer/behavioralSignalCollector.ts
// 行動シグナルコレクター — 観測中のマイクロ行動を捕捉する
//
// 設計思想:
// 「回答にかかった時間を計測し『この質問に4.2秒かかりました。平均は1.8秒』と見せる」
// 「選ばなかった選択肢の分析 — 3秒間そこにカーソルが止まっていた」
// 「人間は自分の迷いを数値で見せられると、ゾクッとする」
//
// 全てクライアントサイド。APIコールなし。localStorageで永続化。

import { safeSetItem } from "./localStorageHelper";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface BehavioralSignal {
  questionId: string;
  timestamp: number;
  responseTimeMs: number;
  selectedOption: string;
  /** ユーザーが選択前にホバーした選択肢 */
  hoveredOptions: string[];
  /** 各選択肢のホバー時間(ms) */
  hoverDurations: Record<string, number>;
  /** 前の質問に戻った回数 */
  scrollbackCount: number;
  /** 一度選んだ後に変更したか */
  answerChanged: boolean;
  /** 変更前の回答 */
  previousAnswer?: string;
  viewportInteractions: {
    /** スクロール深度 (0-1) */
    scrollDepth: number;
    /** フォーカスを失った回数 */
    focusLostCount: number;
    /** フォーカスを失っていた合計時間(ms) */
    focusLostDurationMs: number;
  };
}

export interface SessionSignals {
  sessionId: string;
  startedAt: number;
  signals: BehavioralSignal[];
  sessionMetrics: {
    averageResponseTimeMs: number;
    fastestQuestionId: string;
    slowestQuestionId: string;
    /** 応答時間が平均の2倍を超えた質問の数 */
    totalHesitationCount: number;
    answerChangeCount: number;
    /** ユーザーが離脱して戻ってきた質問ID */
    abandonmentPoints: string[];
  };
}

export interface QuestionInsight {
  hesitation: boolean;
  hesitationMessage?: string;
  hoverInsight?: string;
  comparisonToAverage?: string;
  focusLostInsight?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const STORAGE_KEY = "stargazer_behavioral_sessions_v1";
const MAX_SESSIONS = 30;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Collector Class (Singleton)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export class SignalCollector {
  private sessionId: string;
  private signals: BehavioralSignal[];
  private startedAt: number;

  // 現在の質問の状態
  private currentQuestionId: string | null;
  private currentQuestionStart: number;
  private currentHoverStart: Map<string, number>; // optionValue -> hover開始時刻
  private currentHoverDurations: Map<string, number>; // optionValue -> 累積ホバー時間
  private currentHoveredOptions: Set<string>;
  private currentScrollbackCount: number;
  private currentAnswerChanged: boolean;
  private currentPreviousAnswer: string | undefined;

  // フォーカス追跡
  private focusLostAt: number | null;
  private focusLostCount: number;
  private focusLostDurationMs: number;
  private boundVisibilityHandler: () => void;

  constructor() {
    this.sessionId = `bs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.signals = [];
    this.startedAt = Date.now();

    this.currentQuestionId = null;
    this.currentQuestionStart = 0;
    this.currentHoverStart = new Map();
    this.currentHoverDurations = new Map();
    this.currentHoveredOptions = new Set();
    this.currentScrollbackCount = 0;
    this.currentAnswerChanged = false;
    this.currentPreviousAnswer = undefined;

    this.focusLostAt = null;
    this.focusLostCount = 0;
    this.focusLostDurationMs = 0;

    this.boundVisibilityHandler = this.onVisibilityChange.bind(this);

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.boundVisibilityHandler);
    }
  }

  // ── 質問開始 ──────────────────────────────────────

  startQuestion(questionId: string): void {
    this.currentQuestionId = questionId;
    this.currentQuestionStart = Date.now();
    this.currentHoverStart.clear();
    this.currentHoverDurations.clear();
    this.currentHoveredOptions.clear();
    this.currentScrollbackCount = 0;
    this.currentAnswerChanged = false;
    this.currentPreviousAnswer = undefined;
    // フォーカスカウントは質問単位でリセット
    this.focusLostAt = null;
    this.focusLostCount = 0;
    this.focusLostDurationMs = 0;
  }

  // ── ホバー追跡 ─────────────────────────────────────

  onOptionHover(optionValue: string): void {
    if (!this.currentQuestionId) return;
    this.currentHoveredOptions.add(optionValue);
    if (!this.currentHoverStart.has(optionValue)) {
      this.currentHoverStart.set(optionValue, Date.now());
    }
  }

  onOptionHoverEnd(optionValue: string): void {
    if (!this.currentQuestionId) return;
    const start = this.currentHoverStart.get(optionValue);
    if (start !== undefined) {
      const duration = Date.now() - start;
      const existing = this.currentHoverDurations.get(optionValue) ?? 0;
      this.currentHoverDurations.set(optionValue, existing + duration);
      this.currentHoverStart.delete(optionValue);
    }
  }

  // ── スクロールバック追跡 ────────────────────────────

  recordScrollback(): void {
    this.currentScrollbackCount++;
  }

  // ── 回答記録 ──────────────────────────────────────

  recordAnswer(questionId: string, selectedOption: string): BehavioralSignal {
    // まだホバー中の選択肢があれば終了させる
    for (const [opt] of this.currentHoverStart) {
      this.onOptionHoverEnd(opt);
    }

    const now = Date.now();
    const responseTimeMs = this.currentQuestionStart > 0
      ? now - this.currentQuestionStart
      : 0;

    const hoverDurations: Record<string, number> = {};
    for (const [opt, dur] of this.currentHoverDurations) {
      hoverDurations[opt] = dur;
    }

    const signal: BehavioralSignal = {
      questionId,
      timestamp: now,
      responseTimeMs,
      selectedOption,
      hoveredOptions: [...this.currentHoveredOptions],
      hoverDurations,
      scrollbackCount: this.currentScrollbackCount,
      answerChanged: this.currentAnswerChanged,
      previousAnswer: this.currentPreviousAnswer,
      viewportInteractions: {
        scrollDepth: this.getScrollDepth(),
        focusLostCount: this.focusLostCount,
        focusLostDurationMs: this.focusLostDurationMs,
      },
    };

    this.signals.push(signal);
    return signal;
  }

  // ── 回答変更 ──────────────────────────────────────

  recordAnswerChange(questionId: string, newOption: string, previousOption: string): void {
    // 既に記録済みのシグナルを更新
    const existingIndex = this.signals.findIndex(s => s.questionId === questionId);
    if (existingIndex !== -1) {
      this.signals[existingIndex].answerChanged = true;
      this.signals[existingIndex].previousAnswer = previousOption;
      this.signals[existingIndex].selectedOption = newOption;
    }

    // 現在の質問にも反映
    if (this.currentQuestionId === questionId) {
      this.currentAnswerChanged = true;
      this.currentPreviousAnswer = previousOption;
    }
  }

  // ── フォーカス追跡 ────────────────────────────────

  private onVisibilityChange(): void {
    if (typeof document === "undefined") return;
    if (!this.currentQuestionId) return;

    if (document.visibilityState === "hidden") {
      this.focusLostAt = Date.now();
    } else if (this.focusLostAt !== null) {
      this.focusLostCount++;
      this.focusLostDurationMs += Date.now() - this.focusLostAt;
      this.focusLostAt = null;
    }
  }

  // ── セッション集計 ────────────────────────────────

  getSessionSignals(): SessionSignals {
    const metrics = this.computeMetrics();
    return {
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      signals: [...this.signals],
      sessionMetrics: metrics,
    };
  }

  private computeMetrics(): SessionSignals["sessionMetrics"] {
    if (this.signals.length === 0) {
      return {
        averageResponseTimeMs: 0,
        fastestQuestionId: "",
        slowestQuestionId: "",
        totalHesitationCount: 0,
        answerChangeCount: 0,
        abandonmentPoints: [],
      };
    }

    const totalTime = this.signals.reduce((sum, s) => sum + s.responseTimeMs, 0);
    const avgTime = totalTime / this.signals.length;

    let fastest: BehavioralSignal = this.signals[0];
    let slowest: BehavioralSignal = this.signals[0];

    for (const s of this.signals) {
      if (s.responseTimeMs < fastest.responseTimeMs) fastest = s;
      if (s.responseTimeMs > slowest.responseTimeMs) slowest = s;
    }

    const hesitationThreshold = avgTime * 2;
    const totalHesitationCount = this.signals.filter(
      s => s.responseTimeMs > hesitationThreshold
    ).length;

    const answerChangeCount = this.signals.filter(s => s.answerChanged).length;

    const abandonmentPoints = this.signals
      .filter(s => s.viewportInteractions.focusLostCount > 0)
      .map(s => s.questionId);

    return {
      averageResponseTimeMs: Math.round(avgTime),
      fastestQuestionId: fastest.questionId,
      slowestQuestionId: slowest.questionId,
      totalHesitationCount,
      answerChangeCount,
      abandonmentPoints,
    };
  }

  // ── リアルタイムインサイト生成 ──────────────────────

  getQuestionInsight(signal: BehavioralSignal): QuestionInsight {
    const completedSignals = this.signals.filter(s => s.responseTimeMs > 0);
    const avgResponseTime = completedSignals.length > 1
      ? completedSignals.reduce((sum, s) => sum + s.responseTimeMs, 0) / completedSignals.length
      : signal.responseTimeMs;

    const ratio = avgResponseTime > 0 ? signal.responseTimeMs / avgResponseTime : 1;
    const isHesitation = ratio > 1.5;
    const responseTimeSec = (signal.responseTimeMs / 1000).toFixed(1);
    const avgSec = (avgResponseTime / 1000).toFixed(1);

    const insight: QuestionInsight = {
      hesitation: isHesitation,
    };

    // 迷いメッセージ
    if (isHesitation) {
      insight.hesitationMessage = `この質問に${responseTimeSec}秒かかりました`;
    }

    // 平均との比較
    if (completedSignals.length >= 2) {
      if (ratio > 1.3) {
        insight.comparisonToAverage = `平均(${avgSec}秒)より${ratio.toFixed(1)}倍長い`;
      } else if (ratio < 0.6) {
        insight.comparisonToAverage = `平均(${avgSec}秒)より${(1 / ratio).toFixed(1)}倍速い`;
      }
    }

    // ホバーインサイト: 選択しなかったが長時間ホバーした選択肢
    const nonSelectedHovers = Object.entries(signal.hoverDurations)
      .filter(([opt]) => opt !== signal.selectedOption)
      .sort((a, b) => b[1] - a[1]);

    if (nonSelectedHovers.length > 0) {
      const [topOption, topDuration] = nonSelectedHovers[0];
      if (topDuration > 1500) {
        const durationSec = (topDuration / 1000).toFixed(1);
        insight.hoverInsight = `「${topOption}」にも${durationSec}秒間惹かれていた`;
      }
    }

    // フォーカス離脱インサイト
    if (signal.viewportInteractions.focusLostCount > 0) {
      insight.focusLostInsight = signal.viewportInteractions.focusLostCount === 1
        ? "一度この質問から離れた"
        : `${signal.viewportInteractions.focusLostCount}回この質問から離れた`;
    }

    return insight;
  }

  // ── 永続化 ────────────────────────────────────────

  saveSession(): void {
    if (typeof window === "undefined") return;
    if (this.signals.length === 0) return;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const sessions: SessionSignals[] = raw ? JSON.parse(raw) : [];

      sessions.push(this.getSessionSignals());

      // 古いセッションを削除して上限を維持
      while (sessions.length > MAX_SESSIONS) {
        sessions.shift();
      }

      safeSetItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch {
      // localStorage QuotaExceeded or parse error - silent fail
    }
  }

  // ── 過去セッション読み出し ─────────────────────────

  static loadPastSessions(limit: number = MAX_SESSIONS): SessionSignals[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const sessions: SessionSignals[] = JSON.parse(raw);
      return sessions.slice(-limit);
    } catch {
      return [];
    }
  }

  // ── クリーンアップ ────────────────────────────────

  destroy(): void {
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.boundVisibilityHandler);
    }
  }

  // ── ヘルパー ──────────────────────────────────────

  private getScrollDepth(): number {
    if (typeof window === "undefined" || typeof document === "undefined") return 0;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight <= 0) return 1;
    return Math.min(1, window.scrollY / docHeight);
  }
}
