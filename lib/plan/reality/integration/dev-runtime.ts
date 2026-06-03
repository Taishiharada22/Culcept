/**
 * Reality Control OS — Stage 4-B-1 dev-only runtime smoke（CEO 条件付き GO・2026-06-03）
 *
 * 設計: docs/aneurasync-reality-control-os-stage4b-runtime-data-access-plan.md
 *
 * CEO 承認条件（厳守）:
 *   - CEO **1 アカウントのみ** / anchors + DayGraph のみ / **PlanSeed 読まない**
 *   - raw title / location / notes / user text / 第三者名 / source raw signal を **読まない**
 *   - server-only / dev-only / **production は必ず no-op** / flag 既定 off
 *   - CEO 明示許可 flag/capability が無ければ **fail-closed no-op**
 *   - console.log 禁止 / file 出力禁止 / DB 保存禁止 / push 禁止 / UI 表示禁止 / PRM 実更新禁止 / native・Routes 禁止
 *   - 戻り値は **assertRedacted 通過済 redacted object のみ**。redaction 失敗時は破棄し raw を含まない error code のみ
 *   - **単発/手動 dev smoke**。常時 shadow・自動実行・定期実行・全ユーザー・population read **禁止**
 *
 * 構造的安全（規律でなく型で保証）:
 *   - `RealityDataSource` に **seed 読取メソッドは無い**（seeds を読めない）。
 *   - 返り値 `RealityInput` に **title/location フィールドは無い**（input-adapter 定義。raw を運べない）。
 *   - core は **supabase / route / UI を import しない**（純粋オーケストレーション + 依存注入）。
 *   - **barrel（index.ts）から再 export しない**（module boundary。本番 import 経路を作らない）。
 *
 * 本 core は実データを読まない。実読取は注入される `RealityDataSource` の実装（manual smoke 時のみ）。
 * 実装は **column-restricted read**（title/location を SELECT しない。§ doc の spec 参照）で満たすこと。
 */

import { runShadow, type ShadowSummary } from "./shadow-runner";
import { assertRedacted } from "./redaction-guard";
import type { RealityInput } from "./input-adapter";
import type { BestActionCandidate } from "../best-action";
import type { ReceptivityInput } from "../receptivity-gate";

// ── 多層 fail-closed gate（純粋・nodeEnv は呼び出し側が渡す） ──

export interface SmokeGate {
  /** process.env.NODE_ENV（純粋化のため引数で受ける） */
  readonly nodeEnv: string;
  /** PLAN_FLAGS.realityShadowDevOnly（既定 false） */
  readonly flagEnabled: boolean;
  /** capability token（production code path から取得させない明示バリア） */
  readonly capability: "dev-only" | undefined;
  /** 読む対象 user */
  readonly requestedUserId: string;
  /** 許可された CEO 1 account（設定。未設定なら誰も許可しない） */
  readonly allowedDevUserId: string | undefined;
}

export type SmokeNoopCode =
  | "PRODUCTION"
  | "FLAG_OFF"
  | "NO_CAPABILITY"
  | "OUT_OF_SCOPE_USER"
  | "NO_INPUT"
  | "ADAPTER_DEGRADED"
  | "KERNEL_ERROR";

export type SmokeResult =
  | { readonly status: "ok"; readonly summary: ShadowSummary }
  | { readonly status: "noop"; readonly code: SmokeNoopCode }
  | { readonly status: "blocked"; readonly code: "REDACTION_BLOCKED"; readonly offendingCount: number };

/** gate 判定（fail-closed）。全条件を満たさなければ noop code を返す。 */
export function evaluateSmokeGate(g: SmokeGate): { readonly pass: true } | { readonly pass: false; readonly code: SmokeNoopCode } {
  if (g.nodeEnv === "production") return { pass: false, code: "PRODUCTION" };
  if (!g.flagEnabled) return { pass: false, code: "FLAG_OFF" };
  if (g.capability !== "dev-only") return { pass: false, code: "NO_CAPABILITY" };
  if (!g.allowedDevUserId || g.requestedUserId !== g.allowedDevUserId) return { pass: false, code: "OUT_OF_SCOPE_USER" };
  return { pass: true };
}

// ── 依存注入: 実読取は注入実装（manual smoke 時のみ） ──

/**
 * anchors + DayGraph のみを **allowlist 済 RealityInput** として返すデータソース。
 *   - **seed を読むメソッドは存在しない**（型レベルで seeds 不可）。
 *   - RealityInput に title/location は無い（型レベルで raw 不可）。
 *   - 実装は column-restricted read（title/location/notes を SELECT しない）で満たすこと。
 *   - 実装ファイルは `import "server-only"` を付け server 限定にすること。
 */
export interface RealityDataSource {
  loadForSmoke(userId: string): Promise<RealityInput | null>;
}

export interface SmokeDeps {
  readonly gate: SmokeGate;
  readonly dataSource: RealityDataSource;
  /** 候補 generator は未実装ゆえ任意（default 空）。4-B-1 は input 接触 + 出力 redaction の確認が主目的。 */
  readonly candidates?: readonly BestActionCandidate[];
  readonly receptivity?: ReceptivityInput;
}

/** 出力の redaction を強制（producer 自己表明）。clean のときのみ summary を返す。 */
export function enforceRedaction(summary: ShadowSummary): SmokeResult {
  const verdict = assertRedacted(summary);
  if (!verdict.clean) {
    return { status: "blocked", code: "REDACTION_BLOCKED", offendingCount: verdict.offendingPaths.length };
  }
  return { status: "ok", summary };
}

/**
 * dev-only 単発 smoke。gate → load(anchors+DayGraph のみ) → runShadow → assertRedacted → redacted のみ返す。
 * 一切 log/save/push/UI/throw raw しない。失敗は全て fail-closed（noop / blocked）。
 */
export async function runRealityShadowSmoke(deps: SmokeDeps): Promise<SmokeResult> {
  const gate = evaluateSmokeGate(deps.gate);
  if (!gate.pass) return { status: "noop", code: gate.code };

  let input: RealityInput | null;
  try {
    // gate pass 後にのみ実データへアクセス（gate fail 時は load を呼ばない）
    input = await deps.dataSource.loadForSmoke(deps.gate.requestedUserId);
  } catch {
    return { status: "noop", code: "ADAPTER_DEGRADED" }; // raw / stack を含めない
  }
  if (!input) return { status: "noop", code: "NO_INPUT" };

  // 二重防御: seeds を構造的に排除（source が誤って seedTraces を入れても捨てる）
  const safeInput: RealityInput = { ...input, seedTraces: [] };

  let summary: ShadowSummary;
  try {
    summary = runShadow({
      input: safeInput,
      candidates: deps.candidates ?? [],
      receptivity: deps.receptivity,
      intervened: false,
      conditionPresent: false,
    });
  } catch {
    return { status: "noop", code: "KERNEL_ERROR" };
  }

  // producer 自己表明: allowlist-clean のときのみ返す
  return enforceRedaction(summary);
}
