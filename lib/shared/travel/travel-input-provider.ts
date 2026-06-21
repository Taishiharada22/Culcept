/**
 * T11-E-C — Travel input provider helpers（**pure・未配線**）
 *
 * 設計: travel-input-provider-types.ts + provider interface design（+ CEO/GPT 修正: realOnly は sources 由来・詐称を fail-closed）
 *
 * 役割: dev fixture provider（決定論 fixture input を honest provenance で供給・gate で fail-closed）と
 *   provenance 検証 helper（realOnly を sources から派生・dev_fixture を production-like guard で拒否）。
 *
 * 厳守（純・決定論・境界）:
 *   - **env / process.env / Date.now / Math.random / fetch / DB / M2 / route・weather・place live なし**。
 *   - **display packet / projection / cues を返さない**（input までの provider）。
 *   - fixture 入力は **引数で受ける**（app fixture を import しない＝lib は pure）。
 *   - import は provider 型 / engine input 型のみ。
 */

import type { TravelPlanEngineInput } from "./engine-types";
import type {
  TravelInputProvenance,
  TravelInputProvider,
  TravelInputProviderGate,
  TravelInputResult,
  TravelInputSourceKind,
} from "./travel-input-provider-types";

// ─────────────────────────────────────────────────────────────────────────────
// provenance 検証（realOnly は sources 由来・hand-authored flag を信用しない）
// ─────────────────────────────────────────────────────────────────────────────

/** ★ realOnly の真値を **sources から派生**（dev_fixture を含めば real でない）。 */
export function deriveRealOnly(sources: readonly TravelInputSourceKind[]): boolean {
  return !sources.includes("dev_fixture");
}

/** provenance が（claimed flag でなく sources 由来で）real_only か。 */
export function isRealOnlyProvenance(provenance: TravelInputProvenance): boolean {
  return deriveRealOnly(provenance.sources);
}

/**
 * provenance の整合検証: `realOnly` は sources 由来であるべき。
 *   dev_fixture を含むのに realOnly=true（詐称）等は **invalid（fail-closed）**。
 */
export function validateTravelInputProvenance(provenance: TravelInputProvenance): boolean {
  return provenance.realOnly === deriveRealOnly(provenance.sources);
}

/**
 * production-like guard: **sources に dev_fixture があれば throw**（claimed realOnly に関わらず）。
 *   fixture が real を騙る経路を構造的に塞ぐ。
 */
export function assertNoFixtureSource(provenance: TravelInputProvenance): void {
  if (provenance.sources.includes("dev_fixture")) {
    throw new Error("travel-input-provider: dev_fixture source rejected (real_only required)");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// dev fixture provider（dev-only・fixture を引数で受ける）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * dev fixture input を gate に応じて供給 or 拒否。
 *   - `fixtureAllowed === true`  → ready（input + provenance.sources=["dev_fixture"]・realOnly は派生で false）。
 *   - `fixtureAllowed === false` → not_ready（missing=["fixture_not_allowed"]・**input なし**・realOnly 詐称しない）。
 *   ★ fixture を silently substitute しない・partial から fake input を作らない。
 */
export function getDevFixtureTravelInput(
  fixtureInput: TravelPlanEngineInput,
  gate: TravelInputProviderGate,
): TravelInputResult {
  const sources: TravelInputSourceKind[] = ["dev_fixture"];
  const provenance: TravelInputProvenance = { sources, realOnly: deriveRealOnly(sources) };
  if (gate.fixtureAllowed) {
    return { status: "ready", input: fixtureInput, provenance };
  }
  return { status: "not_ready", provenance, missing: ["fixture_not_allowed"] };
}

/** dev fixture provider を生成（fixture input を束ねた provider 関数）。 */
export function createDevFixtureTravelInputProvider(fixtureInput: TravelPlanEngineInput): TravelInputProvider {
  return (gate) => getDevFixtureTravelInput(fixtureInput, gate);
}
