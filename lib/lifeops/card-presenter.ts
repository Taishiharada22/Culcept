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
import { getTouchpointSpec } from "./relationship-model";
import { assessLifeOpsPermission, type LifeOpsAction, type PermissionAssessment } from "./permission";
import { buildBookingLinks, type BookingLink } from "./booking-link";

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
  /** L-6 deep-link（open_link 許可＝美容系のみ非空）。card はこれを実外部リンクで描画。 */
  readonly bookingLinks: readonly BookingLink[];
  readonly urgency: "overdue" | "high" | "normal";
}

/** presenter 注入オプション（地域/駅は実データ源・注入）。 */
export interface CardPresenterOptions {
  readonly area?: string | null;
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
  if (d.kind === "recurring") {
    return d.daysUntilNext === 0 ? `${d.recurrenceLabel}・今日です` : `${d.recurrenceLabel}・あと${d.daysUntilNext}日です`;
  }
  if (d.kind === "habit") {
    // 低圧（責めない）。やるべき/遅れ/未達/サボ は出さない。neuron（taxonomy 定数 label）があれば精緻化。
    const approach = d.neuron?.approachLabel;
    const unit = d.neuron?.unitLabel;
    if (d.phase === "ease_in") {
      return approach ? `${approach}を軽めに1回入れると、今週の流れを戻しやすいです` : "軽めに1回入れると、今週の流れを戻しやすいです";
    }
    if (d.phase === "restart") {
      return unit ? `少し空きましたね。${unit}だけの再開でも自然です` : "少し空きましたね。短めに再開すると自然です";
    }
    return unit ? `今日は${unit}だけでも、戻るきっかけになります` : "今日は5分だけでも、戻るきっかけになります"; // gentle_restart
  }
  if (d.kind === "relationship") return relationshipReasonText(d);
  return d.overdue ? "期日を過ぎています" : `期日まで${d.daysUntilDeadline}日です`; // deadline
}

/** 人間関係の理由文（低圧・redacted・断定/送信誘導/感情推定なし・personRef を含まない）。 */
function relationshipReasonText(d: Extract<DueReason, { kind: "relationship" }>): string {
  const tp = d.touchpointId;
  if (tp === "birthday" || tp === "anniversary" || tp === "seasonal_gift") {
    return d.daysUntil === 0
      ? "今日が大切な日です。ひとこと添えると自然です"
      : `${d.daysUntil}日後に大切な日があります。ひとこと考えておくと安心です`;
  }
  if (tp === "long_time_no_contact") return "最近少し間が空いています。軽く近況を思い出しておくと自然です";
  if (tp === "visit_family") return "少し間が空いています。顔を見せるタイミングを考えておくと自然です";
  if (tp === "borrowed_item_return") return "借りたものを返す機会をつくると、すっきりします";
  if (tp === "pre_event_encouragement") return "大事な日が近い人がいます。ひとこと考えておくと自然です";
  if (tp === "post_event_result_check") return "大事な日が終わった頃です。様子をきいてみるのも自然です";
  if (tp === "post_meeting_followup") return "先日会った流れで、ひとこと添えると自然です";
  // thank_you_followup / return_gift / introduction_thanks / hosted_meal_thanks / support_thanks
  return "お礼を一言だけ整えておくと、気持ちよく区切れます";
}

/** evidence → 低圧の根拠文（補足行・責めない）。 */
const HABIT_EVIDENCE_NOTE: Record<string, string> = {
  recent_success: "最近うまくいった流れがあります",
  recent_struggle: "最近は詰まりやすかったので、軽くで十分です",
  sustained_streak: "これまでの積み重ねがあります",
  long_pause: "間が空くのは自然なことです",
};

/** 補足行: event_prep=「◯日前が自然」/ habit=evidence 根拠文 / relationship=gift 添付時の控えめな案内。 */
function timingHint(d: DueReason): string | null {
  if (d.kind === "event_prep") return `${d.recommendedLeadDays}日前が自然です`;
  if (d.kind === "habit" && d.neuron?.evidenceKind) return HABIT_EVIDENCE_NOTE[d.neuron.evidenceKind] ?? null;
  if (d.kind === "relationship" && d.giftRecommendations && d.giftRecommendations.length > 0) {
    return "相手の最近の関心に沿った贈り物の候補を用意できます"; // 商品名は出さない（metadata 参照）
  }
  return null;
}

/** 表示順/強調用の緊急度。 */
function urgency(d: DueReason): LifeOpsCardViewModel["urgency"] {
  if (d.kind === "deadline") return d.overdue ? "overdue" : "high";
  if (d.kind === "event_prep") return d.daysUntilEvent <= 3 ? "high" : "normal";
  if (d.kind === "recurring") return "high"; // within_lead で候補化＝近い
  return "normal"; // cycle
}

function riskNotes(reasonCodes: readonly string[]): readonly string[] {
  return reasonCodes.map((c) => RISK_NOTE[c]).filter((s): s is string => typeof s === "string");
}

/** candidate + assessment → ViewModel（pure・非断定）。bookingLinks は L-6（open_link 許可時のみ非空）。 */
export function toLifeOpsCardViewModel(
  candidate: LifeOpsCandidate,
  assessment: PermissionAssessment,
  opts: CardPresenterOptions = {}
): LifeOpsCardViewModel {
  const d = candidate.dueReason;
  const title =
    d.kind === "relationship"
      ? (getTouchpointSpec(d.touchpointId)?.label ?? getCategorySpec(candidate.category)?.label ?? candidate.category)
      : (getCategorySpec(candidate.category)?.label ?? candidate.category);
  return {
    category: candidate.category,
    title,
    reasonText: reasonText(candidate.dueReason),
    timingHint: timingHint(candidate.dueReason),
    actionLabel: ACTION_LABEL[assessment.maxAllowedAction],
    requiresConfirmation: assessment.requiresExplicitConfirmation,
    confirmationNote: assessment.requiresExplicitConfirmation ? "内容を確認してから進めます" : null,
    riskNotes: riskNotes(assessment.reasonCodes),
    placeQuery: candidate.placeQuery,
    bookingLinks: buildBookingLinks(candidate, assessment, { area: opts.area ?? null }),
    urgency: urgency(candidate.dueReason),
  };
}

const URGENCY_RANK: Record<LifeOpsCardViewModel["urgency"], number> = { overdue: 0, high: 1, normal: 2 };

/** candidates → ViewModel[]（permission を内部算出・urgency 順・安定）。 */
export function toLifeOpsCardViewModels(
  candidates: readonly LifeOpsCandidate[],
  opts: CardPresenterOptions = {}
): readonly LifeOpsCardViewModel[] {
  return candidates
    .map((c, i) => ({ vm: toLifeOpsCardViewModel(c, assessLifeOpsPermission(c), opts), i }))
    .sort((a, b) => {
      const r = URGENCY_RANK[a.vm.urgency] - URGENCY_RANK[b.vm.urgency];
      return r !== 0 ? r : a.i - b.i;
    })
    .map((x) => x.vm);
}
