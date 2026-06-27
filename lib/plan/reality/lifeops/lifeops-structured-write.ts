/**
 * 横 R2 — A-4-c31 Life Ops Structured Source Write Contract（**pure・write 0・default OFF 前提**・barrel 非 export）
 *
 * 設計: docs/life-ops-structured-input-contract-a4-c31-mini-design.md
 *
 * 役割: 将来の UI 入力（enum picker + 日付のみ）から `lifeops_structured_sources` へ安全に insert するための
 *   **write contract の pure 部**。input 型・validation+row builder・duplicate guard・gate。**本 file は何も書かない**。
 *
 * 厳守:
 *   - **client input は構造化値のみ**（free text/title/user_id/DB id/raw row の field が型に存在しない）。
 *   - **occurrence_key は builder が常に自動生成**（c30 finding の恒久対応: deadline=due date 由来・cadence=固定 suffix・
 *     **now/開始時刻を使わない deterministic**。呼び元が渡す口がない＝手書き値の混入が構造的に不可能）。
 *   - validation は DB CHECK と同 shape（辞書 roundtrip・ISO・deadline=dueDate 必須・cadence=last か interval・interval∈(0,730] 整数）。
 *   - confidence は **'high' 固定**（明示 user 入力の事実・client から受けない）。status は 'active' 固定。
 *   - payload に **id/created_at/updated_at を含めない**（DB DEFAULT・c12「明示 null は DEFAULT を殺す」教訓）。
 */

import { LIFE_OPS_CATEGORY_MODEL, type LifeOpsCategoryId } from "../../../lifeops/category-model";
import { listMvpCadences, cadenceKey, type BeautyMenu } from "../../../lifeops/cadence-model";
import { lifeOpsFeedbackHandle, parseLifeOpsFeedbackHandle } from "./lifeops-feedback-source";
import { deriveLifeOpsOccurrenceKey, deriveLifeOpsCadenceOccurrenceKey } from "./lifeops-structured-source";
import type { LifeOpsStructuredSourceRow } from "./lifeops-structured-storage";
import {
  STAGING_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  CLEAN_PRODUCTION_PROJECT_REF,
} from "../../shift/devFixtureHost";

/**
 * A-4-c33: deadline 入力 picker の選択肢（**辞書 `money_admin` group 由来**・表示名は辞書 label・自由文なし）。
 *   GPT 例の「支払い/書類提出」等は辞書未登録のため出ない（辞書拡張=別 slice・c27 の app-layer validation 方針と整合）。
 */
export function listLifeOpsDeadlineInputCategories(): readonly { readonly id: LifeOpsCategoryId; readonly label: string }[] {
  return Object.entries(LIFE_OPS_CATEGORY_MODEL)
    .filter(([, def]) => (def as { group: string }).group === "money_admin")
    .map(([id, def]) => ({ id: id as LifeOpsCategoryId, label: (def as { label: string }).label }));
}

/** menu の表示名（固定 3 語辞書・display 専用）。 */
const MENU_LABELS: Record<BeautyMenu, string> = { cut: "カット", color: "カラー", treatment: "トリートメント" };

/**
 * A-4-c34: cadence 入力 picker の選択肢（**L-2 `listMvpCadences()` 由来の spec 実在 5 組のみ**）。
 *   spec なし category は候補化されない（normalizer→unknown→engine skip）ため picker に出さない＝
 *   「登録したのに何も起きない」混乱を構造的に排除。value は `cadenceKey()` 形式（`beauty_salon:cut`/`eyebrow`）の
 *   **lookup encoding**（server は信頼せず split→c31 builder の辞書 roundtrip が実検証）。label は辞書 label+menu 名。
 */
export function listLifeOpsCadenceInputOptions(): readonly { readonly value: string; readonly label: string }[] {
  return listMvpCadences().map((spec) => {
    const def = LIFE_OPS_CATEGORY_MODEL[spec.categoryId as LifeOpsCategoryId] as { label: string } | undefined;
    const base = def?.label ?? spec.categoryId;
    return {
      value: cadenceKey(spec.categoryId as LifeOpsCategoryId, spec.menu),
      label: spec.menu ? `${base}（${MENU_LABELS[spec.menu]}）` : base,
    };
  });
}

/** UI から将来渡してよい入力（**構造化値のみ**・自由文/owner/id 系 field は存在しない）。 */
export interface LifeOpsStructuredDeadlineInput {
  readonly sourceType: "deadline";
  readonly categoryId: LifeOpsCategoryId;
  readonly menu?: BeautyMenu | null;
  readonly dueDateISO: string;
}
export interface LifeOpsStructuredCadenceInput {
  readonly sourceType: "cadence";
  readonly categoryId: LifeOpsCategoryId;
  readonly menu?: BeautyMenu | null;
  readonly lastCompletedAtISO?: string | null;
  readonly typicalIntervalDays?: number;
}
export type LifeOpsStructuredSourceInput = LifeOpsStructuredDeadlineInput | LifeOpsStructuredCadenceInput;

