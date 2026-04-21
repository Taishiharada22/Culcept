/**
 * Comprehension-First v1.3+ Wave 3 W3-PR-2 Contract Tests
 *
 * 設計書: docs/alter-morning-comprehension-first-wave3-design.md §5 / §6
 *
 * カバレッジ:
 *   - Body Annotator: phenotype + place category → outfit/tone/avoid 候補群
 *   - Weather Annotator: provider 差し替え / 天気 → 注意喚起候補
 *   - Party Annotator: baseline → candidate / who 埋まり時の非干渉
 *   - 共通契約: plan graph / baseline を書き換えない（非破壊）
 *   - L3 Faithfulness への影響ゼロ（C-2）: annotation は narration に自動混入しない
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

import {
  type Event,
  resetEventCounter,
  baselineProvenance,
  utteranceProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";

import {
  annotateBody,
  type PhenotypeInput,
} from "@/lib/alter-morning/body/bodyAnnotator";

import {
  annotateWeather,
  createStubForecastProvider,
  classifyPrecipitation,
} from "@/lib/alter-morning/weather/weatherAnnotator";

import {
  annotateParty,
  type PartyBaselineEntry,
} from "@/lib/alter-morning/planning/partyAnnotator";

import type { GroundedPlace } from "@/lib/alter-morning/planning/placeGrounder";

import { checkFaithfulness } from "@/lib/alter-morning/expression/faithfulnessChecker";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  resetEventCounter();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkEvent(overrides: Partial<Event>): Event {
  const base: Event = {
    event_id: "event_x",
    turn_mode: "create",
    change_scope: null,
    target_ref: null,
    target_ref_confidence: null,
    certainty: "asserted",
    when: { startTime: null, timeHint: null, provenance: baselineProvenance() },
    where: { place_ref: null, placeType: null, provenance: baselineProvenance() },
    what: { activity: "", activityCanonical: "", provenance: baselineProvenance() },
    who: [],
    transport: null,
    missing_semantic_critical: [],
    missing_solver_blockers: [],
  };
  return { ...base, ...overrides };
}

function mkGrounded(event_id: string, entryId: string | null): GroundedPlace {
  if (!entryId) {
    return {
      event_id,
      place_ref: "",
      candidates: [],
      selected: null,
      status: "unresolved",
    };
  }
  return {
    event_id,
    place_ref: "placeholder",
    candidates: [
      {
        resolvedName: "placeholder",
        placeType: "chain_brand",
        confidence: "high",
        source: "placeTable",
        entryId,
      },
    ],
    selected: {
      resolvedName: "placeholder",
      placeType: "chain_brand",
      confidence: "high",
      source: "placeTable",
      entryId,
    },
    status: "resolved",
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Body Annotator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("L2.4 annotateBody", () => {
  test("office category + spring PC + ストレート → 複数候補を集約", () => {
    const ev = mkEvent({ event_id: "event_1" });
    const grounded = [mkGrounded("event_1", "office")];
    const pheno: PhenotypeInput = {
      pcSeason: "spring",
      bodyType: "ストレート",
    };
    const annos = annotateBody([ev], grounded, pheno);
    expect(annos).toHaveLength(1);
    const a = annos[0];
    expect(a.event_id).toBe("event_1");
    expect(a.outfit_candidates.length).toBeGreaterThanOrEqual(2);
    expect(a.outfit_candidates).toContain("ジャケット");
    expect(a.tone_candidates).toContain("明るい");
    expect(a.avoid_candidates).toContain("ラフすぎる服装");
    expect(a.confidence).toBe("high");
    expect(a.basis).toEqual(
      expect.arrayContaining([
        "category=office",
        "pcSeason=spring",
        "bodyType=ストレート",
      ]),
    );
  });

  test("phenotype 空 + grounded 無 → confidence=low 空候補", () => {
    const ev = mkEvent({ event_id: "event_1" });
    const annos = annotateBody([ev], [], {});
    expect(annos[0].confidence).toBe("low");
    expect(annos[0].outfit_candidates).toEqual([]);
    expect(annos[0].tone_candidates).toEqual([]);
  });

  test("phenotype 無 + category cafe → medium", () => {
    const ev = mkEvent({ event_id: "event_1" });
    const grounded = [mkGrounded("event_1", "starbucks")];
    const annos = annotateBody([ev], grounded, {});
    expect(annos[0].confidence).toBe("medium");
    expect(annos[0].outfit_candidates).toContain("カジュアル");
  });

  test("event 入力を書き換えない（非破壊）", () => {
    const ev = mkEvent({ event_id: "event_1", who: ["A"] });
    const snapshot = JSON.stringify(ev);
    annotateBody([ev], [], { pcSeason: "winter" });
    expect(JSON.stringify(ev)).toBe(snapshot);
  });

  test("全 event に 1 対 1 で annotation が返る", () => {
    const events = [
      mkEvent({ event_id: "event_1" }),
      mkEvent({ event_id: "event_2" }),
      mkEvent({ event_id: "event_3" }),
    ];
    const annos = annotateBody(events, [], {});
    expect(annos.map((a) => a.event_id)).toEqual(["event_1", "event_2", "event_3"]);
  });

  test("summer PC の tone は spring と異なる", () => {
    const ev = mkEvent({ event_id: "event_1" });
    const spring = annotateBody([ev], [], { pcSeason: "spring" });
    const summer = annotateBody([ev], [], { pcSeason: "summer" });
    expect(spring[0].tone_candidates).not.toEqual(summer[0].tone_candidates);
  });

  test("placeType fallback: grounded 空でも ev.where.placeType で category 推定", () => {
    const ev = mkEvent({
      event_id: "event_1",
      where: {
        place_ref: null,
        placeType: "cafe",
        provenance: baselineProvenance(),
      },
    });
    const annos = annotateBody([ev], [], {});
    expect(annos[0].basis).toContain("category=cafe");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Weather Annotator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("L2.5 annotateWeather", () => {
  test("雨予報で折りたたみ傘 warning が出る", async () => {
    const provider = createStubForecastProvider({
      condition: "rainy",
      precipitationProb: 80,
    });
    const events = [mkEvent({ event_id: "event_1" })];
    const annos = await annotateWeather(
      events,
      { officeCode: "130000", targetDate: "2026-04-22" },
      provider,
    );
    expect(annos[0].condition).toBe("rainy");
    expect(annos[0].precipitation).toBe("high");
    expect(annos[0].warnings.some((w) => w.includes("傘"))).toBe(true);
  });

  test("高温日に熱中症対策 warning", async () => {
    const provider = createStubForecastProvider({
      condition: "sunny",
      tempMax: 32,
      tempMin: 24,
      precipitationProb: 10,
    });
    const annos = await annotateWeather(
      [mkEvent({ event_id: "event_1" })],
      { officeCode: "130000", targetDate: "2026-07-10" },
      provider,
    );
    expect(annos[0].warnings.some((w) => w.includes("熱中症"))).toBe(true);
  });

  test("provider=null 時は condition=unknown, 例外なし", async () => {
    const annos = await annotateWeather(
      [mkEvent({ event_id: "event_1" })],
      { officeCode: null, targetDate: "2026-04-22" },
      null,
    );
    expect(annos[0].condition).toBe("unknown");
    expect(annos[0].confidence).toBe("low");
  });

  test("provider が throw しても annotation は返る", async () => {
    const failingProvider = {
      forecast: async () => {
        throw new Error("network error");
      },
    };
    const annos = await annotateWeather(
      [mkEvent({ event_id: "event_1" })],
      { officeCode: "130000", targetDate: "2026-04-22" },
      failingProvider,
    );
    expect(annos[0].condition).toBe("unknown");
  });

  test("classifyPrecipitation 境界値", () => {
    expect(classifyPrecipitation(null)).toBe("none");
    expect(classifyPrecipitation(0)).toBe("none");
    expect(classifyPrecipitation(19)).toBe("none");
    expect(classifyPrecipitation(20)).toBe("low");
    expect(classifyPrecipitation(40)).toBe("medium");
    expect(classifyPrecipitation(70)).toBe("high");
    expect(classifyPrecipitation(100)).toBe("high");
  });

  test("全 event に同一 forecast を配布（本 PR スコープ）", async () => {
    const provider = createStubForecastProvider({ condition: "cloudy" });
    const events = [
      mkEvent({ event_id: "event_1" }),
      mkEvent({ event_id: "event_2" }),
    ];
    const annos = await annotateWeather(
      events,
      { officeCode: "130000", targetDate: "2026-04-22" },
      provider,
    );
    expect(annos).toHaveLength(2);
    expect(annos[0].condition).toBe(annos[1].condition);
  });

  test("events 入力を書き換えない", async () => {
    const ev = mkEvent({ event_id: "event_1", who: ["A"] });
    const snapshot = JSON.stringify(ev);
    await annotateWeather(
      [ev],
      { officeCode: "130000", targetDate: "2026-04-22" },
      createStubForecastProvider(),
    );
    expect(JSON.stringify(ev)).toBe(snapshot);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Party Annotator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("L2.6 annotateParty", () => {
  const baseline: PartyBaselineEntry[] = [
    {
      name: "田中",
      activityAffinity: { ランチ: 0.8, コーヒー: 0.3 },
      baseFrequency: 0.25,
    },
    {
      name: "鈴木",
      activityAffinity: { ミーティング: 0.9 },
      baseFrequency: 0.1,
    },
    {
      name: "佐藤",
      activityAffinity: {},
      baseFrequency: 0.05,
    },
  ];

  test("ランチ event → 田中が最有力候補", () => {
    const ev = mkEvent({
      event_id: "event_1",
      what: {
        activity: "ランチ",
        activityCanonical: "ランチ",
        provenance: baselineProvenance(),
      },
    });
    const annos = annotateParty([ev], baseline);
    expect(annos[0].candidates[0].name).toBe("田中");
    expect(annos[0].candidates[0].score).toBeCloseTo(0.8, 2);
    expect(annos[0].has_explicit_who).toBe(false);
    expect(annos[0].confidence).toBe("high");
  });

  test("event.who が埋まっていれば候補空・has_explicit_who=true", () => {
    const ev = mkEvent({
      event_id: "event_1",
      who: ["田中", "鈴木"],
      what: {
        activity: "ランチ",
        activityCanonical: "ランチ",
        provenance: baselineProvenance(),
      },
    });
    const annos = annotateParty([ev], baseline);
    expect(annos[0].has_explicit_who).toBe(true);
    expect(annos[0].candidates).toEqual([]);
  });

  test("baseline 空 → 候補空 / confidence=low", () => {
    const ev = mkEvent({ event_id: "event_1" });
    const annos = annotateParty([ev], []);
    expect(annos[0].candidates).toEqual([]);
    expect(annos[0].confidence).toBe("low");
  });

  test("SCORE_THRESHOLD 未満の候補は落ちる（佐藤=0.05）", () => {
    const ev = mkEvent({
      event_id: "event_1",
      what: {
        activity: "散歩",
        activityCanonical: "散歩",
        provenance: baselineProvenance(),
      },
    });
    const annos = annotateParty([ev], baseline);
    const names = annos[0].candidates.map((c) => c.name);
    expect(names).not.toContain("佐藤");
  });

  test("candidates は score 降順", () => {
    const ev = mkEvent({
      event_id: "event_1",
      what: {
        activity: "ランチ",
        activityCanonical: "ランチ",
        provenance: baselineProvenance(),
      },
    });
    const annos = annotateParty([ev], baseline);
    const scores = annos[0].candidates.map((c) => c.score);
    const sorted = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sorted);
  });

  test("baseline / events 入力を書き換えない", () => {
    const ev = mkEvent({ event_id: "event_1" });
    const evSnap = JSON.stringify(ev);
    const blSnap = JSON.stringify(baseline);
    annotateParty([ev], baseline);
    expect(JSON.stringify(ev)).toBe(evSnap);
    expect(JSON.stringify(baseline)).toBe(blSnap);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// C-2: annotation は narration / Faithfulness に自動混入しない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("C-2 契約: annotation → narration 自動注入なし", () => {
  test("annotation を生成しても Faithfulness Checker の結果は不変", () => {
    const ev = mkEvent({
      event_id: "event_1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"]),
      },
      where: {
        place_ref: "スタバ",
        placeType: "cafe",
        provenance: utteranceProvenance(["スタバ"]),
      },
      what: {
        activity: "コーヒー",
        activityCanonical: "コーヒー",
        provenance: utteranceProvenance(["コーヒー"]),
      },
    });
    const grounded = [mkGrounded("event_1", "starbucks")];

    const narration_text = "9時にスタバでコーヒー。";

    // annotation を生成
    annotateBody([ev], grounded, { pcSeason: "winter" });
    annotateParty([ev], [
      { name: "田中", activityAffinity: { コーヒー: 0.7 } },
    ]);

    // Faithfulness checker が annotation 由来の固有名を allowed に混ぜていない
    const violations = checkFaithfulness({
      narration_text,
      covered_event_ids: ["event_1"],
      comprehension: {
        events: [ev],
        targetDate: "today",
        startPoint: null,
        departureTime: null,
        goOut: null,
      },
      timeline: {
        entries: [
          {
            event_id: "event_1",
            startTime: "09:00",
            endTime: null,
            transport_duration_min: 0,
            violation: null,
          },
        ],
        violations: [],
      },
      grounded,
    });
    expect(violations).toEqual([]);
  });

  test("annotation を実行した前後で Faithfulness 結果が完全一致（allowed 集合が広がらない）", () => {
    const ev = mkEvent({
      event_id: "event_1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"]),
      },
      where: {
        place_ref: "スタバ",
        placeType: "cafe",
        provenance: utteranceProvenance(["スタバ"]),
      },
      what: {
        activity: "コーヒー",
        activityCanonical: "コーヒー",
        provenance: utteranceProvenance(["コーヒー"]),
      },
    });
    const grounded = [mkGrounded("event_1", "starbucks")];
    // annotation の候補として「オシャレカフェ」「カフェテラス」のようなカタカナ proper noun が
    // Faithfulness の allowed に混ざっていないことを証明する narration
    const narration_text = "9時にサドヤでコーヒー。"; // "サドヤ" は plan graph に無い → 違反するべき
    const input = {
      narration_text,
      covered_event_ids: ["event_1"],
      comprehension: {
        events: [ev],
        targetDate: "today",
        startPoint: null,
        departureTime: null,
        goOut: null,
      },
      timeline: {
        entries: [
          {
            event_id: "event_1",
            startTime: "09:00",
            endTime: null,
            transport_duration_min: 0,
            violation: null,
          },
        ],
        violations: [],
      },
      grounded,
    };
    const before = JSON.stringify(checkFaithfulness(input));
    // annotation を大量に生成
    annotateBody([ev], grounded, { pcSeason: "winter", bodyType: "ストレート" });
    annotateParty([ev], [
      { name: "田中", activityAffinity: { コーヒー: 0.9 } },
      { name: "鈴木", activityAffinity: { コーヒー: 0.6 } },
    ]);
    const after = JSON.stringify(checkFaithfulness(input));
    expect(before).toBe(after);
    // かつ "サドヤ" 違反は依然として検出されている（allowed に漏れ混入がない）
    const violations = checkFaithfulness(input);
    expect(
      violations.some((v) => v.type === "extra_place_in_text"),
    ).toBe(true);
  });
});
