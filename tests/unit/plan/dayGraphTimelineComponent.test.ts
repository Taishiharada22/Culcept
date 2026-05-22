/**
 * Phase 3-K-3a — DayGraphTimeline component module import + structural test
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md K-3 設計提案
 *
 * 検証方針:
 *   @testing-library/react が project に存在しないため、
 *   既存 codebase pattern (= ProposalChip module import test) を踏襲。
 *   render 検証は presentation helper test (= dayGraphTimelinePresentation.test.ts)
 *   で完結させ、 本 file は **module shape の machinable 検証** に集中。
 *
 * 検証範囲:
 *   - module が default export ではなく named export
 *   - DayGraphTimeline が function (= component) として export
 *   - DayGraphTimelineProps interface 経由で型整合
 *   - 内部で applyDayGraphView を呼ぶ helper を再 import している (= shared_view 動作保証)
 *   - file 内容 grep で禁止 pattern が含まれない (= warning color / aura class / amber)
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Module import
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("DayGraphTimeline component module import", () => {
  it("named export 'DayGraphTimeline' が function として存在", async () => {
    const mod = await import(
      "@/app/(culcept)/plan/components/DayGraphTimeline"
    );
    expect(typeof mod.DayGraphTimeline).toBe("function");
  });

  it("default export が存在しない (= named export 強制)", async () => {
    const mod = await import(
      "@/app/(culcept)/plan/components/DayGraphTimeline"
    );
    // default export を export していない設計
    expect((mod as Record<string, unknown>).default).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Structural grep (= file-level invariants)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PATH = "app/(culcept)/plan/components/DayGraphTimeline.tsx";
const content = readFileSync(PATH, "utf-8");

describe("DayGraphTimeline component — structural invariants", () => {
  it("'use client' directive (= Client Component)", () => {
    expect(content).toMatch(/^["']use client["'];/);
  });

  it("buildTimelineView を import している (= presentation helper 経由)", () => {
    expect(content).toMatch(
      /import\s+\{[\s\S]*?buildTimelineView[\s\S]*?\}\s+from\s+["']@\/lib\/plan\/dayGraph\/dayGraphTimelinePresentation["']/,
    );
  });

  it("result === null guard (= props.result が null なら早期 return)", () => {
    expect(content).toMatch(/if\s*\(\s*!\s*props\.result\s*\)\s*return\s+null/);
  });

  it("EventNode は <button> として render (= a11y、 keyboard 対応)", () => {
    expect(content).toMatch(/<button/);
  });

  it("StartNode / EndNode / GapNode は <li> + data-testid prefix 'day-graph-' で render (= No Action UI)", () => {
    // BoundaryItem は template literal `day-graph-${node.kind}` で生成 (start / end)
    expect(content).toMatch(/data-testid=\{`day-graph-\$\{node\.kind\}`\}/);
    expect(content).toMatch(/data-testid=["']day-graph-gap["']/);
  });

  it("MovementTransition は data-testid='day-graph-transition' で render", () => {
    expect(content).toMatch(/data-testid=["']day-graph-transition["']/);
  });

  it("role='list' on top-level + role='listitem' on items (= a11y)", () => {
    expect(content).toMatch(/role=["']list["']/);
    expect(content).toMatch(/role=["']listitem["']/);
  });

  it("color discipline: amber / orange / red / yellow / rose 未使用", () => {
    // K-3a CEO 補正 4: neutral slate のみ
    expect(content).not.toMatch(/amber-/);
    expect(content).not.toMatch(/orange-/);
    expect(content).not.toMatch(/text-red-/);
    expect(content).not.toMatch(/bg-red-/);
    expect(content).not.toMatch(/border-red-/);
    expect(content).not.toMatch(/yellow-/);
    expect(content).not.toMatch(/rose-/);
  });

  it("No aura / blur class (= sensitive 強調禁止、 CEO 補正 3)", () => {
    // sensitive 強調を component file 内で直接適用しない
    // (presentation helper の className 内でも禁止だが、 ここでは component 側 確認)
    expect(content).not.toMatch(/blur-/);
    expect(content).not.toMatch(/shadow-inner/);
    expect(content).not.toMatch(/animate-pulse/);
  });

  it("予測 / 推奨 / 最適化 文言を含まない", () => {
    expect(content).not.toMatch(/予測/);
    expect(content).not.toMatch(/推奨/);
    expect(content).not.toMatch(/最適化/);
    expect(content).not.toMatch(/警告/);
    expect(content).not.toMatch(/予想/);
    expect(content).not.toMatch(/(?<!Negative\s)Capability/); // Negative Capability is OK
  });

  it("「Alter が〜」 文言を含まない (= No-AI-Subject)", () => {
    expect(content).not.toMatch(/Alter が/);
    expect(content).not.toMatch(/Alter は/);
  });

  it("onEventClick は anchorId のみ渡す (= raw anchor object 渡さない)", () => {
    // onEventClick callback の type は (anchorId: string) => void
    expect(content).toMatch(/onEventClick\?:\s*\(anchorId:\s*string\)/);
  });

  it("internal state (useState / useReducer) を使用しない (= pure presentational)", () => {
    expect(content).not.toMatch(/useState\b/);
    expect(content).not.toMatch(/useReducer\b/);
    expect(content).not.toMatch(/useEffect\b/);
  });

  it("Transport / Arrival Risk Memory に依存しない", () => {
    expect(content).not.toMatch(/transport/i);
    expect(content).not.toMatch(/arrivalRisk/i);
    expect(content).not.toMatch(/MovementSegment/);
  });
});
