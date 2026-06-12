/**
 * coalterChatAdapter — T1a skeleton test
 *
 * 検証対象（CEO 指示 T1a-5）:
 *   1. fixture adapter が現行デザインの data（messages/participants）をそのまま返す
 *   2. live flag OFF（既定）では fixture のみが使われる
 *   3. CoAlter タブ（adapter 経路）から network 呼び出しが発生しない
 *   4. adapter の source 型が旧 /talk pair を唯一の出自として強制しない
 *      （fixture / talk_thread / culcept_relation / self が対等）
 *   5. flag default OFF ガード（accidental ON commit 防止・calendarViewMode test と同型）
 *
 * 正本: docs/coalter-plan-tab-talk-migration-design.md §4（T1a/T1b/T1c 分割）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  createFixtureChatAdapter,
  resolveCoAlterChatAdapter,
  type CoAlterChatAdapter,
  type CoAlterChatSource,
} from "@/app/(culcept)/plan/tabs/coalter/coalterChatAdapter";
import { COALTER_PLAN_SESSION_FIXTURES } from "@/app/(culcept)/plan/tabs/coalter/coalterPlanSessionFixture";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

describe("coalterChatAdapter（T1a skeleton）", () => {
  // ── 3: network 不使用ガード（adapter 構築 + 全 getter 呼び出しで fetch 0 回） ──
  const fetchSpy = vi.fn();
  let originalFetch: typeof globalThis.fetch | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
    fetchSpy.mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch as typeof globalThis.fetch;
  });

  it("fixture adapter は現行デザインの messages/participants をそのまま返す（daily/travel 両モード）", () => {
    for (const mode of ["daily", "travel"] as const) {
      const session = COALTER_PLAN_SESSION_FIXTURES[mode];
      const adapter = createFixtureChatAdapter(session);

      // 現行デザイン data の render contract（同一参照＝改変なし）
      expect(adapter.getInitialMessages()).toEqual(session.messages);
      expect(adapter.getParticipants()).toEqual(session.participants);
      // viewer = 先頭 participant（送信者・現行動作）
      expect(adapter.getViewer()).toEqual(session.participants[0]);
      // source は fixture / capabilities は local echo（live なし）
      expect(adapter.source).toEqual({ kind: "fixture", sessionId: session.id });
      expect(adapter.capabilities).toEqual({ live: false, send: "local_echo" });
    }
  });

  it("live flag OFF（既定）→ resolver は fixture adapter を返す", () => {
    const session = COALTER_PLAN_SESSION_FIXTURES.daily;
    const adapter = resolveCoAlterChatAdapter({ session, liveEnabled: false });
    expect(adapter.source.kind).toBe("fixture");
    expect(adapter.capabilities.live).toBe(false);
    expect(adapter.getInitialMessages()).toEqual(session.messages);
  });

  it("T1a: live flag ON でも fixture（live adapter 未実装＝実 API 経路が存在しない）", () => {
    const session = COALTER_PLAN_SESSION_FIXTURES.daily;
    const adapter = resolveCoAlterChatAdapter({ session, liveEnabled: true });
    // T1b で talk_thread read-only adapter に置き換わる接続点。T1a では fixture のまま。
    expect(adapter.source.kind).toBe("fixture");
    expect(adapter.capabilities.live).toBe(false);
  });

  it("adapter 経路から network 呼び出しが発生しない（fetch 0 回）", () => {
    for (const liveEnabled of [false, true]) {
      const adapter = resolveCoAlterChatAdapter({
        session: COALTER_PLAN_SESSION_FIXTURES.travel,
        liveEnabled,
      });
      adapter.getParticipants();
      adapter.getViewer();
      adapter.getInitialMessages();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("source 型は旧 /talk pair を唯一の出自として強制しない（4 出自が対等に構成可能）", () => {
    // 型レベル: CoAlterChatSource が4出自の union であること（コンパイルが通ること自体が検証）
    const sources: CoAlterChatSource[] = [
      { kind: "fixture", sessionId: "s-1" },
      { kind: "talk_thread", threadId: "t-1" },
      { kind: "culcept_relation", relationId: "r-1" },
      { kind: "self" },
    ];
    expect(sources.map((s) => s.kind)).toEqual([
      "fixture",
      "talk_thread",
      "culcept_relation",
      "self",
    ]);

    // adapter 契約も talk_thread 以外の source で実装可能（self = solo の最小実装）
    const soloAdapter: CoAlterChatAdapter = {
      source: { kind: "self" },
      capabilities: { live: false, send: "none" },
      getParticipants: () => [],
      getViewer: () => null,
      getInitialMessages: () => [],
    };
    expect(soloAdapter.source.kind).toBe("self");
    expect(soloAdapter.getViewer()).toBeNull();
  });

  it("flag default OFF ガード: 環境未設定で coalterChatLive は false", () => {
    // vitest 環境では NEXT_PUBLIC_PLAN_COALTER_CHAT_LIVE 未設定 ＝ production default と同じ
    expect(PLAN_FLAGS.coalterChatLive).toBe(false);
  });
});
