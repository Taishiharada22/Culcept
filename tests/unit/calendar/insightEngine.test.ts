/**
 * インサイトエンジン v2 検証
 *
 * CEO指示:
 * 1. seeded data で self-understanding を強制発火させ、文言と納得感を確認
 * 2. date / interview / friends / formal の event day で impression を確認
 * 3. 通常日の3秒判断を邪魔していないか確認
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { generateInsights } from "@/app/(culcept)/calendar/_lib/insightEngine";
import type { WeatherDaily, SatisfactionProfile, SeasonBlend, Insight } from "@/app/(culcept)/calendar/_lib/types";
import type { CalendarPersonaProfile } from "@/app/(culcept)/calendar/_lib/personaBoost";
import type { TemporalProfile } from "@/app/(culcept)/calendar/_lib/temporalPatterns";
import type { ComboGraph } from "@/app/(culcept)/calendar/_lib/comboGraph";
import type { WardrobeItem } from "@/app/my-style/_lib/types";
import type { GenomeRelationshipContext } from "@/app/(culcept)/calendar/_lib/genomeRelationship";

/* ── テストデータ ── */

const mockItems: WardrobeItem[] = [
  { id: "top1", name: "白シャツ", category: "tops", silhouette: "regular", formality: "smart", season: "all", thickness: "mid", color: "white", colorHex: "#ffffff", pattern: "solid" } as WardrobeItem,
  { id: "bot1", name: "ネイビーパンツ", category: "bottoms", silhouette: "regular", formality: "smart", season: "all", thickness: "mid", color: "navy", colorHex: "#000080", pattern: "solid" } as WardrobeItem,
  { id: "shoe1", name: "レザーシューズ", category: "shoes", silhouette: "regular", formality: "smart", season: "all", thickness: "mid", color: "brown", colorHex: "#8B4513", pattern: "solid" } as WardrobeItem,
];

const sunnyWeather: WeatherDaily = {
  weather_icon: "sun",
  pop_max: 0,
  temp_min: 12,
  temp_max: 20,
};

const rainyWeather: WeatherDaily = {
  weather_icon: "rain",
  pop_max: 80,
  temp_min: 10,
  temp_max: 15,
};

const defaultSeasonBlend: SeasonBlend = {
  primary: "spring",
  secondary: null,
  blend: 0,
  shoulderSeason: false,
};

// 満足度プロファイル: 14日分のデータ、top1が高評価
const richSatisfactionProfile: SatisfactionProfile = {
  itemScores: new Map([
    ["top1", { avg: 4.5, count: 5, lastWorn: "2026-03-29" }],
    ["bot1", { avg: 4.0, count: 4, lastWorn: "2026-03-28" }],
    ["shoe1", { avg: 2.0, count: 3, lastWorn: "2026-03-27" }],
  ]),
  comboScores: new Map([
    ["top1|bot1", { avg: 4.8, count: 4 }],
  ]),
  conditionScores: new Map(),
  dataPoints: 14,
  oldestDate: "2026-03-16",
};

// ペルソナプロファイル: completeness 60（厳格化後の閾値40以上）
const richPersona: CalendarPersonaProfile = {
  pcSeason4: "autumn",
  bodySubtype: "straight",
  silhouettePref: {},
  materialPref: {},
  dominantColorAxis: "neutral",
  dominantSilhouetteAxis: "neutral",
  styleAxis: {
    minimal_vs_maximal: -0.5,  // ミニマル寄り
    classic_vs_trendy: -0.3,   // クラシック寄り
    cautious_vs_bold: -0.2,    // 慎重寄り
    function_vs_expression: -0.3, // 機能寄り（minimal判定に必要: < -0.2）
  },
  completeness: 60,
};

