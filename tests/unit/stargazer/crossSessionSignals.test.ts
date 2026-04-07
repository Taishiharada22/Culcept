import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { detectExplicitRejection } from "@/lib/stargazer/ruptureDetection";
import { detectRegressionSignal, type RegressionContext } from "@/lib/stargazer/hdmPhase";

// ── helpers ──

function makeCtx(overrides: Partial<RegressionContext> = {}): RegressionContext {
  return {
    ruptureDetected: false,
    ruptureType: null,
    consecutiveRuptureCount: 0,
    dignityViolationDetected: false,
    explicitRejection: false,
    reactiveActivation: 0,
    protectiveActivation: 0,
    trustDelta: 0,
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. consecutiveRuptureCount
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("consecutiveRuptureCount", () => {
  it("3回連続 rupture → hard regression", () => {
    const signal = detectRegressionSignal(makeCtx({
      consecutiveRuptureCount: 3,
    }));
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("hard");
    expect(signal!.cause).toBe("consecutive_rupture");
  });

  it("2回連続 → hard にならない", () => {
    const signal = detectRegressionSignal(makeCtx({
      consecutiveRuptureCount: 2,
    }));
    // 2回連続は hard threshold 未満
    expect(signal === null || signal.cause !== "consecutive_rupture").toBe(true);
  });

  it("true,true,true → count=3（末尾から連続カウント）", () => {
    // route.ts の実装ロジックをここで再現検証
    const flags = [true, true, true];
    let count = 0;
    for (let i = flags.length - 1; i >= 0; i--) {
      if (flags[i]) count++;
      else break;
    }
    expect(count).toBe(3);
  });

  it("true,false,true → count=1（false で連続が切れる）", () => {
    const flags = [true, false, true];
    let count = 0;
    for (let i = flags.length - 1; i >= 0; i--) {
      if (flags[i]) count++;
      else break;
    }
    expect(count).toBe(1);
  });

  it("false,true,true,true,false,true → count=1", () => {
    const flags = [false, true, true, true, false, true];
    let count = 0;
    for (let i = flags.length - 1; i >= 0; i--) {
      if (flags[i]) count++;
      else break;
    }
    expect(count).toBe(1);
  });

  it("5件の true → count=5（最大履歴全て rupture）", () => {
    const flags = [true, true, true, true, true];
    let count = 0;
    for (let i = flags.length - 1; i >= 0; i--) {
      if (flags[i]) count++;
      else break;
    }
    expect(count).toBe(5);
  });

  it("空配列 → count=0", () => {
    const flags: boolean[] = [];
    let count = 0;
    for (let i = flags.length - 1; i >= 0; i--) {
      if (flags[i]) count++;
      else break;
    }
    expect(count).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. explicitRejection — keyword detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("detectExplicitRejection", () => {
  describe("true positive（正しく検出すべき）", () => {
    it.each([
      "もうやめて",
      "聞きたくない",
      "もういい",
      "やめてください",
      "ほっといて",
      "余計なお世話だよ",
      "黙ってくれ",
      "うるさい",
      "邪魔しないで",
    ])("「%s」→ true", (msg) => {
      expect(detectExplicitRejection(msg)).toBe(true);
    });
  });

  describe("false positive 防止（検出してはいけない）", () => {
    it.each([
      "そうだね",
      "わかった",
      "ありがとう",
      "なるほど、続けて",
      "それは面白い",
      "確かにそうかも",
      "別の話だけど",
      "仕事がうまくいかない",
      "今日は疲れた",
    ])("「%s」→ false", (msg) => {
      expect(detectExplicitRejection(msg)).toBe(false);
    });
  });
});

describe("explicitRejection × rupture 合流条件", () => {
  it("拒絶語 + rupture 検出 → hard regression", () => {
    const signal = detectRegressionSignal(makeCtx({
      explicitRejection: true,
      ruptureDetected: true,
      ruptureType: "confrontation",
    }));
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("hard");
    expect(signal!.cause).toBe("explicit_rejection");
  });

  it("拒絶語のみ（rupture なし）→ hard にならない", () => {
    const signal = detectRegressionSignal(makeCtx({
      explicitRejection: true,
      ruptureDetected: false,
    }));
    expect(signal === null || signal.cause !== "explicit_rejection").toBe(true);
  });

  it("rupture のみ（拒絶語なし）→ soft regression（hard ではない）", () => {
    const signal = detectRegressionSignal(makeCtx({
      explicitRejection: false,
      ruptureDetected: true,
      ruptureType: "withdrawal",
    }));
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("soft");
    expect(signal!.cause).toBe("withdrawal");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. trustDelta
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("trustDelta regression", () => {
  it("delta -0.3 → hard regression (trust_crash)", () => {
    const signal = detectRegressionSignal(makeCtx({ trustDelta: -0.3 }));
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("hard");
    expect(signal!.cause).toBe("trust_crash");
  });

  it("delta -0.29 → hard にならない（閾値未満）", () => {
    const signal = detectRegressionSignal(makeCtx({ trustDelta: -0.29 }));
    expect(signal === null || signal.cause !== "trust_crash").toBe(true);
  });

  it("delta -0.1 → ノイズ範囲、regression なし", () => {
    const signal = detectRegressionSignal(makeCtx({ trustDelta: -0.1 }));
    expect(signal).toBeNull();
  });

  it("delta 0 → regression なし", () => {
    const signal = detectRegressionSignal(makeCtx({ trustDelta: 0 }));
    expect(signal).toBeNull();
  });

  it("delta +0.2 → regression なし（信頼上昇）", () => {
    const signal = detectRegressionSignal(makeCtx({ trustDelta: 0.2 }));
    expect(signal).toBeNull();
  });

  it("priorSessionTrust null → delta 0 として扱う", () => {
    // route.ts: const priorTrust = p3HdmPhaseState.priorSessionTrust ?? currentTrust;
    // null の場合 currentTrust がフォールバック → delta = 0
    const currentTrust = 0.5;
    const priorTrust = null;
    const delta = currentTrust - (priorTrust ?? currentTrust);
    expect(delta).toBe(0);
  });
});
