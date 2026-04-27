/**
 * Stage 2 L2-f — SharedState / LocalState 網羅性 + overlap test
 *
 * plan §5.6 Gate:
 *   - shared / local 分類の網羅性
 *   - SharedState は runtime §2.1.1 9 件すべて含む
 *   - LocalState は §2.1.2 5 件すべて含む
 *   - shared と local の overlap ゼロ (構造的検証)
 */

import { describe, it, expect } from "vitest";

import {
  SHARED_STATE_KEYS,
  initialSharedState,
  type SharedState,
} from "@/lib/coalter/presence/sharedState";
import {
  LOCAL_STATE_KEYS,
  initialLocalState,
  type LocalState,
} from "@/lib/coalter/presence/localState";

describe("L2-f SharedState — runtime §2.1.1 9 件網羅", () => {
  it("SHARED_STATE_KEYS は 9 件 (availability / presenceState / actionMode / speechCard / lastChipTap / memorySurface / proposalCard / handoffStatus / mode)", () => {
    expect(SHARED_STATE_KEYS).toHaveLength(9);
    expect([...SHARED_STATE_KEYS].sort()).toEqual(
      [
        "availability",
        "presenceState",
        "actionMode",
        "speechCard",
        "lastChipTap",
        "memorySurface",
        "proposalCard",
        "handoffStatus",
        "mode",
      ].sort(),
    );
  });

  it("初期 SharedState は inactive / S0 / 通常モードで開始", () => {
    const s = initialSharedState();
    expect(s.availability).toBe("inactive");
    expect(s.presenceState).toBe("S0");
    expect(s.mode).toBe("normal");
    expect(s.serverTimestamp).toBe(0);
  });

  it("初期 SharedState の null フィールド (speechCard / lastChipTap / proposalCard / handoffStatus / actionMode)", () => {
    const s = initialSharedState();
    expect(s.speechCard).toBeNull();
    expect(s.lastChipTap).toBeNull();
    expect(s.proposalCard).toBeNull();
    expect(s.handoffStatus).toBeNull();
    expect(s.actionMode).toBeNull();
  });

  it("初期 SharedState の memorySurface は空配列", () => {
    expect(initialSharedState().memorySurface).toHaveLength(0);
  });

  it("各 SHARED_STATE_KEYS が初期 state に存在 (網羅 invariant)", () => {
    const s = initialSharedState();
    for (const key of SHARED_STATE_KEYS) {
      expect(key in s).toBe(true);
    }
  });
});

describe("L2-f LocalState — runtime §2.1.2 列挙", () => {
  it("LOCAL_STATE_KEYS は 6 件 (input / hover / focus / tooltips / scroll / animations)", () => {
    expect(LOCAL_STATE_KEYS).toHaveLength(6);
    expect([...LOCAL_STATE_KEYS].sort()).toEqual(
      [
        "inputDraft",
        "hoverElementId",
        "focusElementId",
        "tooltipsOpen",
        "scrollY",
        "animationsInFlight",
      ].sort(),
    );
  });

  it("初期 LocalState は空 (inputDraft='', hover/focus null, set 空, scroll 0)", () => {
    const s = initialLocalState();
    expect(s.inputDraft).toBe("");
    expect(s.hoverElementId).toBeNull();
    expect(s.focusElementId).toBeNull();
    expect(s.tooltipsOpen.size).toBe(0);
    expect(s.scrollY).toBe(0);
    expect(s.animationsInFlight.size).toBe(0);
  });
});

describe("L2-f shared と local の overlap ゼロ (§2.1.1 vs §2.1.2 構造的分離)", () => {
  it("SHARED_STATE_KEYS と LOCAL_STATE_KEYS に共通要素なし", () => {
    const sharedSet = new Set<string>(SHARED_STATE_KEYS as ReadonlyArray<string>);
    for (const lk of LOCAL_STATE_KEYS) {
      expect(sharedSet.has(lk as string)).toBe(false);
    }
    const localSet = new Set<string>(LOCAL_STATE_KEYS as ReadonlyArray<string>);
    for (const sk of SHARED_STATE_KEYS) {
      expect(localSet.has(sk as string)).toBe(false);
    }
  });

  it("shape 上、SharedState と LocalState で同一フィールド名が出現しない (型外 invariant)", () => {
    const shared = initialSharedState();
    const local = initialLocalState();
    const sharedKeys = new Set(Object.keys(shared));
    const localKeys = new Set(Object.keys(local));
    for (const k of localKeys) {
      expect(sharedKeys.has(k)).toBe(false);
    }
  });

  it("local state は server に同期しない (§2.1.2 不可侵): inputDraft / scrollY 等が SharedState 型に登場しない", () => {
    // type-level 検証 (compile-time): SharedState に inputDraft / scrollY が **ない** ことを
    // runtime で確認するために型 assertion で代替
    const shared: SharedState = initialSharedState();
    expect("inputDraft" in shared).toBe(false);
    expect("scrollY" in shared).toBe(false);
    expect("hoverElementId" in shared).toBe(false);
  });
});
