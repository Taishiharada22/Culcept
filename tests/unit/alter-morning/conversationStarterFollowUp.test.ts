/**
 * W3-PR-10 positive-path nudge — conversationStarter follow-up helpers のユニットテスト
 *
 * 対象:
 *   - buildNextPlaceAskText()            固定テンプレ v1
 *   - countConfirmedPlacesInEvents()     coordinates 判定（buildTransportSegments と同軸）
 *   - justConfirmedFirstPlace()          prev=0 && next=1 の差分判定
 *   - hasMultiplePlaces()                count >= 2
 *   - userSignaledEnd()                  終了意思の regex 検出
 *   - shouldAskNextPlace()               narrow trigger（A && !B && !C）
 *
 * CEO 承認範囲:
 *   - 1 件目確定直後の nudge に限定。2 件目以降の発火は厳禁（regression guard）
 *   - 終了意思を示したユーザーには nudge しない
 *   - coordinates 未解決 place は「解決済み」とカウントしない
 */

import { describe, test, expect } from "vitest";

import {
  buildNextPlaceAskText,
  countConfirmedPlacesInEvents,
  justConfirmedFirstPlace,
  hasMultiplePlaces,
  userSignaledEnd,
  shouldAskNextPlace,
  type EventWithCoordinates,
  type CapturedHistoryLike,
} from "@/lib/alter-morning/conversationStarter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixture helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function evResolved(lat = 35.68, lng = 139.76): EventWithCoordinates {
  return { where: { coordinates: { lat, lng } } };
}

function evUnresolved(): EventWithCoordinates {
  return { where: { coordinates: null } };
}

function evNoCoordField(): EventWithCoordinates {
  return { where: {} };
}

function evNoWhere(): EventWithCoordinates {
  return {};
}

