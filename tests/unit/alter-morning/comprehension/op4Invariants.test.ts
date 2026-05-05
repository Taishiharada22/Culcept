/**
 * OP-4 Invariants — pure dispatcher + active runtime 完全不変保証
 *
 * 検証観点:
 *   1. dispatcher source code に async / await / fetch / Supabase 不在
 *   2. dispatcher が legacyAdapter / dispatcher 既存 / route.ts / morningPipeline /
 *      planOperation / llmComprehensionProvider から **import されない**
 *   3. dispatcher が PlanState / 既存 dispatcher / runtime path に直接書かない
 *   4. PlanOperation 4 種維持 + OPERATION_SCHEMA 4 種維持
 *   5. active L1_COMPREHENSION_SCHEMA / L1_RESPONSE_FORMAT 不変
 *   6. RejectReason union が 6 種のみ
 *   7. payload.date YYYY-MM-DD 検証規律 (= isValidYmd 関数の存在)
 *   8. selectedTravelEdgeCandidates が input order を保持 (= sort / merge / dedupe しない)
 *   9. PR #75 依存なし (= fromToTravelEdgeReconciler 等不参照)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  L1_COMPREHENSION_SCHEMA,
  L1_RESPONSE_FORMAT,
} from "@/lib/alter-morning/comprehension/structuredSchema";
import { dispatchCandidates } from "@/lib/alter-morning/comprehension/candidateDispatcher";
import type {
  PlanOperationCandidate,
  AddTravelEdgeOperationCandidate,
  SetTargetDateOperationCandidate,
} from "@/lib/alter-morning/comprehension/planOperationCandidate";
import type { OperationEnvelope } from "@/lib/alter-morning/comprehension/operationEnvelope";
import type { Provenance } from "@/lib/alter-morning/comprehension/eventSchema";

const REPO_ROOT = path.resolve(__dirname, "../../../..");

function readSource(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf-8");
}

const DISPATCHER_PATH = "lib/alter-morning/comprehension/candidateDispatcher.ts";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. dispatcher pure 規律
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("OP-4 Invariants — dispatcher pure 規律", () => {
  const content = readSource(DISPATCHER_PATH);

  it("async function を含まない", () => {
    expect(content).not.toMatch(/^export\s+async\s+function/m);
    expect(content).not.toMatch(/=\s*async\s*\(/);
  });

  it("await を含まない (= comment 除外)", () => {
    const lines = content.split("\n");
    const codeLines = lines.filter(
      (l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"),
    );
    const codeContent = codeLines.join("\n");
    expect(codeContent).not.toMatch(/\bawait\s+/);
  });

  it("fetch( を含まない (= I/O 禁止)", () => {
    const lines = content.split("\n");
    const codeLines = lines.filter(
      (l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"),
    );
    const codeContent = codeLines.join("\n");
    expect(codeContent).not.toMatch(/\bfetch\s*\(/);
  });

  it("supabase を import しない", () => {
    expect(content).not.toMatch(/from\s+["']@?\/?lib\/supabase/);
    expect(content).not.toMatch(/from\s+["']@supabase/);
  });

  it("persistence/planHistory.ts を import しない (= async + Supabase I/O)", () => {
    expect(content).not.toMatch(/from\s+["'][^"']*persistence\/planHistory/);
    expect(content).not.toMatch(/\bfetchPreviousDayPlan\s*\(/);
  });

  it("既存 dispatcher (= planning/operationDispatcher.ts) を import しない", () => {
    expect(content).not.toMatch(/from\s+["'][^"']*planning\/operationDispatcher/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. runtime 経路から dispatcher が import されない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("OP-4 Invariants — runtime 接続なし", () => {
  const runtimeFiles = [
    "lib/alter-morning/comprehension/llmComprehensionProvider.ts",
    "lib/alter-morning/legacyAdapter.ts",
    "lib/alter-morning/planning/operationDispatcher.ts",
    "app/api/stargazer/alter/route.ts",
    "lib/alter-morning/morningPipeline.ts",
    "lib/alter-morning/comprehension/planOperation.ts",
  ];

  for (const file of runtimeFiles) {
    it(`${file} が candidateDispatcher を import しない`, () => {
      const content = readSource(file);
      expect(content).not.toContain("candidateDispatcher");
      expect(content).not.toContain("dispatchCandidates");
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. PlanOperation / OPERATION_SCHEMA 4 種維持 + active L1 schema 不変
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("OP-4 Invariants — active schema 不変", () => {
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

  it("active L1_COMPREHENSION_SCHEMA.required が既存 6 種", () => {
    expect(L1_COMPREHENSION_SCHEMA.required).toEqual([
      "targetDate",
      "events",
      "operations",
      "startPoint",
      "departureTime",
      "goOut",
    ]);
  });

  it("active L1_RESPONSE_FORMAT が active schema 参照、 name V1 維持", () => {
    expect(L1_RESPONSE_FORMAT.json_schema.schema).toBe(L1_COMPREHENSION_SCHEMA);
    expect(L1_RESPONSE_FORMAT.json_schema.name).toBe("AlterMorningComprehensionV1");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. payload.date YYYY-MM-DD 検証規律 (= 修正 1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("OP-4 Invariants — payload.date 検証規律", () => {
  const content = readSource(DISPATCHER_PATH);

  it("isValidYmd 関数が存在", () => {
    expect(content).toMatch(/function\s+isValidYmd\s*\(/);
  });

  it("YYYY-MM-DD regex 検証 + Date 厳密検証の両方を含む", () => {
    expect(content).toMatch(/\\d\{4\}-\\d\{2\}-\\d\{2\}/);
    expect(content).toContain("isNaN(d.getTime())");
    expect(content).toContain("toISOString().slice(0, 10) === s");
  });

  it("invalid_target_date reason が dispatcher 内で使われている", () => {
    expect(content).toContain('"invalid_target_date"');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. selectedTravelEdgeCandidates input order 保持 (= 修正 2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("OP-4 Invariants — travel edge input order 保持", () => {
  it("selectTravelEdgeCandidates 関数が sort / merge / dedupe しない (= source check)", () => {
    const content = readSource(DISPATCHER_PATH);
    // 関数定義部分のみ抽出
    const funcMatch = content.match(
      /function\s+selectTravelEdgeCandidates[^}]+?\{[\s\S]*?\n\}/,
    );
    expect(funcMatch).not.toBeNull();
    const funcBody = funcMatch![0];
    // sort / merge / dedupe / unique キーワード不在
    expect(funcBody).not.toMatch(/\.sort\(/);
    expect(funcBody).not.toMatch(/\.reduce\(/);
    expect(funcBody).not.toMatch(/Set\(/);
    expect(funcBody).not.toMatch(/uniq/i);
    expect(funcBody).not.toMatch(/dedupe/i);
    expect(funcBody).not.toMatch(/merge/i);
  });

  it("複雑な candidate 集合で travel edge の順序が保持される (= behavior test)", () => {
    const PROV: Provenance = {
      source_type: "utterance",
      source_span: [],
      provenance_confidence: "high",
      from_utterance: true,
    };
    const e1: OperationEnvelope<AddTravelEdgeOperationCandidate> = {
      type: "add_travel_edge",
      payload: {
        segmentOrigin: { label: "A", classification: "x" },
        segmentDestination: { label: "B", classification: "x" },
        segmentDepartureTime: "08:00",
        matchedSpan: "A→B",
      },
      source: "regex_deterministic",
      priority: 500,
      confidence: "high",
      provenance: PROV,
    };
    const e2: OperationEnvelope<AddTravelEdgeOperationCandidate> = {
      ...e1,
      payload: {
        ...e1.payload,
        segmentOrigin: { label: "B", classification: "x" },
        segmentDestination: { label: "C", classification: "x" },
        segmentDepartureTime: "12:00",
        matchedSpan: "B→C",
      },
      source: "llm_explicit",
      priority: 700,
    };
    const e3: OperationEnvelope<AddTravelEdgeOperationCandidate> = {
      ...e1,
      payload: {
        ...e1.payload,
        segmentOrigin: { label: "C", classification: "x" },
        segmentDestination: { label: "D", classification: "x" },
        segmentDepartureTime: "18:00",
        matchedSpan: "C→D",
      },
      source: "llm_inferred",
      priority: 500,
    };

    const result = dispatchCandidates({
      candidates: [e1, e2, e3],
      actualToday: "2026-05-06",
    });

    // 元順序保持 (= priority sort なら e2 が先頭になるはず、 input 順なら e1)
    expect(result.selectedTravelEdgeCandidates).toEqual([e1, e2, e3]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. add_travel_edge → journeyOrigin / journeyEnd に流れない (= PR #75 不変条件)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("OP-4 Invariants — segmentOrigin → journeyOrigin 不変条件", () => {
  it("add_travel_edge envelope のみ → selectedJourneyOriginCandidate / End 共に null", () => {
    const PROV: Provenance = {
      source_type: "utterance",
      source_span: [],
      provenance_confidence: "high",
      from_utterance: true,
    };
    const edge: OperationEnvelope<AddTravelEdgeOperationCandidate> = {
      type: "add_travel_edge",
      payload: {
        segmentOrigin: { label: "東京駅", classification: "public_poi_proper_noun" },
        segmentDestination: { label: "渋谷", classification: "public_poi_proper_noun" },
        segmentDepartureTime: "08:00",
        matchedSpan: "東京駅から渋谷へ",
      },
      source: "llm_explicit",
      priority: 700,
      confidence: "high",
      provenance: PROV,
    };
    const result = dispatchCandidates({
      candidates: [edge],
      actualToday: "2026-05-06",
    });
    expect(result.selectedJourneyOriginCandidate).toBeNull();
    expect(result.selectedJourneyEndCandidate).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. PR #75 依存なし
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("OP-4 Invariants — PR #75 依存なし", () => {
  it("dispatcher が PR #75 系 module を参照しない", () => {
    const content = readSource(DISPATCHER_PATH);
    expect(content).not.toContain("fromToTravelEdgeReconciler");
    expect(content).not.toContain("originAnchorExtractor");
    expect(content).not.toContain("explicitAnchorExtractor");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. dispatcher 単体での pure 検証 (= behavior level)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("OP-4 Invariants — pure function (= behavior)", () => {
  it("dispatcher が input mutate しない (= behavior)", () => {
    const PROV: Provenance = {
      source_type: "utterance",
      source_span: [],
      provenance_confidence: "high",
      from_utterance: true,
    };
    const candidates: OperationEnvelope<PlanOperationCandidate>[] = [
      {
        type: "set_target_date",
        payload: { date: "2026-05-06" },
        source: "llm_explicit",
        priority: 700,
        confidence: "high",
        provenance: PROV,
      } satisfies OperationEnvelope<SetTargetDateOperationCandidate>,
    ];
    const snapshot = JSON.stringify(candidates);
    dispatchCandidates({
      candidates,
      actualToday: "2026-05-06",
    });
    expect(JSON.stringify(candidates)).toBe(snapshot);
  });

  it("空入力で deterministic", () => {
    const r1 = dispatchCandidates({ candidates: [], actualToday: "2026-05-06" });
    const r2 = dispatchCandidates({ candidates: [], actualToday: "2026-05-06" });
    expect(r1).toEqual(r2);
  });
});
