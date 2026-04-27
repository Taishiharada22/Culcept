/**
 * Stage 2 L2-g — presenceExecutorEnabled kill switch invariant test
 *
 * plan v0.3 §5.7 Gate:
 *   - flag OFF 既定
 *   - flag OFF で既存 coalter 挙動が 1 bit 変わらない (構造的 import 確認)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

import { COALTER_FLAGS } from "@/lib/coalter/flags";

// ─────────────────────────────────────────────
// 既定 OFF (env 未設定)
// ─────────────────────────────────────────────

describe("L2-g presenceExecutorEnabled — 既定 OFF", () => {
  const ENV_KEY = "COALTER_PRESENCE_EXECUTOR";
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env[ENV_KEY];
    delete process.env[ENV_KEY];
  });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  it("env 未設定時は false (既定 OFF)", () => {
    delete process.env[ENV_KEY];
    expect(COALTER_FLAGS.presenceExecutorEnabled).toBe(false);
  });

  it("env=空文字 → true (envBool helper の規約: 空は presence あり扱い)", () => {
    process.env[ENV_KEY] = "";
    expect(COALTER_FLAGS.presenceExecutorEnabled).toBe(true);
  });

  it("env=true / 1 / on / yes で true", () => {
    for (const v of ["true", "1", "on", "yes", "TRUE", "Yes"]) {
      process.env[ENV_KEY] = v;
      expect(COALTER_FLAGS.presenceExecutorEnabled).toBe(true);
    }
  });

  it("env=false / 0 / off / no で false", () => {
    for (const v of ["false", "0", "off", "no", "FALSE"]) {
      process.env[ENV_KEY] = v;
      expect(COALTER_FLAGS.presenceExecutorEnabled).toBe(false);
    }
  });

  it("env=不明な値で fallback (false)", () => {
    process.env[ENV_KEY] = "maybe";
    expect(COALTER_FLAGS.presenceExecutorEnabled).toBe(false);
  });
});

// ─────────────────────────────────────────────
// 構造 invariant: flag OFF 状態で presence/** が既存経路に組み込まれていない
// ─────────────────────────────────────────────

const REPO_ROOT = resolve(__dirname, "../../..");

function listTsFiles(dir: string, exclude?: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (exclude && exclude(full)) continue;
    if (st.isDirectory()) {
      // 既存 coalter dir 配下のみ走査、node_modules / .next / tests は除外
      if (name === "node_modules" || name === ".next" || name === "tests") continue;
      out.push(...listTsFiles(full, exclude));
    } else if (
      (name.endsWith(".ts") || name.endsWith(".tsx")) &&
      !name.endsWith(".test.ts") &&
      !name.endsWith(".test.tsx")
    ) {
      out.push(full);
    }
  }
  return out;
}

describe("L2-g 構造 invariant — flag OFF で既存経路に変化なし", () => {
  it("既存 coalter 経路 (lib/coalter/*.ts) が presence/** を import していない", () => {
    const COALTER_DIR = resolve(REPO_ROOT, "lib/coalter");
    // presence/ 配下と test ファイルは除外、coalter ルート直下の既存 source のみ走査
    const files = listTsFiles(COALTER_DIR, (path) => {
      // presence/ 配下は対象外 (これは presence module 自身)
      return path.includes("/lib/coalter/presence");
    });
    expect(files.length).toBeGreaterThan(0);

    for (const path of files) {
      const content = readFileSync(path, "utf8");
      const importLines = content
        .split("\n")
        .filter((line) =>
          /^\s*(import\s|export\s+\{[^}]*\}\s+from\s|export\s+\*\s+from\s)/.test(line),
        );
      const importBlock = importLines.join("\n");
      // 既存経路は presence/** を import しない (Stage 4 L4-l flip まで)
      expect(importBlock).not.toMatch(/from\s+["'][^"']*\/coalter\/presence/);
      expect(importBlock).not.toMatch(/from\s+["']@\/lib\/coalter\/presence/);
    }
  });

  it("production ChatClient (app/(culcept)/talk/[threadId]/ChatClient.tsx) が presence/** を import していない", () => {
    const path = resolve(
      REPO_ROOT,
      "app/(culcept)/talk/[threadId]/ChatClient.tsx",
    );
    const content = readFileSync(path, "utf8");
    const importLines = content
      .split("\n")
      .filter((line) =>
        /^\s*(import\s|export\s+\{[^}]*\}\s+from\s|export\s+\*\s+from\s)/.test(line),
      );
    const importBlock = importLines.join("\n");
    expect(importBlock).not.toMatch(/coalter\/presence/);
  });
});
