import { describe, it, expect } from "vitest";
import {
  projectSeedRowsToPlacements,
  ALLOWED_SEED_COLUMNS,
  FORBIDDEN_SEED_COLUMNS,
  SEED_COLUMNS_SQL,
  SEED_TABLE,
  type ColumnRestrictedSeedRow,
} from "@/lib/plan/reality/integration/seed-column-restricted";
import { buildSeedPlacements, isPlaceable } from "@/lib/plan/reality/seed-placement";
import { generateComplete } from "@/lib/plan/reality/complete-generator";
import type { GovernedNode } from "@/lib/plan/reality/candidate-generator";
import type { PlanItemGovernance } from "@/lib/plan/reality/authority";
import type { PlanSeed } from "@/lib/plan/plan-seed";

function row(p: Partial<ColumnRestrictedSeedRow> = {}): ColumnRestrictedSeedRow {
  return {
    id: "s1",
    user_id: "u1",
    desired_date: null,
    desired_time_hint: null,
    action_shape: null,
    confidence: 0.9,
    status: "active",
    ...p,
  };
}
function gov(p: Partial<PlanItemGovernance> = {}): PlanItemGovernance {
  return { origin: "user", authority: "user_owned", flexibility: "movable", protectionReasons: ["tentative"], ...p };
}
function govNode(id: string, startMin: number, endMin: number): GovernedNode {
  return { id, startMin, endMin, importance: "normal", hard: false, governance: gov() };
}

describe("A1-5-2-1 列契約（structured-only・raw 除外）", () => {
  it("ALLOWED_SEED_COLUMNS は structured fields のみ（signal/desired_action を含まない）", () => {
    // A1-5-11-2: captured_at/expires_at（lifecycle metadata・structured・raw でない）を追加
    expect([...ALLOWED_SEED_COLUMNS]).toEqual(["id", "user_id", "desired_date", "desired_time_hint", "action_shape", "confidence", "status", "captured_at", "expires_at"]);
    expect(ALLOWED_SEED_COLUMNS as readonly string[]).not.toContain("signal");
    expect(ALLOWED_SEED_COLUMNS as readonly string[]).not.toContain("desired_action");
  });
  it("FORBIDDEN_SEED_COLUMNS に signal / desired_action が含まれる", () => {
    expect(FORBIDDEN_SEED_COLUMNS).toContain("signal");
    expect(FORBIDDEN_SEED_COLUMNS).toContain("desired_action");
  });
  it("SEED_COLUMNS_SQL に signal / desired_action / '*' が含まれない", () => {
    expect(SEED_COLUMNS_SQL).not.toContain("signal");
    expect(SEED_COLUMNS_SQL).not.toContain("desired_action");
    expect(SEED_COLUMNS_SQL).not.toContain("*");
    expect(SEED_COLUMNS_SQL).toBe("id, user_id, desired_date, desired_time_hint, action_shape, confidence, status, captured_at, expires_at");
    expect(SEED_TABLE).toBe("plan_seeds"); // 名前のみ（本 module は read しない）
  });
  it("ColumnRestrictedSeedRow は raw field を型に持たない（型レベル）", () => {
    const r = row();
    // @ts-expect-error signal は ColumnRestrictedSeedRow に存在しない
    void r.signal;
    // @ts-expect-error desired_action は ColumnRestrictedSeedRow に存在しない
    void r.desired_action;
    expect(true).toBe(true);
  });
});

