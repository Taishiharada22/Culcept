/**
 * Track B TB-4 — runMicrosoftAnchorImport orchestration core + pure helpers 単体 test
 *
 * 設計: docs/alter-plan-track-b-provider-native-readiness.md §3 TB-4
 * (= importGoogleAnchorsHelpers.test の MS 版。 calendar-list/primary fallback 分岐は無いので単純)
 *
 * 検証範囲:
 *   - buildMicrosoftImportWindow: now 基準 -30/+90 日 ISO (= deterministic)
 *   - partitionMsDraftsByExistingUids: externalUid dedup edge case (= Google/ICS 版と対称)
 *   - runMicrosoftAnchorImport: connection/decrypt/refresh/fetch/map/dedup/persist 全分岐
 *
 * 不変原則:
 *   - core は pure (= deps 注入)。 supabase / env / 実 OAuth は本 test 範囲外
 *   - 永続化境界は memory repository で代用 (= Google helper test と同手法、 実 validation を通す)
 *   - core は real mapMicrosoftEventsToAnchorDrafts を内部 call → fixture は実 mapper 受理形
 */

import { describe, expect, it, vi } from "vitest";

import type {
  ConnectionView,
  FindConnectionResult,
} from "@/lib/oauth/calendarConnectionRepository";
import type { MsRefreshResult } from "@/lib/oauth/microsoftCalendarApi";
import type {
  FetchAllMsEventsResult,
  MicrosoftCalendarEventRaw,
} from "@/lib/oauth/microsoftCalendarEvents";
import type { MsAnchorDraft } from "@/lib/oauth/microsoftEventsToAnchorMapper";
import {
  IMPORT_WINDOW_FUTURE_DAYS,
  IMPORT_WINDOW_PAST_DAYS,
  buildMicrosoftImportWindow,
  partitionMsDraftsByExistingUids,
  runMicrosoftAnchorImport,
  type MicrosoftImportDeps,
  type MicrosoftImportLogEvent,
} from "@/lib/oauth/importMicrosoftAnchorsHelpers";
import type { DecryptResult } from "@/lib/oauth/tokenCrypto";
import type {
  ExternalAnchor,
  OneOffExternalAnchor,
} from "@/lib/plan/external-anchor";
import type { CreateSourceWithAnchorsInput } from "@/lib/plan/external-anchor-repository";
import { createMemoryExternalAnchorRepository } from "@/lib/plan/external-anchor-repository-memory";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const USER_ID = "user-A";

const decryptOk: DecryptResult = { ok: true, plaintext: "refresh-plain" };
const refreshOk: MsRefreshResult = {
  ok: true,
  accessToken: "ms-access-123",
  expiresInSeconds: 3600,
  scopes: [],
};

/** 実 mapper が受理する timed event (= microsoftEventsToAnchorMapper.test.ts 準拠、 JST naive) */
function makeTimedEvent(
  overrides: Partial<MicrosoftCalendarEventRaw> = {},
): MicrosoftCalendarEventRaw {
  return {
    id: "ev-timed-1",
    iCalUId: "uid-timed-1@ms",
    subject: "Meeting",
    type: "singleInstance",
    start: { dateTime: "2026-06-15T10:00:00.0000000", timeZone: "Tokyo Standard Time" },
    end: { dateTime: "2026-06-15T11:30:00.0000000", timeZone: "Tokyo Standard Time" },
    location: { displayName: "Office" },
    ...overrides,
  };
}

/** partition 単体 test 用の MsAnchorDraft (= CreateOneOffAnchorInput & {externalUid}) */
function makeMsDraft(overrides: Partial<MsAnchorDraft> = {}): MsAnchorDraft {
  return {
    anchorKind: "one_off",
    title: "予定",
    startTime: "09:00",
    date: "2026-06-01",
    rigidity: "hard",
    sourceType: "microsoft_calendar",
    externalUid: "uid-001",
    ...overrides,
  };
}

/** dedup base 用の既存 ExternalAnchor */
function makeAnchor(overrides: Partial<OneOffExternalAnchor> = {}): ExternalAnchor {
  const base: OneOffExternalAnchor = {
    anchorKind: "one_off",
    id: "anchor-001",
    userId: USER_ID,
    sourceId: "source-001",
    title: "Existing",
    startTime: "09:00",
    date: "2026-06-01",
    rigidity: "hard",
    confirmedAt: "2026-05-26T10:00:00.000Z",
  };
  return { ...base, ...overrides };
}

