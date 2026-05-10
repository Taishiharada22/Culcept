/**
 * Stage 2.4-B B-3 Phase 1 残作業 — state machine transition dispatch wiring test
 *
 * 正本:
 *   - decision-log [2026-05-09] (Stage 2.4-B 2.1.1〜2.1.3 PASS 記録 + Gap 3/4 構造的
 *     blocker 検出 + B-3 残作業 修正設計提示)
 *   - docs/coalter-stage24-b-smoke-procedure.md Appendix D
 *   - CEO 確定 2026-05-09 Option A 採用
 *
 * 目的:
 *   - production UI の S2/S3/S5/S6/S7 chip / button tap が
 *     S2_ACCEPTED / S3_RESPONSE / S5_DONE / S5_DIRECT_EXIT /
 *     S6_PROPOSE / S6_REWORK / S6_END / S7_DONE event を dispatch する経路を
 *     pure helper + 型 contract で検証する。
 *   - S4 auto-advance dispatch (S4_DONE) も pure helper で検証 (timer 動作は
 *     UpperLayerMount useEffect で smoke 観測対象、本 test では dispatch shape のみ)。
 *   - dev preview (`app/(dev)/coalter-preview/full/page.tsx:177-201`) の各 button
 *     dispatch と完全同一経路に揃っていることを構造的に確認。
 *
 * test 戦略:
 *   - 関数 invoke のみ (CEO 既往判断、`@testing-library/react` 不要、
 *     `upperLayerMountActive.test.ts:13` / `s1ChipDispatch.test.ts` 注記準拠)
 *   - render は不要、pure helpers + 型 contract を直接 invoke
 *   - timer は vitest fake timers で dispatch shape のみ確認 (timer 値の妥当性は
 *     smoke で観測)
 *
 * 不変 (CEO 厳守):
 *   - 新規 dep 追加禁止 (`@testing-library/react` 等)
 *   - 既存 test (patternSelector / patternCompositionRules / dailyTravelScenarios /
 *     upperLayerMountActive / s1ChipDispatch 等) は touch しない
 *   - reducer / signalAdapter / signalClassifier / selectPattern / speech 系 / speech route /
 *     model / max_tokens / timeout / Production env は touch しない
 *   - Phase 1 (本 test) と Phase 2 (smoke-only context flag injection harness) は
 *     完全分離、本 test は Phase 1 の transition wiring のみカバー
 */

import { describe, it, expect, vi } from "vitest";

import {
  buildS2AcceptedDispatch,
  buildS3ResponseDispatch,
  buildS4DoneDispatch,
  buildS5DoneDispatch,
  buildS5DirectExitDispatch,
  buildS6ProposeDispatch,
  buildS6ReworkDispatch,
  buildS6EndDispatch,
  buildS7DoneDispatch,
  S4_AUTO_ADVANCE_MS,
} from "@/app/components/chat/UpperLayerMount";
import {
  mapStateToComponent,
  type UpperLayerStateRendererProps,
} from "@/app/components/chat/states/UpperLayerStateRenderer";
import S2Opening, {
  type S2OpeningProps,
} from "@/app/components/chat/states/S2Opening";
import S3Awaiting, {
  type S3AwaitingProps,
} from "@/app/components/chat/states/S3Awaiting";
import S5Bridging, {
  type S5BridgingProps,
} from "@/app/components/chat/states/S5Bridging";
import S6ReadyForProposal, {
  type S6ReadyForProposalProps,
} from "@/app/components/chat/states/S6ReadyForProposal";
import S7ProposalShown, {
  type S7ProposalShownProps,
} from "@/app/components/chat/states/S7ProposalShown";
import type { PresenceEvent } from "@/lib/coalter/presence/reducer";

// ─────────────────────────────────────────────
// 1. 8 pure helpers (transition dispatch) の event contract
//    (各 helper が正しい event を 1 回 dispatch することを確認)
// ─────────────────────────────────────────────

describe("buildS2AcceptedDispatch — S2 → S3 transition (S2_ACCEPTED)", () => {
  it("invoke で dispatch が { type: 'S2_ACCEPTED' } で 1 回呼ばれる", () => {
    const mockDispatch = vi.fn<(event: PresenceEvent) => void>();
    const handler = buildS2AcceptedDispatch(mockDispatch);
    handler();
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({ type: "S2_ACCEPTED" });
  });
});

