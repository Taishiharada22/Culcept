/**
 * Plan Places Search Route Handler tests (Phase 2-D C1)
 *
 * 設計書: docs/alter-plan-phase2-d-place-picker-mini-design.md v2 §4 / §11
 *
 * 検証範囲:
 *   1. auth gate (401)
 *   2. input validation (400):
 *      - malformed JSON
 *      - missing query
 *      - extra root fields (privacy leak signal)
 *      - query too long
 *      - bias invalid shape
 *   3. rate limit 60/hour (429)
 *   4. apiAvailable=false → empty results, apiAvailable=false in response
 *   5. Places API empty results
 *   6. Places API throw → fail-open (results=[], apiAvailable=true)
 *   7. distanceMeters: bias 指定時 計算、なし時 null
 *   8. privacy: textQuery + locationBias only (anchor metadata leak なし)
 *   9. empty query → empty results (no API call)
 *  10. response shape: { ok, data: { results, apiAvailable } }
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  createMockSupabaseClient,
  type MockSupabaseClient,
} from "@/tests/fixtures/mockSupabaseClient";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mocks (before route import)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let currentMockClient: MockSupabaseClient;

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn(async () => currentMockClient.asSupabaseClient()),
}));

const mockSearchPlaces = vi.fn();
const mockIsAvailable = vi.fn();

vi.mock("@/lib/alter-morning/placesApiClient", () => ({
  searchPlacesByText: (...args: unknown[]) => mockSearchPlaces(...args),
  isPlacesApiAvailable: () => mockIsAvailable(),
}));

import { POST } from "@/app/api/plan/places/search/route";
import { _resetGeocodeRateLimitForTest } from "@/lib/plan/geocodeRateLimit";

const USER_A = "00000000-0000-0000-0000-00000000000a";

function makePostRequest(body: unknown): Request {
  return new Request("http://localhost/api/plan/places/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  currentMockClient = createMockSupabaseClient({ idPrefix: "ps" });
  _resetGeocodeRateLimitForTest();
  mockSearchPlaces.mockReset();
  mockIsAvailable.mockReset();
  mockIsAvailable.mockReturnValue(true); // default
  mockSearchPlaces.mockResolvedValue([]); // default empty
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("POST /api/plan/places/search", () => {
  describe("auth gate", () => {
    it("無認証 → 401", async () => {
      const res = await POST(makePostRequest({ query: "Tokyo" }));
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized");
      expect(mockSearchPlaces).not.toHaveBeenCalled();
    });
  });

  describe("input validation", () => {
    beforeEach(() => {
      currentMockClient.setAuthUser({ id: USER_A });
    });

    it("malformed JSON → 400", async () => {
      const req = new Request("http://localhost/api/plan/places/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("body root に extra field (anchor metadata leak signal) → 400", async () => {
      const res = await POST(
        makePostRequest({ query: "Tokyo", anchorTitle: "leak" }),
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("anchorTitle");
    });

    it("query が string でない → 400", async () => {
      const res = await POST(makePostRequest({ query: 123 }));
      expect(res.status).toBe(400);
    });

    it("query が 300 文字超 → 400", async () => {
      const longQuery = "あ".repeat(301);
      const res = await POST(makePostRequest({ query: longQuery }));
      expect(res.status).toBe(400);
    });

    it("query 空 → 200 + empty results (no API call)", async () => {
      const res = await POST(makePostRequest({ query: "" }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.results).toEqual([]);
      expect(mockSearchPlaces).not.toHaveBeenCalled();
    });

    it("query 空白のみ → 200 + empty results", async () => {
      const res = await POST(makePostRequest({ query: "   " }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.results).toEqual([]);
      expect(mockSearchPlaces).not.toHaveBeenCalled();
    });

    it("bias が invalid shape → 400", async () => {
      const res = await POST(
        makePostRequest({ query: "Tokyo", bias: { lat: "not a number" } }),
      );
      expect(res.status).toBe(400);
    });

    it("bias.lat が out of range → 400", async () => {
      const res = await POST(
        makePostRequest({
          query: "Tokyo",
          bias: { lat: 200, lng: 0, radiusMeters: 1000 },
        }),
      );
      expect(res.status).toBe(400);
    });

    it("bias.radiusMeters が 0 or 超大 → 400", async () => {
      const res = await POST(
        makePostRequest({
          query: "Tokyo",
          bias: { lat: 35, lng: 139, radiusMeters: 0 },
        }),
      );
      expect(res.status).toBe(400);
      const res2 = await POST(
        makePostRequest({
          query: "Tokyo",
          bias: { lat: 35, lng: 139, radiusMeters: 200000 },
        }),
      );
      expect(res2.status).toBe(400);
    });
  });

  describe("rate limit 60/hour", () => {
    it("61 回目 → 429", async () => {
      currentMockClient.setAuthUser({ id: USER_A });
      mockSearchPlaces.mockResolvedValue([]);

      for (let i = 0; i < 60; i++) {
        const r = await POST(makePostRequest({ query: "Tokyo" }));
        expect(r.status).toBe(200);
      }
      const res = await POST(makePostRequest({ query: "Tokyo" }));
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("3600");
    });
  });

  describe("apiAvailable=false (server key 未設定)", () => {
    it("Places API key 未設定 → empty results + apiAvailable=false", async () => {
      currentMockClient.setAuthUser({ id: USER_A });
      mockIsAvailable.mockReturnValue(false);

      const res = await POST(makePostRequest({ query: "Tokyo" }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.results).toEqual([]);
      expect(json.data.apiAvailable).toBe(false);
      expect(mockSearchPlaces).not.toHaveBeenCalled();
    });
  });

  describe("Places API throw / empty", () => {
    beforeEach(() => {
      currentMockClient.setAuthUser({ id: USER_A });
    });

    it("Places API throw → fail-open (results=[], apiAvailable=true)", async () => {
      mockSearchPlaces.mockRejectedValue(new Error("Places API rate limited"));
      const res = await POST(makePostRequest({ query: "Tokyo" }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.results).toEqual([]);
      expect(json.data.apiAvailable).toBe(true);
    });

    it("Places API empty results → empty array", async () => {
      mockSearchPlaces.mockResolvedValue([]);
      const res = await POST(makePostRequest({ query: "存在しない場所" }));
      const json = await res.json();
      expect(json.data.results).toEqual([]);
    });

    it("Places API location 不在の result は skip", async () => {
      mockSearchPlaces.mockResolvedValue([
        {
          id: "p1",
          displayName: { text: "Place A", languageCode: "ja" },
          // location なし
        },
        {
          id: "p2",
          displayName: { text: "Place B", languageCode: "ja" },
          location: { latitude: 35, longitude: 139 },
        },
      ]);
      const res = await POST(makePostRequest({ query: "Tokyo" }));
      const json = await res.json();
      expect(json.data.results).toHaveLength(1);
      expect(json.data.results[0].placeId).toBe("p2");
    });
  });

  describe("PlaceCandidate shape", () => {
    beforeEach(() => {
      currentMockClient.setAuthUser({ id: USER_A });
    });

    it("正常 candidates 返却 (placeId/name/address/lat/lng/types)", async () => {
      mockSearchPlaces.mockResolvedValue([
        {
          id: "p1",
          displayName: { text: "スターバックス 成田空港店", languageCode: "ja" },
          formattedAddress: "千葉県成田市古込1番地",
          location: { latitude: 35.7820, longitude: 140.3186 },
          types: ["cafe", "food"],
        },
      ]);
      const res = await POST(makePostRequest({ query: "成田のスタバ" }));
      const json = await res.json();
      expect(json.data.results[0]).toMatchObject({
        placeId: "p1",
        name: "スターバックス 成田空港店",
        address: "千葉県成田市古込1番地",
        lat: 35.7820,
        lng: 140.3186,
        types: ["cafe", "food"],
      });
    });

    it("address 不在の result → address=null", async () => {
      mockSearchPlaces.mockResolvedValue([
        {
          id: "p1",
          displayName: { text: "Place A", languageCode: "ja" },
          location: { latitude: 35, longitude: 139 },
        },
      ]);
      const res = await POST(makePostRequest({ query: "Tokyo" }));
      const json = await res.json();
      expect(json.data.results[0].address).toBeNull();
    });

    it("types 不在 → empty array", async () => {
      mockSearchPlaces.mockResolvedValue([
        {
          id: "p1",
          displayName: { text: "Place A", languageCode: "ja" },
          location: { latitude: 35, longitude: 139 },
        },
      ]);
      const res = await POST(makePostRequest({ query: "Tokyo" }));
      const json = await res.json();
      expect(json.data.results[0].types).toEqual([]);
    });
  });

  describe("bias 指定 + distance 計算", () => {
    beforeEach(() => {
      currentMockClient.setAuthUser({ id: USER_A });
    });

    it("bias なし → distanceMeters=null", async () => {
      mockSearchPlaces.mockResolvedValue([
        {
          id: "p1",
          displayName: { text: "Place", languageCode: "ja" },
          location: { latitude: 35, longitude: 139 },
        },
      ]);
      const res = await POST(makePostRequest({ query: "Tokyo" }));
      const json = await res.json();
      expect(json.data.results[0].distanceMeters).toBeNull();
    });

    it("bias 指定 → Haversine 距離 計算 (m)", async () => {
      mockSearchPlaces.mockResolvedValue([
        {
          id: "p1",
          displayName: { text: "Place", languageCode: "ja" },
          location: { latitude: 35.0, longitude: 139.0 },
        },
      ]);
      const res = await POST(
        makePostRequest({
          query: "Tokyo",
          bias: { lat: 35.01, lng: 139.01, radiusMeters: 10000 },
        }),
      );
      const json = await res.json();
      // 0.01 度差 ≈ 約 1.1-1.4km (緯度 35 度付近)
      expect(json.data.results[0].distanceMeters).toBeGreaterThan(1000);
      expect(json.data.results[0].distanceMeters).toBeLessThan(2000);
    });

    it("bias coord が外部送信される (locationBias)", async () => {
      mockSearchPlaces.mockResolvedValue([]);
      await POST(
        makePostRequest({
          query: "Tokyo",
          bias: { lat: 35.6, lng: 139.7, radiusMeters: 5000 },
        }),
      );
      expect(mockSearchPlaces).toHaveBeenCalledTimes(1);
      const callArg = mockSearchPlaces.mock.calls[0]![0] as Record<string, unknown>;
      expect(callArg.locationBias).toEqual({
        lat: 35.6,
        lng: 139.7,
        radius: 5000,
      });
    });
  });

  describe("privacy: outbound payload (no anchor metadata leak)", () => {
    beforeEach(() => {
      currentMockClient.setAuthUser({ id: USER_A });
    });

    it("Places API call argument には textQuery + bias 関連のみ、anchor metadata なし", async () => {
      mockSearchPlaces.mockResolvedValue([]);
      await POST(makePostRequest({ query: "成田のスタバ" }));

      expect(mockSearchPlaces).toHaveBeenCalledTimes(1);
      const callArg = mockSearchPlaces.mock.calls[0]![0] as Record<string, unknown>;

      // 送信 field の集合を strict 検証
      const sentKeys = Object.keys(callArg).sort();
      expect(sentKeys).toEqual(["languageCode", "maxResultCount", "regionCode", "textQuery"]);
      expect(callArg.textQuery).toBe("成田のスタバ");
      expect(callArg.languageCode).toBe("ja");
      expect(callArg.maxResultCount).toBe(20); // P12-B: guard 再ランク用に多め取得（call 課金・追加コストなし）
      expect(callArg.regionCode).toBe("JP"); // ★日本固定（bias 無し時の US フォールバック防止）

      // anchor metadata が含まれていないこと
      expect((callArg as Record<string, unknown>).anchorId).toBeUndefined();
      expect((callArg as Record<string, unknown>).userId).toBeUndefined();
      expect((callArg as Record<string, unknown>).title).toBeUndefined();
      expect((callArg as Record<string, unknown>).sensitiveCategory).toBeUndefined();
    });

    it("bias 指定時、bias coord も locationBias として送信される (それ以外なし)", async () => {
      mockSearchPlaces.mockResolvedValue([]);
      await POST(
        makePostRequest({
          query: "成田のスタバ",
          bias: { lat: 35.78, lng: 140.32, radiusMeters: 10000 },
        }),
      );
      const callArg = mockSearchPlaces.mock.calls[0]![0] as Record<string, unknown>;
      const sentKeys = Object.keys(callArg).sort();
      expect(sentKeys).toEqual(["languageCode", "locationBias", "maxResultCount", "regionCode", "textQuery"]);
    });
  });

  describe("response shape", () => {
    beforeEach(() => {
      currentMockClient.setAuthUser({ id: USER_A });
    });

    it("正常系 → { ok: true, data: { results, apiAvailable } }", async () => {
      mockSearchPlaces.mockResolvedValue([]);
      const res = await POST(makePostRequest({ query: "Tokyo" }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(Array.isArray(json.data.results)).toBe(true);
      expect(typeof json.data.apiAvailable).toBe("boolean");
    });

    it("max 5 results 確認", async () => {
      const dummies = Array.from({ length: 5 }, (_, i) => ({
        id: `p${i}`,
        displayName: { text: `Place ${i}`, languageCode: "ja" },
        location: { latitude: 35 + i * 0.01, longitude: 139 + i * 0.01 },
      }));
      mockSearchPlaces.mockResolvedValue(dummies);
      const res = await POST(makePostRequest({ query: "Tokyo" }));
      const json = await res.json();
      expect(json.data.results).toHaveLength(5);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 2-H: title 受取、 query combine、 ambiguous 早期 return
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("Phase 2-H: title-aware query combine", () => {
    beforeEach(() => {
      currentMockClient.setAuthUser({ id: USER_A });
    });

    it("title 受取 200: title='ショッピング' + query='新宿' → combine textQuery='新宿 ショッピング' で API call", async () => {
      mockSearchPlaces.mockResolvedValue([]);
      const res = await POST(
        makePostRequest({ query: "新宿", title: "ショッピング" }),
      );
      expect(res.status).toBe(200);
      expect(mockSearchPlaces).toHaveBeenCalledTimes(1);
      const callArg = mockSearchPlaces.mock.calls[0]![0] as Record<string, unknown>;
      expect(callArg.textQuery).toBe("新宿 ショッピング");
    });

    it("intent_only: title 単独 (query 空) → API call textQuery=title", async () => {
      mockSearchPlaces.mockResolvedValue([]);
      const res = await POST(
        makePostRequest({ query: "", title: "ショッピング" }),
      );
      expect(res.status).toBe(200);
      expect(mockSearchPlaces).toHaveBeenCalledTimes(1);
      const callArg = mockSearchPlaces.mock.calls[0]![0] as Record<string, unknown>;
      expect(callArg.textQuery).toBe("ショッピング");
    });

    it("explicit_place: locationText に施設キーワード → query をそのまま (既存 Phase 2-D 挙動)", async () => {
      mockSearchPlaces.mockResolvedValue([]);
      const res = await POST(
        makePostRequest({ query: "スターバックス 新宿南口", title: "ショッピング" }),
      );
      expect(res.status).toBe(200);
      const callArg = mockSearchPlaces.mock.calls[0]![0] as Record<string, unknown>;
      // explicit_place は title combine しない、 query のみ
      expect(callArg.textQuery).toBe("スターバックス 新宿南口");
    });

    it("ambiguous: title 空 + query 空 → 200 + empty results (no API call)", async () => {
      mockSearchPlaces.mockResolvedValue([]);
      const res = await POST(makePostRequest({ query: "", title: "" }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.results).toEqual([]);
      expect(mockSearchPlaces).not.toHaveBeenCalled();
    });

    it("ambiguous: title 短すぎ (1 文字) + query 空 → 200 + empty (no API call)", async () => {
      mockSearchPlaces.mockResolvedValue([]);
      const res = await POST(makePostRequest({ query: "", title: "あ" }));
      expect(res.status).toBe(200);
      expect(mockSearchPlaces).not.toHaveBeenCalled();
    });

    it("title が string でない → 400", async () => {
      const res = await POST(
        makePostRequest({ query: "新宿", title: 123 }),
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("title");
    });

    it("title が 300 文字超 → 400", async () => {
      const res = await POST(
        makePostRequest({
          query: "新宿",
          title: "あ".repeat(301),
        }),
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("title");
    });

    it("title 未渡し (= optional 不在) → 既存挙動 (= explicit_place で query のまま)", async () => {
      mockSearchPlaces.mockResolvedValue([]);
      const res = await POST(makePostRequest({ query: "成田のスタバ" }));
      expect(res.status).toBe(200);
      const callArg = mockSearchPlaces.mock.calls[0]![0] as Record<string, unknown>;
      expect(callArg.textQuery).toBe("成田のスタバ");
    });

    it("Privacy: title は textQuery に combine 後送信、独立 field では送られない", async () => {
      mockSearchPlaces.mockResolvedValue([]);
      await POST(
        makePostRequest({ query: "新宿", title: "ショッピング" }),
      );
      const callArg = mockSearchPlaces.mock.calls[0]![0] as Record<string, unknown>;
      // title field 単独では送らない (= 既存 privacy guarantee 維持)
      expect(callArg.title).toBeUndefined();
      // 送信 keys は { textQuery, maxResultCount, languageCode } のみ (= bias なし)
      const sentKeys = Object.keys(callArg).sort();
      expect(sentKeys).toEqual(["languageCode", "maxResultCount", "regionCode", "textQuery"]);
    });
  });
});
