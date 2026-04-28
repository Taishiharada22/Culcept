/**
 * turnTrace — PII 配慮 + env gating 検証
 *
 * CEO 2026-04-28 PR #41a Layer 0:
 *   この trace module の **不変条件** を機械的に保証する。
 *   特に「raw 文字列 / 座標数値 / 名前を default で出さない」 が破れたら CI が落ちる。
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import {
  emitTurnTrace,
  eventToShapeSnapshot,
  buildVerboseExtension,
  shouldEmitTrace,
  isVerboseTraceEnabled,
  type TurnTraceSnapshot,
} from "@/lib/alter-morning/trace/turnTrace";
import {
  type Event,
  utteranceProvenance,
  inferredProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";

// ─── 共通 fixture ───────────────────────────────────────────────────────────

function mkEvent(overrides: Partial<Event>): Event {
  const base: Event = {
    event_id: "evt_x",
    turn_mode: "create",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: {
      startTime: null,
      timeHint: null,
      provenance: inferredProvenance(),
    },
    where: {
      place_ref: null,
      placeType: null,
      coordinates: null,
      provenance: inferredProvenance(),
    },
    what: {
      activity: "",
      activityCanonical: "",
      provenance: inferredProvenance(),
    },
    who: [],
    transport: null,
    certainty: "asserted",
    missing_semantic_critical: [],
    missing_solver_blockers: [],
  };
  return { ...base, ...overrides } as Event;
}

function baseSnapshot(): TurnTraceSnapshot {
  return {
    sessionId: "ms_test_001",
    turnIndex: 1,
    caller: "legacy_adapter",
    utteranceLength: 10,
    hasUtterance: true,
    currentEventCount: 1,
    priorEventCount: 0,
    mergedEventCount: 1,
    mergedEvents: [],
    primaryClarifyKind: null,
    primaryClarifyEventId: null,
    pendingClarifySlot: null,
    pendingClarifyKind: null,
    pendingClarifyEventId: null,
  };
}

// console.info を spy する
let consoleSpy: ReturnType<typeof vi.spyOn>;
const originalEnv = { ...process.env };

beforeEach(() => {
  consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  consoleSpy.mockRestore();
  process.env = { ...originalEnv };
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// shouldEmitTrace / isVerboseTraceEnabled — env gating
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("shouldEmitTrace — env gating", () => {
  it("VERCEL_ENV=preview → true", () => {
    process.env.VERCEL_ENV = "preview";
    expect(shouldEmitTrace()).toBe(true);
  });

  it("VERCEL_ENV=development → true", () => {
    process.env.VERCEL_ENV = "development";
    expect(shouldEmitTrace()).toBe(true);
  });

  it("VERCEL_ENV=production → false (本番では絶対 emit しない)", () => {
    process.env.VERCEL_ENV = "production";
    expect(shouldEmitTrace()).toBe(false);
  });

  it("VERCEL_ENV 未設定 + NODE_ENV=development → true (local dev)", () => {
    delete process.env.VERCEL_ENV;
    vi.stubEnv("NODE_ENV", "development");
    expect(shouldEmitTrace()).toBe(true);
    vi.unstubAllEnvs();
  });

  it("VERCEL_ENV 未設定 + NODE_ENV=test → false (test runner 静寂)", () => {
    delete process.env.VERCEL_ENV;
    vi.stubEnv("NODE_ENV", "test");
    expect(shouldEmitTrace()).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe("isVerboseTraceEnabled — 二重 gate", () => {
  it("env 許可 + ALTER_MORNING_TRACE_VERBOSE=true → true", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.ALTER_MORNING_TRACE_VERBOSE = "true";
    expect(isVerboseTraceEnabled()).toBe(true);
  });

  it("env 許可 + ALTER_MORNING_TRACE_VERBOSE 未設定 → false (default redact)", () => {
    process.env.VERCEL_ENV = "preview";
    delete process.env.ALTER_MORNING_TRACE_VERBOSE;
    expect(isVerboseTraceEnabled()).toBe(false);
  });

  it("env 拒否 (production) + ALTER_MORNING_TRACE_VERBOSE=true → false (env gate 優先)", () => {
    process.env.VERCEL_ENV = "production";
    process.env.ALTER_MORNING_TRACE_VERBOSE = "true";
    expect(isVerboseTraceEnabled()).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// eventToShapeSnapshot — PII redaction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("eventToShapeSnapshot — PII redaction", () => {
  it("[ROOT CAUSE 防止] place_ref 文字列が snapshot に含まれない", () => {
    const ev = mkEvent({
      where: {
        place_ref: "TSUTAYA 渋谷スクランブルスクエア店",
        placeType: "exact_proper_noun",
        coordinates: { lat: 35.6587, lng: 139.6997 },
        provenance: utteranceProvenance(["TSUTAYA"], "high"),
      },
    });
    const shape = eventToShapeSnapshot(ev);
    const json = JSON.stringify(shape);
    expect(json).not.toContain("TSUTAYA");
    expect(json).not.toContain("渋谷");
    // placeType (enum) は出る
    expect(shape.placeType).toBe("exact_proper_noun");
  });

  it("[ROOT CAUSE 防止] coordinates lat/lng の数値が snapshot に含まれない", () => {
    const ev = mkEvent({
      where: {
        place_ref: "x",
        placeType: null,
        coordinates: { lat: 35.6587, lng: 139.6997 },
        provenance: inferredProvenance(),
      },
    });
    const shape = eventToShapeSnapshot(ev);
    const json = JSON.stringify(shape);
    expect(json).not.toContain("35.6587");
    expect(json).not.toContain("139.6997");
    // hasCoordinates だけ true
    expect(shape.hasCoordinates).toBe(true);
  });

  it("[ROOT CAUSE 防止] who[] の名前が snapshot に含まれない (whoCount のみ)", () => {
    const ev = mkEvent({
      who: ["田中太郎", "佐藤花子"],
    });
    const shape = eventToShapeSnapshot(ev);
    const json = JSON.stringify(shape);
    expect(json).not.toContain("田中");
    expect(json).not.toContain("佐藤");
    expect(shape.whoCount).toBe(2);
  });

  it("activity 文字列が snapshot に含まれない (sharpness のみ)", () => {
    const ev = mkEvent({
      what: {
        activity: "デート",
        activityCanonical: "デート",
        provenance: utteranceProvenance(["デート"], "high"),
      },
    });
    const shape = eventToShapeSnapshot(ev);
    const json = JSON.stringify(shape);
    expect(json).not.toContain("デート");
  });

  it("transport 文字列が snapshot に含まれない (hasTransport のみ)", () => {
    const ev = mkEvent({ transport: "電車" });
    const shape = eventToShapeSnapshot(ev);
    const json = JSON.stringify(shape);
    expect(json).not.toContain("電車");
    expect(shape.hasTransport).toBe(true);
  });

  it("target_ref 文字列が snapshot に含まれない (target_ref_present boolean のみ)", () => {
    const ev = mkEvent({ target_ref: "朝の予定", turn_mode: "modify" });
    const shape = eventToShapeSnapshot(ev);
    const json = JSON.stringify(shape);
    expect(json).not.toContain("朝の予定");
    expect(shape.target_ref_present).toBe(true);
  });

  it("hasCoordinates: NaN → false (defensive)", () => {
    const ev = mkEvent({
      where: {
        place_ref: null,
        placeType: null,
        coordinates: { lat: NaN, lng: 139.0 },
        provenance: inferredProvenance(),
      },
    });
    expect(eventToShapeSnapshot(ev).hasCoordinates).toBe(false);
  });

  it("hasCoordinates: null → false", () => {
    const ev = mkEvent({
      where: {
        place_ref: null,
        placeType: null,
        coordinates: null,
        provenance: inferredProvenance(),
      },
    });
    expect(eventToShapeSnapshot(ev).hasCoordinates).toBe(false);
  });

  it("hasTransport: empty string → false", () => {
    expect(eventToShapeSnapshot(mkEvent({ transport: "" })).hasTransport).toBe(
      false,
    );
    expect(
      eventToShapeSnapshot(mkEvent({ transport: "   " })).hasTransport,
    ).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// emitTurnTrace — env gate + PII default redact
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("emitTurnTrace — production gate", () => {
  it("[CRITICAL] VERCEL_ENV=production では絶対 emit しない", () => {
    process.env.VERCEL_ENV = "production";
    process.env.ALTER_MORNING_TRACE_VERBOSE = "true"; // verbose flag を立てても block
    emitTurnTrace(baseSnapshot(), {
      utterance: "9時に渋谷のスタバ",
      mergedEventContent: [],
      pendingClarifyQuestion: null,
    });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("VERCEL_ENV=preview で emit される", () => {
    process.env.VERCEL_ENV = "preview";
    delete process.env.ALTER_MORNING_TRACE_VERBOSE;
    emitTurnTrace(baseSnapshot());
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  it("emit log の prefix が [alter-morning:trace]", () => {
    process.env.VERCEL_ENV = "preview";
    emitTurnTrace(baseSnapshot());
    const [tag] = consoleSpy.mock.calls[0];
    expect(tag).toBe("[alter-morning:trace]");
  });

  it("emit payload は valid JSON", () => {
    process.env.VERCEL_ENV = "preview";
    emitTurnTrace(baseSnapshot());
    const [, json] = consoleSpy.mock.calls[0] as [string, string];
    expect(() => JSON.parse(json as string)).not.toThrow();
  });
});

describe("emitTurnTrace — verbose mode 二重 gate", () => {
  it("[CRITICAL] verbose flag 無し → utterance content が log に含まれない (default redact)", () => {
    process.env.VERCEL_ENV = "preview";
    delete process.env.ALTER_MORNING_TRACE_VERBOSE;
    emitTurnTrace(baseSnapshot(), {
      utterance: "9時に渋谷のスタバ",
      mergedEventContent: [
        {
          event_id: "evt_1",
          placeRef: "TSUTAYA",
          activity: "コーヒー",
          startTime: "09:00",
          transport: "電車",
          whoNames: ["田中太郎"],
        },
      ],
      pendingClarifyQuestion: "1つ目の09:00のカフェはどのあたり？",
    });
    const [, json] = consoleSpy.mock.calls[0] as [string, string];
    // PII content が redact されている
    expect(json as string).not.toContain("9時に渋谷のスタバ");
    expect(json as string).not.toContain("TSUTAYA");
    expect(json as string).not.toContain("コーヒー");
    expect(json as string).not.toContain("田中");
    expect(json as string).not.toContain("どのあたり");
  });

  it("verbose flag 有り (preview) → content が含まれる", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.ALTER_MORNING_TRACE_VERBOSE = "true";
    emitTurnTrace(baseSnapshot(), {
      utterance: "9時に渋谷のスタバ",
      mergedEventContent: [],
      pendingClarifyQuestion: "test question",
    });
    const [, json] = consoleSpy.mock.calls[0] as [string, string];
    expect(json as string).toContain("9時に渋谷のスタバ");
    expect(json as string).toContain("test question");
  });

  it("verbose flag は production env を override しない", () => {
    process.env.VERCEL_ENV = "production";
    process.env.ALTER_MORNING_TRACE_VERBOSE = "true";
    emitTurnTrace(baseSnapshot(), {
      utterance: "secret",
      mergedEventContent: [],
      pendingClarifyQuestion: null,
    });
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});

describe("emitTurnTrace — fail-open for circular reference", () => {
  it("循環参照を含む snapshot で例外 throw しない (fail-open)", () => {
    process.env.VERCEL_ENV = "preview";
    const snap: TurnTraceSnapshot & { circular?: unknown } = baseSnapshot();
    snap.circular = snap; // 循環
    expect(() => emitTurnTrace(snap)).not.toThrow();
    // JSON.stringify は失敗するので emit されない（silent skip）
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildVerboseExtension — content 構築
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildVerboseExtension — content 構築", () => {
  it("utterance が 200 字を超えると trim される", () => {
    const longUtt = "あ".repeat(500);
    const ext = buildVerboseExtension({
      utterance: longUtt,
      mergedEvents: [],
      pendingClarify: null,
    });
    expect(ext.utterance.length).toBeLessThanOrEqual(200);
  });

  it("mergedEventContent が events と 1:1 で対応", () => {
    const events = [
      mkEvent({
        event_id: "evt_1",
        where: {
          place_ref: "TSUTAYA",
          placeType: "exact_proper_noun",
          coordinates: null,
          provenance: utteranceProvenance(["TSUTAYA"], "high"),
        },
        what: {
          activity: "コーヒー",
          activityCanonical: "カフェ",
          provenance: utteranceProvenance(["コーヒー"], "high"),
        },
        who: ["田中"],
        transport: "電車",
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["09:00"], "high"),
        },
      }),
    ];
    const ext = buildVerboseExtension({
      utterance: "test",
      mergedEvents: events,
      pendingClarify: null,
    });
    expect(ext.mergedEventContent).toHaveLength(1);
    expect(ext.mergedEventContent[0].event_id).toBe("evt_1");
    expect(ext.mergedEventContent[0].placeRef).toBe("TSUTAYA");
    expect(ext.mergedEventContent[0].activity).toBe("コーヒー");
    expect(ext.mergedEventContent[0].startTime).toBe("09:00");
    expect(ext.mergedEventContent[0].transport).toBe("電車");
    expect(ext.mergedEventContent[0].whoNames).toEqual(["田中"]);
  });

  it("pendingClarify 無し → pendingClarifyQuestion null", () => {
    const ext = buildVerboseExtension({
      utterance: "x",
      mergedEvents: [],
      pendingClarify: null,
    });
    expect(ext.pendingClarifyQuestion).toBeNull();
  });
});
