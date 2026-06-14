/**
 * T11-G2-D — Tier0 manual entity retrieval + evidence-to-state normalizer tests
 *
 * 設計正本: docs/t11-g2-real-entity-retrieval-design.md（+ Tier0: URL を開かない）
 *
 * 主眼: evidence→Observed→state / time lock=OrderingConstraint / price hi 捏造なし / popularity→confidence only /
 *   onsen=facet / safety unknown→question / url→handoff(entity 外) / freshness 内部 / fit score・authority なし / 純度。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getManualEntityRetrievalCandidates,
  normalizeManualEntityEvidence,
} from "@/lib/shared/travel/entity-retrieval";
import type { EntityEvidence, EntityFact } from "@/lib/shared/travel/entity-retrieval-types";

const E = (placeRefId: string, category: EntityEvidence["category"], facts: EntityFact[], over: Partial<EntityEvidence> = {}): EntityEvidence => ({ placeRefId, category, facts, ...over });
const ed: EntityFact["provenance"] = "editorial";

describe("1. manual lodging evidence → TravelObjectState", () => {
  it("category/role/burden が entity に載る", () => {
    const c = normalizeManualEntityEvidence(E("L1", "lodging", [
      { kind: "roleAffinity", role: "recovery", value: 0.8, provenance: ed },
      { kind: "burden", axis: "travelBurden", value: 0.3, provenance: "aggregated" },
    ]));
    expect(c.entity.category).toBe("lodging");
    expect(c.entity.roleAffinity?.recovery?.value).toBe(0.8);
    expect(c.entity.burden?.travelBurden?.value).toBe(0.3); // station distance → access/burden
  });
});

describe("2. onsen → host-agnostic OnsenState facet（category でない）", () => {
  it("onsen fact が lodging.rich.onsenFacet に載る", () => {
    const c = normalizeManualEntityEvidence(E("L2", "lodging", [
      { kind: "onsen", springType: "sulfur", kakenagashi: true, provenance: ed },
      { kind: "recoveryRest", value: 0.7, provenance: ed },
    ]));
    expect(c.entity.category).toBe("lodging");
    const rich = (c.entity as { rich?: { onsenFacet?: { springType?: { value: string } } } }).rich;
    expect(rich?.onsenFacet?.springType?.value).toBe("sulfur");
    expect(c.entity.recovery?.restValue?.value).toBe(0.7);
  });
});

describe("3. ★time lock → OrderingConstraint(relation 層)・hardProfile でない", () => {
  it("check-in/営業時間 → timeLocks(OrderingConstraint)・entity.hardProfile に時刻なし", () => {
    const c = normalizeManualEntityEvidence(E("L3", "lodging", [
      { kind: "timeLock", lockKind: "checkin_window_lock", rawTime: "15:00", provenance: ed },
      { kind: "timeLock", lockKind: "open_hours_window_lock", rawTime: "9:00-17:00", provenance: ed },
    ]));
    expect(c.timeLocks.map((t) => t.ordering.kind)).toEqual(["checkin_window_lock", "open_hours_window_lock"]);
    expect(c.timeLocks[0].ordering.subjectRef).toBe("L3");
    expect(c.timeLocks[0].rawTime).toBe("15:00");
    expect(c.entity.hardProfile).toBeUndefined(); // 時刻を hardProfile に載せない
    expect(JSON.stringify(c.entity)).not.toContain("15:00"); // 時刻は entity に出ない
  });
});

describe("4. dinner→meal role / quiet review→quietness medium confidence", () => {
  it("food_destination role affinity", () => {
    const c = normalizeManualEntityEvidence(E("L4", "lodging", [{ kind: "roleAffinity", role: "food_destination", value: 0.7, provenance: ed }]));
    expect(c.entity.roleAffinity?.food_destination?.value).toBe(0.7);
  });
  it("review 由来 quietLively は medium/low confidence（inferred）", () => {
    const c = normalizeManualEntityEvidence(E("P4", "place", [{ kind: "trait", axis: "quietLively", value: -0.6, provenance: "inferred" }]));
    expect(c.entity.traits?.quietLively?.value).toBe(-0.6);
    expect(c.entity.traits?.quietLively?.confidence).toBeLessThanOrEqual(0.5); // medium/low
  });
});

describe("5. cancellation/price は明示供給時のみ・hallucinate しない", () => {
  it("cancellation 明示 → candidate.cancellationFlexibility（entity でない）", () => {
    const c = normalizeManualEntityEvidence(E("L5", "lodging", [{ kind: "cancellationFlexibility", value: 0.9, provenance: ed }]));
    expect(c.cancellationFlexibility?.value).toBe(0.9);
  });
  it("required cancellation 欠如 → missing question", () => {
    const c = normalizeManualEntityEvidence(E("L5b", "lodging", [], { requires: ["cancellationFlexibility"] }));
    expect(c.missingQuestions.some((q) => q.field === "cancellationFlexibility")).toBe(true);
  });
  it("price lo のみ(hi 欠)→ hi 捏造せず priceBand 無 + missing question", () => {
    const c = normalizeManualEntityEvidence(E("L5c", "lodging", [{ kind: "priceBand", lo: 18000, provenance: "aggregated" }]));
    expect(c.entity.priceBand).toBeUndefined();
    expect(c.missingQuestions.some((q) => q.field === "price_upper_bound")).toBe(true);
  });
  it("price lo+hi → priceBand(BudgetBand 数値)", () => {
    const c = normalizeManualEntityEvidence(E("L5d", "lodging", [{ kind: "priceBand", lo: 18000, hi: 30000, provenance: "aggregated" }]));
    expect(c.entity.priceBand?.value).toMatchObject({ lo: 18000, hi: 30000, currency: "JPY" });
  });
});

describe("6. outdoor→weatherFragility(live weather 断定なし) / stairs→physicalLoad+accessibility unknown", () => {
  it("outdoor → burden.weatherFragility・weather 値の断定なし", () => {
    const c = normalizeManualEntityEvidence(E("A6", "activity", [{ kind: "burden", axis: "weatherFragility", value: 0.8, provenance: ed }]));
    expect(c.entity.burden?.weatherFragility?.value).toBe(0.8);
    expect(JSON.stringify(c.entity)).not.toMatch(/rain|sunny|forecast|天気/i); // live weather claim なし
  });
  it("stairs → physicalLoad burden・accessibility 未供給は捏造しない（hardProfile なし or unknown）", () => {
    const c = normalizeManualEntityEvidence(E("P6", "place", [{ kind: "burden", axis: "physicalLoad", value: 0.7, provenance: ed }]));
    expect(c.entity.burden?.physicalLoad?.value).toBe(0.7);
    expect(c.entity.hardProfile?.accessibility?.stepFree).toBeUndefined(); // 推定しない
  });
  it("accessibility 明示 unknown → TriState unknown（fail-closed・捏造しない）", () => {
    const c = normalizeManualEntityEvidence(E("P6b", "place", [{ kind: "accessibilityStepFree", value: "unknown", provenance: ed }]));
    expect(c.entity.hardProfile?.accessibility?.stepFree).toBe("unknown");
  });
});

describe("7. support は evidence ある時のみ・popularity は confidence only", () => {
  it("support reliefAxis は fact ある時のみ", () => {
    const c = normalizeManualEntityEvidence(E("S7", "support", [{ kind: "supportRelief", reliefAxis: "luggage", reliefValue: 0.8, necessity: "recommended", provenance: ed }]));
    const rich = (c.entity as { rich?: { reliefAxis?: string } }).rich;
    expect(rich?.reliefAxis).toBe("luggage");
  });
  it("★popularity は confidence のみ上げ・trait/role/burden value を変えない", () => {
    const noPop = normalizeManualEntityEvidence(E("P7", "place", [{ kind: "trait", axis: "natureUrban", value: 0.5, provenance: "inferred" }]));
    const withPop = normalizeManualEntityEvidence(E("P7", "place", [
      { kind: "trait", axis: "natureUrban", value: 0.5, provenance: "inferred" },
      { kind: "popularity", reliability: 0.8, independent: true, provenance: "aggregated" },
    ]));
    expect(withPop.entity.traits?.natureUrban?.value).toBe(noPop.entity.traits?.natureUrban?.value); // value 不変
    expect(withPop.confidence.entityConfidence).toBeGreaterThan(noPop.confidence.entityConfidence); // confidence のみ上昇
    expect(withPop.confidence.sourceCount).toBe(1);
  });
});

describe("8. 衝突 → 採用せず missing question（断定しない）", () => {
  it("同 axis 異値 burden → burden 未採用 + missing question", () => {
    const c = normalizeManualEntityEvidence(E("P8", "place", [
      { kind: "burden", axis: "crowdNoise", value: 0.2, provenance: ed },
      { kind: "burden", axis: "crowdNoise", value: 0.9, provenance: "aggregated" },
    ]));
    expect(c.entity.burden?.crowdNoise).toBeUndefined(); // 断定しない
    expect(c.missingQuestions.some((q) => q.field === "burden:crowdNoise")).toBe(true);
  });
});

describe("9. safety required 欠如 → safety_unknown question", () => {
  it("required allergen 欠如 → reason safety_unknown", () => {
    const c = normalizeManualEntityEvidence(E("F9", "food", [], { requires: ["allergen"] }));
    expect(c.missingQuestions.find((q) => q.field === "allergen")?.reason).toBe("safety_unknown");
  });
});

describe("10. ★url/deep link は envelope handoff・entity に載せない / freshness は内部 / fit score・authority なし", () => {
  it("url は handoffs に・entity/TravelObjectState に出ない", () => {
    const env = getManualEntityRetrievalCandidates({ entities: [E("L10", "lodging", [{ kind: "roleAffinity", role: "base", value: 0.6, provenance: "explicit_user", ref: { sourceKind: "user_provided", refId: "u:1", url: "https://example.com/hotel" } }], { ref: { sourceKind: "user_provided", refId: "u:e", url: "https://booking.example/x" } })] });
    expect(env.handoffs.some((h) => h.url === "https://booking.example/x")).toBe(true);
    expect(JSON.stringify(env.result.candidates[0].entity)).not.toContain("http"); // entity に url なし
  });
  it("freshness は candidate(retrieval 内部)・entity に出ない", () => {
    const c = normalizeManualEntityEvidence(E("L10b", "lodging", [{ kind: "roleAffinity", role: "base", value: 0.6, provenance: ed, freshness: { staleness: "aging" } }]));
    expect(c.freshness?.staleness).toBe("aging");
    expect("freshness" in c.entity).toBe(false);
  });
  it("出力に fit score / authority が無い", () => {
    const c = normalizeManualEntityEvidence(E("L10c", "lodging", [{ kind: "roleAffinity", role: "base", value: 0.6, provenance: ed }]));
    const json = JSON.stringify(c);
    for (const f of ["fitLabel", "executionAuthority", "authoritative", "components", "canBook"]) expect(json).not.toContain(f);
  });
});

describe("11. Tier0: 非 manual/user_provided source fact は skip（非実行）", () => {
  it("ota_claim source の fact は処理されない", () => {
    const c = normalizeManualEntityEvidence(E("L11", "lodging", [
      { kind: "burden", axis: "travelBurden", value: 0.3, provenance: "aggregated", ref: { sourceKind: "ota_claim", refId: "o:1" } },
      { kind: "roleAffinity", role: "base", value: 0.6, provenance: "explicit_user" }, // ref なし=manual 既定→Tier0 処理
    ]));
    expect(c.entity.burden?.travelBurden).toBeUndefined(); // ota_claim は skip
    expect(c.entity.roleAffinity?.base?.value).toBe(0.6); // manual は処理
  });
});

describe("12. import 純度（fetch/URL read/Maps/OTA/M2/DB/UI なし）", () => {
  it("entity-retrieval(-types) は fetch/外部/M2/UI を import/使用しない", () => {
    const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    for (const f of ["lib/shared/travel/entity-retrieval.ts", "lib/shared/travel/entity-retrieval-types.ts"]) {
      const src = strip(readFileSync(resolve(process.cwd(), f), "utf8"));
      for (const bad of ["process.env", "Date.now", "Math.random"]) expect(src).not.toContain(bad);
      expect(src).not.toMatch(/\bfetch\(/);
      expect(src).not.toMatch(/supabase/i);
      expect(src).not.toMatch(/from ["']next/);
      expect(src).not.toMatch(/from ["'][^"']*(components|app\/|engine-consume|plan-intelligence|coalter|axios|googlemaps|m2)/i);
    }
  });
});
