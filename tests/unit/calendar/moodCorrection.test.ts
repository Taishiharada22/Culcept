/**
 * Mood Correction テスト — moodText → Intent 補正の検証
 *
 * CEO方針:
 * - mood は hard constraint（天気・移動量・ドレスコード・安全性）を壊さない
 * - 主観軸のみ nudge する
 * - 12パターンのムードが正しく Intent 軸を調整する
 */

import {
  applyMoodCorrection,
  getAvailableMoodPatterns,
  computeIntent,
} from "@/app/(culcept)/calendar/_lib/vcIntent";
import type { Intent, EventContext } from "@/app/(culcept)/calendar/_lib/vcTypes";

/** テスト用: ゼロ初期の Intent を作成（純粋にムード補正の効果だけを測る） */
function makeBaseIntent(): Intent {
  return {
    formality: 0.50, attention: 0.50, minimalism: 0.50, romance: 0.50, trust: 0.50,
    mobility: 0.50, walkNeed: 0.50, bikeNeed: 0.50, stairsNeed: 0.50,
    comfort: 0.50, breathable: 0.50, wrinkleSafe: 0.50, tightAvoid: 0.50,
    warmthNeed: 0.50, rainNeed: 0.50, windNeed: 0.50, uvNeed: 0.50,
    dirtySafe: 0.50, splashSafe: 0.50, pocketNeed: 0.50,
    sceneTags: [], bannedTags: [], requiredTags: [],
  };
}

