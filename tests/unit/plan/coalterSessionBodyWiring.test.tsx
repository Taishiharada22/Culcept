/**
 * B: session message body wiring — fixture-to-contract render test
 *
 * 検証（CEO B tests required）:
 *   - fixture messages → CoAlterSessionMessage（本文の source）
 *   - 本文が session message 契約から描画できる（renderToStaticMarkup）
 *   - CoAlter は system author で描画 / 人間は resolved participant author で描画
 *   - 本文に anonymous/unresolved author なし
 *   - thread context messages は session message 配列に含まれない（別 source・別型）
 *   - thread context は別セクションとして slot 描画される
 *
 *  （no fetch/API/DB は coalter フォルダ fs source-guard・/talk untouched は diff scope で担保）
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { CoAlterChatPanel } from "@/app/(culcept)/plan/tabs/coalter/CoAlterChatPanel";
import {
  buildSessionMessagesFromFixture,
} from "@/app/(culcept)/plan/tabs/coalter/coalterSessionMessageContract";
import { buildSessionParticipantsFromFixture } from "@/app/(culcept)/plan/tabs/coalter/coalterPlanSessionContract";
import { COALTER_PLAN_SESSION_FIXTURES } from "@/app/(culcept)/plan/tabs/coalter/coalterPlanSessionFixture";
import { CoAlterThreadContextSection } from "@/app/(culcept)/plan/tabs/coalter/CoAlterThreadContextSection";
import type { CoAlterChatMessage, CoAlterChatParticipant } from "@/app/(culcept)/plan/tabs/coalter/coalterChatAdapter";

const SESSION = COALTER_PLAN_SESSION_FIXTURES.daily;
const PARTICIPANTS = buildSessionParticipantsFromFixture(SESSION);
const BODY = buildSessionMessagesFromFixture(SESSION);

function renderPanel(threadContextSlot?: React.ReactNode): string {
  return renderToStaticMarkup(
    createElement(CoAlterChatPanel, {
      session: SESSION,
      participants: PARTICIPANTS,
      sessionMessages: BODY,
      sendMode: "local_echo",
      onSend: () => {},
      selectedCandidateIndex: 0,
      appliedAdjustmentIds: new Set<string>(),
      onToggleAdjustment: () => {},
      isConfirmed: false,
      onConfirm: () => {},
      threadContextSlot,
    }),
  );
}

describe("B session message body wiring", () => {
  it("本文の source は CoAlterSessionMessage（author は resolved participant か coalter のみ・匿名なし）", () => {
    expect(BODY.length).toBe(SESSION.messages.length);
    for (const m of BODY) {
      expect(m.kind).toBe("chat");
      expect(m.visibility).toBe("shared");
      const author = m.author;
      if (author.kind === "participant") {
        // human は resolved participant userId（fixture participant に存在）
        expect(PARTICIPANTS.some((p) => p.userId === author.userId)).toBe(true);
      } else {
        expect(author.kind).toBe("coalter"); // anonymous/unresolved の第三 variant なし
      }
    }
    // CoAlter system author の message が存在
    expect(BODY.some((m) => m.author.kind === "coalter")).toBe(true);
    // human の message も存在
    expect(BODY.some((m) => m.author.kind === "participant")).toBe(true);
  });

  it("本文は session message 契約から描画できる（body text + 名前 + CoAlter 表示）", () => {
    const html = renderPanel();
    // fixture session の本文・参加者名・CoAlter が描画される
    expect(html).toContain("移動はあまり長くしたくないかな");
    expect(html).toContain("おふたりの希望をまとめました");
    expect(html).toContain("Kento");
    expect(html).toContain("Mio");
    expect(html).toContain("CoAlter"); // system author 表示
    // 本文に anonymous「メンバー」話者が出ない
    expect(html).not.toContain("メンバー A");
    expect(html).not.toContain("メンバー B");
  });

  it("thread context messages は session message 配列に含まれない（別 source・別型）", () => {
    // thread context は CoAlterChatMessage（author:string）・session 本文は CoAlterSessionMessage（author:object）
    const threadMsg: CoAlterChatMessage = { id: "tm-1", author: "user-x", time: "09:00", text: "過去の発言" };
    // 本文 BODY に thread message id は無い（本文は fixture session 由来のみ）
    expect(BODY.some((m) => m.id === threadMsg.id)).toBe(false);
    // 本文 author は構造化 object（thread の string author と非互換）
    for (const m of BODY) expect(typeof m.author).toBe("object");
  });

  it("thread context は別セクションとして slot 描画され、本文 bubble list と分離", () => {
    const speakers: CoAlterChatParticipant[] = [
      { id: "user-x", name: "メンバー A", initial: "A", tone: "sky", identityState: "unresolved" },
    ];
    const ctxMessages: CoAlterChatMessage[] = [
      { id: "tm-1", author: "user-x", time: "09:00", text: "過去の発言です" },
    ];
    const slot = createElement(CoAlterThreadContextSection, { messages: ctxMessages, speakers });
    const html = renderPanel(slot);
    // 文脈セクション（別 aria-label の section）+ 注記が描画される
    expect(html).toContain("これまでの会話");
    expect(html).toContain("過去の会話の文脈です");
    expect(html).toContain("過去の発言です");
    // 文脈の匿名話者は文脈セクション内のみ（本文には漏れない）→ 本文 source に id 不在は前テストで担保
  });

  it("slot 無し（文脈なし）では文脈セクションが描画されない", () => {
    const html = renderPanel();
    expect(html).not.toContain("これまでの会話");
    expect(html).not.toContain("過去の会話の文脈です");
  });
});
