/**
 * CoAlterPlanOverlay + PlanIntelligencePanel(floating) — render test
 *
 * 検証（CEO 2026-06-21 Talk overlay 化）:
 *   - overlay は title「プランインテリジェンス」+ 閉じる + ドラッグ/リサイズ注記 + 子を描画
 *   - PlanIntelligencePanel surface="floating" は **地を透過**（bg-white パネルにしない）し中身を描画
 *   - showHeader=false でパネル内ヘッダ（タイトル）を二重に出さない
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { CoAlterPlanOverlay } from "@/app/(culcept)/plan/tabs/coalter/CoAlterPlanOverlay";
import { PlanIntelligencePanel } from "@/app/(culcept)/plan/tabs/coalter/PlanIntelligencePanel";
import { COALTER_PLAN_SESSION_FIXTURES } from "@/app/(culcept)/plan/tabs/coalter/coalterPlanSessionFixture";

const SESSION = COALTER_PLAN_SESSION_FIXTURES.daily;

function renderFloatingPanel(showHeader: boolean): string {
  return renderToStaticMarkup(
    createElement(PlanIntelligencePanel, {
      session: SESSION,
      selectedCandidateId: SESSION.candidates[0].id,
      onSelectCandidate: () => {},
      appliedAdjustmentIds: new Set<string>(),
      onToggleAdjustment: () => {},
      confirmedCandidateId: null,
      onCollapse: () => {},
      onExpand: () => {},
      surface: "floating" as const,
      showHeader,
    }),
  );
}

describe("CoAlterPlanOverlay (Talk floating plan)", () => {
  it("overlay は title・閉じる・ドラッグ/リサイズ注記・子を描画する", () => {
    const html = renderToStaticMarkup(
      createElement(
        CoAlterPlanOverlay,
        { onClose: () => {} },
        createElement("div", null, "プラン中身ダミー"),
      ),
    );
    expect(html).toContain("プランインテリジェンス");
    expect(html).toContain("ドラッグして移動・リサイズできます");
    expect(html).toContain("プランを閉じる"); // close aria-label
    expect(html).toContain("プラン中身ダミー");
    // フロスト面（背景透過）であること
    expect(html).toContain("backdrop-blur");
  });

  it("PlanIntelligencePanel surface=floating は地を透過し中身を描く（白パネルにしない）", () => {
    const html = renderFloatingPanel(false);
    // 透明地（bg-transparent）で frost は overlay 側
    expect(html).toContain("bg-transparent");
    // 候補プランなど中身は描画される
    expect(html).toContain("共有コンディション");
    expect(html).toContain("候補プラン");
  });

  it("showHeader=false でパネル内タイトルを出さない（overlay 側に一本化）", () => {
    const withHeader = renderFloatingPanel(true);
    const withoutHeader = renderFloatingPanel(false);
    // showHeader=true のときだけパネル内ヘッダ領域が hidden 解除（@min-[120px]:flex）になる
    expect(withHeader.includes("@min-[120px]:flex")).toBe(true);
    expect(withoutHeader.includes("@min-[120px]:flex")).toBe(false);
  });
});