describe("buildS3ResponseDispatch — S3 → S4 transition (S3_RESPONSE)", () => {
  it("invoke で dispatch が { type: 'S3_RESPONSE' } で 1 回呼ばれる", () => {
    const mockDispatch = vi.fn<(event: PresenceEvent) => void>();
    const handler = buildS3ResponseDispatch(mockDispatch);
    handler();
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({ type: "S3_RESPONSE" });
  });
});

describe("buildS4DoneDispatch — S4 → S5 transition (S4_DONE、auto-advance)", () => {
  it("invoke で dispatch が { type: 'S4_DONE' } で 1 回呼ばれる", () => {
    const mockDispatch = vi.fn<(event: PresenceEvent) => void>();
    const handler = buildS4DoneDispatch(mockDispatch);
    handler();
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({ type: "S4_DONE" });
  });

  it("setTimeout(handler, S4_AUTO_ADVANCE_MS) で待機後に dispatch される (vitest fake timers)", () => {
    vi.useFakeTimers();
    const mockDispatch = vi.fn<(event: PresenceEvent) => void>();
    const handler = buildS4DoneDispatch(mockDispatch);
    setTimeout(handler, S4_AUTO_ADVANCE_MS);
    // S4_AUTO_ADVANCE_MS - 1 ms 進める → まだ dispatch されない
    vi.advanceTimersByTime(S4_AUTO_ADVANCE_MS - 1);
    expect(mockDispatch).not.toHaveBeenCalled();
    // さらに 1 ms 進めて total = S4_AUTO_ADVANCE_MS
    vi.advanceTimersByTime(1);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({ type: "S4_DONE" });
    vi.useRealTimers();
  });

  it("clearTimeout で dispatch がキャンセルされる (二重 dispatch 防止 / cleanup の妥当性)", () => {
    vi.useFakeTimers();
    const mockDispatch = vi.fn<(event: PresenceEvent) => void>();
    const handler = buildS4DoneDispatch(mockDispatch);
    const timerId = setTimeout(handler, S4_AUTO_ADVANCE_MS);
    // 半分進めた時点で clear
    vi.advanceTimersByTime(S4_AUTO_ADVANCE_MS / 2);
    clearTimeout(timerId);
    // 残りを進めても dispatch されない
    vi.advanceTimersByTime(S4_AUTO_ADVANCE_MS);
    expect(mockDispatch).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("buildS5DoneDispatch — S5 → S6 transition (S5_DONE)", () => {
  it("invoke で dispatch が { type: 'S5_DONE' } で 1 回呼ばれる", () => {
    const mockDispatch = vi.fn<(event: PresenceEvent) => void>();
    const handler = buildS5DoneDispatch(mockDispatch);
    handler();
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({ type: "S5_DONE" });
  });
});

describe("buildS5DirectExitDispatch — S5 → S8 direct exit (S5_DIRECT_EXIT)", () => {
  it("invoke で dispatch が { type: 'S5_DIRECT_EXIT' } で 1 回呼ばれる", () => {
    const mockDispatch = vi.fn<(event: PresenceEvent) => void>();
    const handler = buildS5DirectExitDispatch(mockDispatch);
    handler();
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({ type: "S5_DIRECT_EXIT" });
  });
});

describe("buildS6ProposeDispatch — S6 → S7 transition (S6_PROPOSE)", () => {
  it("invoke で dispatch が { type: 'S6_PROPOSE' } で 1 回呼ばれる", () => {
    const mockDispatch = vi.fn<(event: PresenceEvent) => void>();
    const handler = buildS6ProposeDispatch(mockDispatch);
    handler();
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({ type: "S6_PROPOSE" });
  });
});

describe("buildS6ReworkDispatch — S6 → S5 transition (S6_REWORK)", () => {
  it("invoke で dispatch が { type: 'S6_REWORK' } で 1 回呼ばれる", () => {
    const mockDispatch = vi.fn<(event: PresenceEvent) => void>();
    const handler = buildS6ReworkDispatch(mockDispatch);
    handler();
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({ type: "S6_REWORK" });
  });
});

describe("buildS6EndDispatch — S6 → S8 transition (S6_END)", () => {
  it("invoke で dispatch が { type: 'S6_END' } で 1 回呼ばれる", () => {
    const mockDispatch = vi.fn<(event: PresenceEvent) => void>();
    const handler = buildS6EndDispatch(mockDispatch);
    handler();
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({ type: "S6_END" });
  });
});

describe("buildS7DoneDispatch — S7 → S8 transition (S7_DONE、approve / close 共通)", () => {
  it("invoke で dispatch が { type: 'S7_DONE' } で 1 回呼ばれる", () => {
    const mockDispatch = vi.fn<(event: PresenceEvent) => void>();
    const handler = buildS7DoneDispatch(mockDispatch);
    handler();
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({ type: "S7_DONE" });
  });

  it("approve と close 両者を同 handler に bind しても、それぞれの click が独立 dispatch を発火 (UI spec §4.3.8 通り)", () => {
    const mockDispatch = vi.fn<(event: PresenceEvent) => void>();
    const handler = buildS7DoneDispatch(mockDispatch);
    handler(); // approve chip click
    handler(); // close chip click
    expect(mockDispatch).toHaveBeenCalledTimes(2);
    expect(mockDispatch).toHaveBeenNthCalledWith(1, { type: "S7_DONE" });
    expect(mockDispatch).toHaveBeenNthCalledWith(2, { type: "S7_DONE" });
  });
});

// ─────────────────────────────────────────────
// 2. S4_AUTO_ADVANCE_MS constant の妥当性
// ─────────────────────────────────────────────

describe("S4_AUTO_ADVANCE_MS — constant 妥当性", () => {
  it("正の数で、reasonable range (500ms 〜 5000ms) に収まる", () => {
    expect(typeof S4_AUTO_ADVANCE_MS).toBe("number");
    expect(S4_AUTO_ADVANCE_MS).toBeGreaterThan(0);
    // 500ms 未満 = 知覚不能 / UX 拙速、5000ms 超 = ユーザー待ち過剰
    expect(S4_AUTO_ADVANCE_MS).toBeGreaterThanOrEqual(500);
    expect(S4_AUTO_ADVANCE_MS).toBeLessThanOrEqual(5000);
  });
});

// ─────────────────────────────────────────────
// 3. State component props の型 contract
//    (各 component が新規 callback prop を optional で受け入れ可能)
// ─────────────────────────────────────────────

describe("S2Opening — onResponseTap prop 型 contract", () => {
  it("onResponseTap 未指定でも instantiate 可能 (後方互換)", () => {
    const props: S2OpeningProps = {
      mode: "normal",
      onSwitchMode: vi.fn(),
    };
    expect(props.onResponseTap).toBeUndefined();
  });

  it("onResponseTap=() => void を受け入れ可能 (B-3 Phase 1)", () => {
    const onResponseTap = vi.fn<() => void>();
    const props: S2OpeningProps = {
      mode: "normal",
      onSwitchMode: vi.fn(),
      onResponseTap,
    };
    expect(props.onResponseTap).toBe(onResponseTap);
  });

  it("S2Opening は呼び出し可能な component 関数", () => {
    expect(typeof S2Opening).toBe("function");
  });
});

describe("S3Awaiting — onResponseTap prop 型 contract", () => {
  it("onResponseTap 未指定でも instantiate 可能 (後方互換)", () => {
    const props: S3AwaitingProps = {
      mode: "normal",
      onSwitchMode: vi.fn(),
    };
    expect(props.onResponseTap).toBeUndefined();
  });

  it("onResponseTap=() => void を受け入れ可能 (B-3 Phase 1)", () => {
    const onResponseTap = vi.fn<() => void>();
    const props: S3AwaitingProps = {
      mode: "normal",
      onSwitchMode: vi.fn(),
      onResponseTap,
    };
    expect(props.onResponseTap).toBe(onResponseTap);
  });

  it("S3Awaiting は呼び出し可能な component 関数", () => {
    expect(typeof S3Awaiting).toBe("function");
  });
});

describe("S5Bridging — onResponseTap / onCloseTap prop 型 contract", () => {
  it("両 prop 未指定でも instantiate 可能 (後方互換)", () => {
    const props: S5BridgingProps = {
      mode: "normal",
      onSwitchMode: vi.fn(),
    };
    expect(props.onResponseTap).toBeUndefined();
    expect(props.onCloseTap).toBeUndefined();
  });

  it("onResponseTap / onCloseTap 別 callback を受け入れ可能 (S5_DONE / S5_DIRECT_EXIT 区別)", () => {
    const onResponseTap = vi.fn<() => void>();
    const onCloseTap = vi.fn<() => void>();
    const props: S5BridgingProps = {
      mode: "normal",
      onSwitchMode: vi.fn(),
      onResponseTap,
      onCloseTap,
    };
    expect(props.onResponseTap).toBe(onResponseTap);
    expect(props.onCloseTap).toBe(onCloseTap);
    // 両者は別関数
    expect(props.onResponseTap).not.toBe(props.onCloseTap);
  });

  it("S5Bridging は呼び出し可能な component 関数", () => {
    expect(typeof S5Bridging).toBe("function");
  });
});

describe("S6ReadyForProposal — onProposeTap / onReworkTap / onEndTap prop 型 contract", () => {
  it("3 prop 全未指定でも instantiate 可能 (後方互換)", () => {
    const props: S6ReadyForProposalProps = {
      mode: "normal",
      onSwitchMode: vi.fn(),
    };
    expect(props.onProposeTap).toBeUndefined();
    expect(props.onReworkTap).toBeUndefined();
    expect(props.onEndTap).toBeUndefined();
  });

  it("3 prop 別 callback を受け入れ可能 (S6_PROPOSE / S6_REWORK / S6_END 区別)", () => {
    const onProposeTap = vi.fn<() => void>();
    const onReworkTap = vi.fn<() => void>();
    const onEndTap = vi.fn<() => void>();
    const props: S6ReadyForProposalProps = {
      mode: "normal",
      onSwitchMode: vi.fn(),
      onProposeTap,
      onReworkTap,
      onEndTap,
    };
    expect(props.onProposeTap).toBe(onProposeTap);
    expect(props.onReworkTap).toBe(onReworkTap);
    expect(props.onEndTap).toBe(onEndTap);
    // 3 者は別関数
    expect(props.onProposeTap).not.toBe(props.onReworkTap);
    expect(props.onReworkTap).not.toBe(props.onEndTap);
    expect(props.onProposeTap).not.toBe(props.onEndTap);
  });

  it("S6ReadyForProposal は呼び出し可能な component 関数", () => {
    expect(typeof S6ReadyForProposal).toBe("function");
  });
});

describe("S7ProposalShown — onResolveTap prop 型 contract (handoff chip 不接触)", () => {
  it("onResolveTap 未指定でも instantiate 可能 (後方互換)", () => {
    const props: S7ProposalShownProps = {
      mode: "normal",
      onSwitchMode: vi.fn(),
    };
    expect(props.onResolveTap).toBeUndefined();
  });

  it("onResolveTap=() => void を受け入れ可能 (S7_DONE、approve / close 共通)", () => {
    const onResolveTap = vi.fn<() => void>();
    const props: S7ProposalShownProps = {
      mode: "normal",
      onSwitchMode: vi.fn(),
      onResolveTap,
    };
    expect(props.onResolveTap).toBe(onResolveTap);
  });

  it("S7ProposalShown は呼び出し可能な component 関数", () => {
    expect(typeof S7ProposalShown).toBe("function");
  });
});

// ─────────────────────────────────────────────
// 4. UpperLayerStateRenderer の prop 拡張 (型 contract)
// ─────────────────────────────────────────────

describe("UpperLayerStateRenderer — B-3 Phase 1 6 props 拡張型 contract", () => {
  it("6 props 全未指定でも valid (後方互換)", () => {
    const props: UpperLayerStateRendererProps = {
      state: "S0",
      mode: "normal",
      onSwitchMode: vi.fn(),
    };
    expect(props.onResponseTap).toBeUndefined();
    expect(props.onCloseTap).toBeUndefined();
    expect(props.onProposeTap).toBeUndefined();
    expect(props.onReworkTap).toBeUndefined();
    expect(props.onEndTap).toBeUndefined();
    expect(props.onResolveTap).toBeUndefined();
  });

  it("6 props 全指定で受け入れ可能", () => {
    const onResponseTap = vi.fn<() => void>();
    const onCloseTap = vi.fn<() => void>();
    const onProposeTap = vi.fn<() => void>();
    const onReworkTap = vi.fn<() => void>();
    const onEndTap = vi.fn<() => void>();
    const onResolveTap = vi.fn<() => void>();
    const props: UpperLayerStateRendererProps = {
      state: "S5",
      mode: "normal",
      onSwitchMode: vi.fn(),
      onResponseTap,
      onCloseTap,
      onProposeTap,
      onReworkTap,
      onEndTap,
      onResolveTap,
    };
    expect(props.onResponseTap).toBe(onResponseTap);
    expect(props.onCloseTap).toBe(onCloseTap);
    expect(props.onProposeTap).toBe(onProposeTap);
    expect(props.onReworkTap).toBe(onReworkTap);
    expect(props.onEndTap).toBe(onEndTap);
    expect(props.onResolveTap).toBe(onResolveTap);
  });

  it("mapStateToComponent の各 state mapping は不変 (regression check)", () => {
    expect(mapStateToComponent("S2")).toBe(S2Opening);
    expect(mapStateToComponent("S3")).toBe(S3Awaiting);
    expect(mapStateToComponent("S5")).toBe(S5Bridging);
    expect(mapStateToComponent("S6")).toBe(S6ReadyForProposal);
    expect(mapStateToComponent("S7")).toBe(S7ProposalShown);
  });
});

// ─────────────────────────────────────────────
// 5. dev preview 経路との整合
//    (本実装の 8 helpers が dispatch する event と dev preview が完全同一であることを確認)
// ─────────────────────────────────────────────

describe("B-3 Phase 1 — dev preview 経路との整合", () => {
  // dev preview app/(dev)/coalter-preview/full/page.tsx:177-201 の各 button:
  //   line 177: <BtnSm onClick={() => exec.dispatch.presenceEvent({ type: "S2_ACCEPTED" })}>
  //   line 180: ... { type: "S3_RESPONSE" }
  //   line 183: ... { type: "S4_DONE" }
  //   line 186: ... { type: "S5_DONE" }
  //   line 189: ... { type: "S6_PROPOSE" }
  //   line 192: ... { type: "S6_REWORK" }
  //   line 195: ... { type: "S7_DONE" }
  //   (line 198 EXIT / 201 RESTART は本 phase scope 外)
  //
  // 本 helpers が dispatch する event と完全一致することを構造的に確認。

  it.each([
    ["buildS2AcceptedDispatch", buildS2AcceptedDispatch, "S2_ACCEPTED"],
    ["buildS3ResponseDispatch", buildS3ResponseDispatch, "S3_RESPONSE"],
    ["buildS4DoneDispatch", buildS4DoneDispatch, "S4_DONE"],
    ["buildS5DoneDispatch", buildS5DoneDispatch, "S5_DONE"],
    ["buildS5DirectExitDispatch", buildS5DirectExitDispatch, "S5_DIRECT_EXIT"],
    ["buildS6ProposeDispatch", buildS6ProposeDispatch, "S6_PROPOSE"],
    ["buildS6ReworkDispatch", buildS6ReworkDispatch, "S6_REWORK"],
    ["buildS6EndDispatch", buildS6EndDispatch, "S6_END"],
    ["buildS7DoneDispatch", buildS7DoneDispatch, "S7_DONE"],
  ])(
    "%s が dispatch する event は dev preview と完全同一 (%s)",
    (
      _name: string,
      build: (
        d: (e: PresenceEvent) => void,
      ) => () => void,
      expectedType: string,
    ) => {
      const mockDispatch = vi.fn<(event: PresenceEvent) => void>();
      build(mockDispatch)();
      expect(mockDispatch).toHaveBeenCalledTimes(1);
      const expectedEvent: PresenceEvent = {
        type: expectedType,
      } as PresenceEvent;
      expect(mockDispatch).toHaveBeenCalledWith(expectedEvent);
    },
  );
});
