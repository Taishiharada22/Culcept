import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  parseMovementEventStore,
  setMovementEvent,
  getMovementEvent,
  applyMovementCaps,
  isCaptureAllowed,
  buildMovementEventFromDetection,
  recordMovementEvent,
  loadMovementEvent,
  EMPTY_MOVEMENT_EVENT_STORE,
  MOVEMENT_EVENT_KEY,
  MOVEMENT_EVENT_SCHEMA_VERSION,
  MAX_MOVEMENT_DAYS,
  MAX_MOVEMENT_LEGS_PER_DAY,
  type MovementEvent,
  type MovementEventStore,
} from "@/lib/plan/mobility/movementEventStore";
import type { DetectedMovement } from "@/lib/plan/mobility/movementEventDetector";

const EV: MovementEvent = {
  actualDepartureAt: "2026-06-08T00:05:00.000Z",
  actualArrivalAt: "2026-06-08T00:20:00.000Z",
  completedAt: "2026-06-08T00:21:00.000Z",
  actualDurationMin: 15,
  confidence: "high",
  source: "gps",
};

describe("parseMovementEventStore — fail-open / version / 既知 field のみ", () => {
  it("null → empty", () => {
    expect(parseMovementEventStore(null)).toEqual(EMPTY_MOVEMENT_EVENT_STORE);
  });
  it("壊れた JSON → empty", () => {
    expect(parseMovementEventStore("{not json")).toEqual(EMPTY_MOVEMENT_EVENT_STORE);
  });
  it("version 不一致 → empty", () => {
    expect(parseMovementEventStore(JSON.stringify({ version: 999, byDay: {} }))).toEqual(
      EMPTY_MOVEMENT_EVENT_STORE,
    );
  });
  it("正常 → round-trip", () => {
    const store: MovementEventStore = { version: MOVEMENT_EVENT_SCHEMA_VERSION, byDay: { "2026-06-08": { legA: EV } } };
    expect(parseMovementEventStore(JSON.stringify(store))).toEqual(store);
  });
  it("★raw 座標等の余計な field は drop（derived only 担保）", () => {
    const dirty = {
      version: MOVEMENT_EVENT_SCHEMA_VERSION,
      byDay: { "2026-06-08": { legA: { ...EV, lat: 35.68, lng: 139.76, rawPath: [[1, 2]] } } },
    };
    const parsed = parseMovementEventStore(JSON.stringify(dirty));
    const entry = parsed.byDay["2026-06-08"].legA as unknown as Record<string, unknown>;
    expect(entry.lat).toBeUndefined();
    expect(entry.lng).toBeUndefined();
    expect(entry.rawPath).toBeUndefined();
    expect(Object.keys(entry).sort()).toEqual(
      ["actualArrivalAt", "actualDepartureAt", "actualDurationMin", "completedAt", "confidence", "source"].sort(),
    );
  });
  it("不正 confidence/source の entry は drop", () => {
    const bad = {
      version: MOVEMENT_EVENT_SCHEMA_VERSION,
      byDay: { "2026-06-08": { legA: { ...EV, confidence: "wat" } } },
    };
    expect(parseMovementEventStore(JSON.stringify(bad)).byDay["2026-06-08"]).toBeUndefined();
  });
});

describe("setMovementEvent / getMovementEvent", () => {
  it("set → get", () => {
    const next = setMovementEvent(EMPTY_MOVEMENT_EVENT_STORE, "2026-06-08", "legA", EV);
    expect(getMovementEvent(next, "2026-06-08", "legA")).toEqual(EV);
  });
  it("同 day/leg は上書き（重複しない）", () => {
    let st = setMovementEvent(EMPTY_MOVEMENT_EVENT_STORE, "2026-06-08", "legA", EV);
    const ev2 = { ...EV, source: "manual" as const, actualDurationMin: 20 };
    st = setMovementEvent(st, "2026-06-08", "legA", ev2);
    expect(getMovementEvent(st, "2026-06-08", "legA")).toEqual(ev2);
    expect(Object.keys(st.byDay["2026-06-08"])).toHaveLength(1);
  });
  it("不正 day/leg は no-op", () => {
    expect(setMovementEvent(EMPTY_MOVEMENT_EVENT_STORE, "bad-day", "legA", EV)).toEqual(EMPTY_MOVEMENT_EVENT_STORE);
    expect(setMovementEvent(EMPTY_MOVEMENT_EVENT_STORE, "2026-06-08", "", EV)).toEqual(EMPTY_MOVEMENT_EVENT_STORE);
  });
});

