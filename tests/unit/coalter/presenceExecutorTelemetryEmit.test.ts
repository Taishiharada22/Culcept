/**
 * Stage 4 L4-j Phase 1 (Plan D) — usePresenceExecutor telemetry emit test
 *
 * CEO 必須 8 項目 (2026-04-30):
 *   #1 mode_transition emit が呼ばれる
 *   #2 urgent_triggered emit が呼ばれる
 *   #3 state_transition emit が呼ばれる
 *   #4 pattern_used emit が呼ばれる
 *   #5 rerender で重複 emit しない (dedupe ref)
 *   #6 会話本文 / 個人情報 が payload に入らない
 *   #7 ChatClient.tsx touch なし
 *   #8 既存 B-1/B-2/B-3/B-4/L4-k tests 回帰なし (Full vitest で確認)
 *
 * test strategy:
 *   - pure helper (modeEventToTransitionTrigger / buildUrgentDedupeKey) を関数 invoke
 *   - emit 経路は productionSignalBus pattern で代替 (sink mock + emit 関数直接呼び)
 *   - usePresenceExecutor 自体は React hook、関数 invoke 不可 → 構造 invariant grep で
 *     emit useEffect / dedupe ref の存在を確認
 *   - 新規 dep ゼロ
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  modeEventToTransitionTrigger,
  buildUrgentDedupeKey,
} from "@/app/components/chat/hooks/usePresenceExecutor";
import {
  emitModeTransition,
  emitUrgentTriggered,
  emitPresenceStateTransition,
  emitPatternUsed,
  setTelemetrySink,
  __resetTelemetryQueue,
  getRecentTelemetry,
  type TelemetryEvent,
} from "@/lib/coalter/presence/telemetry";

const ENV_KEY = "NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR";
let originalEnv: string | undefined;

beforeEach(() => {
  __resetTelemetryQueue();
  setTelemetrySink(null);
  originalEnv = process.env[ENV_KEY];
  // flag ON: emit 経路 active
  process.env[ENV_KEY] = "true";
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalEnv;
  setTelemetrySink(null);
});

// ─────────────────────────────────────────────
// pure helper: modeEventToTransitionTrigger
// ─────────────────────────────────────────────

describe("L4-j #1 modeEventToTransitionTrigger (mode_transition trigger 解決)", () => {
  it("MANUAL_SWITCH → 'manual_switch'", () => {
    expect(modeEventToTransitionTrigger("MANUAL_SWITCH")).toBe("manual_switch");
  });

  it("AUTO_ESCALATE → 'auto_escalate'", () => {
    expect(modeEventToTransitionTrigger("AUTO_ESCALATE")).toBe("auto_escalate");
  });

  it("PLAN_COMPLETE → 'plan_complete'", () => {
    expect(modeEventToTransitionTrigger("PLAN_COMPLETE")).toBe("plan_complete");
  });

  it("MANUAL_RETURN → 'manual_return'", () => {
    expect(modeEventToTransitionTrigger("MANUAL_RETURN")).toBe("manual_return");
  });
});

// ─────────────────────────────────────────────
// pure helper: buildUrgentDedupeKey
// ─────────────────────────────────────────────

describe("L4-j #2 buildUrgentDedupeKey (urgent_triggered dedupe key)", () => {
  it("category + form + memoryFallback で 3 軸 key 生成", () => {
    const key = buildUrgentDedupeKey({
      category: "rupture_detected",
      form: "dominant_card",
      memoryFallback: "compact",
    });
    expect(key).toBe("rupture_detected:dominant_card:compact");
  });

  it("同 decision で同 key (dedupe で同 key を識別)", () => {
    const a = buildUrgentDedupeKey({
      category: "safety_concern",
      form: "overlay_banner",
      memoryFallback: "demote",
    });
    const b = buildUrgentDedupeKey({
      category: "safety_concern",
      form: "overlay_banner",
      memoryFallback: "demote",
    });
    expect(a).toBe(b);
  });

  it("category 変化で key 異なる", () => {
    const a = buildUrgentDedupeKey({
      category: "rupture_detected",
      form: "dominant_card",
      memoryFallback: "compact",
    });
    const b = buildUrgentDedupeKey({
      category: "safety_concern",
      form: "dominant_card",
      memoryFallback: "compact",
    });
    expect(a).not.toBe(b);
  });

  it("form 変化で key 異なる", () => {
    const a = buildUrgentDedupeKey({
      category: "rupture_detected",
      form: "dominant_card",
      memoryFallback: "compact",
    });
    const b = buildUrgentDedupeKey({
      category: "rupture_detected",
      form: "overlay_banner",
      memoryFallback: "compact",
    });
    expect(a).not.toBe(b);
  });
});

// ─────────────────────────────────────────────
// CEO 必須 #1-#4: 各 emit 関数が flag ON で sink に届く
// ─────────────────────────────────────────────

describe("L4-j #1-4 emit chain — 4 event すべて sink に届く (flag ON)", () => {
  it("mode_transition emit → sink received", () => {
    const captured: TelemetryEvent[] = [];
    setTelemetrySink((e) => captured.push(e));

    emitModeTransition({
      pairId: "",
      from: "normal",
      to: "daily",
      trigger: "manual_switch",
      ts: 100,
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].type).toBe("coalter.mode.transition");
  });

  it("urgent_triggered emit → sink received", () => {
    const captured: TelemetryEvent[] = [];
    setTelemetrySink((e) => captured.push(e));

    emitUrgentTriggered({
      pairId: "",
      category: "rupture_detected",
      form: "dominant_card",
      memoryFallback: "compact",
      ts: 200,
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].type).toBe("coalter.urgent.triggered");
  });

  it("state_transition emit → sink received", () => {
    const captured: TelemetryEvent[] = [];
    setTelemetrySink((e) => captured.push(e));

    emitPresenceStateTransition({
      pairId: "",
      from: "S0",
      to: "S2",
      trigger: "critical",
      ts: 300,
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].type).toBe("coalter.presence.state_transition");
  });

  it("pattern_used emit → sink received", () => {
    const captured: TelemetryEvent[] = [];
    setTelemetrySink((e) => captured.push(e));

    emitPatternUsed({
      pairId: "",
      variant: "A",
      state: "S2",
      mode: "normal",
      hasSecondary: false,
      ts: 400,
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].type).toBe("coalter.pattern.used");
  });
});

// ─────────────────────────────────────────────
// CEO 必須 #5: rerender で重複 emit しない (dedupe ref)
// ─────────────────────────────────────────────

describe("L4-j #5 dedupe — usePresenceExecutor 内 emit は前値比較で重複抑止", () => {
  it("同 mode に再 emit が抑制される (lastEmittedModeRef pattern、構造 invariant)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/usePresenceExecutor.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/lastEmittedModeRef/);
    // mode useEffect 内で last !== current の前値比較
    expect(content).toMatch(
      /lastEmittedModeRef[\s\S]{0,500}last\s*!==\s*current/,
    );
  });

  it("同 state に再 emit が抑制される (lastEmittedStateRef pattern)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/usePresenceExecutor.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/lastEmittedStateRef/);
    expect(content).toMatch(
      /lastEmittedStateRef[\s\S]{0,500}last\s*!==\s*current/,
    );
  });

  it("同 pattern に再 emit が抑制される (lastEmittedPatternRef pattern)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/usePresenceExecutor.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/lastEmittedPatternRef/);
    expect(content).toMatch(
      /lastEmittedPatternRef[\s\S]{0,500}current\s*!==\s*last/,
    );
  });

  it("同 urgent に再 emit が抑制される (lastEmittedUrgentKeyRef + buildUrgentDedupeKey)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/usePresenceExecutor.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/lastEmittedUrgentKeyRef/);
    expect(content).toMatch(/buildUrgentDedupeKey/);
    // dedupe: last !== key
    expect(content).toMatch(
      /lastEmittedUrgentKeyRef[\s\S]{0,500}last\s*!==\s*key/,
    );
  });

  it("urgent null 復帰で dedupe key reset (次の non-null で再 emit 可能)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/usePresenceExecutor.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    // urgentDecision === null で lastEmittedUrgentKeyRef.current = null
    expect(content).toMatch(
      /urgentDecision\s*===\s*null[\s\S]{0,300}lastEmittedUrgentKeyRef\.current\s*=\s*null/,
    );
  });
});

// ─────────────────────────────────────────────
// CEO 必須 #6: 会話本文 / 個人情報 が payload に入らない
// ─────────────────────────────────────────────

describe("L4-j #6 payload 制約 (会話本文 / 個人情報を含めない)", () => {
  it("usePresenceExecutor.ts の emit 呼び出しは構造化 enum / number のみ", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/usePresenceExecutor.ts",
    );
    const content = fs.readFileSync(file, "utf8");

    // payload に message / body / content / text / userInput が含まれない
    // (4 emit 呼び出し block 内の grep)
    const emitBlockMatches = content.match(
      /emit(PresenceStateTransition|PatternUsed|ModeTransition|UrgentTriggered)\(\{[\s\S]{0,500}\}\)/g,
    );
    expect(emitBlockMatches).not.toBeNull();
    for (const block of emitBlockMatches ?? []) {
      // payload 内に禁止キーワード不在
      expect(block).not.toMatch(/\bmessage:/);
      expect(block).not.toMatch(/\bbody:/);
      expect(block).not.toMatch(/\bcontent:/);
      // text: は他文脈 (CSS textAlign 等) と被るため emit block 内で text: が
      // payload key として使われていないことを確認
      expect(block).not.toMatch(/\btext:\s*["']/);
      expect(block).not.toMatch(/\buserInput/);
    }
  });

  it("pairId は initial.pairId ?? '' で取得 (telemetry 用 fetch 追加禁止)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/usePresenceExecutor.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(
      /telemetryPairId\s*=\s*initial\?\.pairId\s*\?\?\s*["']{2}/,
    );
    // useMemoryItems 等を本 hook 内で呼んでいない (telemetry のための fetch なし)
    expect(content).not.toMatch(/useMemoryItems/);
  });
});

// ─────────────────────────────────────────────
// CEO 必須 #7: ChatClient.tsx touch なし
// ─────────────────────────────────────────────

describe("L4-j #7 ChatClient.tsx touch なし (B-1 から不変)", () => {
  it("ChatClient.tsx は <UpperLayerMount /> props ゼロのまま", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/(culcept)/talk/[threadId]/ChatClient.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/<UpperLayerMount\s*\/>/);
    // L4-j で追加した emit 関数 / pairId 等を ChatClient で呼んでいない
    expect(content).not.toMatch(/emitModeTransition/);
    expect(content).not.toMatch(/emitUrgentTriggered/);
    expect(content).not.toMatch(/emitPresenceStateTransition/);
    expect(content).not.toMatch(/emitPatternUsed/);
  });
});

// ─────────────────────────────────────────────
// 構造 invariant — 不採用 4 event は呼ばない (CEO Plan D 厳守)
// ─────────────────────────────────────────────

describe("L4-j Plan D 範囲 invariant — 不採用 4 event は usePresenceExecutor で呼ばない", () => {
  it("emitConsent / emitLegacyFallback / emitRejection / emitRateLimitBlocked は本 hook で呼ばれない", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/usePresenceExecutor.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    // import で使っていない (Plan D 4 event のみ)
    expect(content).not.toMatch(/emitConsent\b/);
    expect(content).not.toMatch(/emitLegacyFallback\b/);
    expect(content).not.toMatch(/emitRejection\b/);
    expect(content).not.toMatch(/emitRateLimitBlocked\b/);
  });

  it("Plan D 4 emit 関数のみ import (state_transition / pattern_used / mode_transition / urgent_triggered)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/usePresenceExecutor.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/emitPresenceStateTransition/);
    expect(content).toMatch(/emitPatternUsed/);
    expect(content).toMatch(/emitModeTransition/);
    expect(content).toMatch(/emitUrgentTriggered/);
  });
});
