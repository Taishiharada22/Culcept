"use client";

/**
 * useCoAlterChatAdapter — CoAlter タブのチャット adapter 解決 hook（TalkBridge-T1b）
 *
 * 責務: async な live read（talk_thread read-only）を **hook 内部に閉じ**、UI には
 * 常に同期の `CoAlterChatAdapter` + 表示用 `readState` だけを渡す。
 *
 * 状態遷移（fail-closed・CEO T1b-3/4）:
 *   - flag OFF / threadId 未注入 → fixture（fetch 0・現行動作・視覚不変）
 *   - flag ON ∧ threadId 注入 → fixture を表示したまま GET 1回 →
 *       成功 → talk_thread read-only adapter（readState "live"）
 *       401/403/404/empty/error → fixture のまま（readState "unavailable"・タブは壊れない）
 *
 * 存在しないもの: send・既読・typing・Realtime・/api/coalter/*・useCoAlter（T1c 以降・別 GO）。
 */

import { useEffect, useMemo, useState } from "react";

import {
  createTalkThreadReadonlyAdapter,
  fetchTalkThreadMessagesOnce,
  resolveCoAlterChatAdapter,
  resolveLiveReadTarget,
  type CoAlterChatAdapter,
  type CoAlterChatMessage,
  type CoAlterChatParticipant,
} from "./coalterChatAdapter";
import type { CoAlterPlanSessionFixture } from "./coalterPlanSessionFixture";

/** チャット欄の読み込み状態（UI バッジ表示用・fixture では何も出さない＝視覚不変）。 */
export type CoAlterChatReadState = "fixture" | "loading" | "live" | "unavailable";

interface LiveThreadData {
  readonly threadId: string;
  readonly messages: readonly CoAlterChatMessage[];
  readonly participants: readonly CoAlterChatParticipant[];
}

/**
 * 同一 threadId への in-flight GET を共有する dedupe（module-level）。
 * React StrictMode の dev 二重 mount でも **GET はちょうど 1 回**になる。
 * 解決後は削除する（再 mount 時は新たに 1 回読む＝ポーリングではない）。
 * GET は冪等・read-only なので abort は行わない（unmount 時は setState だけ抑止）。
 */
const inflightThreadReads = new Map<
  string,
  Promise<Awaited<ReturnType<typeof fetchTalkThreadMessagesOnce>>>
>();

export function readTalkThreadDeduped(
  threadId: string,
  fetchImpl?: (url: string) => Promise<Response>,
): Promise<Awaited<ReturnType<typeof fetchTalkThreadMessagesOnce>>> {
  let pending = inflightThreadReads.get(threadId);
  if (!pending) {
    pending = fetchTalkThreadMessagesOnce(threadId, fetchImpl).finally(() => {
      inflightThreadReads.delete(threadId);
    });
    inflightThreadReads.set(threadId, pending);
  }
  return pending;
}

export function useCoAlterChatAdapter(opts: {
  readonly session: CoAlterPlanSessionFixture;
  readonly liveEnabled: boolean;
  readonly devThreadId: string;
}): { adapter: CoAlterChatAdapter; readState: CoAlterChatReadState } {
  const { session, liveEnabled, devThreadId } = opts;
  const targetThreadId = resolveLiveReadTarget({ liveEnabled, devThreadId });

  const [liveData, setLiveData] = useState<LiveThreadData | null>(null);
  const [failedThreadId, setFailedThreadId] = useState<string | null>(null);

  useEffect(() => {
    if (!targetThreadId) return; // fixture 経路: fetch 0
    let cancelled = false;
    // GET ちょうど 1 回（in-flight dedupe ＝ StrictMode 二重 mount でも 1 回）
    void readTalkThreadDeduped(targetThreadId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setLiveData({
          threadId: targetThreadId,
          messages: result.messages,
          participants: result.participants,
        });
      } else {
        setFailedThreadId(targetThreadId);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [targetThreadId]);

  const fixtureAdapter = useMemo(
    () => resolveCoAlterChatAdapter({ session, liveEnabled }),
    [session, liveEnabled],
  );
  const liveAdapter = useMemo(
    () =>
      liveData
        ? createTalkThreadReadonlyAdapter(liveData.threadId, {
            messages: liveData.messages,
            participants: liveData.participants,
          })
        : null,
    [liveData],
  );

  if (!targetThreadId) {
    return { adapter: fixtureAdapter, readState: "fixture" };
  }
  if (liveAdapter && liveData?.threadId === targetThreadId) {
    return { adapter: liveAdapter, readState: "live" };
  }
  if (failedThreadId === targetThreadId) {
    // fail-closed: fixture は引き続き使える（CEO T1b UI 要件）
    return { adapter: fixtureAdapter, readState: "unavailable" };
  }
  return { adapter: fixtureAdapter, readState: "loading" };
}
