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
 *
 * 共有表示:
 * - status API から既存の提案カードを取得（初期ロード時に両方のクライアントで表示）
 * - Supabase Realtime で coalter_sessions の変更を監視
 * - dismissProposal は end API を呼び出し、DB更新 → Realtime で相手にも反映
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type {
  CoAlterPairState,
  CoAlterSessionState,
  ProposalCard,
  TriggerConfidence,
  CoAlterApiResponse,
  CoAlterOutput,
  PendingAxisDeltas,
  AxisKey,
  AxisDelta,
} from "@/lib/coalter/types";
import { candidateKey } from "@/lib/coalter/axes";
import type { PlanItem } from "@/lib/coalter/planShelf";
import type { RefineCandidate, RefineDirection } from "@/lib/coalter/refineItem";

export type { PlanItem };

// ─────────────────────────────────────────────
// State Types
// ─────────────────────────────────────────────

export interface CoAlterState {
  pairState: CoAlterPairState;
  pairStateId: string | null;
  /** 直近のセッションID（Plan Shelf保存の監査用、invokeで更新） */
  currentSessionId: string | null;
  sessionState: CoAlterSessionState | null;
  currentProposal: ProposalCard | null;
  lastTrigger: { confidence: TriggerConfidence; pattern: string | null } | null;
  loading: boolean;
  error: string | null;
  /** Phase 1.5: 次の reroll に渡す軸操作（memory only） */
  pendingAxisDeltas: PendingAxisDeltas;
  /** Phase 1.5: 既出候補キー（memory only） */
  seenCandidateKeys: string[];
  /** Phase 1.5.1: 保存済みプランアイテム（全期間） */
  planItems: PlanItem[];
  /** Phase 1.5.1: プラン取得中フラグ */
  planItemsLoading: boolean;
}

const INITIAL_STATE: CoAlterState = {
  pairState: "inactive",
  pairStateId: null,
  currentSessionId: null,
  sessionState: null,
  currentProposal: null,
  lastTrigger: null,
  loading: false,
  error: null,
  pendingAxisDeltas: {},
  seenCandidateKeys: [],
  planItems: [],
  planItemsLoading: false,
};

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

