/**
 * [CEO lock 2026-04-20 M0-4 #4] LLM 入力圧縮 — 生テキスト非混入の検証。
 */

import { describe, expect, it } from "vitest";
import { compressForTodayReader } from "@/lib/coalter/understanding/compressTodayInput";
import { MATURE_BUNDLE, SPARSE_BUNDLE } from "./fixtures/pairs";

describe("compressForTodayReader", () => {
  it("Mature: turn body / displayName / narratives / wearHistory を含まない", () => {
    const c = compressForTodayReader(MATURE_BUNDLE);
    const json = JSON.stringify(c);

    // raw turn body（MATURE fixture の実文字列）
    expect(json).not.toContain("金曜どこ行く");
    expect(json).not.toContain("近場で落ち着けるところ");
    expect(json).not.toContain("疲れてるから座れるとこ希望");

    // displayName / narrative summary
    expect(json).not.toContain("Aoi");
    expect(json).not.toContain("Ren");
    expect(json).not.toContain("急かされると自分が崩れる");
    expect(json).not.toContain("箱根一泊");

    // wear / calendar details
    expect(json).not.toContain("歯科");
    expect(json).not.toContain("outfitTag");
  });

  it("Mature: 集約 signal が正しく反映される", () => {
    const c = compressForTodayReader(MATURE_BUNDLE);
    expect(c.energyLevel).toBe("mid");
    expect(c.conversationArc).toBe("expanding");
    // "疲れてるから..." turn 1 本 → some (hits=1)
    expect(c.fatigueSignal).toBe("some");
    expect(c.celebrationSignal).toBe(false);
    // A: caution_vs_stimulus = -0.62（逆側）→ false
    // B: novelty_vs_familiarity = 0.5 conf 0.6 → true
    expect(c.renLeaning.a).toBe(false);
    expect(c.renLeaning.b).toBe(true);
    expect(c.calendarDensity.a).toBe("light");
    expect(c.calendarDensity.b).toBe("medium");
    // unspokenDesires は両者の短文 merge
    expect(c.unspokenDesires.length).toBeGreaterThan(0);
    expect(c.unspokenDesires.length).toBeLessThanOrEqual(6);
  });

  it("Sparse: fatigue / celebration / renLeaning 全部 false 系に落ちる", () => {
    const c = compressForTodayReader(SPARSE_BUNDLE);
    expect(c.fatigueSignal).toBe("none");
    expect(c.celebrationSignal).toBe(false);
    expect(c.renLeaning.a).toBe(false);
    expect(c.renLeaning.b).toBe(false);
    expect(c.unspokenDesires).toEqual([]);
  });

  it("決定論: 同 bundle で 2 回圧縮 deep equal", () => {
    expect(compressForTodayReader(MATURE_BUNDLE)).toEqual(
      compressForTodayReader(MATURE_BUNDLE),
    );
  });
});
