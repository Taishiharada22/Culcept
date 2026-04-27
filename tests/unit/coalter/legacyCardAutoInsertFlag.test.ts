/**
 * Stage 4 L4-c — legacyCardAutoInsertEnabled flag invariant test
 *
 * plan v0.3 §7.3 Gate:
 *   - flag ON で legacy 自動挿入維持 (移行期)
 *   - flag OFF で自動挿入なし、明示 handoff button のみ
 *   - 二重表示禁止 (統合契約 §1.6-4)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { COALTER_FLAGS } from "@/lib/coalter/flags";

const ENV_KEY = "COALTER_LEGACY_CARD_AUTO_INSERT";
let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalEnv;
});

describe("L4-c legacyCardAutoInsertEnabled — 既定 ON (移行期)", () => {
  it("env 未設定で true (既定 ON、移行期挙動維持)", () => {
    delete process.env[ENV_KEY];
    expect(COALTER_FLAGS.legacyCardAutoInsertEnabled).toBe(true);
  });

  it("env=true / 1 / on / yes で true", () => {
    for (const v of ["true", "1", "on", "yes", "TRUE"]) {
      process.env[ENV_KEY] = v;
      expect(COALTER_FLAGS.legacyCardAutoInsertEnabled).toBe(true);
    }
  });
});

describe("L4-c legacyCardAutoInsertEnabled — flag OFF で自動挿入スキップ", () => {
  it("env=false で false", () => {
    process.env[ENV_KEY] = "false";
    expect(COALTER_FLAGS.legacyCardAutoInsertEnabled).toBe(false);
  });

  it("env=0 / no / off で false", () => {
    for (const v of ["0", "no", "off"]) {
      process.env[ENV_KEY] = v;
      expect(COALTER_FLAGS.legacyCardAutoInsertEnabled).toBe(false);
    }
  });

  it("env=不明値で fallback (true、既定維持)", () => {
    process.env[ENV_KEY] = "maybe";
    expect(COALTER_FLAGS.legacyCardAutoInsertEnabled).toBe(true);
  });
});

describe("L4-c 構造 invariant — Phase 6.C+ Dispatcher 経路は flag 無関係に動作", () => {
  it("ChatClient.tsx の Dispatcher 経路 (line 1721-1740) は flag check しない", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/(culcept)/talk/[threadId]/ChatClient.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // Dispatcher 経路は coalter.hasCard 条件のみで動作 (legacyCardAutoInsertEnabled は touch しない)
    expect(content).toMatch(/coalter\.hasCard\s+&&\s+coalter\.currentCard/);
    // legacy 経路にのみ flag が gate されている
    expect(content).toMatch(
      /legacyCardAutoInsertEnabled\s+&&\s+!coalter\.hasCard\s+&&\s+coalter\.hasProposal/,
    );
  });
});
