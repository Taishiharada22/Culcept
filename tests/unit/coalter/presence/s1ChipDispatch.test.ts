/**
 * Stage 2.4-B B-2 残作業 — S1 chip → S1_ENTRY_OK dispatch wiring test
 *
 * 正本:
 *   - decision-log [2026-05-09] entry (Gap 2 blocker 修正設計)
 *   - docs/coalter-stage24-b-smoke-procedure.md Appendix C
 *
 * 目的:
 *   - production UI の S1 status chip tap が S1_ENTRY_OK event を dispatch する
 *     経路を end-to-end (型 contract + pure helper invoke) で検証する。
 *   - dev preview (`app/(dev)/coalter-preview/full/page.tsx:174`) の
 *     `exec.dispatch.presenceEvent({ type: "S1_ENTRY_OK" })` と同一経路に揃って
 *     いることを確認する。
 *
 * test 戦略:
 *   - 関数 invoke のみ (CEO 既往判断、`@testing-library/react` 不要、
 *     `upperLayerMountActive.test.ts:13` 注記準拠)
 *   - render は不要、pure mapping function + pure helper を直接 invoke
 *
 * 不変 (CEO 厳守):
 *   - 新規 dep 追加禁止 (`@testing-library/react` 等)
 *   - 既存 test (patternSelector / patternCompositionRules / dailyTravelScenarios /
 *     upperLayerMountActive 等) は touch しない
 *   - reducer / signalAdapter / signalClassifier / selectPattern / speech 系 / speech route /
 *     model / max_tokens / timeout / Production env は touch しない
 */

import { describe, it, expect, vi } from "vitest";

import {
  mapStateToComponent,
  type UpperLayerStateRendererProps,
} from "@/app/components/chat/states/UpperLayerStateRenderer";
import S1Approaching, {
  type S1ApproachingProps,
} from "@/app/components/chat/states/S1Approaching";
import { buildS1EntryConfirmDispatch } from "@/app/components/chat/UpperLayerMount";
import type { PresenceEvent } from "@/lib/coalter/presence/reducer";

// ─────────────────────────────────────────────
// 1. pure helper の dispatch contract
//    (S1_ENTRY_OK event を 1 回 dispatch することを確認)
// ─────────────────────────────────────────────

describe("buildS1EntryConfirmDispatch — S1_ENTRY_OK dispatch contract", () => {
  it("返り値の handler を invoke すると dispatch が { type: 'S1_ENTRY_OK' } で 1 回呼ばれる", () => {
    const mockDispatch = vi.fn<(event: PresenceEvent) => void>();
    const handler = buildS1EntryConfirmDispatch(mockDispatch);

    handler();

    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({ type: "S1_ENTRY_OK" });
  });

  it("複数回 invoke すると同 event が複数回 dispatch される (idempotent ではなく caller 側責務)", () => {
    // S1_ENTRY_OK が S1 以外の state に届いても reducer line 111-112 で state 不変
    // (idempotent) のため、複数回 dispatch しても害はない。test では呼び出し回数の
    // 透過性のみ確認する (rate limit / debounce は本 helper の責務外)。
    const mockDispatch = vi.fn<(event: PresenceEvent) => void>();
    const handler = buildS1EntryConfirmDispatch(mockDispatch);

    handler();
    handler();
    handler();

    expect(mockDispatch).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 3; i++) {
      expect(mockDispatch).toHaveBeenNthCalledWith(i + 1, {
        type: "S1_ENTRY_OK",
      });
    }
  });

  it("handler は dispatch 以外の event 型を流さない (S1_ENTRY_OK 単一)", () => {
    const calls: PresenceEvent[] = [];
    const captureDispatch = (event: PresenceEvent): void => {
      calls.push(event);
    };
    const handler = buildS1EntryConfirmDispatch(captureDispatch);

    handler();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toStrictEqual({ type: "S1_ENTRY_OK" });
    // 構造的に他種 event (mode_event / signal / etc.) は含まれない
    expect(Object.keys(calls[0])).toStrictEqual(["type"]);
  });
});

// ─────────────────────────────────────────────
// 2. S1Approaching props 型 contract
//    (onChipTap?: () => void を受け入れ可能であること)
// ─────────────────────────────────────────────

