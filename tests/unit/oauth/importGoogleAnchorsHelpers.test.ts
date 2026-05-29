/**
 * P3 Phase B B-2 — runGoogleAnchorImport orchestration core + pure helpers 単体 test
 *
 * 設計: docs/alter-plan-p3-phase-b-readiness.md / B-2 readiness (= 2026-05-29 CEO GO)
 *
 * 検証範囲 (= B-2 readiness §1 の 10 step を全分岐網羅):
 *   - buildGoogleImportWindow: now 基準 ±30/90 日 ISO (= deterministic)
 *   - partitionGoogleDraftsByExistingUids: externalUid dedup edge case (= ICS 版と対称)
 *   - runGoogleAnchorImport: connection/decrypt/refresh/calendars/fetch/map/dedup/persist 全分岐
 *
 * 不変原則:
 *   - core は pure (= deps 注入)。 supabase / env / 実 OAuth は本 test 範囲外
 *   - 永続化境界は memory repository で代用 (= ICS round-trip test と同手法、 実 validation を通す)
 *   - error 注入分岐は hand-rolled mock deps
 *   - core は real mapGoogleEventsToAnchorDrafts を内部 call → fixture は実 mapper 受理形
 */

import { describe, expect, it, vi } from "vitest";

import type {
  ConnectionView,
  FindConnectionResult,
} from "@/lib/oauth/calendarConnectionRepository";
import type { RefreshAccessTokenResult } from "@/lib/oauth/googleCalendarApi";
import type {
  FetchAllEventsResult,
  GoogleCalendarEventRaw,
} from "@/lib/oauth/googleCalendarEvents";
import type { GoogleAnchorDraft } from "@/lib/oauth/googleEventsToAnchorMapper";
import {
  IMPORT_WINDOW_FUTURE_DAYS,
  IMPORT_WINDOW_PAST_DAYS,
  buildGoogleImportWindow,
  partitionGoogleDraftsByExistingUids,
  runGoogleAnchorImport,
  type GoogleImportDeps,
  type GoogleImportLogEvent,
} from "@/lib/oauth/importGoogleAnchorsHelpers";
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
const refreshOk: RefreshAccessTokenResult = {
  ok: true,
  accessToken: "access-123",
  expiresInSeconds: 3600,
  scopes: [],
};

/** 実 mapper が受理する timed event (= googleEventsToAnchorMapper.test.ts 準拠) */
function makeTimedEvent(
  overrides: Partial<GoogleCalendarEventRaw> = {},
): GoogleCalendarEventRaw {
  return {
    id: "ev-timed-1",
    summary: "Meeting",
    iCalUID: "uid-timed-1@google",
    start: { dateTime: "2026-06-15T10:00:00Z" },
    end: { dateTime: "2026-06-15T11:30:00Z" },
    location: "Office",
    status: "confirmed",
    ...overrides,
  };
}

/** partition 単体 test 用の GoogleAnchorDraft (= CreateOneOffAnchorInput & {externalUid}) */
function makeGoogleDraft(
  overrides: Partial<GoogleAnchorDraft> = {},
): GoogleAnchorDraft {
  return {
    anchorKind: "one_off",
    title: "予定",
    startTime: "09:00",
    date: "2026-06-01",
    rigidity: "hard",
    sourceType: "google_calendar",
    externalUid: "uid-001",
    ...overrides,
  };
}

/** dedup base 用の既存 ExternalAnchor */
function makeAnchor(
  overrides: Partial<OneOffExternalAnchor> = {},
): ExternalAnchor {
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
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    refreshTokenEncrypted: Buffer.from("enc-refresh-token"),
    ...overrides,
  };
}