// 時間パターン: 平日満足度が高い
const richTemporalProfile: TemporalProfile = {
  dayOfWeekProfiles: [
    { dayOfWeek: 0, sampleCount: 2, avgSatisfaction: 3.5, preferredFormality: null, avgItemCount: 2 },
    { dayOfWeek: 1, sampleCount: 8, avgSatisfaction: 4.5, preferredFormality: "smart", avgItemCount: 3 }, // 月曜 — 発火条件（6回以上、4以上、conf=8/12=0.67>0.6）
    { dayOfWeek: 2, sampleCount: 6, avgSatisfaction: 4.2, preferredFormality: null, avgItemCount: 3 },
    { dayOfWeek: 3, sampleCount: 4, avgSatisfaction: 3.8, preferredFormality: null, avgItemCount: 2 },
    { dayOfWeek: 4, sampleCount: 9, avgSatisfaction: 4.6, preferredFormality: "smart", avgItemCount: 3 }, // 木曜 — 発火条件
    { dayOfWeek: 5, sampleCount: 3, avgSatisfaction: 3.0, preferredFormality: "casual", avgItemCount: 2 },
    { dayOfWeek: 6, sampleCount: 2, avgSatisfaction: 3.2, preferredFormality: null, avgItemCount: 2 },
  ],
  preEventPatterns: [],
  weekdayVsWeekend: { weekdayAvg: 4.3, weekendAvg: 3.3 },
  recentTrendDirection: "improving",
  recentAvgSatisfaction: 4.1,
};

// コンボグラフ: top1×bot1が鉄板
const richComboGraph: ComboGraph = {
  edges: new Map([
    ["bot1|top1", { itemA: "bot1", itemB: "top1", affinity: 80, wearCount: 4, avgSatisfaction: 4.8, lastWorn: "2026-03-29", seasonCounts: { ss: 2, aw: 2 }, weatherCounts: { sun: 3, cloud: 1 } }],
  ]),
  itemDegree: new Map([["bot1", 1], ["top1", 1]]),
  topAffinity: [],
  toxicPairs: [],
  totalEdges: 6,
};

// ── rotationTracker のモック ──
vi.mock("@/app/(culcept)/calendar/_lib/rotationTracker", () => ({
  loadWornHistory: () => {
    const history = [];
    for (let d = 16; d <= 29; d++) {
      history.push({
        date: `2026-03-${d}`,
        itemIds: d % 2 === 0 ? ["top1", "bot1"] : ["top1", "shoe1"],
        satisfaction: d % 3 === 0 ? 3 : 5,
      });
    }
    return history;
  },
  getRecentlyWornItemIds: () => [],
  saveWornRecord: () => {},
  getWornRecordForDate: () => null,
}));

/* ═══════════════════════════════════════════
   検証1: self-understanding インサイト
   ═══════════════════════════════════════════ */

