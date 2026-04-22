/**
 * Provider Latch — W3-PR-8 rev 3 commit 24 unit tests
 *
 * 対象: `lib/alter-morning/dialog/providerLatch.ts`
 *
 * 契約:
 *   - pure function（入力のみから出力決定）
 *   - streak=0 → noop（shouldReplace=false）
 *   - streak=1 → "latched_first" 文に差し替え（短く柔らかい）
 *   - streak≥2 → "latched_severe" 文に差し替え（時間を置く提案）
 *   - currentMessage は判定に影響しない（streak のみが decider）
 *   - 負値 / 小数は floor + clamp で安全化
 *
 * 世界観制約（alter voice）:
 *   - 絵文字・感嘆符・決め付け表現を含まない
 *   - 長さ 14-30 文字目安
 *
 * 設計書:
 *   - docs/alter-morning-pr8-rev3-implementation-detail.md §3 providerRecovery
 */

import { describe, expect, test } from "vitest";
import {
  computeProviderLatch,
  type ProviderLatchParams,
} from "@/lib/alter-morning/dialog/providerLatch";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkParams(overrides: Partial<ProviderLatchParams> = {}): ProviderLatchParams {
  return {
    providerFailureStreak: 0,
    currentMessage: "既存 message",
    ...overrides,
  };
}

// 禁忌 token（絵文字・感嘆符・断定など alter voice 違反）
const FORBIDDEN_TOKENS = ["!", "！", "😊", "🙏", "必ず", "絶対"];

