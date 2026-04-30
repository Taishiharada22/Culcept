/**
 * ensureSessionV1 — 単体テスト (W3-PR-8 rev 3 commit 16)
 *
 * 検証観点（CEO 2026-04-22 commit 16 承認条件）:
 *   1. flag OFF 中は完全中立: session 不変（同一参照）、allocation なし
 *   2. migration は lazy: 呼び出し時にのみ判定、自動書き戻しなし（本関数は pure）
 *   3. flag source of truth は 1 箇所: ALTER_MORNING_FLAGS.dialogStateV2
 *   4. adapter / phase / runtime behavior は触らない: 本関数は dialogState field のみ操作
 *   5. テスト:
 *      - flag OFF で session 不変
 *      - flag ON で only-read initialization が動く
 *
 * 参照:
 *   - lib/alter-morning/dialog/ensureSessionV1.ts
 *   - lib/alter-morning/dialog/flags.ts (__setDialogStateV2Override)
 *   - docs/alter-morning-pr8-rev3-implementation-detail.md §6
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ensureSessionV1 } from "@/lib/alter-morning/dialog/ensureSessionV1";
import {
  ALTER_MORNING_FLAGS,
  __setDialogStateV2Override,
} from "@/lib/alter-morning/dialog/flags";
import {
  createInitialDialogState,
  type DialogState,
} from "@/lib/alter-morning/dialog/types";
import type { MorningSession } from "@/lib/alter-morning/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeBaseSession(
  overrides: Partial<MorningSession> = {},
): MorningSession {
  return {
    sessionId: "ms_test",
    phase: "greeting",
    rawInputs: [],
    personalizeHints: [],
    startedAt: "2026-04-22T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * session を deep clone（構造同一性テスト用）
 */
function structuralCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 共通 setup / teardown
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

beforeEach(() => {
  __setDialogStateV2Override(null);
});

