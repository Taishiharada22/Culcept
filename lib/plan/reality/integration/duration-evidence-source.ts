import "server-only";
/**
 * Reality Control OS — A1-5-3b-3 DurationEvidence DB Read Seam（column-restricted・DI client・実 read は注入）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.13 + §8.15
 *
 * 目的: structured-only `plan_seed_duration_evidences`（A1-5-3b-1 migration・staging apply 済 A1-5-3b-2）から
 *   **許可列だけ**を bounded に読み、`seedRef -> DurationEvidence[]` map（= CompleteDispatchInput.durationEvidences）
 *   に変換する read seam。実 client 生成（createClient）は呼び出し側に隔離。**barrel 非 export**。
 *
 * 厳守:
 *   - **column-restricted**（`DURATION_EVIDENCE_COLUMNS_SQL` 固定・`select("*")` なし・**`source_ref` / raw を select も型も持たない**）。
 *     table 固定（`EVIDENCE_TABLE`・**本ファイルのみ**）。
 *   - **adoptable evidence のみ surface**: confidence=high ∧ duration 1<分<=1440 ∧ source 妥当（A1-5-3a `toDurationEvidence` 再利用）。
 *     low / invalid source / 範囲外 -> **非 evidence 化**（map に入れない）。prm_typical(high) は map に入るが enrich で grounding=weak -> 候補化しない。
 *   - **bounded**（user_id + seedIds(.in) + 任意 expires_at 境界 + limit clamp。population read 禁止・seedIds 空 -> load 0）。
 *   - **DB write しない**（select/eq/in/or/limit のみ）。**service_role を import しない**（user-RLS client 注入）。
 *   - `server-only` / barrel 非 export / route・UI・PlanClient・generateCandidates から呼ばない。
 */

import {
  toDurationEvidence,
  assembleDurationEvidenceMap,
} from "../duration-evidence-adapter";
import type { DurationEvidence } from "../seed-placement-enrich";
import { evaluateSmokeGate, type SmokeGate } from "./dev-runtime";

/** 許可列（**structured-only**・source_ref / raw を含まない）。read path の SELECT 用。 */
export const ALLOWED_DURATION_EVIDENCE_COLUMNS = [
  "id",
  "user_id",
  "seed_id",
  "duration_min",
  "source",
  "confidence",
] as const;
export type AllowedDurationEvidenceColumn = (typeof ALLOWED_DURATION_EVIDENCE_COLUMNS)[number];

/** 禁止列（**source_ref は opaque・read path 非搭載** + raw）。SELECT も型保持もしない。 */
export const FORBIDDEN_DURATION_EVIDENCE_COLUMNS = [
  "source_ref",
  "signal",
  "desired_action",
  "raw_text",
  "title",
  "location",
] as const;

/** column-restricted SELECT 句（`"*"` 禁止・source_ref / raw 列なし）。 */
export const DURATION_EVIDENCE_COLUMNS_SQL = ALLOWED_DURATION_EVIDENCE_COLUMNS.join(", ");

/** table 名（**本 module でのみ使用**）。 */
export const EVIDENCE_TABLE = "plan_seed_duration_evidences";

/** 許可列だけを持つ row 型（**`source_ref` / raw を型に持たない**）。source/confidence は DB string で受け projection で検証。 */
export interface ColumnRestrictedDurationEvidenceRow {
  readonly id: string;
  readonly user_id: string;
  readonly seed_id: string;
  readonly duration_min: number;
  readonly source: string;
  readonly confidence: string;
}

/**
 * 1 row -> DurationEvidence（**adoptable のみ**・high 以外と invalid は null）。
 * confidence=high 必須（low / 不正 confidence -> 非 evidence 化）。range / source は `toDurationEvidence`（enrich 検証器再利用）。
 * seed_id -> seedRef（UUID 文字列）。raw / source_ref は読まない。
 */
function rowToDurationEvidence(row: ColumnRestrictedDurationEvidenceRow): DurationEvidence | null {
  if (row.confidence !== "high") return null; // read projection は high のみ surface
  return toDurationEvidence({ seedRef: row.seed_id, durationMin: row.duration_min, source: row.source, confidence: "high" });
}

/**
 * column-restricted row[] -> `seedRef -> DurationEvidence[]` map（**pure projection**）。
 * adoptable のみ（high ∧ range ∧ source）。null は除外し seedRef ごとに集約（A1-5-3a `assembleDurationEvidenceMap` 再利用）。
 */
export function projectDurationEvidenceRowsToMap(
  rows: readonly ColumnRestrictedDurationEvidenceRow[]
): Record<string, DurationEvidence[]> {
  return assembleDurationEvidenceMap(rows.map(rowToDurationEvidence));
}

// ── 最小 query interface（実 user-context Supabase client が structural に満たす） ──

