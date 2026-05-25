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
  it("named export 'DayGraphTimeline' が renderable component として存在", async () => {
    const mod = await import(
      "@/app/(culcept)/plan/components/DayGraphTimeline"
    );
    expect(mod.DayGraphTimeline).toBeDefined();
    // K-3c-ii で React.memo 適用後は typeof === "object" (= MemoExoticComponent)。
    // K-3a 時点の plain function (= typeof "function") も両対応。
    const t = typeof mod.DayGraphTimeline;
    expect(t === "function" || t === "object").toBe(true);
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

  it("Arrival Risk Memory / MovementSegment 直接依存なし (= L-4d 着地後の維持規約)", () => {
    // L-4d (= 2026-05-22 CEO + GPT 承認) で limited transport 依存を導入:
    //   - `MovementDisplayView` (= L-4a の PII-free 公開 view) のみ import 許可
    //   - `MovementSegment` (= L-3c overlay の内部型) 直接 import は引き続き禁止
    //   - Arrival Risk Memory は L-4 範囲外、 永続禁止維持
    expect(content).not.toMatch(/arrivalRisk/i);
    expect(content).not.toMatch(/MovementSegment\b/); // \b で MovementSegmentXxx 系を除外検出
    // 許可されている transport 依存: L-4a の MovementDisplayView のみ
    //   (= movementDisplayFormatter からの type import に限定、 他 transport 型は引き込まない)
    const transportImports = content.match(
      /import\s+(?:type\s+)?\{[^}]+\}\s+from\s+["']@\/lib\/plan\/transport\/[^"']+["']/g,
    ) ?? [];
    for (const importLine of transportImports) {
      expect(importLine).toMatch(/movementDisplayFormatter/);
      expect(importLine).toMatch(/MovementDisplayView/);
    }
  });

  // Phase 3-N-2 wave 1 (= 2026-05-23 CEO + GPT 合議): P-001 focus ring 統一規約
  //
  // EventItem button は M-3c-ui の TransitionItem (= slate-300 + focus-visible) と
  // 統一すること。 旧 K-3a 由来の indigo-300 / focus:ring (= focus-visible なし) は禁止。
  //
  // 設計書:
  //   - docs/alter-plan-phase3-n-2-wave-1-plan-audit.md
  //   - docs/alter-plan-phase3-n-1-closeout-audit.md §2.2 (= P-001 詳細分析)
  //
  // 思想:
  //   - mouse click 後の「stuck ring」 を排除 (= UX 改善、 「観測の幕間」 整合)
  //   - keyboard user には focus-visible で ring を維持 (= WCAG 2.1 a11y)
  //   - M phase で確立した slate-* 階調と統一 (= 「観測層 OS visual 規約」)
  it("N-2 wave 1 P-001: EventItem button は focus-visible:ring-slate-300 を使う (= M phase visual 規約継承)", () => {
    // EventItem button が新規約 (= focus-visible + slate-300) を使う
    expect(content).toMatch(
      /button[\s\S]*?className="[^"]*focus-visible:ring-2 focus-visible:ring-slate-300/,
    );
    // 旧規約 (= indigo / focus-visible なし) パターンが存在しないこと
    expect(content).not.toMatch(/focus:ring-indigo/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// K-3c-iii: compact mode (= empty day 1 行 summary)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("DayGraphTimeline component — K-3c-iii compact mode", () => {
  it("buildCompactSummaryView を import している", () => {
    expect(content).toMatch(
      /buildCompactSummaryView[\s\S]{0,200}?from\s+["']@\/lib\/plan\/dayGraph\/dayGraphTimelinePresentation["']/,
    );
  });

  it("props.compact が optional boolean として定義されている", () => {
    expect(content).toMatch(/compact\?:\s*boolean/);
  });

  it("compact mode 分岐 (= if (props.compact) ...) 存在", () => {
    expect(content).toMatch(/if\s*\(\s*props\.compact\s*\)/);
  });

  it("CompactEmptyDayLine 内部 component 定義", () => {
    expect(content).toMatch(/function CompactEmptyDayLine/);
  });

  it("CompactEmptyDayLine の role='note' (= 補助情報、 action なし)", () => {
    expect(content).toMatch(/role=["']note["']/);
  });

  it("CompactEmptyDayLine data-testid default 'day-graph-compact-empty'", () => {
    expect(content).toMatch(/day-graph-compact-empty/);
  });

  it("dot separator '·' (= 静かな視覚 separator)", () => {
    expect(content).toMatch(/·/);
  });
});
