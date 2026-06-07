/**
 * A1-6-5b Consumed Seed → DraftPlan Reflection — pure/no-run tests
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.7
 *
 * consumed seed → 確定 plan item（pure・raw 不使用・generic label）:
 *   二層モデル（active=候補/surface・consumed=確定 plan item）/ consumed のみ guard / band→time 既定 / generic 非断定 label。
 *   active/expired/rejected を誤って item 化しない。output に seedRef/UUID/raw/source_ref を出さない。DB write 0。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  isConsumedReflectable,
  bandDefaultStartMin,
  buildGenericPlanLabel,
  consumedSeedToPlanItem,
  selectConsumedPlanItems,
  type ConsumedSeedReflectInput,
} from "@/lib/plan/reality/consumed-seed-reflection";
import type { PlanSeedStatus } from "@/lib/plan/plan-seed";
import type { ActionShape } from "@/lib/stargazer/alterHomeAdapter";

const consumed = (over: Partial<ConsumedSeedReflectInput> = {}): ConsumedSeedReflectInput => ({
  status: "consumed",
  durationMin: 60,
  date: "2026-06-07",
  band: "afternoon",
  ...over,
});

describe("A1-6-5b isConsumedReflectable — consumed ∧ duration>0 のみ（fail-closed）", () => {
  it("consumed + duration>0 → true", () => {
    expect(isConsumedReflectable(consumed())).toBe(true);
  });
  it("active / expired / rejected → false（誤って item 化しない）", () => {
    for (const status of ["active", "expired", "rejected"] as PlanSeedStatus[]) {
      expect(isConsumedReflectable(consumed({ status }))).toBe(false);
    }
  });
  it("consumed でも duration null/0 → false", () => {
    expect(isConsumedReflectable(consumed({ durationMin: null }))).toBe(false);
    expect(isConsumedReflectable(consumed({ durationMin: 0 }))).toBe(false);
  });
});

describe("A1-6-5b bandDefaultStartMin — band 既定（pure default）", () => {
  it("morning=540 / afternoon=780 / evening=1080 / anytime(null)=720", () => {
    expect(bandDefaultStartMin("morning")).toBe(540);
    expect(bandDefaultStartMin("afternoon")).toBe(780);
    expect(bandDefaultStartMin("evening")).toBe(1080);
    expect(bandDefaultStartMin(null)).toBe(720);
  });
});

describe("A1-6-5b buildGenericPlanLabel — generic・非断定（raw 不使用）", () => {
  it("band + duration の構造のみ", () => {
    expect(buildGenericPlanLabel(consumed({ band: "afternoon", durationMin: 60 }))).toBe("午後の予定（60分）");
    expect(buildGenericPlanLabel(consumed({ band: "morning", durationMin: 30 }))).toBe("午前の予定（30分）");
    expect(buildGenericPlanLabel(consumed({ band: "evening", durationMin: 90 }))).toBe("夜の予定（90分）");
  });
  it("anytime(band null) → 帯なし「予定（…分）」", () => {
    expect(buildGenericPlanLabel(consumed({ band: null, durationMin: 45 }))).toBe("予定（45分）");
  });
  it("actionShape → 非断定コミットメント修飾（approach のみ・活動内容は断定しない）", () => {
    expect(buildGenericPlanLabel(consumed({ actionShape: "bounded_go" }))).toBe("午後の予定（60分・短め）");
    expect(buildGenericPlanLabel(consumed({ actionShape: "trial_then_decide" }))).toBe("午後の予定（60分・お試し）");
    expect(buildGenericPlanLabel(consumed({ actionShape: "prepare_then_go" }))).toBe("午後の予定（60分・準備して）");
  });
  it("full_go / observe_first / delegate_or_request / defer_with_trigger / skip → 修飾なし（断定しない）", () => {
    for (const s of ["full_go", "observe_first", "delegate_or_request", "defer_with_trigger", "skip"] as ActionShape[]) {
      expect(buildGenericPlanLabel(consumed({ actionShape: s }))).toBe("午後の予定（60分）");
    }
  });
});

describe("A1-6-5b consumedSeedToPlanItem — 確定 plan item（guard + display-safe）", () => {
  it("consumed → 確定 item（label/start/end/date/band/confirmed・seedRef なし）", () => {
    expect(consumedSeedToPlanItem(consumed({ band: "afternoon", durationMin: 60, date: "2026-06-07" }))).toEqual({
      label: "午後の予定（60分）",
      startMin: 780,
      endMin: 840,
      date: "2026-06-07",
      band: "afternoon",
      confirmed: true,
    });
  });
  it("anytime(null band) → 正午配置（720）", () => {
    expect(consumedSeedToPlanItem(consumed({ band: null, durationMin: 30 }))?.startMin).toBe(720);
  });
  it("非 consumed（active/expired/rejected）→ null（誤って item 化しない）", () => {
    for (const status of ["active", "expired", "rejected"] as PlanSeedStatus[]) {
      expect(consumedSeedToPlanItem(consumed({ status }))).toBeNull();
    }
  });
  it("duration 無 → null", () => {
    expect(consumedSeedToPlanItem(consumed({ durationMin: null }))).toBeNull();
  });
  it("end は MAX_DAY_MIN(1440) で clamp", () => {
    expect(consumedSeedToPlanItem(consumed({ band: "evening", durationMin: 600 }))?.endMin).toBe(1440); // 1080+600=1680→1440
  });
});

describe("A1-6-5b selectConsumedPlanItems — consumed のみ（二層分離・active は surface 側に残す）", () => {
  it("混在入力 → consumed のみ item 化（active/expired/rejected 除外）", () => {
    const items = selectConsumedPlanItems([
      consumed({ status: "active" }), // 候補・surface 側 → 除外
      consumed({ status: "consumed", band: "morning", durationMin: 30 }),
      consumed({ status: "rejected" }), // 除外
      consumed({ status: "consumed", band: "evening", durationMin: 45 }),
      consumed({ status: "expired" }), // 除外
    ]);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.band)).toEqual(["morning", "evening"]);
    expect(items.every((i) => i.confirmed === true)).toBe(true);
  });
});

describe("A1-6-5b redaction / 非断定", () => {
  it("output に seedRef / UUID / raw / source_ref を出さない", () => {
    const json = JSON.stringify(selectConsumedPlanItems([consumed()]));
    for (const leak of ["seedRef", "source_ref", "raw"]) expect(json).not.toContain(leak);
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });
  it("label は構造のみ（活動内容を断定しない・raw 英字なし）", () => {
    const label = buildGenericPlanLabel(consumed({ band: "afternoon", durationMin: 60 }));
    expect(label).toBe("午後の予定（60分）");
    expect(label).not.toMatch(/[A-Za-z]/); // raw 英字（活動名）なし
  });
});

describe("A1-6-5b 静的安全（pure・no-DB・no-raw）", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/consumed-seed-reflection.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  it("DB/Supabase/network/server-only/raw/source_ref/generateComplete を持たない", () => {
    for (const t of ["createClient", "@supabase", ".from(", ".rpc(", "fetch(", "Date.now", "server-only", "source_ref", "generateComplete", "external_anchor", "process.env"]) {
      expect(code).not.toContain(t);
    }
  });
  it("barrel(reality/index.ts) が consumed-seed-reflection を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/index.ts"), "utf8");
    expect(idx).not.toContain("consumed-seed-reflection");
  });
});
