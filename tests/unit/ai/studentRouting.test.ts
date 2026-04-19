import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// Mock server-only (not available in test environment)
vi.mock("server-only", () => ({}));

// Mock feature flags module so we can toggle useStudentProvider per test
vi.mock("@/lib/stargazer/featureFlags", () => {
  return {
    STARGAZER_FLAGS: {
      get useStudentProvider() {
        return process.env.STUDENT_PROVIDER_ENABLED === "true";
      },
    },
  };
});

import { resolveStudentRouting } from "../../../lib/ai/studentRouting";
import { validateStudentOutput } from "../../../lib/ai/providers/student";
import type { RunAIParams } from "../../../lib/ai/types";

function makeParams(overrides: Partial<RunAIParams> = {}): RunAIParams {
  return {
    taskType: "stargazer_alter_response",
    prompt: "テストです",
    systemPrompt: "あなたはAlterです",
    requireJson: false,
    userId: "user-123",
    ...overrides,
  };
}

/**
 * Env snapshot/restore helper.
 * Tests flip STUDENT_PROVIDER_* env vars; we restore between tests.
 */
const ENV_KEYS = [
  "STUDENT_PROVIDER_ENABLED",
  "STUDENT_PROVIDER_ENDPOINT",
  "STUDENT_PROVIDER_API_KEY",
  "STUDENT_PROVIDER_MAX_PROMPT_CHARS",
  "STUDENT_PROVIDER_ROLLOUT_PERCENT",
] as const;

let envSnapshot: Record<string, string | undefined> = {};

beforeEach(() => {
  envSnapshot = {};
  for (const key of ENV_KEYS) envSnapshot[key] = process.env[key];
  // default "eligible" state
  process.env.STUDENT_PROVIDER_ENABLED = "true";
  process.env.STUDENT_PROVIDER_ENDPOINT = "https://test.runpod.example";
  process.env.STUDENT_PROVIDER_API_KEY = "test-key";
  process.env.STUDENT_PROVIDER_ROLLOUT_PERCENT = "100"; // everyone in
  delete process.env.STUDENT_PROVIDER_MAX_PROMPT_CHARS;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (envSnapshot[key] === undefined) delete process.env[key];
    else process.env[key] = envSnapshot[key];
  }
});

// ─── resolveStudentRouting ────────────────────────────────────

describe("resolveStudentRouting — disabled state", () => {
  it("flag off → disabled/flag_disabled", () => {
    process.env.STUDENT_PROVIDER_ENABLED = "false";
    const d = resolveStudentRouting(makeParams());
    expect(d.state).toBe("disabled");
    if (d.state === "disabled") expect(d.reason).toBe("flag_disabled");
  });

  it("non-eligible task → disabled/task_not_eligible", () => {
    const d = resolveStudentRouting(makeParams({ taskType: "stargazer_alter_letter" }));
    expect(d.state).toBe("disabled");
    if (d.state === "disabled") expect(d.reason).toBe("task_not_eligible");
  });

  it("requireJson=true → disabled/json_required", () => {
    const d = resolveStudentRouting(makeParams({ requireJson: true }));
    expect(d.state).toBe("disabled");
    if (d.state === "disabled") expect(d.reason).toBe("json_required");
  });

  it("endpoint missing → disabled/provider_unavailable", () => {
    delete process.env.STUDENT_PROVIDER_ENDPOINT;
    const d = resolveStudentRouting(makeParams());
    expect(d.state).toBe("disabled");
    if (d.state === "disabled") expect(d.reason).toBe("provider_unavailable");
  });

  it("api key missing → disabled/provider_unavailable", () => {
    delete process.env.STUDENT_PROVIDER_API_KEY;
    const d = resolveStudentRouting(makeParams());
    expect(d.state).toBe("disabled");
    if (d.state === "disabled") expect(d.reason).toBe("provider_unavailable");
  });
});

describe("resolveStudentRouting — skipped state", () => {
  it("prompt too long → skipped/prompt_too_long with diagnostics", () => {
    process.env.STUDENT_PROVIDER_MAX_PROMPT_CHARS = "100";
    const longPrompt = "あ".repeat(200);
    const d = resolveStudentRouting(makeParams({ prompt: longPrompt, systemPrompt: "" }));
    expect(d.state).toBe("skipped");
    if (d.state === "skipped") {
      expect(d.reason).toBe("prompt_too_long");
      expect(d.promptChars).toBe(200);
      expect(d.maxPromptChars).toBe(100);
    }
  });

  it("canary percent 0 → skipped/canary_excluded", () => {
    process.env.STUDENT_PROVIDER_ROLLOUT_PERCENT = "0";
    const d = resolveStudentRouting(makeParams({ userId: "user-123" }));
    expect(d.state).toBe("skipped");
    if (d.state === "skipped") {
      expect(d.reason).toBe("canary_excluded");
      expect(d.rolloutPercent).toBe(0);
      expect(typeof d.assignmentBucket).toBe("number");
    }
  });

  it("no userId and no sessionId → skipped/no_stable_seed", () => {
    const d = resolveStudentRouting(makeParams({ userId: undefined, sessionId: undefined }));
    expect(d.state).toBe("skipped");
    if (d.state === "skipped") expect(d.reason).toBe("no_stable_seed");
  });

  it("canary is disabled before skip for json_required (precedence check)", () => {
    // requireJson should win even if everything else is eligible
    process.env.STUDENT_PROVIDER_ROLLOUT_PERCENT = "100";
    const d = resolveStudentRouting(makeParams({ requireJson: true }));
    expect(d.state).toBe("disabled");
  });
});

