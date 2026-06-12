/**
 * TalkBridge-T1b-2 — resolved participant metadata（read-only）test
 *
 * 検証対象（CEO T1b-2 tests required）:
 *   1. 一致 thread の metadata で表示名が解決できる
 *   2. relation/connection id 欠落 → source は未解決のまま（display_resolved）
 *   3. culcept_relation は必須 field（connectionId + userId）があるときのみ
 *   4. thread message の senderId 単独では **決して talk_pair_member にならない**
 *   5. pairStateId の権威なしに talk_pair_member は生成されない（全経路走査 + source guard）
 *   6. POST/PATCH/DELETE 不可（fetchImpl は url 1 引数のみ）/ 既読なし / /api/coalter/* なし
 *   7. /plan の coalter フォルダに service_role / supabase / useCoAlter import が存在しない
 *      （fs ベースの恒久 guard）
 *   8. capabilities は read-only のまま
 *   9. threads 一覧の失敗 / threadId 不掲載 / field 欠落 → fail-closed（fake source なし）
 *
 * （flag OFF / threadId なしの fixture 不変は coalterChatAdapter/coalterChatTalkThread test、
 *   /talk untouched は diff scope で担保）
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  createTalkThreadReadonlyAdapter,
  deriveAnonymousTalkParticipants,
  fetchTalkThreadMetadataOnce,
  resolveParticipantsWithThreadMetadata,
  type CoAlterChatParticipant,
  type TalkThreadMetadata,
} from "@/app/(culcept)/plan/tabs/coalter/coalterChatAdapter";
import { readTalkThreadMetadataDeduped } from "@/app/(culcept)/plan/tabs/coalter/useCoAlterChatAdapter";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const THREADS_PAYLOAD = {
  ok: true,
  threads: [
    {
      threadId: "t-other",
      connectionId: "conn-0",
      counterpart: { userId: "user-zzz", displayName: "Zoe", avatarUrl: null },
      lastMessage: null,
      unreadCount: 0,
    },
    {
      threadId: "t-1",
      connectionId: "conn-9",
      counterpart: { userId: "user-bbb", displayName: "Mio", avatarUrl: null },
      lastMessage: { body: "x", senderId: "user-bbb", createdAt: "2026-06-12T10:00:00Z" },
      unreadCount: 2,
    },
  ],
};

/** T1b 匿名導出の標準入力（sender 2 人: aaa が自分側・bbb が counterpart 想定） */
const ANON = deriveAnonymousTalkParticipants(["user-aaa", "user-bbb"]);

function allSourceKinds(participants: readonly CoAlterChatParticipant[]): string[] {
  return participants.flatMap((p) => (p.identityState === "resolved" ? [p.source.kind] : []));
}

