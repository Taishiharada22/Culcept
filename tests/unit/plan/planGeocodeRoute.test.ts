/**
 * Plan Anchors Geocode Route Handler tests (Phase 2-C v3 C1)
 *
 * 設計書: docs/alter-plan-phase2-c-map-tab-mini-design.md §5.2 / §11 smoke
 *
 * 検証範囲 (§11.13 smoke 整合):
 *   1. auth gate (401)
 *   2. input validation (400)
 *      - malformed JSON
 *      - missing items
 *      - extra root field (privacy 侵入の signal)
 *      - extra item field (anchor metadata leak signal)
 *      - wrong item shape
 *      - items > 50 (max batch cap)
 *   3. rate limit (429)
 *   4. ownership check (silently 除外)
 *   5. sensitive privacy (外部送信せず unresolved_sensitive)
 *   6. empty locationText (unresolved_empty)
 *   7. cache hit (resolved_cache)
 *   8. cache miss → Places API success (resolved_api)
 *   9. cache miss → Places API throw (unresolved_api_throw、fail-open)
 *  10. apiAvailable=false (unresolved_api_unavailable)
 *  11. cache hit with low confidence (unresolved_low_confidence、誤 pin 回避)
 *  12. dedupe (normalize 後の同 locationText が 1 Places call で全 anchor 解決)
 *  13. privacy: Places API への送信は textQuery のみ (anchor metadata leak なし)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  createMockSupabaseClient,
  type MockSupabaseClient,
} from "@/tests/fixtures/mockSupabaseClient";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mocks (must be defined before route import)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let currentMockClient: MockSupabaseClient;

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn(async () => currentMockClient.asSupabaseClient()),
}));

const mockGetCached = vi.fn();
const mockSetCached = vi.fn();
const mockSearchPlaces = vi.fn();
const mockIsAvailable = vi.fn();

vi.mock("@/lib/alter-morning/placeResolver", () => ({
  getCachedResolution: (...args: unknown[]) => mockGetCached(...args),
  setCachedResolution: (...args: unknown[]) => mockSetCached(...args),
}));

vi.mock("@/lib/alter-morning/placesApiClient", () => ({
  searchPlacesByText: (...args: unknown[]) => mockSearchPlaces(...args),
  isPlacesApiAvailable: () => mockIsAvailable(),
}));

// Route handler import (mocks の後)
import { POST } from "@/app/api/plan/anchors/geocode/route";
import { _resetGeocodeRateLimitForTest } from "@/lib/plan/geocodeRateLimit";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const USER_A = "00000000-0000-0000-0000-00000000000a";
const USER_B = "00000000-0000-0000-0000-00000000000b";

function makePostRequest(body: unknown): Request {
  return new Request("http://localhost/api/plan/anchors/geocode", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Mock store に anchor row を挿入 (user_id + sensitive_category 指定可)
 *
 * 注意: mock の builder は thenable で、await されないと execute() しない → store に persist されない。
 * await を必須化することで test 内の前提条件を確実に成立させる。
 */
async function seedAnchor(
  anchorId: string,
  userId: string,
  sensitiveCategory: string | null = null,
): Promise<void> {
  await currentMockClient
    .asSupabaseClient()
    .from("external_anchors")
    .insert({
      id: anchorId,
      user_id: userId,
      sensitive_category: sensitiveCategory,
      title: "fixture",
      start_time: "12:00",
      rigidity: "hard",
    });
}

