// tests/unit/plan/postVisit/postVisitContext.test.ts
// 評価OS Stage 4-A: context-tagged observation foundation の検証。
//   bucket helpers / redaction(sanitizeContextSnapshot) / 後方互換 / anchor→snapshot / exact 値非保存 /
//   observation への additive 付与 / store の whitelist 永続化。
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  timeOfDayBucketFromHour,
  dayTypeBucketFromDow,
  gapBucketFromMinutes,
  companionBucketFromCount,
  locationCategoryBucket,
  sanitizeContextSnapshot,
  isPostVisitContextSnapshot,
  PERSISTED_CONTEXT_KEYS,
  type PostVisitContextSnapshot,
} from "@/lib/plan/postVisit/postVisitContext";
import {
  buildPostVisitObservation,
  hasContextSnapshot,
  PERSISTED_OBSERVATION_KEYS,
  type PostVisitObservation,
} from "@/lib/plan/postVisit/postVisitObservation";
import { buildContextSnapshotFromAnchor, gapMinutesToNextAnchor } from "@/lib/plan/postVisit/postVisitAnchorContext";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";

afterEach(() => vi.unstubAllGlobals());

describe("bucket helpers — coarse 化", () => {
  it("★timeOfDay: 時刻→bucket / null→null", () => {
    expect(timeOfDayBucketFromHour(7)).toBe("early_morning");
    expect(timeOfDayBucketFromHour(12)).toBe("midday");
    expect(timeOfDayBucketFromHour(20)).toBe("evening");
    expect(timeOfDayBucketFromHour(2)).toBe("night");
    expect(timeOfDayBucketFromHour(null)).toBeNull();
  });
  it("★dayType: 平日/週末", () => {
    expect(dayTypeBucketFromDow(0)).toBe("weekend"); // 日
    expect(dayTypeBucketFromDow(6)).toBe("weekend"); // 土
    expect(dayTypeBucketFromDow(3)).toBe("weekday");
    expect(dayTypeBucketFromDow(null)).toBeNull();
  });
  it("★gap: exact 分→bucket・null→none（exact は捨てる）", () => {
    expect(gapBucketFromMinutes(null)).toBe("none");
    expect(gapBucketFromMinutes(20)).toBe("under_30");
    expect(gapBucketFromMinutes(40)).toBe("30_60");
    expect(gapBucketFromMinutes(90)).toBe("60_120");
    expect(gapBucketFromMinutes(200)).toBe("over_120");
    expect(gapBucketFromMinutes(-5)).toBe("under_30"); // 負は0扱い
  });
  it("★companion: 有無のみ（人数・名前は持たない）", () => {
    expect(companionBucketFromCount(0)).toBe("solo");
    expect(companionBucketFromCount(null)).toBe("solo");
    expect(companionBucketFromCount(2)).toBe("with_someone");
  });
  it("★locationCategory: 既知はそのまま・未知は unknown・null は null", () => {
    expect(locationCategoryBucket("cafe")).toBe("cafe");
    expect(locationCategoryBucket("banana")).toBe("unknown");
    expect(locationCategoryBucket(null)).toBeNull();
  });
});