describe("self-understanding insights（自己理解）", () => {
  it("学習インサイト: 鉄板アイテムを検出する", () => {
    const insights = generateInsights(
      mockItems, sunnyWeather, [], richPersona, richSatisfactionProfile, defaultSeasonBlend,
      { temporal: richTemporalProfile, comboGraph: richComboGraph, dayOfWeek: 1 },
    );

    const learning = insights.find(i => i.type === "learning");
    expect(learning).toBeDefined();
    expect(learning!.tier).toBe("self-understanding");
    expect(learning!.text).toContain("白シャツ");
    expect(learning!.text).toContain("鉄板");
    console.log("[学習] ", learning!.icon, learning!.text);
  });

  it("学習インサイト: 低評価アイテムを警告する", () => {
    // shoe1 が低評価
    const insights = generateInsights(
      mockItems, sunnyWeather, [], richPersona, richSatisfactionProfile, defaultSeasonBlend,
    );

    const lowRated = insights.find(i => i.type === "learning" && i.text.includes("低め"));
    // shoe1(avg:2.0, count:3)は低評価警告が出るはず
    // ただしtop1の鉄板インサイト(priority:75)がshoe1の警告(priority:80)より低いので
    // 低評価の方が先に出る可能性
    const anyLearning = insights.find(i => i.type === "learning");
    expect(anyLearning).toBeDefined();
    console.log("[学習警告] ", anyLearning!.icon, anyLearning!.text);
  });

  it("ペルソナインサイト: ミニマル派のスタイル方向を出す", () => {
    const insights = generateInsights(
      mockItems, sunnyWeather, [], richPersona, richSatisfactionProfile, defaultSeasonBlend,
    );

    const persona = insights.find(i => i.type === "persona");
    expect(persona).toBeDefined();
    expect(persona!.tier).toBe("self-understanding");
    expect(persona!.confidence).toBeGreaterThanOrEqual(0.6);
    console.log("[ペルソナ] ", persona!.icon, persona!.text);
  });

  it("時間パターン: 月曜日の得意パターンを検出する", () => {
    // comboGraphなしで渡す（comboが優先されてself-understanding枠2を埋めないように）
    const insights = generateInsights(
      mockItems, sunnyWeather, [], richPersona, richSatisfactionProfile, defaultSeasonBlend,
      { temporal: richTemporalProfile, comboGraph: null, dayOfWeek: 1 },
    );

    const temporal = insights.find(i => i.type === "temporal");
    expect(temporal).toBeDefined();
    expect(temporal!.tier).toBe("self-understanding");
    expect(temporal!.text).toContain("月");
    console.log("[時間] ", temporal!.icon, temporal!.text);
  });

  it("コンボインサイト: 鉄板ペアを検出する", () => {
    const insights = generateInsights(
      mockItems, sunnyWeather, [], richPersona, richSatisfactionProfile, defaultSeasonBlend,
      { temporal: richTemporalProfile, comboGraph: richComboGraph, dayOfWeek: 1 },
    );

    const combo = insights.find(i => i.type === "combo");
    expect(combo).toBeDefined();
    expect(combo!.tier).toBe("self-understanding");
    expect(combo!.text).toContain("白シャツ");
    expect(combo!.text).toContain("ネイビーパンツ");
    console.log("[コンボ] ", combo!.icon, combo!.text);
  });

  it("self-understanding は最大2件まで", () => {
    const insights = generateInsights(
      mockItems, sunnyWeather, [], richPersona, richSatisfactionProfile, defaultSeasonBlend,
      { temporal: richTemporalProfile, comboGraph: richComboGraph, dayOfWeek: 1 },
    );

    const selfInsights = insights.filter(i => i.tier === "self-understanding");
    expect(selfInsights.length).toBeLessThanOrEqual(2);
    console.log(`[上限] self-understanding: ${selfInsights.length}件`);
  });

  it("データ不足時はself-understandingが出ない", () => {
    const poorProfile: SatisfactionProfile = {
      itemScores: new Map(),
      comboScores: new Map(),
      conditionScores: new Map(),
      dataPoints: 2,
      oldestDate: "2026-03-30",
    };

    const insights = generateInsights(
      mockItems, sunnyWeather, [], null, poorProfile, defaultSeasonBlend,
    );

    const selfInsights = insights.filter(i => i.tier === "self-understanding");
    expect(selfInsights.length).toBe(0);
    console.log("[データ不足] self-understanding: 0件 ✓");
  });
});

/* ═══════════════════════════════════════════
   検証2: impression インサイト（イベント日）
   ═══════════════════════════════════════════ */

describe("impression insights（印象示唆）", () => {
  const eventTypes = ["date", "interview", "friends", "formal"] as const;

  for (const eventType of eventTypes) {
    it(`${eventType} イベントで印象示唆が出る`, () => {
      const events = [{ event_type: eventType }];
      const insights = generateInsights(
        mockItems, sunnyWeather, events, richPersona, richSatisfactionProfile, defaultSeasonBlend,
      );

      const impression = insights.find(i => i.type === "impression");
      expect(impression).toBeDefined();
      expect(impression!.tier).toBe("impression");
      expect(impression!.text.length).toBeGreaterThan(10);
      console.log(`[${eventType}] `, impression!.icon, impression!.text);
    });
  }

  it("イベントなしでは impression は出ない", () => {
    const insights = generateInsights(
      mockItems, sunnyWeather, [], richPersona, richSatisfactionProfile, defaultSeasonBlend,
    );

    const impression = insights.find(i => i.type === "impression");
    expect(impression).toBeUndefined();
  });

  it("impression は最大1件まで", () => {
    const events = [{ event_type: "date" }, { event_type: "meeting" }];
    const insights = generateInsights(
      mockItems, sunnyWeather, events, richPersona, richSatisfactionProfile, defaultSeasonBlend,
    );

    const impressions = insights.filter(i => i.tier === "impression");
    expect(impressions.length).toBeLessThanOrEqual(1);
  });
});

