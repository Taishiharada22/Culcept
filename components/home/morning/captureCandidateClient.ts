/**
 * Reality Control OS — A1-5-7-7 Capture Candidate Client Bridge（**client-side・dormant・no-real-network**）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.47
 *
 * 役割: V2 route（`/api/alter-morning/plan`）response の `data.captureCandidate?`（A1-5-7-5・redacted）を
 *   client 側で **抽出 → MorningPlanCard へ流す** ための bridge。**dormant**（flag off → fetch 0 → undefined → 既存 UI 完全不変）。
 *
 * 厳守:
 *   - **dormant**: `enabled=false`（本番デフォルト）→ **fetch 0 / undefined**（real network なし・既存 UI 不変）。
 *   - **fail-open**: fetch / parse 失敗 → undefined（UI を壊さない）。`captureCandidate` absent → undefined（既存 UI 不変）。
 *   - **client boundary 最終 redaction**: `redactCaptureCandidateSurface`（A1-5-7-2・pure・allowlist 再構築）で **source_ref / UUID / raw を保持しない**。
 *   - **本 slice では real network を走らせない**（caller の live fetch は別 GO）。テストは fake fetchImpl。route.ts / route response は変えない。
 *   - pure-logic（DB / Supabase / RPC / LLM なし）。`fetchImpl` は DI（テスト fake / production は flag off で未使用）。
 */

import { redactCaptureCandidateSurface } from "@/lib/plan/reality/integration/candidate-response-assembler";
import type { CandidateSurfaceDTO, CandidateSurfaceItem } from "@/lib/plan/reality/integration/candidate-surface";
import type { CandidateActionKind } from "@/lib/plan/reality/candidate-action";
import { reflectConsumedSeedsIntoMorningPlan } from "@/lib/plan/reality/consumed-seed-morning-reflection";
import type { ReflectableConsumedSeed } from "@/lib/plan/reality/consumed-seed-merge";
import type { MorningPlan } from "@/lib/alter-morning/types";

/** V2 route path（fixed・**fetch は dormant**）。 */
export const CAPTURE_CANDIDATE_V2_ROUTE = "/api/alter-morning/plan";

/**
 * V2 route response（`{ ok, data }`）→ `captureCandidate`（**pure・redacted**）。
 *   ok!==true / data なし / captureCandidate なし / hasCandidate!==true → **undefined**（既存 UI 不変）。
 *   有効時は **`redactCaptureCandidateSurface` で再構築**（client が source_ref/UUID/raw を保持しない）。
 */
/** captureCandidate 値（unknown）→ validate + **client boundary 最終 redaction**（hasCandidate/items 検証→既知 field のみ再構築）。 */
function toRedactedCaptureCandidate(cc: unknown): CandidateSurfaceDTO | undefined {
  if (!cc || typeof cc !== "object") return undefined;
  const c = cc as Partial<CandidateSurfaceDTO>;
  if (c.hasCandidate !== true || !Array.isArray(c.items)) return undefined;
  // extra/raw/source_ref/UUID を drop（既知 field のみ）
  return redactCaptureCandidateSurface(c as CandidateSurfaceDTO);
}

export function selectCaptureCandidate(responseJson: unknown): CandidateSurfaceDTO | undefined {
  if (!responseJson || typeof responseJson !== "object") return undefined;
  const r = responseJson as { ok?: unknown; data?: unknown };
  if (r.ok !== true || !r.data || typeof r.data !== "object") return undefined;
  return toRedactedCaptureCandidate((r.data as { captureCandidate?: unknown }).captureCandidate);
}

/**
 * A1-5-8-0/1: **B案 contract** の extractor — production morning route(`/api/stargazer/alter`)response の
 *   `morningProtocol.captureCandidate` を抽出（redacted）。client は `data.morningProtocol.plan` を読むゆえ captureCandidate も同じ morningProtocol 直下が自然。
 *   morningProtocol なし / captureCandidate なし / hasCandidate!==true → undefined（既存 UI 不変・fail-open）。
 *   route alignment 決定（B案）の **pure contract skeleton**。本 slice では UI 未配線（live は別 GO）。
 */
export function selectMorningProtocolCaptureCandidate(responseJson: unknown): CandidateSurfaceDTO | undefined {
  if (!responseJson || typeof responseJson !== "object") return undefined;
  const mp = (responseJson as { morningProtocol?: unknown }).morningProtocol;
  if (!mp || typeof mp !== "object") return undefined;
  return toRedactedCaptureCandidate((mp as { captureCandidate?: unknown }).captureCandidate);
}

