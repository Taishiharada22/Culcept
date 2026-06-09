/**
 * Life Ops L-8a — Card Presenter（**pure view-model・no-React・no-DB・no-外部**・barrel 非 export）
 *
 * 設計: docs/life-ops-l8-ui-mini-design.md / Appendix A.12 / candidate-types / permission(L-7) / category-model(label)
 *
 * 役割: `LifeOpsCandidate` + `PermissionAssessment` を **非断定の表示用 ViewModel** に整形する pure presenter。
 *   実 React 描画（L-8b）の手前まで。**文言整形だけ**（配置/window=横R2・通知=R4・予約=L-6 は持たない）。
 *
 * 厳守:
 *   - pure・deterministic・**横エンジン(lib/plan/reality)非 import**・no-React・no-DB・no-外部・no-実データ・barrel 非 export。
 *   - **断定しない**（「〜が自然」「〜のタイミング」。「した方がいい/必ず/べき」を出さない）。reasonCodes は可読・redacted。
 *   - import 可は lib/lifeops 内（category-model/permission/candidate-types）のみ。
 */

import type { DueReason, EventKind, LifeOpsCandidate } from "./candidate-types";
import { getCategorySpec, type LifeOpsCategoryId } from "./category-model";
import { assessLifeOpsPermission, type LifeOpsAction, type PermissionAssessment } from "./permission";

/** 表示用カード（非断定）。 */
export interface LifeOpsCardViewModel {
  readonly category: LifeOpsCategoryId;
  readonly title: string;
  readonly reasonText: string;
  readonly timingHint: string | null;
  readonly actionLabel: string;
  readonly requiresConfirmation: boolean;
  readonly confirmationNote: string | null;
  readonly riskNotes: readonly string[];
  readonly placeQuery: string | null;
  readonly urgency: "overdue" | "high" | "normal";
}

const EVENT_LABEL: Record<EventKind, string> = {
  meeting_someone: "人と会う予定",
  interview: "面接",
  trip: "旅行",
  business_trip: "出張",
  ceremony: "冠婚葬祭",
  shoot: "撮影",
  important_event: "予定",
};

const ACTION_LABEL: Record<LifeOpsAction, string> = {
  observe: "記録します",
  notify: "お知らせします",
  suggest: "候補を出します",
  open_link: "予約ページへ進めます",
  assist_input: "入力をお手伝いします",
  auto_execute: "自動で進めます",
};

/** reasonCodes → 可読注記（未マップ＝内部コードは表示しない）。 */
const RISK_NOTE: Record<string, string> = {
  risk_personal_info: "個人情報の入力があります",
  risk_high_cost: "費用が高めです",
  risk_cancellation_fee: "キャンセル料がかかる場合があります",
  risk_card_required: "カード登録があります",
  risk_appearance_change: "見た目が大きく変わります",
  risk_nomination: "指名の選択があります",
  risk_first_visit: "初めてのお店です",
  risk_long_session: "時間がかかります",
  risk_far_location: "少し遠いです",
  medical_no_auto_suggest_cap: "健康に関わるため、提案までにします",
  // confirmation_required は confirmationNote で／level4_5_future_gated は内部（表示しない）
};

/** dueReason → 非断定の理由文（事実提示）。 */
function reasonText(d: DueReason): string {
  if (d.kind === "cycle") {
    return d.phase === "well_beyond"
      ? `前回から${d.elapsedDays}日（目安の約${d.typicalIntervalDays}日を過ぎています）`
      : `前回から${d.elapsedDays}日（目安は約${d.typicalIntervalDays}日）`;
  }
  if (d.kind === "event_prep") {
    const head = `${d.daysUntilEvent}日後の${EVENT_LABEL[d.eventKind] ?? "予定"}に向けて`;
    return d.cyclePhase === "nearing" ? `${head}、そろそろ整えるタイミングです` : head;
  }
  return d.overdue ? "期日を過ぎています" : `期日まで${d.daysUntilDeadline}日です`;
}

/** event_prep のみ「◯日前が自然」を出す（recommendedLeadDays）。 */
function timingHint(d: DueReason): string | null {
  return d.kind === "event_prep" ? `${d.recommendedLeadDays}日前が自然です` : null;
}

/** 表示順/強調用の緊急度。 */
function urgency(d: DueReason): LifeOpsCardViewModel["urgency"] {
  if (d.kind === "deadline") return d.overdue ? "overdue" : "high";
  if (d.kind === "event_prep") return d.daysUntilEvent <= 3 ? "high" : "normal";
  return "normal";
}

function riskNotes(reasonCodes: readonly string[]): readonly string[] {
  return reasonCodes.map((c) => RISK_NOTE[c]).filter((s): s is string => typeof s === "string");
}

/** candidate + assessment → ViewModel（pure・非断定）。 */
export function toLifeOpsCardViewModel(candidate: LifeOpsCandidate, assessment: PermissionAssessment): LifeOpsCardViewModel {
  return {
    category: candidate.category,
    title: getCategorySpec(candidate.category)?.label ?? candidate.category,
    reasonText: reasonText(candidate.dueReason),
    timingHint: timingHint(candidate.dueReason),
    actionLabel: ACTION_LABEL[assessment.maxAllowedAction],
    requiresConfirmation: assessment.requiresExplicitConfirmation,
    confirmationNote: assessment.requiresExplicitConfirmation ? "内容を確認してから進めます" : null,
    riskNotes: riskNotes(assessment.reasonCodes),
    placeQuery: candidate.placeQuery,
    urgency: urgency(candidate.dueReason),
  };
}

const URGENCY_RANK: Record<LifeOpsCardViewModel["urgency"], number> = { overdue: 0, high: 1, normal: 2 };

/** candidates → ViewModel[]（permission を内部算出・urgency 順・安定）。 */
export function toLifeOpsCardViewModels(candidates: readonly LifeOpsCandidate[]): readonly LifeOpsCardViewModel[] {
  return candidates
    .map((c, i) => ({ vm: toLifeOpsCardViewModel(c, assessLifeOpsPermission(c)), i }))
    .sort((a, b) => {
      const r = URGENCY_RANK[a.vm.urgency] - URGENCY_RANK[b.vm.urgency];
      return r !== 0 ? r : a.i - b.i;
    })
    .map((x) => x.vm);
}
