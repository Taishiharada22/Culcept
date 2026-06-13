/**
 * coalterSessionMessageContract — session message skeleton test（型/契約のみ）
 *
 * 検証（CEO tests required）:
 *   - author は human participant か "coalter"
 *   - CoAlter は system author（participant でない）
 *   - 永続 session message は resolved participant author か system author を要する
 *   - anonymous/unresolved author は session message に存在しない
 *   - message body に private projection/rationale fields が無い
 *   - thread message shape は session message shape と別
 *   - /talk thread id 不要
 *   - fixture messages が session message 契約に写像できる
 *   - draft は author を持たない（client が sender を主張しない）
 *   - TravelCore/session participant 互換（userId 同一名前空間・COALTER_SYSTEM_AUTHOR 共有）
 *
 *  （no fetch/API/DB は coalter フォルダ fs source-guard・/talk untouched は diff scope で担保）
 */
import { describe, it, expect } from "vitest";

import {
  COALTER_SYSTEM_AUTHOR,
  buildSessionMessagesFromFixture,
  isCoAlterSessionAuthor,
  isResolvedSessionMessageAuthor,
  toSessionMessageAuthor,
  toSessionMessageFromFixture,
  type CoAlterSessionMessage,
  type CoAlterSessionMessageAuthor,
  type CoAlterSessionMessageDraft,
} from "@/app/(culcept)/plan/tabs/coalter/coalterSessionMessageContract";
import {
  buildSessionParticipantsFromFixture,
  type SessionParticipant,
} from "@/app/(culcept)/plan/tabs/coalter/coalterPlanSessionContract";
import { COALTER_PLAN_SESSION_FIXTURES } from "@/app/(culcept)/plan/tabs/coalter/coalterPlanSessionFixture";
import type { CoAlterChatMessage } from "@/app/(culcept)/plan/tabs/coalter/coalterChatAdapter";

const SESSION = COALTER_PLAN_SESSION_FIXTURES.daily;
const PARTICIPANTS: readonly SessionParticipant[] = buildSessionParticipantsFromFixture(SESSION);