function makeEventContext(overrides?: Partial<EventContext>): EventContext {
  return {
    id: "test_ev",
    title: "テスト予定",
    type: "friends",
    startAt: "2026-04-14T12:00:00",
    endAt: "2026-04-14T14:00:00",
    priority: 1,
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// applyMoodCorrection — 個別ムードパターン
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyMoodCorrection", () => {
  test("12パターン全て定義されている", () => {
    const patterns = getAvailableMoodPatterns();
    expect(patterns).toHaveLength(12);
    expect(patterns).toContain("きれいめ");
    expect(patterns).toContain("カジュアル");
    expect(patterns).toContain("ラフ");
    expect(patterns).toContain("かっちり");
    expect(patterns).toContain("フォーマル");
    expect(patterns).toContain("楽");
    expect(patterns).toContain("おしゃれ");
    expect(patterns).toContain("リラックス");
    expect(patterns).toContain("スポーティ");
    expect(patterns).toContain("シンプル");
    expect(patterns).toContain("動きやすい");
    expect(patterns).toContain("大人っぽい");
  });

  test("「きれいめ」→ formality+, attention+, minimalism+, trust+", () => {
    const intent = makeBaseIntent();
    applyMoodCorrection(intent, "きれいめ");
    expect(intent.formality).toBeGreaterThan(0.50);
    expect(intent.attention).toBeGreaterThan(0.50);
    expect(intent.minimalism).toBeGreaterThan(0.50);
    expect(intent.trust).toBeGreaterThan(0.50);
  });

  test("「カジュアル」→ formality-, comfort+, tightAvoid+", () => {
    const intent = makeBaseIntent();
    applyMoodCorrection(intent, "カジュアル");
    expect(intent.formality).toBeLessThan(0.50);
    expect(intent.comfort).toBeGreaterThan(0.50);
    expect(intent.tightAvoid).toBeGreaterThan(0.50);
  });

  test("「ラフ」→ formality--, comfort++, tightAvoid++, minimalism-", () => {
    const intent = makeBaseIntent();
    applyMoodCorrection(intent, "ラフ");
    expect(intent.formality).toBeLessThan(0.35); // -0.20
    expect(intent.comfort).toBeGreaterThan(0.60); // +0.15
    expect(intent.tightAvoid).toBeGreaterThan(0.60); // +0.15
    expect(intent.minimalism).toBeLessThan(0.50); // -0.10
  });

  test("「フォーマル」→ formality++, trust+, attention+, wrinkleSafe+", () => {
    const intent = makeBaseIntent();
    applyMoodCorrection(intent, "フォーマル");
    expect(intent.formality).toBeGreaterThan(0.70); // +0.25
    expect(intent.trust).toBeGreaterThan(0.50);
    expect(intent.attention).toBeGreaterThan(0.50);
    expect(intent.wrinkleSafe).toBeGreaterThan(0.50);
  });

  test("「スポーティ」→ mobility+, comfort+, breathable+, formality-", () => {
    const intent = makeBaseIntent();
    applyMoodCorrection(intent, "スポーティ");
    expect(intent.mobility).toBeGreaterThan(0.50);
    expect(intent.comfort).toBeGreaterThan(0.50);
    expect(intent.breathable).toBeGreaterThan(0.50);
    expect(intent.formality).toBeLessThan(0.50);
  });

  test("「動きやすい」→ mobility+, walkNeed+, comfort+, tightAvoid+", () => {
    const intent = makeBaseIntent();
    applyMoodCorrection(intent, "動きやすい");
    expect(intent.mobility).toBeGreaterThan(0.50);
    expect(intent.walkNeed).toBeGreaterThan(0.50);
    expect(intent.comfort).toBeGreaterThan(0.50);
    expect(intent.tightAvoid).toBeGreaterThan(0.50);
  });

  test("「大人っぽい」→ formality+, attention+, minimalism+, trust+", () => {
    const intent = makeBaseIntent();
    applyMoodCorrection(intent, "大人っぽい");
    expect(intent.formality).toBeGreaterThan(0.50);
    expect(intent.attention).toBeGreaterThan(0.50);
    expect(intent.minimalism).toBeGreaterThan(0.50);
    expect(intent.trust).toBeGreaterThan(0.50);
  });

  test("未知のムード → 変化なし", () => {
    const intent = makeBaseIntent();
    const snapshot = { ...intent };
    applyMoodCorrection(intent, "謎のムード");
    // 数値軸は一切変わらない
    expect(intent.formality).toBe(snapshot.formality);
    expect(intent.comfort).toBe(snapshot.comfort);
    expect(intent.warmthNeed).toBe(snapshot.warmthNeed);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hard constraint 不干渉テスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Mood does NOT touch hard constraint axes", () => {
  const HARD_CONSTRAINT_AXES = [
    "warmthNeed", "rainNeed", "windNeed", "uvNeed",
    "dirtySafe", "splashSafe", "pocketNeed",
    "bikeNeed", "stairsNeed",
  ] as const;

  test("全12ムードが天候・安全・特殊移動軸を変更しない", () => {
    const patterns = getAvailableMoodPatterns();
    for (const pattern of patterns) {
      const intent = makeBaseIntent();
      applyMoodCorrection(intent, pattern);
      for (const axis of HARD_CONSTRAINT_AXES) {
        expect(intent[axis]).toBe(0.50);
      }
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// computeIntent に moodText を渡す統合テスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeIntent with moodText", () => {
  test("moodText なし → 従来通りの Intent", () => {
    const ev = makeEventContext();
    const withMood = computeIntent(ev, undefined, undefined);
    const withoutMood = computeIntent(ev, undefined);
    // 同じ結果
    expect(withMood.formality).toBe(withoutMood.formality);
    expect(withMood.comfort).toBe(withoutMood.comfort);
  });

  test("「きれいめ」→ friends の formality が上がる", () => {
    const ev = makeEventContext({ type: "friends" });
    const base = computeIntent(ev);
    const withMood = computeIntent(ev, undefined, "きれいめ");
    expect(withMood.formality).toBeGreaterThan(base.formality);
  });

  test("「ラフ」→ work の formality が下がる", () => {
    const ev = makeEventContext({ type: "work" });
    const base = computeIntent(ev);
    const withMood = computeIntent(ev, undefined, "ラフ");
    expect(withMood.formality).toBeLessThan(base.formality);
  });

  test("DressCode formal + mood 「ラフ」→ formality は DressCode floor を下回らない", () => {
    const ev = makeEventContext({ type: "friends", dressCode: "formal" });
    const withMood = computeIntent(ev, undefined, "ラフ");
    // DressCode "formal" → Math.max(formality, 0.90)
    // ラフの -0.20 は DressCode 適用前なので、最終的に 0.90 以上
    expect(withMood.formality).toBeGreaterThanOrEqual(0.90);
  });

  test("Weather rain + mood 「リラックス」→ rainNeed は weather で確保される", () => {
    const ev = makeEventContext({ type: "friends" });
    const weather = { tempC: 18, precipMm: 5, condition: "rain" as const };
    const withMood = computeIntent(ev, weather, "リラックス");
    // rain condition → rainNeed += 0.35, リラックスは rainNeed を触らない
    expect(withMood.rainNeed).toBeGreaterThan(0.3);
    expect(withMood.requiredTags).toContain("rain_ok");
  });

  test("全軸が 0..1 の範囲内に clamp される", () => {
    // 極端なケース: フォーマル base + フォーマル mood → formality が 1.0 を超えないか
    const ev = makeEventContext({ type: "formal" });
    const intent = computeIntent(ev, undefined, "フォーマル");
    expect(intent.formality).toBeLessThanOrEqual(1.0);
    expect(intent.formality).toBeGreaterThanOrEqual(0.0);
    // ラフ mood で formality が負にならないか
    const intent2 = computeIntent(ev, undefined, "ラフ");
    expect(intent2.formality).toBeGreaterThanOrEqual(0.0);
  });
});
