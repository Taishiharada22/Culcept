/**
 * [CEO lock 2026-04-20 M0-5] testkit の決定性 + strategy 分散の検証。
 */

import { describe, expect, it } from "vitest";
import {
  STUB_STRATEGIES,
  makeStubClient,
} from "@/lib/coalter/understanding/__testkit__/adversarialStubs";
import {
  buildBootstrapMatrix,
  buildSyntheticBundle,
} from "@/lib/coalter/understanding/__testkit__/syntheticPairs";
import { compareTodayReaders } from "@/lib/coalter/understanding/compareTodayReaders";
import { compressForTodayReader } from "@/lib/coalter/understanding/compressTodayInput";

const FIXED_NOW = "2026-04-20T12:00:00Z";

describe("syntheticPairs", () => {
  it("bootstrap matrix = 20 件、全 id ユニーク", () => {
    const cases = buildBootstrapMatrix();
    expect(cases.length).toBe(20);
    const ids = new Set(cases.map((c) => c.id));
    expect(ids.size).toBe(20);
  });

  it("同パラメタで 2 回ビルド deep equal（決定論）", () => {
    const p = buildBootstrapMatrix()[0];
    expect(buildSyntheticBundle(p)).toEqual(buildSyntheticBundle(p));
  });

  it("圧縮入力に displayName / raw turn body が漏れない", () => {
    const bundle = buildSyntheticBundle(buildBootstrapMatrix()[5]);
    const compressed = compressForTodayReader(bundle);
    const json = JSON.stringify(compressed);
    expect(json).not.toContain("SynthA");
    expect(json).not.toContain("SynthB");
    expect(json).not.toContain("u_syn_");
    expect(json).not.toContain("だるい");
    expect(json).not.toContain("眠い");
  });
});

describe("adversarial stubs", () => {
  it("5 strategy 全部 loadable, Promise<candidate> 返す", async () => {
    const bundle = buildSyntheticBundle(buildBootstrapMatrix()[0]);
    const input = compressForTodayReader(bundle);
    for (const strategy of STUB_STRATEGIES) {
      const client = makeStubClient(strategy);
      const r = await client.infer(input);
      expect(r.mode).toBeDefined();
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("copycat: modeAgreement が常に true（rule-based を再現できる上限 sanity）", async () => {
    const cases = buildBootstrapMatrix();
    let allAgree = true;
    for (const p of cases) {
      const bundle = buildSyntheticBundle(p);
      const c = await compareTodayReaders(bundle, FIXED_NOW, makeStubClient("copycat"));
      if (!c.modeAgreement) {
        allAgree = false;
        break;
      }
    }
    expect(allAgree).toBe(true);
  });

  it("random-deterministic: modeAgreement が 1.0 未満（= 信号が立つ証拠）", async () => {
    const cases = buildBootstrapMatrix();
    let agreeCount = 0;
    for (const p of cases) {
      const bundle = buildSyntheticBundle(p);
      const c = await compareTodayReaders(
        bundle,
        FIXED_NOW,
        makeStubClient("random-deterministic"),
      );
      if (c.modeAgreement) agreeCount += 1;
    }
    expect(agreeCount).toBeLessThan(cases.length);
  });

  it("同 input で 2 回 stub 呼出 deep equal（決定論）", async () => {
    const bundle = buildSyntheticBundle(buildBootstrapMatrix()[3]);
    const input = compressForTodayReader(bundle);
    const c = makeStubClient("random-deterministic");
    const r1 = await c.infer(input);
    const r2 = await c.infer(input);
    expect(r2).toEqual(r1);
  });
});

describe("bootstrap 20x5=100 件の replay が完走", () => {
  it("全件 llmOutcome=ok（stub は例外を投げないため）", async () => {
    const cases = buildBootstrapMatrix();
    let ok = 0;
    let total = 0;
    for (const p of cases) {
      const bundle = buildSyntheticBundle(p);
      for (const strategy of STUB_STRATEGIES) {
        const c = await compareTodayReaders(
          bundle,
          FIXED_NOW,
          makeStubClient(strategy),
        );
        total += 1;
        if (c.llmOutcome === "ok") ok += 1;
      }
    }
    expect(total).toBe(100);
    expect(ok).toBe(100);
  });
});
