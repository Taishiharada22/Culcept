/**
 * coalterChatAdapter talk_thread read-only 経路 — TalkBridge-T1b test
 *
 * 検証対象（CEO T1b tests required）:
 *   1. flag OFF → live read 対象なし（fixture・fetch 0）
 *   2. flag ON ∧ threadId なし/空白 → live read 対象なし（fixture・/api/talk/* 0）
 *   3. flag ON ∧ threadId → **GET をちょうど 1 回**（URL 検証・init/method を渡せない構造）
 *   4. 401/403/404/HTTP error/network 例外/invalid/empty → クラッシュせず fail-closed。
 *      成功時ですら send/realtime/readReceipts/coalterInvoke は有効化されない
 *   5. live messages が adapter view shape に正しく写像される
 *   6. POST/PATCH/DELETE は構文上発行不可（fetchImpl は url 1 引数のみ）
 *   7. /api/coalter/* を呼ばない（URL は /api/talk/threads/[id]/messages のみ）
 *
 * （/talk files untouched・Calendar/List/Map unaffected は diff scope / plan suite で担保）
 */
import { describe, it, expect, vi } from "vitest";

import {
  createTalkThreadReadonlyAdapter,
  deriveAnonymousTalkParticipants,
  fetchTalkThreadMessagesOnce,
  mapTalkMessagesToView,
  resolveLiveReadTarget,
} from "@/app/(culcept)/plan/tabs/coalter/coalterChatAdapter";
import { readTalkThreadDeduped } from "@/app/(culcept)/plan/tabs/coalter/useCoAlterChatAdapter";

// ── helper: JSON Response ──
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const RAW_MESSAGES = [
  {
    id: "m-1",
    senderId: "user-aaa",
    body: "今夜どうする？",
    createdAt: "2026-06-12T10:24:00.000Z",
    mediaUrl: null,
    reactions: [{ type: "resonance", userId: "user-bbb" }],
  },
  {
    id: "m-2",
    senderId: "user-bbb",
    body: "",
    createdAt: "2026-06-12T10:25:00.000Z",
    mediaUrl: "https://example.com/photo.jpg",
    reactions: [],
  },
  {
    id: "m-3",
    senderId: "user-aaa",
    body: "いいね！",
    createdAt: "2026-06-12T10:26:00.000Z",
    mediaUrl: null,
    reactions: [],
  },
];

