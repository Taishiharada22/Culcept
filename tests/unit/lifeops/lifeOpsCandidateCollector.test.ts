/**
 * Life Ops Candidate Collector（pure）— 4 経路統合の単一出口。
 *   全 source 合流・(category,menu) dedup・source 優先順位・空・deterministic。
 */
import { describe, it, expect } from "vitest";
import { collectLifeOpsCandidates, type LifeOpsInputs } from "@/lib/lifeops/candidate-collector";

const NOW = "2026-06-12T00:00:00Z";

describe("Collector — 4 経路統合", () => {
  it("周期/イベント前倒し/one-shot/期限 が合流する", () => {
    const inputs: LifeOpsInputs = {
      cadenceObservations: [
        { categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: "2026-04-01" }, // 72日 well_beyond → 周期候補
        { categoryId: "eyebrow", lastCompletedAtISO: "2026-05-20" }, // 23日/28=0.82 nearing（イベントで前倒し対象）
        { categoryId: "groceries", lastCompletedAtISO: "2026-06-01" }, // 11日/4 well_beyond → 周期候補
      ],
      upcomingEvents: [
        { kind: "interview", startISO: "2026-06-16" }, // one-shot: 服/資料 ＋ eyebrow nearing 前倒し
      ],
      deadlineObservations: [
        { categoryId: "tax_filing", deadlineISO: "2026-06-20" }, // 8日 within_lead → 期限候補
      ],
    };
    const out = collectLifeOpsCandidates(inputs, NOW);
    const cats = out.map((c) => c.category);
    expect(cats).toContain("beauty_salon"); // 周期
    expect(cats).toContain("groceries"); // 周期
    expect(cats).toContain("eyebrow"); // イベント前倒し
    expect(cats).toContain("outfit_prep"); // one-shot
    expect(cats).toContain("document_prep"); // one-shot
    expect(cats).toContain("tax_filing"); // 期限
  });

  it("dueReason の種別が source ごとに正しい", () => {
    const out = collectLifeOpsCandidates(
      {
        cadenceObservations: [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: "2026-04-01" }],
        deadlineObservations: [{ categoryId: "tax_filing", deadlineISO: "2026-06-20" }],
        upcomingEvents: [{ kind: "trip", startISO: "2026-06-15" }],
      },
      NOW,
    );
    const byCat = Object.fromEntries(out.map((c) => [c.category, c.dueReason.kind]));
    expect(byCat["beauty_salon"]).toBe("cycle");
    expect(byCat["tax_filing"]).toBe("deadline");
    expect(byCat["packing"]).toBe("event_prep"); // trip one-shot
  });
});

describe("Collector — dedup (category,menu)", () => {
  it("同 (category,menu) は最優先 source 先勝ち（重複しない）", () => {
    // groceries は周期(well_beyond)で1件のみ出る想定。menu 違いの beauty は別キー
    const out = collectLifeOpsCandidates(
      {
        cadenceObservations: [
          { categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: "2026-04-01" },
          { categoryId: "beauty_salon", menu: "color", lastCompletedAtISO: "2026-03-01" }, // 別 menu → 別候補
        ],
      },
      NOW,
    );
    const keys = out.map((c) => `${c.category}:${c.menu ?? ""}`);
    expect(new Set(keys).size).toBe(keys.length); // 重複なし
    expect(keys).toContain("beauty_salon:cut");
    expect(keys).toContain("beauty_salon:color");
  });
});

describe("Collector — 空 / deterministic", () => {
  it("空入力 → 空", () => {
    expect(collectLifeOpsCandidates({}, NOW)).toEqual([]);
  });
  it("同入力は同出力（pure）", () => {
    const inputs: LifeOpsInputs = {
      cadenceObservations: [{ categoryId: "groceries", lastCompletedAtISO: "2026-06-01" }],
      deadlineObservations: [{ categoryId: "license_renewal", deadlineISO: "2026-06-25" }],
    };
    expect(collectLifeOpsCandidates(inputs, NOW)).toEqual(collectLifeOpsCandidates(inputs, NOW));
  });
});