describe("A1-5-2-1 projectSeedRowsToPlacements — pure projection", () => {
  it("active のみ変換（consumed/expired/rejected 除外）", () => {
    const out = projectSeedRowsToPlacements([
      row({ id: "a", status: "active" }),
      row({ id: "b", status: "consumed" }),
      row({ id: "c", status: "expired" }),
      row({ id: "d", status: "rejected" }),
      row({ id: "e", status: "active" }),
    ]);
    expect(out.map((p) => p.seedRef)).toEqual(["a", "e"]);
  });

  it("structured fields が写り durationMin=null・durationSource=unknown", () => {
    const out = projectSeedRowsToPlacements([
      row({ id: "s1", desired_date: "2026-06-06", desired_time_hint: "morning", action_shape: "full_go", confidence: 0.9 }),
    ]);
    const p = out[0];
    expect(p.seedRef).toBe("s1");
    expect(p.date).toBe("2026-06-06");
    expect(p.window).toEqual({ band: "morning" });
    expect(p.dispositionHint).toBe("place");
    expect(p.grounding).toBe("strong");
    expect(p.durationMin).toBeNull();
    expect(p.durationSource).toBe("unknown");
  });

  it("全 placement は isPlaceable=false（durationMin null）", () => {
    const out = projectSeedRowsToPlacements([
      row({ id: "s1", desired_date: "2026-06-06", action_shape: "full_go", confidence: 0.95 }),
      row({ id: "s2", action_shape: "bounded_go", confidence: 0.99 }),
    ]);
    expect(out.length).toBe(2);
    expect(out.every(isPlaceable)).toBe(false);
  });

  it("raw 混入 row でも出力に raw が出ない（signal/desired_action は読まれない）", () => {
    const RAW_SIGNAL = "RAW_SIGNAL_カフェで仕事_XYZ";
    const RAW_ACTION = "RAW_ACTION_集中作業_XYZ";
    const dirty = {
      ...row({ id: "s1", desired_date: "2026-06-06", action_shape: "full_go" }),
      signal: RAW_SIGNAL,
      desired_action: RAW_ACTION,
    } as unknown as ColumnRestrictedSeedRow;
    const out = projectSeedRowsToPlacements([dirty]);
    const json = JSON.stringify(out);
    expect(json).not.toContain(RAW_SIGNAL);
    expect(json).not.toContain(RAW_ACTION);
    expect(json).not.toContain("RAW_");
    expect(out[0]?.seedRef).toBe("s1");
  });

  it("不正な desired_time_hint / action_shape は安全側（default）に倒れる", () => {
    const out = projectSeedRowsToPlacements([
      row({ id: "s1", desired_time_hint: "BOGUS", action_shape: "BOGUS" }),
    ]);
    expect(out[0]?.window).toBeUndefined(); // unknown timeHint → 帯なし
    expect(out[0]?.dispositionHint).toBe("place"); // unknown actionShape → 中立 default
  });

  it("buildSeedPlacements と同等 semantics（structured 同一なら同一出力・raw 非依存）", () => {
    const rows: ColumnRestrictedSeedRow[] = [
      row({ id: "a", status: "active", desired_date: "2026-06-06", desired_time_hint: "afternoon", action_shape: "bounded_go", confidence: 0.7 }),
      row({ id: "b", status: "consumed" }),
    ];
    // raw(signal) / source / capturedAt は異なるが buildSeedPlacements は読まない → 出力同一
    const seeds: PlanSeed[] = [
      { id: "a", userId: "u1", signal: "別の生発話", desiredDate: "2026-06-06", desiredTimeHint: "afternoon", actionShape: "bounded_go", confidence: 0.7, status: "active", source: "chat", capturedAt: "2026-01-01" },
      { id: "b", userId: "u1", signal: "別の生発話", confidence: 0.9, status: "consumed", source: "chat", capturedAt: "2026-01-01" },
    ];
    expect(projectSeedRowsToPlacements(rows)).toEqual(buildSeedPlacements(seeds));
  });
});

describe("A1-5-2-1 generateComplete に流しても candidateCount=0", () => {
  it("projection 結果（durationMin null）→ generateComplete は no candidate", () => {
    const placements = projectSeedRowsToPlacements([
      row({ id: "s1", desired_date: "2026-06-06", desired_time_hint: "morning", action_shape: "full_go", confidence: 0.95 }),
    ]);
    const draft = generateComplete({
      placements,
      existing: [govNode("a", 540, 600)],
      activeWindow: { startMin: 480, endMin: 1080 },
      date: "2026-06-06",
      bandBounds: { morning: { startMin: 480, endMin: 720 } },
    });
    expect(draft).toBeNull(); // durationMin null → isPlaceable false → candidateCount 0
  });
});
