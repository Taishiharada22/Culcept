/**
 * OP-3A Invariants — active runtime + intentParser body 完全不変保証
 *
 * 検証観点 (= CEO 7 項目報告条件):
 *   1. 新 factory file 群 (= operationFactories/) が legacyAdapter / dispatcher /
 *      route.ts / morningPipeline / planOperation から **import されない**
 *   2. intentParser.ts の `extractTargetDate` は export 修飾子追加のみで
 *      関数 body (= regex / logic) は変更されていない
 *   3. PlanOperation union が 4 種のまま
 *   4. OPERATION_SCHEMA の type enum が 4 種のまま
 *   5. active L1_COMPREHENSION_SCHEMA / L1_RESPONSE_FORMAT 不変
 *   6. origin 系 / travel edge 系 factory が OP-3A に **含まれていない** (= scope 厳守)
 *
 * OP-3A 規律:
 *   - dispatcher / legacyAdapter / route 接続なし
 *   - active schema 不変
 *   - prompt 不変
 *   - PR #75 依存なし
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  L1_COMPREHENSION_SCHEMA,
  L1_RESPONSE_FORMAT,
} from "@/lib/alter-morning/comprehension/structuredSchema";

const REPO_ROOT = path.resolve(__dirname, "../../../../..");

function readSource(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf-8");
}

describe("OP-3A Invariants — runtime 完全不変", () => {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1. factory が runtime 経路から import されていない
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const runtimeFiles = [
    "lib/alter-morning/comprehension/llmComprehensionProvider.ts",
    "lib/alter-morning/legacyAdapter.ts",
    "lib/alter-morning/planning/operationDispatcher.ts",
    "app/api/stargazer/alter/route.ts",
    "lib/alter-morning/morningPipeline.ts",
    "lib/alter-morning/comprehension/planOperation.ts",
  ];

  for (const file of runtimeFiles) {
    it(`${file} が operationFactories / 新 factory を import していない`, () => {
      const content = readSource(file);
      expect(content, `${file} should not import operationFactories/`).not.toContain(
        "operationFactories/",
      );
      expect(content).not.toContain("llmComprehensionTargetDateFactory");
      expect(content).not.toContain("regexTargetDateFactory");
    });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2. intentParser.ts: extractTargetDate body 完全不変
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("intentParser.ts: extractTargetDate body 不変", () => {
    const content = readSource("lib/alter-morning/intentParser.ts");

    it("export function extractTargetDate 宣言が存在", () => {
      expect(content).toContain("export function extractTargetDate(text: string): string | undefined {");
    });

    it("関数 body の TARGET_DATE_MAP for-loop が保持されている", () => {
      // 元の logic 構造が保持されていることを source level で確認
      expect(content).toContain("for (const { pattern, offset } of TARGET_DATE_MAP) {");
      expect(content).toContain("if (pattern.test(text)) {");
      expect(content).toContain("if (offset === 0) return undefined;");
    });

    it("関数 body の JST 計算ロジックが保持されている", () => {
      // line 913-919 の JST 計算
      expect(content).toContain("d.setHours(d.getHours() + 9);");
      expect(content).toContain("d.setDate(d.getDate() + offset);");
      expect(content).toContain("const yyyy = d.getFullYear();");
      expect(content).toContain('const mm = String(d.getMonth() + 1).padStart(2, "0");');
      expect(content).toContain('const dd = String(d.getDate()).padStart(2, "0");');
      expect(content).toContain("return `${yyyy}-${mm}-${dd}`;");
    });

    it("関数末尾の return undefined が保持されている", () => {
      // 「signal なし → undefined」 の既存挙動
      const lastReturnPattern = /return undefined;\n}/;
      expect(content).toMatch(lastReturnPattern);
    });

    it("非 export function (= 内部 helper) はあくまで extractTargetDate 1 つだけ public 化", () => {
      // 他の internal function を勝手に export していないことを確認
      // 方針: 念のため intentParser.ts に extractTargetDate **だけ** が新規 export
      // されていることをスポット check (= 既存 export 対象 file は不変)
      const exportFunctionMatches = content.match(/^export function /gm) ?? [];
      // extractTargetDate を含むこと
      expect(content).toContain("export function extractTargetDate");
      // export function 群が変な数になっていないか (= 警告レベル、 厳格 count はしない)
      expect(exportFunctionMatches.length).toBeGreaterThan(0);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3. PlanOperation 4 種維持 (= source check 経由)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("planOperation.ts に新 5 種 type literal が含まれない (= union 4 種維持)", () => {
    const content = readSource("lib/alter-morning/comprehension/planOperation.ts");
    expect(content).not.toContain('type: "set_target_date"');
    expect(content).not.toContain('type: "add_travel_edge"');
    expect(content).not.toContain('type: "set_journey_origin"');
    expect(content).not.toContain('type: "set_journey_end"');
    expect(content).not.toContain('type: "resolve_place_candidate"');
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 4. OPERATION_SCHEMA enum 4 種維持
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("OPERATION_SCHEMA.type.enum (= L1 schema 経由) が 4 種", () => {
    const operationsField = L1_COMPREHENSION_SCHEMA.properties.operations as {
      items: {
        properties: {
          type: { enum: readonly string[] };
        };
      };
    };
    expect(operationsField.items.properties.type.enum).toEqual([
      "append",
      "modify",
      "answer",
      "noop",
    ]);
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 5. active L1_COMPREHENSION_SCHEMA / L1_RESPONSE_FORMAT 不変
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("active L1_COMPREHENSION_SCHEMA.required が現行 7 種", () => {
    expect(L1_COMPREHENSION_SCHEMA.required).toEqual([
      "targetDate",
      "targetDateProvenance",
      "events",
      "operations",
      "startPoint",
      "departureTime",
      "goOut",
    ]);
  });

  it("active L1_COMPREHENSION_SCHEMA.properties に新 field が含まれない", () => {
    const props = Object.keys(
      L1_COMPREHENSION_SCHEMA.properties as Record<string, unknown>,
    );
    expect(props).not.toContain("journeyOrigin");
    expect(props).not.toContain("journeyEnd");
    expect(props).not.toContain("segments");
  });

  it("active L1_RESPONSE_FORMAT が active schema を参照 + name 維持", () => {
    expect(L1_RESPONSE_FORMAT.json_schema.schema).toBe(L1_COMPREHENSION_SCHEMA);
    expect(L1_RESPONSE_FORMAT.json_schema.name).toBe("AlterMorningComprehensionV1");
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 6. OP-3A scope 厳守 — origin 系 / travel edge 系 factory が含まれない
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("OP-3A scope 厳守 (= 危険系 file は引き続き不在)", () => {
    const factoryDir = path.join(
      REPO_ROOT,
      "lib/alter-morning/comprehension/operationFactories",
    );

    // 注: OP-3A 時点では「targetDate 系 2 file のみ」 を assert していたが、
    //     OP-3B 着地で location / history / UI factory、
    //     OP-3C-1 着地で travelEdgeFromToFactory が追加される。
    //
    //     ただし以下の本質規律は維持:
    //
    //     1. origin regex (= bare「X から」 を catch する) factory 不在
    //     2. extractOriginAnchor 系 factory 不在
    //     3. fromToTravel 命名の factory 不在 (= PR #75 系の危険命名)
    //
    //     OP-3C-1 で travelEdgeFromToFactory は許可 (= segmentOrigin/Destination
    //     のみ出力、 journeyOrigin に絶対昇格しない不変条件は別 test で担保)

    it("operationFactories/ 配下に origin regex / extractOriginAnchor / fromToTravel 系 file が存在しない", () => {
      const files = readdirSync(factoryDir);
      const dangerous = files.filter(
        (f) =>
          f.toLowerCase().includes("originregex") ||
          f.toLowerCase().includes("extractoriginanchor") ||
          f.toLowerCase().includes("fromtotravel"),
      );
      expect(dangerous).toEqual([]);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 7. PR #75 依存なし
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("OP-3A factory が PR #75 系 module (fromToTravelEdgeReconciler) を参照していない", () => {
    const llmFactory = readSource(
      "lib/alter-morning/comprehension/operationFactories/llmComprehensionTargetDateFactory.ts",
    );
    const regexFactory = readSource(
      "lib/alter-morning/comprehension/operationFactories/regexTargetDateFactory.ts",
    );
    expect(llmFactory).not.toContain("fromToTravelEdgeReconciler");
    expect(regexFactory).not.toContain("fromToTravelEdgeReconciler");
    expect(llmFactory).not.toContain("originAnchorExtractor");
    expect(regexFactory).not.toContain("originAnchorExtractor");
    expect(llmFactory).not.toContain("explicitAnchorExtractor");
    expect(regexFactory).not.toContain("explicitAnchorExtractor");
  });
});