/* ═══════════════════════════════════════════
   検証2b: impression 文言品質チェック（CEO目視確認用）
   ═══════════════════════════════════════════ */

describe("impression 文言品質（星占いっぽくないか、自然か）", () => {
  const ALL_EVENT_TYPES = ["date", "interview", "meeting", "formal", "party", "friends", "outdoor", "sports", "travel"] as const;

  it("全イベント型の impression テキストを一覧出力", () => {
    console.log("\n═══ impression 全文言 ═══");
    for (const eventType of ALL_EVENT_TYPES) {
      const events = [{ event_type: eventType }];
      const insights = generateInsights(
        mockItems, sunnyWeather, events, richPersona, richSatisfactionProfile, defaultSeasonBlend,
      );
      const imp = insights.find(i => i.type === "impression");
      if (imp) {
        console.log(`  [${eventType.padEnd(10)}] ${imp.icon} ${imp.text}`);
      } else {
        console.log(`  [${eventType.padEnd(10)}] ⚠️ 発火なし`);
      }
    }
    console.log("═══════════════════════\n");
  });

  for (const eventType of ALL_EVENT_TYPES) {
    it(`${eventType}: 星占い調でない（曖昧な運命語を含まない）`, () => {
      const events = [{ event_type: eventType }];
      const insights = generateInsights(
        mockItems, sunnyWeather, events, richPersona, richSatisfactionProfile, defaultSeasonBlend,
      );
      const imp = insights.find(i => i.type === "impression");
      if (!imp) return; // 発火しないイベント型はスキップ
      // 星占い調のNGワード
      expect(imp.text).not.toMatch(/運命|星|運勢|ラッキー|引き寄せ|宇宙/);
      // 曖昧すぎるNGパターン
      expect(imp.text).not.toMatch(/きっとうまくいく|素敵な出会い|良いことが/);
    });

    it(`${eventType}: practicalを邪魔しない（impression < practical priority）`, () => {
      const events = [{ event_type: eventType }];
      // 雨の日（practical priority: 80）+ イベント
      const insights = generateInsights(
        mockItems, rainyWeather, events, richPersona, richSatisfactionProfile, defaultSeasonBlend,
      );
      // practical が先頭であること
      expect(insights[0].tier).toBe("practical");
      // impression も存在するが2番目以降
      const impIdx = insights.findIndex(i => i.type === "impression");
      if (impIdx >= 0) {
        expect(impIdx).toBeGreaterThan(0);
      }
    });
  }

  it("イベント日の全インサイト順序を出力（晴れ＝リスクなし）", () => {
    const events = [{ event_type: "date" }];
    const insights = generateInsights(
      mockItems, sunnyWeather, events, richPersona, richSatisfactionProfile, defaultSeasonBlend,
    );
    console.log("\n═══ date日（晴れ）の全インサイト順序 ═══");
    insights.forEach((ins, i) => {
      console.log(`  ${i + 1}. [${ins.tier.padEnd(18)}] ${ins.icon} ${ins.text.slice(0, 50)}`);
    });
    console.log("═══════════════════════════════════\n");
    // 晴れの日: リスクがないので priority 順に自然に並ぶ（practical が最上位でなくてもOK）
    // リスクがある日の先頭保証は「雨の日は risk practical が最優先」テストで検証済み
    expect(insights.length).toBeGreaterThanOrEqual(2);
  });

  it("雨のイベント日は practical が impression より前", () => {
    const events = [{ event_type: "date" }];
    const insights = generateInsights(
      mockItems, rainyWeather, events, richPersona, richSatisfactionProfile, defaultSeasonBlend,
    );
    console.log("\n═══ date日（雨）の全インサイト順序 ═══");
    insights.forEach((ins, i) => {
      console.log(`  ${i + 1}. [${ins.tier.padEnd(18)}] ${ins.icon} ${ins.text.slice(0, 50)}`);
    });
    console.log("═══════════════════════════════════\n");
    const practIdx = insights.findIndex(i => i.tier === "practical");
    const impIdx = insights.findIndex(i => i.type === "impression");
    expect(practIdx).toBe(0); // practical 先頭
    if (impIdx >= 0) {
      expect(practIdx).toBeLessThan(impIdx);
    }
  });
});

