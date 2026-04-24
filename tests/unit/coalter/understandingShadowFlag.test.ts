/**
 * CoAlter B-5 — `understandingShadowMovie` flag invariant test
 *
 * 目的:
 *   Step B β 範囲で追加した `COALTER_FLAGS.understandingShadowMovie` flag が
 *   「既定 OFF / env で ON 可能」の 2 挙動を厳守していることを固定する。
 *
 *   これは B-5 の behavior invariant の最小担保。
 *   engine.ts 内の `runMovieShadowUnderstanding` は flag OFF 時に即 return する
 *   ため、この flag が default false である限り、movie V2 経路の call flow は
 *   1 bit も変化しない（§11.A 遵守）。
 *
 *   engine / movieOrchestrator level の invariant は既存 1111 tests で担保済み
 *   （B-5 commit 後も `npx vitest run tests/unit/coalter/` で全件 PASS）。
 *   本ファイルはその上澄み: flag 自体の contract を壊さないための 1 本。
 *
 * 注意:
 *   flags.ts の `envBool` は呼ばれるたびに process.env を読みに行くため、
 *   vitest の beforeEach/afterEach で env を復元すれば汚染は残らない。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { COALTER_FLAGS } from "@/lib/coalter/flags";

describe("COALTER_FLAGS.understandingShadowMovie — B-5 flag invariant", () => {
  const ENV_KEY = "COALTER_UNDERSTANDING_SHADOW_MOVIE";
  const originalValue = process.env[ENV_KEY];

  beforeEach(() => {
    delete process.env[ENV_KEY];
  });

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalValue;
    }
  });

  it("default は OFF（env 未設定時は false）", () => {
    expect(COALTER_FLAGS.understandingShadowMovie).toBe(false);
  });

  it("env=\"true\" で ON になる", () => {
    process.env[ENV_KEY] = "true";
    expect(COALTER_FLAGS.understandingShadowMovie).toBe(true);
  });

  it("env=\"1\" でも ON になる", () => {
    process.env[ENV_KEY] = "1";
    expect(COALTER_FLAGS.understandingShadowMovie).toBe(true);
  });

  it("env=\"false\" で OFF のまま", () => {
    process.env[ENV_KEY] = "false";
    expect(COALTER_FLAGS.understandingShadowMovie).toBe(false);
  });

  it("env=\"0\" でも OFF のまま", () => {
    process.env[ENV_KEY] = "0";
    expect(COALTER_FLAGS.understandingShadowMovie).toBe(false);
  });

  it("不正値は fallback (default OFF) に落ちる", () => {
    process.env[ENV_KEY] = "maybe";
    expect(COALTER_FLAGS.understandingShadowMovie).toBe(false);
  });
});
