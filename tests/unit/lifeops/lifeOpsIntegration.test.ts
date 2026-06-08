/**
 * Life Ops 結合テスト（pure・注入データ）— 縦パイプライン全体を collector で検証。
 *   現実的な週次スナップショットで「今 Aneurasync が先回りすべき行動」が妥当に出るか（人間が見て自然か）。
 *   実データ源なし・画面なし fixture・横非接続。原案 A.7/A.11 の朝の管制例を再現。
 */
import { describe, it, expect } from "vitest";
import { collectLifeOpsCandidates, type LifeOpsInputs } from "@/lib/lifeops/candidate-collector";
import type { LifeOpsCandidate } from "@/lib/lifeops/candidate-types";

const NOW = "2026-06-12T00:00:00Z";

// 現実的な 1 週間スナップショット
const WEEKLY: LifeOpsInputs = {
  cadenceObservations: [
    { categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: "2026-05-08" }, // 35日/42=0.83 nearing
    { categoryId: "beauty_salon", menu: "color", lastCompletedAtISO: "2026-04-10" }, // 63日/56=1.13 beyond
    { categoryId: "groceries", lastCompletedAtISO: "2026-06-07" }, // 5日/4=1.25 beyond
    { categoryId: "daily_necessities", lastCompletedAtISO: "2026-06-08" }, // 4日/14=0.29 within
  ],
  upcomingEvents: [
    { kind: "interview", startISO: "2026-06-17" }, // 5日後
    { kind: "trip", startISO: "2026-06-15" }, // 3日後
  ],
  deadlineObservations: [
    { categoryId: "license_renewal", deadlineISO: "2026-07-05" }, // 23日 within_lead
    { categoryId: "tax_filing", deadlineISO: "2026-06-05" }, // -7日 overdue
  ],
};

function byCategory(out: readonly LifeOpsCandidate[]): Record<string, LifeOpsCandidate> {
  return Object.fromEntries(out.map((c) => [`${c.category}:${c.menu ?? ""}`, c]));
}

describe("Life Ops 結合 — 週次スナップショットで妥当に先回りする", () => {
  const out = collectLifeOpsCandidates(WEEKLY, NOW);
  const idx = byCategory(out);

  it("期限・イベント前倒し・one-shot・周期 が全て出る（カテゴリ網羅）", () => {
    const keys = Object.keys(idx);
    expect(keys).toEqual(
      expect.arrayContaining([
        "tax_filing:", // 期限 overdue
        "license_renewal:", // 期限 within
        "beauty_salon:cut", // イベント前倒し（nearing × イベント）
        "packing:", // one-shot(旅行)
        "ticket_hotel_check:", // one-shot(旅行)
        "outfit_prep:", // one-shot(面接)
        "document_prep:", // one-shot(面接)
        "beauty_salon:color", // 周期 beyond
        "groceries:", // 周期 beyond
      ]),
    );
  });

  it("十分新しい daily_necessities(within) は出さない（急かさない）", () => {
    expect(idx["daily_necessities:"]).toBeUndefined();
  });

  it("カット(nearing)は周期でなくイベント前倒し（trip 3日が最寄り）", () => {
    const cut = idx["beauty_salon:cut"];
    expect(cut.dueReason.kind).toBe("event_prep");
    if (cut.dueReason.kind === "event_prep") {
      expect(cut.dueReason.eventKind).toBe("trip"); // interview(5)より trip(3)が近い
      expect(cut.dueReason.daysUntilEvent).toBe(3);
      expect(cut.dueReason.cyclePhase).toBe("nearing");
    }
  });

  it("カラー/食料品は周期(beyond)・税は overdue・免許は within", () => {
    expect(idx["beauty_salon:color"].dueReason.kind).toBe("cycle");
    expect(idx["groceries:"].dueReason.kind).toBe("cycle");
    const tax = idx["tax_filing:"];
    expect(tax.dueReason.kind).toBe("deadline");
    if (tax.dueReason.kind === "deadline") expect(tax.dueReason.overdue).toBe(true);
    const lic = idx["license_renewal:"];
    if (lic.dueReason.kind === "deadline") expect(lic.dueReason.overdue).toBe(false);
  });

  it("最優先は期限（逃すと実害）→ overdue が先頭", () => {
    expect(out[0].category).toBe("tax_filing"); // deadline 優先 ∧ overdue(-7) 最前
    expect(out[1].category).toBe("license_renewal");
  });

  it("重複なし（dedup 効く）・全件 placeQuery/level/risk が L-1 由来で揃う", () => {
    const keys = out.map((c) => `${c.category}:${c.menu ?? ""}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of out) {
      expect(["L0", "L1", "L2", "L3", "L4", "L5"]).toContain(c.permissionLevelHint);
      expect(c.suggestedWindow).toBeNull(); // 配置は横 R2
    }
  });
});

describe("Life Ops 結合 — エッジ", () => {
  it("全て十分新しい/期日先/イベントなし → 空（先回りしない）", () => {
    const quiet: LifeOpsInputs = {
      cadenceObservations: [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: "2026-06-10" }], // 2日 within
      deadlineObservations: [{ categoryId: "license_renewal", deadlineISO: "2026-12-01" }], // 172日 not_yet
    };
    expect(collectLifeOpsCandidates(quiet, NOW)).toEqual([]);
  });
  it("履歴/期日 不明（unknown）→ 出さない（捏造しない）", () => {
    const unknown: LifeOpsInputs = {
      cadenceObservations: [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: null }],
      deadlineObservations: [{ categoryId: "tax_filing", deadlineISO: null }],
    };
    expect(collectLifeOpsCandidates(unknown, NOW)).toEqual([]);
  });
  it("overdue が複数 → 差し迫った順", () => {
    const out = collectLifeOpsCandidates(
      {
        deadlineObservations: [
          { categoryId: "license_renewal", deadlineISO: "2026-06-10" }, // -2
          { categoryId: "tax_filing", deadlineISO: "2026-06-01" }, // -11
        ],
      },
      NOW,
    );
    expect(out.map((c) => c.category)).toEqual(["tax_filing", "license_renewal"]); // -11 < -2
  });
});