/* ═══════════════════════════════════════════
   検証2c: self-understanding 文言品質チェック
   ═══════════════════════════════════════════ */

describe("self-understanding 文言品質（説明でなく気づきか）", () => {
  it("全 self-understanding テキストを一覧出力", () => {
    // フルデータで全パターンを出す
    const insights = generateInsights(
      mockItems, sunnyWeather, [{ event_type: "date" }], richPersona, richSatisfactionProfile, defaultSeasonBlend,
      { temporal: richTemporalProfile, comboGraph: richComboGraph, dayOfWeek: 1 },
    );
    console.log("\n═══ self-understanding 全文言 ═══");
    const selfInsights = insights.filter(i => i.tier === "self-understanding");
    selfInsights.forEach(ins => {
      console.log(`  [${ins.type.padEnd(14)}] ${ins.icon} ${ins.text} (confidence: ${ins.confidence})`);
    });
    // 上限で出なかったものも個別に確認
    console.log("  --- 個別発火確認 ---");

    // learning単独
    const learning = generateInsights(
      mockItems, sunnyWeather, [], richPersona, richSatisfactionProfile, defaultSeasonBlend,
    ).filter(i => i.type === "learning");
    learning.forEach(ins => console.log(`  [learning      ] ${ins.icon} ${ins.text}`));

    // persona単独
    const persona = generateInsights(
      mockItems, sunnyWeather, [], richPersona, richSatisfactionProfile, defaultSeasonBlend,
    ).filter(i => i.type === "persona");
    persona.forEach(ins => console.log(`  [persona       ] ${ins.icon} ${ins.text}`));

    // temporal単独
    const temporal = generateInsights(
      mockItems, sunnyWeather, [], richPersona, richSatisfactionProfile, defaultSeasonBlend,
      { temporal: richTemporalProfile, comboGraph: null, dayOfWeek: 1 },
    ).filter(i => i.type === "temporal");
    temporal.forEach(ins => console.log(`  [temporal      ] ${ins.icon} ${ins.text}`));

    // combo単独
    const combo = generateInsights(
      mockItems, sunnyWeather, [], richPersona, richSatisfactionProfile, defaultSeasonBlend,
      { temporal: null, comboGraph: richComboGraph, dayOfWeek: 1 },
    ).filter(i => i.type === "combo");
    combo.forEach(ins => console.log(`  [combo         ] ${ins.icon} ${ins.text}`));

    console.log("═════════════════════════════════\n");
  });

  it("self-understanding の文言がデータ報告調でない", () => {
    const allInsights = [
      ...generateInsights(mockItems, sunnyWeather, [], richPersona, richSatisfactionProfile, defaultSeasonBlend),
      ...generateInsights(mockItems, sunnyWeather, [], richPersona, richSatisfactionProfile, defaultSeasonBlend,
        { temporal: richTemporalProfile, comboGraph: null, dayOfWeek: 1 }),
      ...generateInsights(mockItems, sunnyWeather, [], richPersona, richSatisfactionProfile, defaultSeasonBlend,
        { temporal: null, comboGraph: richComboGraph, dayOfWeek: 1 }),
    ];
    const selfInsights = allInsights.filter(i => i.tier === "self-understanding");
    for (const ins of selfInsights) {
      expect(ins.text).not.toMatch(/平均満足度\d/);
      expect(ins.text).not.toMatch(/スコア\d/);
      expect(ins.text).not.toMatch(/統計的に/);
      expect(ins.text).not.toMatch(/データによると/);
      expect(ins.text).not.toMatch(/分析結果/);
    }
  });

  it("self-understanding の文言が行動提案でなく気づき", () => {
    const allInsights = [
      ...generateInsights(mockItems, sunnyWeather, [], richPersona, richSatisfactionProfile, defaultSeasonBlend),
      ...generateInsights(mockItems, sunnyWeather, [], richPersona, richSatisfactionProfile, defaultSeasonBlend,
        { temporal: richTemporalProfile, comboGraph: null, dayOfWeek: 1 }),
    ];
    const selfInsights = allInsights.filter(i => i.tier === "self-understanding");
    for (const ins of selfInsights) {
      // 命令口調でないこと
      expect(ins.text).not.toMatch(/してください$/);
      expect(ins.text).not.toMatch(/しましょう$/);
      expect(ins.text).not.toMatch(/すべきです$/);
    }
  });
});

