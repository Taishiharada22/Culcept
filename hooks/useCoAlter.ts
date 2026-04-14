"use client";

/**
 * useCoAlter — CoAlter クライアント状態管理フック
 *
 * 管理する状態:
 * - pairState: inactive / pending_consent / enabled / disabled
 * - sessionState: null（非アクティブ）/ active / completed / cancelled
 * - currentProposal: 最新の提案カード
 * - lastTrigger: 直近のsoft trigger情報
 * - loading: API呼び出し中フラグ
 */

import { useState, useCallback, useEffect, useRef } from "react";
import type {
  CoAlterPairState,
  CoAlterSessionState,
  ProposalCard,
  TriggerConfidence,
  CoAlterApiResponse,
  CoAlterOutput,
} from "@/lib/coalter/types";

// ─────────────────────────────────────────────
// State Types
// ─────────────────────────────────────────────

export interface CoAlterState {
  pairState: CoAlterPairState;
  pairStateId: string | null;
  sessionState: CoAlterSessionState | null;
  currentProposal: ProposalCard | null;
  lastTrigger: { confidence: TriggerConfidence; pattern: string | null } | null;
  loading: boolean;
  error: string | null;
}

const INITIAL_STATE: CoAlterState = {
  pairState: "inactive",
  pairStateId: null,
  sessionState: null,
  currentProposal: null,
  lastTrigger: null,
  loading: false,
  error: null,
};

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

export function useCoAlter(threadId: string) {
  const [state, setState] = useState<CoAlterState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  // ── ペア状態の初期ロード ──
  useEffect(() => {
    let cancelled = false;

    async function loadPairState() {
      try {
        const res = await fetch(`/api/coalter/activate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId }),
        });

        // 404 = まだactivateされていない → inactive
        if (res.status === 404) {
          if (!cancelled) {
            setState((prev) => ({ ...prev, pairState: "inactive" }));
          }
          return;
        }

        // activate APIはGETがないので、状態確認のためにPOSTを叩くと副作用がある。
        // Phase 1では初回ロード時はinactiveから始める。
        // ペア状態の永続的な確認はChatClient統合時にsupabaseから直接読む。
        if (!cancelled) {
          setState((prev) => ({ ...prev, pairState: "inactive" }));
        }
      } catch {
        if (!cancelled) {
          setState((prev) => ({ ...prev, pairState: "inactive" }));
        }
      }
    }

    // Phase 1: 初回はinactiveから始める。
    // TODO: supabaseから直接pair_stateを読む（ChatClient統合時）
    setState((prev) => ({ ...prev, pairState: "inactive" }));

    return () => {
      cancelled = true;
    };
  }, [threadId]);

  // ── activate: CoAlterの有効化をリクエスト ──
  const activate = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const res = await fetch("/api/coalter/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId }),
      });
      const data: CoAlterApiResponse = await res.json();

      if (data.ok && data.data) {
        const d = data.data as { pairStateId: string; state: string };
        setState((prev) => ({
          ...prev,
          pairState: d.state as CoAlterPairState,
          pairStateId: d.pairStateId,
          loading: false,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: data.error ?? "有効化に失敗しました",
        }));
      }
    } catch {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: "通信エラー",
      }));
    }
  }, [threadId]);

  // ── accept: 相手の同意リクエストを受理 ──
  const accept = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const res = await fetch("/api/coalter/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId }),
      });
      const data: CoAlterApiResponse = await res.json();

      if (data.ok && data.data) {
        const d = data.data as { pairStateId: string; state: string };
        setState((prev) => ({
          ...prev,
          pairState: d.state as CoAlterPairState,
          pairStateId: d.pairStateId,
          loading: false,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: data.error ?? "同意に失敗しました",
        }));
      }
    } catch {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: "通信エラー",
      }));
    }
  }, [threadId]);

  // ── invoke: CoAlterを起動（5層パイプライン実行） ──
  const invoke = useCallback(
    async (message: string | null = null) => {
      if (state.pairState !== "enabled") return;
      if (state.sessionState === "active") return;

      setState((prev) => ({
        ...prev,
        loading: true,
        error: null,
        sessionState: "active",
        currentProposal: null,
      }));

      // 前のリクエストがあればキャンセル
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/coalter/invoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId, message }),
          signal: controller.signal,
        });
        const data: CoAlterApiResponse<CoAlterOutput> = await res.json();

        if (data.ok && data.data) {
          setState((prev) => ({
            ...prev,
            sessionState: "completed",
            currentProposal: data.data!.proposalCard,
            loading: false,
          }));
        } else {
          setState((prev) => ({
            ...prev,
            sessionState: null,
            loading: false,
            error: data.error ?? "提案の生成に失敗しました",
          }));
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setState((prev) => ({
          ...prev,
          sessionState: null,
          loading: false,
          error: "通信エラー",
        }));
      }
    },
    [threadId, state.pairState, state.sessionState],
  );

  // ── end: セッション終了 or opt-out ──
  const end = useCallback(
    async (action: "end_session" | "opt_out" = "end_session") => {
      try {
        const res = await fetch("/api/coalter/end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId, action }),
        });
        const data: CoAlterApiResponse = await res.json();

        if (data.ok) {
          if (action === "opt_out") {
            setState((prev) => ({
              ...prev,
              pairState: "disabled",
              sessionState: null,
              currentProposal: null,
            }));
          } else {
            setState((prev) => ({
              ...prev,
              sessionState: null,
              currentProposal: null,
            }));
          }
        }
      } catch {
        // silent
      }
    },
    [threadId],
  );

  // ── dismiss: 提案カードを閉じる（セッション終了） ──
  const dismissProposal = useCallback(() => {
    setState((prev) => ({
      ...prev,
      sessionState: null,
      currentProposal: null,
    }));
  }, []);

  // ── soft trigger の通知（ChatClientから呼ばれる） ──
  const notifySoftTrigger = useCallback(
    (confidence: TriggerConfidence, pattern: string | null) => {
      if (confidence === "none") return;
      if (state.pairState !== "enabled") return;
      setState((prev) => ({
        ...prev,
        lastTrigger: { confidence, pattern },
      }));
    },
    [state.pairState],
  );

  // ── soft trigger の消去 ──
  const dismissTrigger = useCallback(() => {
    setState((prev) => ({ ...prev, lastTrigger: null }));
  }, []);

  // ── cleanup ──
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return {
    ...state,
    activate,
    accept,
    invoke,
    end,
    dismissProposal,
    notifySoftTrigger,
    dismissTrigger,
    // 便利な派生値
    isEnabled: state.pairState === "enabled",
    isActive: state.sessionState === "active",
    isPending: state.pairState === "pending_consent",
    hasProposal: state.currentProposal !== null,
  };
}
