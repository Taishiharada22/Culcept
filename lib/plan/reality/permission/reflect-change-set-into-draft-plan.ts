/**
 * Reality Control OS — A-4-a Reflect ChangeSet → DraftPlan（**pure・no-write・Plan 本線非接続**・barrel 非 export）
 *
 * 設計: docs/reality-apply-target-decision-a4-0.md（A-4-a）/ docs/reality-apply-transaction-design.md（Display-apply）
 *
 * 役割: A-2 で整形した **prepared ChangeSet（real id + provenance）の add op** を、**DraftPlanItem として DraftPlan に additive merge**する。
 *   ＝「提案を見せる」Display-apply の computation。**DB に書かない・plan を確定しない・Plan 本線に配線しない**。
 *   merge 意味論は `consumed-seed-merge.ts`（並行トラック所管・**改変しない**）に**一致させる**（additive / 同日 / duplicate guard / no-mutation）。
 *
 * 厳守:
 *   - **pure・no-write**（DB/route/PlanClient/fetch なし）・**元 DraftPlan / 元 ChangeSet を mutation しない**。
 *   - **add のみ**反映（remove/update は現段階 **unsupported→warning**・undo 反映の将来接続は real id 整合で壊さない）。
 *   - **時刻保持**（startMin/endMin→`formatMinutes`→"HH:MM"・seed に寄せて落とさない）。
 *   - **raw/PII/title/location/seedRef/utterance/personality/trait を新規生成しない**（title が raw を含めば generic に落とす・reason/warning は安定コードのみ）。
 *   - **cross-track 不接触**: `consumed-seed-merge` / `plan-seed-status-executor` / `create_plan_seed_capture_bundle` / `draft-plan`(型のみ consume) / plan_seeds migration は触らない。
 *   - `DraftPlanItemOrigin` は **既存値を仮利用**（新値追加しない）。
 */

import type { ChangeSet } from "../change-set";
import type { DraftPlan, DraftPlanItem, DraftPlanItemOrigin } from "../../draft-plan";
import { formatMinutes } from "../../timeline-geometry";

/** empty-day ブロックの origin（**既存 union 値の仮利用**＝engine 推論ブロック・新値追加しない・最終値は cross-track 決定）。 */
export const REFLECT_DEFAULT_ORIGIN: DraftPlanItemOrigin = "rhythm_inferred";
/** 反映 item の固定 reason（非断定・raw なし）。 */
const REFLECT_ITEM_REASON = "空白の時間の使い方の候補です";
/** 反映 item の自信度（tentative＝proposed/droppable 相当）。 */
const REFLECT_ITEM_CONFIDENCE = 0.3;
/** title が raw を含む / 欠落のときの generic fallback（新規 raw を出さない）。 */
const GENERIC_LABEL = "自由時間";
/** title に**入れてはいけない** raw/PII マーカー。 */
const FORBIDDEN = /seed_?ref|utterance|personality|trait|location|住所|@[a-z]|\b\d{10,}\b/i;

export interface ReflectOptions {
  /** prepared ChangeSet が対象とする日（YYYY-MM-DD）。same-day filter に使う（op は date を持たないため caller が渡す）。 */
  readonly changeSetDate: string;
  /** 反映 item の origin（既定 rhythm_inferred・**既存値のみ**）。 */
  readonly origin?: DraftPlanItemOrigin;
}

export interface ReflectResult {
  /** additive merge 後の DraftPlan（反映なし→**元と同一参照**）。 */
  readonly draftPlan: DraftPlan;
  /** 反映時の注意（**安定コード・redacted**）。 */
  readonly warnings: readonly string[];
}

function isClean(s: string): boolean {
  return !FORBIDDEN.test(s);
}

/**
 * A-4-a: prepared ChangeSet の add op を DraftPlanItem として DraftPlan に additive merge（**pure・no-write**）。
 *   same-day filter / duplicate guard / 時刻保持 / redaction / undo 互換（real id）/ remove・update は unsupported。
 */
export function reflectChangeSetIntoDraftPlan(
  draftPlan: DraftPlan,
  prepared: ChangeSet,
  opts: ReflectOptions,
): ReflectResult {
  const warnings: string[] = [];
  const origin = opts.origin ?? REFLECT_DEFAULT_ORIGIN;

  // same-day filter（ChangeSet レベル）: 日が違えば何も反映しない（元 DraftPlan を同一参照で返す）。
  if (opts.changeSetDate !== draftPlan.date) {
    warnings.push("date_mismatch");
    return { draftPlan, warnings };
  }

  // duplicate guard 用の既存集合（id と「開始|終了|title」slot）。元 DraftPlan は読むだけ（mutation しない）。
  const seenIds = new Set(draftPlan.items.map((it) => it.id));
  const seenSlots = new Set(draftPlan.items.map((it) => `${it.startTime}|${it.endTime ?? ""}|${it.title}`));

  const newItems: DraftPlanItem[] = [];
  for (const op of prepared.ops) {
    if (op.kind !== "add") {
      warnings.push(`unsupported_op:${op.kind}`); // remove/update は現段階 unsupported（add のみ反映）
      continue;
    }
    const snap = op.after;
    if (typeof snap.startMin !== "number" || typeof snap.endMin !== "number") {
      warnings.push("missing_time"); // 時刻なし＝配置不能（seed に寄せて落とさない）
      continue;
    }
    const id = snap.itemId; // A-2 の real id（undo 互換: invertChangeSet の remove op.itemId と一致）
    if (seenIds.has(id)) {
      warnings.push("duplicate_id"); // 既存 / 同一 ChangeSet 内の二重 add を防ぐ（idempotent）
      continue;
    }

    const startTime = formatMinutes(snap.startMin);
    const endTime = formatMinutes(snap.endMin);

    // redaction: title は abstract label のみ。欠落 / raw を含むなら generic に落とす（新規 raw を出さない）。
    let title: string;
    if (snap.title === undefined) {
      title = GENERIC_LABEL;
      warnings.push("missing_title");
    } else if (!isClean(snap.title)) {
      title = GENERIC_LABEL;
      warnings.push("title_redacted");
    } else {
      title = snap.title;
    }

    const slotKey = `${startTime}|${endTime}|${title}`;
    if (seenSlots.has(slotKey)) {
      warnings.push("duplicate_slot"); // 同一 time block の二重追加を防ぐ
      continue;
    }

    newItems.push({
      id,
      startTime,
      endTime,
      title,
      origin,
      rigidity: "suggestion", // proposed/droppable 相当（Alter の提案）
      reason: REFLECT_ITEM_REASON,
      confidence: REFLECT_ITEM_CONFIDENCE,
    });
    seenIds.add(id);
    seenSlots.add(slotKey);
  }

  if (newItems.length === 0) return { draftPlan, warnings }; // additive no-op（元と同一参照）
  return { draftPlan: { ...draftPlan, items: [...draftPlan.items, ...newItems] }, warnings };
}
