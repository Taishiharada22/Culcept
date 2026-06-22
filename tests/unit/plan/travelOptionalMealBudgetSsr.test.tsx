/**
 * Phase E-2 — meal/budget optional（honest empty state）の SSR 検証
 *
 * DB 経路（SupabaseTravelRepository）では meal/budget を提供しない（推薦エンジン / 予算+支出明細は別フェーズ）。
 * その際 consumer が **捏造せず空状態**を出すことを SSR で担保。fixture（meal/budget あり）の通常表示も確認。
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("server-only", () => ({}));

import MealSuggestionScreen from "@/app/(culcept)/calendar/_components/travel/MealSuggestionScreen";
import BudgetSnapshotScreen from "@/app/(culcept)/calendar/_components/travel/BudgetSnapshotScreen";
import { SAMPLE_KYOTO_TRIP } from "@/app/(culcept)/calendar/_lib/travel/sampleTrip";
import type { TripDay } from "@/app/(culcept)/calendar/_lib/travel/types";

const TRIP = SAMPLE_KYOTO_TRIP;
const FULL_DAY = TRIP.days[0];
const noop = () => {};
const screenProps = (day: TripDay) => ({
  trip: TRIP,
  day,
  onNavigate: noop,
  onClose: noop,
  onOpenMap: noop,
  onToast: noop,
});

describe("MealSuggestionScreen — meal optional", () => {
  it("meal 未提供（DB 経路）: 捏造せず空状態", () => {
    const day: TripDay = { ...FULL_DAY, meal: undefined };
    const html = renderToStaticMarkup(createElement(MealSuggestionScreen, screenProps(day)));
    expect(html).toContain("この日の食のおすすめはまだありません");
    expect(html).not.toContain("京料理 たん熊 北店"); // fixture の pick 名は出ない
  });

  it("fixture（meal あり）: 通常どおり pick を表示", () => {
    const html = renderToStaticMarkup(createElement(MealSuggestionScreen, screenProps(FULL_DAY)));
    expect(html).toContain("京料理 たん熊 北店");
    expect(html).not.toContain("この日の食のおすすめはまだありません");
  });
});

describe("BudgetSnapshotScreen — budget optional", () => {
  it("budget 未提供（DB 経路）: 捏造せず空状態", () => {
    const day: TripDay = { ...FULL_DAY, budget: undefined };
    const html = renderToStaticMarkup(createElement(BudgetSnapshotScreen, screenProps(day)));
    expect(html).toContain("予算データはまだ登録されていません");
  });

  it("fixture（budget あり）: 通常どおり金額を表示", () => {
    const html = renderToStaticMarkup(createElement(BudgetSnapshotScreen, screenProps(FULL_DAY)));
    expect(html).not.toContain("予算データはまだ登録されていません");
    expect(html).toContain("¥"); // 金額表記
  });
});
