/**
 * Phase E-1 smoke — LocationNotesScreen × repository（SSR render contract）
 *
 * repository 化後も SSR で crash せず、初期（effect 未実行＝空メタ）でヘッダ/都道府県が描画される。
 * （個人データ復元・都道府県別コンテンツ取得は client effect ＝ SSR では走らない。本番でも
 *   LocationNotes は travel overlay をユーザーが開いた時に client mount される。）
 *
 * renderToStaticMarkup 規約（jsdom 不使用）。
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("server-only", () => ({}));

import LocationNotesScreen from "@/app/(culcept)/calendar/_components/travel/locationNotes/LocationNotesScreen";
import { TravelItineraryProvider } from "@/app/(culcept)/calendar/_components/travel/state/ItineraryContext";

describe("LocationNotesScreen repository wiring（SSR）", () => {
  const html = renderToStaticMarkup(
    createElement(
      TravelItineraryProvider,
      null,
      createElement(LocationNotesScreen, { onClose: () => {}, onToast: () => {} })
    )
  );

  it("crash せず Location Notes ヘッダを描画", () => {
    expect(html).toContain("Location Notes");
  });

  it("初期（空メタ）でも都道府県候補（京都府）が出る", () => {
    expect(html).toContain("京都府");
  });
});
