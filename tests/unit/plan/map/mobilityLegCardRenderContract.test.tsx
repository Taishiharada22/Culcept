import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { MobilityLegCard } from "@/components/plan/map/MobilityLegCard";
import type { RouteTransportMode } from "@/lib/plan/map/routeMode";
import type { MobilityReason } from "@/lib/plan/mobility/hypothesisFeedbackStore";

const noop = (): void => undefined;

function render(
  opts: {
    selectedMode?: RouteTransportMode;
    recallMode?: RouteTransportMode;
    readOnly?: boolean;
    reasonPromptVisible?: boolean;
    selectedReason?: MobilityReason | null;
    reasonReflection?: string | null;
    movementToleranceReason?: string | null;
  } = {},
): string {
  return renderToStaticMarkup(
    <MobilityLegCard
      legKey="a__b"
      fromTitle="渋谷"
      toTitle="新宿"
      selectedMode={opts.selectedMode ?? null}
      recallMode={opts.recallMode ?? null}
      readOnly={opts.readOnly ?? false}
      reasonPromptVisible={opts.reasonPromptVisible ?? false}
      selectedReason={opts.selectedReason ?? null}
      reasonReflection={opts.reasonReflection ?? null}
      movementToleranceReason={opts.movementToleranceReason ?? null}
      onSelect={noop}
      onClose={noop}
      onReasonSelect={noop}
      onReasonDismiss={noop}
    />,
  );
}

describe("MobilityLegCard render-contract (A5-1)", () => {
  it("card / from→to / 主な手段・制限ありの全 mode label", () => {
    const html = render();
    expect(html).toContain('data-testid="mobility-leg-card"');
    expect(html).toContain("渋谷");
    expect(html).toContain("新宿");
    for (const label of ["徒歩", "車", "タクシー", "電車", "バス"]) expect(html).toContain(label);
    for (const label of ["自転車", "飛行機", "新幹線"]) expect(html).toContain(label);
    expect(html).toContain("制限あり");
    expect(html).toContain("β＝経路は概念表示");
  });
  it("selectedMode → 現在表示ラベル + active 色", () => {
    const html = render({ selectedMode: "train" });
    expect(html).toContain("現在表示");
    expect(html).toContain("電車");
    expect(html).toContain("#1565c0");
  });
  it("selectedMode なし → 未設定", () => {
    expect(render()).toContain("未設定");
  });
  it("recallMode あり(編集可) → 前回この区間 + label + 適用", () => {
    const html = render({ recallMode: "car" });
    expect(html).toContain("前回この区間");
    expect(html).toContain("適用");
    expect(html).toContain("車");
  });
  it("readOnly → recall なし + 過去ラベル", () => {
    const html = render({ recallMode: "car", readOnly: true });
    expect(html).not.toContain("前回この区間");
    expect(html).toContain("過去の移動・実績");
  });
  it("durations を持たない: 所要時間/分 を出さない (A5-1 境界)", () => {
    const html = render({ selectedMode: "walk", recallMode: "car" });
    expect(html).not.toContain("所要時間");
    expect(html).not.toContain("おすすめではなく判断材料");
    expect(html).not.toMatch(/\d+\s*分/);
  });
  it("squircle icon (svg data URI) が chip 背景に入る", () => {
    expect(render()).toContain("data:image/svg+xml");
  });
});

describe("MobilityLegCard — A0 理由観測 chip", () => {
  it("A0-1. reasonPromptVisible + 編集可 → なぜ変えた？ + 6 理由 label", () => {
    const html = render({ reasonPromptVisible: true });
    expect(html).toContain('data-testid="mobility-reason-prompt"');
    expect(html).toContain("なぜ変えた？");
    for (const label of ["疲れ", "景色", "安い", "急ぎ", "気分", "その他"]) expect(html).toContain(label);
  });
  it("A0-2. reasonPromptVisible=false → prompt を出さない", () => {
    expect(render()).not.toContain("mobility-reason-prompt");
    expect(render()).not.toContain("なぜ変えた？");
  });
  it("A0-3. ★HARD GATE: readOnly では reasonPromptVisible でも出さない", () => {
    const html = render({ reasonPromptVisible: true, readOnly: true });
    expect(html).not.toContain("mobility-reason-prompt");
  });
  it("A0-4. selectedReason → その chip が active（aria-pressed / 反転色）", () => {
    const html = render({ reasonPromptVisible: true, selectedReason: "tired" });
    const tiredBtn = html.match(/<button[^>]*data-reason="tired"[^>]*>/);
    expect(tiredBtn).not.toBeNull();
    expect(tiredBtn![0]).toContain('aria-pressed="true"'); // 該当 chip だけ active
    expect(tiredBtn![0]).toContain("bg-slate-700"); // active 反転色
    const sceneryBtn = html.match(/<button[^>]*data-reason="scenery"[^>]*>/);
    expect(sceneryBtn![0]).toContain('aria-pressed="false"'); // 非選択は非 active
  });
  it("A0-5. ★HARD GATE: free text なし（input/textarea を置かない）", () => {
    const html = render({ reasonPromptVisible: true });
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<textarea");
  });
  it("A0-6. dismiss（閉じる）ボタンがある・modal でない（chips は button のみ）", () => {
    const html = render({ reasonPromptVisible: true });
    expect(html).toMatch(/mobility-reason-prompt[\s\S]*aria-label="閉じる"/);
    expect(html).not.toContain("role=\"dialog\"");
  });
  it("A0-7. ★人格ラベルを含まない（trait 断定でなく per-leg 文脈）", () => {
    const html = render({ reasonPromptVisible: true, selectedReason: "tired" });
    for (const w of ["あなたはこういう人", "あなたは○", "タイプです", "性格", "傾向があります"]) {
      expect(html).not.toContain(w);
    }
  });
});