function fetchOk(events: GoogleCalendarEventRaw[]): FetchAllEventsResult {
  return { ok: true, events, pageCount: 1, hitHardLimit: false };
}
function fetchFail(
  partialEvents: GoogleCalendarEventRaw[],
  reason: Extract<FetchAllEventsResult, { ok: false }>["reason"] = "network",
): FetchAllEventsResult {
  return { ok: false, reason, partialEvents, pageCount: 1 };
}

/**
 * 全 step 成功 default の deps。 各 test は必要分のみ override。
 * 永続化境界は memory repository で代用 (= 実 validation を通す)。
 */
function makeBaseDeps(
  overrides: Partial<GoogleImportDeps> = {},
  repo = createMemoryExternalAnchorRepository(),
): GoogleImportDeps {
  return {
    findConnection: async (): Promise<FindConnectionResult> => ({
      ok: true,
      connection: makeConnection(),
    }),
    decryptToken: () => decryptOk,
    refreshAccessToken: async () => refreshOk,
    listEnabledCalendarIds: async () => ({ ok: true, calendarIds: ["primary"] }),
    fetchAllEvents: async () => fetchOk([makeTimedEvent()]),
    listExistingAnchors: () => repo.listAnchors(USER_ID),
    createSourceWithAnchors: (bundle) =>
      repo.createSourceWithAnchors(USER_ID, bundle),
    now: () => new Date("2026-05-29T00:00:00.000Z"),
    ...overrides,
  };
}

