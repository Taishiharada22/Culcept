/**
 * E1 hero — evaluateHeroAnchorFeasibility / presenter / reader / composeHeroCanarySurface
 *   時間的成立(feasible/caution/unknown)・column-restricted・privacy(raw 非露出)・fail-open。
 */
import { describe, it, expect } from "vitest";
import {
  evaluateHeroAnchorFeasibility,
  presentHeroAnchorReadout,
  createSupabaseHeroAnchorReader,
  composeHeroCanarySurface,
} from "@/lib/plan/realityPipeline/heroAnchorFeasibility";
import type { ColumnRestrictedAnchorRow, SupabaseLikeClient } from "@/lib/plan/reality/integration/dev-runtime-adapter";

function row(id: string, start: string, end: string | null, rigidity: "hard" | "soft" = "soft"): ColumnRestrictedAnchorRow {
  return { id, start_time: start, end_time: end, rigidity, sensitive_category: null };
}

describe("evaluateHeroAnchorFeasibility — 時間的成立(honest)", () => {
  it("単独 → feasible(standalone)", () => {
    const r = evaluateHeroAnchorFeasibility([row("a", "10:00", "11:00")], "a");
    expect(r.status).toBe("feasible");
    expect(r.reasonCodes).toEqual(["standalone"]);
    expect(r.confidence).toBe("low");
  });
  it("重なり → caution(overlap_conflict)", () => {
    const r = evaluateHeroAnchorFeasibility([row("a", "10:00", "11:00"), row("b", "10:30", "11:30")], "a");
    expect(r.status).toBe("caution");
    expect(r.reasonCodes).toEqual(["overlap_conflict"]);
  });
  it("近接<15分 → caution(tight_adjacency)", () => {
    const r = evaluateHeroAnchorFeasibility([row("a", "10:00", "11:00"), row("b", "11:10", "12:00")], "a");
    expect(r.status).toBe("caution");
    expect(r.reasonCodes).toEqual(["tight_adjacency"]);
  });
  it("余白十分 → feasible(has_room)", () => {
    const r = evaluateHeroAnchorFeasibility([row("a", "10:00", "11:00"), row("b", "14:00", "15:00")], "a");
    expect(r.status).toBe("feasible");
    expect(r.reasonCodes).toEqual(["has_room"]);
  });
  it("target 不在 / 時刻不正 → unknown(insufficient_time_data)", () => {
    expect(evaluateHeroAnchorFeasibility([row("a", "10:00", "11:00")], "zzz").status).toBe("unknown");
    expect(evaluateHeroAnchorFeasibility([row("a", "bogus", null)], "a").isUnknown).toBe(true);
  });
  it("ISO 文字列の開始時刻も解釈する", () => {
    const r = evaluateHeroAnchorFeasibility([row("a", "2026-06-29T10:00:00+09:00", "2026-06-29T11:00:00+09:00")], "a");
    expect(r.status).toBe("feasible");
  });
});

describe("presentHeroAnchorReadout — 決定的写像・raw 非露出", () => {
  it("feasible/has_room を日本語化", () => {
    const vm = presentHeroAnchorReadout(evaluateHeroAnchorFeasibility([row("a", "10:00", "11:00"), row("b", "14:00", "15:00")], "a"));
    expect(vm.statusLabel).toContain("成立");
    expect(vm.reasonText).toContain("前後の予定との間に余裕があります");
    expect(vm.isUnknown).toBe(false);
  });
  it("reasonCode 生値や raw を VM に出さない", () => {
    const vm = presentHeroAnchorReadout(evaluateHeroAnchorFeasibility([row("a", "10:00", "11:00"), row("b", "10:30", "11:30")], "a"));
    const json = JSON.stringify(vm);
    expect(json).not.toContain("overlap_conflict");
    expect(json).not.toContain("start_time");
    expect(json).not.toContain("sensitive_category");
  });
});

describe("reader / composeHeroCanarySurface — column-restricted・fail-open", () => {
  function mockClient(rows: ColumnRestrictedAnchorRow[], opts: { error?: boolean } = {}): SupabaseLikeClient {
    let selectedColumns = "";
    return {
      from() {
        return {
          select(columns: string) {
            selectedColumns = columns;
            return {
              async eq() {
                if (opts.error) return { data: null, error: { message: "boom" } };
                return { data: rows, error: null };
              },
            };
          },
        };
      },
      // テスト補助: 直近 SELECT 句を露出（許可列のみか検証）
      _selected: () => selectedColumns,
    } as unknown as SupabaseLikeClient;
  }

  it("SELECT は許可列のみ（title/location を含まない）", async () => {
    const client = mockClient([row("a", "10:00", "11:00")]);
    const reader = createSupabaseHeroAnchorReader(client);
    await reader.readColumnRestrictedAnchors("u1");
    const sql = (client as unknown as { _selected: () => string })._selected();
    expect(sql).toContain("start_time");
    expect(sql).not.toContain("title");
    expect(sql).not.toContain("location");
  });
  it("error → fail-open [] → composer は unknown surface", async () => {
    const reader = createSupabaseHeroAnchorReader(mockClient([], { error: true }));
    const vm = await composeHeroCanarySurface(reader, "u1", "a");
    expect(vm.isUnknown).toBe(true);
  });
  it("正常 read → target の hero surface", async () => {
    const reader = createSupabaseHeroAnchorReader(mockClient([row("a", "10:00", "11:00"), row("b", "14:00", "15:00")]));
    const vm = await composeHeroCanarySurface(reader, "u1", "a");
    expect(vm.statusLabel).toContain("成立");
    expect(vm.isUnknown).toBe(false);
  });
});
