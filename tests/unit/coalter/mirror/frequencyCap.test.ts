/**
 * CoAlter AOO Phase B B-5a — frequencyCap invariant test
 *
 * 正本: lib/coalter/mirror/frequencyCap.ts
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  incrementEngineInvoked,
  incrementCandidateCount,
  incrementVisibleSpeak,
  isVisibleCapReached,
  getCounters,
  getTimeSinceLastSpeakTurns,
  __resetForTest,
  __getInitialVisibleCapForTest,
} from "@/lib/coalter/mirror/frequencyCap";

describe("B-5a frequencyCap — 初期状態", () => {
  beforeEach(() => __resetForTest());

  it("全 counter 初期 0", () => {
    const c = getCounters();
    expect(c.engineInvokedCount).toBe(0);
    expect(c.candidateCount).toBe(0);
    expect(c.visibleSpeakCount).toBe(0);
    expect(c.lastVisibleSpeakInvokeNumber).toBeNull();
  });

  it("初期状態で visible cap 未到達", () => {
    expect(isVisibleCapReached()).toBe(false);
  });

  it("初期状態で getTimeSinceLastSpeakTurns は MAX_SAFE_INTEGER (Worth Gate 通過させる)", () => {
    expect(getTimeSinceLastSpeakTurns()).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("B-5a frequencyCap — increment 動作", () => {
  beforeEach(() => __resetForTest());

  it("incrementEngineInvoked で engineInvokedCount 増加", () => {
    incrementEngineInvoked();
    expect(getCounters().engineInvokedCount).toBe(1);
    incrementEngineInvoked();
    incrementEngineInvoked();
    expect(getCounters().engineInvokedCount).toBe(3);
  });

  it("incrementCandidateCount で candidateCount 増加", () => {
    incrementCandidateCount();
    incrementCandidateCount();
    expect(getCounters().candidateCount).toBe(2);
    expect(getCounters().engineInvokedCount).toBe(0); // 別 counter
  });

  it("incrementVisibleSpeak で visibleSpeakCount 増加 + lastVisibleSpeakInvokeNumber 更新", () => {
    incrementEngineInvoked();
    incrementEngineInvoked();
    expect(getCounters().lastVisibleSpeakInvokeNumber).toBeNull();
    incrementVisibleSpeak();
    expect(getCounters().visibleSpeakCount).toBe(1);
    expect(getCounters().lastVisibleSpeakInvokeNumber).toBe(2);
  });
});

describe("B-5a frequencyCap — visible cap 動作", () => {
  beforeEach(() => __resetForTest());

  it("initial cap = 1", () => {
    expect(__getInitialVisibleCapForTest()).toBe(1);
  });

  it("visibleSpeakCount === cap → isVisibleCapReached true", () => {
    incrementVisibleSpeak();
    expect(isVisibleCapReached()).toBe(true);
  });

  it("visibleSpeakCount 0 → cap 未到達", () => {
    expect(isVisibleCapReached()).toBe(false);
  });

  it("cap 到達後も visibleSpeak は increment 可 (engine 抑止は caller 責務)", () => {
    incrementVisibleSpeak();
    incrementVisibleSpeak(); // 2 回目 (cap 超過)
    expect(getCounters().visibleSpeakCount).toBe(2);
    expect(isVisibleCapReached()).toBe(true);
  });
});

describe("B-5a frequencyCap — getTimeSinceLastSpeakTurns", () => {
  beforeEach(() => __resetForTest());

  it("visible speak なし → MAX_SAFE_INTEGER", () => {
    incrementEngineInvoked();
    incrementEngineInvoked();
    expect(getTimeSinceLastSpeakTurns()).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("visible speak 後 → engine invoke count 差分", () => {
    incrementEngineInvoked(); // count = 1
    incrementEngineInvoked(); // count = 2
    incrementVisibleSpeak(); // lastVisibleSpeakInvokeNumber = 2
    expect(getTimeSinceLastSpeakTurns()).toBe(0);

    incrementEngineInvoked(); // count = 3
    expect(getTimeSinceLastSpeakTurns()).toBe(1);

    incrementEngineInvoked(); // count = 4
    incrementEngineInvoked(); // count = 5
    expect(getTimeSinceLastSpeakTurns()).toBe(3);
  });

  it("負数にならない (defensive)", () => {
    incrementEngineInvoked(); // count = 1
    incrementVisibleSpeak(); // lastVisibleSpeakInvokeNumber = 1
    // engine invoke count は increment しない → diff = 0
    expect(getTimeSinceLastSpeakTurns()).toBe(0);
  });
});