describe("coalterSessionMessageContract（session message skeleton）", () => {
  // ── author: human or coalter / CoAlter は system author ──
  it("author は human participant(userId) か coalter(system)・participants には入れない", () => {
    expect(toSessionMessageAuthor("kento")).toEqual({ kind: "participant", userId: "kento" });
    expect(toSessionMessageAuthor("coalter")).toEqual({ kind: "coalter" });
    expect(COALTER_SYSTEM_AUTHOR).toBe("coalter");

    const human: CoAlterSessionMessageAuthor = { kind: "participant", userId: "kento" };
    const system: CoAlterSessionMessageAuthor = { kind: "coalter" };
    expect(isCoAlterSessionAuthor(system)).toBe(true);
    expect(isCoAlterSessionAuthor(human)).toBe(false);
    // coalter author は userId を持たない（participants に並ばない＝B-1 system actor）
    expect("userId" in system).toBe(false);
  });

  // ── 永続 author 妥当性 / anonymous 不在 ──
  it("永続 session message は resolved participant author か system author を要する", () => {
    const knownUserId = PARTICIPANTS[0].userId;
    expect(isResolvedSessionMessageAuthor({ kind: "coalter" }, PARTICIPANTS)).toBe(true);
    expect(isResolvedSessionMessageAuthor({ kind: "participant", userId: knownUserId }, PARTICIPANTS)).toBe(true);
    // 未知 userId（resolved participant に居ない）→ 拒否
    expect(isResolvedSessionMessageAuthor({ kind: "participant", userId: "stranger" }, PARTICIPANTS)).toBe(false);
    expect(isResolvedSessionMessageAuthor({ kind: "participant", userId: "" }, PARTICIPANTS)).toBe(false);
  });

  it("anonymous/unresolved author は型に存在しない（kind は participant|coalter のみ）", () => {
    const authors: CoAlterSessionMessageAuthor[] = [
      { kind: "participant", userId: "u" },
      { kind: "coalter" },
    ];
    expect(authors.map((a) => a.kind).sort()).toEqual(["coalter", "participant"]);
    // @ts-expect-error unresolved/anonymous variant は許されない
    const bad: CoAlterSessionMessageAuthor = { kind: "unresolved" };
    expect(bad).toBeDefined();
  });

  // ── message body ⊥ projection ──
  it("message body に private projection/rationale/slot fields が無い（共有 plain text のみ）", () => {
    const msg = toSessionMessageFromFixture(SESSION.messages[0], SESSION.id);
    expect(Object.keys(msg).sort()).toEqual(
      ["author", "body", "createdAt", "id", "kind", "reactions", "sessionId", "visibility"].sort(),
    );
    const forbidden = [
      "privateConditions",
      "conditions",
      "rationale",
      "perViewerRationale",
      "viewerPayload",
      "extractedSlots",
      "slots",
      "projection",
      "planProjection",
      "visibilityRequester",
      "visibilityTarget",
    ];
    for (const k of forbidden) expect(k in msg).toBe(false);
    // visibility は常に shared（per-viewer は projection 側）
    expect(msg.visibility).toBe("shared");
    // body は string（構造化 projection を入れられない）
    expect(typeof msg.body).toBe("string");
  });

  // ── thread message shape ≠ session message shape ──
  it("thread message(CoAlterChatMessage) と session message は別 shape（author 型・field が相違）", () => {
    const threadMsg: CoAlterChatMessage = { id: "t1", author: "kento", time: "10:24", text: "hi" };
    const sessionMsg = toSessionMessageFromFixture(SESSION.messages[0], SESSION.id);

    // author: thread=string / session=object
    expect(typeof threadMsg.author).toBe("string");
    expect(typeof sessionMsg.author).toBe("object");
    // session のみ sessionId/body/createdAt・thread のみ time/text
    expect("sessionId" in sessionMsg).toBe(true);
    expect("body" in sessionMsg).toBe(true);
    expect("sessionId" in threadMsg).toBe(false);
    expect("body" in threadMsg).toBe(false);

    // @ts-expect-error thread message を session message に代入できない（混同・複製を型で防ぐ）
    const mustFail: CoAlterSessionMessage = threadMsg;
    expect(mustFail).toBeDefined();
  });

  // ── /talk thread id 不要 / fixture 写像 ──
  it("fixture messages は session message に写像でき、threadId を一切要求しない", () => {
    const msgs = buildSessionMessagesFromFixture(SESSION);
    expect(msgs.length).toBe(SESSION.messages.length);
    for (const m of msgs) {
      expect(m.sessionId).toBe(SESSION.id);
      expect(m.kind).toBe("chat");
      expect(m.visibility).toBe("shared");
      // threadId は session message に存在しない（thread は session の正本でない）
      expect("threadId" in m).toBe(false);
    }
    // coalter 発話は system author になる
    const coalterMsg = msgs.find((m) => m.author.kind === "coalter");
    expect(coalterMsg).toBeDefined();
    // 全 author が resolved（fixture participant）か coalter
    for (const m of msgs) {
      expect(isResolvedSessionMessageAuthor(m.author, PARTICIPANTS)).toBe(true);
    }
  });

  // ── draft は author を持たない（self authority は server stamp） ──
  it("draft は author を持たない（client が sender を主張しない）", () => {
    const draft: CoAlterSessionMessageDraft = { kind: "chat", body: "夕食は海鮮がいい" };
    expect("author" in draft).toBe(false);
    expect("sessionId" in draft).toBe(false);
    expect("id" in draft).toBe(false);
    expect(draft.body).toBe("夕食は海鮮がいい");
  });

  // ── TravelCore/session participant 互換 ──
  it("session participant 互換: author.userId は SessionParticipant.userId と同一名前空間", () => {
    const p = PARTICIPANTS[0];
    const author: CoAlterSessionMessageAuthor = { kind: "participant", userId: p.userId };
    expect(isResolvedSessionMessageAuthor(author, PARTICIPANTS)).toBe(true);
    // system author は B-1 予約定数を共有
    expect(toSessionMessageAuthor(COALTER_SYSTEM_AUTHOR)).toEqual({ kind: "coalter" });
  });
});
