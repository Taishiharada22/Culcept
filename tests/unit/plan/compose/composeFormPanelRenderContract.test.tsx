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
