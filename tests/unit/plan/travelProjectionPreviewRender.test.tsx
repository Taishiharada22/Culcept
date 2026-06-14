/**
 * T11-A-F — Travel Projection Preview render test（route 非依存・renderToStaticMarkup）。
 *   fixture projection を render → 9 section 表示・action button/入力なし・
 *   weather_reversal_uncertainty は確認 text・fitAdvisory は advisory・authority 語なし。
 *
 * 既存 dev-preview render test pattern（realityPipelinePreviewRender.test.tsx）に準拠。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TravelProjectionPreview } from "@/app/(culcept)/plan/dev-travel-projection/TravelProjectionPreview";
import { FIXTURE_TRAVEL_PROJECTION } from "@/app/(culcept)/plan/dev-travel-projection/fixture";
import type { PlanIntelligenceProjection } from "@/lib/shared/travel/plan-intelligence-projection-types";
import type { DisplayPacketForClient } from "@/lib/shared/travel/engine-consume-types";

const html = () => renderToStaticMarkup(<TravelProjectionPreview projection={FIXTURE_TRAVEL_PROJECTION} />);

describe("1. fixture projection の 9 section が render される", () => {
  it("answer / why / fallback / question / fit advisory / readiness / viewer note", () => {
    const h = html();
    expect(h).toContain("雨予報が不確実なため"); // answer/why（rationale.shared）
    expect(h).toContain("confirm"); // nextAction
    expect(h).toContain("rain_or_weather"); // fallback trigger
    expect(h).toContain("switch_proposal"); // fallback action
    expect(h).toContain("ask_budget_band"); // questionsToAsk intent
    expect(h).toContain("good"); // fitAdvisory grade
    expect(h).toContain("needs_confirmation"); // readiness state
    expect(h).toContain("静かさ"); // viewerNote（自分視点の note）
  });
});

describe("2. weather_reversal_uncertainty は確認 text（booking authority でない）", () => {
  it("確認セクションに weather_reversal_uncertainty が text として出る・実行 UI なし", () => {
    const h = html();
    expect(h).toContain("確認が必要");
    expect(h).toContain("weather_reversal_uncertainty");
    // 実行/予約 UI を持たない
    expect(h).not.toContain("<button");
    expect(h).not.toContain("<input");
    expect(h).not.toContain("<form");
  });
});

describe("3. fitAdvisory は advisory（順位付け/実行でない）", () => {
  it("参考注記つき・raw component/valueFull は出ない", () => {
    const h = html();
    expect(h).toContain("参考・順位付けには使いません");
    expect(h).not.toContain("valueFull");
    expect(h).not.toContain("components");
  });
});

describe("4. authority/private 語が render に出ない", () => {
  it("executionAuthority / authoritative / canBook 等を表示しない", () => {
    const h = html();
    for (const f of ["executionAuthority", "authoritative", "canBook", "canSchedule", "bookingReady", "actionAllowed", "今すぐ予約", "予約する"]) {
      expect(h).not.toContain(f);
    }
  });
  it("read-only 明示文がある", () => {
    expect(html()).toContain("表示のみ。予約・確定・送信・実行は行いません。");
  });
});

describe("5. 型: component は PlanIntelligenceProjection のみ受理", () => {
  it("PlanIntelligenceProjection は OK・DisplayPacketForClient は不可（@ts-expect-error）", () => {
    type Props = Parameters<typeof TravelProjectionPreview>[0];
    const ok: Props = { projection: FIXTURE_TRAVEL_PROJECTION };
    expect(ok.projection).toBeDefined();
    // @ts-expect-error DisplayPacketForClient は PlanIntelligenceProjection でない（packet を UI に渡せない）
    const bad: Props = { projection: {} as unknown as DisplayPacketForClient };
    void bad;
    // 型 alias 健全性（unused 抑止）
    const _p: PlanIntelligenceProjection = FIXTURE_TRAVEL_PROJECTION;
    expect(_p.answer).toBeDefined();
  });
});