export interface DurationEvidenceQuery {
  /** WHERE 等値（user_id）。 */
  eq(column: string, value: string): DurationEvidenceQuery;
  /** WHERE IN（seed_id 群・bounded read）。 */
  in(column: string, values: readonly string[]): DurationEvidenceQuery;
  /** WHERE OR（期限切れ除外の境界注入用。expires_at は SELECT しないが WHERE で絞る）。 */
  or(filters: string): DurationEvidenceQuery;
  /** 件数上限を付けて解決（無制限 / population read を構造的に防ぐ終端）。 */
  limit(n: number): Promise<{ data: readonly ColumnRestrictedDurationEvidenceRow[] | null; error: { message: string } | null }>;
}
export interface DurationEvidenceFrom {
  select(columns: string): DurationEvidenceQuery;
}
/** user-context（RLS 適用）client。**service role を渡さないこと**。 */
export interface DurationEvidenceUserContextClient {
  from(table: string): DurationEvidenceFrom;
}

/** evidence read の件数上限。これを超える指定は clamp（population read 防止）。 */
export const MAX_DURATION_EVIDENCE_LIMIT = 200;

/** limit を [1, MAX_DURATION_EVIDENCE_LIMIT] に clamp（>上限を読まない・0/負を防ぐ）。 */
export function clampDurationEvidenceLimit(limit: number): number {
  if (!Number.isFinite(limit)) return MAX_DURATION_EVIDENCE_LIMIT;
  return Math.min(Math.max(1, Math.floor(limit)), MAX_DURATION_EVIDENCE_LIMIT);
}

export interface DurationEvidenceReadBounds {
  /** 対象 seed の id 群（bounded read・空なら load 0）。 */
  readonly seedIds: readonly string[];
  /** 件数上限。必須（無制限禁止）。clamp される。 */
  readonly limit: number;
  /** 任意: 期限切れ除外の境界（ISO）。注入時のみ expires_at フィルタを WHERE に足す（SELECT はしない）。 */
  readonly activeAsOfIso?: string;
}

/** plan_seed_duration_evidences から `seedRef -> DurationEvidence[]` map を返す source。 */
export interface ColumnRestrictedDurationEvidenceSource {
  loadEvidenceMap(userId: string): Promise<Record<string, DurationEvidence[]> | null>;
}

/**
 * column-restricted な evidence read source を生成。
 *   query: from(EVIDENCE_TABLE).select(ALLOWED).eq(user_id).in(seed_id, seedIds)[.or(expiry)].limit(clamp)
 *   - 実 client は呼び出し側で注入（**user-RLS**）。**service_role 禁止**。
 *   - 戻り値は adoptable evidence のみの map（source_ref / raw 非搬送）。
 */
export function createColumnRestrictedDurationEvidenceSource(
  client: DurationEvidenceUserContextClient,
  bounds: DurationEvidenceReadBounds
): ColumnRestrictedDurationEvidenceSource {
  return {
    async loadEvidenceMap(userId: string) {
      if (bounds.seedIds.length === 0) return {}; // seedIds 空 -> load 0（query しない）
      let q = client
        .from(EVIDENCE_TABLE) // "plan_seed_duration_evidences"（定数・本ファイルのみ）
        .select(DURATION_EVIDENCE_COLUMNS_SQL) // 許可列のみ（"*" でない・source_ref / raw なし）
        .eq("user_id", userId) // RLS + 明示 user 限定（二重防御）
        .in("seed_id", bounds.seedIds); // 対象 seed 群のみ（bounded）
      if (bounds.activeAsOfIso) {
        // 期限切れ除外（expires_at は SELECT せず WHERE のみ・境界注入）
        q = q.or(`expires_at.is.null,expires_at.gt.${bounds.activeAsOfIso}`);
      }
      const { data, error } = await q.limit(clampDurationEvidenceLimit(bounds.limit)); // 件数上限
      if (error || !data) return null;
      return projectDurationEvidenceRowsToMap(data); // adoptable のみ・source_ref / raw 非搬送
    },
  };
}

/**
 * gate（fail-closed）を通した read。production / flag off / capability なし / user mismatch なら **load 0**（空 map）。
 * 実 read は gate pass 後にのみ行う（anchor / seed smoke と同じ多層 fail-closed）。
 */
export async function loadGatedDurationEvidenceMap(
  gate: SmokeGate,
  source: ColumnRestrictedDurationEvidenceSource
): Promise<Record<string, DurationEvidence[]>> {
  const verdict = evaluateSmokeGate(gate);
  if (!verdict.pass) return {}; // PRODUCTION / FLAG_OFF / NO_CAPABILITY / OUT_OF_SCOPE_USER -> {}
  const map = await source.loadEvidenceMap(gate.requestedUserId);
  return map ?? {};
}
