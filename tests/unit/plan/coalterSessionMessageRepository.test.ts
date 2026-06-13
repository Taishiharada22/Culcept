/**
 * coalterSessionMessageRepository — pure repository 契約 + **local in-memory harness** test
 *
 * 正本: docs/coalter-ui-track-closeout-persistence-preflight.md §6-1+2（CEO GO 2026-06-12）。
 *
 * 検証（CEO tests required）:
 *   - list はその session の message のみ返す
 *   - append は resolved participant membership を要求する
 *   - append は author を **server/auth context** から stamp する（draft からではない）
 *   - draft author は不可能（型に author が無い）
 *   - 非参加者の append は reject
 *   - CoAlter/system author 経路は分離・human を詐称できない
 *   - message body は共有テキストのまま
 *   - message に projection/private rationale/slot field が無い
 *   - thread context message は session message として永続化されない
 *   - /talk thread id を要求しない
 *   - repository interface は thread/pair state に依存しない
 *   - 注入した timestamp/id で決定論的順序
 *
 * harness 制約（CEO §6-3）: Date.now/Math.random/process.env/fetch/DB client/route import を**使わない**
 *   （now/nextId は注入。in-memory のみ）。fs guard で contract 新ファイルの no-fetch/api/db を恒久化。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  CoAlterSessionMessage,
} from "@/app/(culcept)/plan/tabs/coalter/coalterSessionMessageContract";
import type { SessionParticipant } from "@/app/(culcept)/plan/tabs/coalter/coalterPlanSessionContract";
import {
  stampServerAuthContext,
  type AppendParticipantMessageInput,
  type AppendResult,
  type AppendSystemMessageInput,
  type CoAlterSessionMessageRepository,
  type SessionMembershipResolver,
} from "@/app/(culcept)/plan/tabs/coalter/coalterSessionMessageRepository";

// ────────────────────────────────────────────────
// local in-memory harness（tests only・pure・注入 now/nextId）
// no Date.now / Math.random / process.env / fetch / DB / route import
// ────────────────────────────────────────────────

function createInMemorySessionMessageRepository(opts: {
  readonly membership: SessionMembershipResolver;
  readonly now: () => string;
  readonly nextId: () => string;
  readonly seed?: readonly CoAlterSessionMessage[];
}): CoAlterSessionMessageRepository {
  const { membership, now, nextId } = opts;
  const store: CoAlterSessionMessage[] = opts.seed ? [...opts.seed] : [];

  return {
    listSessionMessages(sessionId) {
      return store.filter((m) => m.sessionId === sessionId);
    },

    appendParticipantMessage(input: AppendParticipantMessageInput): AppendResult {
      const participants = membership(input.sessionId);
      if (participants === null) return { ok: false, reason: "session_not_found" };
      if (input.draft.body.trim() === "") return { ok: false, reason: "empty_body" };
      // author は server context から（draft からではない）
      const userId = input.authorContext.authenticatedUserId;
      if (!participants.some((p) => p.userId === userId)) {
        return { ok: false, reason: "not_a_participant" };
      }
      const message: CoAlterSessionMessage = {
        id: nextId(),
        sessionId: input.sessionId,
        author: { kind: "participant", userId },
        kind: input.draft.kind,
        visibility: "shared",
        body: input.draft.body,
        createdAt: now(),
      };
      store.push(message);
      return { ok: true, message };
    },

    appendSystemMessage(input: AppendSystemMessageInput): AppendResult {
      const participants = membership(input.sessionId);
      if (participants === null) return { ok: false, reason: "session_not_found" };
      if (input.body.trim() === "") return { ok: false, reason: "empty_body" };
      const message: CoAlterSessionMessage = {
        id: nextId(),
        sessionId: input.sessionId,
        author: { kind: "coalter" },
        kind: input.kind,
        visibility: "shared",
        body: input.body,
        createdAt: now(),
      };
      store.push(message);
      return { ok: true, message };
    },
  };
}

// ────────────────────────────────────────────────
// fixtures（決定論: 注入 counter / clock）
// ────────────────────────────────────────────────

const KENTO: SessionParticipant = {
  userId: "user-kento",
  source: { kind: "plan_session", planSessionId: "sess-1", userId: "user-kento" },
  displayName: "Kento",
  initial: "K",
  tone: "sky",
};
const MIO: SessionParticipant = {
  userId: "user-mio",
  source: { kind: "plan_session", planSessionId: "sess-1", userId: "user-mio" },
  displayName: "Mio",
  initial: "M",
  tone: "rose",
};

function makeMembership(): SessionMembershipResolver {
  const table: Record<string, readonly SessionParticipant[]> = {
    "sess-1": [KENTO, MIO],
    "sess-2": [KENTO], // solo session
  };
  return (sessionId) => table[sessionId] ?? null;
}

function makeRepo(seed?: readonly CoAlterSessionMessage[]) {
  let n = 0;
  let t = 0;
  return createInMemorySessionMessageRepository({
    membership: makeMembership(),
    nextId: () => `m-${++n}`,
    now: () => `2026-06-13T00:00:${String(t++).padStart(2, "0")}Z`,
    seed,
  });
}

// ────────────────────────────────────────────────

describe("coalterSessionMessageRepository (pure contract + in-memory harness)", () => {
  it("list はその session の message だけ返す（他 session を混ぜない）", () => {
    const repo = makeRepo();
    repo.appendParticipantMessage({
      sessionId: "sess-1",
      draft: { kind: "chat", body: "sess1 から" },
      authorContext: stampServerAuthContext("user-kento"),
    });
    repo.appendParticipantMessage({
      sessionId: "sess-2",
      draft: { kind: "chat", body: "sess2 から" },
      authorContext: stampServerAuthContext("user-kento"),
    });
    const s1 = repo.listSessionMessages("sess-1");
    const s2 = repo.listSessionMessages("sess-2");
    expect(s1.map((m) => m.body)).toEqual(["sess1 から"]);
    expect(s2.map((m) => m.body)).toEqual(["sess2 から"]);
    expect(s1.every((m) => m.sessionId === "sess-1")).toBe(true);
  });

  it("append は author を server auth context から stamp する（draft からではない）", () => {
    const repo = makeRepo();
    const res = repo.appendParticipantMessage({
      sessionId: "sess-1",
      draft: { kind: "chat", body: "こんにちは" },
      authorContext: stampServerAuthContext("user-mio"),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.message.author).toEqual({ kind: "participant", userId: "user-mio" });
    // draft には author を入れる余地が無い（型で担保）→ stamp された author のみが残る
    expect(res.message.visibility).toBe("shared");
    expect(res.message.kind).toBe("chat");
  });

  it("draft は author を持てない（型レベル・実行時にも sender は context のみ）", () => {
    // 型で author を draft に入れられないことの記録（コンパイルが通る形のみ許可）。
    const draft: AppendParticipantMessageInput["draft"] = { kind: "chat", body: "x" };
    // @ts-expect-error draft に author field は存在しない（client が sender を主張できない）
    const bad: AppendParticipantMessageInput["draft"] = { kind: "chat", body: "x", author: { kind: "participant", userId: "user-mio" } };
    expect(draft.body).toBe("x");
    expect(bad.body).toBe("x");
  });

  it("非参加者の append は reject（membership 検査が boundary で効く）", () => {
    const repo = makeRepo();
    const res = repo.appendParticipantMessage({
      sessionId: "sess-1",
      draft: { kind: "chat", body: "侵入" },
      authorContext: stampServerAuthContext("user-stranger"),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("not_a_participant");
    expect(repo.listSessionMessages("sess-1")).toHaveLength(0);
  });

  it("存在しない session の append は session_not_found", () => {
    const repo = makeRepo();
    const res = repo.appendParticipantMessage({
      sessionId: "sess-unknown",
      draft: { kind: "chat", body: "x" },
      authorContext: stampServerAuthContext("user-kento"),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("session_not_found");
  });

  it("空 body は empty_body で reject（共有テキストとして無効）", () => {
    const repo = makeRepo();
    const res = repo.appendParticipantMessage({
      sessionId: "sess-1",
      draft: { kind: "chat", body: "   " },
      authorContext: stampServerAuthContext("user-kento"),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("empty_body");
  });

  it("CoAlter/system author 経路は分離・human を詐称できない", () => {
    const repo = makeRepo();
    const sys = repo.appendSystemMessage({
      sessionId: "sess-1",
      kind: "system_event",
      body: "おふたりの希望をまとめました",
    });
    expect(sys.ok).toBe(true);
    if (!sys.ok) return;
    expect(sys.message.author).toEqual({ kind: "coalter" });
    // system 経路は userId を受け取らない（型に無い）→ participant を詐称できない
    // @ts-expect-error system input に authenticatedUserId / userId は存在しない
    const bad: AppendSystemMessageInput = { sessionId: "sess-1", kind: "chat", body: "x", userId: "user-kento" };
    expect(bad.sessionId).toBe("sess-1");
    // human 経路は coalter を生成しない（常に participant userId）
    const human = repo.appendParticipantMessage({
      sessionId: "sess-1",
      draft: { kind: "chat", body: "人間です" },
      authorContext: stampServerAuthContext("user-kento"),
    });
    expect(human.ok && human.message.author.kind).toBe("participant");
  });

  it("message body は共有テキストのまま・projection/private/slot field を持たない", () => {
    const repo = makeRepo();
    const res = repo.appendParticipantMessage({
      sessionId: "sess-1",
      draft: { kind: "chat", body: "ただの会話本文" },
      authorContext: stampServerAuthContext("user-kento"),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const m = res.message;
    expect(typeof m.body).toBe("string");
    expect(m.visibility).toBe("shared");
    // message の key は契約の field のみ（projection 系の漏れがない）
    const allowed = new Set(["id", "sessionId", "author", "kind", "visibility", "body", "createdAt", "reactions"]);
    expect(Object.keys(m).every((k) => allowed.has(k))).toBe(true);
    expect(Object.keys(m)).not.toContain("rationale");
    expect(Object.keys(m)).not.toContain("projection");
    expect(Object.keys(m)).not.toContain("slots");
    expect(Object.keys(m)).not.toContain("perViewer");
  });

  it("thread context message は session message として永続化されない（別型・append 経路に乗らない）", () => {
    const repo = makeRepo();
    // thread context は CoAlterChatMessage（author:string）。draft は {kind:"chat",body} のみ受ける。
    // thread message を draft に変換しても author は持ち込めず、append は context 由来 id を保存しない。
    const before = repo.listSessionMessages("sess-1").length;
    const res = repo.appendSystemMessage({ sessionId: "sess-1", kind: "chat", body: "（仮に文脈本文）" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // 保存された id は repo 採番（thread message の id ではない）
    expect(res.message.id).toBe("m-1");
    expect(repo.listSessionMessages("sess-1").length).toBe(before + 1);
  });

  it("repository は /talk thread id を要求しない・thread/pair state に依存しない", () => {
    const repo = makeRepo();
    // thread/pair を一切渡さず append/list が成立する
    const res = repo.appendParticipantMessage({
      sessionId: "sess-1",
      draft: { kind: "chat", body: "thread なしで成立" },
      authorContext: stampServerAuthContext("user-kento"),
    });
    expect(res.ok).toBe(true);
    expect(repo.listSessionMessages("sess-1")).toHaveLength(1);
    // 入力型に threadId/pairStateId が無いことの記録
    const bad: AppendParticipantMessageInput = {
      sessionId: "sess-1",
      // @ts-expect-error append 入力に threadId は存在しない
      threadId: "thr-1",
      draft: { kind: "chat", body: "x" },
      authorContext: stampServerAuthContext("user-kento"),
    };
    expect(bad.sessionId).toBe("sess-1");
  });

  it("注入した timestamp/id で決定論的順序（list は挿入順）", () => {
    const repo = makeRepo();
    repo.appendParticipantMessage({ sessionId: "sess-1", draft: { kind: "chat", body: "1番目" }, authorContext: stampServerAuthContext("user-kento") });
    repo.appendSystemMessage({ sessionId: "sess-1", kind: "chat", body: "2番目" });
    repo.appendParticipantMessage({ sessionId: "sess-1", draft: { kind: "chat", body: "3番目" }, authorContext: stampServerAuthContext("user-mio") });
    const msgs = repo.listSessionMessages("sess-1");
    expect(msgs.map((m) => m.id)).toEqual(["m-1", "m-2", "m-3"]);
    expect(msgs.map((m) => m.body)).toEqual(["1番目", "2番目", "3番目"]);
    expect(msgs.map((m) => m.createdAt)).toEqual([
      "2026-06-13T00:00:00Z",
      "2026-06-13T00:00:01Z",
      "2026-06-13T00:00:02Z",
    ]);
  });

  it("solo session（1 名）でも本人は append できる", () => {
    const repo = makeRepo();
    const res = repo.appendParticipantMessage({
      sessionId: "sess-2",
      draft: { kind: "chat", body: "ひとり session" },
      authorContext: stampServerAuthContext("user-kento"),
    });
    expect(res.ok).toBe(true);
    expect(repo.listSessionMessages("sess-2")).toHaveLength(1);
  });

  it("contract 新ファイルは fetch/API/DB/supabase/service_role を含まない（fs guard）", () => {
    const src = readFileSync(
      join(process.cwd(), "app/(culcept)/plan/tabs/coalter/coalterSessionMessageRepository.ts"),
      "utf8",
    );
    expect(/\bfetch\s*\(/.test(src), "no fetch call").toBe(false);
    expect(/["'`]\/api\//.test(src), "no /api literal").toBe(false);
    expect(src.includes("SUPABASE_SERVICE_ROLE_KEY"), "no service_role").toBe(false);
    expect(/from\s+["'][^"']*supabase[^"']*["']/.test(src), "no supabase import").toBe(false);
    expect(/from\s+["'][^"']*\/route["']/.test(src), "no route import").toBe(false);
    expect(src.includes("process.env"), "no process.env").toBe(false);
    expect(src.includes("Date.now"), "no Date.now").toBe(false);
    expect(src.includes("Math.random"), "no Math.random").toBe(false);
    // thread/pair state non-dependence（field 宣言として現れない・説明コメントは許容）
    expect(/threadId\s*:/.test(src), "no threadId field in repo contract").toBe(false);
    expect(/pairStateId\s*:/.test(src), "no pairStateId field in repo contract").toBe(false);
  });
});
