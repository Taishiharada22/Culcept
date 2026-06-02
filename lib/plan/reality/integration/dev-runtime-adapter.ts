/**
 * Reality Control OS — Stage 4-B-1A Column-Restricted DataSource Adapter Skeleton
 *   （CEO 条件付き GO・2026-06-03・**実 Supabase 未接続**）
 *
 * 設計: docs/aneurasync-reality-control-os-stage4b-runtime-data-access-plan.md §9.2
 *
 * 目的: 実 DB read の前に「**許可列だけを読む**」規律を mock で実行検証する skeleton。
 *   - 既存 `listAnchors` は `select("*")` ＝ raw を読むので **使わない**。
 *   - 既存 `buildDayGraph` は `ExternalAnchor[]`（title/location を運ぶ raw 型）を取るので **使わない**。
 *     代わりに許可列だけから **SafeDayGraphProjection**（raw なし最小 node）を直接構築。
 *   - 「raw を読んでから消す」でなく「**そもそも読まない**」（column-restricted read）。
 *
 * 厳守（GPT 監査・4-B-1A）— **実 Supabase 接続はまだ禁止**:
 *   - 実 Supabase client / createClient / service role を import しない（最小 client interface に依存）。
 *   - 実 DB read しない（client は mock。実 client 注入は後段・要承認）。
 *   - route / UI / PlanClient / console / file / DB save / push / native / Routes なし。
 *   - **PlanSeed を読まない**（table は external_anchors 固定。seed table に触れない）。
 *   - barrel（index.ts）非 export（module boundary）。
 */

import { parseHhmmToMin, type RealityInput, type AnchorInput } from "./input-adapter";
import type { RealityDataSource } from "./dev-runtime";
import type { DayNode, NodeImportance } from "../post-event-recompute";
import type { EngineMode } from "../invariant-check";

// ── 列 allowlist / forbiddenlist（external_anchors の実列に接地） ──

/** 読んでよい列（最小・非 raw）。external_anchors の実列名。 */
export const ALLOWED_ANCHOR_COLUMNS = ["id", "start_time", "end_time", "rigidity", "sensitive_category"] as const;
export type AllowedAnchorColumn = (typeof ALLOWED_ANCHOR_COLUMNS)[number];

/** 読んではいけない列（raw / 識別子 / 第三者情報）。SELECT に絶対含めない。 */
export const FORBIDDEN_ANCHOR_COLUMNS = ["title", "location_text", "location_category", "external_uid", "source_id", "notes"] as const;
export type ForbiddenAnchorColumn = (typeof FORBIDDEN_ANCHOR_COLUMNS)[number];

/** 許可列だけを持つ row 型（title / location_text / external_uid は型に存在しない）。 */
export interface ColumnRestrictedAnchorRow {
  readonly id: string;
  readonly start_time: string;
  readonly end_time: string | null;
  readonly rigidity: "hard" | "soft";
  readonly sensitive_category: string | null;
}

/** redacted/projected な日構造（raw title/location を持たない最小 node + mode）。 */
export interface SafeDayGraphProjection {
  readonly mode: EngineMode;
  readonly dayNodes: readonly DayNode[];
}

export const ANCHOR_TABLE = "external_anchors";
/** SELECT 句（"*" でなく許可列のみ）。 */
export const ANCHOR_COLUMNS_SQL = ALLOWED_ANCHOR_COLUMNS.join(", ");

// ── 最小 Supabase-like client interface（実 Supabase を import しない） ──

export interface PostgrestSelect<Row> {
  eq(column: string, value: string): Promise<{ data: Row[] | null; error: { message: string } | null }>;
}
export interface PostgrestFrom<Row> {
  select(columns: string): PostgrestSelect<Row>;
}
export interface SupabaseLikeClient {
  from(table: string): PostgrestFrom<ColumnRestrictedAnchorRow>;
}

// ── projection（許可列 → SafeDayGraphProjection / RealityInput。raw を読まない） ──

function importanceOf(rigidity: "hard" | "soft"): NodeImportance {
  return rigidity === "hard" ? "high" : "normal";
}

function hasOverlap(nodes: readonly DayNode[]): boolean {
  const sorted = [...nodes].sort((a, b) => a.startMin - b.startMin);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startMin < sorted[i - 1].endMin) return true;
  }
  return false;
}

/** 許可列 rows → mode + 最小 dayNodes（raw なし）。skeleton では mode は build/repair/complete のみ。 */
export function projectSafeDayGraph(rows: readonly ColumnRestrictedAnchorRow[]): SafeDayGraphProjection {
  const dayNodes: DayNode[] = [];
  for (const r of rows) {
    const startMin = parseHhmmToMin(r.start_time);
    const endMin = r.end_time ? parseHhmmToMin(r.end_time) : null;
    if (startMin === null || endMin === null) continue; // parse 不能は skip（degraded）
    dayNodes.push({ id: r.id, startMin, endMin, importance: importanceOf(r.rigidity), hard: r.rigidity === "hard" });
  }
  const mode: EngineMode = rows.length === 0 ? "build" : hasOverlap(dayNodes) ? "repair" : "complete";
  return { mode, dayNodes };
}

/** 許可列 rows → allowlist 済 RealityInput（title/location を一切持たない・seedTraces 空）。 */
export function projectToRealityInput(rows: readonly ColumnRestrictedAnchorRow[]): RealityInput {
  const { mode, dayNodes } = projectSafeDayGraph(rows);
  const anchors: Record<string, AnchorInput> = {};
  for (const r of rows) {
    const hard = r.rigidity === "hard";
    // 軸の正本は input-adapter.ts。ここは column-restricted 由来の最小再現（origin=imported 固定）。
    anchors[r.id] = {
      governance: { origin: "imported", authority: "import_locked", flexibility: hard ? "locked" : "movable", protectionReasons: ["hard_external"] },
      importance: hard ? "important" : "normal",
      sensitive: r.sensitive_category != null, // category の有無のみ（raw 値は読まない）
    };
  }
  return { mode, dayNodes, anchors, seedTraces: [] };
}

// ── adapter skeleton（client は注入。実 Supabase は後段で注入・今は mock） ──

/**
 * column-restricted な anchors 読取を行う RealityDataSource を生成。
 *   - SELECT は **ANCHOR_COLUMNS_SQL 固定**（"*" や raw 列を渡せない）。
 *   - table は **external_anchors 固定**（plan_seeds に触れない）。
 *   - seed 読取メソッドは持たない（RealityDataSource = loadForSmoke のみ）。
 * 実 client は後段で注入（要承認）。今は mock client でのみ検証。
 */
export function createColumnRestrictedAnchorSource(client: SupabaseLikeClient): RealityDataSource {
  return {
    async loadForSmoke(userId: string): Promise<RealityInput | null> {
      const { data, error } = await client.from(ANCHOR_TABLE).select(ANCHOR_COLUMNS_SQL).eq("user_id", userId);
      if (error || !data) return null;
      return projectToRealityInput(data);
    },
  };
}
