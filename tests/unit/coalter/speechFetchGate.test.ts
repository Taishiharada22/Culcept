/**
 * Stage 4 L4-i Phase 1 — Client speech fetch gate test
 *
 * 完了条件:
 *   - Phase 1 default (env 未設定) で false (Production 不変)
 *   - env=true で true (Phase 2 で fetch active 化)
 *   - env=false / 任意の string で false (fallback)
 *   - 構造 invariant: NEXT_PUBLIC_ prefix で webpack inline 強制
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { isSpeechFetchEnabled } from "@/lib/coalter/presence/speechFetchGate";

const ENV_KEY = "NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_FETCH";
let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalEnv;
});

describe("L4-i Phase 1 — speechFetchGate default OFF (CEO 必須 #1, #14)", () => {
  it("env 未設定で false (Phase 1 default、Production 不変)", () => {
    delete process.env[ENV_KEY];
    expect(isSpeechFetchEnabled()).toBe(false);
  });

  it("env=false で false", () => {
    process.env[ENV_KEY] = "false";
    expect(isSpeechFetchEnabled()).toBe(false);
  });

  it("env=任意の文字列で false (true 以外は全て fallback)", () => {
    process.env[ENV_KEY] = "1";
    expect(isSpeechFetchEnabled()).toBe(false);
    process.env[ENV_KEY] = "yes";
    expect(isSpeechFetchEnabled()).toBe(false);
    process.env[ENV_KEY] = "TRUE";
    expect(isSpeechFetchEnabled()).toBe(false);
    process.env[ENV_KEY] = "";
    expect(isSpeechFetchEnabled()).toBe(false);
  });

  it("env=true で true (Phase 2 active)", () => {
    process.env[ENV_KEY] = "true";
    expect(isSpeechFetchEnabled()).toBe(true);
  });
});

describe("L4-i Phase 1 — speechFetchGate.ts 構造 invariant", () => {
  it("NEXT_PUBLIC_ prefix で member access 直接記述 (webpack DefinePlugin inline 強制)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../lib/coalter/presence/speechFetchGate.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    // 直接アクセス (process.env.NEXT_PUBLIC_X) のみ
    expect(content).toMatch(
      /process\.env\.NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_FETCH/,
    );
    // 関数本体のコード (export function 以降) では computed access を使わない
    // (コメント内 explanation の `process.env[name]` を除外する目的)
    const fnMatch = content.match(/export\s+function[\s\S]+\}\s*$/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).not.toMatch(/process\.env\[/);
  });

  it("純関数 1 個のみ export (test 容易 + 副作用なし)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../lib/coalter/presence/speechFetchGate.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    // export function は 1 個のみ
    const exportFnMatches = content.match(/export\s+function\s+\w+/g) ?? [];
    expect(exportFnMatches.length).toBe(1);
    expect(exportFnMatches[0]).toMatch(/isSpeechFetchEnabled/);
  });
});
