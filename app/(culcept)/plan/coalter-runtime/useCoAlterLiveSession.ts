"use client";

/**
 * useCoAlterLiveSession — CoAlter 本文の live read/send を内包する hook（thin wrapper）
 *
 * pure 関数（coalterLiveSessionClient）を useState/useEffect で束ねるだけ（ロジックは pure 側で test）。
 * 配置は runtime（UI tab folder の backend-free guard 維持・`/api/coalter` 結合をここに隔離）。
 *
 * 状態（fail-closed）:
 *   - enabled=false / sessionId なし → "off"（fetch 0）
 *   - GET 中 → "loading" / 成功 → "live"（messages 保持）/ 失敗(401/404/error) → "unavailable"
 *   - StrictMode 二重 mount でも GET は in-flight dedupe で 1 回。
 */

import { useCallback, useEffect, useState } from "react";

import type { CoAlterSessionMessage } from "@/app/(culcept)/plan/tabs/coalter/coalterSessionMessageContract";
import {
  fetchLiveSessionMessagesOnce,
  postLiveSessionMessageOnce,
  type LiveSessionState,
} from "./coalterLiveSessionClient";

export interface UseCoAlterLiveSessionResult {
  readonly state: LiveSessionState;
  readonly messages: readonly CoAlterSessionMessage[];
  /** text を送信（clientMessageId は内部生成・冪等）。成功で再取得し true。 */
  readonly send: (text: string) => Promise<boolean>;
  readonly refetch: () => void;
}

const inflightReads = new Map<string, Promise<unknown>>();

function newClientMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // fallback（非 secure context・古環境）: 時刻 + index は使えないため簡易乱数
  return `cmid-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function useCoAlterLiveSession(opts: {
  readonly enabled: boolean;
  readonly sessionId: string | null;
  /** test 注入用（既定 global fetch）。 */
  readonly fetchImpl?: typeof fetch;
}): UseCoAlterLiveSessionResult {
  const { enabled, sessionId, fetchImpl } = opts;
  const active = enabled && !!sessionId;

  const [state, setState] = useState<LiveSessionState>("off");
  const [messages, setMessages] = useState<readonly CoAlterSessionMessage[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!active || !sessionId) {
      setState("off");
      setMessages([]);
      return;
    }
    let cancelled = false;
    setState((s) => (s === "live" ? s : "loading"));
    // in-flight dedupe（同 sessionId+reloadKey）。
    const key = `${sessionId}#${reloadKey}`;
    let pending = inflightReads.get(key) as
      | ReturnType<typeof fetchLiveSessionMessagesOnce>
      | undefined;
    if (!pending) {
      pending = fetchLiveSessionMessagesOnce(sessionId, fetchImpl).finally(() => {
        inflightReads.delete(key);
      });
      inflightReads.set(key, pending);
    }
    void pending.then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setMessages(result.messages);
        setState("live");
      } else {
        setState("unavailable");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [active, sessionId, reloadKey, fetchImpl]);

  const send = useCallback(
    async (text: string): Promise<boolean> => {
      if (!active || !sessionId) return false;
      const trimmed = text.trim();
      if (!trimmed) return false;
      const result = await postLiveSessionMessageOnce(
        sessionId,
        { body: trimmed, clientMessageId: newClientMessageId() },
        fetchImpl,
      );
      if (result.ok) {
        refetch();
        return true;
      }
      return false;
    },
    [active, sessionId, fetchImpl, refetch],
  );

  return { state, messages, send, refetch };
}
