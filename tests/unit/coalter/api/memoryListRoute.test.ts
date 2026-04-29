/**
 * Stage 4 B-3.1 — Memory list API route test
 *
 * 完了条件:
 *   - flag OFF で 503 service_unavailable 返却 (production 不変)
 *   - missing threadId で 400
 *   - 構造 invariant: supabaseServer + RLS-aware query 経路
 *
 * test strategy:
 *   - flag OFF 経路は実 GET invoke (Supabase 接続不要、flag check で短絡)
 *   - missing threadId 経路も同上 (Supabase 接続不要)
 *   - 401/403/404/200 は Supabase mock が必要 → 構造 invariant grep で代替
 *   - 関数 invoke + grep の組み合わせで CEO 指示の主要 contract を cover
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// server-only directive を mock (vitest node 環境で supabaseServer import 経路を通す、
// 既存 adaptiveQuestionPool.test.ts / webConnectorU3Telemetry.test.ts と同 pattern)
vi.mock("server-only", () => ({}));

import { GET } from "@/app/api/coalter/memory/list/route";

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

function mockReq(url: string): Request {
  return new Request(url);
}

describe("B-3.1 GET /api/coalter/memory/list — flag OFF で 503", () => {
  it("env 未設定 (既定 OFF) で 503 service_unavailable", async () => {
    delete process.env[ENV_KEY];
    const res = await GET(
      mockReq("https://example.com/api/coalter/memory/list?threadId=t1") as never,
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("presence_executor_disabled");
  });

  it("env=false で 503", async () => {
    process.env[ENV_KEY] = "false";
    const res = await GET(
      mockReq("https://example.com/api/coalter/memory/list?threadId=t1") as never,
    );
    expect(res.status).toBe(503);
  });
});

describe("B-3.1 GET /api/coalter/memory/list — flag ON + missing threadId で 400", () => {
  it("threadId なしで 400 missing_thread_id", async () => {
    process.env[ENV_KEY] = "true";
    const res = await GET(
      mockReq("https://example.com/api/coalter/memory/list") as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_thread_id");
  });

  it("threadId 空文字で 400", async () => {
    process.env[ENV_KEY] = "true";
    const res = await GET(
      mockReq("https://example.com/api/coalter/memory/list?threadId=") as never,
    );
    expect(res.status).toBe(400);
  });
});

describe("B-3.1 構造 invariant — RLS-aware Supabase query 経路", () => {
  it("supabaseServer を import (RLS 経由 cookie session、service_role 不使用)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../app/api/coalter/memory/list/route.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(
      /import\s+\{\s*supabaseServer\s*\}\s+from\s+["']@\/lib\/supabase\/server["']/,
    );
    // service_role を直接使っていない (anon key + cookie session で RLS gate)
    expect(content).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("threadId → coalter_pair_states.thread_id 経由で pair 解決", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../app/api/coalter/memory/list/route.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/from\(["']coalter_pair_states["']\)/);
    expect(content).toMatch(/eq\(["']thread_id["']/);
  });

  it("auth check + pair member check の二重 gate (defense in depth)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../app/api/coalter/memory/list/route.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/auth\.getUser/);
    expect(content).toMatch(/user_a\s*===\s*userId/);
    expect(content).toMatch(/error:\s*["']forbidden["']/);
    expect(content).toMatch(/error:\s*["']unauthorized["']/);
  });

  it("internal_only 除外 + expires_at filter (defense in depth + transient cleanup)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../app/api/coalter/memory/list/route.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/neq\(["']visibility["'],\s*["']internal_only["']\)/);
    expect(content).toMatch(/expires_at\.is\.null/);
    expect(content).toMatch(/expires_at\.gt\./);
  });

  it("error fallback: items=[] + degraded=true で 200 (UI 壊さない、CEO 指示)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../app/api/coalter/memory/list/route.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/degraded:\s*true/);
    expect(content).toMatch(/items:\s*\[\]/);
  });

  it("response shape: { pairId, viewer, items } を返す", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../app/api/coalter/memory/list/route.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/pairId:\s*pair\.id/);
    expect(content).toMatch(/viewer:\s*["']user_a["']\s*\|\s*["']user_b["']/);
    expect(content).toMatch(/runtime\s*=\s*["']nodejs["']/);
  });
});

describe("B-3.1 構造 invariant — DB column → JS type 変換", () => {
  it("snake_case → camelCase 変換 (mode_context → modeContext 等)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../app/api/coalter/memory/list/route.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/modeContext:\s*row\.mode_context/);
    expect(content).toMatch(/createdAt:\s*new Date\(row\.created_at\)\.getTime\(\)/);
    expect(content).toMatch(/expiresAt:\s*row\.expires_at/);
  });
});
