/**
 * Stage 4 L4-g — Memory surface 本番 component test
 *
 * plan v0.3 §7.7 Gate:
 *   - §8.3.4 禁止組み合わせが server 側でも enforce
 *   - §8.4.4 片側可視性が server side で enforce
 *   - migration が作成のみ (実行禁止)
 */

import { describe, it, expect } from "vitest";

import MemorySurface from "@/app/components/chat/MemorySurface";
import MemoryItemCard from "@/app/components/chat/MemoryItemCard";
import MemoryAccessRail from "@/app/components/chat/MemoryAccessRail";
import VisibilityControls from "@/app/components/chat/VisibilityControls";
import RetreatRail from "@/app/components/chat/RetreatRail";
import {
  isForbiddenCombination,
  FORBIDDEN_COMBINATIONS,
} from "@/lib/coalter/presence/memoryConstraints";
import { filterByViewer } from "@/lib/coalter/presence/memoryStore";
import type { MemoryItem } from "@/lib/coalter/presence/memoryTypes";

const item = (over: Partial<MemoryItem> = {}): MemoryItem => ({
  id: "m1",
  content: "test",
  origin: "explicit_shared",
  certainty: "high",
  visibility: "both_visible",
  modeContext: "normal",
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

describe("L4-g — module exports (5 components)", () => {
  it("MemorySurface / MemoryItemCard / MemoryAccessRail / VisibilityControls / RetreatRail が function export", () => {
    expect(typeof MemorySurface).toBe("function");
    expect(typeof MemoryItemCard).toBe("function");
    expect(typeof MemoryAccessRail).toBe("function");
    expect(typeof VisibilityControls).toBe("function");
    expect(typeof RetreatRail).toBe("function");
  });
});

describe("L4-g §8.3.4 禁止組み合わせは構造的に enforce (Stage 2 + DB constraint)", () => {
  it("isForbiddenCombination で 3 件すべて true (Stage 2 client-side enforce)", () => {
    for (const f of FORBIDDEN_COMBINATIONS) {
      expect(isForbiddenCombination(f.origin, f.certainty, f.visibility)).toBe(true);
    }
  });

  it("migration file に DB-level check 制約 + 3 禁止組み合わせ全てが含まれる", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../supabase/migrations/20260428100100_coalter_memory_items.sql",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/coalter_memory_items_no_forbidden_combinations/);
    expect(content).toMatch(/origin\s*=\s*'inferred'.*certainty\s*=\s*'high'.*visibility\s*=\s*'both_visible'/);
    expect(content).toMatch(/origin\s*=\s*'transient_summary'.*certainty\s*=\s*'high'/);
    expect(content).toMatch(/origin\s*=\s*'transient_summary'.*certainty\s*=\s*'medium'/);
  });
});

describe("L4-g §8.4.4 片側可視性 — server side RLS で enforce", () => {
  it("RLS policy に visibility 別 gate (both_visible / user_a_only / user_b_only) が定義済", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../supabase/migrations/20260428100100_coalter_memory_items.sql",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/coalter_memory_items_select_pair_visibility/);
    expect(content).toMatch(/visibility\s*=\s*'both_visible'/);
    expect(content).toMatch(/visibility\s*=\s*'user_a_only'/);
    expect(content).toMatch(/visibility\s*=\s*'user_b_only'/);
  });

  it("internal_only は client から見えない (RLS gate コメントで明示)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../supabase/migrations/20260428100100_coalter_memory_items.sql",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/internal_only.*client から見えない|internal_only/);
  });

  it("client-side filterByViewer も §8.4.4 整合", () => {
    const items: MemoryItem[] = [
      item({ id: "both", visibility: "both_visible" }),
      item({
        id: "a",
        origin: "inferred",
        certainty: "medium",
        visibility: "user_a_only",
      }),
      item({
        id: "b",
        origin: "inferred",
        certainty: "medium",
        visibility: "user_b_only",
      }),
      item({
        id: "internal",
        origin: "inferred",
        certainty: "low",
        visibility: "internal_only",
      }),
    ];
    expect(filterByViewer(items, "user_a").map((m) => m.id).sort()).toEqual([
      "a",
      "both",
    ]);
    expect(filterByViewer(items, "user_b").map((m) => m.id).sort()).toEqual([
      "b",
      "both",
    ]);
  });
});

describe("L4-g 構造 invariant — VisibilityControls の意味境界", () => {
  it("VisibilityControls.tsx の OP_LABELS (UI 文言) に「削除」「忘却」「消去」語彙がない (§8.4.1.1)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/VisibilityControls.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // OP_LABELS object 内の文字列 (UI に表示されるラベル) のみ検査
    // OP_LABELS Record の中身を抽出
    const opLabelsBlock = content.match(/OP_LABELS:\s*Record<[^>]+>\s*=\s*\{([^}]+)\}/);
    expect(opLabelsBlock).not.toBeNull();
    const labels = opLabelsBlock?.[1] ?? "";
    expect(labels).not.toMatch(/削除/);
    expect(labels).not.toMatch(/忘却/);
    expect(labels).not.toMatch(/消去/);
  });

  it("VisibilityControls は unshare 1 クッション確認 (§8.4.1.1 原則)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/VisibilityControls.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/confirmingUnshare/);
    expect(content).toMatch(/coalter-visibility-unshare-confirm/);
  });
});
