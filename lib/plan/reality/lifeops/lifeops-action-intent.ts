/**
 * 横 R2 — A-4-c15 Life Ops Action Intent Contract（**pure・write 0・UI 0**・barrel 非 export）
 *
 * 設計: docs/life-ops-action-intent-contract-a4-c15-mini-design.md
 *
 * 役割: 候補カード上の 採用/完了/後で/不要 を、writer（c9 contract・別 gate）へ渡せる**安全な intent**として
 *   pure に組む。`LifeOpsCandidate` からは **category と menu だけ**を読む（placeQuery/label/dueReason 文字列は
 *   構造的に不到達）。React/PlanClient/server action/DB write/notification には接続しない。
 *
 * 厳守:
 *   - 意味論は c13 確定の mirror: accept=採用(intent)/done=完了(事実)/later=後で/dismiss=不要。
 *     **cadence を動かせるのは done のみ**（cadenceEligible）。signal/sourceKind は c9 共有定数から導出（第二の正本なし）。
 *   - **自動 done 禁止**: intent は caller の明示 action 引数からのみ構成。done は誤タップが cadence を歪めるため
 *     `requiresExplicitConfirmation=true`（UI 契約 boolean・確認 UI を義務付け）。
 *   - **辞書 firewall**: 辞書外 category / enum 外 menu は intent 化しない（build=null / descriptors=[]＝safe disabled）。
 *     検証は c8 `parseLifeOpsFeedbackHandle` の roundtrip 再利用（firewall の二重実装をしない）。
 */

import type { LifeOpsCategoryId } from "../../../lifeops/category-model";
import type { BeautyMenu } from "../../../lifeops/cadence-model";
import type { LifeOpsCandidate } from "../../../lifeops/candidate-types";
import { lifeOpsFeedbackHandle, parseLifeOpsFeedbackHandle } from "./lifeops-feedback-source";
import {
  LIFEOPS_FEEDBACK_SIGNAL,
  LIFEOPS_SOURCE_KIND,
  type LifeOpsFeedbackAction,
  type LifeOpsFeedbackWriteIntent,
} from "./lifeops-feedback-write";

/** cadence（前回完了日）を動かしてよい action（c13: **done のみ**・accept proxy は退役済）。 */
export const CADENCE_ELIGIBLE_ACTIONS: ReadonlySet<LifeOpsFeedbackAction> = new Set(["done"]);

/** done だけ true（accept=採用 intent は完了事実ではない・dismiss/later も不適格）。 */
export function isCadenceEligibleAction(action: LifeOpsFeedbackAction): boolean {
  return CADENCE_ELIGIBLE_ACTIONS.has(action);
}

/** UI 表示語の 4 語固定辞書（自由文の経路なし・UI ラベルは日本語）。 */
export const LIFEOPS_ACTION_UI_LABELS: Record<LifeOpsFeedbackAction, "採用" | "完了" | "後で" | "不要"> = {
  accept: "採用",
  done: "完了",
  later: "後で",
  dismiss: "不要",
};

/** カード上の提示順（採用 → 完了 → 後で → 不要・固定）。 */
export const LIFEOPS_ACTION_ORDER: readonly LifeOpsFeedbackAction[] = ["accept", "done", "later", "dismiss"];

/**
 * action intent（writer へ渡せる安全形・**閉集合 field のみ**）。
 *   free text / raw candidate text / placeQuery / URL / 店舗名 / 予定名 / user_id / id / raw row / source_ref を持たない。
 */
export interface LifeOpsActionIntent {
  /** `lifeops:{categoryId}[:{menu}]`（enum builder のみ・dedupe/cooldown の構造 key を兼ねる）。 */
  readonly handle: string;
  readonly categoryId: LifeOpsCategoryId;
  readonly menu: BeautyMenu | null;
  readonly action: LifeOpsFeedbackAction;
  /** c9 共有定数からの導出（accept→adoption / done→completion / later→deferral / dismiss→non_adoption）。 */
  readonly signal: (typeof LIFEOPS_FEEDBACK_SIGNAL)[LifeOpsFeedbackAction];
  readonly sourceKind: typeof LIFEOPS_SOURCE_KIND;
  /** done のみ true＝cadence（前回完了日）を動かしてよい。 */
  readonly cadenceEligible: boolean;
  /** done のみ true＝誤タップで cadence を歪めないため確認 UI を義務付け（自動 done 禁止）。 */
  readonly requiresExplicitConfirmation: boolean;
}

/** カード提示用 descriptor（pure VM 素材・React/本線には本 slice で接続しない）。 */
export interface LifeOpsActionDescriptor {
  readonly uiLabel: (typeof LIFEOPS_ACTION_UI_LABELS)[LifeOpsFeedbackAction];
  readonly intent: LifeOpsActionIntent;
}

/**
 * candidate + 明示 action → intent（**辞書 firewall roundtrip**・不一致は null=safe disabled）。
 *   candidate からは category / menu 以外を読まない。
 */
export function buildLifeOpsActionIntent(candidate: LifeOpsCandidate, action: LifeOpsFeedbackAction): LifeOpsActionIntent | null {
  const handle = lifeOpsFeedbackHandle(candidate.category, candidate.menu);
  const parsed = parseLifeOpsFeedbackHandle(handle);
  if (!parsed || parsed.categoryId !== candidate.category || parsed.menu !== candidate.menu) {
    return null; // 辞書外 category / enum 外 menu / 区切り汚染 → intent 化しない（黙って無効化）
  }
  return {
    handle,
    categoryId: parsed.categoryId,
    menu: parsed.menu,
    action,
    signal: LIFEOPS_FEEDBACK_SIGNAL[action],
    sourceKind: LIFEOPS_SOURCE_KIND,
    cadenceEligible: isCadenceEligibleAction(action),
    requiresExplicitConfirmation: action === "done",
  };
}

/**
 * candidate → カード action descriptors（固定順 4 件・辞書外候補は **[]**＝何も出さない）。
 */
export function listLifeOpsActionDescriptors(candidate: LifeOpsCandidate): readonly LifeOpsActionDescriptor[] {
  const out: LifeOpsActionDescriptor[] = [];
  for (const action of LIFEOPS_ACTION_ORDER) {
    const intent = buildLifeOpsActionIntent(candidate, action);
    if (!intent) return []; // 1 action でも組めない=候補自体が辞書外 → safe disabled
    out.push({ uiLabel: LIFEOPS_ACTION_UI_LABELS[action], intent });
  }
  return out;
}

/**
 * intent → c9 writer 入力（**変換のみ・writer は呼ばない**）。actedAtISO はユーザー操作時刻を caller が注入（pure 維持）。
 */
export function actionIntentToWriterInput(intent: LifeOpsActionIntent, actedAtISO: string): LifeOpsFeedbackWriteIntent {
  return { categoryId: intent.categoryId, menu: intent.menu, action: intent.action, actedAtISO };
}
