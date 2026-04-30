/**
 * POST /api/alter-morning/plan route smoke tests (W3-PR-3)
 *
 * 設計書: docs/alter-morning-comprehension-first-wave3-design.md §7
 *
 * カバレッジ:
 *   - Feature flag OFF: 404（C-1 default OFF）
 *   - Feature flag ON + unauth: 401
 *   - Feature flag ON + auth + invalid body: 400
 *   - Feature flag ON + auth + valid body: 200 + pipeline 結果が返る
 *
 * orchestrator 本体は wave3MorningPipeline.test.ts が担保する。
 * ここでは route handler が「flag / auth / body / delegate」を正しく配線している事のみを見る。
 * そのため runAI と orchestrator 内 LLM provider はモックで stub 化して閉じる。
 */

import { vi, describe, test, expect, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Supabase server: getUser を動的に差し替えられるようにする
const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    }),
  ),
}));

// LLM provider を stub 化（route が実 LLM を呼ばないように）
vi.mock("@/lib/alter-morning/comprehension/llmComprehensionProvider", async () => {
  const { utteranceProvenance } = await import(
    "@/lib/alter-morning/comprehension/eventSchema"
  );
  return {
    createLLMComprehensionProvider: () => ({
      async extract() {
        return {
          targetDate: "2026-04-22",
          startPoint: null,
          departureTime: null,
          goOut: true,
          events: [
            {
              turn_mode: "create",
              change_scope: null,
              target_ref: null,
              target_ref_confidence: null,
              certainty: "asserted",
              when: {
                startTime: "09:00",
                timeHint: null,
                provenance: utteranceProvenance(["9時"], "high"),
              },
              where: {
                place_ref: "スタバ",
                placeType: "chain_brand",
                provenance: utteranceProvenance(["スタバ"], "high"),
              },
              what: {
                activity: "コーヒー",
                activityCanonical: "コーヒー",
                provenance: utteranceProvenance(["コーヒー"], "high"),
              },
              who: [],
              transport: null,
              missing_semantic_critical: [],
              missing_solver_blockers: [],
            },
          ],
        };
      },
    }),
  };
});

vi.mock("@/lib/alter-morning/expression/llmNarrationProvider", async () => {
  const { stubNarrationProvider } = await import(
    "@/lib/alter-morning/expression/narration"
  );
  return {
    createLLMNarrationProvider: () => stubNarrationProvider,
  };
});

import { POST } from "@/app/api/alter-morning/plan/route";
import { resetEventCounter } from "@/lib/alter-morning/comprehension/eventSchema";

function mkRequest(body: unknown): Request {
  return new Request("http://localhost/api/alter-morning/plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetEventCounter();
  mockGetUser.mockReset();
});

describe("POST /api/alter-morning/plan (W3-PR-3)", () => {
  test("feature flag OFF の場合 404（C-1 default）", async () => {
    vi.stubEnv("ALTER_MORNING_V2_ROUTE_ENABLED", "false");
    const res = await POST(mkRequest({ utterance: "9時にスタバでコーヒー" }));
    expect(res.status).toBe(404);
    vi.unstubAllEnvs();
  });

  test("feature flag 未設定 (undefined) も OFF 扱いで 404", async () => {
    vi.stubEnv("ALTER_MORNING_V2_ROUTE_ENABLED", "");
    const res = await POST(mkRequest({ utterance: "x" }));
    expect(res.status).toBe(404);
    vi.unstubAllEnvs();
  });

  test("flag ON + 未ログインなら 401", async () => {
    vi.stubEnv("ALTER_MORNING_V2_ROUTE_ENABLED", "true");
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(mkRequest({ utterance: "x" }));
    expect(res.status).toBe(401);
    vi.unstubAllEnvs();
  });

  test("flag ON + auth + 不正 body（utterance 欠落）で 400", async () => {
    vi.stubEnv("ALTER_MORNING_V2_ROUTE_ENABLED", "true");
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(mkRequest({ foo: "bar" }));
    expect(res.status).toBe(400);
    vi.unstubAllEnvs();
  });

  test("flag ON + auth + 正常 body で 200 / pipeline 結果を返す", async () => {
    vi.stubEnv("ALTER_MORNING_V2_ROUTE_ENABLED", "true");
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(mkRequest({ utterance: "9時にスタバでコーヒー" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("ok");
    expect(body.data.comprehension.events).toHaveLength(1);
    expect(body.data.narration.narration.text.length).toBeGreaterThan(0);
    expect(body.data.annotations).toHaveProperty("body");
    expect(body.data.annotations).toHaveProperty("weather");
    expect(body.data.annotations).toHaveProperty("party");
    vi.unstubAllEnvs();
  });

  test("flag ON + 不正 JSON で 400", async () => {
    vi.stubEnv("ALTER_MORNING_V2_ROUTE_ENABLED", "true");
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const req = new Request("http://localhost/api/alter-morning/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json{{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    vi.unstubAllEnvs();
  });
});
