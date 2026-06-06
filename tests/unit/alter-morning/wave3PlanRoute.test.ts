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

// A1-5-5g-2: capture observe を no-op spy 化（route が実 LLM/observer を発火しないことを保証 + 配線検証）
vi.mock("@/lib/plan/reality/integration/alter-morning-capture-observe", () => ({
  fireMorningCapture: vi.fn(),
}));

// A1-5-7-5: capture surface を mock（route が実 DB read しないことを保証 + 配線/後方互換検証）。既定 null=captureCandidate 無
vi.mock("@/lib/plan/reality/integration/morning-capture-surface.server", () => ({
  buildMorningCaptureSurface: vi.fn(async () => null),
}));

import { POST } from "@/app/api/alter-morning/plan/route";
import { fireMorningCapture } from "@/lib/plan/reality/integration/alter-morning-capture-observe";
import { buildMorningCaptureSurface } from "@/lib/plan/reality/integration/morning-capture-surface.server";
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
  vi.mocked(fireMorningCapture).mockClear();
  vi.mocked(buildMorningCaptureSurface).mockReset();
  vi.mocked(buildMorningCaptureSurface).mockResolvedValue(null); // 既定 null=captureCandidate 無（後方互換）
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

describe("A1-5-5g-2 capture observe wiring（observe-only・fire-and-forget・response 不変）", () => {
  test("200: capture observe を fire-and-forget で呼ぶ（utterance + user.id）・response 不変", async () => {
    vi.stubEnv("ALTER_MORNING_V2_ROUTE_ENABLED", "true");
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(mkRequest({ utterance: "9時にスタバでコーヒー" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("ok"); // response 不変（observer は混ざらない）
    expect(fireMorningCapture).toHaveBeenCalledTimes(1);
    // utterance + user.id + 認証済 supabase client（write mode の RPC 先）。observe/write は flag が決める。
    expect(fireMorningCapture).toHaveBeenCalledWith("9時にスタバでコーヒー", "u1", expect.anything());
    vi.unstubAllEnvs();
  });

  test("404（flag off）/ 401（unauth）/ 400（bad body）では observe を呼ばない", async () => {
    vi.stubEnv("ALTER_MORNING_V2_ROUTE_ENABLED", "false");
    await POST(mkRequest({ utterance: "x" }));
    expect(fireMorningCapture).not.toHaveBeenCalled();
    vi.unstubAllEnvs();

    vi.stubEnv("ALTER_MORNING_V2_ROUTE_ENABLED", "true");
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await POST(mkRequest({ utterance: "x" }));
    expect(fireMorningCapture).not.toHaveBeenCalled();

    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    await POST(mkRequest({ foo: "bar" }));
    expect(fireMorningCapture).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  test("observer が throw しても route response 不変（route 側 try/catch・二重防御）", async () => {
    vi.stubEnv("ALTER_MORNING_V2_ROUTE_ENABLED", "true");
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    vi.mocked(fireMorningCapture).mockImplementationOnce(() => {
      throw new Error("observer boom");
    });
    const res = await POST(mkRequest({ utterance: "9時にスタバでコーヒー" }));
    expect(res.status).toBe(200); // observer throw でも response 不変
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("ok");
    vi.unstubAllEnvs();
  });
});

describe("A1-5-7-5 capture surface wiring（additive optional・後方互換・fail-open）", () => {
  const SURFACE = { hasCandidate: true, candidateCount: 1, status: "has_candidate", items: [{ durationMin: 60, evidenceSource: "seed_explicit", date: null, band: null, confidenceBand: "high" }] };

  test("surface null（flag off / no candidate / read error）→ captureCandidate なし・既存 data 完全一致", async () => {
    vi.stubEnv("ALTER_MORNING_V2_ROUTE_ENABLED", "true");
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    vi.mocked(buildMorningCaptureSurface).mockResolvedValue(null);
    const res = await POST(mkRequest({ utterance: "9時にスタバでコーヒー" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect("captureCandidate" in body.data).toBe(false); // additive なし
    expect(body.data.status).toBe("ok");
    expect(body.data.comprehension.events).toHaveLength(1); // 既存 keys 維持
    vi.unstubAllEnvs();
  });

  test("candidate present → data.captureCandidate が additive で入る・既存 keys 維持・envelope 不変", async () => {
    vi.stubEnv("ALTER_MORNING_V2_ROUTE_ENABLED", "true");
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    vi.mocked(buildMorningCaptureSurface).mockResolvedValue(SURFACE as never);
    const res = await POST(mkRequest({ utterance: "9時にスタバでコーヒー" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true); // envelope 不変
    expect(body.data.captureCandidate).toEqual(SURFACE); // additive
    expect(body.data.status).toBe("ok"); // 既存 keys 維持
    expect(body.data.narration.narration.text.length).toBeGreaterThan(0);
    // raw / source_ref / UUID が response に出ない
    const json = JSON.stringify(body);
    for (const leak of ["source_ref", "seedRef"]) expect(json).not.toContain(leak);
    vi.unstubAllEnvs();
  });

  test("buildMorningCaptureSurface throw → fail-open（200・captureCandidate なし）", async () => {
    vi.stubEnv("ALTER_MORNING_V2_ROUTE_ENABLED", "true");
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    vi.mocked(buildMorningCaptureSurface).mockRejectedValue(new Error("surface boom"));
    const res = await POST(mkRequest({ utterance: "9時にスタバでコーヒー" }));
    expect(res.status).toBe(200); // fail-open
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect("captureCandidate" in body.data).toBe(false);
    expect(body.data.status).toBe("ok");
    vi.unstubAllEnvs();
  });

  test("error response（pipeline 不問）は不変: 404/401/400 では surface を呼ばない", async () => {
    vi.stubEnv("ALTER_MORNING_V2_ROUTE_ENABLED", "false");
    await POST(mkRequest({ utterance: "x" }));
    expect(buildMorningCaptureSurface).not.toHaveBeenCalled(); // 404
    vi.unstubAllEnvs();
    vi.stubEnv("ALTER_MORNING_V2_ROUTE_ENABLED", "true");
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await POST(mkRequest({ utterance: "x" }));
    expect(buildMorningCaptureSurface).not.toHaveBeenCalled(); // 401
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    await POST(mkRequest({ foo: "bar" }));
    expect(buildMorningCaptureSurface).not.toHaveBeenCalled(); // 400
    vi.unstubAllEnvs();
  });
});
