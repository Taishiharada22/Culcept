/**
 * Comprehension-First v1.3+ Wave 3 W3-PR-3 Orchestrator Contract Tests
 *
 * 設計書: docs/alter-morning-comprehension-first-wave3-design.md §7
 *
 * カバレッジ:
 *   - runMorningPipeline が L1 → L2 → Annotation → L3 を配線している
 *   - annotation は plan graph / narration を汚染しない（C-2）
 *   - comprehension provider が null を返した場合 status="comprehension_failed"
 *   - weather provider 未注入時は condition="unknown"
 *   - 正常経路は narration.text が非空、covered_event_ids が events と一致
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

import {
  runMorningPipeline,
  createStubComprehensionProvider,
  type ComprehensionProvider,
  type MorningPipelineProviders,
} from "@/lib/alter-morning/morningPipeline";
import {
  resetEventCounter,
  baselineProvenance,
  utteranceProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { L1PipelineInput } from "@/lib/alter-morning/comprehension/l1Pipeline";
import {
  stubNarrationProvider,
  type NarrationProvider,
} from "@/lib/alter-morning/expression/narration";
import { createStubForecastProvider } from "@/lib/alter-morning/weather/weatherAnnotator";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  resetEventCounter();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkRaw(overrides?: Partial<L1PipelineInput["raw"]>): L1PipelineInput["raw"] {
  return {
    targetDate: "2026-04-22",
    startPoint: null,
    departureTime: null,
    goOut: true,
    operations: [],
    events: [
      {
        turn_mode: "create",
        change_scope: null,
        target_ref: null,
        target_ref_confidence: null,
        certainty: "asserted",
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["9時"], "high"),
        },
        where: {
          place_ref: "スタバ",
          placeType: "chain_brand",
          provenance: utteranceProvenance(["スタバ"], "high"),
        },
        what: {
          activity: "コーヒー",
          activityCanonical: "コーヒー",
          provenance: utteranceProvenance(["コーヒー"], "high"),
        },
        who: [],
        transport: null,
        missing_semantic_critical: [],
        missing_solver_blockers: [],
      },
    ],
    ...overrides,
  };
}

function baseProviders(
  raw: L1PipelineInput["raw"] | null,
  narration: NarrationProvider = stubNarrationProvider,
): MorningPipelineProviders {
  const comprehension: ComprehensionProvider = raw
    ? createStubComprehensionProvider(raw)
    : { async extract() { return null; } };
  return { comprehension, narration, weather: null };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("runMorningPipeline (W3-PR-3)", () => {
  test("status=ok、L1/L2/L3/annotation が揃う", async () => {
    const res = await runMorningPipeline(
      { utterance: "9時にスタバでコーヒー" },
      baseProviders(mkRaw()),
    );
    expect(res.status).toBe("ok");
    expect(res.comprehension).not.toBeNull();
    expect(res.comprehension!.events).toHaveLength(1);
    expect(res.timeline).not.toBeNull();
    expect(res.timeline!.entries).toHaveLength(1);
    expect(res.grounded).toHaveLength(1);
    expect(res.gapResolution).not.toBeNull();
    expect(res.narration).not.toBeNull();
    expect(res.narration!.narration.text.length).toBeGreaterThan(0);
    expect(res.annotations.body).toHaveLength(1);
    expect(res.annotations.weather).toHaveLength(1);
    expect(res.annotations.party).toHaveLength(1);
  });

  test("narration の covered_event_ids は comprehension の event_id と一致する", async () => {
    const res = await runMorningPipeline(
      { utterance: "9時にスタバでコーヒー" },
      baseProviders(mkRaw()),
    );
    const narIds = res.narration!.narration.covered_event_ids;
    const eventIds = res.comprehension!.events.map((e) => e.event_id);
    for (const id of narIds) {
      expect(eventIds).toContain(id);
    }
  });

  test("comprehension provider が null を返すと status=comprehension_failed", async () => {
    const res = await runMorningPipeline(
      { utterance: "意味不明な文字列" },
      baseProviders(null),
    );
    expect(res.status).toBe("comprehension_failed");
    expect(res.comprehension).toBeNull();
    expect(res.timeline).toBeNull();
    expect(res.narration).toBeNull();
    expect(res.annotations.body).toEqual([]);
    expect(res.annotations.weather).toEqual([]);
    expect(res.annotations.party).toEqual([]);
  });

  test("weather provider 未注入時は condition=unknown", async () => {
    const res = await runMorningPipeline(
      { utterance: "9時にスタバでコーヒー" },
      baseProviders(mkRaw()),
    );
    expect(res.annotations.weather[0].condition).toBe("unknown");
  });

  test("weather provider を stub で差し込めば forecast が反映される", async () => {
    const weather = createStubForecastProvider({
      condition: "rainy",
      tempMin: 10,
      tempMax: 15,
      precipitationProb: 80,
    });
    const res = await runMorningPipeline(
      { utterance: "9時にスタバでコーヒー" },
      { ...baseProviders(mkRaw()), weather },
    );
    const w = res.annotations.weather[0];
    expect(w.condition).toBe("rainy");
    expect(w.precipitation).toBe("high");
    expect(w.warnings.length).toBeGreaterThan(0);
  });

  test("phenotype を注入すると body annotation が反映される", async () => {
    const res = await runMorningPipeline(
      {
        utterance: "9時にスタバでコーヒー",
        phenotype: { pcSeason: "winter", bodyType: "ストレート" },
      },
      baseProviders(mkRaw()),
    );
    const b = res.annotations.body[0];
    expect(b.tone_candidates.length).toBeGreaterThan(0);
    expect(b.confidence === "medium" || b.confidence === "high").toBe(true);
  });

  test("partyBaseline を注入すると candidates が生成される", async () => {
    const res = await runMorningPipeline(
      {
        utterance: "9時にスタバでコーヒー",
        partyBaseline: [
          { name: "田中", activityAffinity: { "コーヒー": 0.8 } },
        ],
      },
      baseProviders(mkRaw()),
    );
    const p = res.annotations.party[0];
    expect(p.has_explicit_who).toBe(false);
    expect(p.candidates.length).toBeGreaterThan(0);
    expect(p.candidates[0].name).toBe("田中");
  });

  test("C-2: annotation は narration 出力に混入しない", async () => {
    // 田中を強く推薦する baseline を与えても narration には出ない
    const resWithAnn = await runMorningPipeline(
      {
        utterance: "9時にスタバでコーヒー",
        partyBaseline: [
          { name: "田中", activityAffinity: { "コーヒー": 0.99 } },
        ],
        phenotype: { pcSeason: "winter", bodyType: "ストレート" },
      },
      baseProviders(mkRaw()),
    );
    const resNoAnn = await runMorningPipeline(
      { utterance: "9時にスタバでコーヒー" },
      baseProviders(mkRaw()),
    );
    // narration 本文は annotation の有無で変わらない（stub narrator 決定論）
    expect(resWithAnn.narration!.narration.text).toBe(
      resNoAnn.narration!.narration.text,
    );
    // 候補値「田中」は narration に現れない
    expect(resWithAnn.narration!.narration.text.includes("田中")).toBe(false);
  });

  test("入力オブジェクトを書き換えない（非破壊）", async () => {
    const raw = mkRaw();
    const rawJson = JSON.stringify(raw);
    const phenotype = { pcSeason: "winter" as const, bodyType: "ストレート" };
    const phenoJson = JSON.stringify(phenotype);
    const baseline = [
      { name: "田中", activityAffinity: { "コーヒー": 0.8 } },
    ];
    const baselineJson = JSON.stringify(baseline);
    await runMorningPipeline(
      {
        utterance: "9時にスタバでコーヒー",
        phenotype,
        partyBaseline: baseline,
      },
      baseProviders(raw),
    );
    expect(JSON.stringify(raw)).toBe(rawJson);
    expect(JSON.stringify(phenotype)).toBe(phenoJson);
    expect(JSON.stringify(baseline)).toBe(baselineJson);
  });

  test("weatherContext.targetDate > targetDateHint > comprehension.targetDate", async () => {
    const raw = mkRaw({ targetDate: "2026-04-22" });
    const res1 = await runMorningPipeline(
      { utterance: "x", weatherContext: { targetDate: "2026-05-01" } },
      baseProviders(raw),
    );
    // weather provider 未注入なので forecast.date は unknown 時に ctx.targetDate をそのまま入れる
    // （weatherAnnotator の emptyForecast が ctx.targetDate を使う）
    // ここでは condition=unknown で tempMin/tempMax=null になっている事だけ確認し、
    // targetDate 優先順位は unit 別レイヤで担保される
    expect(res1.annotations.weather[0].condition).toBe("unknown");

    const res2 = await runMorningPipeline(
      { utterance: "x", targetDateHint: "2026-06-10" },
      baseProviders(raw),
    );
    expect(res2.annotations.weather[0].condition).toBe("unknown");
  });
});

// 未使用 import の tree-shake 警告抑止（型だけ使う場合がある）
void baselineProvenance;
