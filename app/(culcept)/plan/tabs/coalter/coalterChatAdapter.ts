/**
 * coalterChatAdapter — /plan CoAlter タブのチャット adapter 境界（TalkBridge-T1a skeleton）
 *
 * 正本: docs/coalter-plan-tab-talk-migration-design.md §4（T1 を T1a/T1b/T1c に分割・
 *   CEO 承認 2026-06-12）。実装順序の正本: ①デザイン正本化(済) → ②adapter 境界(本 file)
 *   → ③read-only /talk thread 表示(T1b) → ④send/realtime(T1c) → ⑤useCoAlter → ⑥Plan Intelligence 投影。
 *
 * T1a 厳格スコープ:
 *   - additive only / fixture が既定かつ現行動作（flag OFF で視覚的に完全不変）
 *   - **実 API 呼び出しなし**: /api/talk/* fetch・Realtime・POST・既読・typing は本 file に存在しない
 *   - useCoAlter import なし / CoAlter runtime invoke なし / DB write なし
 *
 * ★ T1a contract correction（CEO 2026-06-12）: **2 つの軸を厳密に分離する**。
 *   (A) Provider / data-mode = adapter がどこからデータを引くか（mock=fixture か live か）
 *   (B) Participant source    = 参加者 identity の出自（self / talk_pair_member /
 *       culcept_relation / plan_session）。**`fixture` は participant source ではない**。
 *       fixture data に裏打ちされても、その中の participant は正規の participant source
 *       （plan_session）を持つ。「mock かどうか」は (A) provider 軸が担い、(B) には混ぜない。
 *   - participant source の命名は TravelCore `ParticipantSourceRef`（commit 44c0a1f1・
 *     `lib/shared/travel/core-types.ts`）と整合（self/talk_pair_member/culcept_relation/plan_session）。
 *   - チャット UI（CoAlterChatPanel）は本 adapter の view 型のみを見る。fixture 型・
 *     /talk API payload 型への直接依存を持たない（T1b で adapter 実装だけ差し替える）。
 */

import type { CoAlterPlanSessionFixture } from "./coalterPlanSessionFixture";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// (A) Provider / data-mode 軸 — adapter の裏側（mock=fixture か live か）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** provider の種別一覧（**fixture を含む**＝mock かどうかはこの軸）。 */
export const COALTER_CHAT_PROVIDER_KINDS = [
  "fixture",
  "talk_thread",
  "culcept_relation",
  "plan_session",
] as const;

export type CoAlterChatProviderKind = (typeof COALTER_CHAT_PROVIDER_KINDS)[number];

export type CoAlterChatProvider =
  /** fixture data（T1a の既定・現行動作・**mock**） */
  | { readonly kind: "fixture"; readonly sessionId: string }
  /** 旧 /talk スレッド由来（T1b read-only 以降・live） */
  | { readonly kind: "talk_thread"; readonly threadId: string }
  /** 将来の Culcept 関係正本由来（live） */
  | { readonly kind: "culcept_relation"; readonly relationId: string }
  /** 将来の CoAlterPlanSession 実体由来（live） */
  | { readonly kind: "plan_session"; readonly sessionId: string };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// (B) Participant source 軸 — 参加者 identity の出自
//     **fixture はここに存在しない**（TravelCore ParticipantSourceRef と整合）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** participant source の種別一覧（**fixture は含まれない**＝identity の出自のみ）。 */
export const COALTER_PARTICIPANT_SOURCE_KINDS = [
  "self",
  "talk_pair_member",
  "culcept_relation",
  "plan_session",
] as const;

export type CoAlterParticipantSourceKind =
  (typeof COALTER_PARTICIPANT_SOURCE_KINDS)[number];

/**
 * participant identity の出自。TravelCore `ParticipantSourceRef` と 1:1 で揃える。
 *   - self            … 単独利用 / セッション主体
 *   - talk_pair_member … 旧 /talk CoAlter pair（coalter_pair_states）由来（**唯一の出自ではない**）
 *   - culcept_relation … Culcept 側の partner / relationship 由来
 *   - plan_session     … CoAlterPlanSession.participants 由来（fixture mock もここに入る）
 */
export type CoAlterParticipantSource =
  | { readonly kind: "self"; readonly userId: string }
  | { readonly kind: "talk_pair_member"; readonly pairStateId: string; readonly userId: string }
  | { readonly kind: "culcept_relation"; readonly relationId: string; readonly userId: string }
  | { readonly kind: "plan_session"; readonly planSessionId: string; readonly userId: string };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// View 型（UI が見る唯一の形。fixture 型への import 依存はここで切る）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface CoAlterChatParticipant {
  readonly id: string;
  readonly name: string;
  readonly initial: string;
  readonly tone: "sky" | "rose";
  /** identity 出自（**fixture ではなく** plan_session 等の正規 source）。 */
  readonly source: CoAlterParticipantSource;
}

