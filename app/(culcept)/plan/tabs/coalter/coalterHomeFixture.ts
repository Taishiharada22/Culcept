/**
 * coalterHomeFixture — CoAlter ホーム画面（会話一覧 + おすすめ + 最近のご提案）の **fixture data**
 *
 * 参考: app/(culcept)/components/coalter/home.png（CEO 提供・会話一覧ホーム）。
 * スコープ: **presentation 用 fixture のみ**。実会話/複数 session の配線は logic/data 層（別セッション）。
 */

import { COALTER_PLAN_SESSION_FIXTURES, type PlanCandidateFixture } from "./coalterPlanSessionFixture";

export type CoAlterAvatarTone = "sky" | "rose" | "violet" | "emerald" | "amber";

/** ホームの会話一覧の 1 件（direct = 1on1 / group = グループ）。 */
export interface CoAlterHomeConversation {
  readonly id: string;
  readonly name: string;
  readonly kind: "direct" | "group";
  readonly initial: string;
  readonly tone: CoAlterAvatarTone;
  readonly lastMessage: string;
  /** 表示用。"09:12" / "昨日" / "月曜日" など。 */
  readonly time: string;
  readonly unread?: number;
  /** group の補助表示（人数など・任意）。 */
  readonly subLabel?: string;
}

/** 「おすすめ」アクションカード。 */
export interface CoAlterHomeRecommendation {
  readonly id: string;
  readonly label: string;
  readonly caption: string;
  readonly icon: "create" | "candidates" | "confirm";
  readonly accent: "violet" | "sky" | "emerald";
}

/** 「最近のご提案」= 既存の plan candidate を流用（route mini-map を描ける）。 */
export interface CoAlterHomeRecentProposal {
  readonly id: string;
  readonly candidate: PlanCandidateFixture;
  readonly participantsLabel: string;
}

export interface CoAlterHomeFixture {
  readonly conversations: readonly CoAlterHomeConversation[];
  readonly recommendations: readonly CoAlterHomeRecommendation[];
  readonly recent: CoAlterHomeRecentProposal;
}

// ── 会話一覧（home.png 準拠） ──
const CONVERSATIONS: readonly CoAlterHomeConversation[] = [
  {
    id: "conv-aya",
    name: "Aya",
    kind: "direct",
    initial: "A",
    tone: "rose",
    lastMessage: "カフェの新しいお店、今度一緒に行こう〜",
    time: "09:12",
    unread: 1,
  },
  {
    id: "conv-family",
    name: "Family",
    kind: "group",
    initial: "F",
    tone: "emerald",
    lastMessage: "週末の良い予定リストを共有しました",
    time: "昨日",
    subLabel: "4人",
  },
  {
    id: "conv-weekend",
    name: "Weekend group",
    kind: "group",
    initial: "W",
    tone: "sky",
    lastMessage: "来週のキャンプ、楽しみですね",
    time: "昨日",
    subLabel: "5人",
  },
  {
    id: "conv-company",
    name: "会社メンバー",
    kind: "group",
    initial: "会",
    tone: "violet",
    lastMessage: "来月のランチの日程、調整中です",
    time: "月曜日",
    subLabel: "6人",
  },
];

// ── おすすめ（home.png 準拠） ──
const RECOMMENDATIONS: readonly CoAlterHomeRecommendation[] = [
  {
    id: "rec-create",
    label: "プランをつくる",
    caption: "今日の一日を組み立てる",
    icon: "create",
    accent: "violet",
  },
  {
    id: "rec-candidates",
    label: "候補プランを見る",
    caption: "CoAlter の提案を比較",
    icon: "candidates",
    accent: "sky",
  },
  {
    id: "rec-confirm",
    label: "予定を確認する",
    caption: "決まった行程をチェック",
    icon: "confirm",
    accent: "emerald",
  },
];

// ── 最近のご提案（既存 daily fixture の先頭候補を流用 = route mini-map が描ける） ──
const RECENT: CoAlterHomeRecentProposal = {
  id: "recent-1",
  candidate: COALTER_PLAN_SESSION_FIXTURES.daily.candidates[0],
  participantsLabel: "2人",
};

export const COALTER_HOME_FIXTURE: CoAlterHomeFixture = {
  conversations: CONVERSATIONS,
  recommendations: RECOMMENDATIONS,
  recent: RECENT,
};
