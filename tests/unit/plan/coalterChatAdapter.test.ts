/**
 * coalterChatAdapter — TalkBridge-T1a skeleton test（+ T1a contract correction）
 *
 * 検証対象（CEO 指示 T1a-5 + 2026-06-12 訂正）:
 *   1. fixture provider が現行デザインの data（messages/participants）を render できる
 *   2. participant source は **fixture を real identity source に含まない**
 *      （= provider 軸と participant source 軸の分離）
 *   3. 旧 /talk（talk_pair_member）は **数ある source の 1 つに過ぎない**
 *   4. culcept_relation / plan_session も有効な将来 source
 *   5. live flag OFF（既定）/ ON いずれでも fixture（adapter 経路から network 0）
 *   6. flag は単一スイッチでない（capabilities は段階ごと独立 field）
 *   7. flag default OFF ガード
 *
 * 正本: docs/coalter-plan-tab-talk-migration-design.md §4（T1a/T1b/T1c 分割）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  createFixtureChatAdapter,
  resolveCoAlterChatAdapter,
  COALTER_CHAT_PROVIDER_KINDS,
  COALTER_PARTICIPANT_SOURCE_KINDS,
  type CoAlterChatAdapter,
  type CoAlterChatProvider,
  type CoAlterParticipantSource,
} from "@/app/(culcept)/plan/tabs/coalter/coalterChatAdapter";
import { COALTER_PLAN_SESSION_FIXTURES } from "@/app/(culcept)/plan/tabs/coalter/coalterPlanSessionFixture";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

describe("coalterChatAdapter（TalkBridge-T1a + contract correction）", () => {
  // ── network 不使用ガード（adapter 構築 + 全 getter 呼び出しで fetch 0 回） ──
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

  it("fixture provider が現行デザインの data を render できる（messages 不変・participant 表示 field 不変）", () => {
    for (const mode of ["daily", "travel"] as const) {
      const session = COALTER_PLAN_SESSION_FIXTURES[mode];
      const adapter = createFixtureChatAdapter(session);

      // provider 軸は fixture（mock）
      expect(adapter.provider).toEqual({ kind: "fixture", sessionId: session.id });

      // messages は現行デザインのまま
      expect(adapter.getInitialMessages()).toEqual(session.messages);

      // participant の **表示 field（id/name/initial/tone）は不変**＝視覚的に完全不変
      const view = adapter.getParticipants();
      expect(view.map((p) => ({ id: p.id, name: p.name, initial: p.initial, tone: p.tone }))).toEqual(
        session.participants.map((p) => ({
          id: p.id,
          name: p.name,
          initial: p.initial,
          tone: p.tone,
        })),
      );
      // viewer = 先頭 participant（送信者・現行動作）
      expect(adapter.getViewer()?.id).toBe(session.participants[0].id);
    }
  });

  it("fixture は participant source ではない: fixture participant は plan_session 出自で identityState resolved", () => {
    const session = COALTER_PLAN_SESSION_FIXTURES.daily;
    const view = createFixtureChatAdapter(session).getParticipants();

    for (const p of view) {
      // ★ 訂正の核: fixture data 由来でも identity source は **plan_session**（fixture ではない）
      //   T1b-2: optional source は identityState discriminated union に置換。fixture は resolved。
      expect(p.identityState).toBe("resolved");
      if (p.identityState === "resolved") {
        expect(p.source.kind).toBe("plan_session");
        expect(p.source.kind).not.toBe("fixture");
        if (p.source.kind === "plan_session") {
          expect(p.source.planSessionId).toBe(session.id);
          expect(p.source.userId).toBe(p.id);
        }
      }
    }
  });

  it("2 軸の分離: fixture は provider kind に含まれ、participant source kind には含まれない", () => {
    // (A) provider / data-mode 軸 — fixture を含む（mock かどうかの軸）
    expect(COALTER_CHAT_PROVIDER_KINDS).toContain("fixture");
    // (B) participant source 軸 — fixture を **含まない**（identity の出自のみ）
    expect(COALTER_PARTICIPANT_SOURCE_KINDS).not.toContain(
      "fixture" as unknown as (typeof COALTER_PARTICIPANT_SOURCE_KINDS)[number],
    );
    // participant source は TravelCore ParticipantSourceRef と整合
    expect([...COALTER_PARTICIPANT_SOURCE_KINDS]).toEqual([
      "self",
      "talk_pair_member",
      "culcept_relation",
      "plan_session",
    ]);
  });

  it("旧 /talk（talk_pair_member）は数ある participant source の 1 つに過ぎない", () => {
    // 4 出自すべてが対等に構成可能（talk_pair_member を特権化しない）
    const sources: CoAlterParticipantSource[] = [
      { kind: "self", userId: "u-self" },
      { kind: "talk_pair_member", pairStateId: "pair-1", userId: "u-a" },
      { kind: "culcept_relation", relationId: "rel-1", userId: "u-b" },
      { kind: "plan_session", planSessionId: "sess-1", userId: "u-c" },
    ];
    expect(sources.map((s) => s.kind)).toEqual([
      "self",
      "talk_pair_member",
      "culcept_relation",
      "plan_session",
    ]);

    // provider も talk_thread に限らない（fixture / culcept_relation / plan_session も対等）
    const providers: CoAlterChatProvider[] = [
      { kind: "fixture", sessionId: "s-1" },
      { kind: "talk_thread", threadId: "t-1" },
      { kind: "culcept_relation", relationId: "r-1" },
      { kind: "plan_session", sessionId: "s-2" },
    ];
    expect(providers.map((p) => p.kind)).toEqual([
      "fixture",
      "talk_thread",
      "culcept_relation",
      "plan_session",
    ]);
  });

  it("culcept_relation / plan_session participant を持つ adapter も構成可能（将来 source の対等性）", () => {
    const relationAdapter: CoAlterChatAdapter = {
      provider: { kind: "culcept_relation", relationId: "rel-9" },
      capabilities: {
        read: "fixture",
        send: "none",
        realtime: false,
        readReceipts: false,
        coalterInvoke: false,
      },
      getParticipants: () => [
        {
          id: "u-self",
          name: "あなた",
          initial: "あ",
          tone: "sky",
          identityState: "resolved",
          source: { kind: "self", userId: "u-self" },
        },
        {
          id: "u-partner",
          name: "Partner",
          initial: "P",
          tone: "rose",
          identityState: "resolved",
          source: { kind: "culcept_relation", relationId: "rel-9", userId: "u-partner" },
        },
      ],
      getViewer: () => null,
      getInitialMessages: () => [],
    };
    expect(
      relationAdapter
        .getParticipants()
        .map((p) => (p.identityState === "resolved" ? p.source.kind : null)),
    ).toEqual(["self", "culcept_relation"]);
  });

  it("live flag OFF/ON いずれも fixture（resolver 分岐は T1b 接続点のみ・実 API 経路なし）", () => {
    const session = COALTER_PLAN_SESSION_FIXTURES.daily;
    for (const liveEnabled of [false, true]) {
      const adapter = resolveCoAlterChatAdapter({ session, liveEnabled });
      expect(adapter.provider.kind).toBe("fixture");
      expect(adapter.capabilities.read).toBe("fixture");
      expect(adapter.getInitialMessages()).toEqual(session.messages);
    }
  });

  it("flag は単一スイッチでない: capabilities は段階ごと独立 field（fixture は read/send 以外すべて無効）", () => {
    const caps = createFixtureChatAdapter(COALTER_PLAN_SESSION_FIXTURES.travel).capabilities;
    // read/send は別 field（send があっても realtime/既読/invoke は点かない）
    expect(caps).toEqual({
      read: "fixture",
      send: "local_echo",
      realtime: false,
      readReceipts: false,
      coalterInvoke: false,
    });
    // 1 flag で全部 true にはならない構造（独立 field の集合）
    expect(caps.realtime).toBe(false);
    expect(caps.readReceipts).toBe(false);
    expect(caps.coalterInvoke).toBe(false);
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

  it("flag default OFF ガード: 環境未設定で coalterChatLive は false", () => {
    expect(PLAN_FLAGS.coalterChatLive).toBe(false);
  });
});