describe("resolveStudentRouting — eligible state (canary)", () => {
  it("rollout 100% + userId → eligible/canary_selected", () => {
    process.env.STUDENT_PROVIDER_ROLLOUT_PERCENT = "100";
    const d = resolveStudentRouting(makeParams({ userId: "user-123" }));
    expect(d.state).toBe("eligible");
    if (d.state === "eligible") {
      expect(d.reason).toBe("canary_selected");
      expect(d.rolloutPercent).toBe(100);
      expect(d.seedSource).toBe("user");
      expect(d.assignmentBucket).toBeGreaterThanOrEqual(0);
      expect(d.assignmentBucket).toBeLessThan(100);
    }
  });

  it("sessionId fallback when no userId", () => {
    process.env.STUDENT_PROVIDER_ROLLOUT_PERCENT = "100";
    const d = resolveStudentRouting(
      makeParams({ userId: undefined, sessionId: "session-abc" }),
    );
    expect(d.state).toBe("eligible");
    if (d.state === "eligible") expect(d.seedSource).toBe("session");
  });

  it("canary assignment is STABLE for the same userId across calls", () => {
    // Even at partial rollout, the same user always gets the same bucket.
    process.env.STUDENT_PROVIDER_ROLLOUT_PERCENT = "50";
    const userIds = ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"];

    for (const id of userIds) {
      const first = resolveStudentRouting(makeParams({ userId: id }));
      const second = resolveStudentRouting(makeParams({ userId: id }));
      const third = resolveStudentRouting(makeParams({ userId: id }));

      expect(first.state).toBe(second.state);
      expect(second.state).toBe(third.state);

      if (first.state === "eligible" && second.state === "eligible") {
        expect(first.assignmentBucket).toBe(second.assignmentBucket);
      }
      if (first.state === "skipped" && second.state === "skipped") {
        expect(first.assignmentBucket).toBe(second.assignmentBucket);
      }
    }
  });

  it("canary percent roughly matches empirical assignment rate over many users", () => {
    process.env.STUDENT_PROVIDER_ROLLOUT_PERCENT = "25";
    let eligible = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      const d = resolveStudentRouting(makeParams({ userId: `user-${i}` }));
      if (d.state === "eligible") eligible++;
    }
    const rate = (eligible / N) * 100;
    // Expect ~25% ± 5pp given hash distribution
    expect(rate).toBeGreaterThan(20);
    expect(rate).toBeLessThan(30);
  });
});

// ─── validateStudentOutput ───────────────────────────────────

describe("validateStudentOutput — quality gate", () => {
  it("passes normal Alter-voice output", () => {
    const r = validateStudentOutput(
      "君が今感じている違和感は、たぶん正しい。無理に整理しようとしなくていい。",
    );
    expect(r.valid).toBe(true);
  });

  it("rejects too_short", () => {
    const r = validateStudentOutput("短い");
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toMatch(/^too_short/);
  });

  it("rejects too_long", () => {
    const r = validateStudentOutput("あ".repeat(1500));
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toMatch(/^too_long/);
  });

  it("rejects chinese_contamination (no japanese kana)", () => {
    const r = validateStudentOutput(
      "你好世界这是一个测试句子我们需要检测中文污染这种情况确实会发生在模型里。",
    );
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe("chinese_contamination");
  });

  it("allows Japanese with many kanji (kana present)", () => {
    const r = validateStudentOutput(
      "判断原理と深層心理の関係について、もう少し深く観察してみよう。",
    );
    expect(r.valid).toBe(true);
  });

  it("rejects generic_opening: はい、", () => {
    const r = validateStudentOutput(
      "はい、了解しました。お答えいたします。それでは詳細について順番に説明していきますね。",
    );
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe("generic_opening");
  });

  it("rejects generic_opening: 承知しました", () => {
    const r = validateStudentOutput("承知しました、ご質問にお答えします。ご希望の情報をお伝えします。");
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe("generic_opening");
  });

  it("rejects excessive_empty_lines", () => {
    const text = "最初の一行です。\n\n\n\n\n\n最後の一行です。普通なら大丈夫な長さにしておきます。";
    const r = validateStudentOutput(text);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe("excessive_empty_lines");
  });
});
