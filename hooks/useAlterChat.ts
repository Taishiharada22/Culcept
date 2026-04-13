"use client";

import { useState, useCallback, useRef } from "react";
import type { HomeAlterContextData, AlterReasoningBasis, ActionShape, DecisionMetadata } from "@/lib/stargazer/alterHomeAdapter";
import { isEmotionalQuestion } from "@/lib/stargazer/alterHomeAdapter";
import type { MorningPlan, MorningPhase } from "@/lib/alter-morning/types";

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
  /** 1日5ラリー上限に達したか */
  limitReached: boolean;
};

/** 1日あたりの無料ラリー数（clarify は非消費のため、サーバー側とは別カウント） */
const MAX_DAILY_ROUNDS = 5;

/** localStorage key for daily usage tracking */
const DAILY_USAGE_KEY = "aneurasync_alter_daily_v1";

/** localStorage key for β-tester flag (persisted across page loads) */
const BETA_TESTER_KEY = "aneurasync_alter_beta_tester_v1";

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
 * 1日5ラリー（JST 0時リセット、clarify非消費）まで Home 内で会話し、それ以上は Deep Alter に誘導。
 * localStorage で高速チェック + API 側 DB バリデーションの二重制御。
 * βテスターは API レスポンスで判定し、クライアント側制限を完全バイパス。
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
  const [lastResponseId, setLastResponseId] = useState<string | null>(null);
  const [lastFeedbackMeta, setLastFeedbackMeta] = useState<Record<string, unknown> | null>(null);
  const [lastCounselorSoftLink, setLastCounselorSoftLink] = useState<{
    show: boolean;
    message: string;
    destination: string;
  } | null>(null);
  /** Morning Protocol: プランデータ */
  const [morningPlan, setMorningPlan] = useState<MorningPlan | null>(null);
  const [morningPhase, setMorningPhase] = useState<MorningPhase | null>(null);
  const [morningSessionId, setMorningSessionId] = useState<string | null>(null);
  /** P0-1: ターン間で保持する追加セッション状態 */
  const [morningRawInputs, setMorningRawInputs] = useState<string[]>([]);
  const [morningParsedIntent, setMorningParsedIntent] = useState<any>(null);
  const [morningSufficiency, setMorningSufficiency] = useState<any>(null);
  const [morningPersonalizeHints, setMorningPersonalizeHints] = useState<string[]>([]);
  /** Soft Bridge: 直前のAlter返答がSoft Bridge確認だったか */
  const [softBridgePending, setSoftBridgePending] = useState(false);
  /** βテスターフラグ（localStorage → API レスポンスで更新、制限バイパス用） */
  const [isBetaTester, setIsBetaTester] = useState<boolean>(() => {
    try {
      return localStorage.getItem(BETA_TESTER_KEY) === "1";
    } catch {
      return false;
    }
  });
  /** 今日の既存使用回数（localStorage から初期読み込み） */
  const [priorDailyCount, setPriorDailyCount] = useState<number>(() => readDailyUsage());
  const abortRef = useRef<AbortController | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const sessionAlterCount = messages.filter((m) => m.role === "alter").length;
  const roundCount = priorDailyCount + sessionAlterCount;
  // βテスターは制限なし
  const limitReached = isBetaTester ? false : roundCount >= MAX_DAILY_ROUNDS;
  const remainingRounds = isBetaTester
    ? MAX_DAILY_ROUNDS // βテスターには常に最大値を表示（実質無制限）
    : Math.max(0, MAX_DAILY_ROUNDS - roundCount);

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
          // Morning Protocol: 進行中セッションの状態を送信
          // P0-1: parsedIntent / rawInputs / sufficiency もターン間で保持する
          ...(morningPhase && !["completed", "skipped"].includes(morningPhase) ? {
            morningSession: {
              sessionId: morningSessionId ?? undefined,
              phase: morningPhase,
              plan: morningPlan ?? undefined,
              rawInputs: morningRawInputs,
              personalizeHints: morningPersonalizeHints,
              parsedIntent: morningParsedIntent ?? undefined,
              sufficiency: morningSufficiency ?? undefined,
            },
          } : {}),
          // Soft Bridge: 直前のAlter返答がSoft Bridge確認だったか
          ...(softBridgePending ? { softBridgePending: true } : {}),
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

      // βテスターフラグを API レスポンスから取得し localStorage に永続化
      if (data.isBetaTester && !isBetaTester) {
        setIsBetaTester(true);
        try { localStorage.setItem(BETA_TESTER_KEY, "1"); } catch {}
      }

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
      if (data.responseId) {
        setLastResponseId(data.responseId);
      }
      if (data.feedbackMeta) {
        setLastFeedbackMeta(data.feedbackMeta);
      }
      // Alter→Counselor ソフト導線（恋愛ドメイン時にAPIが返す）
      if (data.counselorSoftLink) {
        setLastCounselorSoftLink(data.counselorSoftLink);
      } else {
        setLastCounselorSoftLink(null);
      }
      // Soft Bridge: レスポンスにフラグがあれば次ターンで確認応答を受け付ける
      setSoftBridgePending(!!data.softBridgePending);

      // Morning Protocol: プランデータ
      // P0-1: parsedIntent / rawInputs / sufficiency もターン間で保持する
      if (data.morningProtocol) {
        setMorningPhase(data.morningProtocol.phase);
        if (data.morningProtocol.sessionId) {
          setMorningSessionId(data.morningProtocol.sessionId);
        }
        if (data.morningProtocol.plan) {
          setMorningPlan(data.morningProtocol.plan);
          // Conversation Starter: 途中状態のアイテムを永続化（途中離脱復帰用）
          if (!data.morningProtocol.plan.confirmed && data.morningProtocol.plan.items?.length > 0) {
            import("@/lib/alter-morning/conversationStarter").then(({ savePartialItems }) => {
              savePartialItems(data.morningProtocol.plan.items);
            });
          }
        }
        // P0-1: 追加セッション状態の保存
        if (data.morningProtocol.rawInputs) {
          setMorningRawInputs(data.morningProtocol.rawInputs);
        }
        if (data.morningProtocol.parsedIntent !== undefined) {
          setMorningParsedIntent(data.morningProtocol.parsedIntent);
        }
        if (data.morningProtocol.sufficiency !== undefined) {
          setMorningSufficiency(data.morningProtocol.sufficiency);
        }
        if (data.morningProtocol.personalizeHints) {
          setMorningPersonalizeHints(data.morningProtocol.personalizeHints);
        }
      }

      // localStorage の日次カウントを更新（βテスターはカウント不要だが記録は残す）
      const newTotal = priorDailyCount + sessionAlterCount + 1;
      writeDailyUsage(newTotal);

      setMessages((prev) => [...prev, alterMsg]);
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message ?? "接続に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [loading, limitReached, sessionId, isBetaTester, morningPhase, morningPlan, morningRawInputs, morningParsedIntent, morningSufficiency, morningPersonalizeHints]);

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
    setLastResponseId(null);
    setLastFeedbackMeta(null);
    setLastCounselorSoftLink(null);
    setMorningPlan(null);
    setMorningPhase(null);
    setMorningSessionId(null);
    // P0-1: 追加状態もリセット
    setMorningRawInputs([]);
    setMorningParsedIntent(null);
    setMorningSufficiency(null);
    setMorningPersonalizeHints([]);
  }, []);

  /** メッセージを外部から注入（リミット通知などAPI不使用の返答） */
  const injectMessage = useCallback((content: string, role: "user" | "alter" = "alter") => {
    const msg: AlterMessage = {
      id: `${role}-${Date.now()}`,
      role,
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, msg]);
    if (role === "alter") setLoading(false);
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
    injectMessage,
    reset,
    /** 思考中のリクエストを中断 */
    abort: () => { abortRef.current?.abort(); },
    isActive: messages.length > 0,
    /** βテスターか（制限バイパス中） */
    isBetaTester,
    /** 直近の Alter 応答の推論根拠（WhyCard 連携用） */
    lastReasoningBasis,
    /** 直近の action_shape（体験接続CTA用） */
    lastActionShape,
    /** 直近の質問ドメイン（機能ブリッジ用） */
    lastDomain,
    /** 直近の質問が感情質問だったか */
    lastIsEmotional,
    /** 直近のresponse_id（フィードバック紐付け用） */
    lastResponseId,
    /** 直近のフィードバック用メタデータ */
    lastFeedbackMeta,
    /** Alter→Counselor ソフト導線（恋愛ドメイン時） */
    lastCounselorSoftLink,
    /** Morning Protocol: プランデータ */
    morningPlan,
    /** Morning Protocol: 現在フェーズ */
    morningPhase,
    /** Morning Protocol: プランを更新（UI操作後） */
    setMorningPlan,
  } as const;
}
