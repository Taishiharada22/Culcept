/**
 * T11-C-D — engine-generated projection logic test（page 非依存）。
 *   fixture 入力 → runTravelPlanEngine → toDisplayPacket → buildPlanIntelligenceProjection →
 *   deriveCoAlterProjectionCues が決定論で安全な display 出力を出すことを検証。
 *   ★ authoritative packet を inspect しない（display tier のみ検証）。toServerAuthoritativePacket 不使用。
 */
import { describe, it, expect } from "vitest";
import { runTravelPlanEngine } from "@/lib/shared/travel/engine";
import { toDisplayPacket } from "@/lib/shared/travel/engine-consume";
import { buildPlanIntelligenceProjection } from "@/lib/shared/travel/plan-intelligence-projection";
import { deriveCoAlterProjectionCues } from "@/lib/shared/travel/coalter-projection-consume";
import { COALTER_PROJECTION_DISPLAY_ACTIONS } from "@/lib/shared/travel/coalter-projection-consume-types";
import { getDevFixtureTravelInput } from "@/lib/shared/travel/travel-input-provider";
import { FIXTURE_ENGINE_INPUT, FIXTURE_ENGINE_VIEWER_ID } from "@/app/(culcept)/plan/dev-travel-engine-projection/engine-fixture-input";
import type { TravelPlanEngineInput } from "@/lib/shared/travel/engine-types";

const chain = (input: TravelPlanEngineInput) => {
  const output = runTravelPlanEngine(input);
  const packet = toDisplayPacket(output, FIXTURE_ENGINE_VIEWER_ID);
  const projection = buildPlanIntelligenceProjection({ packet, viewerId: FIXTURE_ENGINE_VIEWER_ID });
  const cues = deriveCoAlterProjectionCues(projection);
  return { packet, projection, cues };
};

describe("1. 決定論", () => {
  it("同一 fixture 入力 → display packet / projection / cues が深い等価", () => {
    const a = chain(FIXTURE_ENGINE_INPUT);
    const b = chain(FIXTURE_ENGINE_INPUT);
    expect(a.packet).toEqual(b.packet);
    expect(a.projection).toEqual(b.projection);
    expect(a.cues).toEqual(b.cues);
  });
});

describe("2. display packet は非権限（display tier）", () => {
  it("authoritative:false / executionAuthority:false", () => {
    const { packet } = chain(FIXTURE_ENGINE_INPUT);
    expect(packet.authoritative).toBe(false);
    expect(packet.executionAuthority).toBe(false);
  });
});

describe("3. projection は authority field を持たない・実 output が出る", () => {
  const { projection } = chain(FIXTURE_ENGINE_INPUT);
  it("authority 系 key 無し", () => {
    for (const k of ["executionAuthority", "authoritative", "diagnostics", "canBook"]) {
      expect(k in projection).toBe(false);
    }
  });
  it("実 engine 由来の中身が出る（answer / needsConfirmation に weather_reversal_uncertainty / fitAdvisory）", () => {
    expect(projection.answer.nextAction).toBeDefined();
    expect(projection.needsConfirmation.map((c) => c.reason)).toContain("weather_reversal_uncertainty");
    expect(projection.fitAdvisory.length).toBeGreaterThan(0); // fit 入力あり
  });
});

describe("4. cues は execute/book/schedule/send を持たない", () => {
  const { cues } = chain(FIXTURE_ENGINE_INPUT);
  it("display action 集合・cue に実行系が無い", () => {
    for (const f of ["execute", "book", "schedule", "send", "reserve", "pay"]) {
      expect(COALTER_PROJECTION_DISPLAY_ACTIONS.some((a) => a.includes(f))).toBe(false);
    }
    for (const c of cues) expect(COALTER_PROJECTION_DISPLAY_ACTIONS).toContain(c.action);
  });
  it("weather_reversal_uncertainty は ask_confirmation cue として現れる", () => {
    expect(cues.some((c) => c.action === "ask_confirmation" && c.ref === "weather_reversal_uncertainty")).toBe(true);
  });
});

describe("5. baseline: fit 入力を除くと fitAdvisory 空", () => {
  it("fit undefined → fitAdvisory []", () => {
    const { projection } = chain({ ...FIXTURE_ENGINE_INPUT, fit: undefined });
    expect(projection.fitAdvisory).toEqual([]);
  });
});

describe("6. provider seam: ready→engine 可 / not_ready→input なし(engine 不可)", () => {
  it("fixtureAllowed true → ready・provided.input が同じ fixture・chain が走る", () => {
    const provided = getDevFixtureTravelInput(FIXTURE_ENGINE_INPUT, { fixtureAllowed: true });
    expect(provided.status).toBe("ready");
    if (provided.status === "ready") {
      expect(provided.input).toBe(FIXTURE_ENGINE_INPUT);
      expect(chain(provided.input).projection.answer.nextAction).toBeDefined(); // ready の input で engine 実行可
    }
  });
  it("fixtureAllowed false → not_ready・input なし＝engine を走らせられない（fail-closed）", () => {
    const provided = getDevFixtureTravelInput(FIXTURE_ENGINE_INPUT, { fixtureAllowed: false });
    expect(provided.status).toBe("not_ready");
    expect("input" in provided).toBe(false); // engine に渡す input が存在しない
  });
});
