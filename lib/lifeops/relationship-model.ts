/**
 * Life Ops A-6 — Relationship Model（**pure 契約・no-DB・no-UI・no-通知・no-送信・no-外部**・barrel 非 export）
 *
 * 設計: docs/life-ops-relationship-gift-intelligence-mini-design.md §1・§4・§11〜§13
 *
 * 役割: 人間関係メンテの **touchpoint taxonomy（25種・3群）**・**opaque personRef 契約**・**suppression（手動のみ）**・
 *   **連絡下書きの構造（本文生成 blocked）**・**偵察プロンプト（聞くきっかけ提案のみ）**・**permission（初期最高安全）**。
 *
 * 厳守:
 *   - **opaque personRef のみ**（実名/email/電話/SNS ID/住所/raw contact を型・パターンで遮断）。
 *   - 通信実行なし（下書き構造まで・本文生成は literal "blocked"）。自動送信/通知/購入/予約は blocked 定数で固定。
 *   - suppression は手動入力のみ（自動検出しない）。pure・deterministic・横エンジン非 import・barrel 非 export。
 */

/** opaque personRef のパターン（email/電話/実名/自由文字列を構造的に排除）。 */
const PERSON_REF_PATTERN = /^p_[a-z0-9][a-z0-9_-]{3,63}$/;

/** ref が opaque personRef か（@・空白・日本語・数字列電話などは全て false）。 */
export function isOpaquePersonRef(ref: string): boolean {
  return PERSON_REF_PATTERN.test(ref);
}

/** 関係種別（closed vocabulary）。 */
export type RelationKind = "family" | "partner" | "close_friend" | "friend" | "colleague" | "mentor" | "acquaintance";
export const RELATION_KINDS: readonly RelationKind[] = ["family", "partner", "close_friend", "friend", "colleague", "mentor", "acquaintance"];

/** touchpoint の群。 */
export type RelationshipTouchpointGroup = "celebration_gift" | "reciprocity" | "contact";

/** 接点 25 種（祝い/贈答 12・お返し/義理 6・接点 7）。 */
export type RelationshipTouchpointId =
  // celebration_gift
  | "birthday" | "anniversary" | "seasonal_gift" | "promotion" | "new_job" | "graduation"
  | "exam_pass" | "marriage" | "childbirth" | "new_home" | "recovery" | "opening_business"
  // reciprocity
  | "thank_you_followup" | "return_gift" | "borrowed_item_return" | "introduction_thanks"
  | "hosted_meal_thanks" | "support_thanks"
  // contact
  | "long_time_no_contact" | "casual_checkin" | "post_meeting_followup" | "pre_event_encouragement"
  | "post_event_result_check" | "visit_family" | "shared_plan_followup";

export interface RelationshipTouchpointSpec {
  readonly id: RelationshipTouchpointId;
  readonly group: RelationshipTouchpointGroup;
  readonly label: string;
  readonly giftRelevant: boolean; // ギフト推薦の対象になり得るか
}

const TP = (id: RelationshipTouchpointId, group: RelationshipTouchpointGroup, label: string, giftRelevant: boolean): RelationshipTouchpointSpec => ({ id, group, label, giftRelevant });

/** touchpoint taxonomy（正本）。 */
export const RELATIONSHIP_TOUCHPOINTS: readonly RelationshipTouchpointSpec[] = [
  TP("birthday", "celebration_gift", "誕生日", true),
  TP("anniversary", "celebration_gift", "記念日", true),
  TP("seasonal_gift", "celebration_gift", "季節の贈り物", true),
  TP("promotion", "celebration_gift", "昇進祝い", true),
  TP("new_job", "celebration_gift", "転職祝い", true),
  TP("graduation", "celebration_gift", "卒業祝い", true),
  TP("exam_pass", "celebration_gift", "合格祝い", true),
  TP("marriage", "celebration_gift", "結婚祝い", true),
  TP("childbirth", "celebration_gift", "出産祝い", true),
  TP("new_home", "celebration_gift", "新居祝い", true),
  TP("recovery", "celebration_gift", "快気祝い", true),
  TP("opening_business", "celebration_gift", "開業祝い", true),
  TP("thank_you_followup", "reciprocity", "お礼", true),
  TP("return_gift", "reciprocity", "お返し", true),
  TP("borrowed_item_return", "reciprocity", "借りたものの返却", false),
  TP("introduction_thanks", "reciprocity", "紹介のお礼", true),
  TP("hosted_meal_thanks", "reciprocity", "ご馳走のお礼", true),
  TP("support_thanks", "reciprocity", "助けてもらったお礼", true),
  TP("long_time_no_contact", "contact", "久々の連絡", false),
  TP("casual_checkin", "contact", "近況確認", false),
  TP("post_meeting_followup", "contact", "会った後のフォロー", false),
  TP("pre_event_encouragement", "contact", "大事な日の前の応援", false),
  TP("post_event_result_check", "contact", "結果を聞く", false),
  TP("visit_family", "contact", "帰省・訪問", true),
  TP("shared_plan_followup", "contact", "共有予定のフォロー", false),
];

export function getTouchpointSpec(id: string): RelationshipTouchpointSpec | undefined {
  return RELATIONSHIP_TOUCHPOINTS.find((t) => t.id === id);
}
export function listTouchpointsByGroup(group: RelationshipTouchpointGroup): readonly RelationshipTouchpointSpec[] {
  return RELATIONSHIP_TOUCHPOINTS.filter((t) => t.group === group);
}

// ── suppression（手動入力のみ・自動検出しない）──

