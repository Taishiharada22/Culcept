/**
 * A-4-c22 — Life Ops Deadline Completion Suppression（pure・presentation suppression・fake のみ・write 0）unit。
 *   GPT 14 lock: ①done が deadline 候補を抑制 ②accept/later/dismiss は不使用 ③cycle は本 helper で抑制しない
 *   ④unknown category/menu drop ⑤free text/raw/handle/user_id 非搬出 ⑥stale done 無視 ⑦same key のみ抑制
 *   ⑧他 deadline は残る ⑨protect 全消えしない ⑩page/actions が同一 suppression ⑪cleanup 後 0（候補が戻る）
 *   ⑫meta は count のみ ⑬no write/PlanClient/R4/notification/production ⑭suite/tsc（suite 側）。
 *
 * 設計: docs/life-ops-deadline-completion-a4-c22-mini-design.md。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { applyLifeOpsCompletionSuppression } from "@/lib/plan/reality/lifeops/lifeops-completion-suppression";
import { m1RowsToLifeOpsFeedback, type LifeOpsFeedbackObservation } from "@/lib/plan/reality/lifeops/lifeops-feedback-source";
import { computeLifeOpsPreviewDto } from "@/lib/plan/reality/lifeops/lifeops-preview-compute";
import type { LifeOpsCandidate } from "@/lib/lifeops/candidate-types";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";

const NOW_MS = Date.parse("2026-06-10T09:00:00+09:00");
const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (d: number) => new Date(NOW_MS + d * DAY_MS).toISOString();
const FORBIDDEN = /seed_?ref|utterance|personality|trait|user_id|"id"|source_ref|handle|@[a-z]|\b\d{10,}\b|[0-9a-f]{8}-[0-9a-f]{4}/i;

const doneRow = (categoryId: string, deltaDays: number, action = "done") =>
  m1RowsToLifeOpsFeedback([{ handle: `lifeops:${categoryId}`, action, acted_at: iso(deltaDays), source_kind: "lifeops" }]);

/** fake candidates: deadline（tax 5d/lead30・license 20d/lead30）+ cycle（beauty cut）。 */
function fakeCandidates(): readonly LifeOpsCandidate[] {
  return [
    {
      category: "tax_filing", menu: null,
      dueReason: { kind: "deadline", daysUntilDeadline: 5, leadDays: 30, overdue: false },
      suggestedWindow: null, placeQuery: null, permissionLevelHint: "L3", riskFlags: [],
    },
    {
      category: "license_renewal", menu: null,
      dueReason: { kind: "deadline", daysUntilDeadline: 20, leadDays: 30, overdue: false },
      suggestedWindow: null, placeQuery: null, permissionLevelHint: "L3", riskFlags: [],
    },
    {
      category: "beauty_salon", menu: "cut",
      dueReason: { kind: "cycle", elapsedDays: 60, typicalIntervalDays: 42, phase: "beyond_typical" },
      suggestedWindow: null, placeQuery: null, permissionLevelHint: "L3", riskFlags: [],
    },
  ] as unknown as readonly LifeOpsCandidate[];
}

function ws(nowMinute = 800): WorldState {
  return {
    date: "2026-06-10", nowMinute, todaySchedule: [],
    availableWindows: [
      { startMinute: 600, endMinute: 660, meaning: null },
      { startMinute: 780, endMinute: 960, meaning: null },
    ],
    context: null, mobility: null, permissionLevel: 2,
  } as WorldState;
}
const dto = (doneFeedback?: readonly LifeOpsFeedbackObservation[]) =>
  computeLifeOpsPreviewDto({ world: ws(), date: "2026-06-10", nowMinute: 800, nowMs: NOW_MS, doneFeedback });

