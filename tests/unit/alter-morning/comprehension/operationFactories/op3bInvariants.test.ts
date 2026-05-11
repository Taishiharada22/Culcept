/**
 * OP-3B Invariants — pure wrapper + active runtime 完全不変保証
 *
 * 検証観点 (= CEO 9 項目報告条件):
 *   1. 新 factory file 群が legacyAdapter / dispatcher / route.ts /
 *      morningPipeline / planOperation / llmComprehensionProvider から import されない
 *   2. 各 factory source code に async / fetch / Supabase / await が
 *      **含まれない** (= pure wrapper 規律)
 *   3. factory が persistence/planHistory.ts (= async + I/O) を import しない
 *   4. UI factory が文脈ガード 4 段階 (= clarifySlot / isOriginClarifyActive /
 *      answer 空 / bound=false) を持つ
 *   5. PlanOperation 4 種維持 + OPERATION_SCHEMA 4 種維持
 *   6. active L1_COMPREHENSION_SCHEMA / L1_RESPONSE_FORMAT 不変
 *   7. operationFactories/ 配下が targetDate 系 2 (OP-3A) + OP-3B 4 = 6 file
 *   8. PR #75 依存なし
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

const OP3B_FACTORIES = [
  "lib/alter-morning/comprehension/operationFactories/locationAnchorFactory.ts",
  "lib/alter-morning/comprehension/operationFactories/historyPriorPlanFactory.ts",
  "lib/alter-morning/comprehension/operationFactories/historyPreviousDayFactory.ts",
  "lib/alter-morning/comprehension/operationFactories/uiOriginAnswerFactory.ts",
];

describe("OP-3B Invariants — pure wrapper 規律", () => {
  for (const factoryPath of OP3B_FACTORIES) {
    describe(`${factoryPath} pure wrapper 検証`, () => {
      const content = readSource(factoryPath);

      it("async function を含まない", () => {
        expect(content).not.toMatch(/^export\s+async\s+function/m);
        expect(content).not.toMatch(/=\s*async\s*\(/);
      });

      it("await を含まない", () => {
        // import statement や comment にも await を入れていないことを確認
        // 実装内 await の検出のみが目的
        const lines = content.split("\n");
        const codeLines = lines.filter(
          (l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"),
        );
        const codeContent = codeLines.join("\n");
        expect(codeContent).not.toMatch(/\bawait\s+/);
      });

      it("fetch を含まない (= 外部 I/O 禁止)", () => {
        const lines = content.split("\n");
        const codeLines = lines.filter(
          (l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"),
        );
        const codeContent = codeLines.join("\n");
        expect(codeContent).not.toMatch(/\bfetch\s*\(/);
      });

      it("persistence/planHistory.ts を import しない (= async + Supabase I/O)", () => {
        // import 文として参照していないこと (= doc comment 内の言及は許容)
        expect(content).not.toMatch(/from\s+["'][^"']*persistence\/planHistory/);
        // 関数呼び出しとして参照していないこと (= doc comment 内 backtick 説明は許容)
        expect(content).not.toMatch(/\bfetchPreviousDayPlan\s*\(/);
      });

      it("supabase を import しない", () => {
        expect(content).not.toMatch(/from\s+["']@?\/?lib\/supabase/);
        expect(content).not.toMatch(/from\s+["']@supabase/);
      });

      it("resolveHomeAnchor を呼ばない (= caller 責務)", () => {
        // factory は HomeAnchor 既得値を input で受ける、 自分で resolve しない
        const lines = content.split("\n");
        const codeLines = lines.filter(
          (l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"),
        );
        const codeContent = codeLines.join("\n");
        // 関数呼び出しとしての resolveHomeAnchor( を検出
        expect(codeContent).not.toMatch(/\bresolveHomeAnchor\s*\(/);
      });
    });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // UI factory 文脈ガード 4 段階の存在確認
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("uiOriginAnswerFactory 文脈ガード 4 段階", () => {
    const content = readSource(
      "lib/alter-morning/comprehension/operationFactories/uiOriginAnswerFactory.ts",
    );

    it("clarifySlot ガードを持つ", () => {
      expect(content).toMatch(/clarifySlot\s*!==\s*["']origin["']/);
    });

    it("isOriginClarifyActive ガードを持つ", () => {
      expect(content).toMatch(/isOriginClarifyActive\s*!==\s*true/);
    });

    it("answer 空文字ガードを持つ", () => {
      expect(content).toMatch(/!input\.answer/);
    });

    it("bindOriginAnswer.bound ガードを持つ (= bind 失敗で空配列)", () => {
      expect(content).toMatch(/!bindResult\.bound|bindResult\.bound\s*!==\s*true/);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // runtime 経路から OP-3B factory が import されない
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
    it(`${file} が OP-3B factory を import しない`, () => {
      const content = readSource(file);
      expect(content).not.toContain("locationAnchorFactory");
      expect(content).not.toContain("historyPriorPlanFactory");
      expect(content).not.toContain("historyPreviousDayFactory");
      expect(content).not.toContain("uiOriginAnswerFactory");
      expect(content).not.toContain("operationFactories/");
    });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PlanOperation / OPERATION_SCHEMA 4 種維持
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("planOperation.ts に新 5 種 type literal が含まれない", () => {
    const content = readSource("lib/alter-morning/comprehension/planOperation.ts");
    expect(content).not.toContain('type: "set_target_date"');
    expect(content).not.toContain('type: "add_travel_edge"');
    expect(content).not.toContain('type: "set_journey_origin"');
    expect(content).not.toContain('type: "set_journey_end"');
    expect(content).not.toContain('type: "resolve_place_candidate"');
  });

  it("OPERATION_SCHEMA.type.enum が 4 種", () => {
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
  // active L1 schema 不変
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

  it("active L1_RESPONSE_FORMAT が active schema を参照、 name V1 維持", () => {
    expect(L1_RESPONSE_FORMAT.json_schema.schema).toBe(L1_COMPREHENSION_SCHEMA);
    expect(L1_RESPONSE_FORMAT.json_schema.name).toBe("AlterMorningComprehensionV1");
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // operationFactories/ 配下: targetDate 2 (OP-3A) + OP-3B 4 = 6 file
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("operationFactories/ 配下 — OP-3A (2) + OP-3B (4) + OP-3C-1 (1) + OP-3C-2 (1) + OP-3C-3 (1) = 9 file", () => {
    const factoryDir = path.join(
      REPO_ROOT,
      "lib/alter-morning/comprehension/operationFactories",
    );

    it("origin regex / extractOriginAnchor / fromToTravel 系 file が存在しない", () => {
      // 注: OP-3C-1 で travelEdgeFromToFactory、 OP-3C-2 で explicitDayOriginFactory、
      //     OP-3C-3 で explicitDayEndFactory が landed したため、 「traveledge」 /
      //     「explicitdayorigin」 / 「explicitdayend」 は許可。
      //     ただし下記危険命名は引き続き不在。
      const files = readdirSync(factoryDir);
      const dangerous = files.filter(
        (f) =>
          f.toLowerCase().includes("originregex") ||
          f.toLowerCase().includes("extractoriginanchor") ||
          f.toLowerCase().includes("fromtotravel"),
      );
      expect(dangerous).toEqual([]);
    });

    it("operationFactories/ 配下の ts file は OP-3A (2) + OP-3B (4) + OP-3C-1 (1) + OP-3C-2 (1) + OP-3C-3 (1) = 9 file", () => {
      const files = readdirSync(factoryDir).filter((f) => f.endsWith(".ts")).sort();
      expect(files).toEqual([
        "explicitDayEndFactory.ts",
        "explicitDayOriginFactory.ts",
        "historyPreviousDayFactory.ts",
        "historyPriorPlanFactory.ts",
        "llmComprehensionTargetDateFactory.ts",
        "locationAnchorFactory.ts",
        "regexTargetDateFactory.ts",
        "travelEdgeFromToFactory.ts",
        "uiOriginAnswerFactory.ts",
      ]);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PR #75 依存なし
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("OP-3B factory が PR #75 系 module を参照しない", () => {
    for (const factoryPath of OP3B_FACTORIES) {
      const content = readSource(factoryPath);
      expect(content, `${factoryPath} should not import fromToTravelEdgeReconciler`).not.toContain(
        "fromToTravelEdgeReconciler",
      );
      expect(content, `${factoryPath} should not import originAnchorExtractor`).not.toContain(
        "originAnchorExtractor",
      );
      expect(content, `${factoryPath} should not import explicitAnchorExtractor`).not.toContain(
        "explicitAnchorExtractor",
      );
    }
  });
});