/** 抑制状態（全フィールド手動）。 */
export interface RelationshipSuppression {
  readonly doNotSuggest?: boolean;
  readonly mourning?: boolean;
  readonly sensitivePeriod?: boolean;
  readonly keepDistance?: boolean; // relationship_distance
  readonly recentTouchpointCount?: number; // 直近の接点提案数（frequency cap 用）
}

/** contact 群の頻度上限（これ以上は提案しない＝「重い人」防止）。 */
export const FREQUENCY_CAP = 3;

export type SuppressionReasonCode =
  | "do_not_suggest" | "relationship_distance" | "mourning_suppression" | "sensitive_period" | "frequency_cap";

export interface SuppressionVerdict {
  readonly allowed: boolean;
  readonly reasonCode: SuppressionReasonCode | null;
}

/** touchpoint × suppression → 許可判定（安全側）。 */
export function evaluateSuppression(touchpointId: string, s: RelationshipSuppression): SuppressionVerdict {
  const spec = getTouchpointSpec(touchpointId);
  if (s.doNotSuggest) return { allowed: false, reasonCode: "do_not_suggest" }; // 全抑制
  if (s.keepDistance) return { allowed: false, reasonCode: "relationship_distance" }; // 全抑制
  if (spec?.group === "celebration_gift") {
    if (s.mourning) return { allowed: false, reasonCode: "mourning_suppression" };
    if (s.sensitivePeriod) return { allowed: false, reasonCode: "sensitive_period" };
  }
  if (spec?.group === "contact" && (s.recentTouchpointCount ?? 0) >= FREQUENCY_CAP) {
    return { allowed: false, reasonCode: "frequency_cap" };
  }
  return { allowed: true, reasonCode: null };
}

// ── 連絡下書きの構造（本文生成は blocked）──

export interface ContactDraftStructure {
  readonly tone: "casual" | "warm" | "formal";
  readonly length: "short" | "medium";
  readonly opener: "recent_topic" | "gratitude" | "season" | "occasion";
  readonly cta: "none" | "light_meet" | "ask_recent";
  /** 本文生成は現段階で構造的に blocked（LLM 文面生成はゲート）。 */
  readonly bodyGeneration: "blocked";
}

const FORMAL_RELATIONS = new Set<RelationKind>(["colleague", "mentor", "acquaintance"]);
const GRATITUDE_TOUCHPOINTS = new Set<string>(["thank_you_followup", "introduction_thanks", "hosted_meal_thanks", "support_thanks", "post_meeting_followup", "return_gift"]);
const OCCASION_GROUPS = new Set<RelationshipTouchpointGroup>(["celebration_gift"]);

/** touchpoint × relationKind → 下書き構造（pure・本文なし）。 */
export function buildContactDraftStructure(touchpointId: RelationshipTouchpointId, relationKind: RelationKind): ContactDraftStructure {
  const spec = getTouchpointSpec(touchpointId);
  const formal = FORMAL_RELATIONS.has(relationKind);
  const opener = GRATITUDE_TOUCHPOINTS.has(touchpointId)
    ? "gratitude"
    : spec && OCCASION_GROUPS.has(spec.group)
      ? "occasion"
      : touchpointId === "pre_event_encouragement" || touchpointId === "post_event_result_check"
        ? "recent_topic"
        : "season"; // 久々連絡・近況確認
  const cta = touchpointId === "long_time_no_contact" ? "light_meet" : touchpointId === "casual_checkin" ? "ask_recent" : "none";
  return {
    tone: formal ? "formal" : relationKind === "friend" ? "casual" : "warm",
    length: formal ? "medium" : "short",
    opener,
    cta,
    bodyGeneration: "blocked",
  };
}

// ── Tier C: 偵察プロンプト（聞くきっかけの提案のみ・通信実行なし）──

export interface ScoutingPrompt {
  readonly touchpointId: RelationshipTouchpointId;
  readonly promptText: string; // 定数のみ・低圧・personRef を含まない
}

const SCOUTING_TEXTS: readonly string[] = [
  "次に会うとき、「最近買ってよかったものある？」と聞いてみると、候補が絞れます",
  "「最近なにかハマってる？」と話題にしてみると、好みの方向が見えてきます",
];

/** gift 対象 touchpoint のみ偵察プロンプトを返す（それ以外は空・提案のみで送信しない）。 */
export function buildScoutingPrompts(touchpointId: RelationshipTouchpointId): readonly ScoutingPrompt[] {
  const spec = getTouchpointSpec(touchpointId);
  if (!spec?.giftRelevant) return [];
  return SCOUTING_TEXTS.map((promptText) => ({ touchpointId, promptText }));
}

// ── permission（初期は最も高い安全・自動実行系は全 blocked）──

export const RELATIONSHIP_BLOCKED_ACTIONS = [
  "auto_send",
  "auto_notify",
  "external_message",
  "purchase",
  "reservation",
  "draft_body_generation",
] as const;
export type RelationshipBlockedAction = (typeof RELATIONSHIP_BLOCKED_ACTIONS)[number];

export interface RelationshipPermissionProfile {
  readonly maxAllowedAction: "suggest"; // 提案まで（deep-link 化は後続 gate）
  readonly requiresExplicitConfirmation: true;
  readonly blockedActions: readonly RelationshipBlockedAction[];
}

/** 人間関係系の許可（全 touchpoint 共通・初期固定）。 */
export function assessRelationshipPermission(): RelationshipPermissionProfile {
  return { maxAllowedAction: "suggest", requiresExplicitConfirmation: true, blockedActions: RELATIONSHIP_BLOCKED_ACTIONS };
}