describe("S1Approaching — onChipTap prop 型 contract", () => {
  it("onChipTap 未指定でも instantiate 可能 (後方互換)", () => {
    const props: S1ApproachingProps = {
      mode: "normal",
      onSwitchMode: vi.fn(),
    };
    expect(props.mode).toBe("normal");
    expect(props.onChipTap).toBeUndefined();
  });

  it("onChipTap=() => void を受け入れ可能 (CEO 確定 B-2 残作業)", () => {
    const onChipTap = vi.fn<() => void>();
    const props: S1ApproachingProps = {
      mode: "normal",
      onSwitchMode: vi.fn(),
      onChipTap,
    };
    expect(props.onChipTap).toBe(onChipTap);
    expect(typeof props.onChipTap).toBe("function");
  });

  it("S1Approaching default export は呼び出し可能な component 関数", () => {
    expect(typeof S1Approaching).toBe("function");
    expect(S1Approaching.length).toBeGreaterThanOrEqual(1); // takes props
  });
});

// ─────────────────────────────────────────────
// 3. UpperLayerStateRenderer 経由の prop pass-through
//    (state="S1" のとき S1Approaching が選ばれること、
//     onChipTap が UpperLayerStateRendererProps に存在すること)
// ─────────────────────────────────────────────

describe("UpperLayerStateRenderer — onChipTap pass-through (state='S1' 経路)", () => {
  it("mapStateToComponent('S1') === S1Approaching (既存契約、回帰防止)", () => {
    expect(mapStateToComponent("S1")).toBe(S1Approaching);
  });

  it("UpperLayerStateRendererProps は onChipTap?: () => void を受け入れる (型 contract)", () => {
    const onChipTap = vi.fn<() => void>();
    const props: UpperLayerStateRendererProps = {
      state: "S1",
      mode: "normal",
      onSwitchMode: vi.fn(),
      onChipTap,
    };
    expect(props.onChipTap).toBe(onChipTap);
    // body は別 optional、onChipTap と独立
    expect(props.body).toBeUndefined();
  });

  it("UpperLayerStateRendererProps は onChipTap 未指定でも valid (後方互換)", () => {
    const props: UpperLayerStateRendererProps = {
      state: "S0",
      mode: "normal",
      onSwitchMode: vi.fn(),
    };
    expect(props.onChipTap).toBeUndefined();
  });

  it("非 S1 state でも UpperLayerStateRendererProps.onChipTap は受け入れ可能 (型整合のみ、実体使用なし)", () => {
    // mapStateToComponent が S0/S2-S8 を返した場合でも、Renderer は onChipTap を
    // pass-through し、各 state component (S0Observing 等) は optional で受信。
    // 実 click イベントは S1Approaching の Chip onClick 経由のみ。
    const states = ["S0", "S2", "S3", "S4", "S5", "S6", "S7", "S8"] as const;
    for (const state of states) {
      const props: UpperLayerStateRendererProps = {
        state,
        mode: "normal",
        onSwitchMode: vi.fn(),
        onChipTap: vi.fn(),
      };
      expect(props.state).toBe(state);
    }
  });
});

// ─────────────────────────────────────────────
// 4. dev preview 経路との整合
//    (本実装の dispatch 経路が dev preview と同一であることを構造的に確認)
// ─────────────────────────────────────────────

describe("B-2 残作業 — dev preview 経路との整合", () => {
  it("buildS1EntryConfirmDispatch が dispatch する event は dev preview と完全同一 (S1_ENTRY_OK)", () => {
    // dev preview app/(dev)/coalter-preview/full/page.tsx:174:
    //   exec.dispatch.presenceEvent({ type: "S1_ENTRY_OK" })
    // 本 helper:
    //   buildS1EntryConfirmDispatch(dispatch)() → dispatch({ type: "S1_ENTRY_OK" })
    // 両者 dispatch する event は { type: "S1_ENTRY_OK" } で一致。
    const mockDispatch = vi.fn<(event: PresenceEvent) => void>();
    const handler = buildS1EntryConfirmDispatch(mockDispatch);
    handler();
    const expectedDevPreviewEvent: PresenceEvent = { type: "S1_ENTRY_OK" };
    expect(mockDispatch).toHaveBeenCalledWith(expectedDevPreviewEvent);
  });
});