function history(...spans: string[]): CapturedHistoryLike[] {
  return spans.map((rawSpan) => ({ capture: { rawSpan } }));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildNextPlaceAskText
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildNextPlaceAskText", () => {
  test("returns the fixed v1 template verbatim", () => {
    expect(buildNextPlaceAskText()).toBe("このあと、どこか寄る？");
  });

  test("is deterministic across repeated calls", () => {
    expect(buildNextPlaceAskText()).toBe(buildNextPlaceAskText());
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// countConfirmedPlacesInEvents
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("countConfirmedPlacesInEvents", () => {
  test("empty array yields 0", () => {
    expect(countConfirmedPlacesInEvents([])).toBe(0);
  });

  test("counts only events with finite lat/lng coordinates", () => {
    const events = [
      evResolved(35.68, 139.76),
      evResolved(34.71, 135.5),
      evUnresolved(),
      evNoCoordField(),
      evNoWhere(),
    ];
    expect(countConfirmedPlacesInEvents(events)).toBe(2);
  });

  test("treats NaN / Infinity lat or lng as unresolved", () => {
    const events: EventWithCoordinates[] = [
      { where: { coordinates: { lat: Number.NaN, lng: 139.76 } } },
      { where: { coordinates: { lat: 35.68, lng: Number.POSITIVE_INFINITY } } },
      { where: { coordinates: { lat: Number.NEGATIVE_INFINITY, lng: 139.76 } } },
      evResolved(),
    ];
    expect(countConfirmedPlacesInEvents(events)).toBe(1);
  });

  test("treats non-number lat or lng as unresolved", () => {
    const events = [
      { where: { coordinates: { lat: "35.68" as unknown as number, lng: 139.76 } } },
      { where: { coordinates: { lat: 35.68, lng: null as unknown as number } } },
    ];
    expect(countConfirmedPlacesInEvents(events)).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// justConfirmedFirstPlace
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("justConfirmedFirstPlace", () => {
  test("true when prev=0 resolved and next=1 resolved", () => {
    expect(justConfirmedFirstPlace([], [evResolved()])).toBe(true);
  });

  test("true even when prev contains unresolved events", () => {
    expect(
      justConfirmedFirstPlace([evUnresolved(), evNoWhere()], [evResolved()]),
    ).toBe(true);
  });

  test("false when next has 2 resolved places (already past single-place window)", () => {
    expect(justConfirmedFirstPlace([], [evResolved(), evResolved()])).toBe(false);
  });

  test("false when prev already had 1 resolved place (not a 0->1 edge)", () => {
    expect(justConfirmedFirstPlace([evResolved()], [evResolved()])).toBe(false);
  });

  test("false when next is empty (no place confirmed this turn)", () => {
    expect(justConfirmedFirstPlace([], [])).toBe(false);
  });

  test("false when prev=1 and next=2 (second place confirm, not first)", () => {
    expect(justConfirmedFirstPlace([evResolved()], [evResolved(), evResolved()])).toBe(
      false,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// hasMultiplePlaces
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("hasMultiplePlaces", () => {
  test("false on empty events", () => {
    expect(hasMultiplePlaces([])).toBe(false);
  });

  test("false on 1 resolved place", () => {
    expect(hasMultiplePlaces([evResolved()])).toBe(false);
  });

  test("true on 2 resolved places", () => {
    expect(hasMultiplePlaces([evResolved(), evResolved()])).toBe(true);
  });

  test("true on 3+ resolved places", () => {
    expect(
      hasMultiplePlaces([evResolved(), evResolved(), evResolved()]),
    ).toBe(true);
  });

  test("unresolved events do not count", () => {
    expect(
      hasMultiplePlaces([evResolved(), evUnresolved(), evNoWhere()]),
    ).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// userSignaledEnd
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("userSignaledEnd", () => {
  test("false on empty history", () => {
    expect(userSignaledEnd([])).toBe(false);
  });

  test("false on unrelated chatter", () => {
    expect(
      userSignaledEnd(history("お腹すいた", "カフェ行きたい", "スタバあるかな")),
    ).toBe(false);
  });

  test.each([
    "これだけでいい",
    "それだけ",
    "以上です",
    "以上かな",
    "これで大丈夫",
    "これで終わり",
    "これで十分",
    "終わりです",
    "直接帰る",
    "まっすぐ帰る",
    "家に帰る",
    "自宅に戻る",
    "うちに帰る",
    "もう寝る",
    "今日は休む",
  ])("detects end signal: %s", (span) => {
    expect(userSignaledEnd(history(span))).toBe(true);
  });

  test("does NOT misfire on '以上' inside a larger phrase tail (e.g. '3万円以上予算')", () => {
    // '以上' 単独ではなく後に予算が続く場合、末尾 gate でマッチしないことを確認
    expect(userSignaledEnd(history("3万円以上予算"))).toBe(false);
  });

  test("detects signal only within the lookback window (default 3 turns)", () => {
    // 4 turn 前の終了シグナルは拾わない
    const h = history("もう寝る", "でも気が変わった", "やっぱり行く", "ランチ", "カフェ");
    expect(userSignaledEnd(h, 3)).toBe(false);
  });

  test("respects custom lookbackTurns", () => {
    // 4 turn 前でも lookback=5 なら拾う
    const h = history("もう寝る", "でも気が変わった", "やっぱり行く", "ランチ", "カフェ");
    expect(userSignaledEnd(h, 5)).toBe(true);
  });

  test("lookbackTurns <= 0 returns false safely", () => {
    expect(userSignaledEnd(history("もう寝る"), 0)).toBe(false);
    expect(userSignaledEnd(history("もう寝る"), -1)).toBe(false);
  });

  test("handles empty / non-string rawSpan without throwing", () => {
    const h: CapturedHistoryLike[] = [
      { capture: { rawSpan: "" } },
      { capture: { rawSpan: null as unknown as string } },
      { capture: { rawSpan: "これだけ" } },
    ];
    expect(userSignaledEnd(h)).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// shouldAskNextPlace — narrow trigger integration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("shouldAskNextPlace", () => {
  test("fires on the canonical happy path (A && !B && !C)", () => {
    expect(
      shouldAskNextPlace({
        prevEvents: [],
        nextEvents: [evResolved()],
        capturedHistory: history("じゃあそこで"),
      }),
    ).toBe(true);
  });

  test("suppressed when user signaled end in recent history", () => {
    expect(
      shouldAskNextPlace({
        prevEvents: [],
        nextEvents: [evResolved()],
        capturedHistory: history("これだけでいい"),
      }),
    ).toBe(false);
  });

  test("suppressed when next already has multiple places", () => {
    // justConfirmedFirstPlace が false になるため false（defense in depth）
    expect(
      shouldAskNextPlace({
        prevEvents: [evResolved()],
        nextEvents: [evResolved(), evResolved()],
        capturedHistory: [],
      }),
    ).toBe(false);
  });

  test("suppressed when prev already had a resolved place (2nd confirm, not 1st)", () => {
    expect(
      shouldAskNextPlace({
        prevEvents: [evResolved()],
        nextEvents: [evResolved()],
        capturedHistory: [],
      }),
    ).toBe(false);
  });

  test("suppressed when no place was confirmed this turn", () => {
    expect(
      shouldAskNextPlace({
        prevEvents: [],
        nextEvents: [],
        capturedHistory: [],
      }),
    ).toBe(false);
  });

  test("suppressed when next has 0 resolved places (unresolved coords only)", () => {
    expect(
      shouldAskNextPlace({
        prevEvents: [],
        nextEvents: [evUnresolved(), evNoWhere()],
        capturedHistory: [],
      }),
    ).toBe(false);
  });

  test("fires even with long unrelated history (end signal absent)", () => {
    expect(
      shouldAskNextPlace({
        prevEvents: [],
        nextEvents: [evResolved()],
        capturedHistory: history(
          "今日の気分は？",
          "ランチどこ",
          "天気どう",
          "その辺カフェ",
        ),
      }),
    ).toBe(true);
  });
});