/**
 * A1-5-7-7: V2 route を **gated fetch** し captureCandidate を返す bridge（**dormant・fail-open・DI fetch**）。
 *   - `enabled=false`（本番デフォルト）→ **fetchImpl を呼ばず undefined**（fetch 0・real network なし・既存 UI 不変）。
 *   - `enabled=true` → `fetchImpl`（テスト fake / 本番は flag off で未到達）で POST → `selectCaptureCandidate`。失敗は undefined（fail-open）。
 *   caller（将来 AskHero 親）は `enabled=PLAN_FLAGS.realityCaptureSurfaceClient` を渡す。本 slice では live で呼ばれない（dormant）。
 */
export async function fetchCaptureCandidate(opts: {
  readonly enabled: boolean;
  readonly body: unknown;
  readonly fetchImpl?: typeof fetch;
}): Promise<CandidateSurfaceDTO | undefined> {
  if (!opts.enabled) return undefined; // dormant: flag off → fetch 0
  try {
    const doFetch = opts.fetchImpl ?? (typeof globalThis !== "undefined" ? globalThis.fetch : undefined);
    if (!doFetch) return undefined;
    const res = await doFetch(CAPTURE_CANDIDATE_V2_ROUTE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(opts.body),
    });
    return selectCaptureCandidate(await res.json());
  } catch {
    return undefined; // fail-open（UI を壊さない）
  }
}

// ── A1-5-7-8 inert submit bridge（audit 結果: production morning は /api/stargazer/alter・V2 route は未消費＝live は別 GO） ──

/** submit から V2 route body を作る最小入力（utterance のみ・任意 targetDateHint）。 */
export interface CaptureCandidateSubmit {
  /** ユーザー発話（V2 route の必須 field・**body は transient・client で persist しない**）。 */
  readonly utterance: string;
  /** 任意の対象日 hint（today/tomorrow/YYYY-MM-DD）。 */
  readonly targetDateHint?: string;
}

/**
 * A1-5-7-8: submit → V2 route body（**pure・必要最小限**）。`utterance`（+ 任意 `targetDateHint`）のみ。
 *   phenotype / partyBaseline / weatherContext 等の richer field は **載せない**（最小 body・raw を余計に持ち込まない）。
 */
export function buildCaptureCandidateRequestBody(
  submit: CaptureCandidateSubmit
): { readonly utterance: string; readonly targetDateHint?: string } {
  return submit.targetDateHint
    ? { utterance: submit.utterance, targetDateHint: submit.targetDateHint }
    : { utterance: submit.utterance };
}

/**
 * A1-5-7-8: **inert submit bridge**（submit → body → gated fetch → captureCandidate）。**dormant**。
 *   `enabled=false`（本番デフォルト）→ fetch 0 → undefined（既存 UI 不変）。`enabled=true` → fetchImpl（テスト fake）→ captureCandidate。
 *   **本 slice では live で呼ばれない**（AneurasyncHome 未配線）。audit 結果ゆえ live fetch は別 GO（V2 が production morning route 化、または surface を /api/stargazer/alter へ移す）。
 */
export async function submitForCaptureCandidate(
  submit: CaptureCandidateSubmit,
  opts: { readonly enabled: boolean; readonly fetchImpl?: typeof fetch }
): Promise<CandidateSurfaceDTO | undefined> {
  return fetchCaptureCandidate({
    enabled: opts.enabled,
    body: buildCaptureCandidateRequestBody(submit),
    fetchImpl: opts.fetchImpl,
  });
}

// ── A1-6-2 candidate action request builder（pure・client→server contract・handle は opaque・seedRef を持たない） ──

/** client→server の candidate action request body（**handle は opaque な一方向 hash**・seedRef を持たない）。 */
export interface CandidateActionRequestBody {
  readonly handle: string;
  readonly action: CandidateActionKind;
}

/**
 * A1-6-2: surface item の opaque `handle` + action（accept/dismiss/later）→ **action request body**（pure・最小）。
 *   handle は一方向 hash ゆえ client は seedRef を持たない（偽造不能）。server 側で `validateActionRequest` により再 validate（fail-closed）。
 *   **本 slice では live で呼ばれない**（action route 接続 / UI ボタンは別 GO・危険境界）。type は `CandidateActionKind`（client-safe・pure）。
 */
export function buildCandidateActionRequest(
  handle: string,
  action: CandidateActionKind
): CandidateActionRequestBody {
  return { handle, action };
}

// ── A1-6-8 candidate action client（real POST + optimistic plan reflection・**client-safe・pure helpers**） ──

/** candidate action route path（A1-6-6・user-RLS・status-only）。 */
export const REALITY_CANDIDATE_ACTION_ROUTE = "/api/reality/candidate-action";

/**
 * action route response（`{ok,data:RedactedActionResponse}`）の **client 表現**。
 *   - `ok`: HTTP + envelope 成功（false=network/parse/HTTP error→**fail-safe**）。
 *   - `accepted`: action が成立したか（false=invalid handle/action·unresolved·non-active·conflict＝**安全に失敗表示**）。
 *   - seedRef/UUID/raw を **持たない**（route が redacted・client も持ち込まない）。
 */
