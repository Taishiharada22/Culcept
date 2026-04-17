/**
 * Block 2-(c) UI side — near-anchor 0 件 dedicated clarify
 *
 * GPT 追加ルール 2026-04-17 UI side:
 *   候補 0 件時に generic な「場所を教えて」ではなく、
 *   「サドヤ近くでカフェは見つからなかった。範囲を広げる？ 別カテゴリで探す？」
 *   の dedicated clarify を出す。
 *   ユーザーの返答 3 パターン:
 *     - 「広げる」「範囲」 → radiusOverrideM を 2× にセット、次パスで再検索
 *     - 「別カテゴリ」「違うジャンル」 → searchCategory クリア、ユーザーに聞き直し
 *     - 「場所を変える」 → placeSearchHint 全クリア、通常 placeAsk に戻す
 */
import { describe, test, expect, beforeAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

let buildPlaceConfirmQuestions: typeof import("@/lib/alter-morning/morningProtocol").buildPlaceConfirmQuestions;
let tryDirectPlaceConfirmResponse: typeof import("@/lib/alter-morning/morningProtocol").tryDirectPlaceConfirmResponse;

beforeAll(async () => {
  const mp = await import("@/lib/alter-morning/morningProtocol");
  buildPlaceConfirmQuestions = mp.buildPlaceConfirmQuestions;
  tryDirectPlaceConfirmResponse = mp.tryDirectPlaceConfirmResponse;
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ヘルパ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeState(): import("@/lib/alter-morning/planState").PlanState {
  return {
    targetDate: "2026-04-17",
    segments: [
      {
        id: "seg_near",
        order: 1,
        activity: "カフェ",
        activityCanonical: "カフェ",
        activityCategory: "social_meal" as const,
        estimatedDurationMin: 60,
        anchorScore: 1,
        companions: [],
        status: "tentative" as const,
        placeSearchHint: {
          nearAnchorLabel: "サドヤ",
          searchCategory: "カフェ",
          originalQuery: "サドヤ近くのカフェないかな？",
        },
      },
    ],
    missingFields: ["placeAsk:seg_near:カフェ"],
    goOut: true,
  } as any;
}

function makePendingZero(): NonNullable<
  import("@/lib/alter-morning/types").MorningSession["pendingPlaceConfirmations"]
> {
  return [
    {
      segmentId: "seg_near",
      originalText: "サドヤ近くのカフェ",
      confidence: "low",
      candidates: [],
      nearAnchorContext: {
        anchorLabel: "サドヤ",
        searchCategory: "カフェ",
        radiusM: 1500,
      },
    },
  ];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildPlaceConfirmQuestions — dedicated clarify text
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildPlaceConfirmQuestions — near-anchor 0 件", () => {
  test("nearAnchorContext 付き & candidates 空 → 専用文面を返す", () => {
    const pending = makePendingZero();
    const text = buildPlaceConfirmQuestions(pending);

    expect(text).toContain("サドヤ近くでカフェは見つからなかった");
    expect(text).toContain("範囲を広げる");
    expect(text).toContain("別カテゴリで探す");
    expect(text).toContain("場所を変える");
    // generic な「どこにあるお店？」には落とさない
    expect(text).not.toContain("どこにあるお店");
  });

  test("nearAnchorContext 無し & candidates 空 → 従来通り generic 質問", () => {
    const pending = makePendingZero();
    delete pending[0].nearAnchorContext;
    pending[0].originalText = "サドヤ"; // 通常の低信頼パス
    const text = buildPlaceConfirmQuestions(pending);

    expect(text).toContain("どこにあるお店");
    expect(text).not.toContain("範囲を広げる");
  });

  test("medium confidence の他確認と併存しても壊れない", () => {
    const pending = makePendingZero();
    pending.unshift({
      segmentId: "seg_anchor",
      originalText: "サドヤ",
      resolvedName: "サドヤ ワイナリー",
      confidence: "medium",
      candidates: [{ name: "サドヤ ワイナリー" }],
    });
    const text = buildPlaceConfirmQuestions(pending);

    expect(text).toContain("サドヤ ワイナリー");
    expect(text).toContain("範囲を広げる");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// tryDirectPlaceConfirmResponse — 3 ボタン応答ハンドリング
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("tryDirectPlaceConfirmResponse — near-anchor 0 件応答", () => {
  test("「広げる」→ radiusOverrideM が 2× (3000m) にセット、hint は維持", () => {
    const state = makeState();
    const pending = makePendingZero();
    const r = tryDirectPlaceConfirmResponse("広げる", state, pending);

    expect(r).not.toBeNull();
    expect(r!.resolvedConfirmations).toContain("seg_near");
    const seg = r!.updatedState.segments.find(s => s.id === "seg_near")!;
    expect(seg.placeSearchHint?.radiusOverrideM).toBe(3000);
    expect(seg.placeSearchHint?.searchCategory).toBe("カフェ");
    expect(seg.placeSearchHint?.nearAnchorLabel).toBe("サドヤ");
    expect(seg.resolvedPlaceName).toBeUndefined(); // まだ候補待ち
  });

  test("「もっと広く」も広げる扱い", () => {
    const state = makeState();
    const r = tryDirectPlaceConfirmResponse("もっと広く", state, makePendingZero());
    expect(r).not.toBeNull();
    const seg = r!.updatedState.segments.find(s => s.id === "seg_near")!;
    expect(seg.placeSearchHint?.radiusOverrideM).toBe(3000);
  });

  test("「広げる」を 2 回で 5km 上限クランプ", () => {
    const state = makeState();
    // 1 回目: 1500 → 3000
    const r1 = tryDirectPlaceConfirmResponse("広げる", state, makePendingZero());
    // 2 回目: 3000 → 6000 → クランプで 5000
    const pending2 = makePendingZero();
    pending2[0].nearAnchorContext!.radiusM = 3000;
    const r2 = tryDirectPlaceConfirmResponse("広げる", r1!.updatedState, pending2);
    const seg = r2!.updatedState.segments.find(s => s.id === "seg_near")!;
    expect(seg.placeSearchHint?.radiusOverrideM).toBe(5000);
  });

  test("「別カテゴリで探す」→ searchCategory クリア + placeCategoryAsk 追加", () => {
    const state = makeState();
    const r = tryDirectPlaceConfirmResponse("別カテゴリで探す", state, makePendingZero());
    expect(r).not.toBeNull();
    const seg = r!.updatedState.segments.find(s => s.id === "seg_near")!;
    expect(seg.placeSearchHint?.searchCategory).toBeUndefined();
    expect(seg.placeSearchHint?.nearAnchorLabel).toBe("サドヤ"); // anchor は維持
    expect(r!.updatedState.missingFields).toContain("placeCategoryAsk:seg_near:サドヤ");
  });

  test("「違うジャンル」も別カテゴリ扱い", () => {
    const state = makeState();
    const r = tryDirectPlaceConfirmResponse("違うジャンル", state, makePendingZero());
    expect(r).not.toBeNull();
    const seg = r!.updatedState.segments.find(s => s.id === "seg_near")!;
    expect(seg.placeSearchHint?.searchCategory).toBeUndefined();
  });

  test("「場所を変える」→ placeSearchHint 全クリア + segmentPlace missingField", () => {
    const state = makeState();
    const r = tryDirectPlaceConfirmResponse("場所を変える", state, makePendingZero());
    expect(r).not.toBeNull();
    const seg = r!.updatedState.segments.find(s => s.id === "seg_near")!;
    expect(seg.placeSearchHint).toBeUndefined();
    expect(
      r!.updatedState.missingFields.some(f => f.startsWith("segmentPlace:seg_near:")),
    ).toBe(true);
  });

  test("不明な返答（「うーん」）→ null（LLM delta に委ねる）", () => {
    const state = makeState();
    const r = tryDirectPlaceConfirmResponse("うーん", state, makePendingZero());
    // descriptions が空なら null を返す仕様
    expect(r).toBeNull();
  });

  test("「広げる」後は missingFields の placeAsk が除去される", () => {
    const state = makeState();
    const r = tryDirectPlaceConfirmResponse("広げる", state, makePendingZero());
    expect(r).not.toBeNull();
    expect(
      r!.updatedState.missingFields.some(f => f.startsWith("placeAsk:seg_near")),
    ).toBe(false);
  });
});
