/**
 * coalterLiveSessionClient — live read/send pure 関数 + body selector test（fetch 注入・実 route なし）
 *
 * 検証:
 *   - GET 成功→messages / 401・404・error→fail(unavailable) / URL は /api/coalter/sessions/:id/messages
 *   - POST body は **{body, clientMessageId} のみ**（author/userId/source を送らない）
 *   - POST 201→message / 403・422→fail
 *   - selectCoAlterBody: live→live・それ以外→fixture（fail-closed）
 *   - buildLiveParticipants: relation→そのまま / 無→self のみ / viewer 無→空（raw userId を出さない）
 */
import { describe, it, expect, vi } from "vitest";

import {
  buildLiveParticipants,
  fetchLiveSessionMessagesOnce,
  postLiveSessionMessageOnce,
  selectCoAlterBody,
} from "@/app/(culcept)/plan/coalter-runtime/coalterLiveSessionClient";
import type { CoAlterSessionMessage } from "@/app/(culcept)/plan/tabs/coalter/coalterSessionMessageContract";
import type { SessionParticipant } from "@/app/(culcept)/plan/tabs/coalter/coalterPlanSessionContract";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const MSG: CoAlterSessionMessage = {
  id: "m-1",
  sessionId: "sess-1",
  author: { kind: "participant", userId: "u-a" },
  kind: "chat",
  visibility: "shared",
  body: "こんにちは",
  createdAt: "2026-06-13T00:00:00Z",
};

describe("coalterLiveSessionClient", () => {
  it("GET 成功 → messages・URL は /api/coalter/sessions/:id/messages（GET）", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true, messages: [MSG] }));
    const res = await fetchLiveSessionMessagesOnce("sess-1", fetchImpl as unknown as typeof fetch);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.messages).toEqual([MSG]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/coalter/sessions/sess-1/messages");
    expect(init.method).toBe("GET");
  });

  it("GET 401/404/error → fail（unavailable へ）", async () => {
    for (const status of [401, 404, 500]) {
      const fetchImpl = vi.fn(async () => jsonResponse(status, { ok: false }));
      const res = await fetchLiveSessionMessagesOnce("sess-1", fetchImpl as unknown as typeof fetch);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.status).toBe(status);
    }
    const throwing = vi.fn(async () => {
      throw new Error("network");
    });
    const res = await fetchLiveSessionMessagesOnce("sess-1", throwing as unknown as typeof fetch);
    expect(res.ok).toBe(false);
  });

  it("POST body は {body, clientMessageId} のみ（author/userId/source を送らない）", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { ok: true, message: MSG }));
    const res = await postLiveSessionMessageOnce(
      "sess-1",
      { body: "送信文", clientMessageId: "idem-1" },
      fetchImpl as unknown as typeof fetch,
    );
    expect(res.ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/coalter/sessions/sess-1/messages");
    expect(init.method).toBe("POST");
    const sent = JSON.parse(init.body as string);
    expect(Object.keys(sent).sort()).toEqual(["body", "clientMessageId"]);
    expect(sent.body).toBe("送信文");
    expect(sent.clientMessageId).toBe("idem-1");
    // author 系キーを一切含まない
    for (const k of ["author", "userId", "user_id", "source", "sender"]) {
      expect(k in sent).toBe(false);
    }
  });

  it("POST 403/422 → fail（fail-closed）", async () => {
    for (const status of [403, 422]) {
      const fetchImpl = vi.fn(async () => jsonResponse(status, { ok: false, error: "x" }));
      const res = await postLiveSessionMessageOnce(
        "sess-1",
        { body: "x", clientMessageId: "i" },
        fetchImpl as unknown as typeof fetch,
      );
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.status).toBe(status);
    }
  });

  it("selectCoAlterBody: live のみ live、それ以外は fixture（fail-closed）", () => {
    const fixtureMsgs = [{ ...MSG, id: "fx-1", body: "fixture" }];
    const liveMsgs = [{ ...MSG, id: "lv-1", body: "live" }];
    const base = {
      liveMessages: liveMsgs,
      liveParticipants: [] as SessionParticipant[],
      fixtureMessages: fixtureMsgs,
      fixtureParticipants: [] as SessionParticipant[],
    };
    expect(selectCoAlterBody({ ...base, liveState: "live" }).messages).toEqual(liveMsgs);
    expect(selectCoAlterBody({ ...base, liveState: "live" }).isLive).toBe(true);
    for (const s of ["off", "loading", "unavailable"] as const) {
      const sel = selectCoAlterBody({ ...base, liveState: s });
      expect(sel.messages).toEqual(fixtureMsgs);
      expect(sel.isLive).toBe(false);
    }
  });

  it("buildLiveParticipants: relation→そのまま / 無→self のみ / viewer 無→空", () => {
    const relation: SessionParticipant[] = [
      { userId: "u-a", source: { kind: "culcept_relation", relationId: "r1", userId: "u-a" }, displayName: "Mio", initial: "M", tone: "rose" },
    ];
    expect(buildLiveParticipants("u-self", relation)).toEqual(relation);
    const selfOnly = buildLiveParticipants("u-self", null);
    expect(selfOnly).toHaveLength(1);
    expect(selfOnly[0].displayName).toBe("あなた"); // raw userId を表示にしない
    expect(selfOnly[0].userId).toBe("u-self");
    expect(buildLiveParticipants(null, null)).toEqual([]);
    expect(buildLiveParticipants(undefined, [])).toEqual([]);
  });
});