afterEach(() => {
  __setDialogStateV2Override(null);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. Flag source of truth — CEO 条件 3
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ensureSessionV1 §1 flag SoT", () => {
  it("ALTER_MORNING_FLAGS.dialogStateV2() が single SoT（default OFF）", () => {
    __setDialogStateV2Override(null);
    expect(ALTER_MORNING_FLAGS.dialogStateV2()).toBe(false);
  });

  it("__setDialogStateV2Override(true) で flag ON に切替可能", () => {
    __setDialogStateV2Override(true);
    expect(ALTER_MORNING_FLAGS.dialogStateV2()).toBe(true);
  });

  it("__setDialogStateV2Override(null) で env 復帰（default OFF）", () => {
    __setDialogStateV2Override(true);
    __setDialogStateV2Override(null);
    expect(ALTER_MORNING_FLAGS.dialogStateV2()).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. Flag OFF — 完全中立 (CEO 条件 1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ensureSessionV1 §2 flag OFF = 完全中立", () => {
  beforeEach(() => {
    __setDialogStateV2Override(false);
  });

  it("dialogState 未設定 session → 同一参照が返る", () => {
    const session = makeBaseSession();
    const result = ensureSessionV1(session);
    expect(result).toBe(session); // Object.is 同一性
    expect(result.dialogState).toBeUndefined();
  });

  it("dialogState が undefined でも mutate しない", () => {
    const session = makeBaseSession();
    const before = structuralCopy(session);
    const result = ensureSessionV1(session);
    // 入力 session が mutate されていない
    expect(session).toEqual(before);
    // 戻り値は dialogState field を追加しない（flag OFF）
    expect(result.dialogState).toBeUndefined();
  });

  it("dialogState が null の session でも同一参照・変更なし", () => {
    const session = makeBaseSession({ dialogState: null });
    const result = ensureSessionV1(session);
    expect(result).toBe(session);
    expect(result.dialogState).toBeNull();
  });

  it("既に v1 dialogState を持つ session も同一参照で返る（不変）", () => {
    // flag OFF の場合は何があっても session をそのまま返す（完全中立）
    const existing: DialogState = createInitialDialogState();
    const session = makeBaseSession({ dialogState: existing });
    const result = ensureSessionV1(session);
    expect(result).toBe(session);
    expect(result.dialogState).toBe(existing);
  });

  it("他の field（sessionId / phase / rawInputs 等）は一切触らない", () => {
    const session = makeBaseSession({
      sessionId: "ms_abc",
      phase: "plan_presented",
      rawInputs: ["hello"],
      personalizeHints: ["h1"],
      pendingClarify: null,
    });
    const result = ensureSessionV1(session);
    expect(result.sessionId).toBe("ms_abc");
    expect(result.phase).toBe("plan_presented");
    expect(result.rawInputs).toEqual(["hello"]);
    expect(result.personalizeHints).toEqual(["h1"]);
    expect(result.pendingClarify).toBeNull();
  });

  it("1000 回呼び出しても input session は不変（purity）", () => {
    const session = makeBaseSession();
    const snapshot = structuralCopy(session);
    for (let i = 0; i < 1000; i++) {
      ensureSessionV1(session);
    }
    expect(session).toEqual(snapshot);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. Flag ON — only-read initialization (CEO 条件 5)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ensureSessionV1 §3 flag ON = lazy initialization", () => {
  beforeEach(() => {
    __setDialogStateV2Override(true);
  });

  it("dialogState 未設定 → createInitialDialogState() で初期化", () => {
    const session = makeBaseSession();
    const result = ensureSessionV1(session);
    expect(result.dialogState).toBeDefined();
    expect(result.dialogState).not.toBeNull();
    // createInitialDialogState() と structural equal
    expect(result.dialogState).toEqual(createInitialDialogState());
  });

  it("初期化後の dialogState は version=1", () => {
    const session = makeBaseSession();
    const result = ensureSessionV1(session);
    expect(result.dialogState?.version).toBe(1);
    expect(result.dialogState?.conversationStatus).toBe("stable");
    expect(result.dialogState?.focus).toBeNull();
    expect(result.dialogState?.capturedHistory).toEqual([]);
  });

  it("dialogState=null → v1 init を付与", () => {
    const session = makeBaseSession({ dialogState: null });
    const result = ensureSessionV1(session);
    expect(result.dialogState).toEqual(createInitialDialogState());
  });

  it("既に v1 dialogState → 同一参照で返す（再初期化しない）", () => {
    // 進行中の session を勝手に reset しない（CEO 条件 1: user-visible notification 禁止）
    const existing: DialogState = {
      ...createInitialDialogState(),
      conversationStatus: "narrowing",
      focus: { event_id: "e1", slot: "where", narrowStep: 1 },
    };
    const session = makeBaseSession({ dialogState: existing });
    const result = ensureSessionV1(session);
    expect(result).toBe(session); // 同一参照
    expect(result.dialogState).toBe(existing); // dialogState も同一参照
    expect(result.dialogState?.conversationStatus).toBe("narrowing");
  });

  it("将来 version（v2+）→ v1 に reset（detail §6 beta-only policy）", () => {
    // version=2 を想定（将来の破壊的変更）。ensureSessionV1 は beta-only policy で reset する。
    const futureState = {
      ...createInitialDialogState(),
      version: 2 as unknown as 1, // 型上は v1 に縛るため unknown キャスト
    };
    const session = makeBaseSession({ dialogState: futureState });
    const result = ensureSessionV1(session);
    // reset で新 v1 init が入る
    expect(result.dialogState).toEqual(createInitialDialogState());
    expect(result.dialogState?.version).toBe(1);
    // 新 object（同一参照ではない）
    expect(result).not.toBe(session);
  });

  it("入力 session は mutate しない（新 object 生成 / CEO 条件 2 lazy）", () => {
    const session = makeBaseSession();
    const before = structuralCopy(session);
    ensureSessionV1(session);
    // 元 session は不変
    expect(session.dialogState).toBeUndefined();
    expect(session).toEqual(before);
  });

  it("他の field は preserve される（field 漏れ禁止）", () => {
    const session = makeBaseSession({
      sessionId: "ms_xyz",
      phase: "clarifying",
      rawInputs: ["1", "2"],
      pendingClarify: null,
      persistedEvents: undefined,
    });
    const result = ensureSessionV1(session);
    expect(result.sessionId).toBe("ms_xyz");
    expect(result.phase).toBe("clarifying");
    expect(result.rawInputs).toEqual(["1", "2"]);
    expect(result.pendingClarify).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. Purity — pure function invariant
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ensureSessionV1 §4 pure function invariant", () => {
  it("同一 flag / 同一 input → 同一 output（決定性、flag OFF）", () => {
    __setDialogStateV2Override(false);
    const s1 = makeBaseSession();
    const s2 = makeBaseSession();
    expect(ensureSessionV1(s1)).toBe(s1);
    expect(ensureSessionV1(s2)).toBe(s2);
  });

  it("同一 flag / 同一 input → 構造同値（flag ON）", () => {
    __setDialogStateV2Override(true);
    const a = ensureSessionV1(makeBaseSession());
    const b = ensureSessionV1(makeBaseSession());
    expect(a).toEqual(b);
    expect(a.dialogState).toEqual(b.dialogState);
  });

  it("flag 切替時のみ振る舞いが変わる（他の entropy なし）", () => {
    const session = makeBaseSession();
    __setDialogStateV2Override(false);
    const off = ensureSessionV1(session);
    expect(off).toBe(session);

    __setDialogStateV2Override(true);
    const on = ensureSessionV1(session);
    expect(on).not.toBe(session);
    expect(on.dialogState).toEqual(createInitialDialogState());
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. Wiring-only scope — CEO 条件 4 (adapter / phase / runtime 非 touch)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ensureSessionV1 §5 wiring-only scope", () => {
  it("flag ON でも session.phase は変えない", () => {
    __setDialogStateV2Override(true);
    const session = makeBaseSession({ phase: "plan_presented" });
    const result = ensureSessionV1(session);
    expect(result.phase).toBe("plan_presented");
  });

  it("flag ON でも plan / parsedIntent / sufficiency は変えない", () => {
    __setDialogStateV2Override(true);
    const session = makeBaseSession({
      plan: undefined,
      parsedIntent: undefined,
      sufficiency: undefined,
    });
    const result = ensureSessionV1(session);
    expect(result.plan).toBeUndefined();
    expect(result.parsedIntent).toBeUndefined();
    expect(result.sufficiency).toBeUndefined();
  });

  it("flag ON でも pendingClarify / persistedEvents は変えない", () => {
    __setDialogStateV2Override(true);
    const session = makeBaseSession({
      pendingClarify: null,
      persistedEvents: undefined,
    });
    const result = ensureSessionV1(session);
    expect(result.pendingClarify).toBeNull();
    expect(result.persistedEvents).toBeUndefined();
  });

  it("本関数は dialogState field 以外を一切触らない", () => {
    __setDialogStateV2Override(true);
    const session = makeBaseSession({
      sessionId: "ms_strict",
      phase: "collecting",
      rawInputs: ["a", "b", "c"],
      personalizeHints: ["hint"],
      pendingClarify: null,
    });
    const result = ensureSessionV1(session);
    // dialogState 以外の全 field が入力と等しい
    const { dialogState: _d, ...rest } = result;
    const { dialogState: _d2, ...baseRest } = session;
    expect(rest).toEqual(baseRest);
  });
});
