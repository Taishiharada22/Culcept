/**
 * Reality Control OS — A-2 Draft → Real ID Mapping + SourceTrace Injection（**pure・no-write・no-apply**・barrel 非 export）
 *
 * 設計: docs/reality-apply-readiness-audit.md（§3 G1/G2 / §8 A-2）
 *
 * 役割: Apply Readiness Audit が固定した **G1（sourceTraces 空）+ G2（synthetic itemId）** を **書かずに**解消する pure mapper。
 *   synthetic `draft:` itemId を **port 注入の mint** で real candidate id に置換し、**auditable な provenance** を注入する。
 *   出力は依然 **draft（apply しない）**。A-1 checker に渡すと `provenance_missing` が解消される（他の判定は A-1 が継続）。
 *
 * 厳守:
 *   - **元 draft を mutation しない**（全て新規オブジェクト）・**undo 可逆性を壊さない**（itemId を一貫 rename・timing 保持）。
 *   - **id mint は port 注入**（実 DB 採番/server writer に進まない）・collision は blocker。
 *   - **raw/PII/title/location/utterance/seedRef/personality/trait を注入しない**（provenance は auditable かつ redaction-clean のみ通す）。
 *   - ChangeSet.id は **据え置き**（deterministic な idempotency key・A-1 の already_applied 照合に使う）。pure（IO/DB/Date.now なし）。
 */

import type { ChangeOp, ChangeSet, PlanItemSnapshot } from "../change-set";
import { isAuditable, type SourceTrace } from "../source-trace";

/** synthetic itemId → real candidate id を採番する port（**実採番は server gate**・本層は fake/test）。 */
export interface IdMintPort {
  /** synthetic `draft:` itemId から real candidate id を返す（deterministic 推奨・collision は呼び出し側が検出）。 */
  mintRealId(syntheticItemId: string): string;
}

export interface PrepareApplyDraftInput {
  /** 整形対象の ChangeSet draft。 */
  readonly draft: ChangeSet;
  /** id 採番 port（注入）。 */
  readonly idMint: IdMintPort;
  /** 注入候補の provenance（**既存観測由来**・auditable かつ redaction-clean のみ採用）。 */
  readonly provenance: readonly SourceTrace[];
}

export interface PreparedApplyDraft {
  /** real-id + provenance 付きの ChangeSet（blocker があれば null）。 */
  readonly prepared: ChangeSet | null;
  /** synthetic → real の対応表（mint した分のみ）。 */
  readonly draftToRealIdMap: Readonly<Record<string, string>>;
  /** apply 準備を妨げる安定コード（redacted）。 */
  readonly blockers: readonly string[];
  /** 非ブロックの注意（redacted）。 */
  readonly warnings: readonly string[];
}

/** provenance に **注入してはいけない** raw/PII マーカー。 */
const FORBIDDEN = /seed_?ref|utterance|personality|trait|title|location|住所|@[a-z]|\b\d{10,}\b/i;

/** trace が redaction-clean か（raw/PII を含まない）。reason/ref を検査。 */
function isRedactionClean(t: SourceTrace): boolean {
  return !FORBIDDEN.test(t.reason ?? "") && !FORBIDDEN.test(t.ref ?? "");
}

function isSynthetic(id: string): boolean {
  return id.startsWith("draft:");
}

/**
 * A-2: synthetic draft → real-id ChangeSet + provenance 注入（**pure・apply しない・元 draft 不変**）。
 */
export function prepareApplyDraft(input: PrepareApplyDraftInput): PreparedApplyDraft {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const { draft, idMint } = input;

  if (draft.ops.length === 0) warnings.push("no_ops");

  // ── provenance 検証（auditable かつ redaction-clean のみ採用）──
  const auditable: SourceTrace[] = [];
  for (const t of input.provenance) {
    if (!isRedactionClean(t)) {
      blockers.push("provenance_contains_raw"); // raw を注入しない（fail loud）
      continue;
    }
    if (!isAuditable(t)) {
      warnings.push("trace_dropped_unauditable");
      continue;
    }
    auditable.push(t);
  }
  if (auditable.length === 0) blockers.push("provenance_missing");

  // ── id mint + collision 検出 ──
  const map: Record<string, string> = {};
  const syntheticIds = [...new Set(draft.ops.map((o) => o.itemId).filter(isSynthetic))];
  const passthrough = new Set(draft.ops.map((o) => o.itemId).filter((id) => !isSynthetic(id)));
  for (const sid of syntheticIds) {
    const real = idMint.mintRealId(sid);
    if (typeof real !== "string" || real.length === 0) {
      blockers.push("id_mint_failed");
      continue;
    }
    map[sid] = real;
  }
  const realIds = Object.values(map);
  const hasDupRealId = new Set(realIds).size !== realIds.length;
  const collidesPassthrough = realIds.some((r) => passthrough.has(r));
  if (hasDupRealId || collidesPassthrough) blockers.push("id_collision");

  // ── blocker があれば prepared を作らない（半端な ChangeSet を返さない）──
  if (blockers.length > 0) {
    return { prepared: null, draftToRealIdMap: map, blockers, warnings };
  }

  // ── prepared ChangeSet を新規構築（元 draft を mutation しない・itemId を一貫 rename）──
  const remap = (id: string): string => (isSynthetic(id) ? map[id] ?? id : id);
  const remapSnap = (s: PlanItemSnapshot): PlanItemSnapshot => ({ ...s, itemId: remap(s.itemId) });
  const remapOp = (op: ChangeOp): ChangeOp => {
    if (op.kind === "add") return { kind: "add", itemId: remap(op.itemId), after: remapSnap(op.after) };
    if (op.kind === "remove") return { kind: "remove", itemId: remap(op.itemId), before: remapSnap(op.before) };
    return { kind: "update", itemId: remap(op.itemId), before: remapSnap(op.before), after: remapSnap(op.after) };
  };

  const prepared: ChangeSet = {
    id: draft.id, // 据え置き（idempotency key）
    ops: draft.ops.map(remapOp),
    reason: draft.reason,
    sourceTraces: auditable, // G1 解消（auditable な provenance を注入）
  };

  return { prepared, draftToRealIdMap: map, blockers, warnings };
}