describe("applyMovementCaps", () => {
  it("MAX_MOVEMENT_DAYS を超える古い日は落とす（新しい方を残す）", () => {
    const byDay: Record<string, Record<string, MovementEvent>> = {};
    for (let i = 0; i < MAX_MOVEMENT_DAYS + 5; i++) {
      const day = `2026-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`;
      byDay[day] = { legA: EV };
    }
    const capped = applyMovementCaps({ version: MOVEMENT_EVENT_SCHEMA_VERSION, byDay });
    expect(Object.keys(capped.byDay)).toHaveLength(MAX_MOVEMENT_DAYS);
  });
  it("1 日 MAX_MOVEMENT_LEGS_PER_DAY を超える leg は落とす", () => {
    const legs: Record<string, MovementEvent> = {};
    for (let i = 0; i < MAX_MOVEMENT_LEGS_PER_DAY + 10; i++) legs[`leg${i}`] = EV;
    const capped = applyMovementCaps({ version: MOVEMENT_EVENT_SCHEMA_VERSION, byDay: { "2026-06-08": legs } });
    expect(Object.keys(capped.byDay["2026-06-08"])).toHaveLength(MAX_MOVEMENT_LEGS_PER_DAY);
  });
});

describe("isCaptureAllowed — ★sensitive blackout / opt-in gate", () => {
  it("opt-in 許可 ∧ 非 sensitive → true", () => {
    expect(isCaptureAllowed({ optInGranted: true, sensitive: false })).toBe(true);
  });
  it("opt-in 未許可 → false", () => {
    expect(isCaptureAllowed({ optInGranted: false, sensitive: false })).toBe(false);
  });
  it("sensitive → false（許可済でも記録しない）", () => {
    expect(isCaptureAllowed({ optInGranted: true, sensitive: true })).toBe(false);
  });
});

describe("buildMovementEventFromDetection", () => {
  it("epoch ms → ISO・derived を保持", () => {
    const detected: DetectedMovement = {
      actualDepartureAtMs: Date.parse("2026-06-08T00:05:00.000Z"),
      actualArrivalAtMs: Date.parse("2026-06-08T00:20:00.000Z"),
      actualDurationMin: 15,
      confidence: "high",
      source: "gps",
    };
    const ev = buildMovementEventFromDetection(detected, Date.parse("2026-06-08T00:21:00.000Z"));
    expect(ev).toEqual(EV);
  });
  it("ms が null → ISO も null", () => {
    const detected: DetectedMovement = {
      actualDepartureAtMs: null,
      actualArrivalAtMs: null,
      actualDurationMin: null,
      confidence: "low",
      source: "gps",
    };
    const ev = buildMovementEventFromDetection(detected, Date.parse("2026-06-08T00:21:00.000Z"));
    expect(ev.actualDepartureAt).toBeNull();
    expect(ev.actualArrivalAt).toBeNull();
    expect(ev.actualDurationMin).toBeNull();
    expect(ev.completedAt).toBe("2026-06-08T00:21:00.000Z");
  });
});

describe("recordMovementEvent / loadMovementEvent — gate 実効（localStorage mock）", () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(),
      key: (i: number) => Array.from(m.keys())[i] ?? null,
      get length() {
        return m.size;
      },
    } as Storage;
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it("許可 ∧ 非 sensitive → 保存され load できる", () => {
    recordMovementEvent("2026-06-08", "legA", EV, { optInGranted: true, sensitive: false });
    expect(loadMovementEvent("2026-06-08", "legA")).toEqual(EV);
  });
  it("★opt-in 未許可 → 記録しない（load は null）", () => {
    recordMovementEvent("2026-06-08", "legA", EV, { optInGranted: false, sensitive: false });
    expect(loadMovementEvent("2026-06-08", "legA")).toBeNull();
    expect((globalThis as { localStorage?: Storage }).localStorage!.getItem(MOVEMENT_EVENT_KEY)).toBeNull();
  });
  it("★sensitive → 記録しない（load は null）", () => {
    recordMovementEvent("2026-06-08", "legA", EV, { optInGranted: true, sensitive: true });
    expect(loadMovementEvent("2026-06-08", "legA")).toBeNull();
  });
});
