/**
 * Stage 2 L2-k — urgentMemoryPriority test
 *
 * plan v0.3 §5.11 Gate:
 *   - urgent 起動時に memory surface が降格 or 縮退 (§8.6.2 使い分け)
 *   - urgent + S7 同居禁止 (§8.6.3)
 */

import { describe, it, expect } from "vitest";

import {
  FORBIDDEN_COEXISTENCES,
  checkCoexistence,
  resolveMemoryPresence,
} from "@/lib/coalter/presence/urgentMemoryPriority";

describe("L2-k urgentMemoryPriority — §8.6.3 5 同時出現禁止組み合わせ", () => {
  it("FORBIDDEN_COEXISTENCES は 5 件", () => {
    expect(FORBIDDEN_COEXISTENCES).toHaveLength(5);
  });

  it("① memory drawer 開放中 + urgent dominant_card → 違反 (index 0)", () => {
    const r = checkCoexistence({
      urgentActive: true,
      urgentForm: "dominant_card",
      memoryDrawerOpen: true,
      presenceState: "S5",
    });
    expect(r.ok).toBe(false);
    expect(r.violationIndex).toBe(0);
  });

  it("② urgent + memory batch 更新キュー → 違反 (index 1)", () => {
    const r = checkCoexistence({
      urgentActive: true,
      memoryBatchUpdatePending: true,
      presenceState: "S5",
    });
    expect(r.ok).toBe(false);
    expect(r.violationIndex).toBe(1);
  });

  it("③ 複数 urgent 重ね → 違反 (index 2)", () => {
    const r = checkCoexistence({
      urgentActive: true,
      anotherUrgentActive: true,
      presenceState: "S5",
    });
    expect(r.ok).toBe(false);
    expect(r.violationIndex).toBe(2);
  });

  it("④ urgent dominant_card 内 memory inline_reference → 違反 (index 3)", () => {
    const r = checkCoexistence({
      urgentActive: true,
      urgentForm: "dominant_card",
      memoryInlineRefInUrgent: true,
      presenceState: "S5",
    });
    expect(r.ok).toBe(false);
    expect(r.violationIndex).toBe(3);
  });

  it("⑤ urgent + S7 同居 → 違反 (index 4)", () => {
    const r = checkCoexistence({
      urgentActive: true,
      urgentForm: "overlay_banner",
      presenceState: "S7",
    });
    expect(r.ok).toBe(false);
    expect(r.violationIndex).toBe(4);
  });

  it("urgent 非 active なら全パターン OK", () => {
    const r = checkCoexistence({
      urgentActive: false,
      urgentForm: "dominant_card",
      memoryDrawerOpen: true,
      memoryBatchUpdatePending: true,
      anotherUrgentActive: true,
      presenceState: "S7",
    });
    expect(r.ok).toBe(true);
  });

  it("urgent active + 違反条件なし → OK", () => {
    const r = checkCoexistence({
      urgentActive: true,
      urgentForm: "overlay_banner",
      presenceState: "S5",
    });
    expect(r.ok).toBe(true);
  });
});

describe("L2-k urgentMemoryPriority — resolveMemoryPresence (§8.6.1 / §8.6.2)", () => {
  it("urgent 非 active → primary (memory が主、§8.6.1 平常時)", () => {
    expect(resolveMemoryPresence(false, null)).toBe("primary");
  });

  it("urgent active + demote → demoted (§8.6.2 短時間 / 非競合)", () => {
    expect(resolveMemoryPresence(true, "demote")).toBe("demoted");
  });

  it("urgent active + compact → compacted (§8.6.2 長時間 / 競合)", () => {
    expect(resolveMemoryPresence(true, "compact")).toBe("compacted");
  });

  it("urgent active + fallback null → 防御的 compacted (主役性確保)", () => {
    expect(resolveMemoryPresence(true, null)).toBe("compacted");
  });
});
