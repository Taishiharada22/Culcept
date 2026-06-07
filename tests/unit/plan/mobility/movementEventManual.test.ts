import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  parseMovementEventStore,
  buildMovementEventManual,
  removeMovementEvent,
  setMovementEvent,
  recordMovementEvent,
  loadMovementEvent,
  deleteMovementEvent,
  EMPTY_MOVEMENT_EVENT_STORE,
  MOVEMENT_EVENT_SCHEMA_VERSION,
  type MovementEvent,
  type MovementEventStore,
} from "@/lib/plan/mobility/movementEventStore";

// 旧 event（A1-6 拡張前・mode/odKey/estimateMin 無し）
const OLD_EVENT: MovementEvent = {
  actualDepartureAt: null,
  actualArrivalAt: null,
  completedAt: "2026-06-08T00:21:00.000Z",
  actualDurationMin: 30,
  confidence: "high",
  source: "manual",
};

describe("★schema 後方互換（additive 拡張）", () => {
  it("旧 event（mode/odKey/estimateMin 無し）はそのまま valid に parse", () => {
    const store: MovementEventStore = {
      version: MOVEMENT_EVENT_SCHEMA_VERSION,
      byDay: { "2026-06-08": { legA: OLD_EVENT } },
    };
    const parsed = parseMovementEventStore(JSON.stringify(store));
    expect(parsed.byDay["2026-06-08"].legA).toEqual(OLD_EVENT);
  });
  it("新 event（mode/odKey/estimateMin 付き）は round-trip", () => {
    const ev: MovementEvent = { ...OLD_EVENT, mode: "train", odKey: "home->office", estimateMin: 25 };
    const store: MovementEventStore = { version: MOVEMENT_EVENT_SCHEMA_VERSION, byDay: { "2026-06-08": { legA: ev } } };
    expect(parseMovementEventStore(JSON.stringify(store)).byDay["2026-06-08"].legA).toEqual(ev);
  });
  it("不正な additive（mode 不正）の event は drop", () => {
    const dirty = {
      version: MOVEMENT_EVENT_SCHEMA_VERSION,
      byDay: { "2026-06-08": { legA: { ...OLD_EVENT, mode: "bogus" } } },
    };
    expect(parseMovementEventStore(JSON.stringify(dirty)).byDay["2026-06-08"]).toBeUndefined();
  });
});

describe("buildMovementEventManual", () => {
  it("有効な duration → source=manual / confidence=high / dep,arr=null / meta 反映", () => {
    const ev = buildMovementEventManual({
      actualDurationMin: 35,
      completedAtMs: Date.parse("2026-06-08T00:21:00.000Z"),
      meta: { mode: "train", odKey: "home->office", estimateMin: 28 },
    });
    expect(ev).toEqual({
      actualDepartureAt: null,
      actualArrivalAt: null,
      completedAt: "2026-06-08T00:21:00.000Z",
      actualDurationMin: 35,
      confidence: "high",
      source: "manual",
      mode: "train",
      odKey: "home->office",
      estimateMin: 28,
    });
  });
  it("負/NaN の duration → null（捏造しない）", () => {
    expect(buildMovementEventManual({ actualDurationMin: -5, completedAtMs: 0 })).toBeNull();
    expect(buildMovementEventManual({ actualDurationMin: Number.NaN, completedAtMs: 0 })).toBeNull();
  });
  it("meta 無しでも作れる（additive 省略）", () => {
    const ev = buildMovementEventManual({ actualDurationMin: 20, completedAtMs: 0 });
    expect(ev?.source).toBe("manual");
    expect(ev?.mode).toBeUndefined();
  });
});

describe("removeMovementEvent（pure・可逆）", () => {
  const base = setMovementEvent(
    setMovementEvent(EMPTY_MOVEMENT_EVENT_STORE, "2026-06-08", "legA", OLD_EVENT),
    "2026-06-08",
    "legB",
    OLD_EVENT,
  );
  it("1 leg だけ削除（他は残る）", () => {
    const r = removeMovementEvent(base, "2026-06-08", "legA");
    expect(r.byDay["2026-06-08"].legA).toBeUndefined();
    expect(r.byDay["2026-06-08"].legB).toEqual(OLD_EVENT);
  });
  it("day の最後の leg を削除すると day ごと消える", () => {
    const one = setMovementEvent(EMPTY_MOVEMENT_EVENT_STORE, "2026-06-08", "legA", OLD_EVENT);
    expect(removeMovementEvent(one, "2026-06-08", "legA").byDay["2026-06-08"]).toBeUndefined();
  });
  it("存在しない leg は no-op（同一参照）", () => {
    expect(removeMovementEvent(base, "2026-06-08", "nope")).toBe(base);
  });
});

describe("record→delete round-trip（localStorage mock）", () => {
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

  it("manual event を記録 → load → delete → null", () => {
    const ev = buildMovementEventManual({ actualDurationMin: 35, completedAtMs: 0, meta: { mode: "train", odKey: "x__y", estimateMin: 30 } })!;
    recordMovementEvent("2026-06-08", "legA", ev, { optInGranted: true, sensitive: false });
    expect(loadMovementEvent("2026-06-08", "legA")?.actualDurationMin).toBe(35);
    deleteMovementEvent("2026-06-08", "legA");
    expect(loadMovementEvent("2026-06-08", "legA")).toBeNull();
  });
});
