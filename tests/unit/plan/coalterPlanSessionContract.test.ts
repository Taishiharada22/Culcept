/**
 * coalterPlanSessionContract — B-1 PlanSession binding skeleton test
 *
 * 検証対象（CEO B-1 tests required）:
 *   1. fixture session → participants 写像
 *   2. 新契約に root pairStateId 依存がない
 *   3. attachedThreadRef は optional
 *   4. session は threadId なしで成立
 *   5. CoAlter は system actor であって participant でない
 *   6. talk_pair_member は既定 participant source でない
 *   7. participants は self + culcept_relation を取りうる
 *   8. TravelCore ParticipantSourceRef 互換（4 kind 構成可）
 *   9. 既存 CoAlter タブ fixture は不変（pairStateId 値は残るが contract は読まない）
 *
 *  （no network/fetch は coalter フォルダ fs source-guard で担保・/talk untouched は diff scope）
 */
import { describe, it, expect } from "vitest";

import {
  COALTER_SYSTEM_AUTHOR,
  buildSessionContractFromFixture,
  buildSessionParticipantsFromFixture,
  isCoAlterSystemAuthor,
  type CoAlterPlanSession,
  type ParticipantSourceRef,
  type SessionParticipant,
} from "@/app/(culcept)/plan/tabs/coalter/coalterPlanSessionContract";
import { COALTER_PLAN_SESSION_FIXTURES } from "@/app/(culcept)/plan/tabs/coalter/coalterPlanSessionFixture";

describe("coalterPlanSessionContract（B-1 binding skeleton）", () => {
  // ── 1/6: fixture → participants（plan_session・talk_pair_member でない） ──
  it("fixture session は participants に写像される（plan_session 出自・userId と表示分離）", () => {
    for (const mode of ["daily", "travel"] as const) {
      const fixture = COALTER_PLAN_SESSION_FIXTURES[mode];
      const participants = buildSessionParticipantsFromFixture(fixture);

      expect(participants).toHaveLength(fixture.participants.length);
      participants.forEach((p, i) => {
        const f = fixture.participants[i];
        // userId は内部 id・表示は displayName/initial（分離・CEO note）
        expect(p.userId).toBe(f.id);
        expect(p.displayName).toBe(f.name);
        expect(p.initial).toBe(f.initial);
        expect(p.tone).toBe(f.tone);
        // ★ 既定 source は plan_session（talk_pair_member でない）
        expect(p.source.kind).toBe("plan_session");
        expect(p.source.kind).not.toBe("talk_pair_member");
        if (p.source.kind === "plan_session") {
          expect(p.source.planSessionId).toBe(fixture.id);
          expect(p.source.userId).toBe(f.id);
        }
      });
    }
  });

  // ── 2/4: root pairStateId 非依存 / threadId なしで成立 ──
  it("contract に root pairStateId が無く、threadId なしで session が成立する", () => {
    const session: CoAlterPlanSession = buildSessionContractFromFixture(
      COALTER_PLAN_SESSION_FIXTURES.daily,
    );
    // 新契約オブジェクトに pairStateId キーが存在しない
    expect("pairStateId" in session).toBe(false);
    // attachedThreadRef は付かない＝threadId なしで成立
    expect(session.attachedThreadRef).toBeUndefined();
    // binding 必須 field は揃う
    expect(session.id).toBe("fixture-session-daily");
    expect(session.participants.length).toBeGreaterThanOrEqual(1);
    expect(session.mode).toBe("daily");
    expect(session.stage).toBeDefined();
  });

  // ── 3: attachedThreadRef は optional（付けても付けなくても valid） ──
  it("attachedThreadRef は optional（明示付与も成立・省略も成立）", () => {
    const withThread: CoAlterPlanSession = {
      ...buildSessionContractFromFixture(COALTER_PLAN_SESSION_FIXTURES.travel),
      attachedThreadRef: { threadId: "t-bridge-1" },
    };
    expect(withThread.attachedThreadRef?.threadId).toBe("t-bridge-1");

    const withoutThread = buildSessionContractFromFixture(COALTER_PLAN_SESSION_FIXTURES.travel);
    expect(withoutThread.attachedThreadRef).toBeUndefined();
  });

  // ── 5: CoAlter は system actor（participant でない） ──
  it("CoAlter は system actor: 予約 author / participants に含まれない", () => {
    expect(COALTER_SYSTEM_AUTHOR).toBe("coalter");
    expect(isCoAlterSystemAuthor("coalter")).toBe(true);
    expect(isCoAlterSystemAuthor("kento")).toBe(false);

    // builder が産む participants の userId に "coalter" は現れない
    const session = buildSessionContractFromFixture(COALTER_PLAN_SESSION_FIXTURES.daily);
    expect(session.participants.some((p) => isCoAlterSystemAuthor(p.userId))).toBe(false);

    // fixture の messages には coalter author が居る（= system actor は message 側で表現）
    const hasCoAlterMessage = COALTER_PLAN_SESSION_FIXTURES.daily.messages.some((m) =>
      isCoAlterSystemAuthor(m.author),
    );
    expect(hasCoAlterMessage).toBe(true);
  });

  // ── 7/8: self + culcept_relation 構成可 / TravelCore 4 kind 互換 ──
  it("participants は self + culcept_relation を取りうる（将来の resolved 形）", () => {
    const participants: SessionParticipant[] = [
      {
        userId: "u-self",
        source: { kind: "self", userId: "u-self" },
        displayName: "あなた",
        initial: "あ",
        tone: "sky",
      },
      {
        userId: "u-partner",
        source: { kind: "culcept_relation", relationId: "conn-9", userId: "u-partner" },
        displayName: "Mio",
        initial: "M",
        tone: "rose",
      },
    ];
    expect(participants.map((p) => p.source.kind)).toEqual(["self", "culcept_relation"]);
  });

  it("ParticipantSourceRef は TravelCore 4 kind 互換（self/talk_pair_member/culcept_relation/plan_session）", () => {
    const refs: ParticipantSourceRef[] = [
      { kind: "self", userId: "u" },
      { kind: "talk_pair_member", pairStateId: "ps", userId: "u" },
      { kind: "culcept_relation", relationId: "r", userId: "u" },
      { kind: "plan_session", planSessionId: "s", userId: "u" },
    ];
    expect(refs.map((r) => r.kind)).toEqual([
      "self",
      "talk_pair_member",
      "culcept_relation",
      "plan_session",
    ]);
  });

  // ── 9: 既存 fixture 不変（pairStateId 値は残るが contract は読まない） ──
  it("既存 fixture は不変: pairStateId 値は残存するが contract projection は無視する", () => {
    const fixture = COALTER_PLAN_SESSION_FIXTURES.daily;
    // 後方互換: fixture 自体は pairStateId をまだ持つ（タブ描画は不変）
    expect(fixture.pairStateId).toBe("fixture-pair");
    // だが contract は読まない＝pairStateId が何であっても participants は plan_session
    const session = buildSessionContractFromFixture(fixture);
    expect(session.participants.every((p) => p.source.kind === "plan_session")).toBe(true);
    expect("pairStateId" in session).toBe(false);
  });
});
