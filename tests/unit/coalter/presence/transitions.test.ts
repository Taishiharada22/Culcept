/**
 * Stage 2 L2-c — 9×9 transitions matrix 網羅 test
 *
 * plan §5.3 Gate:
 *   - 9×9 許可 matrix の網羅性 (穴なし、対称性は不要)
 */

import { describe, it, expect } from "vitest";

import { PRESENCE_STATES, type PresenceState } from "@/lib/coalter/presence/types";
import {
  ALLOWED_TRANSITIONS,
  isTransitionAllowed,
  iterateTransitionCells,
} from "@/lib/coalter/presence/transitions";

describe("L2-c transitions matrix — 9×9 網羅性", () => {
  it("81 セル全て boolean で埋まっている", () => {
    let count = 0;
    for (const cell of iterateTransitionCells()) {
      expect(typeof cell.allowed).toBe("boolean");
      count++;
    }
    expect(count).toBe(81);
  });

  it("全 9 state に許可遷移先が定義されている", () => {
    for (const state of PRESENCE_STATES) {
      expect(ALLOWED_TRANSITIONS[state]).toBeDefined();
    }
  });

  it("S0 は S1, S2, S8 への遷移許可 (§8.3 / §8.4 critical 短縮 / §8.5)", () => {
    expect(isTransitionAllowed("S0", "S1")).toBe(true);
    expect(isTransitionAllowed("S0", "S2")).toBe(true);
    expect(isTransitionAllowed("S0", "S8")).toBe(true);
    // 他は不許可
    expect(isTransitionAllowed("S0", "S3")).toBe(false);
    expect(isTransitionAllowed("S0", "S4")).toBe(false);
    expect(isTransitionAllowed("S0", "S5")).toBe(false);
    expect(isTransitionAllowed("S0", "S6")).toBe(false);
    expect(isTransitionAllowed("S0", "S7")).toBe(false);
    // 同一 state は不許可
    expect(isTransitionAllowed("S0", "S0")).toBe(false);
  });

  it("S1 は S2, S8 のみ (consent 通過 / 退出)", () => {
    expect(isTransitionAllowed("S1", "S2")).toBe(true);
    expect(isTransitionAllowed("S1", "S8")).toBe(true);
    for (const t of ["S0", "S1", "S3", "S4", "S5", "S6", "S7"] as PresenceState[]) {
      expect(isTransitionAllowed("S1", t)).toBe(false);
    }
  });

  it("S2/S3/S4 は次状態 + S8 のみ", () => {
    // S2 → S3 / S8
    expect(isTransitionAllowed("S2", "S3")).toBe(true);
    expect(isTransitionAllowed("S2", "S8")).toBe(true);
    // S3 → S4 / S8
    expect(isTransitionAllowed("S3", "S4")).toBe(true);
    expect(isTransitionAllowed("S3", "S8")).toBe(true);
    // S4 → S5 / S8
    expect(isTransitionAllowed("S4", "S5")).toBe(true);
    expect(isTransitionAllowed("S4", "S8")).toBe(true);
  });

  it("S5 は S6, S8 (§8.3 提案価値低時 S5→S8 直行)", () => {
    expect(isTransitionAllowed("S5", "S6")).toBe(true);
    expect(isTransitionAllowed("S5", "S8")).toBe(true);
    // S5 → S7 直接は禁止 (S6 経由のみ)
    expect(isTransitionAllowed("S5", "S7")).toBe(false);
  });

  it("S6 は S5, S7, S8 (UI spec §4.3.7 3 経路)", () => {
    expect(isTransitionAllowed("S6", "S5")).toBe(true);
    expect(isTransitionAllowed("S6", "S7")).toBe(true);
    expect(isTransitionAllowed("S6", "S8")).toBe(true);
  });

  it("S7 は S8 のみ (承認 / 不承認 / 閉じる いずれも S8)", () => {
    expect(isTransitionAllowed("S7", "S8")).toBe(true);
    for (const t of ["S0", "S1", "S2", "S3", "S4", "S5", "S6", "S7"] as PresenceState[]) {
      expect(isTransitionAllowed("S7", t)).toBe(false);
    }
  });

  it("S8 は S0 のみ (再起動 = 新しい S0)", () => {
    expect(isTransitionAllowed("S8", "S0")).toBe(true);
    for (const t of ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"] as PresenceState[]) {
      expect(isTransitionAllowed("S8", t)).toBe(false);
    }
  });

  it("任意状態 → S8 は §8.5 で許可 (S0/S8 を除く全 7 state から)", () => {
    const exitableFromStates: PresenceState[] = [
      "S1",
      "S2",
      "S3",
      "S4",
      "S5",
      "S6",
      "S7",
    ];
    for (const from of exitableFromStates) {
      expect(isTransitionAllowed(from, "S8")).toBe(true);
    }
    // S0 → S8 も §8.5 で許可 (任意状態 = 全状態)
    expect(isTransitionAllowed("S0", "S8")).toBe(true);
    // S8 → S8 は self-loop なので不許可
    expect(isTransitionAllowed("S8", "S8")).toBe(false);
  });

  it("逆方向遷移は基本的に禁止 (例外: S6→S5 のみ、UI spec §4.3.7)", () => {
    expect(isTransitionAllowed("S6", "S5")).toBe(true); // 例外
    // 他の逆方向はすべて禁止
    expect(isTransitionAllowed("S2", "S1")).toBe(false);
    expect(isTransitionAllowed("S3", "S2")).toBe(false);
    expect(isTransitionAllowed("S4", "S3")).toBe(false);
    expect(isTransitionAllowed("S5", "S4")).toBe(false);
    expect(isTransitionAllowed("S7", "S6")).toBe(false);
  });

  it("許可セル総数: §8.3 + §8.4 + §8.5 + §8.6 + §4.3.7 の総和", () => {
    let allowed = 0;
    for (const cell of iterateTransitionCells()) {
      if (cell.allowed) allowed++;
    }
    // S0:3 + S1:2 + S2:2 + S3:2 + S4:2 + S5:2 + S6:3 + S7:1 + S8:1 = 18
    expect(allowed).toBe(18);
  });
});
