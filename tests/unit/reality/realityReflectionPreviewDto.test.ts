/**
 * A-4-c Reflection Preview DTO mapper + compute（pure）unit。
 *   client への唯一の通路 `toReflectionPreviewClientDto` の allowlist/deny と、
 *   `computeReflectionPreviewDto`（A-4-b2 同一 pure chain・新規 read なし）を fixture で固定する。
 *
 * 設計: docs/reality-display-preview-contract-a4-c0.md（§2-§4）。
 */
import { describe, it, expect } from "vitest";
import {
  toReflectionPreviewClientDto,
  LABEL_ALLOWLIST,
  type ReflectionPreviewClientDto,
} from "@/lib/plan/reality/permission/reflection-preview-dto";
import { computeReflectionPreviewDto } from "@/lib/plan/reality/permission/reflection-preview-compute";
import type { ReflectionPreviewResult } from "@/lib/plan/reality/permission/display-apply-preview";
import type { DraftPlan, DraftPlanItem } from "@/lib/plan/draft-plan";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";

// DTO は DraftPlan を含まない＝`title` という語も `display:` も出てはならない（厳格 regex）。
const DTO_FORBIDDEN = /seed_?ref|utterance|personality|trait|title|location|display:|confidence|reason|origin|rigidity|@[a-z]|\b\d{10,}\b|[0-9a-f]{8}-[0-9a-f]{4}/i;

function item(over: Partial<DraftPlanItem> = {}): DraftPlanItem {
  return {
    id: "display:emptyday:2026-06-20:protect:600",
    startTime: "10:00",
    endTime: "11:00",
    title: "集中の時間",
    origin: "rhythm_inferred",
    rigidity: "suggestion",
    reason: "空白の時間の使い方の候補です",
    confidence: 0.3,
    ...over,
  };
}

function draftPlanOf(items: DraftPlanItem[]): DraftPlan {
  return {
    id: "dp:1",
    userId: "fixture",
    date: "2026-06-20",
    level: "candidate",
    items,
    generatedAt: "2026-06-20T00:00:00Z",
    generatedBy: "rule",
    basedOn: { anchorIds: [], seedIds: [] },
    status: "pending",
  };
}

function resultOf(over: { items?: DraftPlanItem[]; reflectedItemCount?: number; reflected?: boolean; stage?: ReflectionPreviewResult["summary"]["stage"]; prepareBlockers?: string[]; preconditionBlockers?: string[]; warnings?: string[]; verdict?: ReflectionPreviewResult["summary"]["preconditionVerdict"] } = {}): ReflectionPreviewResult {
  const items = over.items ?? [item(), item({ id: "display:emptyday:2026-06-20:protect:720", startTime: "12:00", endTime: "13:00", title: "休息" })];
  const count = over.reflectedItemCount ?? items.length;
  return {
    reflected: over.reflected ?? count > 0,
    draftPlan: draftPlanOf(items),
    summary: {
      stage: over.stage ?? "done",
      prepareBlockers: over.prepareBlockers ?? [],
      preconditionVerdict: over.verdict ?? "can_apply",
      preconditionBlockers: over.preconditionBlockers ?? [],
      reflectedItemCount: count,
      warnings: over.warnings ?? [],
    },
  };
}

describe("A-4-c DTO — allowlist 反映", () => {
  it("HH:MM start/end と allowlist label が DTO に出る", () => {
    const dto = toReflectionPreviewClientDto(resultOf());
    expect(dto.items).toEqual([
      { startTime: "10:00", endTime: "11:00", label: "集中の時間" },
      { startTime: "12:00", endTime: "13:00", label: "休息" },
    ]);
    expect(dto.stage).toBe("done");
    expect(dto.preconditionVerdict).toBe("can_apply");
    expect(dto.reflected).toBe(true);
    expect(dto.reflectedItemCount).toBe(2);
  });
  it("allowlist 5 語が固定（A-4-c0 §2）", () => {
    expect([...LABEL_ALLOWLIST].sort()).toEqual(["休息", "余白", "自由時間", "軽い用事の時間", "集中の時間"].sort());
  });
  it("集合外 label は「自由時間」へ強制置換（raw を出さない）", () => {
    const dto = toReflectionPreviewClientDto(resultOf({ items: [item({ title: "歯医者@shibuya" })], reflectedItemCount: 1 }));
    expect(dto.items[0].label).toBe("自由時間");
    expect(JSON.stringify(dto)).not.toContain("shibuya");
  });
  it("reflected 分のみ（既存 fixture item は含めない＝末尾 count 件）", () => {
    const pre = item({ id: "pre:1", startTime: "08:00", endTime: "08:30", title: "余白" });
    const dto = toReflectionPreviewClientDto(resultOf({ items: [pre, item(), item({ startTime: "12:00", title: "休息" })], reflectedItemCount: 2 }));
    expect(dto.items.length).toBe(2);
    expect(dto.items[0].startTime).toBe("10:00"); // pre(08:00) は含まれない
  });
});

