/**
 * Stage 4 B-3.2 — useMemoryItems hook test
 *
 * 完了条件:
 *   - threadId 受け取り、API 経由で items / pairId / viewer 取得
 *   - 404 / 403 / 500 で空 fallback (UI 壊さない)
 *   - threadId null/undefined で空 state
 *   - 構造 invariant: client hook、Realtime なし
 *
 * test strategy:
 *   - React hook 自体は React 環境必要 → 関数 invoke 不可
 *   - 構造 invariant grep + isValidMemoryItem 風の type guard を export しないため、
 *     hook 内部 logic の正しさは structure 検証 + B-3.3 integration で carry
 *   - file content の grep で contract 違反を弾く
 */

import { describe, it, expect } from "vitest";

describe("B-3.2 構造 invariant — useMemoryItems hook の設計遵守", () => {
  it("file 存在 + use client directive", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/useMemoryItems.ts",
    );
    expect(fs.existsSync(file)).toBe(true);
    const content = fs.readFileSync(file, "utf8");
    expect(content.startsWith('"use client";')).toBe(true);
  });

  it("Realtime subscribe を含まない (B-3.4 で別 gate)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/useMemoryItems.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    // supabase Realtime API を import していない
    expect(content).not.toMatch(/from\s+["']@supabase\/supabase-js["']/);
    expect(content).not.toMatch(/\.channel\(/);
    expect(content).not.toMatch(/postgres_changes/);
    expect(content).not.toMatch(/createBrowserClient/);
  });

  it("API endpoint /api/coalter/memory/list を fetch", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/useMemoryItems.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/\/api\/coalter\/memory\/list\?threadId=/);
    expect(content).toMatch(/encodeURIComponent\(threadId\)/);
    expect(content).toMatch(/credentials:\s*["']include["']/);
  });

  it("threadId null/undefined で early return (空 state、fetch しない)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/useMemoryItems.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    // useEffect 内で if (!threadId) early return
    expect(content).toMatch(/if\s*\(\s*!threadId\s*\)/);
  });

  it("response.ok=false で空 fallback (404 / 403 / 500 を UI で壊さない)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/useMemoryItems.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/!response\.ok/);
    expect(content).toMatch(/fetch_failed_/);
    expect(content).toMatch(/setItems\(EMPTY\)/);
    expect(content).toMatch(/setPairId\(null\)/);
    expect(content).toMatch(/setViewer\(null\)/);
  });

  it("network error catch 内で空 fallback", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/useMemoryItems.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/catch\s*\{/);
    expect(content).toMatch(/network_error/);
  });

  it("cancelled flag で race condition 防止", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/useMemoryItems.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/let\s+cancelled\s*=\s*false/);
    expect(content).toMatch(/cancelled\s*=\s*true/);
    expect(content).toMatch(/if\s*\(\s*cancelled\s*\)\s*return/);
  });

  it("response shape type guard で defense in depth", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/useMemoryItems.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/isResponseShape/);
    expect(content).toMatch(/isValidMemoryItem/);
    // origin / certainty / visibility / modeContext のすべてを check
    expect(content).toMatch(/explicit_shared/);
    expect(content).toMatch(/transient_summary/);
    expect(content).toMatch(/both_visible/);
  });

  it("EMPTY constant で stable reference (re-render 抑制)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/useMemoryItems.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/const\s+EMPTY/);
    expect(content).toMatch(/Object\.freeze\(\[\]\)/);
  });

  it("export shape: useMemoryItems / UseMemoryItemsResult / MemoryItemsViewer", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/hooks/useMemoryItems.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/export\s+function\s+useMemoryItems/);
    expect(content).toMatch(/export\s+interface\s+UseMemoryItemsResult/);
    expect(content).toMatch(/export\s+type\s+MemoryItemsViewer/);
  });
});
