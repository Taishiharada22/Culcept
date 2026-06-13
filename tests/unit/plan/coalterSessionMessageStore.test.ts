/**
 * coalterSessionMessageStore — DB-backed adapter skeleton test（**fake port のみ**・実 DB なし）
 *
 * 検証（CEO adapter tests required）:
 *   - list が DB row → CoAlterSessionMessage に写像
 *   - append participant が server-stamped author context を要求
 *   - 非 member append が rejection に写像
 *   - author 詐称が adapter boundary で防がれる（row.author_user_id は常に authorContext）
 *   - system/CoAlter append は HOLD（実特権 write をしない・port に insert すら無い）
 *   - threadId / pairStateId 依存なし
 *   - message body に projection/private/slot field なし
 *   - idempotency 挙動（fake client 経由で表現）
 *   - /api/talk・/api/coalter・service_role 不使用（fs guard）
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { stampServerAuthContext } from "@/app/(culcept)/plan/tabs/coalter/coalterSessionMessageRepository";
import type { CoAlterSessionMessageDraft } from "@/app/(culcept)/plan/tabs/coalter/coalterSessionMessageContract";
import {
  createDbBackedSessionMessageStore,
  rowToSessionMessage,
  SYSTEM_APPEND_HOLD_MESSAGE,
  type AppendParticipantMessageDbInput,
  type NewParticipantMessageRow,
  type SessionMessageDbPort,
  type SessionMessageRow,
} from "@/app/(culcept)/plan/tabs/coalter/coalterSessionMessageStore";

// ────────────────────────────────────────────────
// fake DB port（in-memory・実 Supabase/fetch なし）
// ────────────────────────────────────────────────

function makeFakePort(opts?: {
  participants?: Record<string, readonly string[] | null>;
  seedRows?: readonly SessionMessageRow[];
}): {
  port: SessionMessageDbPort;
  rows: SessionMessageRow[];
  inserted: NewParticipantMessageRow[];
} {
  const participants = opts?.participants ?? {
    "sess-1": ["user-kento", "user-mio"],
    "sess-2": ["user-kento"], // solo
  };
  const rows: SessionMessageRow[] = opts?.seedRows ? [...opts.seedRows] : [];
  const inserted: NewParticipantMessageRow[] = [];
  let n = 0;

  const port: SessionMessageDbPort = {
    async fetchParticipantUserIds(sessionId) {
      return sessionId in participants ? participants[sessionId] : null;
    },
    async fetchSessionMessageRows(sessionId) {
      return rows.filter((r) => r.session_id === sessionId);
    },
    async insertParticipantMessageRow(row) {
      inserted.push(row);
      // idempotency: 同一 (session, author, client_message_id) があれば既存を返す
      if (row.client_message_id !== null) {
        const existing = rows.find(
          (r) =>
            r.session_id === row.session_id &&
            r.author_user_id === row.author_user_id &&
            r.client_message_id === row.client_message_id,
        );
        if (existing) return { row: existing, deduped: true };
      }
      const stored: SessionMessageRow = {
        id: `row-${++n}`,
        session_id: row.session_id,
        author_kind: row.author_kind,
        author_user_id: row.author_user_id,
        kind: row.kind,
        visibility: row.visibility,
        body: row.body,
        client_message_id: row.client_message_id,
        created_at: `2026-06-13T00:00:0${n}Z`,
      };
      rows.push(stored);
      return { row: stored, deduped: false };
    },
  };
  return { port, rows, inserted };
}

const SEED: readonly SessionMessageRow[] = [
  {
    id: "seed-1",
    session_id: "sess-1",
    author_kind: "participant",
    author_user_id: "user-kento",
    kind: "chat",
    visibility: "shared",
    body: "seeded chat",
    client_message_id: null,
    created_at: "2026-06-13T00:00:00Z",
  },
  {
    id: "seed-2",
    session_id: "sess-1",
    author_kind: "coalter",
    author_user_id: null,
    kind: "system_event",
    visibility: "shared",
    body: "CoAlter まとめ",
    client_message_id: null,
    created_at: "2026-06-13T00:00:01Z",
  },
];

describe("coalterSessionMessageStore (DB-backed adapter skeleton, fake port)", () => {
  it("list が DB row → CoAlterSessionMessage に写像（coalter/participant 両 author）", async () => {
    const { port } = makeFakePort({ seedRows: SEED });
    const store = createDbBackedSessionMessageStore(port);
    const msgs = await store.listSessionMessages("sess-1");
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toEqual({
      id: "seed-1",
      sessionId: "sess-1",
      author: { kind: "participant", userId: "user-kento" },
      kind: "chat",
      visibility: "shared",
      body: "seeded chat",
      createdAt: "2026-06-13T00:00:00Z",
    });
    expect(msgs[1].author).toEqual({ kind: "coalter" });
    // 他 session は混ざらない
    expect(await store.listSessionMessages("sess-2")).toHaveLength(0);
  });

  it("append participant は server-stamped author context から author を stamp（draft からでない）", async () => {
    const { port, inserted } = makeFakePort();
    const store = createDbBackedSessionMessageStore(port);
    const res = await store.appendParticipantMessage({
      sessionId: "sess-1",
      draft: { kind: "chat", body: "こんにちは" },
      authorContext: stampServerAuthContext("user-mio"),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.message.author).toEqual({ kind: "participant", userId: "user-mio" });
    // adapter boundary: insert 行の author_user_id は **必ず authorContext**（詐称防止）
    expect(inserted[0].author_user_id).toBe("user-mio");
    expect(inserted[0].author_kind).toBe("participant");
  });

  it("author 詐称は構造的に不能（draft に author field が無い・row は context のみ）", async () => {
    const { port, inserted } = makeFakePort();
    const store = createDbBackedSessionMessageStore(port);
    // draft に author は入れられない（型・excess property error）
    const badDraft: CoAlterSessionMessageDraft = {
      kind: "chat",
      body: "x",
      // @ts-expect-error draft に author は存在しない
      author: { kind: "participant", userId: "user-mio" },
    };
    await store.appendParticipantMessage({
      sessionId: "sess-1",
      draft: { kind: "chat", body: badDraft.body },
      authorContext: stampServerAuthContext("user-kento"),
    });
    // 送信主体は authorContext のみ・draft の author は無視（そもそも存在しない）
    expect(inserted[0].author_user_id).toBe("user-kento");
  });

  it("非 member append は not_a_participant に写像", async () => {
    const { port, inserted } = makeFakePort();
    const store = createDbBackedSessionMessageStore(port);
    const res = await store.appendParticipantMessage({
      sessionId: "sess-1",
      draft: { kind: "chat", body: "侵入" },
      authorContext: stampServerAuthContext("user-stranger"),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("not_a_participant");
    expect(inserted).toHaveLength(0); // insert を試みない
  });

  it("session 不在は session_not_found・空 body は empty_body", async () => {
    const { port } = makeFakePort();
    const store = createDbBackedSessionMessageStore(port);
    const r1 = await store.appendParticipantMessage({
      sessionId: "sess-unknown",
      draft: { kind: "chat", body: "x" },
      authorContext: stampServerAuthContext("user-kento"),
    });
    expect(r1.ok === false && r1.reason).toBe("session_not_found");
    const r2 = await store.appendParticipantMessage({
      sessionId: "sess-1",
      draft: { kind: "chat", body: "   " },
      authorContext: stampServerAuthContext("user-kento"),
    });
    expect(r2.ok === false && r2.reason).toBe("empty_body");
  });

  it("system/CoAlter append は HOLD（throw・実 insert をしない）", async () => {
    const { port, inserted } = makeFakePort();
    const insertSpy = vi.spyOn(port, "insertParticipantMessageRow");
    const store = createDbBackedSessionMessageStore(port);
    await expect(
      store.appendSystemMessage({ sessionId: "sess-1", kind: "system_event", body: "x" }),
    ).rejects.toThrow(SYSTEM_APPEND_HOLD_MESSAGE);
    expect(insertSpy).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
    // port 自体に system insert メソッドが存在しないこと（特権 write HOLD を port 形で固定）
    // @ts-expect-error system insert method は port に無い
    expect(port.insertSystemMessageRow).toBeUndefined();
  });

  it("idempotency: 同一 clientMessageId の二重 append は重複を作らず同一 message を返す", async () => {
    const { port, rows } = makeFakePort();
    const store = createDbBackedSessionMessageStore(port);
    const input = {
      sessionId: "sess-1",
      draft: { kind: "chat", body: "一度だけ" } as const,
      authorContext: stampServerAuthContext("user-kento"),
      clientMessageId: "idem-1",
    };
    const a = await store.appendParticipantMessage(input);
    const b = await store.appendParticipantMessage(input);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.message.id).toBe(b.message.id); // 同一 message
    expect(rows.filter((r) => r.client_message_id === "idem-1")).toHaveLength(1); // 重複なし
  });

  it("threadId / pairStateId に依存しない（入力・row 型に存在しない）", async () => {
    const { port } = makeFakePort();
    const store = createDbBackedSessionMessageStore(port);
    const bad: AppendParticipantMessageDbInput = {
      sessionId: "sess-1",
      // @ts-expect-error append 入力に threadId は無い
      threadId: "thr-1",
      draft: { kind: "chat", body: "x" },
      authorContext: stampServerAuthContext("user-kento"),
    };
    expect(bad.sessionId).toBe("sess-1");
    const src = readFileSync(
      join(process.cwd(), "app/(culcept)/plan/tabs/coalter/coalterSessionMessageStore.ts"),
      "utf8",
    );
    expect(/thread_id\s*:/.test(src)).toBe(false);
    expect(/pair_state_id\s*:/.test(src)).toBe(false);
  });

  it("message に projection/private/slot field を持ち込まない（row→view の key は契約のみ）", () => {
    const m = rowToSessionMessage(SEED[0]);
    const allowed = new Set(["id", "sessionId", "author", "kind", "visibility", "body", "createdAt", "reactions"]);
    expect(Object.keys(m).every((k) => allowed.has(k))).toBe(true);
    expect(Object.keys(m)).not.toContain("metadata");
    expect(Object.keys(m)).not.toContain("rationale");
    expect(m.body).toBe("seeded chat");
  });

  it("adapter は Supabase/fetch/api/service_role を含まない（fs guard）", () => {
    const src = readFileSync(
      join(process.cwd(), "app/(culcept)/plan/tabs/coalter/coalterSessionMessageStore.ts"),
      "utf8",
    );
    expect(/\bfetch\s*\(/.test(src), "no fetch call").toBe(false);
    expect(/["'`]\/api\//.test(src), "no /api literal").toBe(false);
    expect(src.includes("SUPABASE_SERVICE_ROLE_KEY"), "no service_role").toBe(false);
    expect(/from\s+["'][^"']*supabase[^"']*["']/.test(src), "no supabase import").toBe(false);
    expect(/from\s+["'][^"']*\/route["']/.test(src), "no route import").toBe(false);
  });
});
