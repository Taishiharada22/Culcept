/**
 * 横 R2 — A-4-c27 Life Ops Structured Source Storage Contract（**pure: row DTO + 変換 + gate**・barrel 非 export）
 *
 * 設計: docs/life-ops-structured-storage-a4-c27-mini-design.md
 *
 * 役割: `lifeops_structured_sources`（draft・未 apply）の column-restricted row を、c26 structured DTO へ変換する
 *   pure adapter。**DB row を candidate へ直接流さない**（row → 本変換 → c26 normalizer → LifeOpsInputs の経路のみ）。
 *
 * 厳守:
 *   - row DTO は column-restricted（**user_id / DB id / raw / source_ref を持たない**・select 列固定は reader 側）。
 *   - status='active' のみ通す（archived drop）。source_type/confidence は enum 検証（unknown drop・fail-soft）。
 *   - 辞書/ISO の最終検証は **c26 normalizer に単一化**（二重実装しない＝unknown category/invalid ISO はそちらで drop）。
 *   - gate: master ∧ `LIFEOPS_STRUCTURED_SOURCE_READONLY` ∧ staging ∧ !production・**default OFF**・consumer 0（本 slice）。
 */

import type { LifeOpsCategoryId } from "../../../lifeops/category-model";
import type { BeautyMenu } from "../../../lifeops/cadence-model";
import {
  type LifeOpsStructuredDeadlineSource,
  type LifeOpsStructuredCadenceSource,
} from "./lifeops-structured-source";
import type { LifeOpsCadenceConfidence } from "./lifeops-cadence-real-source";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "../../shift/devFixtureHost";

export const LIFEOPS_STRUCTURED_SOURCES_TABLE = "lifeops_structured_sources";

/**
 * A-4-c29: DB 型（**staging apply 済み schema と 1:1**・c28 POST-1 監査結果と一致・手書き scoped 型）。
 *   注: 本 repo は生成済み database.types を持たない（client は untyped・structural DTO 方式が確立 pattern）ため、
 *   全 schema gen ではなく本 table のみの scoped 型を contract と同居させる（production schema 由来でないことが構造的に明白・
 *   forbidden column は型にも存在しない）。将来 repo が typed client を採用する場合は gen へ移行。
 */
export interface LifeOpsStructuredSourcesTable {
  readonly Row: {
    readonly id: string;
    readonly user_id: string;
    readonly source_type: string;
    readonly category_id: string;
    readonly menu: string | null;
    readonly due_at: string | null;
    readonly last_completed_at: string | null;
    readonly typical_interval_days: number | null;
    readonly occurrence_key: string | null;
    readonly confidence: string;
    readonly status: string;
    readonly created_at: string;
    readonly updated_at: string;
  };
  readonly Insert: {
    readonly id?: string;
    readonly user_id: string;
    readonly source_type: "deadline" | "cadence";
    readonly category_id: string;
    readonly menu?: "cut" | "color" | "treatment" | null;
    readonly due_at?: string | null;
    readonly last_completed_at?: string | null;
    readonly typical_interval_days?: number | null;
    readonly occurrence_key?: string | null;
    readonly confidence?: "high" | "medium" | "low";
    readonly status?: "active" | "archived";
    readonly created_at?: string;
    readonly updated_at?: string;
  };
  readonly Update: Partial<LifeOpsStructuredSourcesTable["Insert"]>;
}

/** reader が select する列（**user_id / id を含めない**・この文字列が reader の select 引数）。 */
export const LIFEOPS_STRUCTURED_SOURCE_COLUMNS_SQL =
  "source_type, category_id, menu, due_at, last_completed_at, typical_interval_days, occurrence_key, confidence, status";

/** column-restricted row（中間 DTO・raw/user_id/id/source_ref は構造的に不存在）。 */
export interface LifeOpsStructuredSourceRow {
  readonly source_type: string;
  readonly category_id: string;
  readonly menu: string | null;
  readonly due_at: string | null;
  readonly last_completed_at: string | null;
  readonly typical_interval_days: number | null;
  readonly occurrence_key: string | null;
  readonly confidence: string;
  readonly status: string;
}

const CONFIDENCES: ReadonlySet<string> = new Set(["high", "medium", "low"]);
const MENUS: ReadonlySet<string> = new Set(["cut", "color", "treatment"]);

export interface LifeOpsStructuredSourcesSplit {
  readonly deadlines: readonly LifeOpsStructuredDeadlineSource[];
  readonly cadences: readonly LifeOpsStructuredCadenceSource[];
}

/**
 * rows → c26 structured DTO（**active のみ・enum 検証・fail-soft drop**）。
 *   辞書 roundtrip / ISO 検証は c26 normalizer が最終防壁（unknown category はそこで drop＝二重実装しない）。
 */
export function rowsToStructuredSources(rows: readonly LifeOpsStructuredSourceRow[]): LifeOpsStructuredSourcesSplit {
  const deadlines: LifeOpsStructuredDeadlineSource[] = [];
  const cadences: LifeOpsStructuredCadenceSource[] = [];
  for (const r of rows) {
    if (r.status !== "active") continue; // archived 等は候補化しない
    if (!CONFIDENCES.has(r.confidence)) continue; // enum 外 → drop
    const menu = r.menu !== null && MENUS.has(r.menu) ? (r.menu as BeautyMenu) : null;
    if (r.menu !== null && menu === null) continue; // enum 外 menu の行は丸ごと drop（汚染を通さない）
    if (r.source_type === "deadline") {
      if (r.due_at === null) continue; // shape 違反（CHECK があるが fail-soft でも守る）
      deadlines.push({
        categoryId: r.category_id as LifeOpsCategoryId, // 最終辞書検証は normalizer（unknown はそこで drop）
        menu,
        dueAtISO: r.due_at,
        sourceKind: "user_structured_deadline",
        confidence: r.confidence as LifeOpsCadenceConfidence,
        occurrenceKey: r.occurrence_key ?? undefined,
      });
    } else if (r.source_type === "cadence") {
      if (r.last_completed_at === null && r.typical_interval_days === null) continue; // shape 違反
      cadences.push({
        categoryId: r.category_id as LifeOpsCategoryId,
        menu,
        lastCompletedAtISO: r.last_completed_at,
        typicalIntervalDays: r.typical_interval_days ?? undefined,
        sourceKind: "user_structured_cadence",
        confidence: r.confidence as LifeOpsCadenceConfidence,
      });
    }
    // unknown source_type → drop（fail-soft）
  }
  return { deadlines, cadences };
}

/** gate（master ∧ structured ∧ staging ∧ !production・**default OFF**・pure）。 */
export function isLifeOpsStructuredSourceReadAllowed(env: {
  readonly master: boolean;
  readonly structured: boolean;
  readonly supabaseUrl: string | undefined;
}): boolean {
  const url = env.supabaseUrl ?? "";
  return env.master === true && env.structured === true && url.includes(STAGING_PROJECT_REF) && !url.includes(PRODUCTION_PROJECT_REF);
}
