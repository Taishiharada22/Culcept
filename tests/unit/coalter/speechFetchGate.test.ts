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

  it("純関数 export (test 容易 + 副作用なし、Phase 2 観測モード追加で 2 関数)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../lib/coalter/presence/speechFetchGate.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    // export function は isSpeechFetchEnabled + isSpeechObservationMode の 2 個
    const exportFnMatches = content.match(/export\s+function\s+\w+/g) ?? [];
    expect(exportFnMatches.length).toBe(2);
    expect(exportFnMatches.map((s) => s.replace(/export\s+function\s+/, ""))).toEqual(
      expect.arrayContaining(["isSpeechFetchEnabled", "isSpeechObservationMode"]),
    );
  });
});

describe("L4-i Phase 2 Stage 2.1 / 2.2 — isSpeechObservationMode (CEO 確定 2026-05-07 Option C')", () => {
  const ENV_OBS = "NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_OBSERVATION_MODE";
  let originalObs: string | undefined;

  beforeEach(() => {
    originalObs = process.env[ENV_OBS];
    delete process.env[ENV_OBS];
  });

  afterEach(() => {
    if (originalObs === undefined) delete process.env[ENV_OBS];
    else process.env[ENV_OBS] = originalObs;
  });

  it("env 未設定で false (Phase 1 default / Production 不変)", async () => {
    delete process.env[ENV_OBS];
    const { isSpeechObservationMode } = await import(
      "@/lib/coalter/presence/speechFetchGate"
    );
    expect(isSpeechObservationMode()).toBe(false);
  });

  it("env=false で false", async () => {
    process.env[ENV_OBS] = "false";
    const { isSpeechObservationMode } = await import(
      "@/lib/coalter/presence/speechFetchGate"
    );
    expect(isSpeechObservationMode()).toBe(false);
  });

  it("env=任意の文字列で false (true 以外は全て fallback)", async () => {
    const { isSpeechObservationMode } = await import(
      "@/lib/coalter/presence/speechFetchGate"
    );
    process.env[ENV_OBS] = "1";
    expect(isSpeechObservationMode()).toBe(false);
    process.env[ENV_OBS] = "TRUE";
    expect(isSpeechObservationMode()).toBe(false);
    process.env[ENV_OBS] = "";
    expect(isSpeechObservationMode()).toBe(false);
  });

  it("env=true で true (Phase 2 observation active)", async () => {
    process.env[ENV_OBS] = "true";
    const { isSpeechObservationMode } = await import(
      "@/lib/coalter/presence/speechFetchGate"
    );
    expect(isSpeechObservationMode()).toBe(true);
  });

  it("構造 invariant: NEXT_PUBLIC_ 直接アクセス (webpack inline 強制)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../lib/coalter/presence/speechFetchGate.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(
      /process\.env\.NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_OBSERVATION_MODE/,
    );
    // 関数本体内で computed access を使わない
    const fnMatch = content.match(
      /export\s+function\s+isSpeechObservationMode[\s\S]+?\}\s*$/m,
    );
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).not.toMatch(/process\.env\[/);
  });
});