// ── A0-2: reason reflection line（established insight の穏やかな 1 行） ──
describe("MobilityLegCard — A0-2 reason reflection", () => {
  const LINE = "この区間では、景色を理由に 徒歩を選ぶことがあるようです";

  it("RUI1. reasonReflection 供給 + 編集可 → reflection 行が出る", () => {
    const html = render({ reasonReflection: LINE });
    expect(html).toContain('data-testid="mobility-reason-reflection"');
    expect(html).toContain(LINE);
  });
  it("RUI2. reasonReflection なし(null) → 出ない（沈黙）", () => {
    expect(render()).not.toContain("mobility-reason-reflection");
  });
  it("RUI3. ★readOnly では出さない", () => {
    expect(render({ reasonReflection: LINE, readOnly: true })).not.toContain("mobility-reason-reflection");
  });
  it("RUI4. modal/toast でない・1 行 inline（dialog role なし・小さい slate）", () => {
    const html = render({ reasonReflection: LINE });
    expect(html).not.toContain('role="dialog"');
    expect(html).toMatch(/mobility-reason-reflection[^>]*text-slate-400/);
  });
  it("RUI5. dismiss（閉じる）ボタンがある", () => {
    const html = render({ reasonReflection: LINE });
    expect(html).toMatch(/mobility-reason-reflection[\s\S]*aria-label="閉じる"/);
  });
  it("RUI6. ★禁止語/警告色なし（reflection は仮説トーン・per-leg）", () => {
    const html = render({ reasonReflection: LINE });
    for (const w of ["しがち", "よく", "いつも", "あなたは", "性格", "amber", "orange", "bg-red", "危険"]) {
      expect(html).not.toContain(w);
    }
  });
});

// ── Movement Tolerance reason-only line（CEO 2026-06-09・read-only・1 行・沈黙保証） ──
describe("MobilityLegCard — Movement Tolerance reason-only", () => {
  const MT = "雨の日は移動負荷の少ない手段を選びやすい傾向が見えます。";

  it("MT1. movementToleranceReason 供給 + 編集可 → 1 行が出る", () => {
    const html = render({ movementToleranceReason: MT });
    expect(html).toContain('data-testid="mobility-movement-tolerance"');
    expect(html).toContain(MT);
  });
  it("MT2. null → 出ない（沈黙）", () => {
    expect(render()).not.toContain("mobility-movement-tolerance");
  });
  it("MT3. ★readOnly では出さない（沈黙保証）", () => {
    expect(render({ movementToleranceReason: MT, readOnly: true })).not.toContain("mobility-movement-tolerance");
  });
  it("MT4. read-only 表示（dismiss/dialog/警告色なし・小さい slate・1 行）", () => {
    const html = render({ movementToleranceReason: MT });
    expect(html).not.toContain('role="dialog"');
    expect(html).toMatch(/mobility-movement-tolerance[^>]*text-slate-400/);
    // ★mode/ranking を操作する affordance を持たない（純粋な観測行）。
    expect(html).not.toMatch(/mobility-movement-tolerance[\s\S]{0,80}<button/);
  });
  it("MT5. ★trait 断定語・警告色を含まない", () => {
    const html = render({ movementToleranceReason: MT });
    for (const w of ["苦手", "嫌い", "タイプです", "性格", "amber", "orange", "bg-red", "危険"]) {
      expect(html).not.toContain(w);
    }
  });
});
