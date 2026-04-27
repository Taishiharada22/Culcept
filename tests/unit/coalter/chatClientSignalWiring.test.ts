/**
 * Stage 4 L4-b — Production signal bus + signal wiring test
 *
 * plan v0.3 §7.2 Gate:
 *   - flag OFF でメインチャット発話が presence reducer (bus) に届かない
 *   - flag ON で signal 5 分類が reducer (bus subscriber) に正しく伝播
 *
 * test strategy:
 *   - PresenceSignalWiring component の useEffect 中の挙動は React DOM が必要なため、
 *     bus + signalAdapter 単体で検証 + flag invariant を確認
 *   - 統合 (component → useEffect → bus) は Stage 4 L4-l 統合テストで検証
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  publishPresenceSignal,
  subscribePresenceSignal,
  getRecentSignals,
  __resetSignalBus,
} from "@/lib/coalter/presence/productionSignalBus";
import {
  adaptImplicit,
  adaptCritical,
  adaptExplicit,
  adaptModePromotion,
  adaptManualRestart,
} from "@/lib/coalter/presence/signalAdapter";
import { COALTER_FLAGS } from "@/lib/coalter/flags";
import type { PresenceSignal } from "@/lib/coalter/presence/types";

const ENV_KEY = "COALTER_PRESENCE_EXECUTOR";
let originalEnv: string | undefined;

beforeEach(() => {
  __resetSignalBus();
  originalEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalEnv;
});

describe("L4-b productionSignalBus — basic publish / subscribe", () => {
  it("publish 後、recentSignals に記録される", () => {
    const sig = adaptImplicit({ softScore: 0.5, detectedAt: 0 });
    publishPresenceSignal(sig);
    expect(getRecentSignals()).toHaveLength(1);
    expect(getRecentSignals()[0].kind).toBe("implicit");
  });

  it("subscribe で listener が呼ばれる", () => {
    const received: PresenceSignal[] = [];
    const unsub = subscribePresenceSignal((s) => received.push(s));
    publishPresenceSignal(adaptCritical({ trigger: "heat", detectedAt: 0 }));
    expect(received).toHaveLength(1);
    expect(received[0].kind).toBe("critical");
    unsub();
    publishPresenceSignal(adaptExplicit({ source: "free_text", detectedAt: 0 }));
    expect(received).toHaveLength(1); // unsub 後は増えない
  });

  it("複数 listener が同 signal を受信", () => {
    const a: PresenceSignal[] = [];
    const b: PresenceSignal[] = [];
    subscribePresenceSignal((s) => a.push(s));
    subscribePresenceSignal((s) => b.push(s));
    publishPresenceSignal(adaptImplicit({ softScore: 0.3, detectedAt: 0 }));
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it("listener 例外は他 listener に伝播しない (fail-open)", () => {
    const ok: PresenceSignal[] = [];
    subscribePresenceSignal(() => {
      throw new Error("boom");
    });
    subscribePresenceSignal((s) => ok.push(s));
    publishPresenceSignal(adaptImplicit({ softScore: 0.4, detectedAt: 0 }));
    expect(ok).toHaveLength(1); // 例外側は無視され、後続 listener も動作
  });
});

describe("L4-b 5 分類 signal が bus に正しく流れる (signal 5 分類網羅)", () => {
  it("explicit / implicit / critical / mode_promotion / manual_restart を順次 publish", () => {
    const received: PresenceSignal[] = [];
    subscribePresenceSignal((s) => received.push(s));

    publishPresenceSignal(adaptExplicit({ source: "free_text", detectedAt: 0 }));
    publishPresenceSignal(adaptImplicit({ softScore: 0.4, detectedAt: 1 }));
    publishPresenceSignal(adaptCritical({ trigger: "heat", detectedAt: 2 }));
    publishPresenceSignal(
      adaptModePromotion({ target: "daily", source: "mode_tap", detectedAt: 3 }),
    );
    publishPresenceSignal(
      adaptManualRestart({ source: "button_tap", detectedAt: 4 }),
    );

    expect(received).toHaveLength(5);
    expect(received.map((s) => s.kind)).toEqual([
      "explicit",
      "implicit",
      "critical",
      "mode_promotion",
      "manual_restart",
    ]);
  });
});

describe("L4-b flag invariant — flag OFF 既定で signal 発火経路が起動しない", () => {
  it("env 未設定で COALTER_FLAGS.presenceExecutorEnabled === false", () => {
    delete process.env[ENV_KEY];
    expect(COALTER_FLAGS.presenceExecutorEnabled).toBe(false);
  });

  it("env=false で false (signal 発火経路 skip)", () => {
    process.env[ENV_KEY] = "false";
    expect(COALTER_FLAGS.presenceExecutorEnabled).toBe(false);
  });

  it("env=true で signal 発火経路が起動可", () => {
    process.env[ENV_KEY] = "true";
    expect(COALTER_FLAGS.presenceExecutorEnabled).toBe(true);
  });
});

describe("L4-b 構造 invariant — bus は executor.understanding.* を import しない (§1.7-2)", () => {
  it("productionSignalBus.ts の import に executor.understanding 系が含まれない", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../lib/coalter/presence/productionSignalBus.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    const importLines = content
      .split("\n")
      .filter((line) => /^\s*import\s/.test(line))
      .join("\n");
    expect(importLines).not.toMatch(/executor\.understanding/);
    expect(importLines).not.toMatch(/from\s+["'][^"']*executor\/understanding/);
    expect(importLines).not.toMatch(/from\s+["'][^"']*\/understanding\/[^"']*["']/);
  });
});