export function useCoAlter(threadId: string) {
  const [state, setState] = useState<CoAlterState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const realtimeChannelRef = useRef<ReturnType<ReturnType<typeof supabaseBrowser>["channel"]> | null>(null);

  // ── ペア状態の初期ロード + 既存の提案カード取得 ──
  useEffect(() => {
    let cancelled = false;

    async function loadPairState() {
      try {
        const res = await fetch(`/api/coalter/status?threadId=${encodeURIComponent(threadId)}`);
        if (!res.ok) {
          if (!cancelled) setState((prev) => ({ ...prev, pairState: "inactive" }));
          return;
        }
        const data = await res.json();
        if (!cancelled && data.ok && data.data) {
          const d = data.data as {
            state: string;
            pairStateId: string | null;
            initiatedBy: string | null;
            isInitiator?: boolean;
            activeSessionId?: string | null;
            activeProposal?: ProposalCard | null;
          };
          setState((prev) => ({
            ...prev,
            pairState: (d.state === "inactive" ? "inactive" : d.state) as CoAlterPairState,
            pairStateId: d.pairStateId,
            // 既存の提案カードがあれば表示（相手が起動した提案も含む）
            ...(d.activeProposal ? {
              sessionState: "completed" as CoAlterSessionState,
              currentProposal: d.activeProposal,
              currentSessionId: d.activeSessionId ?? prev.currentSessionId,
            } : {}),
          }));
        }
      } catch {
        if (!cancelled) setState((prev) => ({ ...prev, pairState: "inactive" }));
      }
    }

    loadPairState();

    return () => {
      cancelled = true;
    };
  }, [threadId]);

  // ── Supabase Realtime: coalter_sessions の変更を監視 ──
  useEffect(() => {
    const sb = supabaseBrowser();

    const channel = sb.channel(`coalter:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "coalter_sessions",
          filter: `thread_id=eq.${threadId}`,
        },
        async () => {
          // 新しいセッションが作成された → 提案カードを取得
          try {
            const res = await fetch(`/api/coalter/status?threadId=${encodeURIComponent(threadId)}`);
            const data = await res.json();
            if (data.ok && data.data?.activeProposal) {
              setState((prev) => ({
                ...prev,
                sessionState: "completed",
                currentProposal: data.data.activeProposal,
                loading: false,
              }));
            }
          } catch {
            // silent — フォールバックはポーリングに任せる
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "coalter_sessions",
          filter: `thread_id=eq.${threadId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (payload: any) => {
          const newState = (payload.new as { state?: string })?.state;
          if (newState === "cancelled") {
            // セッションが終了された（相手がdismissした） → 提案カードを閉じる
            setState((prev) => ({
              ...prev,
              sessionState: null,
              currentProposal: null,
            }));
          } else if (newState === "completed") {
            // パイプラインが完了 → 提案カードを取得して表示
            try {
              const res = await fetch(`/api/coalter/status?threadId=${encodeURIComponent(threadId)}`);
              const data = await res.json();
              if (data.ok && data.data?.activeProposal) {
                setState((prev) => ({
                  ...prev,
                  sessionState: "completed",
                  currentProposal: data.data.activeProposal,
                  loading: false,
                }));
              }
            } catch {
              // silent
            }
          }
        },
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [threadId]);

  // ── fetchPlanItems: 保存済みプランを取得（全期間） ──
  const fetchPlanItems = useCallback(async () => {
    setState((prev) => ({ ...prev, planItemsLoading: true }));
    try {
      const res = await fetch(`/api/coalter/plan?threadId=${encodeURIComponent(threadId)}`);
      if (!res.ok) {
        setState((prev) => ({ ...prev, planItemsLoading: false }));
        return;
      }
      const data = await res.json();
      if (data.ok && data.data?.items) {
        setState((prev) => ({
          ...prev,
          planItems: data.data.items as PlanItem[],
          planItemsLoading: false,
        }));
      } else {
        setState((prev) => ({ ...prev, planItemsLoading: false }));
      }
    } catch {
      setState((prev) => ({ ...prev, planItemsLoading: false }));
    }
  }, [threadId]);

  // ── deletePlanItem: プラン削除（楽観更新 + rollback） ──
  const deletePlanItem = useCallback(
    async (itemId: string) => {
      // 楽観更新: 先に state から除去
      let backup: PlanItem[] = [];
      setState((prev) => {
        backup = prev.planItems;
        return { ...prev, planItems: prev.planItems.filter((i) => i.id !== itemId) };
      });
      try {
        const res = await fetch(
          `/api/coalter/plan?itemId=${encodeURIComponent(itemId)}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          // ロールバック
          setState((prev) => ({ ...prev, planItems: backup }));
          return;
        }
        const data = await res.json();
        if (!data.ok) {
          setState((prev) => ({ ...prev, planItems: backup }));
        }
      } catch {
        setState((prev) => ({ ...prev, planItems: backup }));
      }
    },
    [],
  );

  // ── refinePlanItem: LLM で局所修正候補を 1 件生成（プレビュー用）──
  // Phase 1.5.3 ④
  const refinePlanItem = useCallback(
    async (itemId: string, direction: RefineDirection): Promise<RefineCandidate | null> => {
      try {
        const res = await fetch("/api/coalter/refine-item", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId, direction }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.ok || !data.data?.candidate) return null;
        return data.data.candidate as RefineCandidate;
      } catch {
        return null;
      }
    },
    [],
  );

  // ── applyRefinedPlanItem: プレビューした差し替え候補を実際に適用 ──
  // Phase 1.5.3 ④
  const applyRefinedPlanItem = useCallback(
    async (
      itemId: string,
      patch: {
        title: string;
        description?: string;
        practicalInfo?: string | null;
        url?: string | null;
        timeSlot?: string | null;
      },
    ): Promise<boolean> => {
      try {
        const res = await fetch("/api/coalter/plan", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId, ...patch }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        if (!data.ok || !data.data?.item) return false;
        // state に反映
        const updated = data.data.item as PlanItem;
        setState((prev) => ({
          ...prev,
          planItems: prev.planItems.map((it) => (it.id === itemId ? updated : it)),
        }));
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  // ── generatePairNarrative: 「2人にとって」narrative を LLM 生成（Phase 1.5.3 ⑤）──
  // 既にキャッシュがあれば LLM を呼ばずにそのまま返す（サーバ側で判定）
  const generatePairNarrative = useCallback(
    async (itemId: string): Promise<string | null> => {
      try {
        const res = await fetch("/api/coalter/plan/narrative", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.ok || !data.data?.item) return null;
        const updated = data.data.item as PlanItem;
        setState((prev) => ({
          ...prev,
          planItems: prev.planItems.map((it) => (it.id === itemId ? updated : it)),
        }));
        return updated.pairNarrative;
      } catch {
        return null;
      }
    },
    [],
  );

  // ── マウント時に保存済みプランを取得 ──
  useEffect(() => {
    fetchPlanItems();
  }, [fetchPlanItems]);

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
          const serverKeys = data.data.seenCandidateKeys ?? [];
          const localKeys = data.data.proposalCard.candidates.map((c) =>
            candidateKey({ title: c.title, url: c.url }),
          );
          const newKeys = serverKeys.length > 0 ? serverKeys : localKeys;
          setState((prev) => ({
            ...prev,
            sessionState: "completed",
            currentProposal: data.data!.proposalCard,
            currentSessionId: data.data!.sessionId ?? prev.currentSessionId,
            loading: false,
            seenCandidateKeys: Array.from(
              new Set([...prev.seenCandidateKeys, ...newKeys]),
            ),
            pendingAxisDeltas: {},
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

  // ── Phase 1.5: toggleAxisDelta — 軸の ± を押す（同方向再タップで解除） ──
  const toggleAxisDelta = useCallback((key: AxisKey, direction: AxisDelta) => {
    setState((prev) => {
      const current = prev.pendingAxisDeltas[key];
      const next = { ...prev.pendingAxisDeltas };
      if (current === direction) {
        // 同じ方向を再タップ → 解除
        delete next[key];
      } else {
        next[key] = direction;
      }
      return { ...prev, pendingAxisDeltas: next };
    });
  }, []);

  // ── Phase 1.5: reroll — pendingDeltas + avoidKeys を使って再生成 ──
  const reroll = useCallback(async () => {
    if (state.pairState !== "enabled") return;
    if (state.sessionState === "active") return;

    setState((prev) => ({
      ...prev,
      loading: true,
      error: null,
      sessionState: "active",
    }));

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/coalter/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          message: null,
          pendingDeltas: state.pendingAxisDeltas,
          avoidKeys: state.seenCandidateKeys,
        }),
        signal: controller.signal,
      });
      const data: CoAlterApiResponse<CoAlterOutput> = await res.json();

      if (data.ok && data.data) {
        const serverKeys = data.data.seenCandidateKeys ?? [];
        const localKeys = data.data.proposalCard.candidates.map((c) =>
          candidateKey({ title: c.title, url: c.url }),
        );
        const newKeys = serverKeys.length > 0 ? serverKeys : localKeys;
        setState((prev) => ({
          ...prev,
          sessionState: "completed",
          currentProposal: data.data!.proposalCard,
          currentSessionId: data.data!.sessionId ?? prev.currentSessionId,
          loading: false,
          seenCandidateKeys: Array.from(
            new Set([...prev.seenCandidateKeys, ...newKeys]),
          ),
          pendingAxisDeltas: {}, // 使い切ったのでクリア
        }));
      } else {
        setState((prev) => ({
          ...prev,
          sessionState: "completed", // 失敗時も前のカードは残す
          loading: false,
          error: data.error ?? "候補の組み直しに失敗しました",
        }));
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setState((prev) => ({
        ...prev,
        sessionState: "completed",
        loading: false,
        error: "通信エラー",
      }));
    }
  }, [threadId, state.pairState, state.sessionState, state.pendingAxisDeltas, state.seenCandidateKeys]);

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

  // ── dismiss: 提案カードを閉じる（セッション終了 — DB更新 → Realtime で相手にも反映） ──
  const dismissProposal = useCallback(() => {
    // まずローカルで即座に閉じる（UXのため）
    setState((prev) => ({
      ...prev,
      sessionState: null,
      currentProposal: null,
    }));
    // DB更新: end API を呼び出し → Realtime で相手のクライアントにも反映
    fetch("/api/coalter/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId, action: "end_session" }),
    }).catch(() => {
      // silent — ローカルでは既に閉じている
    });
  }, [threadId]);

  // ── adopt: 候補を採用（Plan Shelfに追加） ──
  const adoptCandidate = useCallback(
    async (candidate: { rank: number; title: string; oneLiner: string; practicalInfo: string | null; url?: string | null }) => {
      // Plan Shelf に追加
      const today = new Date().toISOString().slice(0, 10);
      const sessionId = state.currentSessionId;
      if (!sessionId) {
        // セッションIDが無い場合は Plan Shelf 保存できない（FK違反回避）
        // 既存UI挙動を壊さないよう、カードだけ閉じる
        setState((prev) => ({
          ...prev,
          sessionState: null,
          currentProposal: null,
        }));
        return;
      }

      // 代替案（Phase 1.5.3 ②）— 採用した候補以外を「控え」として抱き合わせ保存
      const proposal = state.currentProposal;
      const alternatives = proposal
        ? proposal.candidates
            .filter((c) => c.rank !== candidate.rank)
            .sort((a, b) => a.rank - b.rank)
            .map((c) => ({
              title: c.title,
              oneLiner: c.oneLiner,
              practicalInfo: c.practicalInfo ?? null,
              url: c.url ?? null,
            }))
        : null;

      try {
        const res = await fetch("/api/coalter/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId,
            sessionId,
            targetDate: today, // TODO: 会話から日付を抽出
            title: candidate.title,
            description: candidate.oneLiner,
            practicalInfo: candidate.practicalInfo,
            url: candidate.url ?? null,
            category: "other", // TODO: テーマから自動判定
            alternatives: alternatives && alternatives.length > 0 ? alternatives : null,
          }),
        });
        const data = await res.json();
        if (data.ok && data.data?.item) {
          // 楽観 append（即座にUIへ反映）
          setState((prev) => ({
            ...prev,
            planItems: [...prev.planItems, data.data.item as PlanItem],
          }));
        }
        // 整合性確保（非同期で全件再取得 — エラーは無視）
        fetchPlanItems();
      } catch {
        // Plan Shelf保存失敗は許容（採用自体は成功させる）
      }

      // カードを閉じる
      setState((prev) => ({
        ...prev,
        sessionState: null,
        currentProposal: null,
      }));
      // DB更新
      fetch("/api/coalter/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, action: "end_session" }),
      }).catch(() => {});
    },
    [threadId, state.currentSessionId, state.currentProposal, fetchPlanItems],
  );

  // ── refine（deprecated）: Phase 1.5 で reroll + toggleAxisDelta に置き換わった ──
  // 後方互換のため関数は残す。新しいコンポーネントは呼び出さない。
  const refine = useCallback(() => {
    // no-op（Phase 1.5 以降 reroll を使う）
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
    adoptCandidate,
    refine,
    reroll,
    toggleAxisDelta,
    notifySoftTrigger,
    dismissTrigger,
    fetchPlanItems,
    deletePlanItem,
    refinePlanItem,
    applyRefinedPlanItem,
    generatePairNarrative,
    // 便利な派生値
    isEnabled: state.pairState === "enabled",
    isActive: state.sessionState === "active",
    isPending: state.pairState === "pending_consent",
    hasProposal: state.currentProposal !== null,
  };
}
