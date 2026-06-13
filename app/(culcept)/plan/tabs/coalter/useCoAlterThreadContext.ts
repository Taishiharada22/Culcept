"use client";

/**
 * useCoAlterThreadContext — TalkBridge-A: 「これまでの会話」文脈の read-only 取得 hook
 *
 * 責務: flag ON ∧ threadId（C-1 relation の `attachedThreadRef` 由来）のとき、**既存 T1b の
 * read-only thread message GET**（`readTalkThreadDeduped`＝dedupe・GET-only・fail-closed）を
 * 高々 1 回呼び、**別セクション表示用**の messages + 匿名話者を返す。
 *
 * 不変条件（CEO TalkBridge-A）:
 *   - **read-only**（send/既読/Realtime/POST なし）。新 fetch ロジックを足さない（T1b 資産再利用）。
 *   - 話者は **匿名/表示専用**（識別未解決）。**session 参加者に昇格しない・旧 pair source を作らない・
 *     self を推論しない**（session contract を import しない＝構造的に不可）。
 *   - thread messages は **session 本文（session message）に変換・複製しない**（session message 契約を import しない）。
 *   - fail-closed: threadId なし / fetch 失敗 / empty → **文脈を出さない**（本文は不変）。
 */

import { useEffect, useMemo, useState } from "react";

import { readTalkThreadDeduped } from "./useCoAlterChatAdapter";
import type {
  CoAlterChatMessage,
  CoAlterChatParticipant,
  TalkThreadReadFailure,
} from "./coalterChatAdapter";

/** 文脈セクションの状態。"ready" 以外はセクション非表示（fail-closed）。 */
export type ThreadContextState = "off" | "loading" | "ready" | "empty" | "unavailable";

interface ThreadContextData {
  readonly threadId: string;
  readonly messages: readonly CoAlterChatMessage[];
  readonly speakers: readonly CoAlterChatParticipant[];
}

export function useCoAlterThreadContext(opts: {
  readonly enabled: boolean;
  readonly threadId: string | null;
}): {
  messages: readonly CoAlterChatMessage[];
  speakers: readonly CoAlterChatParticipant[];
  state: ThreadContextState;
} {
  const active =
    opts.enabled && typeof opts.threadId === "string" && opts.threadId.length > 0;
  const targetThreadId = active ? (opts.threadId as string) : null;

  const [data, setData] = useState<ThreadContextData | null>(null);
  const [failure, setFailure] = useState<TalkThreadReadFailure | null>(null);

  useEffect(() => {
    if (!targetThreadId) return; // 非 active: fetch 0
    let cancelled = false;
    // messages GET ちょうど 1 回（既存 dedupe・GET-only・POST/PATCH/DELETE 構文上不可）
    void readTalkThreadDeduped(targetThreadId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setData({ threadId: targetThreadId, messages: result.messages, speakers: result.participants });
      } else {
        setFailure(result.reason); // "empty" を含む（CEO: empty も fail-closed・状態は区別）
      }
    });
    return () => {
      cancelled = true;
    };
  }, [targetThreadId]);

  return useMemo(() => {
    if (!active) return { messages: [], speakers: [], state: "off" as ThreadContextState };
    if (failure === "empty") return { messages: [], speakers: [], state: "empty" as ThreadContextState };
    if (failure) return { messages: [], speakers: [], state: "unavailable" as ThreadContextState };
    if (data && data.threadId === targetThreadId) {
      return { messages: data.messages, speakers: data.speakers, state: "ready" as ThreadContextState };
    }
    return { messages: [], speakers: [], state: "loading" as ThreadContextState };
  }, [active, failure, data, targetThreadId]);
}
