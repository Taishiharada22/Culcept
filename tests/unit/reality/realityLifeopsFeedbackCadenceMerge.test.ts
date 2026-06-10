/**
 * A-4-c14 — Feedback → Cadence Merge（pure merge + preview compute 合流・fake/fixture のみ・write 0）unit。
 *   lock: ⑧merge 後も 5層cap が効く ⑨feedback 由来 cadence が候補生成に反映 ⑩0 件は静かに（同一参照/挙動不変）＋
 *   per-key 最新勝ち（done 事実 > 古い宣言・null は日付に負ける）・no mutation・cap 最上流順序（static）・page gated read 配線。
 *
 * 設計: docs/life-ops-feedback-cadence-merge-a4-c14-mini-design.md。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { mergeCadenceIntoLifeOpsInputs } from "@/lib/plan/reality/lifeops/lifeops-feedback-cadence-merge";
import { computeLifeOpsPreviewDto } from "@/lib/plan/reality/lifeops/lifeops-preview-compute";
import type { LifeOpsInputs } from "@/lib/lifeops/candidate-collector";
import type { CadenceObservation } from "@/lib/lifeops/candidate-types";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";

const NOW_MS = Date.parse("2026-06-10T09:00:00+09:00");
const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (deltaDays: number) => new Date(NOW_MS + deltaDays * DAY_MS).toISOString();
const FORBIDDEN = /seed_?ref|utterance|personality|trait|user_id|@[a-z]|\b\d{10,}\b|[0-9a-f]{8}-[0-9a-f]{4}/i;

function ws(nowMinute = 800): WorldState {
  return {
    date: "2026-06-10",
    nowMinute,
    todaySchedule: [],
    availableWindows: [
      { startMinute: 600, endMinute: 660, meaning: null },
      { startMinute: 780, endMinute: 960, meaning: null },
    ],
    context: null,
    mobility: null,
    permissionLevel: 2,
  } as WorldState;
}
const dto = (inputs: LifeOpsInputs | undefined, feedbackCadence?: readonly CadenceObservation[]) =>
  computeLifeOpsPreviewDto({ world: ws(), date: "2026-06-10", nowMinute: 800, nowMs: NOW_MS, inputs, feedbackCadence });

describe("c14 — merge（pure・per-key 最新勝ち・union）", () => {
  const declared: LifeOpsInputs = {
    cadenceObservations: [
      { categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-60) }, // 宣言: 60日前
      { categoryId: "groceries", lastCompletedAtISO: iso(-10) },
    ],
  };
  it("同 key: done 事実が宣言より新しい → feedback が勝つ（lastCompleted 更新）", () => {
    const m = mergeCadenceIntoLifeOpsInputs(declared, [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-5) }]);
    expect(m.cadenceObservations!.find((c) => c.categoryId === "beauty_salon")!.lastCompletedAtISO).toBe(iso(-5));
    expect(m.cadenceObservations!.find((c) => c.categoryId === "groceries")!.lastCompletedAtISO).toBe(iso(-10)); // 他 key 不変
  });
  it("同 key: 宣言の方が新しい → 既存維持（feedback の古い done で巻き戻さない）", () => {
    const m = mergeCadenceIntoLifeOpsInputs(declared, [{ categoryId: "groceries", lastCompletedAtISO: iso(-30) }]);
    expect(m.cadenceObservations!.find((c) => c.categoryId === "groceries")!.lastCompletedAtISO).toBe(iso(-10));
  });
  it("null(unknown) は日付に必ず負ける（双方向）", () => {
    const withNull: LifeOpsInputs = { cadenceObservations: [{ categoryId: "nail", lastCompletedAtISO: null }] };
    expect(mergeCadenceIntoLifeOpsInputs(withNull, [{ categoryId: "nail", lastCompletedAtISO: iso(-3) }]).cadenceObservations![0].lastCompletedAtISO).toBe(iso(-3));
    expect(mergeCadenceIntoLifeOpsInputs({ cadenceObservations: [{ categoryId: "nail", lastCompletedAtISO: iso(-3) }] }, [{ categoryId: "nail", lastCompletedAtISO: null }]).cadenceObservations![0].lastCompletedAtISO).toBe(iso(-3));
  });
  it("union: 片側のみの key は残る・menu 違いは別 key（cut と color を混同しない）", () => {
    const m = mergeCadenceIntoLifeOpsInputs(declared, [{ categoryId: "beauty_salon", menu: "color", lastCompletedAtISO: iso(-7) }]);
    const keys = m.cadenceObservations!.map((c) => `${c.categoryId}:${c.menu ?? ""}`).sort();
    expect(keys).toEqual(["beauty_salon:color", "beauty_salon:cut", "groceries:"]);
  });
  it("⑩ 0 件は静かに: 同一参照 no-op・入力を mutation しない", () => {
    expect(mergeCadenceIntoLifeOpsInputs(declared, [])).toBe(declared); // 同一参照
    const before = JSON.stringify(declared);
    mergeCadenceIntoLifeOpsInputs(declared, [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-5) }]);
    expect(JSON.stringify(declared)).toBe(before); // 非破壊
  });
  it("inputs.cadenceObservations 未定義でも feedback だけで成立（events/deadlines は触らない）", () => {
    const m = mergeCadenceIntoLifeOpsInputs({ deadlineObservations: [{ categoryId: "tax_filing", deadlineISO: iso(5) }] }, [{ categoryId: "eyebrow", lastCompletedAtISO: iso(-90) }]);
    expect(m.cadenceObservations!.length).toBe(1);
    expect(m.deadlineObservations!.length).toBe(1);
  });
});

describe("c14 — preview compute 合流（⑨ 反映・⑩ 不変・done が静音化する製品挙動）", () => {
  it("⑨ 空 inputs + feedback done(-60d) → 美容院が候補生成に出現・meta count=1（raw row なしで反映）", () => {
    const base = dto({});
    expect(JSON.stringify(base)).not.toContain("美容院");
    expect(base.integrationMeta.feedbackCadenceCount).toBe(0);
    const fed = dto({}, [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-60) }]);
    expect(JSON.stringify(fed)).toContain("美容院"); // cut 42日周期 beyond → 候補化
    expect(fed.integrationMeta.feedbackCadenceCount).toBe(1);
    expect(JSON.stringify(fed)).not.toMatch(FORBIDDEN); // 反映後も PII/raw の経路なし
  });
  it("★done の意味: 宣言 -60d で due でも、done(-5d) を merge すると候補が静かに消える（もう急かさない）", () => {
    const declared: LifeOpsInputs = { cadenceObservations: [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-60) }] };
    expect(JSON.stringify(dto(declared))).toContain("美容院"); // merge 前: beyond → 候補あり
    const after = dto(declared, [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-5) }]);
    expect(JSON.stringify(after)).not.toContain("美容院"); // done が周期を満たす → within → 出さない
  });
  it("⑩ feedbackCadence 省略/[] → DTO は完全一致（既定挙動不変・default OFF 経路の保証）", () => {
    expect(JSON.stringify(dto(undefined, []))).toBe(JSON.stringify(dto(undefined)));
    expect(dto(undefined).integrationMeta.feedbackCadenceCount).toBe(0);
  });
});

describe("c14 — ⑧ merge 後も 5層cap が効く（最上流契約）", () => {
  it("flood(60 期限) + feedback 併用でも raw cap が merge 後に作動（rawDropped=10・crash なし）", () => {
    const big = Array.from({ length: 60 }, () => ({ categoryId: "tax_filing" as const, deadlineISO: iso(5) }));
    const d = dto({ deadlineObservations: big }, [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-60) }]);
    expect(d.integrationMeta.rawDroppedCount).toBe(10); // 60-50: cap は feedback 合流をすり抜けない
    expect(d.integrationMeta.feedbackCadenceCount).toBe(1);
    expect(JSON.stringify(d)).toContain("美容院"); // merge 自体も有効（cadence は 50 未満で温存）
  });
  it("static: compute 本体で merge 呼び出しが capRawLifeOpsInputs より前（cap pipeline 最上流）", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/lifeops/lifeops-preview-compute.ts"), "utf8");
    // A-4-c17: 本体は computeLifeOpsPreviewModel へ移動（computeLifeOpsPreviewDto は委譲）。
    const body = src.slice(src.indexOf("export function computeLifeOpsPreviewModel"));
    const mergeAt = body.indexOf("mergeCadenceIntoLifeOpsInputs(");
    const capAt = body.indexOf("capRawLifeOpsInputs(");
    expect(mergeAt).toBeGreaterThan(-1);
    expect(capAt).toBeGreaterThan(-1);
    expect(mergeAt).toBeLessThan(capAt);
  });
});

describe("c14 — 配線 contract（page gated read・merge helper は pure）", () => {
  it("merge helper: DB/fetch/server-only/Date.now/notification なし（pure）", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/lifeops/lifeops-feedback-cadence-merge.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    for (const banned of ["supabase", "fetch(", "server-only", "Date.now", "notification", ".insert(", ".update(", ".delete("]) {
      expect(src.toLowerCase()).not.toContain(banned.toLowerCase());
    }
  });
  it("page: gated source→feedbackToCadence→compute 注入が配線され、flag は PLAN_FLAGS（default OFF）経由", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "app/(culcept)/plan/dev-reality-pipeline/page.tsx"), "utf8");
    expect(src).toContain("createLifeOpsFeedbackReadonlySource(");
    expect(src).toContain("feedbackToCadence(");
    expect(src).toContain("PLAN_FLAGS.lifeopsFeedbackReadonly");
    expect(src).toContain("feedbackCadence");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    expect(code.toLowerCase()).not.toContain("service_role"); // comment 除外（「禁止」注記は許容）
    for (const banned of [".insert(", ".update(", ".delete(", ".upsert("]) expect(code).not.toContain(banned); // read-only 維持
  });
});
