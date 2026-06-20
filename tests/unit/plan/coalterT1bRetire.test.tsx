/**
 * legacy T1b chat-live retire/freeze — test
 *
 * 検証（CEO tests required）:
 *   - CoAlterChatPanel が legacy live-read バッジ（ライブ閲覧中/読み込み中/利用不可）を描画しない
 *   - CoAlterTab は **本文に legacy `useCoAlterChatAdapter` を再配線していない**（source guard）
 *   - 旧 chat-live flag を ON にしても本文が thread messages を fetch しない（CoAlterTab が hook 非使用＝構造保証）
 *   - 文脈セクションの read helper（readTalkThreadDeduped）は引き続き使用可能
 *   - 旧 flag は default OFF・deprecated freeze（残置）
 *   - 本文は CoAlterSessionMessage（render 確認は coalterSessionBodyWiring.test）
 *
 *  （context fetch/OFF no-fetch は coalterThreadContext.test・/talk untouched は diff scope で担保）
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CoAlterChatPanel } from "@/app/(culcept)/plan/tabs/coalter/CoAlterChatPanel";
import { buildSessionMessagesFromFixture } from "@/app/(culcept)/plan/tabs/coalter/coalterSessionMessageContract";
import { buildSessionParticipantsFromFixture } from "@/app/(culcept)/plan/tabs/coalter/coalterPlanSessionContract";
import { COALTER_PLAN_SESSION_FIXTURES } from "@/app/(culcept)/plan/tabs/coalter/coalterPlanSessionFixture";
import { readTalkThreadDeduped } from "@/app/(culcept)/plan/tabs/coalter/useCoAlterChatAdapter";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

const SESSION = COALTER_PLAN_SESSION_FIXTURES.daily;

describe("legacy T1b chat-live retire/freeze", () => {
  it("CoAlterChatPanel は legacy live-read バッジを描画しない（本文は live でない）", () => {
    const html = renderToStaticMarkup(
      createElement(CoAlterChatPanel, {
        session: SESSION,
        participants: buildSessionParticipantsFromFixture(SESSION),
        sessionMessages: buildSessionMessagesFromFixture(SESSION),
        sendMode: "local_echo",
        onSend: () => {},
        selectedCandidateIndex: 0,
        appliedAdjustmentIds: new Set<string>(),
        onToggleAdjustment: () => {},
        isConfirmed: false,
        onConfirm: () => {},
      }),
    );
    expect(html).not.toContain("ライブ閲覧中");
    expect(html).not.toContain("ライブ読み込み中");
    expect(html).not.toContain("ライブ読み込みは利用できません");
    // 本文自体は描画される（撤去で本文を壊していない）
    expect(html).toContain("おふたりの希望をまとめました");
  });

  it("CoAlterChatPanel の props に readState が無い（型から撤去）", () => {
    const src = readFileSync(
      join(process.cwd(), "app/(culcept)/plan/tabs/coalter/CoAlterChatPanel.tsx"),
      "utf8",
    );
    expect(/readonly readState/.test(src)).toBe(false);
  });

  it("CoAlterTab は本文に legacy useCoAlterChatAdapter を使わない（import/呼出なし）", () => {
    const src = readFileSync(
      join(process.cwd(), "app/(culcept)/plan/tabs/coalter/CoAlterTab.tsx"),
      "utf8",
    );
    // import 行に useCoAlterChatAdapter が無い（コメント言及のみ可）
    const importSpecs = [...src.matchAll(/import\s+\{[^}]*\}\s+from\s+["']([^"']+)["']/g)].map((m) => m[0]);
    expect(importSpecs.some((line) => line.includes("useCoAlterChatAdapter"))).toBe(false);
    // hook 呼出がない（`useCoAlterChatAdapter(` という呼び出しパターン）
    expect(/useCoAlterChatAdapter\s*\(/.test(src)).toBe(false);
    // 本文は session message から（buildSessionMessagesFromFixture を使用）
    expect(src.includes("buildSessionMessagesFromFixture")).toBe(true);
    // 旧 readState prop を渡していない
    expect(/readState=\{/.test(src)).toBe(false);
  });

  it("文脈セクションの read helper（readTalkThreadDeduped）は引き続き使用可能", async () => {
    const fetchSpy = vi.fn(async (_url: string) =>
      new Response(JSON.stringify({ ok: true, messages: [
        { id: "m-1", senderId: "u-a", body: "hi", createdAt: "2026-06-01T00:00:00Z", mediaUrl: null, reactions: [] },
      ] }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const result = await readTalkThreadDeduped("retire-thread-1", fetchSpy);
    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/talk/threads/retire-thread-1/messages");
  });

  it("旧 chat-live flag は default OFF・freeze（残置）", () => {
    expect(PLAN_FLAGS.coalterChatLive).toBe(false);
    expect(PLAN_FLAGS.coalterChatDevThreadId).toBe("");
    // context flag は壊れていない（独立・default OFF）
    expect(PLAN_FLAGS.coalterThreadContext).toBe(false);
  });
});