/** insert payload（**user_id は adapter が auth から注入**・id/created_at/updated_at は DB DEFAULT のため不含）。 */
export interface LifeOpsStructuredSourceInsertRow {
  readonly source_type: "deadline" | "cadence";
  readonly category_id: LifeOpsCategoryId;
  readonly menu: BeautyMenu | null;
  readonly due_at: string | null;
  readonly last_completed_at: string | null;
  readonly typical_interval_days: number | null;
  readonly occurrence_key: string;
  readonly confidence: "high";
  readonly status: "active";
}

export type LifeOpsStructuredWriteInvalidReason =
  | "invalid_category" // 辞書外 category / enum 外 menu（roundtrip 不一致）
  | "invalid_iso" // dueDate/lastCompleted の ISO 不正
  | "missing_due" // deadline に dueDate なし
  | "missing_cadence_fields" // cadence に last も interval もない
  | "invalid_interval" // interval が整数 (0,730] でない
  | "future_date"; // A-4-c34: cadence の lastCompleted が未来（「前回やった日」は過去の事実・nowMs 注入時のみ判定）

export type LifeOpsStructuredWriteBuildResult =
  | { readonly ok: true; readonly row: LifeOpsStructuredSourceInsertRow }
  | { readonly ok: false; readonly reason: LifeOpsStructuredWriteInvalidReason };

/**
 * input → 検証 + insert row（**occurrence_key 自動生成・deterministic**）。invalid は ok:false（throw しない）。
 *   opts.nowMs（caller 注入・pure 維持）: cadence の lastCompleted 未来チェックに使用（A-4-c34・省略時は判定しない=後方互換）。
 */
export function buildLifeOpsStructuredInsertRow(
  input: LifeOpsStructuredSourceInput,
  opts?: { readonly nowMs?: number },
): LifeOpsStructuredWriteBuildResult {
  const menu = input.menu ?? null;
  const parsed = parseLifeOpsFeedbackHandle(lifeOpsFeedbackHandle(input.categoryId, menu));
  if (!parsed || parsed.categoryId !== input.categoryId || parsed.menu !== menu) {
    return { ok: false, reason: "invalid_category" }; // 辞書 firewall（全層共通の単一実装を再利用）
  }
  if (input.sourceType === "deadline") {
    if (!input.dueDateISO) return { ok: false, reason: "missing_due" };
    if (Number.isNaN(Date.parse(input.dueDateISO))) return { ok: false, reason: "invalid_iso" };
    return {
      ok: true,
      row: {
        source_type: "deadline",
        category_id: input.categoryId,
        menu,
        due_at: input.dueDateISO,
        last_completed_at: null,
        typical_interval_days: null,
        occurrence_key: deriveLifeOpsOccurrenceKey(input.categoryId, menu, input.dueDateISO), // due date 由来（now 不使用）
        confidence: "high",
        status: "active",
      },
    };
  }
  // cadence
  const last = input.lastCompletedAtISO ?? null;
  const interval = input.typicalIntervalDays;
  if (last === null && interval === undefined) return { ok: false, reason: "missing_cadence_fields" };
  if (last !== null && Number.isNaN(Date.parse(last))) return { ok: false, reason: "invalid_iso" };
  if (last !== null && opts?.nowMs !== undefined && Date.parse(last) > opts.nowMs) {
    return { ok: false, reason: "future_date" }; // 「前回やった日」は過去の事実（A-4-c34・now は caller 注入＝pure 維持）
  }
  if (interval !== undefined && (!Number.isInteger(interval) || interval <= 0 || interval > 730)) {
    return { ok: false, reason: "invalid_interval" }; // DB CHECK と同範囲
  }
  return {
    ok: true,
    row: {
      source_type: "cadence",
      category_id: input.categoryId,
      menu,
      due_at: null,
      last_completed_at: last,
      typical_interval_days: interval ?? null,
      occurrence_key: deriveLifeOpsCadenceOccurrenceKey(input.categoryId, menu), // 固定 suffix（deterministic）
      confidence: "high",
      status: "active",
    },
  };
}

/**
 * duplicate guard（pure）: 同 source_type ∧ category ∧ menu ∧ occurrence_key の **active** 既存行があれば true。
 *   existing は呼び元が c27 reader（owner scope・active filter 済み）で読んで注入（writer は隠れ read を持たない）。
 */
export function hasActiveStructuredDuplicate(
  existing: readonly LifeOpsStructuredSourceRow[],
  row: LifeOpsStructuredSourceInsertRow,
): boolean {
  return existing.some(
    (e) =>
      e.status === "active" && // reader は active filter 済みだが防御で再確認
      e.source_type === row.source_type &&
      e.category_id === row.category_id &&
      (e.menu ?? null) === row.menu &&
      e.occurrence_key === row.occurrence_key,
  );
}

/** write gate（master ∧ **LIFEOPS_STRUCTURED_SOURCE_WRITE** ∧ staging ∧ !production・default OFF・pure）。 */
export function isLifeOpsStructuredSourceWriteAllowed(env: {
  readonly master: boolean;
  readonly write: boolean;
  readonly supabaseUrl: string | undefined;
}): boolean {
  const url = env.supabaseUrl ?? "";
  return env.master === true && env.write === true && url.includes(STAGING_PROJECT_REF) && !url.includes(PRODUCTION_PROJECT_REF) && !url.includes(CLEAN_PRODUCTION_PROJECT_REF);
}
