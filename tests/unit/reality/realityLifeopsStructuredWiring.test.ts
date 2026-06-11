/**
 * A-4-c29 — Structured Source Reader Read-only Wiring（pure + fake・実 write 0）unit。
 *   GPT 16 lock の c29 新規分: pipeline 合流（DB row→DTO→normalizer→inputs→cap→collector→sparse policy→card）・
 *   compute channel（capRaw 前合流・0 件 no-op・cap 作動）・meta counts・model helper 配線 static・scoped DB 型。
 *   （gate/query 0/column 固定/active のみ/normalizer drop 系は c27 test で既 lock＝重複させない）
 *
 * 設計: docs/life-ops-structured-storage-a4-c27-mini-design.md / c29 GO。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { computeLifeOpsPreviewModel } from "@/lib/plan/reality/lifeops/lifeops-preview-compute";
import { buildLifeOpsMainlineCardDto } from "@/lib/plan/reality/lifeops/lifeops-mainline-card";
import {
  rowsToStructuredSources,
  type LifeOpsStructuredSourceRow,
  type LifeOpsStructuredSourcesTable,
} from "@/lib/plan/reality/lifeops/lifeops-structured-storage";
import { resolveEffectiveLifeOpsSourceMode } from "@/lib/plan/reality/lifeops/lifeops-source-policy";
import { LIFEOPS_SPARSE_FALLBACK_PHRASE } from "@/lib/plan/reality/lifeops/lifeops-mainline-card";
import { structuredDeadlinesToObservations, structuredCadenceToObservations } from "@/lib/plan/reality/lifeops/lifeops-structured-source";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";
import type { DeadlineObservation } from "@/lib/lifeops/deadline-engine";
import type { CadenceObservation } from "@/lib/lifeops/candidate-types";

const NOW_MS = Date.parse("2026-06-10T09:00:00+09:00");
const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (d: number) => new Date(NOW_MS + d * DAY_MS).toISOString();
const FORBIDDEN_TYPE_FIELDS = ["free_text", "title", "note", "memo", "description", "place_query", "url", "raw", "source_ref", "calendar_title", "event_name", "store_name", "location_name"];

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
const model = (structuredDeadlines?: readonly DeadlineObservation[], structuredCadence?: readonly CadenceObservation[]) =>
  computeLifeOpsPreviewModel({ world: ws(), date: "2026-06-10", nowMinute: 800, nowMs: NOW_MS, inputs: {}, structuredDeadlines, structuredCadence });

const deadlineRow = (over: Partial<LifeOpsStructuredSourceRow> = {}): LifeOpsStructuredSourceRow => ({
  source_type: "deadline", category_id: "tax_filing", menu: null, due_at: iso(5),
  last_completed_at: null, typical_interval_days: null, occurrence_key: null, confidence: "high", status: "active", ...over,
});

describe("c29 — pipeline 合流（row→DTO→normalizer→inputs→card）", () => {
  it("DB row（fake）→ 正規化 → real_only pipeline → 確定申告が mainline card に出る（full chain）", () => {
    const split = rowsToStructuredSources([deadlineRow()]);
    const m = model(structuredDeadlinesToObservations(split.deadlines));
    const card = buildLifeOpsMainlineCardDto(m, "real_only");
    expect(card).not.toBeNull();
    expect(card!.items.map((i) => i.label)).toEqual(["確定申告"]);
    expect(m.dto.integrationMeta.structuredDeadlineCount).toBe(1);
  });
  it("cadence row → 正規化 → sparse fallback で美容院が card に出る（push tier のみでも）", () => {
    const split = rowsToStructuredSources([
      deadlineRow({ source_type: "cadence", category_id: "beauty_salon", menu: "cut", due_at: null, last_completed_at: iso(-60) }),
    ]);
    const m = model(undefined, structuredCadenceToObservations(split.cadences));
    expect(m.dto.integrationMeta.structuredCadenceCount).toBe(1);
    const card = buildLifeOpsMainlineCardDto(m, "real_only");
    expect(card).not.toBeNull();
    expect(card!.items[0].label).toBe("美容院");
  });
  it("0 件は no-op（DTO 完全一致・counts 0）", () => {
    expect(JSON.stringify(model([], []).dto)).toBe(JSON.stringify(model().dto));
    expect(model().dto.integrationMeta.structuredDeadlineCount).toBe(0);
    expect(model().dto.integrationMeta.structuredCadenceCount).toBe(0);
  });
  it("merge 後も raw cap が効く（structured deadline flood 60 → rawDropped=10）", () => {
    const flood = Array.from({ length: 60 }, () => ({ categoryId: "tax_filing", deadlineISO: iso(5) }));
    expect(model(flood).dto.integrationMeta.rawDroppedCount).toBe(10);
  });
  it("structured cadence は latest 勝ち merge（同 key の古い structured は新しい既存に負ける）", () => {
    const m = computeLifeOpsPreviewModel({
      world: ws(), date: "2026-06-10", nowMinute: 800, nowMs: NOW_MS,
      inputs: { cadenceObservations: [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-5) }] }, // 既存が新しい（done 済み相当）
      structuredCadence: [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-60) }], // 古い structured
    });
    expect(JSON.stringify(m.dto)).not.toContain("美容院"); // -5d が勝ち=周期内=候補なし
  });
});

describe("c29 — model helper / smoke / 型（配線 static）", () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  it("mainline model helper: gated reader → normalizer → compute channel の配線（page/actions は helper 共有済み）", () => {
    const src = read("lib/plan/reality/lifeops/lifeops-mainline-model.ts");
    expect(src).toContain("createLifeOpsStructuredSourceReadonlySource");
    expect(src).toContain("PLAN_FLAGS.lifeopsStructuredSourceReadonly");
    expect(src).toContain("structuredDeadlinesToObservations");
    expect(src).toContain("structuredCadenceToObservations");
    expect(src).toContain("structuredDeadlines,");
    expect(src).toContain("structuredCadence,");
    expect(src).toContain("resolveEffectiveLifeOpsSourceMode"); // ★c34b: 実効 mode（登録済み→fixture 退役）
  });
  it("★c34b 再現: staging（fixture_allowed）+ 登録 cadence（眉）→ 実効 real_only → fallback で card に眉が出る", () => {
    // CEO smoke の実シナリオ: fixture が代表を占有して眉が出なかった盲点の修正を、本物の経路で lock。
    const split = rowsToStructuredSources([
      deadlineRow({ source_type: "cadence", category_id: "eyebrow", menu: null, due_at: null, last_completed_at: iso(-35) }),
    ]);
    const structuredCadence = structuredCadenceToObservations(split.cadences);
    const effective = resolveEffectiveLifeOpsSourceMode("fixture_allowed", structuredCadence.length > 0);
    expect(effective).toBe("real_only"); // fixture 退役
    const m = computeLifeOpsPreviewModel({
      world: ws(), date: "2026-06-10", nowMinute: 800, nowMs: NOW_MS,
      inputs: {}, // 実効 real_only の base（mainline model と同じ式）
      structuredCadence,
    });
    expect(JSON.stringify(m.dto)).not.toContain("確定申告"); // fixture は出ない
    const card = buildLifeOpsMainlineCardDto(m, effective);
    expect(card).not.toBeNull();
    expect(card!.items.length).toBe(1);
    expect(card!.items[0].label).toBe("眉"); // 28d 周期×35d 経過=beyond → fallback 代表
    expect(card!.items[0].phrase).toBe(LIFEOPS_SPARSE_FALLBACK_PHRASE.cycle); // 低圧文言
  });
  it("smoke script: c29 structured section（gate matrix + normalized counts・counts のみ）", () => {
    const src = read("scripts/lifeops-feedback-readonly-smoke.ts");
    expect(src).toContain("isLifeOpsStructuredSourceReadAllowed");
    expect(src).toContain("readSources()");
    expect(src).toContain("normalized: deadline=");
  });
  it("scoped DB 型: Row=13 列（migration 1:1）・forbidden field は型にも不存在", () => {
    const row: LifeOpsStructuredSourcesTable["Row"] = {
      id: "x", user_id: "u", source_type: "deadline", category_id: "tax_filing", menu: null,
      due_at: iso(5), last_completed_at: null, typical_interval_days: null, occurrence_key: null,
      confidence: "high", status: "active", created_at: iso(0), updated_at: iso(0),
    };
    expect(Object.keys(row).length).toBe(13);
    const src = read("lib/plan/reality/lifeops/lifeops-structured-storage.ts");
    for (const f of FORBIDDEN_TYPE_FIELDS) expect(src).not.toMatch(new RegExp(`readonly ${f}[?:]`));
  });
});
