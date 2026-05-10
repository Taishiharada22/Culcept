/**
 * parsePlanOperations — LLM raw output の operations 配列を `PlanOperation[]` に変換
 *
 * CEO 2026-04-30 PR-50 Commit 3:
 *   LLM JSON schema (structuredSchema.ts L1_COMPREHENSION_SCHEMA / OPERATION_SCHEMA)
 *   は strict mode 互換のため、各 operation を **type discriminator + 全 field を
 *   null/値で持つ flat object** として表現する。
 *
 *   一方 code 側の `PlanOperation` (planOperation.ts) は discriminated union で、
 *   type 別に必要 field のみ持つ。両者の橋渡しを本 parser で行う。
 *
 * 設計原則:
 *   - **pure**: 副作用は console.warn (parser 層 = LLM 出力品質 telemetry) のみ
 *   - **lenient drop**: 型不正の element は null 返却 (caller が drop)、throw しない
 *   - **shallow shape check**: LLM JSON schema strict mode が深い構造を担保するため、
 *     ここでは type discriminator + 必須 field の存在 / 型のみ確認
 *   - **separation of concerns**: semantic validation (e.g., append_empty_draft、
 *     modify_no_patch) は validatePlanOperation 側で実施。本層は構造変換のみ。
 */

import type {
  AnswerOperation,
  EventDraft,
  EventPatch,
  NoopOperation,
  PlanOperation,
} from "./planOperation";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Per-type parsers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * eventDraft (OPERATION_SCHEMA の EVENT_DRAFT 形) を `EventDraft` 型に変換。
 *
 * 必須 field (LLM JSON schema 上):
 *   when (object), where (object), what (object), who (array), transport (string|null),
 *   certainty ("asserted" | "tentative" | "inferred")
 *
 * shape チェック失敗 → null (= append op として無効)。
 */
export function parseEventDraft(raw: unknown): EventDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!o.when || typeof o.when !== "object") return null;
  if (!o.where || typeof o.where !== "object") return null;
  if (!o.what || typeof o.what !== "object") return null;
  if (!Array.isArray(o.who)) return null;
  if (o.transport !== null && typeof o.transport !== "string") return null;
  if (
    o.certainty !== "asserted" &&
    o.certainty !== "tentative" &&
    o.certainty !== "inferred"
  ) {
    return null;
  }
  // strict mode で各 sub-slot は required + additionalProperties:false なので
  // structural cast で十分。downstream (provenanceChecker / dispatch) が再検査する。
  return {
    when: o.when as EventDraft["when"],
    where: o.where as EventDraft["where"],
    what: o.what as EventDraft["what"],
    who: o.who as string[],
    transport: o.transport as string | null,
    certainty: o.certainty,
  };
}

/**
 * patch (OPERATION_SCHEMA の EVENT_PATCH 形) を `EventPatch` 型に変換。
 *
 * 仕様:
 *   - LLM 出力は全 patch sub-field を null/値で持つ (when / where / what / transport / who)
 *   - patch 自体が null → null 返却 (= modify_no_patch、validation 層で reject される)
 *   - 各 sub-field が null → EventPatch.<field> を omit (undefined のまま)
 *
 *   EventPatch 型は全 sub-field optional なので、null と undefined を区別する意味はない。
 *   下流の applyModifyPatch は !== null/undefined で has-value を判定する契約。
 */
export function parseEventPatch(raw: unknown): EventPatch | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const patch: EventPatch = {};

  if (o.when && typeof o.when === "object") {
    patch.when = o.when as EventPatch["when"];
  }
  if (o.where && typeof o.where === "object") {
    patch.where = o.where as EventPatch["where"];
  }
  if (o.what && typeof o.what === "object") {
    patch.what = o.what as EventPatch["what"];
  }
  if (typeof o.transport === "string") {
    patch.transport = o.transport;
  }
  if (Array.isArray(o.who)) {
    patch.who = o.who as string[];
  }
  return patch;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Single operation parser
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 1 件の OPERATION_SCHEMA 形 raw object を `PlanOperation` discriminated union に変換。
 *
 * 失敗 (null) パターン:
 *   - raw が null / 非 object
 *   - type が string でない / unknown enum
 *   - type 別の必須 field 不在 / 型不正
 *
 * pure: console.warn / log なし。caller (parsePlanOperations) が drop log を出す。
 */
export function parseOperation(raw: unknown): PlanOperation | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const t = o.type;
  if (typeof t !== "string") return null;

  switch (t) {
    case "append": {
      const draft = parseEventDraft(o.eventDraft);
      if (!draft) return null;
      return { type: "append", eventDraft: draft };
    }
    case "modify": {
      if (typeof o.targetRef !== "string") return null;
      const patch = parseEventPatch(o.patch);
      if (!patch) return null;
      return { type: "modify", targetRef: o.targetRef, patch };
    }
    case "answer": {
      const slot = o.slot;
      const value = o.value;
      if (typeof slot !== "string") return null;
      if (
        slot !== "when" &&
        slot !== "where" &&
        slot !== "what" &&
        slot !== "transport" &&
        slot !== "endpoint"
      ) {
        return null;
      }
      if (typeof value !== "string") return null;
      return {
        type: "answer",
        slot: slot as AnswerOperation["slot"],
        value,
      };
    }
    case "noop": {
      const reason = o.reason;
      const result: NoopOperation = { type: "noop" };
      if (
        reason === "acknowledgement" ||
        reason === "status_query" ||
        reason === "off_topic" ||
        reason === "other"
      ) {
        result.reason = reason;
      }
      return result;
    }
    default:
      return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Array parser (caller-facing)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * LLM raw output の operations 配列を `PlanOperation[]` に正規化する。
 *
 * 仕様:
 *   - 各 element を parseOperation で変換
 *   - null は drop + warn log (LLM 出力品質 telemetry)
 *   - 戻り値: 正常 parse できた operation の配列 (空配列 OK)
 *
 * 注意:
 *   - LLM 出力 schema は strict mode のため、本来 drop は発生しない
 *   - drop 発生 = LLM が schema 違反を出した or schema が緩い
 *     observability のため drop log を残す
 *
 * 副作用: console.warn のみ (drop の度に 1 回)。
 */
export function parsePlanOperations(rawOps: unknown[]): PlanOperation[] {
  const out: PlanOperation[] = [];
  for (let i = 0; i < rawOps.length; i++) {
    const parsed = parseOperation(rawOps[i]);
    if (parsed) {
      out.push(parsed);
    } else {
      console.warn("[alter-morning/comprehension] operation parse drop", {
        index: i,
        rawType:
          rawOps[i] && typeof rawOps[i] === "object"
            ? (rawOps[i] as { type?: unknown }).type
            : typeof rawOps[i],
      });
    }
  }
  return out;
}