function assertAlterVoice(message: string): void {
  expect(message.length).toBeGreaterThan(10);
  expect(message.length).toBeLessThanOrEqual(32);
  for (const tok of FORBIDDEN_TOKENS) {
    expect(message).not.toContain(tok);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeProviderLatch — streak 別 branch", () => {
  test("streak=0 → noop (正常時は完全不介入)", () => {
    const r = computeProviderLatch(mkParams({ providerFailureStreak: 0 }));
    expect(r.shouldReplace).toBe(false);
    expect(r.nextMessage).toBe(null);
    expect(r.reason).toBe("noop_no_streak");
  });

  test("streak=1 → latched_first 発火", () => {
    const r = computeProviderLatch(mkParams({ providerFailureStreak: 1 }));
    expect(r.shouldReplace).toBe(true);
    expect(r.nextMessage).not.toBeNull();
    expect(r.reason).toBe("latched_first");
    assertAlterVoice(r.nextMessage!);
  });

  test("streak=2 → latched_severe 発火", () => {
    const r = computeProviderLatch(mkParams({ providerFailureStreak: 2 }));
    expect(r.shouldReplace).toBe(true);
    expect(r.reason).toBe("latched_severe");
    assertAlterVoice(r.nextMessage!);
  });

  test("streak=5 (長期連続失敗) でも latched_severe のまま（文言の上限）", () => {
    const r = computeProviderLatch(mkParams({ providerFailureStreak: 5 }));
    expect(r.shouldReplace).toBe(true);
    expect(r.reason).toBe("latched_severe");
    assertAlterVoice(r.nextMessage!);
  });

  test("streak=1 と streak=2 の文言は異なる（段階が違う）", () => {
    const r1 = computeProviderLatch(mkParams({ providerFailureStreak: 1 }));
    const r2 = computeProviderLatch(mkParams({ providerFailureStreak: 2 }));
    expect(r1.nextMessage).not.toBe(r2.nextMessage);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeProviderLatch — 入力安全化", () => {
  test("負値は 0 として扱う（noop）", () => {
    const r = computeProviderLatch(mkParams({ providerFailureStreak: -1 }));
    expect(r.shouldReplace).toBe(false);
    expect(r.reason).toBe("noop_no_streak");
  });

  test("小数は floor される (1.9 → 1 → latched_first)", () => {
    const r = computeProviderLatch(mkParams({ providerFailureStreak: 1.9 }));
    expect(r.reason).toBe("latched_first");
  });

  test("小数 (2.5) は 2 として severe 判定", () => {
    const r = computeProviderLatch(mkParams({ providerFailureStreak: 2.5 }));
    expect(r.reason).toBe("latched_severe");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeProviderLatch — currentMessage 非依存性", () => {
  test("currentMessage の中身は判定に影響しない（streak のみが decider）", () => {
    const r1 = computeProviderLatch(
      mkParams({ providerFailureStreak: 1, currentMessage: "short" }),
    );
    const r2 = computeProviderLatch(
      mkParams({
        providerFailureStreak: 1,
        currentMessage: "非常に長い message でも結果は変わらない" + "x".repeat(100),
      }),
    );
    expect(r1.nextMessage).toBe(r2.nextMessage);
    expect(r1.reason).toBe(r2.reason);
  });

  test("currentMessage が空文字でも streak=1 なら latched_first", () => {
    const r = computeProviderLatch(
      mkParams({ providerFailureStreak: 1, currentMessage: "" }),
    );
    expect(r.reason).toBe("latched_first");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeProviderLatch — purity", () => {
  test("同入力 2 回呼び出しで同結果（副作用なし）", () => {
    const p = mkParams({ providerFailureStreak: 2, currentMessage: "x" });
    const r1 = computeProviderLatch(p);
    const r2 = computeProviderLatch(p);
    expect(r1).toEqual(r2);
  });

  test("入力 params を mutate しない", () => {
    const p = mkParams({ providerFailureStreak: 3 });
    const snapshot = { ...p };
    computeProviderLatch(p);
    expect(p).toEqual(snapshot);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeProviderLatch — 世界観（alter voice）", () => {
  test("latched_first message は禁忌 token を含まない", () => {
    const r = computeProviderLatch(mkParams({ providerFailureStreak: 1 }));
    assertAlterVoice(r.nextMessage!);
  });

  test("latched_severe message は禁忌 token を含まない", () => {
    const r = computeProviderLatch(mkParams({ providerFailureStreak: 2 }));
    assertAlterVoice(r.nextMessage!);
  });

  test("latched_first は「もう一度」等の re-try ヒントを含む", () => {
    const r = computeProviderLatch(mkParams({ providerFailureStreak: 1 }));
    // 「届きにくい」「もう一度」「少し待」のいずれかが含まれることで
    // user に「今は一時的」というニュアンスを伝える。
    const hasRetryHint =
      r.nextMessage!.includes("もう一度") ||
      r.nextMessage!.includes("もう少し") ||
      r.nextMessage!.includes("少し待");
    expect(hasRetryHint).toBe(true);
  });

  test("latched_severe は「時間」等の delay ヒントを含む", () => {
    const r = computeProviderLatch(mkParams({ providerFailureStreak: 2 }));
    const hasDelayHint =
      r.nextMessage!.includes("時間") ||
      r.nextMessage!.includes("あと") ||
      r.nextMessage!.includes("また");
    expect(hasDelayHint).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 優先順位契約: latch が発火したら後段の clarifyFallback は skip される想定
// （route.ts 側の契約。helper 自体は boolean を返すのみ）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeProviderLatch — shouldReplace 契約", () => {
  test("shouldReplace=true のとき nextMessage は非 null の非空文字列", () => {
    const r = computeProviderLatch(mkParams({ providerFailureStreak: 1 }));
    expect(r.shouldReplace).toBe(true);
    expect(r.nextMessage).not.toBeNull();
    expect(typeof r.nextMessage).toBe("string");
    expect(r.nextMessage!.length).toBeGreaterThan(0);
  });

  test("shouldReplace=false のとき nextMessage は必ず null", () => {
    const r = computeProviderLatch(mkParams({ providerFailureStreak: 0 }));
    expect(r.shouldReplace).toBe(false);
    expect(r.nextMessage).toBe(null);
  });

  test("reason は英数字 + '_' のみ（log ローテに優しい）", () => {
    const reasons = [0, 1, 2, 5].map(
      (s) => computeProviderLatch(mkParams({ providerFailureStreak: s })).reason,
    );
    for (const r of reasons) {
      expect(r).toMatch(/^[a-z0-9_]+$/);
    }
  });
});
