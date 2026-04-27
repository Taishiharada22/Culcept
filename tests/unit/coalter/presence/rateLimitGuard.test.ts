/**
 * Stage 2 L2-l — rateLimitGuard 連投抑制構造的担保 test
 *
 * plan v0.3 §5.12 Gate (4 ケース):
 *   ① 同一 state で 2 連発が構造的に起きない
 *   ② cooldown 中の発話 reject
 *   ③ §5.2 1 発話 1 タスク違反検出
 *   ④ §5.3 文長 override 違反検出
 *
 * 不変原則: ログ警告ではなく enforce (allowed=false で test、plan Gate)。
 */

import { describe, it, expect } from "vitest";

import {
  guardUtterance,
  type GuardInput,
  type UtteranceCandidate,
  MIN_UTTERANCE_LINES,
  MAX_UTTERANCE_LINES,
} from "@/lib/coalter/presence/rateLimitGuard";
import {
  emptyUtteranceQueue,
  enqueueUtterance,
  dequeueUtterance,
  hasActiveUtterance,
  type Utterance,
} from "@/lib/coalter/presence/utteranceQueue";

const utt = (over: Partial<Utterance> = {}): Utterance => ({
  id: "u1",
  variant: "A",
  state: "S2",
  startedAt: 1000,
  ...over,
});

const candidate = (over: Partial<UtteranceCandidate> = {}): UtteranceCandidate => ({
  variant: "A",
  state: "S2",
  body: "今、間に入れそう",
  ...over,
});

const baseInput = (
  candidateOver: Partial<UtteranceCandidate> = {},
  inputOver: Partial<GuardInput> = {},
): GuardInput => ({
  candidate: candidate(candidateOver),
  queueState: emptyUtteranceQueue(),
  ...inputOver,
});

// ─────────────────────────────────────────────
// utteranceQueue 基本
// ─────────────────────────────────────────────

describe("L2-l utteranceQueue — single-slot serialize", () => {
  it("初期 queue は active=null", () => {
    expect(emptyUtteranceQueue().active).toBeNull();
  });

  it("enqueue OK で active がセット、accepted=true", () => {
    const r = enqueueUtterance(emptyUtteranceQueue(), utt());
    expect(r.accepted).toBe(true);
    expect(r.next.active?.id).toBe("u1");
  });

  it("active が既存なら enqueue reject (構造的 1 発話 serialize、§1.6)", () => {
    const s = enqueueUtterance(emptyUtteranceQueue(), utt({ id: "first" })).next;
    const r2 = enqueueUtterance(s, utt({ id: "second" }));
    expect(r2.accepted).toBe(false);
    expect(r2.next).toBe(s); // 元 queue 不変 (immutable)
    expect(r2.reason).toContain("§1.6");
  });

  it("dequeue で active=null に戻す", () => {
    const s1 = enqueueUtterance(emptyUtteranceQueue(), utt()).next;
    expect(hasActiveUtterance(s1)).toBe(true);
    const s2 = dequeueUtterance(s1);
    expect(hasActiveUtterance(s2)).toBe(false);
  });
});

// ─────────────────────────────────────────────
// ① 同一 state 2 連発禁止
// ─────────────────────────────────────────────

describe("L2-l guardUtterance — ① 同一 state 2 連発禁止 (§1.6)", () => {
  it("active 発話あり → reject", () => {
    const queueWithActive = enqueueUtterance(emptyUtteranceQueue(), utt()).next;
    const r = guardUtterance({
      candidate: candidate(),
      queueState: queueWithActive,
    });
    expect(r.allowed).toBe(false);
    expect(r.violation).toBe("concurrent_active_utterance");
  });

  it("active なし → ① は通過 (他チェック対象)", () => {
    const r = guardUtterance(baseInput());
    expect(r.violation).not.toBe("concurrent_active_utterance");
  });
});

// ─────────────────────────────────────────────
// ② cooldown 中の発話 reject
// ─────────────────────────────────────────────

describe("L2-l guardUtterance — ② cooldown 中の発話 reject (§8.6 5 分)", () => {
  it("normalS8CooldownActive=true → reject", () => {
    const r = guardUtterance(
      baseInput({}, { normalS8CooldownActive: true }),
    );
    expect(r.allowed).toBe(false);
    expect(r.violation).toBe("normal_s8_cooldown_active");
  });

  it("recentSameStateWithin5Min=true → reject (§1.6 / §8.6)", () => {
    const r = guardUtterance(
      baseInput({}, { recentSameStateWithin5Min: true }),
    );
    expect(r.allowed).toBe(false);
    expect(r.violation).toBe("recent_same_state_within_5min");
  });

  it("両 cooldown false → ② 通過", () => {
    const r = guardUtterance(baseInput());
    expect(r.violation).not.toBe("normal_s8_cooldown_active");
    expect(r.violation).not.toBe("recent_same_state_within_5min");
  });
});