describe("A-4-c DTO — deny（実体を落とす）", () => {
  it("item id / confidence / reason / origin / rigidity を持たない（key 集合固定）", () => {
    const dto = toReflectionPreviewClientDto(resultOf());
    for (const it_ of dto.items) {
      expect(Object.keys(it_).sort()).toEqual(["endTime", "label", "startTime"]);
    }
  });
  it("blockers / warnings は count のみ（安定コード列を渡さない）", () => {
    const dto = toReflectionPreviewClientDto(resultOf({ stage: "precondition", verdict: "blocked", reflected: false, reflectedItemCount: 0, items: [], preconditionBlockers: ["permission_blocked", "stale_base_version"], warnings: ["empty_draft"] }));
    expect(dto.blockersCount).toBe(2);
    expect(dto.warningsCount).toBe(1);
    expect(JSON.stringify(dto)).not.toContain("permission_blocked"); // コード列は渡さない
  });
  it("DTO JSON が厳格 FORBIDDEN（title/display:/confidence/UUID 等）に一致しない", () => {
    const dto = toReflectionPreviewClientDto(resultOf());
    expect(JSON.stringify(dto)).not.toMatch(DTO_FORBIDDEN);
  });
  it("DTO top-level key 集合が契約どおり（full DraftPlan/ChangeSet/sourceTrace を持たない）", () => {
    const dto = toReflectionPreviewClientDto(resultOf());
    expect(Object.keys(dto).sort()).toEqual(["blockersCount", "items", "preconditionVerdict", "reflected", "reflectedItemCount", "stage", "warningsCount"].sort());
  });
});

describe("A-4-c compute — A-4-b2 同一 pure chain（新規 read なし）", () => {
  function ws(over: Partial<WorldState> = {}): WorldState {
    return {
      date: "2026-06-20",
      nowMinute: 540,
      todaySchedule: [],
      availableWindows: [{ startMinute: 540, endMinute: 840, meaning: null }],
      context: null,
      mobility: null,
      permissionLevel: 3,
      ...over,
    };
  }
  it("窓あり fixture world → DTO（stage=done・items>0・HH:MM）", () => {
    const dto = computeReflectionPreviewDto({ world: ws(), memoryItems: [], date: "2026-06-20", nowMs: 1_000_000 });
    expect(dto).not.toBeNull();
    expect(dto!.stage).toBe("done");
    expect(dto!.reflected).toBe(true);
    expect(dto!.items.length).toBe(dto!.reflectedItemCount);
    expect(dto!.items.every((i) => /^\d{2}:\d{2}$/.test(i.startTime))).toBe(true);
    expect(dto!.items.every((i) => LABEL_ALLOWLIST.has(i.label))).toBe(true);
  });
  it("窓なし world → null（組めない日・捏造しない）", () => {
    const dto = computeReflectionPreviewDto({ world: ws({ availableWindows: [] }), memoryItems: [], date: "2026-06-20", nowMs: 1_000_000 });
    expect(dto).toBeNull();
  });
  it("compute 出力も厳格 FORBIDDEN 不一致（display: id を漏らさない）", () => {
    const dto = computeReflectionPreviewDto({ world: ws(), memoryItems: [], date: "2026-06-20", nowMs: 1_000_000 });
    expect(JSON.stringify(dto)).not.toMatch(DTO_FORBIDDEN);
  });
});
