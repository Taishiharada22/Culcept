/**
 * T11-E-C tests — travel input provider（pure types + dev fixture provider + provenance validation）。
 *
 * 設計正本: docs/t11-e-projection-provider-interface-design.md（+ CEO/GPT 修正: realOnly は sources 由来）
 *
 * 主眼:
 *   - fixtureAllowed true→ready / false→not_ready（input なし・fake fallback なし）
 *   - provenance.sources に dev_fixture / realOnly=false（派生）
 *   - realOnly は dev_fixture と両立しない（詐称は validate で fail）
 *   - assertNoFixtureSource が dev_fixture を拒否 / provider は display packet/projection/cues を返さない
 *   - import 純度（env/Date.now/Math.random/fetch/DB/M2/UI なし）
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getDevFixtureTravelInput,
  createDevFixtureTravelInputProvider,
  deriveRealOnly,
  isRealOnlyProvenance,
  validateTravelInputProvenance,
  assertNoFixtureSource,
} from "@/lib/shared/travel/travel-input-provider";
import type { TravelInputProvenance } from "@/lib/shared/travel/travel-input-provider-types";
import type { TravelPlanEngineInput } from "@/lib/shared/travel/engine-types";

// 最小 fixture input（provider は engine を走らせない＝richness は不問）。
const FIXTURE: TravelPlanEngineInput = { slots: [], participantIds: ["P1"] };

describe("1. gate: fixtureAllowed true→ready / false→not_ready（fail-closed）", () => {
  it("fixtureAllowed true → ready（input + provenance）", () => {
    const r = getDevFixtureTravelInput(FIXTURE, { fixtureAllowed: true });
    expect(r.status).toBe("ready");
    if (r.status === "ready") {
      expect(r.input).toBe(FIXTURE);
      expect(r.provenance.sources).toEqual(["dev_fixture"]);
      expect(r.provenance.realOnly).toBe(false); // 派生
    }
  });
  it("fixtureAllowed false → not_ready（input なし・missing=fixture_not_allowed・realOnly 詐称しない）", () => {
    const r = getDevFixtureTravelInput(FIXTURE, { fixtureAllowed: false });
    expect(r.status).toBe("not_ready");
    if (r.status === "not_ready") {
      expect(r.missing).toContain("fixture_not_allowed");
      expect(r.provenance.realOnly).toBe(false);
      expect("input" in r).toBe(false); // ★ fake fallback input なし
    }
  });
  it("createDevFixtureTravelInputProvider は同等の provider 関数を返す", () => {
    const provider = createDevFixtureTravelInputProvider(FIXTURE);
    expect(provider({ fixtureAllowed: true }).status).toBe("ready");
    expect(provider({ fixtureAllowed: false }).status).toBe("not_ready");
  });
});

describe("2. provenance: realOnly は sources 由来・詐称を弾く", () => {
  it("deriveRealOnly / isRealOnlyProvenance は sources から派生", () => {
    expect(deriveRealOnly(["dev_fixture"])).toBe(false);
    expect(deriveRealOnly(["session_slots", "user_intake"])).toBe(true);
    expect(isRealOnlyProvenance({ sources: ["dev_fixture"], realOnly: true })).toBe(false); // claimed true でも sources 優先
    expect(isRealOnlyProvenance({ sources: ["session_slots"], realOnly: false })).toBe(true);
  });
  it("validateTravelInputProvenance: realOnly は sources 由来であるべき（詐称は invalid）", () => {
    expect(validateTravelInputProvenance({ sources: ["dev_fixture"], realOnly: false })).toBe(true);
    expect(validateTravelInputProvenance({ sources: ["dev_fixture"], realOnly: true })).toBe(false); // ★ 詐称 fail
    expect(validateTravelInputProvenance({ sources: ["session_slots"], realOnly: true })).toBe(true);
    expect(validateTravelInputProvenance({ sources: ["session_slots"], realOnly: false })).toBe(false);
  });
  it("realOnly cannot be true with dev_fixture source", () => {
    const p: TravelInputProvenance = { sources: ["dev_fixture"], realOnly: true };
    expect(isRealOnlyProvenance(p)).toBe(false);
    expect(validateTravelInputProvenance(p)).toBe(false);
  });
});

describe("3. assertNoFixtureSource: production-like guard", () => {
  it("dev_fixture を含むと throw（claimed realOnly に関わらず）", () => {
    expect(() => assertNoFixtureSource({ sources: ["dev_fixture"], realOnly: false })).toThrow();
    expect(() => assertNoFixtureSource({ sources: ["dev_fixture"], realOnly: true })).toThrow(); // 詐称でも拒否
  });
  it("real source のみなら通過", () => {
    expect(() => assertNoFixtureSource({ sources: ["session_slots", "user_intake"], realOnly: true })).not.toThrow();
  });
});

describe("4. provider は input までで display 出力を返さない", () => {
  it("ready/not_ready result に displayPacket/projection/cues/diagnostics field が無い", () => {
    const ready = getDevFixtureTravelInput(FIXTURE, { fixtureAllowed: true });
    const notReady = getDevFixtureTravelInput(FIXTURE, { fixtureAllowed: false });
    for (const r of [ready, notReady] as unknown as Record<string, unknown>[]) {
      for (const k of ["displayPacket", "packet", "projection", "cues", "diagnostics", "authoritative"]) {
        expect(k in r).toBe(false);
      }
    }
  });
  it("決定論: 同一入力 → 深い等価", () => {
    expect(getDevFixtureTravelInput(FIXTURE, { fixtureAllowed: true })).toEqual(getDevFixtureTravelInput(FIXTURE, { fixtureAllowed: true }));
  });
});

describe("5. import 純度（env/Date.now/Math.random/fetch/DB/M2/UI なし）", () => {
  it("provider(-types) は env/nondeterminism/fetch/DB/M2/display を import/使用しない", () => {
    // コメント（説明文に forbidden 語）を除いた実コードのみで判定（既存 plan test 同方式）。
    const stripComments = (raw: string) =>
      raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    for (const f of ["lib/shared/travel/travel-input-provider.ts", "lib/shared/travel/travel-input-provider-types.ts"]) {
      const src = stripComments(readFileSync(resolve(process.cwd(), f), "utf8"));
      expect(src).not.toMatch(/process\.env/);
      expect(src).not.toMatch(/Date\.now|Math\.random/);
      expect(src).not.toMatch(/\bfetch\(/);
      expect(src).not.toMatch(/supabase/i);
      expect(src).not.toMatch(/from ["']next/);
      expect(src).not.toMatch(/from ["'][^"']*(components|app\/|fit-core|plan-intelligence|engine-consume|coalter)/);
    }
  });
});
