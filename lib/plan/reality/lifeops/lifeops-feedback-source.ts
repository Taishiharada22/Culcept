/**
 * 横 R2 — Life Ops Feedback Source（**pure adapter + gate・write 0・自由文を一切通さない**・barrel 非 export）
 *
 * 設計: docs/life-ops-feedback-readonly-source-a4-c8-mini-design.md
 *
 * 役割: 既存 M1（prm_learning_events）の column-restricted row を、Life Ops の観測（feedback / tentative cadence）へ
 *   **辞書 firewall 経由でのみ**変換する pure adapter。実データ read-only 第 1 段（最安全 source）。
 *
 * 厳守:
 *   - **handle namespace**: `lifeops:{categoryId}[:{menu}]` の prefix row だけを読む（plan-seed 由来と構造分離）。
 *   - **辞書 firewall**: categoryId は L-1 辞書・menu/action は enum に一致したときだけ通す → **自由文/PII は出力に構造的に到達不能**。
 *   - 出力は enum + ISO 日付のみ（raw row を candidate に直接流さない）。**accept=完了の proxy は明示**（確定完了は将来）。
 *   - gate: master ∧ feedback flag（**default OFF**）∧ staging allowlist ∧ production deny。pure・write 0。
 */

import { LIFE_OPS_CATEGORY_MODEL, type LifeOpsCategoryId } from "../../../lifeops/category-model";
import type { BeautyMenu } from "../../../lifeops/cadence-model";
import type { CadenceObservation } from "../../../lifeops/candidate-types";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "../../shift/devFixtureHost";

/** 将来の lifeops feedback write（別 gate）と読み側の共有規約。 */
export const LIFEOPS_FEEDBACK_HANDLE_PREFIX = "lifeops:";

/** Life Ops candidate key（category[:menu]）→ M1 handle（将来 write 側が使用）。 */
export function lifeOpsFeedbackHandle(categoryId: LifeOpsCategoryId, menu: BeautyMenu | null): string {
  return `${LIFEOPS_FEEDBACK_HANDLE_PREFIX}${categoryId}${menu ? `:${menu}` : ""}`;
}

const MENUS: ReadonlySet<string> = new Set(["cut", "color", "treatment"]);
const ACTIONS: ReadonlySet<string> = new Set(["accept", "dismiss", "later"]);

/** 中間 DTO（enum + ISO のみ・自由文なし）。 */
export interface LifeOpsFeedbackObservation {
  readonly categoryId: LifeOpsCategoryId;
  readonly menu: BeautyMenu | null;
  readonly action: "accept" | "dismiss" | "later";
  readonly actedAtISO: string;
}

/** M1 reader の最小入力 DTO（PrmLearningEventReadRow の structural subset）。 */
export interface LifeOpsFeedbackSourceRow {
  readonly handle: string;
  readonly action: string;
  readonly acted_at: string;
}

/** handle → {categoryId, menu}（**辞書 firewall**・不一致は null=drop）。 */
export function parseLifeOpsFeedbackHandle(handle: string): { categoryId: LifeOpsCategoryId; menu: BeautyMenu | null } | null {
  if (!handle.startsWith(LIFEOPS_FEEDBACK_HANDLE_PREFIX)) return null;
  const body = handle.slice(LIFEOPS_FEEDBACK_HANDLE_PREFIX.length);
  const sep = body.indexOf(":");
  const categoryId = (sep === -1 ? body : body.slice(0, sep)) as LifeOpsCategoryId;
  const menuRaw = sep === -1 ? null : body.slice(sep + 1);
  if (!(categoryId in LIFE_OPS_CATEGORY_MODEL)) return null; // 辞書外 = 自由文/PII の可能性 → 通さない
  if (menuRaw !== null && !MENUS.has(menuRaw)) return null;
  return { categoryId, menu: (menuRaw as BeautyMenu) ?? null };
}

/**
 * M1 rows → LifeOpsFeedbackObservation[]（prefix filter + 辞書 firewall + action enum 検証・acted_at 昇順・fail-soft drop）。
 */
export function m1RowsToLifeOpsFeedback(rows: readonly LifeOpsFeedbackSourceRow[]): readonly LifeOpsFeedbackObservation[] {
  const out: LifeOpsFeedbackObservation[] = [];
  for (const r of rows) {
    const parsed = parseLifeOpsFeedbackHandle(r.handle);
    if (!parsed) continue; // 非 lifeops / 辞書外 → 黙って drop（PII を出力に入れない）
    if (!ACTIONS.has(r.action)) continue;
    if (Number.isNaN(Date.parse(r.acted_at))) continue;
    out.push({ categoryId: parsed.categoryId, menu: parsed.menu, action: r.action as LifeOpsFeedbackObservation["action"], actedAtISO: r.acted_at });
  }
  return out.sort((a, b) => Date.parse(a.actedAtISO) - Date.parse(b.actedAtISO));
}

/**
 * feedback → **tentative** cadence（accept のみ・key ごと最新 1 件）。
 *   ★accept=「完了」の **proxy**（採用≒実施の暫定仮定・確定完了シグナルは将来 slice）。dismiss/later は cadence に使わない。
 */
export function feedbackToTentativeCadence(observations: readonly LifeOpsFeedbackObservation[]): readonly CadenceObservation[] {
  const latest = new Map<string, LifeOpsFeedbackObservation>();
  for (const o of observations) {
    if (o.action !== "accept") continue;
    const key = `${o.categoryId}:${o.menu ?? ""}`;
    const prev = latest.get(key);
    if (!prev || Date.parse(o.actedAtISO) > Date.parse(prev.actedAtISO)) latest.set(key, o);
  }
  return [...latest.values()].map((o) => ({ categoryId: o.categoryId, menu: o.menu, lastCompletedAtISO: o.actedAtISO }));
}

/** gate（master ∧ feedback ∧ staging ∧ !production・**default OFF 前提**・pure）。 */
export function isLifeOpsFeedbackReadAllowed(env: { readonly master: boolean; readonly feedback: boolean; readonly supabaseUrl: string | undefined }): boolean {
  const url = env.supabaseUrl ?? "";
  return env.master === true && env.feedback === true && url.includes(STAGING_PROJECT_REF) && !url.includes(PRODUCTION_PROJECT_REF);
}