// ─────────────────────────────────────────────
// ③ §5.2 1 発話 1 タスク違反検出
// ─────────────────────────────────────────────

describe("L2-l guardUtterance — ③ §5.2 1 発話 1 タスク (multiple pattern 禁止)", () => {
  it("concurrentVariants が空でない → reject (複数 pattern 同時)", () => {
    const r = guardUtterance(
      baseInput({ concurrentVariants: ["B"] }),
    );
    expect(r.allowed).toBe(false);
    expect(r.violation).toBe("multiple_pattern_in_one_turn");
  });

  it("concurrentVariants が複数 → reject (concurrent count を reason に含む)", () => {
    const r = guardUtterance(
      baseInput({ concurrentVariants: ["B", "C"] }),
    );
    expect(r.allowed).toBe(false);
    expect(r.violation).toBe("multiple_pattern_in_one_turn");
    expect(r.reason).toContain("2");
  });

  it("concurrentVariants が空配列 → ③ 通過", () => {
    const r = guardUtterance(
      baseInput({ concurrentVariants: [] }),
    );
    expect(r.violation).not.toBe("multiple_pattern_in_one_turn");
  });

  it("concurrentVariants 未指定 → ③ 通過", () => {
    const r = guardUtterance(baseInput());
    expect(r.violation).not.toBe("multiple_pattern_in_one_turn");
  });
});

// ─────────────────────────────────────────────
// ④ §5.3 文長違反検出
// ─────────────────────────────────────────────

describe("L2-l guardUtterance — ④ §5.3 文長 (2-4 行原則、本書では 1-4 まで許容)", () => {
  it("行数 1 (短文) → 通過", () => {
    const r = guardUtterance(baseInput({ body: "短い" }));
    expect(r.allowed).toBe(true);
  });

  it("行数 4 → 通過 (上限境界)", () => {
    const r = guardUtterance(baseInput({ body: "1\n2\n3\n4" }));
    expect(r.allowed).toBe(true);
  });

  it("行数 5 → reject (上限超過)", () => {
    const r = guardUtterance(baseInput({ body: "1\n2\n3\n4\n5" }));
    expect(r.allowed).toBe(false);
    expect(r.violation).toBe("line_length_violation");
  });

  it("空文字列 → reject (下限未満)", () => {
    const r = guardUtterance(baseInput({ body: "" }));
    expect(r.allowed).toBe(false);
    expect(r.violation).toBe("line_length_violation");
  });

  it("末尾改行 1 つは無視 (trailing newline)", () => {
    const r = guardUtterance(baseInput({ body: "短い\n" }));
    expect(r.allowed).toBe(true);
  });

  it("MAX_UTTERANCE_LINES = 4 / MIN = 1 (定数 export)", () => {
    expect(MAX_UTTERANCE_LINES).toBe(4);
    expect(MIN_UTTERANCE_LINES).toBe(1);
  });
});

// ─────────────────────────────────────────────
// 全 guard 通過
// ─────────────────────────────────────────────

describe("L2-l guardUtterance — 全 guard 通過時", () => {
  it("active なし + cooldown なし + 単一 pattern + 行数 OK → allowed=true", () => {
    const r = guardUtterance(baseInput({ body: "今、間に入れそう\n少し整理するよ" }));
    expect(r.allowed).toBe(true);
    expect(r.violation).toBeNull();
  });
});

// ─────────────────────────────────────────────
// 違反優先順位 (early return)
// ─────────────────────────────────────────────

describe("L2-l guardUtterance — 違反優先順位 (早期 return)", () => {
  it("複数違反同時 → ① concurrent_active_utterance が優先", () => {
    const queueWithActive = enqueueUtterance(emptyUtteranceQueue(), utt()).next;
    const r = guardUtterance({
      candidate: candidate({ body: "" }), // ④ も違反
      queueState: queueWithActive,
      normalS8CooldownActive: true, // ② も違反
    });
    expect(r.violation).toBe("concurrent_active_utterance");
  });

  it("active なし + cooldown active + 短文違反 → ② が優先", () => {
    const r = guardUtterance(
      baseInput({ body: "" }, { normalS8CooldownActive: true }),
    );
    expect(r.violation).toBe("normal_s8_cooldown_active");
  });
});
