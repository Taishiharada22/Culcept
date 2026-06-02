/**
 * ComposeFormPanel render contract（P4・理想画像順序 ①なに ②どこ ③誰と）
 *
 * 不変原則: renderToStaticMarkup のみ。時間・動かせなさは本パネルから撤去
 * （⑤ ComposeTimeField / 日付横トグルへ移動）。
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ComposeFormPanel } from "@/app/(culcept)/plan/components/compose/ComposeFormPanel";
import type { ComposeDraftCore } from "@/lib/plan/compose/composeDraft";
import type { LocationHistory } from "@/lib/plan/compose/locationHistory";

const CORE: ComposeDraftCore = {
  title: "クライアントミーティング",
  locationText: "渋谷オフィス",
  rigidity: "soft",
  companions: ["田中さん", "山本さん"],
};

function render(core: ComposeDraftCore = CORE): string {
  return renderToStaticMarkup(<ComposeFormPanel core={core} />);
}

describe("理想画像順序 ①なに ②どこ ③誰と", () => {
  it("3フィールドが存在し、旧 time-mode は無い", () => {
    const html = render();
    expect(html).toContain('data-testid="compose-form-panel"');
    expect(html).toContain('data-testid="compose-field-title"');
    expect(html).toContain('data-testid="compose-field-location"');
    expect(html).toContain('data-testid="compose-field-companions"');
    expect(html).toContain("なにをする？");
    expect(html).toContain("どこで？");
    expect(html).toContain("誰と？");
    expect(html).not.toContain('data-testid="compose-field-time-mode"');
  });

  it("controlled な入力値が反映（companions は join 表示）", () => {
    const html = render();
    expect(html).toContain('value="クライアントミーティング"');
    expect(html).toContain('value="渋谷オフィス"');
    expect(html).toContain('value="田中さん、山本さん"');
  });
});

describe("SVG アイコン（理想画像）", () => {
  it("① 右端に内容別アイコン（meeting）", () => {
    expect(render()).toContain('data-testid="compose-icon-activity-meeting"');
  });

  it("内容で活動アイコンが変わる（ランチ → food）", () => {
    expect(render({ ...CORE, title: "ランチ" })).toContain(
      'data-testid="compose-icon-activity-food"',
    );
  });

  it("② 左に location / ③ 左に people / ③ 右に ＋", () => {
    const html = render();
    expect(html).toContain('data-testid="compose-icon-location"');
    expect(html).toContain('data-testid="compose-icon-people"');
    expect(html).toContain('data-testid="compose-companions-add"');
  });
});

describe("場所候補（実 PlaceCandidatesPanel 接続・当初仕様）", () => {
  it("なに＋どこ 入力時に候補パネルが出る", () => {
    expect(render()).toContain('data-testid="plan-place-candidates-panel"');
  });

  it("なに・どこ が両方空なら候補パネルは出ない", () => {
    const html = render({
      title: "",
      locationText: "",
      rigidity: "",
      companions: [],
    });
    expect(html).not.toContain('data-testid="plan-place-candidates-panel"');
  });
});

describe("④ Phase 1a 場所履歴チップ", () => {
  const HISTORY: LocationHistory = {
    frequent: [{ text: "渋谷オフィス", count: 5, usedAtISO: "2026-03-01" }],
    recent: [{ text: "新宿カフェ", count: 1, usedAtISO: "2026-03-10" }],
  };
  const emptyLoc: ComposeDraftCore = {
    title: "会議",
    locationText: "",
    rigidity: "",
    companions: [],
  };
  const withHistory = (core: ComposeDraftCore, h?: LocationHistory) =>
    renderToStaticMarkup(<ComposeFormPanel core={core} locationHistory={h} />);

  it("未入力 + 履歴あり → チップ表示（よく行く/最近 + 値）", () => {
    const html = withHistory(emptyLoc, HISTORY);
    expect(html).toContain('data-testid="compose-location-history"');
    expect(html).toContain("よく行く");
    expect(html).toContain("最近");
    expect(html).toContain("渋谷オフィス");
    expect(html).toContain("新宿カフェ");
    expect(html).toContain('data-testid="compose-loc-chip"');
  });

  it("入力中（locationText 非空）はチップを出さない（外部検索に委ねる）", () => {
    expect(withHistory({ ...emptyLoc, locationText: "渋" }, HISTORY)).not.toContain(
      'data-testid="compose-location-history"',
    );
  });

  it("履歴 0 件ならチップなし（fail-open）", () => {
    expect(
      withHistory(emptyLoc, { frequent: [], recent: [] }),
    ).not.toContain('data-testid="compose-location-history"');
  });

  it("locationHistory 未指定でも壊れない（後方互換）", () => {
    expect(withHistory(emptyLoc)).not.toContain(
      'data-testid="compose-location-history"',
    );
  });
});