describe("sanitizeContextSnapshot — redaction firewall", () => {
  it("★sourceSurface 不正なら snapshot 自体を捨てる（null）", () => {
    expect(sanitizeContextSnapshot({ sourceSurface: "evil" })).toBeNull();
    expect(sanitizeContextSnapshot(null)).toBeNull();
    expect(sanitizeContextSnapshot("x")).toBeNull();
  });
  it("★未知/自由値 field は null に落とす（PII・自由値を残さない）", () => {
    const s = sanitizeContextSnapshot({
      sourceSurface: "calendar_past_anchor",
      timeOfDay: "midday",
      dayType: "weekday",
      gapBucket: "EVIL_FREEFORM",
      weatherKind: 35.6, // 数値=GPS 風 → 落ちる
      companion: "with_someone",
      locationCategory: "cafe",
      // 禁止キーが混入しても whitelist 外なので残らない
      address: "東京都江東区",
      lat: 35.6, lng: 139.8, notes: "原文メモ",
    } as unknown);
    expect(s).not.toBeNull();
    expect(s!.gapBucket).toBeNull(); // 自由値は落ちる
    expect(s!.weatherKind).toBeNull(); // 数値は落ちる
    expect(s!.timeOfDay).toBe("midday");
    expect(s!.companion).toBe("with_someone");
    // ★whitelist 外キーは出力に存在しない
    expect(Object.keys(s!).every((k) => (PERSISTED_CONTEXT_KEYS as readonly string[]).includes(k))).toBe(true);
    expect((s as unknown as Record<string, unknown>).address).toBeUndefined();
    expect((s as unknown as Record<string, unknown>).lat).toBeUndefined();
    expect((s as unknown as Record<string, unknown>).notes).toBeUndefined();
  });
  it("★isPostVisitContextSnapshot", () => {
    expect(isPostVisitContextSnapshot({ sourceSurface: "location_detail" })).toBe(true);
    expect(isPostVisitContextSnapshot({})).toBe(false);
  });
});

describe("observation への additive 付与 + 後方互換", () => {
  const base = { placeDescriptor: "ブルーボトル 江東区", lens: "focus_work" as const, trigger: "past_plan" as const, response: "keep" as const, at: 1 };
  it("★contextSnapshot 無し → 既存通り（field 不在・後方互換）", () => {
    const o = buildPostVisitObservation(base);
    expect(o.contextSnapshot).toBeUndefined();
    expect(hasContextSnapshot(o)).toBe(false);
    expect(o.placeKey).toBeTruthy();
  });
  it("★contextSnapshot あり → redact して付与", () => {
    const o = buildPostVisitObservation({
      ...base,
      contextSnapshot: { v: 1, sourceSurface: "calendar_past_anchor", timeOfDay: "midday", dayType: "weekday", gapBucket: "under_30", weatherKind: null, fatigue: null, companion: "solo", mobilityLoad: null, locationCategory: "cafe" },
    });
    expect(hasContextSnapshot(o)).toBe(true);
    expect(o.contextSnapshot!.sourceSurface).toBe("calendar_past_anchor");
    expect(o.contextSnapshot!.gapBucket).toBe("under_30");
  });
  it("★不正 contextSnapshot は落ちる（観測自体は壊れない）", () => {
    const o = buildPostVisitObservation({ ...base, contextSnapshot: { sourceSurface: "evil" } as unknown as PostVisitContextSnapshot });
    expect(o.contextSnapshot).toBeUndefined();
    expect(o.placeKey).toBeTruthy(); // 観測は生きる
  });
  it("★PERSISTED_OBSERVATION_KEYS に contextSnapshot が含まれる", () => {
    expect((PERSISTED_OBSERVATION_KEYS as readonly string[]).includes("contextSnapshot")).toBe(true);
  });
});