function makeConnection(overrides: Partial<ConnectionView> = {}): ConnectionView {
  return {
    id: "conn-1",
    status: "active",
    lastSyncedAt: null,
    scopes: ["Calendars.Read"],
    refreshTokenEncrypted: Buffer.from("enc-refresh-token"),
    ...overrides,
  };
}

function fetchOk(events: MicrosoftCalendarEventRaw[]): FetchAllMsEventsResult {
  return { ok: true, events, pageCount: 1, hitHardLimit: false };
}
function fetchFail(
  partialEvents: MicrosoftCalendarEventRaw[],
  reason: Extract<FetchAllMsEventsResult, { ok: false }>["reason"] = "network",
): FetchAllMsEventsResult {
  return { ok: false, reason, partialEvents, pageCount: 1 };
}

/**
 * 全 step 成功 default の deps。 各 test は必要分のみ override。
 * 永続化境界は memory repository で代用 (= 実 validation を通す)。
 */
function makeBaseDeps(
  overrides: Partial<MicrosoftImportDeps> = {},
  repo = createMemoryExternalAnchorRepository(),
): MicrosoftImportDeps {
  return {
    findConnection: async (): Promise<FindConnectionResult> => ({
      ok: true,
      connection: makeConnection(),
    }),
    decryptToken: () => decryptOk,
    refreshAccessToken: async () => refreshOk,
    fetchAllEvents: async () => fetchOk([makeTimedEvent()]),
    listExistingAnchors: () => repo.listAnchors(USER_ID),
    createSourceWithAnchors: (bundle) => repo.createSourceWithAnchors(USER_ID, bundle),
    now: () => new Date("2026-05-29T00:00:00.000Z"),
    ...overrides,
  };
}

