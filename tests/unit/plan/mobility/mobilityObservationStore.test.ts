import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  MOBILITY_OBSERVATION_KEY,
  MOBILITY_OBSERVATION_SCHEMA_VERSION,
  EMPTY_OBSERVATION_STORE,
  MAX_OBSERVATION_DAYS,
  MAX_OBSERVATION_LEGS_PER_DAY,
  normalizeLocationText,
  parseHour,
  toTimeband,
  toWeekdayBucket,
  buildObservation,
  parseObservationStore,
  applyObservationCaps,
  setObservation,
  getObservation,
  saveMobilityObservation,
  loadMobilityObservation,
  clearMobilityObservations,
  type MobilityObservation,
  type MobilityObservationStore,
} from "@/lib/plan/mobility/mobilityObservationStore";
import { SELECTED_MODE_STORE_KEY } from "@/lib/plan/map/selectedModeStore";
import { HYPOTHESIS_FEEDBACK_KEY } from "@/lib/plan/mobility/hypothesisFeedbackStore";
import type { RouteTransportMode } from "@/lib/plan/map/routeMode";

// --- mock localStorage（環境非依存で強制注入）---
class MemStorage {
  private m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  clear(): void {
    this.m.clear();
  }
  getItem(k: string): string | null {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  key(i: number): string | null {
    return Array.from(this.m.keys())[i] ?? null;
  }
}
beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemStorage(),
    writable: true,
    configurable: true,
  });
});

function obsInput(p: Partial<Parameters<typeof buildObservation>[0]> = {}) {
  return {
    mode: "train" as unknown,
    dayISO: "2026-06-08", // Monday = weekday
    toStartTime: "09:00", // morning
    originText: "自宅",
    destText: "会社",
    originSensitive: false,
    destSensitive: false,
    readOnly: false,
    ...p,
  };
}
function store(byDay: Record<string, Record<string, MobilityObservation>>): MobilityObservationStore {
  return { version: MOBILITY_OBSERVATION_SCHEMA_VERSION, byDay };
}
const OBS: MobilityObservation = {
  mode: "train",
  timeband: "morning",
  weekday: "weekday",
  originKey: "自宅",
  destKey: "会社",
  privacyClass: "normal",
};