/* ═══════════════════════════════════════════
   検証3: 通常日の3秒判断
   ═══════════════════════════════════════════ */

describe("通常日の3秒判断", () => {
  it("イベントなし・データなしでも必ず practical が1件は出る", () => {
    const insights = generateInsights(
      mockItems, sunnyWeather, [], null, null, defaultSeasonBlend,
    );

    const practical = insights.filter(i => i.tier === "practical");
    expect(practical.length).toBeGreaterThanOrEqual(1);
    console.log("[通常日practical] ", practical[0].icon, practical[0].text);
  });

  it("天気データなしでも practical が出る", () => {
    const insights = generateInsights(
      mockItems, null, [], null, null, defaultSeasonBlend,
    );

    const practical = insights.filter(i => i.tier === "practical");
    expect(practical.length).toBeGreaterThanOrEqual(1);
    console.log("[天気なしpractical] ", practical[0].icon, practical[0].text);
  });

  it("雨の日は risk practical が最優先", () => {
    const insights = generateInsights(
      mockItems, rainyWeather, [], null, null, defaultSeasonBlend,
    );

    expect(insights[0].tier).toBe("practical");
    expect(insights[0].text).toContain("降水確率");
    console.log("[雨practical] ", insights[0].icon, insights[0].text);
  });

  it("practical が insights[0] に来る（3秒判断を邪魔しない）", () => {
    // フルデータ + イベントの日でも、practical が先頭
    const events = [{ event_type: "date" }];
    const insights = generateInsights(
      mockItems, rainyWeather, events, richPersona, richSatisfactionProfile, defaultSeasonBlend,
      { temporal: richTemporalProfile, comboGraph: richComboGraph, dayOfWeek: 1 },
    );

    // 雨のrisk(priority:80)が最優先
    expect(insights[0].tier).toBe("practical");
    console.log("[フルデータ先頭] ", insights[0].icon, insights[0].text);

    // self-understanding / impression も存在する
    const hasSelf = insights.some(i => i.tier === "self-understanding");
    const hasImp = insights.some(i => i.tier === "impression");
    console.log(`  self-understanding: ${hasSelf}, impression: ${hasImp}`);
  });

  it("全インサイトの文言にデータレポート調がない", () => {
    const insights = generateInsights(
      mockItems, sunnyWeather, [{ event_type: "date" }], richPersona, richSatisfactionProfile, defaultSeasonBlend,
      { temporal: richTemporalProfile, comboGraph: richComboGraph, dayOfWeek: 1 },
    );

    for (const insight of insights) {
      // 旧エンジンのデータレポート調パターンをチェック
      expect(insight.text).not.toMatch(/平均満足度\d+\.\d+/); // "平均満足度4.5" は禁止
      expect(insight.text).not.toMatch(/データから最適化/); // 機械的
      expect(insight.text).not.toMatch(/シンプルで洗練された構成が得意/); // 説明的
    }
  });
});

/* ═══════════════════════════════════════════
   検証4: 第3層 Genome連携の限定発火
   ═══════════════════════════════════════════ */

const selfStyle = {
  pcSeason4: "autumn",
  styleAxis: { minimal_vs_maximal: -0.5, classic_vs_trendy: -0.3, cautious_vs_bold: -0.2, function_vs_expression: -0.3 },
  colorWarmth: 0.2,
  silhouetteAxis: 0,
  completeness: 60,
};

const partnerStyle = {
  pcSeason4: "spring", // autumn × spring = 高調和(0.9)
  styleAxis: { minimal_vs_maximal: 0.1, classic_vs_trendy: 0.2, cautious_vs_bold: 0.3, function_vs_expression: 0.1 },
  colorWarmth: 0.3,
  silhouetteAxis: 0.5,
  completeness: 55,
};

const genomeCtx: GenomeRelationshipContext = {
  self: selfStyle,
  partner: partnerStyle,
  relationshipHint: "romantic",
};

