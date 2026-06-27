/**
 * P17 — CoAlter Proposal Temperature Labels（守り/中間/攻め chip）
 *
 * 検証（CEO 2026-06-28 P17-COALTER-PROPOSAL-TIER-LABELS）:
 *   - 3案 render 時に ["守り","中間","攻め"] chip が DOM に出る（両 surface = solid + floating）
 *   - chip は display-only（onClick/click handler を持たない・aria-label のみ）
 *   - session.candidates の順序が変わらない（index 順そのまま）
 *   - candidate.recommended と共存する（おすすめバッジを上書きしない）
 *   - chip が `getProposalTemperatureLabel` の境界（total=1/2/3/4+）に従う:
 *       total=3 → ["守り","中間","攻め"] / total=2 → ["守り","攻め"] / total<=1 or >3 → なし
 *
 * 非対象（CEO 制約）:
 *   - ranking / personalization / DB write / action behavior に影響しない（candidate ranking 不変）
 *   - REALITY_OS_SURFACE_PROD / Reality / LifeOps / CoAlter live は触らない
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { PlanIntelligencePanel } from "@/app/(culcept)/plan/tabs/coalter/PlanIntelligencePanel";
import {
  COALTER_PLAN_SESSION_FIXTURES,
  type CoAlterPlanSessionFixture,
  type PlanCandidateFixture,
} from "@/app/(culcept)/plan/tabs/coalter/coalterPlanSessionFixture";

const DAILY = COALTER_PLAN_SESSION_FIXTURES.daily;

function renderPanel(
  session: CoAlterPlanSessionFixture,
  surface: "solid" | "floating",
): string {
  return renderToStaticMarkup(
    createElement(PlanIntelligencePanel, {
      session,
      selectedCandidateId: session.candidates[0].id,
      onSelectCandidate: () => {},
      appliedAdjustmentIds: new Set<string>(),
      onToggleAdjustment: () => {},
      confirmedCandidateId: null,
      onCollapse: () => {},
      onExpand: () => {},
      surface,
      showHeader: false,
    }),
  );
}

/** session.candidates を head N 件に絞った同型の session を作る（読み取りのみ・元 fixture mutate しない）。 */
function sliceSession(
  session: CoAlterPlanSessionFixture,
  n: number,
): CoAlterPlanSessionFixture {
  return {
    ...session,
    candidates: session.candidates.slice(0, n) as readonly PlanCandidateFixture[],
  };
}

describe("P17 — proposal temperature chip（display-only・index-based）", () => {
  it("DAILY 3案 solid surface: 守り/中間/攻め の3 chip が全て DOM に出る", () => {
    const html = renderPanel(DAILY, "solid");
    expect(html).toContain("守り");
    expect(html).toContain("中間");
    expect(html).toContain("攻め");
  });

  it("DAILY 3案 floating surface: 守り/中間/攻め の3 chip が全て DOM に出る", () => {
    const html = renderPanel(DAILY, "floating");
    expect(html).toContain("守り");
    expect(html).toContain("中間");
    expect(html).toContain("攻め");
  });

  it("chip は aria-label を持ち、click handler/state を持たない（display-only）", () => {
    const html = renderPanel(DAILY, "solid");
    expect(html).toContain('aria-label="案の温度: 守り"');
    expect(html).toContain('aria-label="案の温度: 中間"');
    expect(html).toContain('aria-label="案の温度: 攻め"');
    // chip span 自体に onClick/onPointer 等の handler が DOM 属性として現れない
    //   （renderToStaticMarkup は handler を出力しないため間接保証だが念のため文字列で確認）
    expect(html).not.toMatch(/aria-label="案の温度:[^"]+"[^>]*onclick/i);
  });

  it("session.candidates の順序が変わらない（index 順そのまま）", () => {
    const html = renderPanel(DAILY, "solid");
    const ids = DAILY.candidates.map((c) => c.id);
    const positions = ids.map((id) => html.indexOf(`>${id}<`) >= 0 ? html.indexOf(id) : html.indexOf(id));
    // 厳密 id テキストではなく title の出現順で順序を担保（より頑健）
    const titles = DAILY.candidates.map((c) => c.title);
    const titlePositions = titles.map((t) => html.indexOf(t));
    // すべて見つかる
    for (const pos of titlePositions) expect(pos).toBeGreaterThanOrEqual(0);
    // 単調増加（順序保持）
    for (let i = 1; i < titlePositions.length; i++) {
      expect(titlePositions[i]).toBeGreaterThan(titlePositions[i - 1]);
    }
    // unused ids 変数を抑止
    void positions;
  });

  it("おすすめバッジと共存する（recommended の隣に温度 chip が並ぶ）", () => {
    const html = renderPanel(DAILY, "solid");
    expect(html).toContain("おすすめ"); // recommended badge は不変
    // 温度 chip と おすすめ badge が同じ DOM に共存している
    expect(html).toContain("守り");
    expect(html).toContain("おすすめ");
  });

  it("2 案分布: 先頭=守り・末尾=攻め（中間 chip は出さない）", () => {
    const session = sliceSession(DAILY, 2);
    const html = renderPanel(session, "solid");
    expect(html).toContain("守り");
    expect(html).toContain("攻め");
    expect(html).not.toContain('aria-label="案の温度: 中間"'); // 中間 chip は出ない
  });

  it("1 案分布: 温度 chip は一切出ない（温度差が無い）", () => {
    const session = sliceSession(DAILY, 1);
    const html = renderPanel(session, "solid");
    expect(html).not.toContain('aria-label="案の温度: 守り"');
    expect(html).not.toContain('aria-label="案の温度: 中間"');
    expect(html).not.toContain('aria-label="案の温度: 攻め"');
  });

  it("4 案以上（将来の拡張）: 3 段モデル破綻のため chip 非表示（fail-safe）", () => {
    const extra: PlanCandidateFixture = { ...DAILY.candidates[0], id: "synthetic-extra-4" };
    const session: CoAlterPlanSessionFixture = {
      ...DAILY,
      candidates: [...DAILY.candidates, extra],
    };
    const html = renderPanel(session, "solid");
    expect(html).not.toContain('aria-label="案の温度: 守り"');
    expect(html).not.toContain('aria-label="案の温度: 中間"');
    expect(html).not.toContain('aria-label="案の温度: 攻め"');
  });
});
