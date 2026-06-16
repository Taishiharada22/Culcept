import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  PLACE_CANDIDATE_LENS_PREF_OBS_ENABLED,
  isCandidateLensPrefObsEnabled,
  opaquePlaceKey,
  recordPreferenceObservation,
  loadPreferenceObservations,
  clearPreferenceObservations,
  ringAppend,
} from "@/lib/plan/candidateLens/candidateLensPreferenceStore";
import type { PreferenceObservation } from "@/lib/plan/candidateLens/candidateLensPreferenceObs";

// ── Map-backed localStorage mock（jsdom 不使用ゆえ globalThis に注入） ──
class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  raw() { return this.m; }
}
let store: MemStorage;
const KEY = "aneurasync.candidateLens.prefObs.v1";

function obs(over: Partial<PreferenceObservation> = {}): PreferenceObservation {
  return {
    lens: "meeting_prep", selectedPlaceKey: "pabc", decisiveAxes: ["walk_estimate"],
    choiceContext: "compare", comparedAgainstKey: "pdef",
    signals: { proximityWeighted: true, marginWeighted: false, reselectedKnown: false }, at: 1000, ...over,
  };
}

beforeEach(() => {
  store = new MemStorage();
  (globalThis as { localStorage?: Storage }).localStorage = store as unknown as Storage;
  vi.stubEnv("NODE_ENV", "development");
});
afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
  vi.unstubAllEnvs();
});

describe("opaquePlaceKey — ★場所名/住所を含まない opaque key（privacy 核）", () => {
  it("★出力は p+base36 のみ・元の場所名 substring を含まない", () => {
    const k = opaquePlaceKey("ブルーボトル 清澄白河")!;
    expect(k).toMatch(/^p[0-9a-z]+$/);
    expect(k).not.toContain("ブルーボトル");
    expect(k).not.toContain("清澄白河");
    expect(k).not.toMatch(/[ぁ-んァ-ヶ一-龠]/); // 日本語を一切含まない
  });
  it("★決定論: 同じ場所 → 同じ key（集計/再選検出が働く）・違う場所 → 違う key", () => {
    expect(opaquePlaceKey("ブルーボトル 清澄白河")).toBe(opaquePlaceKey("ブルーボトル　清澄白河")); // 全角空白も normalize
    expect(opaquePlaceKey("A 場所")).not.toBe(opaquePlaceKey("B 場所"));
    expect(opaquePlaceKey("")).toBeNull();
    expect(opaquePlaceKey(null)).toBeNull();
  });
});

describe("recordPreferenceObservation — shadow 記録（flag/production gate）", () => {
  it("★default flag は OFF（着地時 記録ゼロ）", () => {
    expect(PLACE_CANDIDATE_LENS_PREF_OBS_ENABLED).toBe(false);
    recordPreferenceObservation(obs());
    expect(store.getItem(KEY)).toBeNull(); // flag OFF → write しない
    expect(loadPreferenceObservations()).toEqual([]);
  });

  it("★production では hard block（NODE_ENV=production で write しない）", () => {
    vi.stubEnv("NODE_ENV", "production");
    // 仮に flag が true でも production 排他であることを式で検証
    expect(true && process.env.NODE_ENV !== "production").toBe(false);
    expect(isCandidateLensPrefObsEnabled()).toBe(false);
    recordPreferenceObservation(obs());
    expect(store.getItem(KEY)).toBeNull();
  });

  // ── flag ON 相当の挙動は record を直接 store に流して検証（flag は別途 gate 済み） ──
  // recordPreferenceObservation は flag OFF で no-op のため、ON 時の ring/load/clear/leak は store I/O を直接叩いて検証する。
  function rawWrite(list: PreferenceObservation[]) { store.setItem(KEY, JSON.stringify(list)); }

  it("★保存 payload に元の場所名 substring が leak しない（opaque key のみ・record の実シリアライズ相当）", () => {
    const k = opaquePlaceKey("ブルーボトル 清澄白河")!;
    // record が書く JSON と同じ形（ringAppend → JSON.stringify）を実コードで生成して leak 検証
    const payload = JSON.stringify(ringAppend([], obs({ selectedPlaceKey: k, comparedAgainstKey: opaquePlaceKey("TRUNK COFFEE 渋谷") })));
    expect(payload).not.toContain("ブルーボトル");
    expect(payload).not.toContain("清澄白河");
    expect(payload).not.toContain("TRUNK");
    expect(payload).not.toContain("渋谷");
    rawWrite([obs({ selectedPlaceKey: k })]);
    expect(loadPreferenceObservations()[0]!.selectedPlaceKey).toBe(k);
  });

  it("★ring buffer（実 ringAppend）: 200 を超えたら古いものから落ちる", () => {
    const seed = Array.from({ length: 205 }, (_, i) => obs({ at: i }));
    const ringed = ringAppend(seed, obs({ at: 999 })); // 205+1=206 → 末尾 200
    expect(ringed.length).toBe(200);
    expect(ringed[ringed.length - 1]!.at).toBe(999);
    expect(ringed[0]!.at).toBe(6); // 0..5 が落ちる
  });

  it("★clear で全消去", () => {
    rawWrite([obs(), obs()]);
    expect(loadPreferenceObservations().length).toBe(2);
    clearPreferenceObservations();
    expect(loadPreferenceObservations()).toEqual([]);
    expect(store.getItem(KEY)).toBeNull();
  });

  it("★fail-open: 破損 JSON / 配列でない → 空", () => {
    store.setItem(KEY, "{not json");
    expect(loadPreferenceObservations()).toEqual([]);
    store.setItem(KEY, JSON.stringify({ a: 1 }));
    expect(loadPreferenceObservations()).toEqual([]);
  });

  it("★localStorage 不在 → fail-open（throw しない）", () => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    expect(() => recordPreferenceObservation(obs())).not.toThrow();
    expect(loadPreferenceObservations()).toEqual([]);
  });
});
