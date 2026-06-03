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
import type { LocationUsage } from "@/lib/plan/compose/locationHistory";

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

describe("④/① 場所履歴は活動SVG popover に集約（どこで欄の常時「よく行く」は廃止）", () => {
  let n = 0;
  const u = (text: string, title = "予定"): LocationUsage => {
    n += 1;
    return { text, title, usedAtISO: `2026-03-${String((n % 28) + 1).padStart(2, "0")}` };
  };
  // panel は extractLocationUsages 済（具体的のみ）の usages を受け取る前提。
  const USAGES: LocationUsage[] = [
    u("渋谷オフィス", "会議"),
    u("渋谷オフィス", "会議"),
    u("自習室 KAKOI", "勉強"),
    u("自習室 KAKOI", "数学の勉強"),
  ];
  const core = (over: Partial<ComposeDraftCore> = {}): ComposeDraftCore => ({
    title: "",
    locationText: "",
    rigidity: "",
    companions: [],
    ...over,
  });
  const render2 = (c: ComposeDraftCore, usages?: LocationUsage[]) =>
    renderToStaticMarkup(<ComposeFormPanel core={c} locationUsages={usages} />);

  it("どこで欄に常時「よく行く」チップを出さない（欄は廃止・popover へ移設）", () => {
    // title 空でも有でも、locationText 有無に関わらず where 欄に履歴チップは出ない
    expect(render2(core(), USAGES)).not.toContain('data-testid="compose-location-history"');
    expect(render2(core({ title: "勉強" }), USAGES)).not.toContain(
      'data-testid="compose-location-history"',
    );
    expect(render2(core({ title: "勉強", locationText: "渋" }), USAGES)).not.toContain(
      'data-testid="compose-location-history"',
    );
  });

  it("① title 有 → 活動SVG が有効、popover は閉（候補は未露出）", () => {
    const html = render2(core({ title: "勉強" }), USAGES);
    expect(html).toContain('data-testid="compose-activity-places-trigger"');
    expect(html).toContain('data-enabled="true"');
    // SSR は showPlaces=false → popover とその中の候補(自習室 KAKOI)は markup に無い
    expect(html).not.toContain('data-testid="compose-activity-places"');
    expect(html).not.toContain("自習室 KAKOI");
  });

  it("① title 空 → 活動SVG は disabled（tooltip 案内）", () => {
    const html = render2(core({ title: "" }), USAGES);
    expect(html).toContain('data-testid="compose-activity-places-trigger"');
    expect(html).toContain('data-enabled="false"');
    expect(html).toContain("予定を入力すると候補が出ます");
  });

  it("長押し詳細は初期表示では出ない（操作時のみ）", () => {
    expect(render2(core({ title: "勉強" }), USAGES)).not.toContain(
      'data-testid="compose-loc-detail"',
    );
  });

  it("usages 無しでも SVG trigger は常在（fail-open）", () => {
    const html = render2(core({ title: "勉強" }));
    expect(html).toContain('data-testid="compose-activity-places-trigger"');
    expect(html).not.toContain('data-testid="compose-location-history"');
  });
});
