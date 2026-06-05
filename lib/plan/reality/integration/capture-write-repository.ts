import "server-only";
/**
 * Reality Control OS — A1-5-4b-0/1 Structured Capture Write Seam Skeleton（DI・**fake/no-run のみ・実 DB write なし**）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.16 + §8.17
 *
 * 役割: A1-5-4a `CaptureDrafts`（seedDraft + 任意 evidenceDraft）を、将来 DB へ **atomic** に書くための
 *   write 経路の **器**（DI client 注入・payload 整形・consistency 検証）を確定する。
 *   **今回は実 DB INSERT をしない**（fake/no-run client のみ）。実 client（Supabase RPC）は A1-5-4b。
 *
 * ── atomicity 設計（A1-5-4b-0）──
 *   plan_seeds と plan_seed_duration_evidences は **atomic（両方 or どちらも書かない）** に書くべき:
 *     - composite FK (seed_id,user_id)→plan_seeds(id,user_id) が **orphan evidence を既に防ぐ**（evidence は seed 必須）。
 *     - 残る partial 危険は「seed 成功・evidence 失敗 → 明示 duration の喪失（degraded UX）」のみ。
 *   → **推奨: atomic RPC**（既存 `create_external_anchor_bundle` と同型・SECURITY INVOKER・owner 検証・
 *      1 transaction で seed→evidence を INSERT）。real `CaptureWriteClient` は RPC を 1 回呼ぶ。**RPC 作成は A1-5-4b migration（今回禁止）**。
 *   本 skeleton は **単一 `writeCapture(payload)` 契約**で atomicity を interface レベルで強制（seed だけ/evidence だけの分割呼びを作らない）。
 *
 * 厳守:
 *   - **実 DB INSERT/接続なし**（DI client 依存・fake/no-run のみ）。Supabase client / `.from(...).insert(...)` / service_role なし。
 *   - **raw を payload に持ち込まない**（payload = structured-only draft）。source_ref は opaque。
 *   - **user_id 整合**（seed.user_id == evidence.user_id）・**seed linkage**（evidence.seed_id == seed.id）を write 前に検証。
 *   - `server-only` / barrel 非 export / runtime・route・UI から呼ばない。
 */

import type { PlanSeedInsertDraft, DurationEvidenceInsertDraft, CaptureDrafts } from "../seed-capture-mapper";

/** atomic に書く payload（structured-only draft の束・raw なし）。 */
export interface CaptureWritePayload {
  readonly seed: PlanSeedInsertDraft;
  readonly evidence: DurationEvidenceInsertDraft | null;
}

export type CaptureWriteCode = "ok" | "owner_mismatch" | "seed_link_mismatch" | "no_run" | "write_failed";

export interface CaptureWriteOutcome {
  readonly ok: boolean;
  readonly code: CaptureWriteCode;
}

/**
 * atomic write client（DI）。**real 実装は A1-5-4b**: Supabase RPC（`create_external_anchor_bundle` 同型）で
 *   seed+evidence を **1 transaction**。fake/no-run はここで注入し実 DB に触れない。
 */
export interface CaptureWriteClient {
  /** payload を **atomic** に書く（real: RPC 1 回・1 transaction）。本 skeleton では fake/no-run のみ。 */
  writeCapture(payload: CaptureWritePayload): Promise<CaptureWriteOutcome>;
}

/** drafts → CaptureWritePayload（純・draft をそのまま束ねる・raw を持ち込まない）。 */
export function buildCaptureWritePayload(drafts: CaptureDrafts): CaptureWritePayload {
  return { seed: drafts.seedDraft, evidence: drafts.evidenceDraft };
}

/**
 * A1-5-4b-1: capture drafts を atomic write client に渡す seam。
 *   1. payload 整形（buildCaptureWritePayload）。
 *   2. consistency 検証（evidence があれば owner 一致 + seed linkage）→ 不整合は write 前 reject（composite FK 担保前の fail-fast）。
 *   3. `client.writeCapture(payload)`（**atomic**・real: RPC / fake/no-run: 実 DB なし）。
 * **実 DB INSERT は client 実装依存**（本 skeleton では起きない）。
 */
export async function writeStructuredCapture(drafts: CaptureDrafts, client: CaptureWriteClient): Promise<CaptureWriteOutcome> {
  const payload = buildCaptureWritePayload(drafts);
  if (payload.evidence) {
    if (payload.evidence.user_id !== payload.seed.user_id) return { ok: false, code: "owner_mismatch" }; // owner 不一致 → 書かない
    if (payload.evidence.seed_id !== payload.seed.id) return { ok: false, code: "seed_link_mismatch" }; // seed linkage 不一致 → 書かない
  }
  return client.writeCapture(payload);
}

// ── fake / no-run client（テスト用・**実 DB に触れない**） ──

/** fake client: payload を記録するだけ（**DB write 0**）。writeCapture は ok を返す（書いた振り・payload shape 検証用）。 */
export interface FakeCaptureWriteClient extends CaptureWriteClient {
  readonly writes: CaptureWritePayload[];
}
export function createFakeCaptureWriteClient(): FakeCaptureWriteClient {
  const writes: CaptureWritePayload[] = [];
  return {
    writes,
    async writeCapture(payload) {
      writes.push(payload);
      return { ok: true, code: "ok" };
    },
  };
}

/** no-run client: 一切書かず `no_run` を返す（**実 DB 接続 0・write 0**）。 */
export function createNoRunCaptureWriteClient(): CaptureWriteClient {
  return {
    async writeCapture() {
      return { ok: false, code: "no_run" };
    },
  };
}