beforeEach(() => {
  currentMockClient = createMockSupabaseClient({ idPrefix: "geo" });
  _resetGeocodeRateLimitForTest();
  mockGetCached.mockReset();
  mockSetCached.mockReset();
  mockSearchPlaces.mockReset();
  mockIsAvailable.mockReset();
  // default: API available
  mockIsAvailable.mockReturnValue(true);
  // default: cache miss
  mockGetCached.mockResolvedValue(null);
  // default: cache write succeeds
  mockSetCached.mockResolvedValue(undefined);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("POST /api/plan/anchors/geocode", () => {
  // ─── 1. auth ───
  describe("auth gate", () => {
    it("無認証 → 401", async () => {
      // currentMockClient.setAuthUser() を呼ばない = unauth
      const res = await POST(makePostRequest({ items: [] }));
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error).toBe("Unauthorized");
      expect(mockSearchPlaces).not.toHaveBeenCalled();
    });
  });

  // ─── 2. input validation ───
  describe("input validation", () => {
    beforeEach(() => {
      currentMockClient.setAuthUser({ id: USER_A });
    });

    it("malformed JSON → 400", async () => {
      const req = new Request("http://localhost/api/plan/anchors/geocode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("body に items 不在 → 400", async () => {
      const res = await POST(makePostRequest({}));
      expect(res.status).toBe(400);
    });

    it("body root に extra field (anchor metadata leak signal) → 400", async () => {
      const res = await POST(makePostRequest({ items: [], userId: "leak" }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("userId");
    });

    it("items が array でない → 400", async () => {
      const res = await POST(makePostRequest({ items: "not-array" }));
      expect(res.status).toBe(400);
    });

    it("items.length > 50 → 400 (max batch cap)", async () => {
      const items = Array.from({ length: 51 }, (_, i) => ({
        anchorId: `a${i}`,
        locationText: "Tokyo Tower",
      }));
      const res = await POST(makePostRequest({ items }));
      expect(res.status).toBe(400);
    });

    it("item に extra field (title leak signal) → 400", async () => {
      const res = await POST(
        makePostRequest({
          items: [
            { anchorId: "a1", locationText: "Tokyo Tower", title: "leak" },
          ],
        }),
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("title");
    });

    it("item に extra field (sensitiveCategory leak signal) → 400", async () => {
      const res = await POST(
        makePostRequest({
          items: [
            {
              anchorId: "a1",
              locationText: "X",
              sensitiveCategory: "medical",
            },
          ],
        }),
      );
      expect(res.status).toBe(400);
    });

    it("item.anchorId が string でない → 400", async () => {
      const res = await POST(
        makePostRequest({
          items: [{ anchorId: 123, locationText: "X" }],
        }),
      );
      expect(res.status).toBe(400);
    });

    it("item.locationText が string でない → 400", async () => {
      const res = await POST(
        makePostRequest({
          items: [{ anchorId: "a1", locationText: 123 }],
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ─── 3. rate limit ───
  describe("rate limit", () => {
    it("同一 user の 101 回目 request → 429 + Retry-After", async () => {
      currentMockClient.setAuthUser({ id: USER_A });
      await seedAnchor("a1", USER_A);
      mockSearchPlaces.mockResolvedValue([
        {
          id: "p1",
          displayName: { text: "Place 1", languageCode: "ja" },
          location: { latitude: 35, longitude: 139 },
        },
      ]);

      // 100 回までは OK
      for (let i = 0; i < 100; i++) {
        const r = await POST(
          makePostRequest({
            items: [{ anchorId: "a1", locationText: "Tokyo Tower" }],
          }),
        );
        expect(r.status).toBe(200);
      }

      // 101 回目で 429
      const res = await POST(
        makePostRequest({
          items: [{ anchorId: "a1", locationText: "Tokyo Tower" }],
        }),
      );
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("3600");
    });

    it("別 user の rate counter は独立 (user A 100 件後でも user B は OK)", async () => {
      currentMockClient.setAuthUser({ id: USER_A });
      await seedAnchor("a1", USER_A);
      mockSearchPlaces.mockResolvedValue([
        {
          id: "p1",
          displayName: { text: "P", languageCode: "ja" },
          location: { latitude: 35, longitude: 139 },
        },
      ]);

      // user A で 100 件消費
      for (let i = 0; i < 100; i++) {
        await POST(
          makePostRequest({
            items: [{ anchorId: "a1", locationText: "Tokyo Tower" }],
          }),
        );
      }

      // user B に切替 → 1 件目から OK
      currentMockClient.setAuthUser({ id: USER_B });
      await seedAnchor("b1", USER_B);
      const res = await POST(
        makePostRequest({
          items: [{ anchorId: "b1", locationText: "Osaka" }],
        }),
      );
      expect(res.status).toBe(200);
    });
  });

  // ─── 4. ownership check ───
  describe("ownership check", () => {
    it("他 user の anchorId は silently 除外 (unresolved_not_owned)", async () => {
      currentMockClient.setAuthUser({ id: USER_A });
      await seedAnchor("a1", USER_A); // owned
      await seedAnchor("b1", USER_B); // 他 user 所有
      mockSearchPlaces.mockResolvedValue([
        {
          id: "p1",
          displayName: { text: "Place 1", languageCode: "ja" },
          location: { latitude: 35, longitude: 139 },
        },
      ]);

      const res = await POST(
        makePostRequest({
          items: [
            { anchorId: "a1", locationText: "Tokyo" },
            { anchorId: "b1", locationText: "Osaka" },
          ],
        }),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      const byId: Record<string, { resolution: unknown; reason: string }> = {};
      for (const r of json.data.results) byId[r.anchorId] = r;
      expect(byId.a1?.resolution).not.toBeNull();
      expect(byId.b1?.resolution).toBeNull();
      expect(byId.b1?.reason).toBe("unresolved_not_owned");
    });

    it("存在しない anchorId も unresolved_not_owned", async () => {
      currentMockClient.setAuthUser({ id: USER_A });

      const res = await POST(
        makePostRequest({
          items: [{ anchorId: "nonexistent", locationText: "Tokyo" }],
        }),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.results[0].reason).toBe("unresolved_not_owned");
    });
  });

  // ─── 5. sensitive privacy ───
  describe("sensitive privacy", () => {
    it("sensitive anchor (medical) は外部送信せず unresolved_sensitive", async () => {
      currentMockClient.setAuthUser({ id: USER_A });
      await seedAnchor("s1", USER_A, "medical");

      const res = await POST(
        makePostRequest({
          items: [{ anchorId: "s1", locationText: "近所のクリニック" }],
        }),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.results[0].resolution).toBeNull();
      expect(json.data.results[0].reason).toBe("unresolved_sensitive");
      // 外部 API は呼ばれない
      expect(mockSearchPlaces).not.toHaveBeenCalled();
      // cache も読まない (sensitive の cache 蓄積を避ける)
      expect(mockGetCached).not.toHaveBeenCalled();
    });

    it("全 sensitive category (legal / exam / other) で外部送信なし", async () => {
      currentMockClient.setAuthUser({ id: USER_A });
      await seedAnchor("s1", USER_A, "legal");
      await seedAnchor("s2", USER_A, "exam");
      await seedAnchor("s3", USER_A, "other");

      const res = await POST(
        makePostRequest({
          items: [
            { anchorId: "s1", locationText: "弁護士事務所" },
            { anchorId: "s2", locationText: "試験会場" },
            { anchorId: "s3", locationText: "病院" },
          ],
        }),
      );
      const json = await res.json();
      for (const r of json.data.results) {
        expect(r.resolution).toBeNull();
        expect(r.reason).toBe("unresolved_sensitive");
      }
      expect(mockSearchPlaces).not.toHaveBeenCalled();
    });
  });

  // ─── 6. empty locationText ───
  describe("empty / invalid locationText", () => {
    it("空文字列 → unresolved_empty", async () => {
      currentMockClient.setAuthUser({ id: USER_A });
      await seedAnchor("a1", USER_A);

      const res = await POST(
        makePostRequest({
          items: [{ anchorId: "a1", locationText: "" }],
        }),
      );
      const json = await res.json();
      expect(json.data.results[0].reason).toBe("unresolved_empty");
      expect(mockSearchPlaces).not.toHaveBeenCalled();
    });

    it("空白のみ → unresolved_empty (trim 後 空)", async () => {
      currentMockClient.setAuthUser({ id: USER_A });
      await seedAnchor("a1", USER_A);

      const res = await POST(
        makePostRequest({
          items: [{ anchorId: "a1", locationText: "   " }],
        }),
      );
      const json = await res.json();
      expect(json.data.results[0].reason).toBe("unresolved_empty");
    });

    it("300 文字超 → unresolved_empty", async () => {
      currentMockClient.setAuthUser({ id: USER_A });
      await seedAnchor("a1", USER_A);

      const long = "あ".repeat(301);
      const res = await POST(
        makePostRequest({
          items: [{ anchorId: "a1", locationText: long }],
        }),
      );
      const json = await res.json();
      expect(json.data.results[0].reason).toBe("unresolved_empty");
      expect(mockSearchPlaces).not.toHaveBeenCalled();
    });
  });

  // ─── 7. cache hit ───
  describe("cache hit", () => {
    it("L1/L2 cache hit (medium confidence) → resolved_cache、Places API 呼ばない", async () => {
      currentMockClient.setAuthUser({ id: USER_A });
      await seedAnchor("a1", USER_A);
      mockGetCached.mockResolvedValue({
        resolvedName: "Tokyo Tower",
        address: "東京都港区芝公園 4-2-8",
        placeId: "p_tower",
        lat: 35.6586,
        lng: 139.7454,
        confidence: "medium",
        cachedAt: "2026-05-01T00:00:00Z",
        lastUsedAt: "2026-05-19T00:00:00Z",
        useCount: 5,
      });

      const res = await POST(
        makePostRequest({
          items: [{ anchorId: "a1", locationText: "東京タワー" }],
        }),
      );
      const json = await res.json();
      expect(json.data.results[0].resolution).toEqual({
        lat: 35.6586,
        lng: 139.7454,
        confidence: "medium",
        resolvedName: "Tokyo Tower",
      });
      expect(json.data.results[0].reason).toBe("resolved_cache");
      expect(mockSearchPlaces).not.toHaveBeenCalled();
    });

    it("high confidence cache も resolved_cache", async () => {
      currentMockClient.setAuthUser({ id: USER_A });
      await seedAnchor("a1", USER_A);
      mockGetCached.mockResolvedValue({
        resolvedName: "Tokyo Tower",
        lat: 35.6586,
        lng: 139.7454,
        confidence: "high",
        cachedAt: "2026-05-01T00:00:00Z",
        lastUsedAt: "2026-05-19T00:00:00Z",
        useCount: 10,
      });

      const res = await POST(
        makePostRequest({
          items: [{ anchorId: "a1", locationText: "東京タワー" }],
        }),
      );
      const json = await res.json();
      expect(json.data.results[0].reason).toBe("resolved_cache");
      expect(mockSearchPlaces).not.toHaveBeenCalled();
    });
  });

  // ─── 8. cache hit low confidence (guard) ───
  describe("cached low confidence guard (誤 pin 回避)", () => {
    it("cache hit (low confidence) → unresolved_low_confidence、Places API も呼ばない", async () => {
      currentMockClient.setAuthUser({ id: USER_A });
      await seedAnchor("a1", USER_A);
      // Alter Morning 側で "low" として保存された entry を想定
      mockGetCached.mockResolvedValue({
        resolvedName: "図書館",
        lat: 35.0,
        lng: 139.0,
        confidence: "low",
        cachedAt: "2026-05-01T00:00:00Z",
        lastUsedAt: "2026-05-19T00:00:00Z",
        useCount: 1,
      });

      const res = await POST(
        makePostRequest({
          items: [{ anchorId: "a1", locationText: "図書館" }],
        }),
      );
      const json = await res.json();
      expect(json.data.results[0].resolution).toBeNull();
      expect(json.data.results[0].reason).toBe("unresolved_low_confidence");
      expect(mockSearchPlaces).not.toHaveBeenCalled();
    });
  });

  // ─── 9. cache miss → API success ───
  describe("cache miss → Places API", () => {
    it("cache miss → Places API success → resolved_api + cache write", async () => {
      currentMockClient.setAuthUser({ id: USER_A });
      await seedAnchor("a1", USER_A);
      mockGetCached.mockResolvedValue(null);
      mockSearchPlaces.mockResolvedValue([
        {
          id: "p1",
          displayName: { text: "東京タワー", languageCode: "ja" },
          formattedAddress: "東京都港区芝公園 4-2-8",
          location: { latitude: 35.6586, longitude: 139.7454 },
        },
      ]);

      const res = await POST(
        makePostRequest({
          items: [{ anchorId: "a1", locationText: "東京タワー" }],
        }),
      );
      const json = await res.json();
      expect(json.data.results[0].resolution).toEqual({
        lat: 35.6586,
        lng: 139.7454,
        confidence: "medium",
        resolvedName: "東京タワー",
      });
      expect(json.data.results[0].reason).toBe("resolved_api");
      // cache write 検証 (confidence="medium" 固定、§5.5)
      expect(mockSetCached).toHaveBeenCalledTimes(1);
      const [setUserId, setText, setArea, setEntry] = mockSetCached.mock.calls[0]!;
      expect(setUserId).toBe(USER_A);
      expect(setText).toBe("東京タワー");
      expect(setArea).toBeUndefined(); // §5.3 area=undefined
      expect(setEntry).toMatchObject({
        confidence: "medium",
        lat: 35.6586,
        lng: 139.7454,
      });
    });
  });

  // ─── 10. cache miss → API throw (fail-open) ───
  describe("cache miss → Places API throw", () => {
    it("Places API throw → unresolved_api_throw + UI 側 semantic fallback で処理", async () => {
      currentMockClient.setAuthUser({ id: USER_A });
      await seedAnchor("a1", USER_A);
      mockGetCached.mockResolvedValue(null);
      mockSearchPlaces.mockRejectedValue(new Error("Places API rate limited"));

      const res = await POST(
        makePostRequest({
          items: [{ anchorId: "a1", locationText: "Tokyo" }],
        }),
      );
      expect(res.status).toBe(200); // fail-open
      const json = await res.json();
      expect(json.data.results[0].resolution).toBeNull();
      expect(json.data.results[0].reason).toBe("unresolved_api_throw");
    });

    it("Places API は結果を返すが location 不在 → unresolved_api_throw", async () => {
      currentMockClient.setAuthUser({ id: USER_A });
      await seedAnchor("a1", USER_A);
      mockGetCached.mockResolvedValue(null);
      mockSearchPlaces.mockResolvedValue([
        {
          id: "p1",
          displayName: { text: "場所不明", languageCode: "ja" },
          // location field なし
        },
      ]);

      const res = await POST(
        makePostRequest({
          items: [{ anchorId: "a1", locationText: "曖昧な場所" }],
        }),
      );
      const json = await res.json();
      expect(json.data.results[0].reason).toBe("unresolved_api_throw");
    });

    it("Places API empty result → unresolved_api_throw", async () => {
      currentMockClient.setAuthUser({ id: USER_A });
      await seedAnchor("a1", USER_A);
      mockGetCached.mockResolvedValue(null);
      mockSearchPlaces.mockResolvedValue([]);

      const res = await POST(
        makePostRequest({
          items: [{ anchorId: "a1", locationText: "存在しない場所" }],
        }),
      );
      const json = await res.json();
      expect(json.data.results[0].reason).toBe("unresolved_api_throw");
    });
  });

  // ─── 11. API unavailable (key 未設定) ───
  describe("apiAvailable=false", () => {
    it("GOOGLE_MAPS_API_KEY 未設定 → unresolved_api_unavailable", async () => {
      currentMockClient.setAuthUser({ id: USER_A });
      await seedAnchor("a1", USER_A);
      mockIsAvailable.mockReturnValue(false);
      mockGetCached.mockResolvedValue(null);

      const res = await POST(
        makePostRequest({
          items: [{ anchorId: "a1", locationText: "Tokyo" }],
        }),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.results[0].reason).toBe("unresolved_api_unavailable");
      expect(json.data.apiAvailable).toBe(false);
      expect(mockSearchPlaces).not.toHaveBeenCalled();
    });
  });

  // ─── 12. dedupe ───
  describe("dedupe by normalized locationText", () => {
    it("同 normalized text を持つ複数 anchor → 1 Places API call で全 anchor 解決", async () => {
      currentMockClient.setAuthUser({ id: USER_A });
      await seedAnchor("a1", USER_A);
      await seedAnchor("a2", USER_A);
      await seedAnchor("a3", USER_A);
      mockGetCached.mockResolvedValue(null);
      mockSearchPlaces.mockResolvedValue([
        {
          id: "p1",
          displayName: { text: "Tokyo Tower", languageCode: "ja" },
          location: { latitude: 35.6586, longitude: 139.7454 },
        },
      ]);

      const res = await POST(
        makePostRequest({
          items: [
            { anchorId: "a1", locationText: "Tokyo Tower" },
            { anchorId: "a2", locationText: "tokyo tower" }, // lowercase
            { anchorId: "a3", locationText: "  Tokyo  Tower  " }, // whitespace
          ],
        }),
      );
      const json = await res.json();
      // 全 3 anchor が resolved
      expect(json.data.results).toHaveLength(3);
      for (const r of json.data.results) {
        expect(r.resolution).not.toBeNull();
      }
      // ただし Places API は 1 回しか呼ばれない (dedupe 検証)
      expect(mockSearchPlaces).toHaveBeenCalledTimes(1);
      // cache write も 1 回のみ
      expect(mockSetCached).toHaveBeenCalledTimes(1);
    });

    it("全角・半角混在も normalize で 1 call (NFKC)", async () => {
      currentMockClient.setAuthUser({ id: USER_A });
      await seedAnchor("a1", USER_A);
      await seedAnchor("a2", USER_A);
      mockGetCached.mockResolvedValue(null);
      mockSearchPlaces.mockResolvedValue([
        {
          id: "p1",
          displayName: { text: "Tokyo Tower", languageCode: "ja" },
          location: { latitude: 35.6586, longitude: 139.7454 },
        },
      ]);

      const res = await POST(
        makePostRequest({
          items: [
            { anchorId: "a1", locationText: "ＴＯＫＹＯ　ＴＯＷＥＲ" }, // 全角
            { anchorId: "a2", locationText: "Tokyo Tower" }, // 半角
          ],
        }),
      );
      const json = await res.json();
      expect(json.data.results).toHaveLength(2);
      for (const r of json.data.results) {
        expect(r.resolution).not.toBeNull();
      }
      expect(mockSearchPlaces).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 13. privacy ───
  describe("privacy: outbound payload", () => {
    it("Places API には textQuery 以外送信しない (anchor metadata leak チェック)", async () => {
      currentMockClient.setAuthUser({ id: USER_A });
      await seedAnchor("a1", USER_A);
      mockGetCached.mockResolvedValue(null);
      mockSearchPlaces.mockResolvedValue([
        {
          id: "p1",
          displayName: { text: "Tokyo Tower", languageCode: "ja" },
          location: { latitude: 35.6586, longitude: 139.7454 },
        },
      ]);

      await POST(
        makePostRequest({
          items: [{ anchorId: "a1", locationText: "東京タワー" }],
        }),
      );

      expect(mockSearchPlaces).toHaveBeenCalledTimes(1);
      const callArg = mockSearchPlaces.mock.calls[0]![0] as Record<string, unknown>;

      // 送信される field の集合を厳密にチェック
      const sentKeys = Object.keys(callArg).sort();
      expect(sentKeys).toEqual(["languageCode", "maxResultCount", "textQuery"]);
      expect(callArg.textQuery).toBe("東京タワー");
      expect(callArg.languageCode).toBe("ja");
      expect(callArg.maxResultCount).toBe(1);

      // 明示的に anchor metadata が含まれていないことを確認
      expect((callArg as Record<string, unknown>).anchorId).toBeUndefined();
      expect((callArg as Record<string, unknown>).userId).toBeUndefined();
      expect((callArg as Record<string, unknown>).title).toBeUndefined();
      expect((callArg as Record<string, unknown>).notes).toBeUndefined();
      expect((callArg as Record<string, unknown>).sensitiveCategory).toBeUndefined();
    });
  });

  // ─── 14. response shape ───
  describe("response shape", () => {
    it("正常系 → { ok: true, data: { results, apiAvailable } }", async () => {
      currentMockClient.setAuthUser({ id: USER_A });
      await seedAnchor("a1", USER_A);
      mockSearchPlaces.mockResolvedValue([
        {
          id: "p1",
          displayName: { text: "Tokyo", languageCode: "ja" },
          location: { latitude: 35, longitude: 139 },
        },
      ]);

      const res = await POST(
        makePostRequest({
          items: [{ anchorId: "a1", locationText: "Tokyo" }],
        }),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data).toBeDefined();
      expect(Array.isArray(json.data.results)).toBe(true);
      expect(typeof json.data.apiAvailable).toBe("boolean");
    });
  });
});
