"use client";

import { useState, useCallback, useRef } from "react";
import type { HomeAlterContextData, AlterReasoningBasis, ActionShape, DecisionMetadata } from "@/lib/stargazer/alterHomeAdapter";
import { isEmotionalQuestion } from "@/lib/stargazer/alterHomeAdapter";

export type AlterMessage = {
  id: string;
  role: "user" | "alter";
  content: string;
  timestamp: string;
};

export type AlterChatState = {
  /** 会話メッセージ */
  messages: AlterMessage[];
  /** ローディング中 */
  loading: boolean;
  /** セッションID */
  sessionId: string | null;
  /** エラー */
  error: string | null;
  /** 今日の累計 Alter 応答数 */
  roundCount: number;
  /** 1日3ラリー上限に達したか */
  limitReached: boolean;
};

/** 1日あたりの無料ラリー数 */
const MAX_DAILY_ROUNDS = 3;

/** localStorage key for daily usage tracking */
const DAILY_USAGE_KEY = "aneurasync_alter_daily_v1";

/** JST (UTC+9) での今日の日付を "YYYY-MM-DD" で返す */
function getTodayJST(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

/** localStorage から今日の使用回数を読み取る */
function readDailyUsage(): number {
  try {
    const raw = localStorage.getItem(DAILY_USAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { date?: string; count?: number };
    if (parsed.date === getTodayJST()) return parsed.count ?? 0;
    return 0; // 日付が異なれば 0 にリセット
  } catch {
    return 0;
  }
}

/** localStorage に今日の使用回数を書き込む */
function writeDailyUsage(count: number): void {
  try {
    localStorage.setItem(
      DAILY_USAGE_KEY,
      JSON.stringify({ date: getTodayJST(), count }),
    );
  } catch {
    // localStorage 書き込み失敗は無視（サーバー側で制御）
  }
}

type UseAlterChatOptions = {
  /** Home 画面の文脈データ（Alter に渡す） */
  homeContext?: HomeAlterContextData | null;
};

/**
 * Home 用の軽量 Alter チャット Hook。
 * 1日3ラリー（JST 0時リセット）まで Home 内で会話し、それ以上は Deep Alter に誘導。
 * localStorage で高速チェック + API 側 DB バリデーションの二重制御。
 *
 * homeContext を渡すと、Alter がパーソナリティデータ + 今日の状態データに
 * 基づいて「判断AI」として応答する。
 */
export function useAlterChat(options?: UseAlterChatOptions) {
  const [messages, setMessages] = useState<AlterMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastReasoningBasis, setLastReasoningBasis] = useState<AlterReasoningBasis | null>(null);
  const [lastActionShape, setLastActionShape] = useState<ActionShape | null>(null);
  const [lastDomain, setLastDomain] = useState<string | null>(null);
  const [lastIsEmotional, setLastIsEmotional] = useState(false);
  /** 今日の既存使用回数（localStorage から初期読み込み） */
  const [priorDailyCount, setPriorDailyCount] = useState<number>(() => readDailyUsage());
  const abortRef = useRef<AbortController | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const sessionAlterCount = messages.filter((m) => m.role === "alter").length;
  const roundCount = priorDailyCount + sessionAlterCount;
  const limitReached = roundCount >= MAX_DAILY_ROUNDS;
  const remainingRounds = Math.max(0, MAX_DAILY_ROUNDS - roundCount);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading || limitReached) return;

    // Abort previous request if any
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg: AlterMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setError(null);
    setLastIsEmotional(isEmotionalQuestion(trimmed));

    try {
      const homeCtx = optionsRef.current?.homeContext;

      const res = await fetch("/api/stargazer/alter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({
          sessionId: sessionId ?? undefined,
          message: trimmed,
          mode: "warm",
          source: "home",
          ...(homeCtx ? { homeContext: homeCtx } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 429 && data.error === "daily_limit_reached") {
          // サーバー側で上限検出 — localStorage も同期
          writeDailyUsage(MAX_DAILY_ROUNDS);
          setPriorDailyCount(MAX_DAILY_ROUNDS);
          throw new Error("今日の無料ラリー上限に達しました");
        }
        throw new Error(data.error ?? `API error ${res.status}`);
      }

      const data = await res.json();

      const alterMsg: AlterMessage = {
        id: `alter-${Date.now()}`,
        role: "alter",
        content: data.response ?? "...",
        timestamp: new Date().toISOString(),
      };

      if (!sessionId && data.sessionId) {
        setSessionId(data.sessionId);
      }

      // Store reasoning basis for WhyCard integration
      if (data.reasoningBasis) {
        setLastReasoningBasis(data.reasoningBasis);
      }

      // Store action shape and domain for post-response CTA
      if (data.decisionMetadata?.action_shape) {
        setLastActionShape(data.decisionMetadata.action_shape as ActionShape);
      } else if (data.queryContext?.judgment_skeleton?.action_shape) {
        setLastActionShape(data.queryContext.judgment_skeleton.action_shape as ActionShape);
      }
      if (data.queryContext?.domain) {
        setLastDomain(data.queryContext.domain);
      }

      // localStorage の日次カウントを更新
      const newTotal = priorDailyCount + sessionAlterCount + 1;
      writeDailyUsage(newTotal);

      setMessages((prev) => [...prev, alterMsg]);
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message ?? "接続に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [loading, limitReached, sessionId]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setLoading(false);
    setSessionId(null);
    setError(null);
    setLastReasoningBasis(null);
    setLastActionShape(null);
    setLastDomain(null);
    setLastIsEmotional(false);
  }, []);

  return {
    messages,
    loading,
    sessionId,
    error,
    roundCount,
    limitReached,
    /** 今日の残りラリー数 */
    remainingRounds,
    sendMessage,
    reset,
    isActive: messages.length > 0,
    /** 直近の Alter 応答の推論根拠（WhyCard 連携用） */
    lastReasoningBasis,
    /** 直近の action_shape（体験接続CTA用） */
    lastActionShape,
    /** 直近の質問ドメイン（機能ブリッジ用） */
    lastDomain,
    /** 直近の質問が感情質問だったか */
    lastIsEmotional,
  } as const;
}