describe("mobilityObservationStore (L1-a・GPT 必須 20 ケース)", () => {
  // 1
  it("1. recurring leg: 同 legKey を複数日に観測 → 全日蓄積", () => {
    let s = EMPTY_OBSERVATION_STORE;
    for (const d of ["2026-06-01", "2026-06-08", "2026-06-15"]) s = setObservation(s, d, "home__work", OBS);
    expect(Object.keys(s.byDay)).toHaveLength(3);
    expect(getObservation(s, "2026-06-08", "home__work")).toEqual(OBS);
  });

  // 2
  it("2. one-off leg: 単日のみ観測 → 1 件", () => {
    const s = setObservation(EMPTY_OBSERVATION_STORE, "2026-06-08", "a__oneoff", OBS);
    expect(Object.keys(s.byDay)).toHaveLength(1);
    expect(Object.keys(s.byDay["2026-06-08"])).toHaveLength(1);
  });

  // 3
  it("3. locationText あり → originKey/destKey が normalized で入る", () => {
    const o = buildObservation(obsInput({ originText: "自宅", destText: "会社" }))!;
    expect(o.originKey).toBe("自宅");
    expect(o.destKey).toBe("会社");
    expect(o.privacyClass).toBe("normal");
  });

  // 4
  it("4. locationText 空/null → place key は null", () => {
    expect(buildObservation(obsInput({ originText: null, destText: "" }))!.originKey).toBeNull();
    expect(buildObservation(obsInput({ originText: null, destText: "" }))!.destKey).toBeNull();
    expect(buildObservation(obsInput({ originText: "   " }))!.originKey).toBeNull();
  });

  // 5
  it("5. 表記揺れ正規化（全角空白/大小/連続空白/NFKC）→ 同一 key", () => {
    expect(normalizeLocationText("　自宅　")).toBe("自宅"); // 全角空白
    expect(normalizeLocationText("自宅 ")).toBe("自宅");
    expect(normalizeLocationText("Shibuya  Cafe")).toBe("shibuya cafe");
    expect(normalizeLocationText("ＡＢＣ")).toBe("abc"); // 全角→NFKC→lower
    expect(normalizeLocationText("")).toBeNull();
    expect(normalizeLocationText(null)).toBeNull();
  });

  // 6
  it("6. origin だけ sensitive → 両 place key redact・privacyClass redacted", () => {
    const o = buildObservation(obsInput({ originSensitive: true, destSensitive: false }))!;
    expect(o.originKey).toBeNull();
    expect(o.destKey).toBeNull();
    expect(o.privacyClass).toBe("redacted");
    expect(o.mode).toBe("train"); // mode/timeband/weekday は保持
    expect(o.timeband).toBe("morning");
  });

  // 7
  it("7. dest だけ sensitive → 両 place key redact（非場所フィールドは保持）", () => {
    const o = buildObservation(obsInput({ originSensitive: false, destSensitive: true }))!;
    expect(o.originKey).toBeNull();
    expect(o.destKey).toBeNull();
    expect(o.privacyClass).toBe("redacted");
    expect(o.mode).toBe("train");
    expect(o.timeband).toBe("morning");
    expect(o.weekday).toBe("weekday");
  });

  // 8
  it("8. 両方 sensitive → redact（非場所フィールドは保持）", () => {
    const o = buildObservation(obsInput({ originSensitive: true, destSensitive: true }))!;
    expect(o.privacyClass).toBe("redacted");
    expect(o.originKey).toBeNull();
    expect(o.destKey).toBeNull();
    expect(o.mode).toBe("train");
    expect(o.timeband).toBe("morning");
    expect(o.weekday).toBe("weekday");
  });

  // 9
  it("9. unknown mode（valid な RouteTransportMode）→ 記録される", () => {
    const o = buildObservation(obsInput({ mode: "unknown" }));
    expect(o).not.toBeNull();
    expect(o!.mode).toBe("unknown");
  });

  // 10
  it("10. invalid mode（RouteTransportMode でない）→ 記録しない(null)", () => {
    expect(buildObservation(obsInput({ mode: "flying-car" }))).toBeNull();
    expect(buildObservation(obsInput({ mode: 42 }))).toBeNull();
    expect(buildObservation(obsInput({ mode: null }))).toBeNull();
  });

  // 11
  it("11. weekday 日付 → weekday", () => {
    expect(toWeekdayBucket("2026-06-05")).toBe("weekday"); // Fri
    expect(toWeekdayBucket("2026-06-08")).toBe("weekday"); // Mon
    expect(buildObservation(obsInput({ dayISO: "2026-06-05" }))!.weekday).toBe("weekday");
  });

  // 12
  it("12. weekend 日付 → weekend", () => {
    expect(toWeekdayBucket("2026-06-06")).toBe("weekend"); // Sat
    expect(toWeekdayBucket("2026-06-07")).toBe("weekend"); // Sun
    expect(buildObservation(obsInput({ dayISO: "2026-06-07" }))!.weekday).toBe("weekend");
  });

  // 13
  it("13. 朝/昼/夕/夜 の 4 分割（内部境界含む regression ガード）", () => {
    expect(toTimeband("08:00")).toBe("morning");
    expect(toTimeband("13:00")).toBe("afternoon");
    expect(toTimeband("19:00")).toBe("evening");
    expect(toTimeband("23:00")).toBe("night");
    expect(toTimeband("2026-06-05T09:30:00")).toBe("morning"); // ISO 形式
    // 内部境界（フリップ regression を捕捉）
    expect(toTimeband("10:00")).toBe("morning");
    expect(toTimeband("11:00")).toBe("afternoon");
    expect(toTimeband("16:00")).toBe("afternoon");
    expect(toTimeband("17:00")).toBe("evening");
    expect(toTimeband("21:00")).toBe("evening");
    expect(toTimeband("22:00")).toBe("night");
  });

  // 14
  it("14. 深夜帯 → night", () => {
    expect(toTimeband("00:30")).toBe("night");
    expect(toTimeband("02:00")).toBe("night");
    expect(toTimeband("04:59")).toBe("night");
    expect(toTimeband("05:00")).toBe("morning"); // 境界
    expect(parseHour("bogus")).toBeNull();
    expect(toTimeband("bogus")).toBe("night"); // 不明は保守的に night
  });

  // 15
  it("15. store 破損 → fail-open(空)", () => {
    expect(parseObservationStore("not json")).toEqual(EMPTY_OBSERVATION_STORE);
    expect(parseObservationStore(JSON.stringify({ version: 999, byDay: {} }))).toEqual(EMPTY_OBSERVATION_STORE);
    expect(parseObservationStore(null)).toEqual(EMPTY_OBSERVATION_STORE);
    // 不正 entry は除外
    const bad = JSON.stringify({
      version: MOBILITY_OBSERVATION_SCHEMA_VERSION,
      byDay: { "2026-06-01": { a__b: { mode: "train", timeband: "bogus", weekday: "weekday", originKey: null, destKey: null, privacyClass: "normal" } } },
    });
    expect(parseObservationStore(bad).byDay["2026-06-01"]).toBeUndefined();
  });

  // 16
  it("16. caps: 60 日 / 100 leg 相当で切り詰め", () => {
    // 61 日 → 最新 60 日のみ
    const byDay: Record<string, Record<string, MobilityObservation>> = {};
    for (let i = 1; i <= 61; i += 1) {
      const day = `2026-${String(Math.floor((i - 1) / 28) + 1).padStart(2, "0")}-${String(((i - 1) % 28) + 1).padStart(2, "0")}`;
      byDay[day] = { "a__b": OBS };
    }
    const capped = applyObservationCaps(store(byDay));
    expect(Object.keys(byDay).length).toBe(61); // 61 unique days 生成確認
    expect(Object.keys(capped.byDay).length).toBe(MAX_OBSERVATION_DAYS); // 正確に 60 日
    expect(capped.byDay["2026-01-01"]).toBeUndefined(); // 最古日が drop された
    // 101 leg → 100 leg
    const legs: Record<string, MobilityObservation> = {};
    for (let i = 0; i < 101; i += 1) legs[`leg_${i}__x`] = OBS;
    const capped2 = applyObservationCaps(store({ "2026-06-01": legs }));
    expect(Object.keys(capped2.byDay["2026-06-01"]).length).toBe(MAX_OBSERVATION_LEGS_PER_DAY);
  });

  // 17
  it("17. 同日同 leg 再選択は最後の 1 件に上書き", () => {
    let s = setObservation(EMPTY_OBSERVATION_STORE, "2026-06-08", "home__work", { ...OBS, mode: "train" });
    s = setObservation(s, "2026-06-08", "home__work", { ...OBS, mode: "walk" });
    expect(getObservation(s, "2026-06-08", "home__work")!.mode).toBe("walk");
    expect(Object.keys(s.byDay["2026-06-08"])).toHaveLength(1);
  });

  // 18
  it("18. selectedModeStore / hypothesisFeedbackStore を壊さない（別 key・他 store 不変）", () => {
    // key が全て異なる
    expect(MOBILITY_OBSERVATION_KEY).not.toBe(SELECTED_MODE_STORE_KEY);
    expect(MOBILITY_OBSERVATION_KEY).not.toBe(HYPOTHESIS_FEEDBACK_KEY);
    // 他 store の値を置いてから観測保存 → 他 store は不変
    localStorage.setItem(SELECTED_MODE_STORE_KEY, '{"version":1,"byDay":{"2026-06-08":{"home__work":"train"}}}');
    localStorage.setItem(HYPOTHESIS_FEEDBACK_KEY, '{"version":1,"byDay":{}}');
    const selBefore = localStorage.getItem(SELECTED_MODE_STORE_KEY);
    const fbBefore = localStorage.getItem(HYPOTHESIS_FEEDBACK_KEY);
    saveMobilityObservation("2026-06-08", "home__work", OBS);
    expect(localStorage.getItem(SELECTED_MODE_STORE_KEY)).toBe(selBefore);
    expect(localStorage.getItem(HYPOTHESIS_FEEDBACK_KEY)).toBe(fbBefore);
    // 自 store には入る
    expect(loadMobilityObservation("2026-06-08", "home__work")).toEqual(OBS);
  });

  // 19
  it("19. Google API / DB / fetch を呼ばない", () => {
    const fetchSpy = vi.fn();
    Object.defineProperty(globalThis, "fetch", { value: fetchSpy, writable: true, configurable: true });
    saveMobilityObservation("2026-06-08", "home__work", OBS);
    loadMobilityObservation("2026-06-08", "home__work");
    buildObservation(obsInput());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // 補助: buildObservation readOnly は記録しない
  it("readOnly(過去/done) leg は記録しない(null)", () => {
    expect(buildObservation(obsInput({ readOnly: true }))).toBeNull();
  });

  // 補助: round-trip
  it("round-trip: save→load で復元", () => {
    saveMobilityObservation("2026-06-08", "home__work", OBS);
    expect(loadMobilityObservation("2026-06-08", "home__work")).toEqual(OBS);
  });
});

// ★A2-10: weatherKind capture（derived category のみ・redacted/invalid 除外・後方互換）
describe("mobilityObservationStore — A2-10 weatherKind capture", () => {
  it("★normal × valid weatherKind → 保存される", () => {
    const o = buildObservation(obsInput({ weatherKind: "rain" }))!;
    expect(o.weatherKind).toBe("rain");
    expect(o.privacyClass).toBe("normal");
  });
  it("★redacted（sensitive）→ valid でも weatherKind を付けない（personal 化対象外）", () => {
    const o = buildObservation(obsInput({ originSensitive: true, weatherKind: "rain" }))!;
    expect(o.privacyClass).toBe("redacted");
    expect(o.weatherKind).toBeUndefined();
  });
  it("★invalid / undefined weatherKind → 付けない（捏造しない）", () => {
    expect(buildObservation(obsInput({ weatherKind: "typhoon" }))!.weatherKind).toBeUndefined();
    expect(buildObservation(obsInput({ weatherKind: 42 }))!.weatherKind).toBeUndefined();
    expect(buildObservation(obsInput({ weatherKind: undefined }))!.weatherKind).toBeUndefined();
  });
  it("snow/storm/heat/cold/normal も保存できる", () => {
    for (const k of ["snow", "storm", "heat", "cold", "normal"] as const) {
      expect(buildObservation(obsInput({ weatherKind: k }))!.weatherKind).toBe(k);
    }
  });
  it("★後方互換: weatherKind なしの旧 obs は valid のまま parse される", () => {
    const raw = JSON.stringify(store({ "2026-06-08": { "a__b": OBS } })); // OBS は weatherKind なし
    expect(getObservation(parseObservationStore(raw), "2026-06-08", "a__b")).toEqual(OBS);
  });
  it("★parse: weatherKind 付き → 復元 / invalid weatherKind の obs は drop", () => {
    const good = { ...OBS, weatherKind: "snow" as const };
    const bad = { ...OBS } as Record<string, unknown>;
    bad.weatherKind = "typhoon"; // invalid → obs ごと drop
    const raw = JSON.stringify(store({ "2026-06-08": { good: good as MobilityObservation, bad: bad as unknown as MobilityObservation } }));
    const parsed = parseObservationStore(raw);
    expect(getObservation(parsed, "2026-06-08", "good")?.weatherKind).toBe("snow");
    expect(getObservation(parsed, "2026-06-08", "bad")).toBeNull(); // invalid weatherKind → drop
  });
  it("save→load で weatherKind 復元", () => {
    saveMobilityObservation("2026-06-08", "w__leg", buildObservation(obsInput({ weatherKind: "rain" })));
    expect(loadMobilityObservation("2026-06-08", "w__leg")?.weatherKind).toBe("rain");
  });
  it("★clearMobilityObservations: 観測ログを全消去（opt-out/clear 導線）", () => {
    saveMobilityObservation("2026-06-08", "home__work", OBS);
    expect(loadMobilityObservation("2026-06-08", "home__work")).not.toBeNull();
    clearMobilityObservations();
    expect(loadMobilityObservation("2026-06-08", "home__work")).toBeNull();
  });
});