/** dedup test 用: memory repo に google_calendar anchor を 1 件 seed (= externalUid 復元用) */
async function seedAnchorWithUid(
  repo: ReturnType<typeof createMemoryExternalAnchorRepository>,
  externalUid: string,
): Promise<void> {
  await repo.createSourceWithAnchors(USER_ID, {
    source: { sourceType: "google_calendar", rawRetention: "discarded" },
    anchors: [
      {
        anchorKind: "one_off",
        title: "既存予定",
        startTime: "10:00",
        date: "2026-06-15",
        rigidity: "hard",
        sourceType: "google_calendar",
        externalUid,
      },
    ],
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildGoogleImportWindow
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildGoogleImportWindow", () => {
  it("now 基準で timeMin = -30 日 / timeMax = +90 日 の ISO", () => {
    const now = new Date("2026-05-29T00:00:00.000Z");
    const w = buildGoogleImportWindow(now);
    expect(w.timeMin).toBe("2026-04-29T00:00:00.000Z");
    expect(w.timeMax).toBe("2026-08-27T00:00:00.000Z");
  });

  it("定数は 30 / 90 (= 親 Q4 採用案)", () => {
    expect(IMPORT_WINDOW_PAST_DAYS).toBe(30);
    expect(IMPORT_WINDOW_FUTURE_DAYS).toBe(90);
  });

  it("時刻成分も窓端に保持 (= 丸ごと日数 ms 加減算)", () => {
    const now = new Date("2026-05-29T13:45:30.000Z");
    const w = buildGoogleImportWindow(now);
    expect(w.timeMin).toBe("2026-04-29T13:45:30.000Z");
    expect(w.timeMax).toBe("2026-08-27T13:45:30.000Z");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// partitionGoogleDraftsByExistingUids
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("partitionGoogleDraftsByExistingUids", () => {
  it("drafts 空 → kept=[], skipped=0", () => {
    const r = partitionGoogleDraftsByExistingUids([], [makeAnchor({ externalUid: "x" })]);
    expect(r.kept).toEqual([]);
    expect(r.skipped).toBe(0);
  });

  it("existingAnchors 空 → 全 draft kept", () => {
    const r = partitionGoogleDraftsByExistingUids(
      [makeGoogleDraft({ externalUid: "a" }), makeGoogleDraft({ externalUid: "b" })],
      [],
    );
    expect(r.kept).toHaveLength(2);
    expect(r.skipped).toBe(0);
  });

  it("全 draft が既存 UID と一致 → kept=[], skipped=N", () => {
    const drafts = [
      makeGoogleDraft({ externalUid: "u1" }),
      makeGoogleDraft({ externalUid: "u2" }),
    ];
    const existing = [
      makeAnchor({ id: "a1", externalUid: "u1" }),
      makeAnchor({ id: "a2", externalUid: "u2" }),
    ];
    const r = partitionGoogleDraftsByExistingUids(drafts, existing);
    expect(r.kept).toEqual([]);
    expect(r.skipped).toBe(2);
  });

  it("混在 → 一致したものだけ skip、 残りは kept (順序保持)", () => {
    const drafts = [
      makeGoogleDraft({ externalUid: "new-1", title: "新規 1" }),
      makeGoogleDraft({ externalUid: "dup", title: "重複" }),
      makeGoogleDraft({ externalUid: "new-2", title: "新規 2" }),
    ];
    const existing = [makeAnchor({ externalUid: "dup" })];
    const r = partitionGoogleDraftsByExistingUids(drafts, existing);
    expect(r.skipped).toBe(1);
    expect(r.kept.map((d) => d.title)).toEqual(["新規 1", "新規 2"]);
  });

  it("既存 anchor の externalUid 未定義 → dedup 対象外 (= 全 draft kept)", () => {
    const r = partitionGoogleDraftsByExistingUids(
      [makeGoogleDraft({ externalUid: "u1" })],
      [makeAnchor(/* externalUid 未設定 */)],
    );
    expect(r.kept).toHaveLength(1);
    expect(r.skipped).toBe(0);
  });

  it("既存 anchor の externalUid 空文字 → dedup 対象外 (= 守備的)", () => {
    const r = partitionGoogleDraftsByExistingUids(
      [makeGoogleDraft({ externalUid: "u1" })],
      [makeAnchor({ externalUid: "" })],
    );
    expect(r.kept).toHaveLength(1);
    expect(r.skipped).toBe(0);
  });

  it("cross-source dedup (= 別 source 由来 anchor の UID とも一致で skip)", () => {
    const r = partitionGoogleDraftsByExistingUids(
      [makeGoogleDraft({ externalUid: "shared-uid" })],
      [makeAnchor({ sourceId: "ics-source", externalUid: "shared-uid" })],
    );
    expect(r.kept).toEqual([]);
    expect(r.skipped).toBe(1);
  });

  it("入力 mutate なし (= 参照同一性保持)", () => {
    const drafts = [makeGoogleDraft({ externalUid: "a" })];
    const existing = [makeAnchor({ externalUid: "b" })];
    const draftsCopy = [...drafts];
    const existingCopy = [...existing];
    partitionGoogleDraftsByExistingUids(drafts, existing);
    expect(drafts).toEqual(draftsCopy);
    expect(existing).toEqual(existingCopy);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// runGoogleAnchorImport — connection / auth 分岐
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("runGoogleAnchorImport — connection / auth 分岐", () => {
  it("findConnection 失敗 → 接続情報の取得に失敗", async () => {
    const deps = makeBaseDeps({
      findConnection: async () => ({ ok: false, reason: "db_error", detail: "boom" }),
    });
    expect(await runGoogleAnchorImport(deps)).toEqual({
      ok: false,
      error: "接続情報の取得に失敗しました。",
    });
  });

  it("connection null → 接続されていません", async () => {
    const deps = makeBaseDeps({
      findConnection: async () => ({ ok: true, connection: null }),
    });
    expect(await runGoogleAnchorImport(deps)).toEqual({
      ok: false,
      error: "Google カレンダーが接続されていません。",
    });
  });

  it("connection inactive (revoked) → 再接続が必要", async () => {
    const deps = makeBaseDeps({
      findConnection: async () => ({
        ok: true,
        connection: makeConnection({ status: "revoked" }),
      }),
    });
    expect(await runGoogleAnchorImport(deps)).toEqual({
      ok: false,
      error: "Google カレンダーの再接続が必要です。",
    });
  });

  it("decrypt 失敗 → 再接続が必要", async () => {
    const deps = makeBaseDeps({
      decryptToken: () => ({ ok: false, reason: "authentication" }),
    });
    expect(await runGoogleAnchorImport(deps)).toEqual({
      ok: false,
      error: "Google カレンダーの再接続が必要です。",
    });
  });

  it("refresh invalid_grant → 再接続が必要", async () => {
    const deps = makeBaseDeps({
      refreshAccessToken: async () => ({ ok: false, reason: "invalid_grant" }),
    });
    expect(await runGoogleAnchorImport(deps)).toEqual({
      ok: false,
      error: "Google カレンダーの再接続が必要です。",
    });
  });

  it("refresh invalid_client → サーバー設定が不完全 (= secret 不一致)", async () => {
    const deps = makeBaseDeps({
      refreshAccessToken: async () => ({ ok: false, reason: "invalid_client" }),
    });
    expect(await runGoogleAnchorImport(deps)).toEqual({
      ok: false,
      error: "サーバー設定が不完全です。",
    });
  });

  it("refresh network → 通信に失敗 (= その他 reason)", async () => {
    const deps = makeBaseDeps({
      refreshAccessToken: async () => ({ ok: false, reason: "network" }),
    });
    expect(await runGoogleAnchorImport(deps)).toEqual({
      ok: false,
      error: "Google カレンダーとの通信に失敗しました。",
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// runGoogleAnchorImport — calendars + fetch 分岐
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("runGoogleAnchorImport — calendars + fetch 分岐", () => {
  // CEO 指定 case 2: listEnabledCalendarIds { ok:false } → fallback せず従来どおり error
  it("listEnabledCalendarIds 失敗 → fallback せず error (= fetch/persist 不発火 + detail log)", async () => {
    const fetchSpy = vi.fn(
      async (_a: {
        calendarId: string;
        accessToken: string;
        timeMin: string;
        timeMax: string;
      }) => fetchOk([makeTimedEvent()]),
    );
    const createSpy = vi.fn(async () => {
      throw new Error("must not persist");
    });
    const logs: GoogleImportLogEvent[] = [];
    const deps = makeBaseDeps({
      listEnabledCalendarIds: async () => ({ ok: false, detail: "db down" }),
      fetchAllEvents: fetchSpy,
      createSourceWithAnchors: createSpy,
      log: (e) => logs.push(e),
    });
    expect(await runGoogleAnchorImport(deps)).toEqual({
      ok: false,
      error: "取り込み対象カレンダーの取得に失敗しました。",
    });
    // DB error は primary fallback しない (= 本物の失敗を隠さない)
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(logs.find((e) => e.kind === "list_calendars_failed")).toMatchObject({
      kind: "list_calendars_failed",
      detail: "db down",
    });
  });

  // CEO 指定 case 1: 購読が空 (= connect の calendarList 列挙が partial/失敗) でも
  // primary を直接取り込む (= 部分接続でも本流を通す、 設計ギャップを閉じる)
  it("有効カレンダー 0 件 → primary fallback で import 成功 (+ primary_fallback log)", async () => {
    const repo = createMemoryExternalAnchorRepository();
    const fetchSpy = vi.fn(
      async (_a: {
        calendarId: string;
        accessToken: string;
        timeMin: string;
        timeMax: string;
      }) => fetchOk([makeTimedEvent()]),
    );
    const createSpy = vi.fn((b: CreateSourceWithAnchorsInput) =>
      repo.createSourceWithAnchors(USER_ID, b),
    );
    const logs: GoogleImportLogEvent[] = [];
    const deps = makeBaseDeps(
      {
        listEnabledCalendarIds: async () => ({ ok: true, calendarIds: [] }),
        fetchAllEvents: fetchSpy,
        createSourceWithAnchors: createSpy,
        log: (e) => logs.push(e),
      },
      repo,
    );
    expect(await runGoogleAnchorImport(deps)).toEqual({
      ok: true,
      imported: 1,
      skipped: 0,
    });
    // 'primary' を直接取りに行く (= calendarList 列挙不要の本流)
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]![0].calendarId).toBe("primary");
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(logs.some((e) => e.kind === "primary_fallback")).toBe(true);
  });

  it("fetchAllEvents に buildGoogleImportWindow(now) と calendarId / accessToken を渡す", async () => {
    const fetchSpy = vi.fn(
      async (_a: {
        calendarId: string;
        accessToken: string;
        timeMin: string;
        timeMax: string;
      }) => fetchOk([makeTimedEvent()]),
    );
    const now = new Date("2026-05-29T00:00:00.000Z");
    const deps = makeBaseDeps({ now: () => now, fetchAllEvents: fetchSpy });
    await runGoogleAnchorImport(deps);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const args = fetchSpy.mock.calls[0]![0];
    const win = buildGoogleImportWindow(now);
    expect(args.timeMin).toBe(win.timeMin);
    expect(args.timeMax).toBe(win.timeMax);
    expect(args.calendarId).toBe("primary");
    expect(args.accessToken).toBe("access-123");
  });

  it("単一 calendar fetch 失敗でも partialEvents があれば採用して継続", async () => {
    const logs: GoogleImportLogEvent[] = [];
    const deps = makeBaseDeps({
      fetchAllEvents: async () => fetchFail([makeTimedEvent()], "rate_limited"),
      log: (e) => logs.push(e),
    });
    expect(await runGoogleAnchorImport(deps)).toEqual({
      ok: true,
      imported: 1,
      skipped: 0,
    });
    expect(logs.some((e) => e.kind === "fetch_failed")).toBe(true);
  });

  it("複数 calendar: 1 失敗 (partial 空) + 1 成功 → 成功分を import", async () => {
    const seen: string[] = [];
    const deps = makeBaseDeps({
      listEnabledCalendarIds: async () => ({
        ok: true,
        calendarIds: ["cal-fail", "cal-ok"],
      }),
      fetchAllEvents: async (args) => {
        seen.push(args.calendarId);
        return args.calendarId === "cal-fail"
          ? fetchFail([], "unauthorized")
          : fetchOk([makeTimedEvent({ id: "ok1", iCalUID: "uid-ok1" })]);
      },
    });
    const r = await runGoogleAnchorImport(deps);
    expect(seen).toEqual(["cal-fail", "cal-ok"]);
    expect(r).toEqual({ ok: true, imported: 1, skipped: 0 });
  });

  it("全 calendar fetch 失敗 + partial も 0 件 → 予定の取得に失敗", async () => {
    const logs: GoogleImportLogEvent[] = [];
    const deps = makeBaseDeps({
      fetchAllEvents: async () => fetchFail([], "network"),
      log: (e) => logs.push(e),
    });
    expect(await runGoogleAnchorImport(deps)).toEqual({
      ok: false,
      error: "予定の取得に失敗しました。",
    });
    expect(logs.some((e) => e.kind === "all_fetch_failed")).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// runGoogleAnchorImport — map / dedup / persist 分岐
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("runGoogleAnchorImport — map / dedup / persist 分岐", () => {
  it("mapper skip (cancelled) も skipped に計上 (= imported:1, skipped:1)", async () => {
    const deps = makeBaseDeps({
      fetchAllEvents: async () =>
        fetchOk([
          makeTimedEvent({ id: "v", iCalUID: "uid-v" }),
          makeTimedEvent({ id: "c", iCalUID: "uid-c", status: "cancelled" }),
        ]),
    });
    expect(await runGoogleAnchorImport(deps)).toEqual({
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
            makeTimedEvent({ id: "d1", iCalUID: "uid-dup" }),
            makeTimedEvent({ id: "n1", iCalUID: "uid-new", summary: "New" }),
          ]),
      },
      repo,
    );
    expect(await runGoogleAnchorImport(deps)).toEqual({
      ok: true,
      imported: 1,
      skipped: 1,
    });
  });

  it("mapper skip + dedup skip 合算 → kept 0 で source 作らず ok:true", async () => {
    const repo = createMemoryExternalAnchorRepository();
    await seedAnchorWithUid(repo, "uid-timed-1@google");
    const createSpy = vi.fn((b: CreateSourceWithAnchorsInput) =>
      repo.createSourceWithAnchors(USER_ID, b),
    );
    const logs: GoogleImportLogEvent[] = [];
    const deps = makeBaseDeps(
      {
        fetchAllEvents: async () =>
          fetchOk([
            makeTimedEvent({ id: "c1", iCalUID: "uid-cancel", status: "cancelled" }),
            makeTimedEvent(), // uid-timed-1@google = seeded → dedup
          ]),
        createSourceWithAnchors: createSpy,
        log: (e) => logs.push(e),
      },
      repo,
    );
    expect(await runGoogleAnchorImport(deps)).toEqual({
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
    expect(await runGoogleAnchorImport(deps)).toEqual({
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
    expect(await runGoogleAnchorImport(deps)).toEqual({
      ok: false,
      error: "予定の保存中にエラーが発生しました。",
    });
  });

  it("createSourceWithAnchors ok:false (anchor_invalid) → 保存に失敗 (+ persist_rejected log)", async () => {
    const logs: GoogleImportLogEvent[] = [];
    const deps = makeBaseDeps({
      createSourceWithAnchors: async () => ({
        ok: false,
        errors: [
          {
            kind: "anchor_invalid",
            index: 0,
            errors: [
              { field: "title", code: "required", message: "title is required" },
            ],
          },
        ],
      }),
      log: (e) => logs.push(e),
    });
    const r = await runGoogleAnchorImport(deps);
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
              {
                field: "source.sourceType",
                code: "invalid_format",
                message: "bad source",
              },
            ],
          },
        ],
      }),
    });
    const r = await runGoogleAnchorImport(deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/source 不正/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// runGoogleAnchorImport — success + bundle contract
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("runGoogleAnchorImport — success + bundle contract", () => {
  it("成功 → google_calendar bundle を渡し imported / import_success log", async () => {
    const repo = createMemoryExternalAnchorRepository();
    const createSpy = vi.fn((bundle: CreateSourceWithAnchorsInput) =>
      repo.createSourceWithAnchors(USER_ID, bundle),
    );
    const logs: GoogleImportLogEvent[] = [];
    const deps = makeBaseDeps(
      {
        fetchAllEvents: async () => fetchOk([makeTimedEvent()]),
        createSourceWithAnchors: createSpy,
        log: (e) => logs.push(e),
      },
      repo,
    );
    const r = await runGoogleAnchorImport(deps);
    expect(r).toEqual({ ok: true, imported: 1, skipped: 0 });

    expect(createSpy).toHaveBeenCalledTimes(1);
    const bundle = createSpy.mock.calls[0]![0];
    expect(bundle.source.sourceType).toBe("google_calendar");
    expect(bundle.source.rawRetention).toBe("discarded");
    expect(bundle.source.notes).toBe("Google カレンダーから取り込み");
    expect(bundle.anchors).toHaveLength(1);
    expect(bundle.anchors[0]?.sourceType).toBe("google_calendar");
    expect(bundle.anchors[0]?.externalUid).toBe("uid-timed-1@google");

    expect(logs.find((e) => e.kind === "import_success")).toMatchObject({
      kind: "import_success",
      imported: 1,
      skipped: 0,
    });
  });

  it("log 未指定でも throw しない (= default no-op path)", async () => {
    const r = await runGoogleAnchorImport(makeBaseDeps());
    expect(r.ok).toBe(true);
  });
});
