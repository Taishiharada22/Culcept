/**
 * CoAlter live wiring — render + boundary test
 *
 * 検証:
 *   - CoAlterChatPanel が **live session messages** を描画でき、未解決 author は中立ラベル（raw userId 非表示）
 *   - CoAlterTab は flag OFF（既定）で fixture 本文を描画（live 未起動＝SSR で effect 走らない＝現行不変）
 *   - 境界: CoAlterTab は `/api/coalter` リテラルを持たない（runtime に隔離）・runtime client は持つ
 *   - runtime は supabase を import しない（fetch のみ）
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CoAlterChatPanel } from "@/app/(culcept)/plan/tabs/coalter/CoAlterChatPanel";
import { CoAlterTab } from "@/app/(culcept)/plan/tabs/coalter/CoAlterTab";
import { COALTER_PLAN_SESSION_FIXTURES } from "@/app/(culcept)/plan/tabs/coalter/coalterPlanSessionFixture";
import type { CoAlterSessionMessage } from "@/app/(culcept)/plan/tabs/coalter/coalterSessionMessageContract";
import type { SessionParticipant } from "@/app/(culcept)/plan/tabs/coalter/coalterPlanSessionContract";

const SESSION = COALTER_PLAN_SESSION_FIXTURES.daily;

const LIVE_PARTICIPANTS: SessionParticipant[] = [
  { userId: "user-self-xyz", source: { kind: "self", userId: "user-self-xyz" }, displayName: "あなた", initial: "あ", tone: "sky" },
];

const LIVE_MESSAGES: CoAlterSessionMessage[] = [
  { id: "lv-1", sessionId: "sess-1", author: { kind: "participant", userId: "user-self-xyz" }, kind: "chat", visibility: "shared", body: "実セッションの発言です", createdAt: "2026-06-13T00:00:00Z" },
  { id: "lv-2", sessionId: "sess-1", author: { kind: "participant", userId: "user-unknown-abc" }, kind: "chat", visibility: "shared", body: "未解決 author の発言", createdAt: "2026-06-13T00:00:01Z" },
  { id: "lv-3", sessionId: "sess-1", author: { kind: "coalter" }, kind: "system_event", visibility: "shared", body: "CoAlter のまとめ", createdAt: "2026-06-13T00:00:02Z" },
];

describe("CoAlter live wiring", () => {
  it("CoAlterChatPanel は live messages を描画・未解決 author は中立ラベル（raw userId 非表示）", () => {
    const html = renderToStaticMarkup(
      createElement(CoAlterChatPanel, {
        session: SESSION,
        participants: LIVE_PARTICIPANTS,
        sessionMessages: LIVE_MESSAGES,
        sendMode: "local_echo",
        onSend: () => {},
        selectedCandidateIndex: 0,
        appliedAdjustmentIds: new Set<string>(),
        onToggleAdjustment: () => {},
        isConfirmed: false,
        onConfirm: () => {},
      }),
    );
    // live 本文が描画される
    expect(html).toContain("実セッションの発言です");
    expect(html).toContain("未解決 author の発言");
    expect(html).toContain("CoAlter のまとめ");
    // 解決済み self は displayName・未解決は中立「メンバー」
    expect(html).toContain("あなた");
    expect(html).toContain("メンバー");
    // ★ raw userId は一切表示されない
    expect(html).not.toContain("user-self-xyz");
    expect(html).not.toContain("user-unknown-abc");
  });

  it("CoAlterTab は既定で Home（会話一覧）を描画する（タブの入口＝ホーム・CEO 2026-06-21）", () => {
    const html = renderToStaticMarkup(<CoAlterTab viewerUserId="viewer-1" />);
    // 入口は Home（会話一覧）。チャット始まりにしない。
    expect(html).toContain("ホーム");
    expect(html).toContain("Aya");
    expect(html).toContain("おすすめ");
    // viewerUserId（raw）は UI に出ない
    expect(html).not.toContain("viewer-1");
  });

  it("境界: CoAlterTab は /api/coalter リテラルを持たず、coupling は runtime に隔離", () => {
    const tab = readFileSync(join(process.cwd(), "app/(culcept)/plan/tabs/coalter/CoAlterTab.tsx"), "utf8");
    expect(/["'`]\/api\/coalter/.test(tab), "CoAlterTab: no /api/coalter literal").toBe(false);
    // live hook は import している（wiring 存在）
    expect(tab.includes("useCoAlterLiveSession")).toBe(true);

    const client = readFileSync(join(process.cwd(), "app/(culcept)/plan/coalter-runtime/coalterLiveSessionClient.ts"), "utf8");
    // runtime client が /api/coalter を持つ（coupling の隔離先）
    expect(/["'`]\/api\/coalter/.test(client)).toBe(true);
    // runtime は supabase を import しない（fetch のみ）
    expect(/from\s+["'][^"']*supabase[^"']*["']/.test(client), "runtime: no supabase import").toBe(false);
    // /talk を触らない
    expect(/["'`]\/api\/talk/.test(client), "runtime: no /api/talk").toBe(false);
    expect(client.includes("read_at"), "runtime: no read_at").toBe(false);
  });
});
