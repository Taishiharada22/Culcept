/**
 * derivePropertyHints — activity × placeCategory × traits の導出ロジック
 *
 * CEO方針 2026-04-17:
 *   プラン表示の場所タップ bottom sheet に「この場所の性質情報」を出す。
 *   - 仕事: コンセント / Wi-Fi / 静かさ / 長時間滞在
 *   - ミーティング: 静かさ / 個室 / Wi-Fi
 *   - ランチ: 雰囲気 / 予算 / 予約
 *   リコメンドの有無に限らず必要。
 */
import { describe, test, expect } from "vitest";
import { derivePropertyHints } from "@/lib/alter-morning/propertyHints";

describe("derivePropertyHints", () => {
  test("仕事 × coworking → outlets/wifi/quietness/longStayOk がすべて yes", () => {
    const hints = derivePropertyHints({
      activityCategory: "work",
      placeCategory: "coworking",
    });
    expect(hints).toBeDefined();
    expect(hints!.outlets).toBe("yes");
    expect(hints!.wifi).toBe("yes");
    expect(hints!.quietness).toBe("yes");
    expect(hints!.longStayOk).toBe("yes");
  });

  test("仕事 × cafe + workFriendly traits → outlets/wifi が yes", () => {
    const hints = derivePropertyHints({
      activityCategory: "work",
      placeCategory: "cafe",
      traits: { workFriendly: true, indoor: true, longStayOk: true, noisy: false },
    });
    expect(hints).toBeDefined();
    expect(hints!.outlets).toBe("yes");
    expect(hints!.wifi).toBe("yes");
    expect(hints!.quietness).toBe("yes"); // noisy: false → quietness yes
    expect(hints!.longStayOk).toBe("yes");
  });

  test("ミーティング → quietness/private/wifi を要求し、atmosphere は含まれない", () => {
    const hints = derivePropertyHints({
      activityCategory: "meeting",
      placeCategory: "coworking",
    });
    expect(hints).toBeDefined();
    expect(hints!.quietness).toBe("yes");
    expect(hints!.wifi).toBe("yes");
    // atmosphere は meeting の required slot ではない
    expect(hints!.atmosphere).toBeUndefined();
    expect(hints!.budget).toBeUndefined();
  });

  test("ランチ × restaurant → atmosphere/budget が埋まる", () => {
    const hints = derivePropertyHints({
      activityCategory: "lunch",
      placeCategory: "restaurant",
    });
    expect(hints).toBeDefined();
    expect(hints!.atmosphere).toBeDefined();
    // restaurant の default atmosphere "店舗による" が入る
    expect(typeof hints!.atmosphere).toBe("string");
    // lunch は outlets/wifi/quietness を要求しない
    expect(hints!.outlets).toBeUndefined();
    expect(hints!.wifi).toBeUndefined();
  });

  test("ランチ × fast_food → budget が default で埋まる", () => {
    const hints = derivePropertyHints({
      activityCategory: "lunch",
      placeCategory: "fast_food",
    });
    expect(hints).toBeDefined();
    expect(hints!.budget).toBeDefined();
    expect(hints!.atmosphere).toBeDefined();
  });

  test("override は traits / defaults を上書きする", () => {
    const hints = derivePropertyHints({
      activityCategory: "work",
      placeCategory: "cafe",
      traits: { workFriendly: true },
      override: { outlets: "no", wifi: "yes" },
    });
    expect(hints!.outlets).toBe("no"); // override wins
    expect(hints!.wifi).toBe("yes");
  });

  test("activity / placeCategory / traits すべて空 → undefined", () => {
    const hints = derivePropertyHints({});
    // _default は indoor を要求するが、何も埋まらなければ undefined
    expect(hints).toBeUndefined();
  });

  test("勉強 × library → outlets/wifi/quietness/longStayOk すべて yes", () => {
    const hints = derivePropertyHints({
      activityCategory: "study",
      placeCategory: "library",
    });
    expect(hints).toBeDefined();
    expect(hints!.outlets).toBe("yes");
    expect(hints!.wifi).toBe("yes");
    expect(hints!.quietness).toBe("yes");
    expect(hints!.longStayOk).toBe("yes");
  });

  test("ディナー × restaurant → atmosphere/budget/reservationRecommended/private", () => {
    const hints = derivePropertyHints({
      activityCategory: "dinner",
      placeCategory: "restaurant",
    });
    expect(hints).toBeDefined();
    expect(hints!.atmosphere).toBeDefined();
    // dinner は private を要求するが restaurant のデフォルトにはない → undefined でも OK
  });

  test("traits.noisy=true → quietness=no", () => {
    const hints = derivePropertyHints({
      activityCategory: "meeting",
      placeCategory: "fast_food",
      traits: { noisy: true },
    });
    expect(hints!.quietness).toBe("no");
  });
});