describe("TalkBridge-T1b-2 participant metadata（read-only）", () => {
  // ── 1/3: 解決成功（display + source 両方） ──
  it("一致 thread の metadata: counterpart=culcept_relation resolved + 表示名 / 自分側=self resolved「あなた」", async () => {
    const fetchSpy = vi.fn(async (_url: string) => jsonResponse(THREADS_PAYLOAD));
    const result = await fetchTalkThreadMetadataOnce("t-1", fetchSpy);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]).toHaveLength(1); // url のみ＝POST/PATCH/DELETE 構文上不可
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/talk/threads");
    if (!result.ok) throw new Error(`unexpected fail: ${result.reason}`);
    expect(result.metadata).toEqual({
      threadId: "t-1",
      connectionId: "conn-9",
      counterpartUserId: "user-bbb",
      counterpartDisplayName: "Mio",
    });

    const resolved = resolveParticipantsWithThreadMetadata(ANON, result.metadata);
    const counterpart = resolved.find((p) => p.id === "user-bbb");
    const self = resolved.find((p) => p.id === "user-aaa");

    // counterpart: 表示名 + culcept_relation（relationId = connectionId・捏造なし）
    expect(counterpart).toMatchObject({ name: "Mio", initial: "M", identityState: "resolved" });
    if (counterpart?.identityState === "resolved") {
      expect(counterpart.source).toEqual({
        kind: "culcept_relation",
        relationId: "conn-9",
        userId: "user-bbb",
      });
    }
    // 自分側（非 counterpart がちょうど 1 人）: self resolved・役割ラベル（名前は捏造しない）
    expect(self).toMatchObject({ name: "あなた", identityState: "resolved" });
    if (self?.identityState === "resolved") {
      expect(self.source).toEqual({ kind: "self", userId: "user-aaa" });
    }
    // tone は匿名導出の値を維持（見た目の安定）
    expect(resolved.map((p) => p.tone)).toEqual(ANON.map((p) => p.tone));
  });

  // ── 2: display と source の分離 ──
  it("connectionId 欠落 ∧ displayName あり → display_resolved（source は付かない＝正直）", () => {
    const metadata: TalkThreadMetadata = {
      threadId: "t-1",
      connectionId: null,
      counterpartUserId: "user-bbb",
      counterpartDisplayName: "Mio",
    };
    const resolved = resolveParticipantsWithThreadMetadata(ANON, metadata);
    const counterpart = resolved.find((p) => p.id === "user-bbb");
    expect(counterpart).toMatchObject({ name: "Mio", identityState: "display_resolved" });
    expect(counterpart && "source" in counterpart).toBe(false); // source を invent しない
  });

  it("displayName 欠落 ∧ connectionId あり → source resolved だが表示は匿名ラベル維持（独立性の逆方向）", () => {
    const metadata: TalkThreadMetadata = {
      threadId: "t-1",
      connectionId: "conn-9",
      counterpartUserId: "user-bbb",
      counterpartDisplayName: null,
    };
    const resolved = resolveParticipantsWithThreadMetadata(ANON, metadata);
    const counterpart = resolved.find((p) => p.id === "user-bbb");
    expect(counterpart).toMatchObject({
      name: "メンバー B", // 名前は捏造しない
      identityState: "resolved",
    });
    if (counterpart?.identityState === "resolved") {
      expect(counterpart.source.kind).toBe("culcept_relation");
    }
  });

  it("displayName も connectionId も無し → counterpart は匿名のまま（self のみ解決）", () => {
    const metadata: TalkThreadMetadata = {
      threadId: "t-1",
      connectionId: null,
      counterpartUserId: "user-bbb",
      counterpartDisplayName: null,
    };
    const resolved = resolveParticipantsWithThreadMetadata(ANON, metadata);
    expect(resolved.find((p) => p.id === "user-bbb")?.identityState).toBe("unresolved");
    expect(resolved.find((p) => p.id === "user-aaa")?.identityState).toBe("resolved");
  });

  // ── 4/5: talk_pair_member 不生成 invariant ──
  it("senderId と thread metadata からは talk_pair_member が決して生成されない（全ケース走査）", () => {
    const metadataVariants: TalkThreadMetadata[] = [
      { threadId: "t-1", connectionId: "conn-9", counterpartUserId: "user-bbb", counterpartDisplayName: "Mio" },
      { threadId: "t-1", connectionId: null, counterpartUserId: "user-bbb", counterpartDisplayName: "Mio" },
      { threadId: "t-1", connectionId: "conn-9", counterpartUserId: "user-bbb", counterpartDisplayName: null },
      { threadId: "t-1", connectionId: null, counterpartUserId: "user-bbb", counterpartDisplayName: null },
      // counterpart が sender に居ないケース・3 人以上のケース
      { threadId: "t-1", connectionId: "conn-9", counterpartUserId: "user-xxx", counterpartDisplayName: "X" },
    ];
    const senderSets = [
      ["user-aaa", "user-bbb"],
      ["user-bbb"],
      ["user-aaa", "user-bbb", "user-ccc"],
    ];
    for (const metadata of metadataVariants) {
      for (const senders of senderSets) {
        const resolved = resolveParticipantsWithThreadMetadata(
          deriveAnonymousTalkParticipants(senders),
          metadata,
        );
        const kinds = allSourceKinds(resolved);
        expect(kinds).not.toContain("talk_pair_member"); // ★ 権威（coalter_pair_states）なしでは不可
        // 生成されうる source は culcept_relation / self のみ
        for (const k of kinds) {
          expect(["culcept_relation", "self"]).toContain(k);
        }
      }
    }
  });

  it("非 counterpart sender が複数 → self を推定しない（counterpart 以外は匿名のまま）", () => {
    const metadata: TalkThreadMetadata = {
      threadId: "t-1",
      connectionId: "conn-9",
      counterpartUserId: "user-bbb",
      counterpartDisplayName: "Mio",
    };
    const resolved = resolveParticipantsWithThreadMetadata(
      deriveAnonymousTalkParticipants(["user-aaa", "user-bbb", "user-ccc"]),
      metadata,
    );
    expect(resolved.find((p) => p.id === "user-aaa")?.identityState).toBe("unresolved");
    expect(resolved.find((p) => p.id === "user-ccc")?.identityState).toBe("unresolved");
    expect(resolved.find((p) => p.id === "user-bbb")?.identityState).toBe("resolved");
  });

  // ── 9: fail-closed マトリクス ──
  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [500, "http_error"],
  ] as const)("threads 一覧 HTTP %i → ok:false %s（クラッシュなし）", async (status, reason) => {
    const result = await fetchTalkThreadMetadataOnce(
      "t-1",
      vi.fn(async (_url: string) => jsonResponse({ error: "x" }, status)),
    );
    expect(result).toEqual({ ok: false, reason });
  });

  it("一覧に対象 threadId が無い → thread_not_listed（fake metadata を作らない）", async () => {
    const result = await fetchTalkThreadMetadataOnce(
      "t-unknown",
      vi.fn(async (_url: string) => jsonResponse(THREADS_PAYLOAD)),
    );
    expect(result).toEqual({ ok: false, reason: "thread_not_listed" });
  });

  it("counterpart.userId 欠落 → missing_counterpart / payload 不正 → invalid_payload / 例外 → network_error", async () => {
    const noUserId = await fetchTalkThreadMetadataOnce(
      "t-1",
      vi.fn(async (_url: string) =>
        jsonResponse({ ok: true, threads: [{ threadId: "t-1", connectionId: "c", counterpart: {} }] }),
      ),
    );
    expect(noUserId).toEqual({ ok: false, reason: "missing_counterpart" });

    const invalid = await fetchTalkThreadMetadataOnce(
      "t-1",
      vi.fn(async (_url: string) => jsonResponse({ ok: false })),
    );
    expect(invalid).toEqual({ ok: false, reason: "invalid_payload" });

    const network = await fetchTalkThreadMetadataOnce(
      "t-1",
      vi.fn(async (_url: string) => {
        throw new Error("offline");
      }),
    );
    expect(network).toEqual({ ok: false, reason: "network_error" });
  });

  // ── metadata GET も in-flight dedupe で 1 回 ──
  it("metadata GET の in-flight dedupe: 並行 2 呼び出しで GET 1 回", async () => {
    let resolveResponse: (r: Response) => void = () => {};
    const fetchSpy = vi.fn(
      (_url: string) => new Promise<Response>((resolve) => (resolveResponse = resolve)),
    );
    const p1 = readTalkThreadMetadataDeduped("meta-dedupe-t1", fetchSpy);
    const p2 = readTalkThreadMetadataDeduped("meta-dedupe-t1", fetchSpy);
    resolveResponse(jsonResponse(THREADS_PAYLOAD));
    await Promise.all([p1, p2]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // ── 8: capabilities は enrich 後も read-only のまま ──
  it("metadata 解決後も capabilities は read-only（send:none / realtime:false / readReceipts:false / coalterInvoke:false）", () => {
    const metadata: TalkThreadMetadata = {
      threadId: "t-1",
      connectionId: "conn-9",
      counterpartUserId: "user-bbb",
      counterpartDisplayName: "Mio",
    };
    const adapter = createTalkThreadReadonlyAdapter("t-1", {
      messages: [],
      participants: resolveParticipantsWithThreadMetadata(ANON, metadata),
    });
    expect(adapter.capabilities).toEqual({
      read: "live",
      send: "none",
      realtime: false,
      readReceipts: false,
      coalterInvoke: false,
    });
    expect(adapter.getViewer()).toBeNull(); // 既読 mark の主体も作らない
  });

  // ── 7: /plan coalter フォルダの source guard（恒久・fs ベース） ──
  it("coalter フォルダに service_role / supabase / useCoAlter import / /api/coalter リテラルが存在しない", () => {
    const dir = join(process.cwd(), "app/(culcept)/plan/tabs/coalter");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const f of files) {
      const src = readFileSync(join(dir, f), "utf8");
      // service_role の実体参照（env key / admin client 生成）禁止
      expect(src.includes("SUPABASE_SERVICE_ROLE_KEY"), `${f}: SERVICE_ROLE_KEY`).toBe(false);
      expect(src.includes("process.env.SUPABASE"), `${f}: env.SUPABASE`).toBe(false);
      // import 解析: supabase / useCoAlter hook を import しない
      const importSpecs = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const spec of importSpecs) {
        expect(spec.includes("supabase"), `${f}: import ${spec}`).toBe(false);
        expect(/(^|\/)useCoAlter$/.test(spec), `${f}: import ${spec}`).toBe(false);
      }
      // /api/coalter・既読 URL を文字列リテラルとして持たない（コメント言及は対象外）
      expect(/["'`]\/api\/coalter/.test(src), `${f}: /api/coalter literal`).toBe(false);
      expect(/\/read["'`]/.test(src), `${f}: read receipt URL literal`).toBe(false);
      expect(/\/typing["'`]/.test(src), `${f}: typing URL literal`).toBe(false);
    }
  });
});
