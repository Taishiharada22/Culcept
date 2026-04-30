/**
 * Stage 2 L2-b — signalClassifier 強度分類 test
 *
 * plan §5.2 Gate:
 *   - strong / soft / none 分類
 *   - S1 スキップは critical のみ (runtime §1.5)
 */

import { describe, it, expect } from "vitest";

import {
  classifySignalStrength,
  shouldSkipS1,
} from "@/lib/coalter/presence/signalClassifier";

describe("L2-b classifySignalStrength — runtime §1.2 強度階層", () => {
  it("explicit → strong (無条件)", () => {
    expect(classifySignalStrength({ kind: "explicit" })).toBe("strong");
  });

  it("critical → strong (緊急、無条件)", () => {
    expect(classifySignalStrength({ kind: "critical" })).toBe("strong");
  });

  it("mode_promotion → strong", () => {
    expect(classifySignalStrength({ kind: "mode_promotion" })).toBe("strong");
  });

  it("manual_restart → strong", () => {
    expect(classifySignalStrength({ kind: "manual_restart" })).toBe("strong");
  });

  it("implicit (score > 0) → soft", () => {
    expect(classifySignalStrength({ kind: "implicit", score: 0.5 })).toBe(
      "soft",
    );
    expect(classifySignalStrength({ kind: "implicit", score: 0.01 })).toBe(
      "soft",
    );
    expect(classifySignalStrength({ kind: "implicit", score: 1.0 })).toBe(
      "soft",
    );
  });

  it("implicit (score = 0) → none", () => {
    expect(classifySignalStrength({ kind: "implicit", score: 0 })).toBe("none");
  });

  it("implicit (score 未指定) → none", () => {
    expect(classifySignalStrength({ kind: "implicit" })).toBe("none");
  });

  it("implicit (score < 0、defensive) → none", () => {
    expect(classifySignalStrength({ kind: "implicit", score: -0.1 })).toBe(
      "none",
    );
  });

  it("未知 kind (型外) → none (defensive、plan §5.2 Gate)", () => {
    // @ts-expect-error - 意図的に型外の値を渡して runtime defensive を test
    expect(classifySignalStrength({ kind: "unknown_kind" })).toBe("none");
  });
});

describe("L2-b shouldSkipS1 — runtime §1.5 S1 短縮判定", () => {
  it("critical のみ S1 スキップ (S0 → S2 直接、v1.1 §8.4)", () => {
    expect(shouldSkipS1("critical")).toBe(true);
  });

  it("explicit は S1 経由 (consent チェック維持、§1.5 重要原則)", () => {
    expect(shouldSkipS1("explicit")).toBe(false);
  });

  it("implicit / mode_promotion / manual_restart は S1 経由", () => {
    expect(shouldSkipS1("implicit")).toBe(false);
    expect(shouldSkipS1("mode_promotion")).toBe(false);
    expect(shouldSkipS1("manual_restart")).toBe(false);
  });
});
