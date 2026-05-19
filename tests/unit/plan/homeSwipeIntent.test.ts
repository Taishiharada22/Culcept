/**
 * Home Swipe Intent — pure logic tests (W1-Home-Swipe)
 *
 * `lib/plan/home-swipe-intent.ts` の evaluateSwipeIntent / applySwipeAction
 * を deterministic に検証。
 *
 * CEO 補正 2026-05-19 必須補正 2 (Gesture 競合対策) の合格判定:
 *   - threshold (画面幅 30%)
 *   - velocity (500 px/s)
 *   - iOS edge back ignore (左端 20px)
 *   - 縦少しスクロールしただけで横遷移しない (threshold + velocity 両方不足 → stay)
 */

import { describe, it, expect } from "vitest";

import {
  evaluateSwipeIntent,
  applySwipeAction,
  type SwipeAction,
} from "@/lib/plan/home-swipe-intent";

const BASE = {
  containerWidth: 400,
  dragStartX: 200, // 中央 (edge back ignore に該当しない)
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// evaluateSwipeIntent
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("evaluateSwipeIntent", () => {
  describe("guard conditions", () => {
    it("containerWidth=0 → stay (測定前)", () => {
      const action = evaluateSwipeIntent({
        ...BASE,
        containerWidth: 0,
        offsetX: -300,
        velocityX: -1000,
      });
      expect(action.kind).toBe("stay");
    });

    it("containerWidth=負 → stay (異常)", () => {
      const action = evaluateSwipeIntent({
        ...BASE,
        containerWidth: -100,
        offsetX: -300,
        velocityX: -1000,
      });
      expect(action.kind).toBe("stay");
    });
  });

  describe("iOS edge back gesture ignore", () => {
    it("dragStartX < 20 + 右方向 drag → ignore", () => {
      const action = evaluateSwipeIntent({
        ...BASE,
        dragStartX: 10,
        offsetX: 150, // 右方向、threshold 超
        velocityX: 600,
      });
      expect(action.kind).toBe("ignore");
    });

    it("dragStartX < 20 でも 左方向 drag は通常判定 (advance)", () => {
      const action = evaluateSwipeIntent({
        ...BASE,
        dragStartX: 10,
        offsetX: -150,
        velocityX: -100,
      });
      expect(action.kind).toBe("advance");
    });

    it("dragStartX = 20 (境界) + 右方向 drag → 通常判定 (ignore でない)", () => {
      // edgeBackIgnorePx = 20 (default)、< 20 のみ ignore
      const action = evaluateSwipeIntent({
        ...BASE,
        dragStartX: 20,
        offsetX: 150,
        velocityX: 0,
      });
      expect(action.kind).toBe("retreat");
    });

    it("dragStartX = 19 (境界内) + 右方向 → ignore", () => {
      const action = evaluateSwipeIntent({
        ...BASE,
        dragStartX: 19,
        offsetX: 150,
        velocityX: 0,
      });
      expect(action.kind).toBe("ignore");
    });

    it("edgeBackIgnorePx を 0 に設定すれば ignore しない", () => {
      const action = evaluateSwipeIntent({
        ...BASE,
        dragStartX: 5,
        offsetX: 150,
        velocityX: 0,
        edgeBackIgnorePx: 0,
      });
      expect(action.kind).toBe("retreat");
    });
  });

  describe("advance (左 swipe / 次 pane へ)", () => {
    it("threshold 超 (offsetFrac=-0.30 ぴったり) → 境界で stay (strict less)", () => {
      const action = evaluateSwipeIntent({
        ...BASE,
        offsetX: -120, // 400 * -0.30
        velocityX: 0,
      });
      expect(action.kind).toBe("stay");
    });

    it("threshold 超 (offsetFrac=-0.31) → advance", () => {
      const action = evaluateSwipeIntent({
        ...BASE,
        offsetX: -125, // 400 * -0.3125
        velocityX: 0,
      });
      expect(action.kind).toBe("advance");
    });

    it("velocity 超 (velocity=-501) で threshold 未満でも advance", () => {
      const action = evaluateSwipeIntent({
        ...BASE,
        offsetX: -10,
        velocityX: -501,
      });
      expect(action.kind).toBe("advance");
    });

    it("velocity=-500 (境界) は advance しない (strict less)", () => {
      const action = evaluateSwipeIntent({
        ...BASE,
        offsetX: -10,
        velocityX: -500,
      });
      expect(action.kind).toBe("stay");
    });
  });

  describe("retreat (右 swipe / 前 pane へ)", () => {
    it("threshold 超 (offsetFrac=0.31) → retreat", () => {
      const action = evaluateSwipeIntent({
        ...BASE,
        offsetX: 125,
        velocityX: 0,
      });
      expect(action.kind).toBe("retreat");
    });

    it("velocity 超 (velocity=501) で threshold 未満でも retreat", () => {
      const action = evaluateSwipeIntent({
        ...BASE,
        offsetX: 10,
        velocityX: 501,
      });
      expect(action.kind).toBe("retreat");
    });
  });

  describe("stay (threshold / velocity 両方不足)", () => {
    it("小さい offset + 低 velocity → stay", () => {
      const action = evaluateSwipeIntent({
        ...BASE,
        offsetX: -10,
        velocityX: -50,
      });
      expect(action.kind).toBe("stay");
    });

    it("offsetX=0 + velocity=0 → stay (tap 等)", () => {
      const action = evaluateSwipeIntent({
        ...BASE,
        offsetX: 0,
        velocityX: 0,
      });
      expect(action.kind).toBe("stay");
    });

    it("CEO 補正: 縦少しスクロールしただけ (横 offset 微小) で stay", () => {
      // 縦 scroll 中の意図しない横 drag 揺れを想定
      const action = evaluateSwipeIntent({
        ...BASE,
        offsetX: -30, // 400 * -0.075 (threshold 未満)
        velocityX: -100, // velocity 未満
      });
      expect(action.kind).toBe("stay");
    });
  });

  describe("custom thresholds (injection)", () => {
    it("thresholdFrac=0.5 にすれば 40% offset でも stay", () => {
      const action = evaluateSwipeIntent({
        ...BASE,
        offsetX: -160, // 400 * -0.4
        velocityX: 0,
        thresholdFrac: 0.5,
      });
      expect(action.kind).toBe("stay");
    });

    it("velocityThreshold=1000 にすれば 600 velocity でも stay", () => {
      const action = evaluateSwipeIntent({
        ...BASE,
        offsetX: -10,
        velocityX: -600,
        velocityThreshold: 1000,
      });
      expect(action.kind).toBe("stay");
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// applySwipeAction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applySwipeAction", () => {
  const advance: SwipeAction = { kind: "advance" };
  const retreat: SwipeAction = { kind: "retreat" };
  const stay: SwipeAction = { kind: "stay" };
  const ignore: SwipeAction = { kind: "ignore" };

  describe("advance", () => {
    it("0 → 1 (paneCount=2)", () => {
      expect(applySwipeAction(0, 2, advance)).toBe(1);
    });

    it("1 → 1 (上限 clamp)", () => {
      expect(applySwipeAction(1, 2, advance)).toBe(1);
    });

    it("0 → 1 → 2 (paneCount=3 想定だが本 wave は 2)", () => {
      expect(applySwipeAction(1, 3, advance)).toBe(2);
    });
  });

  describe("retreat", () => {
    it("1 → 0 (paneCount=2)", () => {
      expect(applySwipeAction(1, 2, retreat)).toBe(0);
    });

    it("0 → 0 (下限 clamp)", () => {
      expect(applySwipeAction(0, 2, retreat)).toBe(0);
    });
  });

  describe("stay / ignore", () => {
    it("stay → 不変", () => {
      expect(applySwipeAction(0, 2, stay)).toBe(0);
      expect(applySwipeAction(1, 2, stay)).toBe(1);
    });

    it("ignore → 不変", () => {
      expect(applySwipeAction(0, 2, ignore)).toBe(0);
      expect(applySwipeAction(1, 2, ignore)).toBe(1);
    });
  });
});
