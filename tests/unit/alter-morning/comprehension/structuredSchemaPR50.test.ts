/**
 * structuredSchema PR-50 拡張 — schema shape regression tests
 *
 * CEO 2026-04-30 PR-50 Commit 2:
 *   L1_COMPREHENSION_SCHEMA に operations field を追加した際の
 *   strict mode 互換性 / shape 整合性を検証する。
 *
 * 検証観点:
 *   1. top-level に operations field が存在
 *   2. operations は array 型
 *   3. operations が required リストに含まれる (空配列許容)
 *   4. OPERATION_SCHEMA 内の type discriminator (4 値 enum)
 *   5. OPERATION_SCHEMA の全 field が required (strict mode 互換)
 *   6. additionalProperties: false (strict mode 必須)
 *   7. 既存 events / startPoint / departureTime / goOut field は影響なし (regression)
 */

import { describe, it, expect } from "vitest";
import {
  L1_COMPREHENSION_SCHEMA,
  L1_RESPONSE_FORMAT,
} from "@/lib/alter-morning/comprehension/structuredSchema";

describe("L1_COMPREHENSION_SCHEMA — top-level structure (regression)", () => {
  it("既存 fields が維持されている (events / startPoint / departureTime / goOut / targetDate)", () => {
    const props = L1_COMPREHENSION_SCHEMA.properties as Record<string, unknown>;
    expect(props.targetDate).toBeDefined();
    expect(props.events).toBeDefined();
    expect(props.startPoint).toBeDefined();
    expect(props.departureTime).toBeDefined();
    expect(props.goOut).toBeDefined();
  });

  it("strict mode 互換: additionalProperties=false", () => {
    expect(L1_COMPREHENSION_SCHEMA.additionalProperties).toBe(false);
  });

  it("strict mode 互換: required リストに既存 + 新規 operations が全部含まれる", () => {
    const required = L1_COMPREHENSION_SCHEMA.required as readonly string[];
    expect(required).toContain("targetDate");
    expect(required).toContain("events");
    expect(required).toContain("operations"); // ★ PR-50 新規
    expect(required).toContain("startPoint");
    expect(required).toContain("departureTime");
    expect(required).toContain("goOut");
  });
});

describe("L1_COMPREHENSION_SCHEMA — operations field (PR-50)", () => {
  it("operations field が top-level に存在", () => {
    const props = L1_COMPREHENSION_SCHEMA.properties as Record<string, unknown>;
    expect(props.operations).toBeDefined();
  });

  it("operations は array 型", () => {
    const ops = L1_COMPREHENSION_SCHEMA.properties.operations as {
      type: string;
      items: unknown;
    };
    expect(ops.type).toBe("array");
    expect(ops.items).toBeDefined();
  });

  it("operations 空配列 [] が許容される (= fallback signal)", () => {
    // schema 自体に minItems などの制約がないことを確認
    const ops = L1_COMPREHENSION_SCHEMA.properties.operations as Record<
      string,
      unknown
    >;
    expect(ops.minItems).toBeUndefined();
    // type=array で空配列も valid (JSON Schema の標準動作)
  });
});

describe("OPERATION_SCHEMA — operation item structure", () => {
  // L1_COMPREHENSION_SCHEMA.properties.operations.items が OPERATION_SCHEMA
  const operationSchema = (
    L1_COMPREHENSION_SCHEMA.properties.operations as {
      items: {
        type: string;
        properties: Record<string, unknown>;
        required: readonly string[];
        additionalProperties: boolean;
      };
    }
  ).items;

  it("strict mode 互換: additionalProperties=false", () => {
    expect(operationSchema.additionalProperties).toBe(false);
  });

  it("type discriminator が 4 値 enum (append / modify / answer / noop)", () => {
    const typeField = operationSchema.properties.type as {
      type: string;
      enum: readonly string[];
    };
    expect(typeField.type).toBe("string");
    expect(typeField.enum).toEqual(["append", "modify", "answer", "noop"]);
  });

  it("strict mode 互換: 全 field が required リストに含まれる", () => {
    const required = operationSchema.required;
    // type は当然
    expect(required).toContain("type");
    // append 用
    expect(required).toContain("eventDraft");
    // modify 用
    expect(required).toContain("targetRef");
    expect(required).toContain("patch");
    // answer 用
    expect(required).toContain("slot");
    expect(required).toContain("value");
    // noop 用
    expect(required).toContain("reason");
  });

  it("eventDraft は object | null (append 用)", () => {
    const eventDraft = operationSchema.properties.eventDraft as {
      type: string[];
    };
    expect(eventDraft.type).toEqual(["object", "null"]);
  });

  it("targetRef は string | null (modify 用)", () => {
    const targetRef = operationSchema.properties.targetRef as {
      type: string[];
    };
    expect(targetRef.type).toEqual(["string", "null"]);
  });

  it("patch は object | null (modify 用)", () => {
    const patch = operationSchema.properties.patch as { type: string[] };
    expect(patch.type).toEqual(["object", "null"]);
  });

  it("slot enum は answer 用 (when/where/what/transport/endpoint/null)", () => {
    const slot = operationSchema.properties.slot as {
      type: string[];
      enum: readonly (string | null)[];
    };
    expect(slot.type).toEqual(["string", "null"]);
    expect(slot.enum).toContain("when");
    expect(slot.enum).toContain("where");
    expect(slot.enum).toContain("what");
    expect(slot.enum).toContain("transport");
    expect(slot.enum).toContain("endpoint");
    expect(slot.enum).toContain(null);
  });

  it("value は string | null (answer 用)", () => {
    const value = operationSchema.properties.value as { type: string[] };
    expect(value.type).toEqual(["string", "null"]);
  });

  it("reason enum は noop 用 (acknowledgement / status_query / off_topic / other / null)", () => {
    const reason = operationSchema.properties.reason as {
      type: string[];
      enum: readonly (string | null)[];
    };
    expect(reason.type).toEqual(["string", "null"]);
    expect(reason.enum).toContain("acknowledgement");
    expect(reason.enum).toContain("status_query");
    expect(reason.enum).toContain("off_topic");
    expect(reason.enum).toContain("other");
    expect(reason.enum).toContain(null);
  });
});

describe("L1_RESPONSE_FORMAT — OpenAI Structured Outputs 互換性", () => {
  it("strict: true で json_schema 形式", () => {
    expect(L1_RESPONSE_FORMAT.type).toBe("json_schema");
    expect(L1_RESPONSE_FORMAT.json_schema.strict).toBe(true);
  });

  it("schema は L1_COMPREHENSION_SCHEMA を参照", () => {
    expect(L1_RESPONSE_FORMAT.json_schema.schema).toBe(L1_COMPREHENSION_SCHEMA);
  });
});
