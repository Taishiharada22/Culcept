/**
 * Stage 4 B-3.3 — UpperLayerMount memory mount test
 *
 * 完了条件:
 *   - useParams() で threadId を取得 (ChatClient touch ゼロ)
 *   - useMemoryItems(threadId) で initial fetch
 *   - viewer 解決曖昧時は MemorySurface 非表示 (CEO 指示の安全 fallback)
 *   - MemorySurface が空でも layout を壊さない
 *   - flag OFF / flag ON 既存挙動の不変
 *
 * test strategy:
 *   - 構造 invariant grep + 関数 invoke (UpperLayerMount default export)
 *   - 既存 chatClientUpperLayerMount + upperLayerMountActive + upperLayerMountUrgent
 *     は touch せず regression のみ確認
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import UpperLayerMount from "@/app/components/chat/UpperLayerMount";

const ENV_KEY = "NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR";
let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalEnv;
});

describe("B-3.3 UpperLayerMount — flag OFF で null (B-1/B-2 invariant 維持)", () => {
  it("env 未設定で UpperLayerMount() === null", () => {
    delete process.env[ENV_KEY];
    expect(UpperLayerMount()).toBeNull();
  });

  it("env=false で null", () => {
    process.env[ENV_KEY] = "false";
    expect(UpperLayerMount()).toBeNull();
  });
});

describe("B-3.3 UpperLayerMount — flag ON で active wrapper を返す (B-1/B-2 invariant)", () => {
  it("env=true で React 要素を返す (type は function)", () => {
    process.env[ENV_KEY] = "true";
    const result = UpperLayerMount() as React.ReactElement | null;
    expect(result).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const type = (result as any)?.type;
    expect(typeof type).toBe("function");
  });
});

describe("B-3.3 構造 invariant — useParams + useMemoryItems + MemorySurface", () => {
  it("UpperLayerMount.tsx は useParams を import (next/navigation)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(
      /import\s+\{\s*useParams\s*\}\s+from\s+["']next\/navigation["']/,
    );
    expect(content).toMatch(/useParams\(\)/);
  });

  it("UpperLayerMount.tsx は useMemoryItems hook を import + 使用", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(
      /import\s+\{\s*useMemoryItems\s*\}\s+from\s+["']\.\/hooks\/useMemoryItems["']/,
    );
    expect(content).toMatch(/useMemoryItems\(threadId\)/);
  });

  it("UpperLayerMount.tsx は MemorySurface を import + mount", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(
      /import\s+MemorySurface\s+from\s+["']\.\/MemorySurface["']/,
    );
    expect(content).toMatch(/<MemorySurface\s/);
    // viewer + modeScope を渡す
    expect(content).toMatch(/items=\{memory\.items\}/);
    expect(content).toMatch(/viewer=\{memory\.viewer\}/);
    expect(content).toMatch(/modeScope=\{exec\.state\.mode\}/);
  });

  it("threadId 抽出は string + length > 0 で gate (空文字 / non-string で null)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // type guard + length check
    expect(content).toMatch(/typeof\s+raw\s*===\s*["']string["']/);
    expect(content).toMatch(/raw\.length\s*>\s*0/);
  });
});

describe("B-3.3 構造 invariant — viewer 解決曖昧時の安全 fallback", () => {
  it("showMemorySurface は viewer null / loading / error で false", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // 表示判定の三段階 gate
    expect(content).toMatch(/memory\.viewer\s*===\s*null/);
    expect(content).toMatch(/memory\.isLoading/);
    expect(content).toMatch(/memory\.error/);
    // degraded は表示継続
    expect(content).toMatch(/["']degraded["']/);
  });

  it("MemorySurface mount 条件は showMemorySurface && viewer !== null", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(
      /showMemorySurface\s*&&\s*memory\.viewer\s*!==\s*null\s*&&/,
    );
  });
});

describe("B-3.3 構造 invariant — Realtime / ChatClient 不可侵", () => {
  it("UpperLayerMount.tsx は Realtime API を import しない (B-3.4 で別 gate)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).not.toMatch(/from\s+["']@supabase\/supabase-js["']/);
    expect(content).not.toMatch(/\.channel\(/);
    expect(content).not.toMatch(/postgres_changes/);
  });

  it("ChatClient.tsx に touch していない (UpperLayerMount は props なしで mount)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/(culcept)/talk/[threadId]/ChatClient.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // <UpperLayerMount /> は props ゼロのまま (threadId は UpperLayerMount 内で
    // useParams 経由で取得、ChatClient touch ゼロ)
    expect(content).toMatch(/<UpperLayerMount\s*\/>/);
    // threadId を UpperLayerMount に渡していない
    expect(content).not.toMatch(/<UpperLayerMount[^/]*threadId/);
  });

  it("UpperLayerMount.tsx の Phase 履歴 comment に B-3.3 を記載", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/B-3\.3.*MemorySurface\s+mount/);
  });
});
