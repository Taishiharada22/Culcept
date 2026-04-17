/**
 * Block 1 バグ修正: ブランク返答（placeConfirm のみ残存時）
 *
 * CEO 実機フィードバック 2026-04-17:
 *   「出せてない。そもそも、予定が出ないってこと。ブランクの返答しか来ない」
 *
 * シナリオ:
 *   1. User: 「今日はこれから高橋とサドヤでディナーの予定」
 *      → Alter: 「了解。...サドヤレストラン レアル・ドールで高橋とディナーだね。
 *                何時頃から動き出す予定？」
 *   2. User: 「17時くらいかな。ディナーは20時からの予定。」
 *      → Alter: 「移動手段は何にする？」
 *   3. User: 「車」
 *      → Before: messageBody="" (ブランク)  ← バグ
 *      → After: placeConfirm 質問 or plan_presented 遷移
 *
 * 根本原因:
 *   Block 1-(1) で sortMissingByPriority が placeConfirm:/placeAsk: を除外。
 *   missingFields が ["placeConfirm:..."] だけ残ると:
 *     - sortMissingByPriority → []
 *     - buildClarifyFromMissing → ""
 *     - _buildPlanConfirmMessage → "了解。...だね。\n" (clarify が空)
 *     - strip 正規表現で preamble 除去 → ""
 *     - messageBody = ""
 *
 * 修正:
 *   buildClarifyV2Response で sortable missings=0 かつ placeConfirm 残存時、
 *   buildPlaceConfirmQuestions で candidate 確認を出す。両方尽きていれば
 *   plan_presented に遷移する。
 */

import { describe, test, expect, beforeAll, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: null,
}));
vi.mock("@/lib/alter-morning/placesApiClient", () => ({
  searchPlacesByText: async () => [],
  isPlacesApiAvailable: () => false,
}));
vi.mock("@/lib/alter-morning/placeCacheStore", () => ({
  readFromSupabase: async () => null,
  writeToSupabase: async () => {},
}));
vi.mock("@/lib/alter-morning/routesApiClient", () => ({
  computeTravelTime: async () => null,
  isRoutesApiAvailable: () => false,
}));
vi.mock("@/lib/stargazer/perspectiveEngine", () => ({
  executeSearch: async () => [],
}));

let ensureV2Modules: typeof import("@/lib/alter-morning/morningProtocol").ensureV2Modules;
let buildClarifyV2Response: typeof import("@/lib/alter-morning/morningProtocol").buildClarifyV2Response;
let createSession: typeof import("@/lib/alter-morning/morningProtocol").createSession;

beforeAll(async () => {
  const { preloadVocabulary } = await import("@/lib/alter-morning/intentParser");
  await preloadVocabulary();

  const mp = await import("@/lib/alter-morning/morningProtocol");
  ensureV2Modules = mp.ensureV2Modules;
  buildClarifyV2Response = mp.buildClarifyV2Response;
  createSession = mp.createSession;

  const loaded = await ensureV2Modules();
  expect(loaded).toBe(true);
});

function makeBaseSegment() {
  return {
    id: "seg_1",
    order: 1,
    activity: "ディナー",
    activityCanonical: "ディナー",
    activityCategory: "dining" as const,
    estimatedDurationMin: 90,
    place: "サドヤ",
    placeCanonical: "サドヤ",
    placeType: "exact_proper_noun" as const,
    anchorScore: 4,
    startTime: "20:00",
    timeConstraint: { type: "fixed_start" as const, fixedTime: "20:00" },
    companions: ["高橋"],
    status: "tentative" as const,
  };
}

describe("Block 1 バグ修正: ブランク返答防止 (buildClarifyV2Response)", () => {
  test("placeConfirm のみ残存 + transport 解決 → message は空にならず placeConfirm 質問が出る", async () => {
    const session = createSession();
    session.phase = "clarifying";
    session.plan = {
      date: "2026-04-17",
      items: [],
      dayConditions: {},
      createdAt: new Date().toISOString(),
      confirmed: false,
    };
    session.pendingPlaceConfirmations = [
      {
        segmentId: "seg_1",
        originalText: "サドヤ",
        confidence: "medium",
        resolvedName: "サドヤ ワイナリー",
        candidates: [{ name: "サドヤ ワイナリー", address: "山梨県甲府市" }],
      },
    ];

    // transport 解決直後の state — placeConfirm のみ残存
    const updatedState: any = {
      targetDate: "2026-04-17",
      targetDateLabel: "今日",
      segments: [makeBaseSegment()],
      departureTime: "17:00",
      departureTimeConstraint: { type: "fixed_departure", fixedTime: "17:00" },
      transport: "car",
      missingFields: ["placeConfirm:seg_1:サドヤ"],
      goOut: true,
    };

    const result = await buildClarifyV2Response(
      updatedState,
      ["移動は車"],
      session,
      "車",
    );

    // messageBody はブランクになってはいけない
    expect(result.response.message).toBeDefined();
    expect(result.response.message.trim().length).toBeGreaterThan(0);
    // placeConfirm 質問が出ているはず
    expect(result.response.message).toMatch(/サドヤ|どう？/);
    expect(result.response.phase).toBe("clarifying");
  });

  test("missingFields 完全解消 → plan_presented に遷移する", async () => {
    const session = createSession();
    session.phase = "clarifying";
    session.plan = {
      date: "2026-04-17",
      items: [],
      dayConditions: {},
      createdAt: new Date().toISOString(),
      confirmed: false,
    };
    session.pendingPlaceConfirmations = undefined;

    const updatedState: any = {
      targetDate: "2026-04-17",
      targetDateLabel: "今日",
      segments: [
        { ...makeBaseSegment(), place: "スターバックス渋谷店", placeCanonical: "スターバックス渋谷店" },
      ],
      departureTime: "17:00",
      departureTimeConstraint: { type: "fixed_departure", fixedTime: "17:00" },
      transport: "car",
      missingFields: [],
      goOut: true,
    };

    const result = await buildClarifyV2Response(
      updatedState,
      ["移動は車"],
      session,
      "車",
    );

    expect(result.response.phase).toBe("plan_presented");
    expect(result.response.message.trim().length).toBeGreaterThan(0);
  });

  test("sortable missing (transport) 残存時は従来どおり優先質問が出る（レグレッション防止）", async () => {
    const session = createSession();
    session.phase = "clarifying";
    session.plan = {
      date: "2026-04-17",
      items: [],
      dayConditions: {},
      createdAt: new Date().toISOString(),
      confirmed: false,
    };

    const updatedState: any = {
      targetDate: "2026-04-17",
      targetDateLabel: "今日",
      segments: [makeBaseSegment()],
      departureTime: "17:00",
      departureTimeConstraint: { type: "fixed_departure", fixedTime: "17:00" },
      transport: undefined,
      missingFields: ["transport"],
      goOut: true,
    };

    const result = await buildClarifyV2Response(
      updatedState,
      ["20:00 に出発"],
      session,
      "20時から",
    );

    expect(result.response.phase).toBe("clarifying");
    expect(result.response.message).toMatch(/移動手段/);
  });
});