describe("coalterChatAdapter talk_thread read-only（TalkBridge-T1b）", () => {
  // ── 1/2: gate（live read 対象の解決） ──
  it("flag OFF → live read 対象なし（threadId があっても null）", () => {
    expect(resolveLiveReadTarget({ liveEnabled: false, devThreadId: "t-1" })).toBeNull();
    expect(resolveLiveReadTarget({ liveEnabled: false, devThreadId: "" })).toBeNull();
  });

  it("flag ON でも threadId 未指定/空白 → null（fixture のまま・fetch 経路に入らない）", () => {
    expect(resolveLiveReadTarget({ liveEnabled: true, devThreadId: "" })).toBeNull();
    expect(resolveLiveReadTarget({ liveEnabled: true, devThreadId: "   " })).toBeNull();
  });

  it("flag ON ∧ threadId → その threadId を返す（live read 対象）", () => {
    expect(resolveLiveReadTarget({ liveEnabled: true, devThreadId: " t-42 " })).toBe("t-42");
  });

  // ── 3/6/7: GET ちょうど 1 回・GET-only 構造・/api/talk のみ ──
  it("成功時: GET をちょうど 1 回・URL は /api/talk/threads/[id]/messages・init を渡せない", async () => {
    const fetchSpy = vi.fn(async (_url: string) =>
      jsonResponse({ ok: true, messages: RAW_MESSAGES }),
    );
    const result = await fetchTalkThreadMessagesOnce("t-1", fetchSpy);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // 呼出引数は url 1 つだけ（method/init/body を渡す口が存在しない＝POST/PATCH/DELETE 構文上不可）
    expect(fetchSpy.mock.calls[0]).toHaveLength(1);
    const url = fetchSpy.mock.calls[0][0];
    expect(url).toBe("/api/talk/threads/t-1/messages");
    expect(url.startsWith("/api/talk/")).toBe(true);
    expect(url.includes("/api/coalter/")).toBe(false);

    expect(result.ok).toBe(true);
  });

  it("in-flight dedupe: 並行 2 呼び出し（StrictMode 二重 mount 相当）でも GET はちょうど 1 回", async () => {
    let resolveResponse: (r: Response) => void = () => {};
    const fetchSpy = vi.fn(
      (_url: string) => new Promise<Response>((resolve) => (resolveResponse = resolve)),
    );
    const p1 = readTalkThreadDeduped("dedupe-t1", fetchSpy);
    const p2 = readTalkThreadDeduped("dedupe-t1", fetchSpy);
    resolveResponse(jsonResponse({ ok: true, messages: RAW_MESSAGES }));
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(fetchSpy).toHaveBeenCalledTimes(1); // ★ ちょうど 1 回
    expect(r1.ok).toBe(true);
    expect(r2).toBe(r1); // 同一 promise 共有

    // 解決後は dedupe map から消える＝次の mount では新たに 1 回（cache ではない・ポーリングでもない）
    const fetchSpy2 = vi.fn(async (_url: string) =>
      jsonResponse({ ok: true, messages: RAW_MESSAGES }),
    );
    await readTalkThreadDeduped("dedupe-t1", fetchSpy2);
    expect(fetchSpy2).toHaveBeenCalledTimes(1);
  });

  it("threadId は encodeURIComponent される（path 汚染防止）", async () => {
    const fetchSpy = vi.fn(async (_url: string) =>
      jsonResponse({ ok: true, messages: RAW_MESSAGES }),
    );
    await fetchTalkThreadMessagesOnce("a/b?c", fetchSpy);
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/talk/threads/a%2Fb%3Fc/messages");
  });

  // ── 4: fail-closed マトリクス ──
  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not_found"],
    [500, "http_error"],
  ] as const)("HTTP %i → ok:false reason=%s（throw しない）", async (status, reason) => {
    const fetchSpy = vi.fn(async () => jsonResponse({ error: "x" }, status));
    const result = await fetchTalkThreadMessagesOnce("t-1", fetchSpy);
    expect(result).toEqual({ ok: false, reason });
  });

  it("network 例外 → ok:false network_error（throw しない）", async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error("offline");
    });
    const result = await fetchTalkThreadMessagesOnce("t-1", fetchSpy);
    expect(result).toEqual({ ok: false, reason: "network_error" });
  });

  it("payload 不正（ok:true でない / messages 非配列）→ invalid_payload", async () => {
    for (const body of [{ ok: false }, { messages: "x" }, {}]) {
      const result = await fetchTalkThreadMessagesOnce(
        "t-1",
        vi.fn(async () => jsonResponse(body)),
      );
      expect(result).toEqual({ ok: false, reason: "invalid_payload" });
    }
  });

  it("messages 0 件 → empty（CEO T1b-4: empty も fail-closed）", async () => {
    const result = await fetchTalkThreadMessagesOnce(
      "t-1",
      vi.fn(async () => jsonResponse({ ok: true, messages: [] })),
    );
    expect(result).toEqual({ ok: false, reason: "empty" });
  });

  // ── 5: view shape への写像 ──
  it("live messages → view shape（author=senderId・media placeholder・reaction 絵文字・時刻形式）", () => {
    const view = mapTalkMessagesToView(RAW_MESSAGES);
    expect(view).toHaveLength(3);
    expect(view[0].id).toBe("m-1");
    expect(view[0].author).toBe("user-aaa");
    expect(view[0].text).toBe("今夜どうする？");
    // reaction: resonance → ∞（/talk GENOME_REACTIONS と同値）
    expect(view[0].reaction).toEqual({ emoji: "∞", count: 1 });
    // body 空 + mediaUrl → placeholder
    expect(view[1].text).toBe("（画像）");
    expect(view[1].reaction).toBeUndefined();
    // 時刻は HH:mm 形式（TZ 非依存の形式チェック）
    for (const m of view) {
      expect(m.time).toMatch(/^\d{1,2}:\d{2}$/);
    }
  });

  it("匿名 participant 導出: 出現順 A/B・tone 交互・source なし（unresolved・pair と断定しない）", () => {
    const participants = deriveAnonymousTalkParticipants([
      "user-aaa",
      "user-bbb",
      "user-aaa", // 重複は無視
    ]);
    expect(participants).toHaveLength(2);
    expect(participants[0]).toMatchObject({
      id: "user-aaa",
      name: "メンバー A",
      initial: "A",
      tone: "sky",
    });
    expect(participants[1]).toMatchObject({
      id: "user-bbb",
      name: "メンバー B",
      initial: "B",
      tone: "rose",
    });
    // ★ identity 未解決: source を持たない（talk_pair_member を名乗らせない）
    for (const p of participants) {
      expect(p.source).toBeUndefined();
    }
  });

  // ── 4 後半: 成功時ですら send/realtime/既読/invoke は無効 ──
  it("talk_thread adapter: read=live のみ有効・send/realtime/readReceipts/coalterInvoke は無効・viewer null", () => {
    const adapter = createTalkThreadReadonlyAdapter("t-1", {
      messages: mapTalkMessagesToView(RAW_MESSAGES),
      participants: deriveAnonymousTalkParticipants(["user-aaa", "user-bbb"]),
    });
    expect(adapter.provider).toEqual({ kind: "talk_thread", threadId: "t-1" });
    expect(adapter.capabilities).toEqual({
      read: "live",
      send: "none", // local echo も不可（実 thread に偽メッセージを乗せない）
      realtime: false,
      readReceipts: false,
      coalterInvoke: false,
    });
    expect(adapter.getViewer()).toBeNull(); // read-only: viewer 解決しない
    expect(adapter.getInitialMessages()).toHaveLength(3);
    expect(adapter.getParticipants()).toHaveLength(2);
  });
});