export interface CoAlterChatMessage {
  readonly id: string;
  /** participant id か "coalter" */
  readonly author: string;
  /** 表示用時刻。例 "10:24" */
  readonly time: string;
  readonly text: string;
  readonly reaction?: { readonly emoji: string; readonly count: number };
}

/**
 * 送信モードの段階:
 *   - "local_echo": ローカル append のみ（fixture・現行動作）
 *   - "none"      : 閲覧のみ（T1b read-only thread 想定）
 *   - "live"      : 実送信（T1c 以降・本 slice では実装しない）
 */
export type CoAlterChatSendMode = "local_echo" | "none" | "live";

/**
 * 読み込みモード:
 *   - "fixture": mock data（T1a・現行動作）
 *   - "live"   : 実 read（T1b talk_thread read-only・本 slice では実装しない）
 */
export type CoAlterChatReadMode = "fixture" | "live";

/**
 * capability は **段階ごとに独立した field**。
 *
 * ★ flag semantics（CEO 2026-06-12）: `NEXT_PUBLIC_PLAN_COALTER_CHAT_LIVE` を
 *   「read + send + 既読 + realtime + CoAlter invoke を一括で点ける単一スイッチ」に
 *   **してはならない**。read-only / send / realtime / 既読 / CoAlter invoke は将来も
 *   別段階・別 gate のまま。この構造（独立 field の集合）がそれを型で担保する
 *   — 1 つの flag では全 field を同時に true にできない。
 */
export interface CoAlterChatCapabilities {
  /** 読み込み源（T1b で別 gate により "live"） */
  readonly read: CoAlterChatReadMode;
  /** 送信（T1c・別 gate） */
  readonly send: CoAlterChatSendMode;
  /** Realtime 購読（T1c・別 gate） */
  readonly realtime: boolean;
  /** 既読送信（別 phase・別 gate） */
  readonly readReceipts: boolean;
  /** CoAlter runtime invoke（useCoAlter phase・別 gate） */
  readonly coalterInvoke: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Adapter 契約
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface CoAlterChatAdapter {
  /** (A) provider / data-mode（mock=fixture か live か）。 */
  readonly provider: CoAlterChatProvider;
  readonly capabilities: CoAlterChatCapabilities;
  getParticipants(): readonly CoAlterChatParticipant[];
  /** 送信者として扱う本人（solo では唯一の participant・不明なら null） */
  getViewer(): CoAlterChatParticipant | null;
  /** 初期表示メッセージ（T1a は同期＝fixture。T1b で async 読み込みは adapter 内部に閉じる） */
  getInitialMessages(): readonly CoAlterChatMessage[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixture adapter（T1a の唯一の実装・現行動作の正本化）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * fixture participant → view participant。
 * **fixture は provider 軸（mock）**であり participant source ではないので、
 * identity は `plan_session`（CoAlterPlanSession.participants 由来）に正規化する。
 * render は id/name/initial/tone のみ使うため見た目は完全不変。
 */
function toChatParticipant(
  p: CoAlterPlanSessionFixture["participants"][number],
  planSessionId: string,
): CoAlterChatParticipant {
  return {
    id: p.id,
    name: p.name,
    initial: p.initial,
    tone: p.tone,
    source: { kind: "plan_session", planSessionId, userId: p.id },
  };
}

export function createFixtureChatAdapter(
  session: CoAlterPlanSessionFixture,
): CoAlterChatAdapter {
  const participants = session.participants.map((p) =>
    toChatParticipant(p, session.id),
  );
  return {
    provider: { kind: "fixture", sessionId: session.id },
    // fixture は mock 読み込み + local echo のみ。他段階は全て無効（独立 field）。
    capabilities: {
      read: "fixture",
      send: "local_echo",
      realtime: false,
      readReceipts: false,
      coalterInvoke: false,
    },
    getParticipants: () => participants,
    getViewer: () => participants[0] ?? null,
    getInitialMessages: () => session.messages,
  };
}

/**
 * Adapter 解決（UI からの唯一の入口）。
 *
 * T1a: `liveEnabled`（= NEXT_PUBLIC_PLAN_COALTER_CHAT_LIVE）が true でも **fixture を返す**。
 *   live adapter（talk_thread read-only）は T1b で本関数の分岐にのみ追加し、UI は不変のまま
 *   差し替わる。flag default OFF ＝ 既定・現行動作は fixture（視覚的に完全不変）。
 *   ★ この flag は read-only の gate であって、send/realtime/既読/invoke を点ける物ではない
 *     （それらは capabilities の独立 field・各々別段階）。
 */
export function resolveCoAlterChatAdapter(opts: {
  readonly session: CoAlterPlanSessionFixture;
  readonly liveEnabled: boolean;
}): CoAlterChatAdapter {
  // T1b 接続点: if (opts.liveEnabled) return createTalkThreadReadonlyAdapter(...)（CEO GO 後）
  return createFixtureChatAdapter(opts.session);
}