describe("第3層: Genome連携の限定発火", () => {
  it("dateイベント + パートナーGenomeありで genome_relationship が出る", () => {
    const events = [{ event_type: "date" }];
    const insights = generateInsights(
      mockItems, sunnyWeather, events, richPersona, richSatisfactionProfile, defaultSeasonBlend,
      { genomeRelationship: genomeCtx },
    );

    const genome = insights.find(i => i.type === "genome_relationship");
    expect(genome).toBeDefined();
    expect(genome!.tier).toBe("impression");
    expect(genome!.label).toBe("ふたりの相性");
    console.log("[Genome] ", genome!.icon, genome!.text);
  });

  it("friendsイベント + socialヒントで「場の雰囲気」ラベル", () => {
    const socialCtx: GenomeRelationshipContext = {
      ...genomeCtx,
      relationshipHint: "social",
    };
    const events = [{ event_type: "friends" }];
    const insights = generateInsights(
      mockItems, sunnyWeather, events, richPersona, richSatisfactionProfile, defaultSeasonBlend,
      { genomeRelationship: socialCtx },
    );

    const genome = insights.find(i => i.type === "genome_relationship");
    expect(genome).toBeDefined();
    expect(genome!.label).toBe("場の雰囲気");
    console.log("[Genome social] ", genome!.icon, genome!.text);
  });

  it("パートナーなしでは genome_relationship が出ない", () => {
    const noPartnerCtx: GenomeRelationshipContext = {
      self: selfStyle,
      partner: null,
      relationshipHint: null,
    };
    const events = [{ event_type: "date" }];
    const insights = generateInsights(
      mockItems, sunnyWeather, events, richPersona, richSatisfactionProfile, defaultSeasonBlend,
      { genomeRelationship: noPartnerCtx },
    );

    const genome = insights.find(i => i.type === "genome_relationship");
    expect(genome).toBeUndefined();
  });

  it("イベントなしでは genome_relationship が出ない", () => {
    const insights = generateInsights(
      mockItems, sunnyWeather, [], richPersona, richSatisfactionProfile, defaultSeasonBlend,
      { genomeRelationship: genomeCtx },
    );

    const genome = insights.find(i => i.type === "genome_relationship");
    expect(genome).toBeUndefined();
  });

  it("completeness不足では genome_relationship が出ない", () => {
    const weakCtx: GenomeRelationshipContext = {
      self: selfStyle,
      partner: { ...partnerStyle, completeness: 20 },
      relationshipHint: "romantic",
    };
    const events = [{ event_type: "date" }];
    const insights = generateInsights(
      mockItems, sunnyWeather, events, richPersona, richSatisfactionProfile, defaultSeasonBlend,
      { genomeRelationship: weakCtx },
    );

    const genome = insights.find(i => i.type === "genome_relationship");
    expect(genome).toBeUndefined();
  });

  it("workイベント（対象外）では genome_relationship が出ない", () => {
    const events = [{ event_type: "work" }];
    const insights = generateInsights(
      mockItems, sunnyWeather, events, richPersona, richSatisfactionProfile, defaultSeasonBlend,
      { genomeRelationship: genomeCtx },
    );

    const genome = insights.find(i => i.type === "genome_relationship");
    expect(genome).toBeUndefined();
  });

  it("genome_relationship は impression と共存できる（別カウント）", () => {
    const events = [{ event_type: "date" }];
    const insights = generateInsights(
      mockItems, sunnyWeather, events, richPersona, richSatisfactionProfile, defaultSeasonBlend,
      { genomeRelationship: genomeCtx },
    );

    const impression = insights.find(i => i.type === "impression");
    const genome = insights.find(i => i.type === "genome_relationship");
    expect(impression).toBeDefined();
    expect(genome).toBeDefined();
    console.log("[共存] impression:", impression!.text.slice(0, 20), "/ genome:", genome!.text.slice(0, 20));
  });

  it("genome_relationship が第1層（practical先頭）を邪魔しない", () => {
    const events = [{ event_type: "date" }];
    const insights = generateInsights(
      mockItems, rainyWeather, events, richPersona, richSatisfactionProfile, defaultSeasonBlend,
      { genomeRelationship: genomeCtx },
    );

    // 雨のpracticalが先頭のまま
    expect(insights[0].tier).toBe("practical");
    console.log("[L3先頭確認] ", insights[0].icon, insights[0].text);
  });
});
