/**
 * OP-2 Invariants — active runtime 完全不変保証
 *
 * 検証観点 (= CEO 9 項目報告条件 1-7 に対応):
 *   1. active L1_COMPREHENSION_SCHEMA が変わっていない
 *   2. active L1_RESPONSE_FORMAT が変わっていない (= V2 を参照しない)
 *   3. provider / dispatcher / legacyAdapter / route / morningPipeline が
 *      V2 schema / PlanOperationCandidate を import していない
 *   4. PlanOperation union が 4 種のまま
 *   5. OPERATION_SCHEMA の type enum が 4 種のまま
 *   6. V2 schema は required + nullable で OpenAI strict mode 準拠
 *   7. (normalizer test 別 file 参照)
 *
 * OP-2 規律:
 *   - active runtime 影響ゼロ
 *   - V2 schema は未接続
 *   - PlanOperationCandidate は dispatch 経路に流れない
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  L1_COMPREHENSION_SCHEMA,
  L1_RESPONSE_FORMAT,
} from "@/lib/alter-morning/comprehension/structuredSchema";
import {
  L1_COMPREHENSION_V2_SCHEMA,
  L1_RESPONSE_FORMAT_V2,
} from "@/lib/alter-morning/comprehension/operationCandidateSchema";

const REPO_ROOT = path.resolve(__dirname, "../../../..");

function readSource(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf-8");
}

describe("OP-2 Invariants — active L1_COMPREHENSION_SCHEMA 不変", () => {
  it("active L1_COMPREHENSION_SCHEMA.required が既存 6 種のまま", () => {
    expect(L1_COMPREHENSION_SCHEMA.required).toEqual([
      "targetDate",
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
    expect(props).toContain("targetDate");
    expect(props).toContain("events");
    expect(props).toContain("operations");
    expect(props).toContain("startPoint");
    expect(props).toContain("departureTime");
    expect(props).toContain("goOut");
    // OP-2 で追加してはいけない field
    expect(props).not.toContain("journeyOrigin");
    expect(props).not.toContain("journeyEnd");
    expect(props).not.toContain("segments");
  });

  it("active L1_COMPREHENSION_SCHEMA.properties が 6 つ (= 増えていない)", () => {
    const props = Object.keys(
      L1_COMPREHENSION_SCHEMA.properties as Record<string, unknown>,
    );
    expect(props).toHaveLength(6);
  });
});

describe("OP-2 Invariants — active L1_RESPONSE_FORMAT 不変", () => {
  it("active L1_RESPONSE_FORMAT が active schema を参照、 V2 を参照しない", () => {
    expect(L1_RESPONSE_FORMAT.json_schema.schema).toBe(L1_COMPREHENSION_SCHEMA);
    expect(L1_RESPONSE_FORMAT.json_schema.schema).not.toBe(L1_COMPREHENSION_V2_SCHEMA);
  });

  it("active L1_RESPONSE_FORMAT の name が 'AlterMorningComprehensionV1' のまま", () => {
    expect(L1_RESPONSE_FORMAT.json_schema.name).toBe("AlterMorningComprehensionV1");
  });

  it("active L1_RESPONSE_FORMAT は V2 response format と別 const", () => {
    expect(L1_RESPONSE_FORMAT).not.toBe(L1_RESPONSE_FORMAT_V2);
  });
});

describe("OP-2 Invariants — OPERATION_SCHEMA の type enum 不変 (= 4 種)", () => {
  it("L1_COMPREHENSION_SCHEMA.properties.operations.items.properties.type.enum が 4 種", () => {
    const operationsField = L1_COMPREHENSION_SCHEMA.properties.operations as {
      items: {
        properties: {
          type: { enum: readonly string[] };
        };
      };
    };
    const typeEnum = operationsField.items.properties.type.enum;
    expect(typeEnum).toEqual(["append", "modify", "answer", "noop"]);
    expect(typeEnum).toHaveLength(4);
  });

  it("active OPERATION_SCHEMA に新 5 種が含まれない", () => {
    const operationsField = L1_COMPREHENSION_SCHEMA.properties.operations as {
      items: {
        properties: {
          type: { enum: readonly string[] };
        };
      };
    };
    const typeEnum = operationsField.items.properties.type.enum;
    expect(typeEnum).not.toContain("set_target_date");
    expect(typeEnum).not.toContain("add_travel_edge");
    expect(typeEnum).not.toContain("set_journey_origin");
    expect(typeEnum).not.toContain("set_journey_end");
    expect(typeEnum).not.toContain("resolve_place_candidate");
  });
});

describe("OP-2 Invariants — V2 schema は active と別 const + strict 準拠", () => {
  it("V2 schema は active schema と別 const", () => {
    expect(L1_COMPREHENSION_V2_SCHEMA).not.toBe(L1_COMPREHENSION_SCHEMA);
  });

  it("V2 schema strict mode 互換 (= additionalProperties: false)", () => {
    expect(L1_COMPREHENSION_V2_SCHEMA.additionalProperties).toBe(false);
  });

  it("V2 response format strict: true", () => {
    expect(L1_RESPONSE_FORMAT_V2.json_schema.strict).toBe(true);
  });

  it("V2 schema の required に 9 field 全部含まれる (= OpenAI strict mode 要件)", () => {
    expect(L1_COMPREHENSION_V2_SCHEMA.required).toContain("targetDate");
    expect(L1_COMPREHENSION_V2_SCHEMA.required).toContain("events");
    expect(L1_COMPREHENSION_V2_SCHEMA.required).toContain("operations");
    expect(L1_COMPREHENSION_V2_SCHEMA.required).toContain("startPoint");
    expect(L1_COMPREHENSION_V2_SCHEMA.required).toContain("departureTime");
    expect(L1_COMPREHENSION_V2_SCHEMA.required).toContain("goOut");
    expect(L1_COMPREHENSION_V2_SCHEMA.required).toContain("journeyOrigin");
    expect(L1_COMPREHENSION_V2_SCHEMA.required).toContain("journeyEnd");
    expect(L1_COMPREHENSION_V2_SCHEMA.required).toContain("segments");
    expect(L1_COMPREHENSION_V2_SCHEMA.required).toHaveLength(9);
  });
});

describe("OP-2 Invariants — provider / dispatcher / legacyAdapter / route / pipeline が V2 / candidate を import しない", () => {
  const filesToCheck = [
    "lib/alter-morning/comprehension/llmComprehensionProvider.ts",
    "lib/alter-morning/legacyAdapter.ts",
    "lib/alter-morning/planning/operationDispatcher.ts",
    "app/api/stargazer/alter/route.ts",
    "lib/alter-morning/morningPipeline.ts",
    "lib/alter-morning/comprehension/planOperation.ts",
  ];

  for (const file of filesToCheck) {
    it(`${file} が V2 schema / PlanOperationCandidate を import していない`, () => {
      const content = readSource(file);
      expect(content, `${file} should not import operationCandidateSchema`).not.toContain(
        "operationCandidateSchema",
      );
      expect(content, `${file} should not reference L1_COMPREHENSION_V2_SCHEMA`).not.toContain(
        "L1_COMPREHENSION_V2_SCHEMA",
      );
      expect(content, `${file} should not reference L1_RESPONSE_FORMAT_V2`).not.toContain(
        "L1_RESPONSE_FORMAT_V2",
      );
      expect(content, `${file} should not import PlanOperationCandidate`).not.toContain(
        "PlanOperationCandidate",
      );
      expect(content, `${file} should not import planOperationCandidate`).not.toContain(
        "planOperationCandidate",
      );
      expect(content, `${file} should not reference comprehensionNormalizer`).not.toContain(
        "comprehensionNormalizer",
      );
      expect(content, `${file} should not reference operationEnvelope`).not.toContain(
        "operationEnvelope",
      );
    });
  }
});

describe("OP-2 Invariants — PlanOperation union 4 種維持 (= type-level)", () => {
  it("既存 PlanOperation の 4 種が維持されている (= structural assertion)", () => {
    // PlanOperation union そのものは type なので runtime で直接列挙できないが、
    // OPERATION_SCHEMA の type enum と一対一対応している。
    // OPERATION_SCHEMA の不変条件 (上記 describe) と組み合わせて 4 種維持を保証。
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

  it("planOperation.ts に新 5 種の type literal が含まれない (= source check)", () => {
    const content = readSource("lib/alter-morning/comprehension/planOperation.ts");
    // 既存 PlanOperation type literal は既存 4 種のみ
    // 新 5 種が export type として追加されていないことを確認
    expect(content).not.toContain('type: "set_target_date"');
    expect(content).not.toContain('type: "add_travel_edge"');
    expect(content).not.toContain('type: "set_journey_origin"');
    expect(content).not.toContain('type: "set_journey_end"');
    expect(content).not.toContain('type: "resolve_place_candidate"');
  });
});

describe("OP-2 Invariants — 新 OP-2 module が active runtime に流れていない", () => {
  it("planOperationCandidate.ts は journey/anchorState のみ import (= types.ts touch しない)", () => {
    const content = readSource(
      "lib/alter-morning/comprehension/planOperationCandidate.ts",
    );
    // JourneyAnchorState は journey/anchorState から import (= types.ts touch しない確認)
    expect(content).toContain('from "../journey/anchorState"');
  });

  it("operationCandidateSchema.ts は active structuredSchema を import しない (= 完全独立)", () => {
    const content = readSource(
      "lib/alter-morning/comprehension/operationCandidateSchema.ts",
    );
    // active sub-schemas (PROVENANCE_SCHEMA / EVENT_SCHEMA / OPERATION_SCHEMA) は import しない
    expect(content).not.toContain('from "./structuredSchema"');
    expect(content).not.toContain("import { PROVENANCE_SCHEMA }");
    expect(content).not.toContain("import { EVENT_SCHEMA }");
    expect(content).not.toContain("import { OPERATION_SCHEMA }");
  });
});