describe("c22 — helper（①②③⑥⑦⑧⑨・pure）", () => {
  it("①done(今) → 同 key の deadline 候補を抑制・⑧他 deadline と③cycle は残る・count=1", () => {
    const r = applyLifeOpsCompletionSuppression({ candidates: fakeCandidates(), doneFeedback: doneRow("tax_filing", 0), nowMs: NOW_MS });
    expect(r.suppressedDeadlineCount).toBe(1);
    expect(r.candidates.map((c) => c.category)).toEqual(["license_renewal", "beauty_salon"]); // ⑨全消えしない
  });
  it("②accept/later/dismiss は抑制に使わない（同 key でも count=0・候補不変）", () => {
    for (const action of ["accept", "later", "dismiss"]) {
      const r = applyLifeOpsCompletionSuppression({ candidates: fakeCandidates(), doneFeedback: doneRow("tax_filing", 0, action), nowMs: NOW_MS });
      expect(r.suppressedDeadlineCount).toBe(0);
      expect(r.candidates.length).toBe(3);
    }
  });
  it("③cycle 候補は同 key done でも本 helper では抑制しない（cadence 側の担当・二重処理禁止）", () => {
    const r = applyLifeOpsCompletionSuppression({
      candidates: fakeCandidates(),
      doneFeedback: m1RowsToLifeOpsFeedback([{ handle: "lifeops:beauty_salon:cut", action: "done", acted_at: iso(0), source_kind: "lifeops" }]),
      nowMs: NOW_MS,
    });
    expect(r.suppressedDeadlineCount).toBe(0);
    expect(r.candidates.map((c) => c.category)).toContain("beauty_salon");
  });
  it("⑥stale done 無視: 窓開始（deadline−lead= -25d）より前の done は抑制しない・以後なら抑制", () => {
    // tax: due +5d / lead 30 → windowStart = NOW −25d
    const stale = applyLifeOpsCompletionSuppression({ candidates: fakeCandidates(), doneFeedback: doneRow("tax_filing", -40), nowMs: NOW_MS });
    expect(stale.suppressedDeadlineCount).toBe(0); // 去年/窓前の done は今年の候補を消せない
    const lastYear = applyLifeOpsCompletionSuppression({ candidates: fakeCandidates(), doneFeedback: doneRow("tax_filing", -365), nowMs: NOW_MS });
    expect(lastYear.suppressedDeadlineCount).toBe(0);
    const inWindow = applyLifeOpsCompletionSuppression({ candidates: fakeCandidates(), doneFeedback: doneRow("tax_filing", -10), nowMs: NOW_MS });
    expect(inWindow.suppressedDeadlineCount).toBe(1); // 窓内（-25d 以後）の done は有効
  });
  it("⑦same key のみ: menu 違い/別 category の done は他候補に波及しない", () => {
    const r = applyLifeOpsCompletionSuppression({ candidates: fakeCandidates(), doneFeedback: doneRow("passport_renewal", 0), nowMs: NOW_MS });
    expect(r.suppressedDeadlineCount).toBe(0);
    expect(r.candidates.length).toBe(3);
  });
  it("④unknown category/enum 外 menu の done は drop（fake 偽装・cast 経由でも roundtrip で落ちる）", () => {
    const forged = [
      { categoryId: "massage_parlor", menu: null, action: "done", actedAtISO: iso(0) },
      { categoryId: "tax_filing", menu: "perm", action: "done", actedAtISO: iso(0) },
    ] as unknown as readonly LifeOpsFeedbackObservation[];
    const r = applyLifeOpsCompletionSuppression({ candidates: fakeCandidates(), doneFeedback: forged, nowMs: NOW_MS });
    expect(r.suppressedDeadlineCount).toBe(0);
    expect(r.candidates.length).toBe(3);
  });
  it("⑪0 件は同一参照 no-op（cleanup 後=doneFeedback 空 → 候補がそのまま戻る）", () => {
    const cands = fakeCandidates();
    const r = applyLifeOpsCompletionSuppression({ candidates: cands, doneFeedback: [], nowMs: NOW_MS });
    expect(r.candidates).toBe(cands);
    expect(r.suppressedDeadlineCount).toBe(0);
  });
});

describe("c22 — preview compute 統合（①⑪⑫・fixture chain）", () => {
  it("fixture + done(tax) → 確定申告が全 tier から消える・meta suppressedDeadlineCount=1・他 deadline 残存", () => {
    const base = dto();
    expect(JSON.stringify(base)).toContain("確定申告");
    const d = dto(doneRow("tax_filing", 0));
    const json = JSON.stringify(d);
    expect(json).not.toContain("確定申告"); // Morning/Moment/全 tier 一括（placement 前抑制）
    expect(json).toContain("免許の更新"); // ⑧
    expect(d.integrationMeta.suppressedDeadlineCount).toBe(1);
    expect(JSON.stringify(d.integrationMeta)).not.toMatch(FORBIDDEN); // ⑤count のみ・key/label/handle なし
  });
  it("⑪cleanup 相当（doneFeedback 省略/[]）→ DTO 完全一致（候補が戻る）・count=0", () => {
    expect(JSON.stringify(dto([]))).toBe(JSON.stringify(dto()));
    expect(dto().integrationMeta.suppressedDeadlineCount).toBe(0);
  });
  it("⑨抑制後も briefing は崩れない（headline 非空・protect/easy/push 3 tier 維持）", () => {
    const d = dto(doneRow("tax_filing", 0));
    expect(d.briefing.headline.length).toBeGreaterThan(0);
    expect(d.briefing.tiers.map((t) => t.tier)).toEqual(["protect", "easy", "push"]);
  });
});

describe("c22 — 配線/静的安全（⑩⑬）", () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  it("⑩page と actions の両方が doneFeedback を compute に注入（表示と照合の候補集合がズレない）", () => {
    expect(read("app/(culcept)/plan/dev-reality-pipeline/page.tsx")).toContain("doneFeedback: feedbackObservations");
    expect(read("app/(culcept)/plan/dev-reality-pipeline/actions.ts")).toContain("doneFeedback: recentObservations");
  });
  it("⑬helper: DB/fetch/server-only/write/notification/PlanClient なし（pure・presentation のみ）", () => {
    const code = strip(read("lib/plan/reality/lifeops/lifeops-completion-suppression.ts")).toLowerCase();
    for (const banned of ["@supabase", "createclient", ".from(", "fetch(", "server-only", "process.env", ".insert(", ".update(", ".delete(", "notification", "planclient"]) {
      expect(code).not.toContain(banned);
    }
  });
  it("⑫client 観測行は counts のみ（数値 3 連表示・label/key 文字列を埋め込まない）", () => {
    const src = read("app/(culcept)/plan/dev-reality-pipeline/RealityPipelinePreviewClient.tsx");
    expect(src).toContain("suppressedDeadlineCount");
    expect(src).toContain("実データ反映（fbCad / realCad / 完了済 deadline 抑制）");
  });
});
