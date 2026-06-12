/**
 * coalterRelationBinding — C-1 relation metadata binding test
 *
 * 検証（CEO C-1 tests required）:
 *   - accepted connection + target counterpart userId → culcept_relation 解決
 *   - pending/blocked/非 accepted → 解決しない
 *   - 複数 connection を auto-select しない
 *   - target 欠落 / counterpart.userId 欠落 / connection id 欠落 → fail closed
 *   - self は viewerUserId のみ（推論なし）
 *   - talk_pair_member / pairStateId なし・threadId 無視
 *   - displayName null → raw userId を出さない（中立ラベル）
 *   - endpoint 失敗 / 401 / invalid payload → fail closed
 *   - GET /api/genome-connections のみ・POST/PATCH/DELETE 不可・/api/talk/threads 不使用
 *   - service_role import なし（C-1 新ファイル fs guard）
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  COUNTERPART_ROLE_LABEL,
  SELF_ROLE_LABEL,
  fetchGenomeConnectionsOnce,
  resolveRelationParticipants,
  type GenomeConnectionMetadata,
  type RelationBindingInput,
} from "@/app/(culcept)/plan/tabs/coalter/coalterRelationBinding";
import { readGenomeConnectionsDeduped } from "@/app/(culcept)/plan/tabs/coalter/useCoAlterRelationBinding";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const VIEWER = "user-self";
const CONN_ACCEPTED: GenomeConnectionMetadata = {
  id: "conn-9",
  status: "accepted",
  counterpart: { userId: "user-bbb", displayName: "Mio", avatarUrl: null },
};

function input(over: Partial<RelationBindingInput> = {}): RelationBindingInput {
  return {
    connections: [CONN_ACCEPTED],
    viewerUserId: VIEWER,
    targetCounterpartUserIds: ["user-bbb"],
    ...over,
  };
}

describe("C-1 resolveRelationParticipants（pure）", () => {
  it("accepted connection + target → culcept_relation 解決 + self（viewerUserId 由来）", () => {
    const r = resolveRelationParticipants(input());
    expect(r.bound).toBe(true);
    if (!r.bound) return;
    const self = r.participants.find((p) => p.source.kind === "self");
    const cp = r.participants.find((p) => p.source.kind === "culcept_relation");
    // self は viewerUserId のみ・表示は役割ラベル（raw userId 非表示）
    expect(self).toMatchObject({ userId: VIEWER, displayName: SELF_ROLE_LABEL });
    expect(self?.source).toEqual({ kind: "self", userId: VIEWER });
    // counterpart は connection id + counterpart userId から culcept_relation（捏造なし）
    expect(cp).toMatchObject({ userId: "user-bbb", displayName: "Mio", initial: "M" });
    expect(cp?.source).toEqual({ kind: "culcept_relation", relationId: "conn-9", userId: "user-bbb" });
  });

  it.each(["pending", "blocked", "declined", "", undefined])(
    "status=%s（非 accepted）→ 解決しない（no_accepted_relation）",
    (status) => {
      const r = resolveRelationParticipants(
        input({ connections: [{ ...CONN_ACCEPTED, status: status as string }] }),
      );
      expect(r).toEqual({ bound: false, reason: "no_accepted_relation" });
    },
  );

  it("複数 connection を auto-select しない（指定 target のみ解決・他は無視）", () => {
    const r = resolveRelationParticipants(
      input({
        connections: [
          { id: "conn-A", status: "accepted", counterpart: { userId: "user-A", displayName: "A" } },
          CONN_ACCEPTED, // user-bbb
          { id: "conn-C", status: "accepted", counterpart: { userId: "user-C", displayName: "C" } },
        ],
        targetCounterpartUserIds: ["user-bbb"],
      }),
    );
    expect(r.bound).toBe(true);
    if (!r.bound) return;
    const cps = r.participants.filter((p) => p.source.kind === "culcept_relation");
    expect(cps).toHaveLength(1);
    expect(cps[0].userId).toBe("user-bbb"); // 「最初」の user-A を選ばない
  });

  it("同一 target に accepted connection が 2+ → 曖昧で選ばない（unbound）", () => {
    const r = resolveRelationParticipants(
      input({
        connections: [
          { id: "conn-1", status: "accepted", counterpart: { userId: "user-bbb", displayName: "X" } },
          { id: "conn-2", status: "accepted", counterpart: { userId: "user-bbb", displayName: "Y" } },
        ],
      }),
    );
    expect(r).toEqual({ bound: false, reason: "no_accepted_relation" });
  });

  it("target 欠落 → no_target（勝手に選ばない）", () => {
    expect(resolveRelationParticipants(input({ targetCounterpartUserIds: [] }))).toEqual({
      bound: false,
      reason: "no_target",
    });
    expect(resolveRelationParticipants(input({ targetCounterpartUserIds: [""] }))).toEqual({
      bound: false,
      reason: "no_target",
    });
  });

  it("viewerUserId 欠落 → no_viewer（self を推論しない）", () => {
    expect(resolveRelationParticipants(input({ viewerUserId: null }))).toEqual({
      bound: false,
      reason: "no_viewer",
    });
    expect(resolveRelationParticipants(input({ viewerUserId: "" }))).toEqual({
      bound: false,
      reason: "no_viewer",
    });
  });

  it("counterpart.userId 欠落 / connection id 欠落 → 解決しない（fail closed）", () => {
    const noUserId = resolveRelationParticipants(
      input({ connections: [{ id: "conn-9", status: "accepted", counterpart: { displayName: "x" } }] }),
    );
    expect(noUserId).toEqual({ bound: false, reason: "no_accepted_relation" });

    const noId = resolveRelationParticipants(
      input({ connections: [{ status: "accepted", counterpart: { userId: "user-bbb" } }] }),
    );
    expect(noId).toEqual({ bound: false, reason: "no_accepted_relation" });
  });

  it("displayName null → raw userId を表示に使わず中立ラベル（source は culcept_relation のまま）", () => {
    const r = resolveRelationParticipants(
      input({
        connections: [{ id: "conn-9", status: "accepted", counterpart: { userId: "user-bbb", displayName: null } }],
      }),
    );
    expect(r.bound).toBe(true);
    if (!r.bound) return;
    const cp = r.participants.find((p) => p.source.kind === "culcept_relation");
    expect(cp?.displayName).toBe(COUNTERPART_ROLE_LABEL); // "相手"
    expect(cp?.displayName).not.toBe("user-bbb"); // ★ UUID/userId を表示にしない
    expect(cp?.initial).toBe(COUNTERPART_ROLE_LABEL.charAt(0));
    expect(cp?.source).toEqual({ kind: "culcept_relation", relationId: "conn-9", userId: "user-bbb" });
  });

  it("talk_pair_member / pairStateId を一切生成しない・threadId を無視", () => {
    const r = resolveRelationParticipants(
      input({
        // threadId を payload に混ぜても無視される（型外だが defensive）
        connections: [{ ...CONN_ACCEPTED, ...({ threadId: "t-should-be-ignored" } as object) }],
      }),
    );
    expect(r.bound).toBe(true);
    if (!r.bound) return;
    for (const p of r.participants) {
      expect(p.source.kind).not.toBe("talk_pair_member");
      expect(JSON.stringify(p)).not.toContain("pairStateId");
      expect(JSON.stringify(p)).not.toContain("threadId");
      expect(JSON.stringify(p)).not.toContain("t-should-be-ignored");
    }
  });

  it("target が viewer 自身でも counterpart にしない（self を相手化しない）", () => {
    const r = resolveRelationParticipants(
      input({
        viewerUserId: "user-bbb",
        targetCounterpartUserIds: ["user-bbb"],
      }),
    );
    expect(r).toEqual({ bound: false, reason: "no_accepted_relation" });
  });
});

describe("C-1 fetchGenomeConnectionsOnce（GET-only・fail-closed）", () => {
  it("GET /api/genome-connections をちょうど 1 回・init を渡せない・/api/talk に触れない", async () => {
    const fetchSpy = vi.fn(async (_url: string) =>
      jsonResponse({ ok: true, connections: [CONN_ACCEPTED] }),
    );
    const r = await fetchGenomeConnectionsOnce(fetchSpy);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]).toHaveLength(1); // url のみ＝POST/PATCH/DELETE 構文上不可
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/genome-connections");
    expect(fetchSpy.mock.calls[0][0].includes("/api/talk")).toBe(false);
    expect(r.ok).toBe(true);
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [500, "http_error"],
  ] as const)("HTTP %i → ok:false %s（fail-closed）", async (status, reason) => {
    const r = await fetchGenomeConnectionsOnce(vi.fn(async (_url: string) => jsonResponse({}, status)));
    expect(r).toEqual({ ok: false, reason });
  });

  it("invalid payload / network 例外 → fail-closed", async () => {
    expect(
      await fetchGenomeConnectionsOnce(vi.fn(async (_url: string) => jsonResponse({ ok: false }))),
    ).toEqual({ ok: false, reason: "invalid_payload" });
    expect(
      await fetchGenomeConnectionsOnce(
        vi.fn(async (_url: string) => {
          throw new Error("offline");
        }),
      ),
    ).toEqual({ ok: false, reason: "network_error" });
  });

  it("in-flight dedupe: 並行 2 呼び出しで GET 1 回", async () => {
    let resolveResp: (r: Response) => void = () => {};
    const fetchSpy = vi.fn(
      (_url: string) => new Promise<Response>((resolve) => (resolveResp = resolve)),
    );
    const p1 = readGenomeConnectionsDeduped(fetchSpy);
    const p2 = readGenomeConnectionsDeduped(fetchSpy);
    resolveResp(jsonResponse({ ok: true, connections: [] }));
    await Promise.all([p1, p2]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("C-1 flag/source guard", () => {
  it("flag default OFF: coalterRelationLive=false / coalterDevCounterpartUserId=''", () => {
    expect(PLAN_FLAGS.coalterRelationLive).toBe(false);
    expect(PLAN_FLAGS.coalterDevCounterpartUserId).toBe("");
  });

  it("C-1 新ファイルは talk/coalter/supabase/service_role を含まず、fetch URL は genome-connections のみ", () => {
    const dir = join(process.cwd(), "app/(culcept)/plan/tabs/coalter");
    const c1Files = ["coalterRelationBinding.ts", "useCoAlterRelationBinding.ts"];
    // 否定 guard は両ファイルに適用（URL は **quoted literal** で判定＝コメント言及で誤検出しない）
    for (const f of c1Files) {
      const src = readFileSync(join(dir, f), "utf8");
      expect(/["'`]\/api\/talk/.test(src), `${f}: no /api/talk literal`).toBe(false);
      expect(/["'`]\/api\/coalter/.test(src), `${f}: no /api/coalter literal`).toBe(false);
      expect(src.includes("SUPABASE_SERVICE_ROLE_KEY"), `${f}: no service_role`).toBe(false);
      expect(/from\s+["'][^"']*supabase[^"']*["']/.test(src), `${f}: no supabase import`).toBe(false);
      expect(/from\s+["'][^"']*useCoAlter["']/.test(src), `${f}: no useCoAlter import`).toBe(false);
    }
    // fetch URL の正本は fetch モジュールにのみ存在し、唯一の API literal が genome-connections
    const fetchSrc = readFileSync(join(dir, "coalterRelationBinding.ts"), "utf8");
    expect(/["'`]\/api\/genome-connections/.test(fetchSrc)).toBe(true);
    const apiLiterals = [...fetchSrc.matchAll(/["'`](\/api\/[^"'`]+)/g)].map((m) => m[1]);
    expect([...new Set(apiLiterals)]).toEqual(["/api/genome-connections"]);
  });
});
