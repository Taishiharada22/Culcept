/**
 * Routes API Client テスト — Phase C-1
 *
 * Google Routes API クライアントの単体テスト。
 * API 呼び出しはモック、ビジネスロジックを検証する。
 */

import { describe, test, expect, beforeEach, vi, afterEach } from "vitest";
import {
  computeRoute,
  isRoutesApiAvailable,
  toRouteTravelMode,
  parseDurationString,
  type ComputeRouteOptions,
  type LatLng,
  type RouteTravelMode,
} from "@/lib/alter-morning/routesApiClient";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Setup
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// fetch をモック
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// env をモック
const originalEnv = { ...process.env };

beforeEach(() => {
  mockFetch.mockReset();
  process.env.GOOGLE_MAPS_API_KEY = "test-api-key-routes";
});

afterEach(() => {
  process.env = { ...originalEnv };
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper: 成功レスポンスのモック
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mockSuccessResponse(durationStr: string, distanceMeters: number) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      routes: [
        {
          duration: durationStr,
          distanceMeters,
        },
      ],
    }),
  });
}

const KOFU: LatLng = { lat: 35.6621, lng: 138.5682 };
const TOKYO: LatLng = { lat: 35.6762, lng: 139.6503 };
const SHIBUYA: LatLng = { lat: 35.6580, lng: 139.7016 };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. parseDurationString
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("parseDurationString", () => {
  test("通常の秒数文字列をパースする", () => {
    expect(parseDurationString("1800s")).toBe(1800);
    expect(parseDurationString("600s")).toBe(600);
    expect(parseDurationString("0s")).toBe(0);
  });

  test("空文字列 → 0", () => {
    expect(parseDurationString("")).toBe(0);
  });

  test("不正な形式 → 0", () => {
    expect(parseDurationString("invalid")).toBe(0);
    expect(parseDurationString("30m")).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. toRouteTravelMode
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("toRouteTravelMode", () => {
  test("英語の交通手段をマッピングする", () => {
    expect(toRouteTravelMode("car")).toBe("DRIVE");
    expect(toRouteTravelMode("taxi")).toBe("DRIVE");
    expect(toRouteTravelMode("train")).toBe("TRANSIT");
    expect(toRouteTravelMode("bus")).toBe("TRANSIT");
    expect(toRouteTravelMode("walk")).toBe("WALK");
    expect(toRouteTravelMode("bicycle")).toBe("BICYCLE");
    expect(toRouteTravelMode("motorcycle")).toBe("TWO_WHEELER");
  });

  test("日本語の交通手段をマッピングする", () => {
    expect(toRouteTravelMode("電車")).toBe("TRANSIT");
    expect(toRouteTravelMode("車")).toBe("DRIVE");
    expect(toRouteTravelMode("徒歩")).toBe("WALK");
    expect(toRouteTravelMode("歩き")).toBe("WALK");
    expect(toRouteTravelMode("自転車")).toBe("BICYCLE");
    expect(toRouteTravelMode("チャリ")).toBe("BICYCLE");
    expect(toRouteTravelMode("バス")).toBe("TRANSIT");
    expect(toRouteTravelMode("タクシー")).toBe("DRIVE");
    expect(toRouteTravelMode("バイク")).toBe("TWO_WHEELER");
  });

  test("未指定 → DRIVE", () => {
    expect(toRouteTravelMode(undefined)).toBe("DRIVE");
    expect(toRouteTravelMode("")).toBe("DRIVE");
  });

  test("不明な交通手段 → DRIVE", () => {
    expect(toRouteTravelMode("飛行機")).toBe("DRIVE");
    expect(toRouteTravelMode("segway")).toBe("DRIVE");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. isRoutesApiAvailable
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isRoutesApiAvailable", () => {
  test("API キーが設定されている → true", () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    expect(isRoutesApiAvailable()).toBe(true);
  });

  test("API キーが未設定 → false", () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    expect(isRoutesApiAvailable()).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. computeRoute
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeRoute", () => {
  test("甲府→東京: 正常レスポンスから duration/distance を取得", async () => {
    // 甲府→東京 約90分、約120km
    mockSuccessResponse("5400s", 120000);

    const result = await computeRoute({
      origin: KOFU,
      destination: TOKYO,
      travelMode: "DRIVE",
    });

    expect(result.durationSeconds).toBe(5400);
    expect(result.durationMinutes).toBe(90);
    expect(result.distanceMeters).toBe(120000);
    expect(result.travelMode).toBe("DRIVE");
  });

  test("短距離: 渋谷→東京駅 電車15分", async () => {
    mockSuccessResponse("900s", 8000);

    const result = await computeRoute({
      origin: SHIBUYA,
      destination: TOKYO,
      travelMode: "TRANSIT",
    });

    expect(result.durationSeconds).toBe(900);
    expect(result.durationMinutes).toBe(15);
    expect(result.distanceMeters).toBe(8000);
    expect(result.travelMode).toBe("TRANSIT");
  });

  test("durationMinutes は切り上げ（7分30秒 → 8分）", async () => {
    mockSuccessResponse("450s", 3000); // 7分30秒

    const result = await computeRoute({
      origin: KOFU,
      destination: TOKYO,
      travelMode: "WALK",
    });

    expect(result.durationSeconds).toBe(450);
    expect(result.durationMinutes).toBe(8); // ceil(450/60) = 8
  });

  test("リクエストに正しい field mask が設定される", async () => {
    mockSuccessResponse("600s", 5000);

    await computeRoute({
      origin: KOFU,
      destination: TOKYO,
      travelMode: "DRIVE",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("computeRoutes");
    expect(options.headers["X-Goog-FieldMask"]).toBe("routes.duration,routes.distanceMeters");
    // API キーがヘッダーに設定されている
    expect(options.headers["X-Goog-Api-Key"]).toBe("test-api-key-routes");
  });

  test("リクエスト body に座標と travelMode が含まれる", async () => {
    mockSuccessResponse("600s", 5000);

    await computeRoute({
      origin: KOFU,
      destination: TOKYO,
      travelMode: "BICYCLE",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.origin.location.latLng.latitude).toBe(KOFU.lat);
    expect(body.origin.location.latLng.longitude).toBe(KOFU.lng);
    expect(body.destination.location.latLng.latitude).toBe(TOKYO.lat);
    expect(body.destination.location.latLng.longitude).toBe(TOKYO.lng);
    expect(body.travelMode).toBe("BICYCLE");
  });

  test("TRANSIT + departureTime 指定 → body に含まれる", async () => {
    mockSuccessResponse("1800s", 15000);

    const departureTime = "2026-04-16T08:00:00+09:00";
    await computeRoute({
      origin: KOFU,
      destination: TOKYO,
      travelMode: "TRANSIT",
      departureTime,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.departureTime).toBe(departureTime);
    expect(body.travelMode).toBe("TRANSIT");
  });

  test("DRIVE + departureTime → departureTime は送信しない", async () => {
    mockSuccessResponse("600s", 5000);

    await computeRoute({
      origin: KOFU,
      destination: TOKYO,
      travelMode: "DRIVE",
      departureTime: "2026-04-16T08:00:00+09:00",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.departureTime).toBeUndefined();
  });

  test("API キー未設定 → throw", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;

    await expect(
      computeRoute({ origin: KOFU, destination: TOKYO, travelMode: "DRIVE" }),
    ).rejects.toThrow("GOOGLE_MAPS_API_KEY is not set");

    // fetch は呼ばれていない
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("HTTP エラー → throw（fail-open は caller 側で処理）", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "Bad Request",
    });

    await expect(
      computeRoute({ origin: KOFU, destination: TOKYO, travelMode: "DRIVE" }),
    ).rejects.toThrow("Routes API computeRoute failed: 400");
  });

  test("レスポンスにルートがない → throw", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ routes: [] }),
    });

    await expect(
      computeRoute({ origin: KOFU, destination: TOKYO, travelMode: "DRIVE" }),
    ).rejects.toThrow("No route found");
  });

  test("API キーがログに出ない（ヘッダーにのみ含まれる）", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error with key=test-api-key-routes",
    });

    // エラー内容にキーが含まれていても、throw するメッセージにはステータスのみ
    try {
      await computeRoute({ origin: KOFU, destination: TOKYO, travelMode: "DRIVE" });
    } catch (e: unknown) {
      const msg = (e as Error).message;
      expect(msg).not.toContain("test-api-key-routes");
      expect(msg).toContain("500");
    }
  });
});
