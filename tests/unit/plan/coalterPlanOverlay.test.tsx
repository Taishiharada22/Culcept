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
  it("overlay は容器を完全透過にし、title・閉じる・子を描画する（CEO 2026-06-21: 透過率100%）", () => {
    const html = renderToStaticMarkup(
      createElement(CoAlterPlanOverlay, {
        onClose: () => {},
        children: createElement("div", null, "プラン中身ダミー"),
      }),
    );
    expect(html).toContain("プランインテリジェンス");
    expect(html).toContain("プランを閉じる"); // close aria-label
    expect(html).toContain("プラン中身ダミー");
    // 容器は **完全透過**（白いフロスト面を持たない）。各枠が直接チャットに浮かぶ。
    expect(html).toContain("bg-transparent");
    // 旧フロスト/注記は撤去済み（CEO 指示）。
    expect(html.includes("backdrop-blur")).toBe(false);
    expect(html.includes("ドラッグして移動・リサイズできます")).toBe(false);
  });

  it("PlanIntelligencePanel surface=floating は地を透過し compact 構図を描く（白パネルにしない）", () => {
    const html = renderFloatingPanel(false);
    // 透明地（bg-transparent）で frost は overlay 側
    expect(html).toContain("bg-transparent");
    // talk.png 準拠の compact 構図: 横3列 stat（着予定）/ 共有コンディション / 候補プラン横スクロール
    expect(html).toContain("着予定");
    expect(html).toContain("共有コンディション");
    expect(html).toContain("候補プラン");
    expect(html).toContain("すべてのプランを見る");
  });

  it("floating（compact）は solid 専用の『おすすめの調整』セクションを描かない（overlay 用の軽量構図）", () => {
    const floatingHtml = renderFloatingPanel(false);
    // 「おすすめの調整」は solid レイアウト専用。overlay の compact では出さない。
    expect(floatingHtml.includes("おすすめの調整")).toBe(false);
    // パネル内に旧 @container ヘッダ機構（@min-[120px]:flex）も持たない（ヘッダは overlay 側に一本化）。
    expect(floatingHtml.includes("@min-[120px]:flex")).toBe(false);
  });
});