describe("buildContextSnapshotFromAnchor — anchor→coarse snapshot", () => {
  function oneOff(over: Partial<ExternalAnchor> = {}): ExternalAnchor {
    return { id: "a1", userId: "u", sourceId: "s", confirmedAt: "2026-06-20T00:00:00Z", anchorKind: "one_off", title: "ランチ", date: "2026-06-19", startTime: "12:00", endTime: "13:00", rigidity: "soft", locationText: "ブルーボトル · 東京都江東区", locationCategory: "cafe", ...over } as ExternalAnchor;
  }
  it("★time/dayType/companion/locationCategory を coarse 化・天気/疲労/負荷は null（捏造しない）", () => {
    const s = buildContextSnapshotFromAnchor(oneOff({ companions: ["田中"] }), 25);
    expect(s.sourceSurface).toBe("calendar_past_anchor");
    expect(s.timeOfDay).toBe("midday"); // 12:00
    expect(s.dayType).toBe("weekday"); // 2026-06-19=金
    expect(s.gapBucket).toBe("under_30"); // 25分
    expect(s.companion).toBe("with_someone"); // companions 有→有無のみ(名前は保存されない)
    expect(s.locationCategory).toBe("cafe");
    expect(s.weatherKind).toBeNull();
    expect(s.fatigue).toBeNull();
    expect(s.mobilityLoad).toBeNull();
    // ★相手名「田中」は snapshot のどこにも無い
    expect(JSON.stringify(s)).not.toContain("田中");
    // ★住所原文「江東区」も snapshot に無い
    expect(JSON.stringify(s)).not.toContain("江東区");
  });
  it("★gap=次予定なし → none", () => {
    expect(buildContextSnapshotFromAnchor(oneOff(), null).gapBucket).toBe("none");
  });
  it("★gapMinutesToNextAnchor: 同日の次予定開始までの分", () => {
    const a = oneOff({ id: "a", startTime: "12:00", endTime: "13:00" });
    const b = oneOff({ id: "b", startTime: "13:30", endTime: "14:00" });
    expect(gapMinutesToNextAnchor([a, b], a)).toBe(30); // 13:00→13:30
    expect(gapMinutesToNextAnchor([a, b], b)).toBeNull(); // 後続なし
  });
});

describe("store redaction firewall: contextSnapshot を whitelist 経由で保持（pure・flag 非依存）", () => {
  it("★redactForPersistence: contextSnapshot 保持・禁止キー(住所/GPS/notes)混入なし", async () => {
    const { redactForPersistence } = await import("@/lib/plan/postVisit/postVisitStore");
    const dirty = {
      v: 1, placeKey: "pabc123", lens: "focus_work", trigger: "past_plan", response: "keep", reasonChips: [], dwellSignal: null, at: 1,
      contextSnapshot: { v: 1, sourceSurface: "calendar_past_anchor", timeOfDay: "midday", dayType: "weekday", gapBucket: "30_60", weatherKind: null, fatigue: null, companion: "solo", mobilityLoad: null, locationCategory: "cafe" },
      // ★禁止キーが混入してもこれらは出力に残らない
      address: "東京都江東区", lat: 35.6, lng: 139.8, notes: "原文メモ", companionsRaw: "田中",
    };
    const clean = redactForPersistence(dirty);
    expect(clean).not.toBeNull();
    expect(clean!.contextSnapshot?.gapBucket).toBe("30_60");
    expect(clean!.trigger).toBe("past_plan"); // ★past_plan も TRIGGER_SET に存在
    const json = JSON.stringify(clean);
    expect(json).not.toContain("江東区");
    expect(json).not.toContain("田中");
    expect((clean as unknown as Record<string, unknown>).address).toBeUndefined();
    expect((clean as unknown as Record<string, unknown>).lat).toBeUndefined();
  });
  it("★不正 contextSnapshot は落ちる（観測は生きる）", async () => {
    const { redactForPersistence } = await import("@/lib/plan/postVisit/postVisitStore");
    const clean = redactForPersistence({ v: 1, placeKey: "p1", lens: "focus_work", trigger: "past_plan", response: "keep", reasonChips: [], dwellSignal: null, at: 1, contextSnapshot: { sourceSurface: "evil" } });
    expect(clean).not.toBeNull();
    expect(clean!.contextSnapshot).toBeUndefined();
  });
  it("★既存観測(contextSnapshot 無し)も読める（後方互換）", async () => {
    const { redactForPersistence } = await import("@/lib/plan/postVisit/postVisitStore");
    const legacy = redactForPersistence({ v: 1, placeKey: "p1", lens: "focus_work", trigger: "lens_proposed", response: "keep", reasonChips: [], dwellSignal: null, at: 1 });
    expect(legacy).not.toBeNull();
    expect(legacy!.contextSnapshot).toBeUndefined();
  });
});
