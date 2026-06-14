/**
 * T11-B(CoAlter)-E — CoAlter Cues Preview render test（route 非依存・renderToStaticMarkup）。
 *   fixture cue を render → 全 5 action 表示・weather_reversal は確認 cue・action button/入力なし・authority 語なし。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CoAlterCuesPreview } from "@/app/(culcept)/plan/dev-coalter-projection-cues/CoAlterCuesPreview";
import { FIXTURE_COALTER_CUES } from "@/app/(culcept)/plan/dev-coalter-projection-cues/fixture";
import { COALTER_PROJECTION_DISPLAY_ACTIONS } from "@/lib/shared/travel/coalter-projection-consume-types";
import type { DisplayPacketForClient } from "@/lib/shared/travel/engine-consume-types";

const html = (cues = FIXTURE_COALTER_CUES) => renderToStaticMarkup(<CoAlterCuesPreview cues={cues} />);

describe("1. fixture cue は全 5 action を網羅し render される", () => {
  it("fixture が 5 action すべて含む", () => {
    const actions = new Set(FIXTURE_COALTER_CUES.map((c) => c.action));
    for (const a of COALTER_PROJECTION_DISPLAY_ACTIONS) expect(actions.has(a)).toBe(true);
  });
  it("5 action の testid + 日本語ラベルが render に出る", () => {
    const h = html();
    for (const a of ["ask_question", "ask_confirmation", "explain_plan", "note_risk", "show_fallback"]) {
      expect(h).toContain(`data-testid="cue-${a}"`);
    }
    for (const label of ["質問候補", "確認候補", "説明", "注意", "代替案"]) expect(h).toContain(label);
  });
});

describe("2. weather_reversal_uncertainty は確認 cue（booking authority でない）", () => {
  it("ref として表示・実行/予約 UI なし", () => {
    const h = html();
    expect(h).toContain("weather_reversal_uncertainty");
    expect(h).not.toContain("<button");
    expect(h).not.toContain("<input");
    expect(h).not.toContain("<form");
  });
});

describe("3. execute/book/schedule/send cue・authority 語が出ない", () => {
  it("display action enum に実行系が無い", () => {
    for (const f of ["execute", "book", "schedule", "send", "reserve", "pay"]) {
      expect(COALTER_PROJECTION_DISPLAY_ACTIONS.some((a) => a.includes(f))).toBe(false);
    }
  });
  it("render に authority/実行語が出ない", () => {
    const h = html();
    for (const f of ["executionAuthority", "authoritative", "diagnostics", "canBook", "予約する", "今すぐ予約", "送信する"]) {
      expect(h).not.toContain(f);
    }
  });
  it("read-only 明示文がある", () => {
    expect(html()).toContain("実行・予約・確定・送信は行いません。");
  });
  it("空 cue は fail-closed 表示", () => {
    expect(html([])).toContain("表示できる cue がありません。");
  });
});

describe("4. 型: component は CoAlterProjectionCue[] のみ受理", () => {
  it("cue[] は OK・DisplayPacketForClient は不可（@ts-expect-error）", () => {
    type Props = Parameters<typeof CoAlterCuesPreview>[0];
    const ok: Props = { cues: FIXTURE_COALTER_CUES };
    expect(ok.cues.length).toBeGreaterThan(0);
    // @ts-expect-error packet は CoAlterProjectionCue[] でない（UI に渡せない）
    const bad: Props = { cues: {} as unknown as DisplayPacketForClient };
    void bad;
  });
});