export interface CandidateActionResult {
  readonly ok: boolean;
  readonly accepted: boolean;
  readonly reason: string;
  readonly reflectsToPlan: boolean;
  readonly deferred: boolean;
}

const FAILED_ACTION_RESULT: CandidateActionResult = {
  ok: false,
  accepted: false,
  reason: "failed",
  reflectsToPlan: false,
  deferred: false,
};

/**
 * A1-6-8: `{handle, action}` を `/api/reality/candidate-action` に POST し結果を返す（**fail-safe**）。
 *   network/parse/HTTP error / envelope 不正 → `FAILED_ACTION_RESULT`（UI を壊さない・安全に失敗表示）。
 *   request は **{handle, action} のみ**（buildCandidateActionRequest）。`fetchImpl` は DI（テスト fake）。
 */
export async function postCandidateAction(
  handle: string,
  action: CandidateActionKind,
  fetchImpl?: typeof fetch
): Promise<CandidateActionResult> {
  try {
    const doFetch = fetchImpl ?? (typeof globalThis !== "undefined" ? globalThis.fetch : undefined);
    if (!doFetch) return FAILED_ACTION_RESULT;
    const res = await doFetch(REALITY_CANDIDATE_ACTION_ROUTE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildCandidateActionRequest(handle, action)),
    });
    const json = (await res.json()) as { ok?: unknown; data?: Partial<CandidateActionResult> };
    if (json?.ok === true && json.data && typeof json.data === "object") {
      const d = json.data;
      return {
        ok: true,
        accepted: d.accepted === true,
        reason: typeof d.reason === "string" ? d.reason : "ok",
        reflectsToPlan: d.reflectsToPlan === true,
        deferred: d.deferred === true,
      };
    }
    return FAILED_ACTION_RESULT;
  } catch {
    return FAILED_ACTION_RESULT; // fail-safe（UI を壊さない）
  }
}

/**
 * A1-6-8: accept した candidate item を **MorningPlan に optimistic add**（A1-6-7 の `reflectConsumedSeedsIntoMorningPlan` 再利用）。
 *   client が candidate item から `ReflectableConsumedSeed`（status=consumed・band は TimeBandLabel=TimeBand）を構築し **同一 merge** に通す
 *   → server(A1-6-7) と **同一の PlanItem**（id=handle）を生成（drift なし・次の server fetch で同 id ゆえ置換）。
 *   plan null / handle 欠落 / 別日 / undated → plan 不変（merge の date filter・additive）。
 */
export function applyAcceptedCandidateToPlan(
  plan: MorningPlan | null,
  item: CandidateSurfaceItem
): MorningPlan | null {
  if (!plan || typeof item.handle !== "string") return plan;
  const seed: ReflectableConsumedSeed = {
    status: "consumed",
    durationMin: item.durationMin,
    date: item.date,
    band: item.band,
    handle: item.handle,
  };
  return reflectConsumedSeedsIntoMorningPlan(plan, [seed]);
}

/**
 * A1-6-8: candidate DTO から handle 一致の item を **除去**（accept/dismiss 後・client 表示更新）。
 *   除去で `hasCandidate`/`candidateCount` を再計算（0 件 → banner null）。一致なし → 同一参照（no-op）。
 */
export function removeCandidateItem(
  dto: CandidateSurfaceDTO | undefined,
  handle: string
): CandidateSurfaceDTO | undefined {
  if (!dto) return dto;
  const items = dto.items.filter((it) => it.handle !== handle);
  if (items.length === dto.items.length) return dto; // 一致なし → 同一参照
  return { ...dto, items, hasCandidate: items.length > 0, candidateCount: items.length };
}

/** A1-6-8: action 後の client state（plan + candidate DTO）。 */
export interface CandidateActionState {
  readonly plan: MorningPlan | null;
  readonly candidate: CandidateSurfaceDTO | undefined;
}

/**
 * A1-6-8: action 結果から **次の client state を計算**（pure・testable・hook が setState に流す）。
 *   - 失敗（!ok / !accepted）or **later（no-op・deferred）** → state 不変（同一参照）。
 *   - accept（成立）→ plan に optimistic add + candidate から item 除去。
 *   - dismiss（成立）→ candidate から item 除去（plan 不変）。
 */
export function applyCandidateActionResult(
  state: CandidateActionState,
  handle: string,
  action: CandidateActionKind,
  result: CandidateActionResult
): CandidateActionState {
  if (!result.ok || !result.accepted || action === "later") return state; // 失敗 / later(no-op) → 不変
  const item = state.candidate?.items.find((it) => it.handle === handle) ?? null;
  const candidate = removeCandidateItem(state.candidate, handle);
  const plan = action === "accept" && item ? applyAcceptedCandidateToPlan(state.plan, item) : state.plan;
  return plan === state.plan && candidate === state.candidate ? state : { plan, candidate };
}