/** dedup test 用: memory repo に microsoft_calendar anchor を 1 件 seed (= externalUid 復元用) */
async function seedAnchorWithUid(
  repo: ReturnType<typeof createMemoryExternalAnchorRepository>,
  externalUid: string,
): Promise<void> {
  await repo.createSourceWithAnchors(USER_ID, {
    source: { sourceType: "microsoft_calendar", rawRetention: "discarded" },
    anchors: [
      {
        anchorKind: "one_off",
        title: "既存予定",
        startTime: "10:00",
        date: "2026-06-15",
        rigidity: "hard",
        sourceType: "microsoft_calendar",
        externalUid,
      },
    ],
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildMicrosoftImportWindow
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildMicrosoftImportWindow", () => {
  it("now 基準で startDateTime = -30 日 / endDateTime = +90 日 の ISO", () => {
    const now = new Date("2026-05-29T00:00:00.000Z");
    const w = buildMicrosoftImportWindow(now);
    expect(w.startDateTime).toBe("2026-04-29T00:00:00.000Z");
    expect(w.endDateTime).toBe("2026-08-27T00:00:00.000Z");
  });

  it("定数は 30 / 90 (= ICS/Google と同窓)", () => {
    expect(IMPORT_WINDOW_PAST_DAYS).toBe(30);
    expect(IMPORT_WINDOW_FUTURE_DAYS).toBe(90);
  });

  it("時刻成分も窓端に保持 (= 丸ごと日数 ms 加減算)", () => {
    const now = new Date("2026-05-29T13:45:30.000Z");
    const w = buildMicrosoftImportWindow(now);
    expect(w.startDateTime).toBe("2026-04-29T13:45:30.000Z");
    expect(w.endDateTime).toBe("2026-08-27T13:45:30.000Z");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// partitionMsDraftsByExistingUids
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("partitionMsDraftsByExistingUids", () => {
  it("drafts 空 → kept=[], skipped=0", () => {
    const r = partitionMsDraftsByExistingUids([], [makeAnchor({ externalUid: "x" })]);
    expect(r.kept).toEqual([]);
    expect(r.skipped).toBe(0);
  });

  it("existingAnchors 空 → 全 draft kept", () => {
    const r = partitionMsDraftsByExistingUids(
      [makeMsDraft({ externalUid: "a" }), makeMsDraft({ externalUid: "b" })],
      [],
    );
    expect(r.kept).toHaveLength(2);
    expect(r.skipped).toBe(0);
  });

  it("全 draft が既存 UID と一致 → kept=[], skipped=N", () => {
    const drafts = [makeMsDraft({ externalUid: "u1" }), makeMsDraft({ externalUid: "u2" })];
    const existing = [
      makeAnchor({ id: "a1", externalUid: "u1" }),
      makeAnchor({ id: "a2", externalUid: "u2" }),
    ];
    const r = partitionMsDraftsByExistingUids(drafts, existing);
    expect(r.kept).toEqual([]);
    expect(r.skipped).toBe(2);
  });

  it("混在 → 一致したものだけ skip、 残りは kept (順序保持)", () => {
    const drafts = [
      makeMsDraft({ externalUid: "new-1", title: "新規 1" }),
      makeMsDraft({ externalUid: "dup", title: "重複" }),
      makeMsDraft({ externalUid: "new-2", title: "新規 2" }),
    ];
    const existing = [makeAnchor({ externalUid: "dup" })];
    const r = partitionMsDraftsByExistingUids(drafts, existing);
    expect(r.skipped).toBe(1);
    expect(r.kept.map((d) => d.title)).toEqual(["新規 1", "新規 2"]);
  });

  it("既存 anchor の externalUid 未定義 / 空文字 → dedup 対象外 (= 守備的)", () => {
    const r1 = partitionMsDraftsByExistingUids([makeMsDraft({ externalUid: "u1" })], [makeAnchor()]);
    expect(r1.kept).toHaveLength(1);
    expect(r1.skipped).toBe(0);
    const r2 = partitionMsDraftsByExistingUids(
      [makeMsDraft({ externalUid: "u1" })],
      [makeAnchor({ externalUid: "" })],
    );
    expect(r2.kept).toHaveLength(1);
    expect(r2.skipped).toBe(0);
  });

  it("cross-source dedup (= 別 source 由来 anchor の UID とも一致で skip)", () => {
    const r = partitionMsDraftsByExistingUids(
      [makeMsDraft({ externalUid: "shared-uid" })],
      [makeAnchor({ sourceId: "google-source", externalUid: "shared-uid" })],
    );
    expect(r.kept).toEqual([]);
    expect(r.skipped).toBe(1);
  });

  it("入力 mutate なし", () => {
    const drafts = [makeMsDraft({ externalUid: "a" })];
    const existing = [makeAnchor({ externalUid: "b" })];
    const draftsCopy = [...drafts];
    const existingCopy = [...existing];
    partitionMsDraftsByExistingUids(drafts, existing);
    expect(drafts).toEqual(draftsCopy);
    expect(existing).toEqual(existingCopy);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// runMicrosoftAnchorImport — connection / auth 分岐
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("runMicrosoftAnchorImport — connection / auth 分岐", () => {
  it("findConnection 失敗 → 接続情報の取得に失敗", async () => {
    const deps = makeBaseDeps({
      findConnection: async () => ({ ok: false, reason: "db_error", detail: "boom" }),
    });
    expect(await runMicrosoftAnchorImport(deps)).toEqual({
      ok: false,
      error: "接続情報の取得に失敗しました。",
    });
  });

  it("connection null → 接続されていません", async () => {
    const deps = makeBaseDeps({
      findConnection: async () => ({ ok: true, connection: null }),
    });
    expect(await runMicrosoftAnchorImport(deps)).toEqual({
      ok: false,
      error: "Outlook カレンダーが接続されていません。",
    });
  });

  it("connection inactive (revoked) → 再接続が必要", async () => {
    const deps = makeBaseDeps({
      findConnection: async () => ({
        ok: true,
        connection: makeConnection({ status: "revoked" }),
      }),
    });
    expect(await runMicrosoftAnchorImport(deps)).toEqual({
      ok: false,
      error: "Outlook カレンダーの再接続が必要です。",
    });
  });

  it("decrypt 失敗 → 再接続が必要", async () => {
    const deps = makeBaseDeps({
      decryptToken: () => ({ ok: false, reason: "authentication" }),
    });
    expect(await runMicrosoftAnchorImport(deps)).toEqual({
      ok: false,
      error: "Outlook カレンダーの再接続が必要です。",
    });
  });

  it("refresh invalid_grant → 再接続が必要", async () => {
    const deps = makeBaseDeps({
      refreshAccessToken: async () => ({ ok: false, reason: "invalid_grant" }),
    });
    expect(await runMicrosoftAnchorImport(deps)).toEqual({
      ok: false,
      error: "Outlook カレンダーの再接続が必要です。",
    });
  });

  it("refresh invalid_client → サーバー設定が不完全 (= secret 不一致)", async () => {
    const deps = makeBaseDeps({
      refreshAccessToken: async () => ({ ok: false, reason: "invalid_client" }),
    });
    expect(await runMicrosoftAnchorImport(deps)).toEqual({
      ok: false,
      error: "サーバー設定が不完全です。",
    });
  });

  it("refresh network → 通信に失敗 (= その他 reason)", async () => {
    const deps = makeBaseDeps({
      refreshAccessToken: async () => ({ ok: false, reason: "network" }),
    });
    expect(await runMicrosoftAnchorImport(deps)).toEqual({
      ok: false,
      error: "Outlook カレンダーとの通信に失敗しました。",
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// runMicrosoftAnchorImport — fetch 分岐 (= calendarView 1 回、 calendar-list なし)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("runMicrosoftAnchorImport — fetch 分岐", () => {
  it("fetchAllEvents に buildMicrosoftImportWindow(now) と accessToken を渡す", async () => {
    const fetchSpy = vi.fn(
      async (_a: { accessToken: string; startDateTime: string; endDateTime: string }) =>
        fetchOk([makeTimedEvent()]),
    );
    const now = new Date("2026-05-29T00:00:00.000Z");
    const deps = makeBaseDeps({ now: () => now, fetchAllEvents: fetchSpy });
    await runMicrosoftAnchorImport(deps);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const args = fetchSpy.mock.calls[0]![0];
    const win = buildMicrosoftImportWindow(now);
    expect(args.startDateTime).toBe(win.startDateTime);
    expect(args.endDateTime).toBe(win.endDateTime);
    expect(args.accessToken).toBe("ms-access-123");
  });

  it("fetch 失敗でも partialEvents があれば採用して継続", async () => {
    const logs: MicrosoftImportLogEvent[] = [];
    const deps = makeBaseDeps({
      fetchAllEvents: async () => fetchFail([makeTimedEvent()], "rate_limited"),
      log: (e) => logs.push(e),
    });
    expect(await runMicrosoftAnchorImport(deps)).toEqual({
      ok: true,
      imported: 1,
      skipped: 0,
    });
    expect(logs.some((e) => e.kind === "fetch_failed")).toBe(true);
  });

  it("fetch 失敗 + partial 0 件 → 予定の取得に失敗 (+ fetch_failed log)", async () => {
    const logs: MicrosoftImportLogEvent[] = [];
    const createSpy = vi.fn(async () => {
      throw new Error("must not persist");
    });
    const deps = makeBaseDeps({
      fetchAllEvents: async () => fetchFail([], "unauthorized"),
      createSourceWithAnchors: createSpy,
      log: (e) => logs.push(e),
    });
    expect(await runMicrosoftAnchorImport(deps)).toEqual({
      ok: false,
      error: "予定の取得に失敗しました。",
    });
    expect(createSpy).not.toHaveBeenCalled();
    expect(logs.find((e) => e.kind === "fetch_failed")).toMatchObject({
      kind: "fetch_failed",
      reason: "unauthorized",
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// runMicrosoftAnchorImport — map / dedup / persist 分岐
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("runMicrosoftAnchorImport — map / dedup / persist 分岐", () => {
  it("mapper skip (cancelled) も skipped に計上 (= imported:1, skipped:1)", async () => {
    const deps = makeBaseDeps({
      fetchAllEvents: async () =>
        fetchOk([
          makeTimedEvent({ id: "v", iCalUId: "uid-v" }),
          makeTimedEvent({ id: "c", iCalUId: "uid-c", isCancelled: true }),
        ]),
    });
    expect(await runMicrosoftAnchorImport(deps)).toEqual({
      ok: true,
      imported: 1,
      skipped: 1,
    });
  });

  it("一部 dedup → 新規のみ import (= imported:1, skipped:1)", async () => {
    const repo = createMemoryExternalAnchorRepository();
    await seedAnchorWithUid(repo, "uid-dup");
    const deps = makeBaseDeps(
      {
        fetchAllEvents: async () =>
          fetchOk([
            makeTimedEvent({ id: "d1", iCalUId: "uid-dup" }),
            makeTimedEvent({ id: "n1", iCalUId: "uid-new", subject: "New" }),
          ]),
      },
      repo,
    );
    expect(await runMicrosoftAnchorImport(deps)).toEqual({
      ok: true,
      imported: 1,
      skipped: 1,
    });
  });

  it("mapper skip + dedup skip 合算 → kept 0 で source 作らず ok:true (+ all_skipped log)", async () => {
    const repo = createMemoryExternalAnchorRepository();
    await seedAnchorWithUid(repo, "uid-timed-1@ms");
    const createSpy = vi.fn((b: CreateSourceWithAnchorsInput) =>
      repo.createSourceWithAnchors(USER_ID, b),
    );
    const logs: MicrosoftImportLogEvent[] = [];
    const deps = makeBaseDeps(
      {
        fetchAllEvents: async () =>
          fetchOk([
            makeTimedEvent({ id: "c1", iCalUId: "uid-cancel", isCancelled: true }),
            makeTimedEvent(), // uid-timed-1@ms = seeded → dedup
          ]),
        createSourceWithAnchors: createSpy,
        log: (e) => logs.push(e),
      },
      repo,
    );
    expect(await runMicrosoftAnchorImport(deps)).toEqual({
      ok: true,
      imported: 0,
      skipped: 2,
    });
    expect(createSpy).not.toHaveBeenCalled();
    expect(logs.find((e) => e.kind === "all_skipped")).toMatchObject({
      kind: "all_skipped",
      mapperSkipped: 1,
      dedupSkipped: 1,
    });
  });

  it("listExistingAnchors throw → 既存予定の取得に失敗", async () => {
    const deps = makeBaseDeps({
      listExistingAnchors: async () => {
        throw new Error("db fail");
      },
    });
    expect(await runMicrosoftAnchorImport(deps)).toEqual({
      ok: false,
      error: "既存予定の取得に失敗しました。",
    });
  });

  it("createSourceWithAnchors throw → 保存中にエラー", async () => {
    const deps = makeBaseDeps({
      createSourceWithAnchors: async () => {
        throw new Error("rpc down");
      },
    });
    expect(await runMicrosoftAnchorImport(deps)).toEqual({
      ok: false,
      error: "予定の保存中にエラーが発生しました。",
    });
  });

  it("createSourceWithAnchors ok:false (anchor_invalid) → 保存に失敗 (+ persist_rejected log)", async () => {
    const logs: MicrosoftImportLogEvent[] = [];
    const deps = makeBaseDeps({
      createSourceWithAnchors: async () => ({
        ok: false,
        errors: [
          {
            kind: "anchor_invalid",
            index: 0,
            errors: [{ field: "title", code: "required", message: "title is required" }],
          },
        ],
      }),
      log: (e) => logs.push(e),
    });
    const r = await runMicrosoftAnchorImport(deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/予定の保存に失敗しました/);
    expect(logs.some((e) => e.kind === "persist_rejected")).toBe(true);
  });

  it("createSourceWithAnchors ok:false (source_invalid) → detail に source 不正", async () => {
    const deps = makeBaseDeps({
      createSourceWithAnchors: async () => ({
        ok: false,
        errors: [
          {
            kind: "source_invalid",
            errors: [
              { field: "source.sourceType", code: "invalid_format", message: "bad source" },
            ],
          },
        ],
      }),
    });
    const r = await runMicrosoftAnchorImport(deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/source 不正/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// runMicrosoftAnchorImport — success + bundle contract
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("runMicrosoftAnchorImport — success + bundle contract", () => {
  it("成功 → microsoft_calendar bundle を渡し imported / import_success log", async () => {
    const repo = createMemoryExternalAnchorRepository();
    const createSpy = vi.fn((bundle: CreateSourceWithAnchorsInput) =>
      repo.createSourceWithAnchors(USER_ID, bundle),
    );
    const logs: MicrosoftImportLogEvent[] = [];
    const deps = makeBaseDeps(
      {
        fetchAllEvents: async () => fetchOk([makeTimedEvent()]),
        createSourceWithAnchors: createSpy,
        log: (e) => logs.push(e),
      },
      repo,
    );
    const r = await runMicrosoftAnchorImport(deps);
    expect(r).toEqual({ ok: true, imported: 1, skipped: 0 });

    expect(createSpy).toHaveBeenCalledTimes(1);
    const bundle = createSpy.mock.calls[0]![0];
    expect(bundle.source.sourceType).toBe("microsoft_calendar");
    expect(bundle.source.rawRetention).toBe("discarded");
    expect(bundle.source.notes).toBe("Outlook カレンダーから取り込み");
    expect(bundle.anchors).toHaveLength(1);
    expect(bundle.anchors[0]?.sourceType).toBe("microsoft_calendar");
    expect(bundle.anchors[0]?.externalUid).toBe("uid-timed-1@ms");

    expect(logs.find((e) => e.kind === "import_success")).toMatchObject({
      kind: "import_success",
      imported: 1,
      skipped: 0,
    });
  });

  it("log 未指定でも throw しない (= default no-op path)", async () => {
    const r = await runMicrosoftAnchorImport(makeBaseDeps());
    expect(r.ok).toBe(true);
  });
});
