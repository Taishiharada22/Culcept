import "server-only";
/**
 * Reality Control OS — A1-6-1 Candidate Action Handle / Request Contract（**server-only・deterministic・no-DB**・barrel 非 export）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.1
 *
 * 役割: client に **seedRef / UUID を出さず**に candidate 操作（accept/dismiss/later）を成立させる仕組み。
 *   - **opaque candidate handle**（一方向 hash・`handle = "c1:" + sha256(seedRef)`）: surface DTO に seedRef の代わりに置く参照。
 *     client は seedRef を持たない→handle を偽造不能。server は **認証 user の surfaceable seed を再 read + 再導出**で照合解決。
 *   - **request contract**（client→server）: `{ handle, action }`。untrusted ゆえ fail-closed に validate。
 *   - **解決方針**: handle → **現在 surfaceable** な candidate の seedRef（surface 不可＝stale/expired/consumed/duplicate-suppressed/unknown→fail-closed）。
 *     → decideCandidateAction（idempotency）。resolved.seedRef は **server-side のみ**（client response は redactResolutionForClient で outcome だけ）。
 *
 * 厳守:
 *   - **client に seedRef/UUID を出さない**: handle は一方向 hash（seedRef 復元不能）。resolution の seedRef は server-side（client response 非搬送）。
 *   - **fail-closed**: malformed request / invalid handle・action / 未解決(stale/expired/consumed) / 非 actionable → 全て reject（no-op）。
 *   - **deterministic・no-DB/network/Date.now/random**: sha256 は決定的（secret 不要・stateless）。surfaceable 集合は **注入**（実 read は別 slice の live path）。
 *   - 実 status update / 実 plan 反映 / surface DTO への handle 付与 / action route は **別 slice（live path・危険境界）**。本 module は contract + 解決 + redaction の pure 部のみ。
 */

import { createHash } from "node:crypto";
import { decideCandidateAction, isValidActionKind, type CandidateActionKind, type CandidateActionOutcome } from "../candidate-action";
import type { PlanSeedStatus } from "../../plan-seed";

/** handle scheme バージョン（将来の方式変更に備える前置）。 */
const HANDLE_VERSION = "c1";
/** handle 形式（`c1:` + sha256 hex 64）。validate / fail-closed 用。 */
export const CANDIDATE_HANDLE_RE = /^c1:[0-9a-f]{64}$/;

/**
 * seedRef → **opaque candidate handle**（一方向 sha256・server-side・seedRef 復元不能）。
 *   userId 結合は RLS scope（解決は認証 user の surfaceable のみ）ゆえ不要（defense-in-depth で将来追加可）。
 */
export function deriveCandidateHandle(seedRef: string): string {
  return `${HANDLE_VERSION}:${createHash("sha256").update(seedRef).digest("hex")}`;
}

/** client→server action request（**contract**・handle は opaque・seedRef を持たない）。 */
export interface CandidateActionRequest {
  readonly handle: string;
  readonly action: CandidateActionKind;
}

/** request validation の結果（fail-closed・raw を持ち込まない）。 */
export type ActionRequestParse =
  | { readonly ok: true; readonly handle: string; readonly action: CandidateActionKind }
  | { readonly ok: false; readonly reason: "not_object" | "invalid_handle" | "invalid_action" };

/**
 * A1-6-1: untrusted client request → **validated**（pure・fail-closed）。
 *   object でない / handle 形式不正 / action 不正 → reject（reason code のみ・raw を出さない）。
 */
export function validateActionRequest(raw: unknown): ActionRequestParse {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not_object" };
  const r = raw as Record<string, unknown>;
  if (typeof r.handle !== "string" || !CANDIDATE_HANDLE_RE.test(r.handle)) return { ok: false, reason: "invalid_handle" };
  if (typeof r.action !== "string" || !isValidActionKind(r.action)) return { ok: false, reason: "invalid_action" };
  return { ok: true, handle: r.handle, action: r.action };
}

/** 現在 surfaceable な candidate（server read 由来・seedRef + status・client 非搬送）。 */
export interface SurfaceableCandidate {
  readonly seedRef: string;
  readonly status: PlanSeedStatus;
}

/**
 * A1-6-1: handle → **現在 surfaceable な candidate に解決**（pure given surfaceable・**fail-closed**）。
 *   handle と一致する seedRef（deriveCandidateHandle 再導出）を surfaceable から探す。無ければ null
 *   （= stale/expired/consumed/duplicate-suppressed/unknown ＝ 現在 surface 不可 ＝ 操作不可・race-safe）。
 */
export function resolveCandidateHandle(
  handle: string,
  surfaceable: readonly SurfaceableCandidate[]
): SurfaceableCandidate | null {
  for (const c of surfaceable) {
    if (deriveCandidateHandle(c.seedRef) === handle) return c;
  }
  return null;
}

/** action 解決の結果（**server-side**・resolved.seedRef は live path 用・client へは redact）。 */
export type CandidateActionResolution =
  | { readonly resolved: true; readonly seedRef: string; readonly outcome: CandidateActionOutcome }
  | { readonly resolved: false; readonly reason: "not_object" | "invalid_handle" | "invalid_action" | "unresolved" | "not_actionable" };

/**
 * A1-6-1: action request（untrusted）+ 現在 surfaceable 集合 → **解決 + 決定**（pure given surfaceable・fail-closed）。
 *   validate → resolveHandle（surfaceable のみ・fail-closed）→ decideCandidateAction（idempotency 防御）。
 *   **resolved.seedRef は server-side のみ**（live path の status update / plan 反映 用）。client response は redactResolutionForClient。
 */
export function resolveAndDecideAction(
  raw: unknown,
  surfaceable: readonly SurfaceableCandidate[]
): CandidateActionResolution {
  const parsed = validateActionRequest(raw);
  if (!parsed.ok) return { resolved: false, reason: parsed.reason };
  const candidate = resolveCandidateHandle(parsed.handle, surfaceable);
  if (candidate === null) return { resolved: false, reason: "unresolved" }; // stale/expired/consumed/unknown
  const outcome = decideCandidateAction(parsed.action, candidate.status);
  if (!outcome.valid) return { resolved: false, reason: "not_actionable" }; // idempotency 防御（surfaceable は通常 active）
  return { resolved: true, seedRef: candidate.seedRef, outcome };
}

/** client へ返す redacted response（**seedRef / nextStatus を出さない**・accepted + 表示用 meta のみ）。 */
export interface RedactedActionResponse {
  /** action が成立したか（resolved ∧ valid）。 */
  readonly accepted: boolean;
  /** redacted reason code（raw/seedRef を持たない）。 */
  readonly reason: string;
  /** plan へ反映するか（UI 表示用・accept のみ true）。 */
  readonly reflectsToPlan: boolean;
  /** later（deferred）か（UI 表示用）。 */
  readonly deferred: boolean;
}

/**
 * A1-6-1: resolution → **client response（redacted）**。route が client へ返す形。
 *   **seedRef / nextStatus を出さない**（server-side bookkeeping）。accepted + reflectsToPlan + deferred + reason code のみ。
 */
export function redactResolutionForClient(resolution: CandidateActionResolution): RedactedActionResponse {
  if (!resolution.resolved) {
    return { accepted: false, reason: resolution.reason, reflectsToPlan: false, deferred: false };
  }
  return {
    accepted: resolution.outcome.valid,
    reason: resolution.outcome.reason,
    reflectsToPlan: resolution.outcome.reflectsToPlan,
    deferred: resolution.outcome.deferred,
  };
}
