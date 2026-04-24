"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { HomeAlterContextData, AlterReasoningBasis, ActionShape, DecisionMetadata } from "@/lib/stargazer/alterHomeAdapter";
import { isEmotionalQuestion } from "@/lib/stargazer/alterHomeAdapter";
import type { MorningPlan, MorningPhase, ParsedDayIntent, SufficiencyResult, PendingClarify } from "@/lib/alter-morning/types";
import type { Event as ComprehensionEvent } from "@/lib/alter-morning/comprehension/eventSchema";
// W3-PR-8 rev 3 commit 22b: DialogState v2 client round-trip
//   server が返した dialogState を state 保持 → 次 POST で送り返す。
//   これが無いと route.ts 側で ensureSessionV1 が毎 turn fresh init し、
//   selectShadowTargetEventId の condition A (prevFocus===null) が恒常 fail
//   で focus 継承が発動しない（2026-04-22 preview で判明）。
import type { DialogState } from "@/lib/alter-morning/dialog/types";

/** PE出典情報（Alter発言下に小さく表示） */
export type PerspectiveSource = {
  title: string;
  url: string;
  date: string | null;
};

export type AlterMessage = {
  id: string;
  role: "user" | "alter";
  content: string;
  timestamp: string;
  /** P1.9: PE出典データ（Alter応答にのみ付与） */
  perspectiveSources?: PerspectiveSource[];
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Morning Session Persistence — ページ遷移でもセッションを維持
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MORNING_SESSION_KEY = "aneurasync_morning_session_v1";

interface PersistedMorningSession {
  date: string; // YYYY-MM-DD — 日付が変わったら無効
  phase: MorningPhase;
  sessionId: string | null;
  plan: MorningPlan | null;
  rawInputs: string[];
  parsedIntent: ParsedDayIntent | null;
  sufficiency: SufficiencyResult | null;
  personalizeHints: string[];
  // v2: PlanState ラウンドトリップ
  planStateV2?: any;
  // W3-PR-6: v2 pipeline stickiness round-trip
  pipelineVersion?: "v2";
  // W3-PR-7 Commit 2: dialog state round-trip
  pendingClarify?: PendingClarify | null;
  persistedEvents?: ComprehensionEvent[];
  // W3-PR-8 rev 3 commit 22b: DialogState v2 client round-trip
  //   flag OFF 環境では常に undefined（server が field 出力しないため）。
  dialogState?: DialogState | null;
}

function saveMorningSession(session: PersistedMorningSession): void {
  try {
    localStorage.setItem(MORNING_SESSION_KEY, JSON.stringify(session));
  } catch {
    // localStorage 書き込み失敗は無視
  }
}

function loadMorningSession(): PersistedMorningSession | null {
  try {
    const raw = localStorage.getItem(MORNING_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedMorningSession;
    // 日付が今日でなければ無効（翌日にはリセット）
    if (parsed.date !== getTodayJST()) {
      localStorage.removeItem(MORNING_SESSION_KEY);
      return null;
    }
    // completed / skipped セッションは復元しない（新しいセッションを開始）
    if (parsed.phase === "completed" || parsed.phase === "skipped") return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearMorningSession(): void {
  try {
    localStorage.removeItem(MORNING_SESSION_KEY);
  } catch {
    // ignore
  }
}

/**
 * 終点アンカーを次回プランの始点候補として永続化する。
 * 前回プラン確定時に保存し、次回プラン作成時に参照する。
 */
const LAST_ENDPOINT_KEY = "aneurasync_last_endpoint_v1";

export function saveLastEndpoint(anchor: import("@/lib/alter-morning/types").EndpointAnchor): void {
  try {
    localStorage.setItem(LAST_ENDPOINT_KEY, JSON.stringify({ ...anchor, savedAt: new Date().toISOString() }));
  } catch { /* ignore */ }
}

export function loadLastEndpoint(): import("@/lib/alter-morning/types").EndpointAnchor | null {
  try {
    const raw = localStorage.getItem(LAST_ENDPOINT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
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
  /** Morning Protocol: セッション永続化から復元 */
  const [restoredSession] = useState<PersistedMorningSession | null>(() => loadMorningSession());
  const [morningPlan, setMorningPlan] = useState<MorningPlan | null>(restoredSession?.plan ?? null);
  const [morningPhase, setMorningPhase] = useState<MorningPhase | null>(restoredSession?.phase ?? null);
  const [morningSessionId, setMorningSessionId] = useState<string | null>(restoredSession?.sessionId ?? null);
  /** P0-1: ターン間で保持する追加セッション状態 */
  const [morningRawInputs, setMorningRawInputs] = useState<string[]>(restoredSession?.rawInputs ?? []);
  const [morningParsedIntent, setMorningParsedIntent] = useState<ParsedDayIntent | null>(restoredSession?.parsedIntent ?? null);
  const [morningSufficiency, setMorningSufficiency] = useState<SufficiencyResult | null>(restoredSession?.sufficiency ?? null);
  const [morningPersonalizeHints, setMorningPersonalizeHints] = useState<string[]>(restoredSession?.personalizeHints ?? []);
  // v2: PlanState ラウンドトリップ
  const [morningPlanStateV2, setMorningPlanStateV2] = useState<any>(restoredSession?.planStateV2 ?? null);
  // W3-PR-6: v2 pipeline stickiness round-trip（"v2" | null）
  const [morningPipelineVersion, setMorningPipelineVersion] = useState<"v2" | null>(
    (restoredSession as { pipelineVersion?: "v2" } | null)?.pipelineVersion ?? null,
  );
  // W3-PR-7 Commit 2: dialog state round-trip
  const [morningPendingClarify, setMorningPendingClarify] = useState<PendingClarify | null>(
    restoredSession?.pendingClarify ?? null,
  );
  const [morningPersistedEvents, setMorningPersistedEvents] = useState<ComprehensionEvent[] | null>(
    restoredSession?.persistedEvents ?? null,
  );
  // W3-PR-8 rev 3 commit 22b: DialogState v2 round-trip
  //   response.morningProtocol.dialogState を次 POST で返送するための state。
  //   null のときは POST body 側で field を出力しない（flag OFF と同等形）。
  const [morningDialogState, setMorningDialogState] = useState<DialogState | null>(
    restoredSession?.dialogState ?? null,
  );
  /**
   * W3-PR-9 commit 5c: Place selection 進行中の placeId。
   *   - null: 送信中ではない
   *   - string: この placeId を現在送信中（picker 側で全ボタン disable + loader）
   *
   * server canonical response 受信で null に戻る。途中 reject / abort / error でも finally で null。
   */
  const [placeSelectionPending, setPlaceSelectionPending] = useState<string | null>(null);
  const selectionAbortRef = useRef<AbortController | null>(null);
  /**
   * stale-response guard 用の ref。setter 内 closure が最新 state を参照できないため、
   * async response 到着時に ref で比較する。
   */
  const morningDialogStateRef = useRef<DialogState | null>(morningDialogState);
  useEffect(() => {
    morningDialogStateRef.current = morningDialogState;
  }, [morningDialogState]);

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

  // Morning Session: 状態変更時に localStorage に保存
  useEffect(() => {
    if (!morningPhase) return; // セッション未開始なら保存しない
    saveMorningSession({
      date: getTodayJST(),
      phase: morningPhase,
      sessionId: morningSessionId,
      plan: morningPlan,
      rawInputs: morningRawInputs,
      parsedIntent: morningParsedIntent,
      sufficiency: morningSufficiency,
      personalizeHints: morningPersonalizeHints,
      planStateV2: morningPlanStateV2,
      ...(morningPipelineVersion ? { pipelineVersion: morningPipelineVersion } : {}),
      pendingClarify: morningPendingClarify,
      persistedEvents: morningPersistedEvents ?? undefined,
      // W3-PR-8 rev 3 commit 22b: dialogState を localStorage にも永続化
      //   タブ closing / reload を跨いでも focus 継承が切れないようにする。
      //   flag OFF では常に null のため spread 条件で field を省略。
      ...(morningDialogState ? { dialogState: morningDialogState } : {}),
    });
  }, [morningPhase, morningSessionId, morningPlan, morningRawInputs, morningParsedIntent, morningSufficiency, morningPersonalizeHints, morningPlanStateV2, morningPipelineVersion, morningPendingClarify, morningPersistedEvents, morningDialogState]);

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
              planStateV2: morningPlanStateV2 ?? undefined,
              // W3-PR-6: v2 stickiness を route に返送する
              ...(morningPipelineVersion ? { pipelineVersion: morningPipelineVersion } : {}),
              // W3-PR-7 Commit 2: dialog state を route に返送する
              ...(morningPendingClarify ? { pendingClarify: morningPendingClarify } : {}),
              ...(morningPersistedEvents ? { persistedEvents: morningPersistedEvents } : {}),
              // W3-PR-8 rev 3 commit 22b: DialogState v2 を route に返送する
              //   この 1 箇所が欠けていたため commit 22 の focus 継承が発動せず、
              //   2026-04-22 preview で全 turn prev_focus=null 恒常 fallback。
              ...(morningDialogState ? { dialogState: morningDialogState } : {}),
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
        // P1.9: PE出典データ（CEOアプローチ: 目立たなく小さく表示）
        ...(data.perspectiveSources?.length > 0 ? {
          perspectiveSources: data.perspectiveSources,
        } : {}),
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
        // v2: PlanState ラウンドトリップ
        if (data.morningProtocol.planStateV2 !== undefined) {
          setMorningPlanStateV2(data.morningProtocol.planStateV2);
        }
        // W3-PR-6: v2 pipelineVersion round-trip
        if (data.morningProtocol.pipelineVersion !== undefined) {
          setMorningPipelineVersion(
            data.morningProtocol.pipelineVersion === "v2" ? "v2" : null,
          );
        }
        // W3-PR-7 Commit 2: dialog state round-trip
        if (data.morningProtocol.pendingClarify !== undefined) {
          setMorningPendingClarify(data.morningProtocol.pendingClarify ?? null);
        }
        if (data.morningProtocol.persistedEvents !== undefined) {
          setMorningPersistedEvents(data.morningProtocol.persistedEvents ?? null);
        }
        // W3-PR-8 rev 3 commit 22b: DialogState v2 round-trip 受信側
        //   server が flag ON 時のみ field を出力する（route.ts L9363-9365）。
        //   undefined check (!== undefined) で「field 省略」と「null リセット」を
        //   区別する。flag OFF では常に省略のため setter は走らない = baseline 不変。
        if (data.morningProtocol.dialogState !== undefined) {
          setMorningDialogState(data.morningProtocol.dialogState ?? null);
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
  }, [loading, limitReached, sessionId, isBetaTester, morningPhase, morningPlan, morningRawInputs, morningParsedIntent, morningSufficiency, morningPersonalizeHints, morningPlanStateV2, morningPipelineVersion, morningPendingClarify, morningPersistedEvents, morningDialogState]);

  /**
   * W3-PR-9 commit 5c: Place candidate 選択ハンドラ。
   *
   * 契約（CEO 2026-04-23）:
   *   1. picker は `status === "search_candidates_presented" && activePresentation !== null`
   *      でのみ mount される前提。このハンドラも同条件を guard する。
   *   2. optimistic update しない — server canonical response のみ state を進める。
   *   3. pending 中（placeSelectionPending != null）は no-op（再クリック禁止）。
   *   4. stale-response guard: 応答到着時に dialogState の
   *      activePresentation.targetEventId/queryFingerprint が一致しない場合は破棄。
   *      user が mid-flight で別 turn を進めたケース対策。
   *   5. accepted=false は無害な no-op（error UI 出さない）。
   *   6. accepted=true は canonical morningSession で dialogState + events を置換。
   */
  const selectPlaceCandidate = useCallback(async (selectedPlaceId: string) => {
    const curr = morningDialogStateRef.current;
    if (!curr) return;
    if (curr.conversationStatus !== "search_candidates_presented") return;
    const active = curr.activePresentation;
    if (!active) return;
    if (!active.candidates.some((c) => c.placeId === selectedPlaceId)) return;
    // Race guard: 既に pending ならスキップ（UI 側 disabled だが defense in depth）
    if (placeSelectionPending !== null) return;

    // 旧 selection を abort（同時多重送信防止）
    selectionAbortRef.current?.abort();
    const controller = new AbortController();
    selectionAbortRef.current = controller;

    // Request 時点の fingerprint を capture（stale check 用）
    const requestTargetEventId = active.targetEventId;
    const requestFingerprint = active.queryFingerprint;
    const requestTurnIndex = active.presentedAtTurn + 1;

    setPlaceSelectionPending(selectedPlaceId);

    try {
      const morningSession = {
        ...(morningSessionId ? { sessionId: morningSessionId } : {}),
        ...(morningPhase ? { phase: morningPhase } : {}),
        dialogState: curr,
        persistedEvents: morningPersistedEvents ?? [],
        ...(morningPlan ? { plan: morningPlan } : {}),
        rawInputs: morningRawInputs,
        ...(morningParsedIntent ? { parsedIntent: morningParsedIntent } : {}),
        ...(morningSufficiency ? { sufficiency: morningSufficiency } : {}),
        personalizeHints: morningPersonalizeHints,
        ...(morningPlanStateV2 ? { planStateV2: morningPlanStateV2 } : {}),
        ...(morningPipelineVersion ? { pipelineVersion: morningPipelineVersion } : {}),
        ...(morningPendingClarify ? { pendingClarify: morningPendingClarify } : {}),
      };

      const res = await fetch("/api/stargazer/alter/selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({
          turnIndex: requestTurnIndex,
          targetEventId: requestTargetEventId,
          queryFingerprint: requestFingerprint,
          selectedPlaceId,
          morningSession,
        }),
      });

      if (!res.ok) {
        console.warn("[selection] http error", res.status);
        return;
      }

      const data = await res.json().catch(() => null);
      if (!data) return;

      // Stale-response guard: response 到着時点で dialogState が別の presentation に
      // 移動していたら（または null になっていたら）この response は stale。破棄する。
      const latest = morningDialogStateRef.current;
      const stillSame =
        latest?.activePresentation?.targetEventId === requestTargetEventId &&
        latest?.activePresentation?.queryFingerprint === requestFingerprint;
      if (!stillSame) {
        console.info("[selection] stale response discarded");
        return;
      }

      if (!data.accepted) {
        // accepted=false は normal no-op（picker は次 server turn で unmount される）
        console.info("[selection] rejected", data.reason);
        return;
      }

      // accepted=true: canonical morningSession で置換
      if (data.morningSession) {
        const next = data.morningSession;
        if (next.dialogState !== undefined) {
          setMorningDialogState(next.dialogState ?? null);
        }
        if (next.persistedEvents !== undefined) {
          setMorningPersistedEvents(next.persistedEvents ?? null);
        }
        if (next.phase) {
          setMorningPhase(next.phase);
        }
        // W3-PR-10: server が rebuild した plan があれば置換（transportSegments 含む）。
        // flag OFF 時は server は plan を返さないので本分岐は no-op（byte-diff ゼロ）。
        if (next.plan !== undefined) {
          setMorningPlan(next.plan ?? null);
        }
      }

      // W3-PR-10 positive-path nudge: 1件目 place 確定直後に Alter から次の場所を自然に問う。
      // server 側 narrow trigger で gate 済（transportV2 flag ON + 0→1 place diff + !multiple + !endSignal）。
      // DB dialogues 永続化は初版では行わない（UI 表示のみ）。
      if (typeof data.alterFollowUp?.text === "string" && data.alterFollowUp.text.length > 0) {
        const followUpMsg: AlterMessage = {
          id: `alter-${Date.now()}-followup`,
          role: "alter",
          content: data.alterFollowUp.text,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, followUpMsg]);
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      console.warn("[selection] error", err);
    } finally {
      setPlaceSelectionPending(null);
      if (selectionAbortRef.current === controller) {
        selectionAbortRef.current = null;
      }
    }
  }, [placeSelectionPending, morningSessionId, morningPhase, morningPersistedEvents, morningPlan, morningRawInputs, morningParsedIntent, morningSufficiency, morningPersonalizeHints, morningPlanStateV2, morningPipelineVersion, morningPendingClarify]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    selectionAbortRef.current?.abort();
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
    // W3-PR-8 rev 3 commit 22b: DialogState v2 も reset でクリア
    setMorningDialogState(null);
    // W3-PR-9 commit 5c: pending selection もクリア
    setPlaceSelectionPending(null);
    // セッション永続化もクリア
    clearMorningSession();
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
    /** Morning Protocol: パーソナライズヒント（性格ベースの提案含む） */
    morningPersonalizeHints,
    /**
     * W3-PR-9 commit 5c: DialogState v2（picker の条件描画に使う）。
     * `conversationStatus === "search_candidates_presented" && activePresentation !== null`
     * のときだけ picker を mount する。
     */
    morningDialogState,
    /**
     * W3-PR-9 commit 5c: place 候補選択ハンドラ。placeId のみ受け取り、
     * server canonical response で dialogState + events を置換する。
     */
    selectPlaceCandidate,
    /**
     * W3-PR-9 commit 5c: 送信中の placeId（null なら非送信中）。
     * picker に pending flag として渡して全ボタン disable する。
     */
    placeSelectionPending,
    /**
     * W3-PR-13 M3: persisted comprehension events（MorningMapView の pin source）。
     * 既存 internal state (L218) をそのまま expose（非破壊 export）。
     * 読み取り戦略 β: plan.items[].location は rebuildPlan (transportV2 flag 依存)
     * 経由なので、flag OFF でも map が描画できるよう events から直接読む。
     */
    morningPersistedEvents,
  } as const;
}
