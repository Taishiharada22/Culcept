/**
 * coalterPlanSessionContract — /plan CoAlter の session 契約 v0.1（B-1 binding skeleton）
 *
 * 正本: docs/coalter-plan-session-binding-design.md（B+C 設計・CEO 承認 2026-06-12）。
 * 製品定義: 「/plan CoAlter = PlanSession にいる 2 人と CoAlter がプランを組む場」
 * （/talk thread を選んで見るものではない）。
 *
 * B-1 厳格スコープ: **型/契約 skeleton のみ・additive**。runtime binding・fetch・API・DB なし。
 *   - fixture が既定のまま（既存 CoAlter タブは不変で描画。本契約は consume 側未配線）。
 *   - 本契約を import する側に runtime 依存を生まない（型 import のみ・pure 関数のみ）。
 *
 * 契約 v0.1（CEO 承認）の要点:
 *   - **正本は `participants`**。root `pairStateId` は持たない（identity 源にしない）。
 *   - thread は `attachedThreadRef?` の optional bridge のみ（session 成立条件でない・identity 源でない）。
 *   - **CoAlter は participants に入れない**（system actor・author `"coalter"` 予約）。
 *   - participant の identity 出自は `ParticipantSourceRef`。**既定は plan_session**。
 *     talk_pair_member は authoritative `coalter_pair_states` 解決時のみ（本 skeleton は産出しない）。
 */

// 型のみ import（runtime 依存ゼロ・fetch 関数は引き込まれない）
import type { CoAlterParticipantSource } from "./coalterChatAdapter";
import type {
  CoAlterPlanMode,
  CoAlterPlanSessionFixture,
} from "./coalterPlanSessionFixture";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Participant identity（TravelCore ParticipantSourceRef と 1:1）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * participant identity の出自。この worktree では adapter の `CoAlterParticipantSource` が
 * 局所正本で、TravelCore `ParticipantSourceRef`（commit 44c0a1f1）と 1:1（T1a 訂正 ed152ccd）。
 * ⇒ session participant をそのまま TravelCorePlan の participants に無変換で渡せる。
 *
 * 注（skeleton 期の layering）: 本来 identity source は contract 層が正本だが、B-1 では
 * 既存 adapter の型を再利用（additive・重複回避）。C-1/B-2 で正本を contract へ移す余地を残す。
 */
export type ParticipantSourceRef = CoAlterParticipantSource;

/**
 * CoAlter の予約 author 名前空間。**system actor** であり participants には含めない。
 * consent / fairness / per-viewer payload(M5) の主語は人間のみ（CoAlter を主語にしない）。
 */
export const COALTER_SYSTEM_AUTHOR = "coalter" as const;
export type CoAlterSystemAuthor = typeof COALTER_SYSTEM_AUTHOR;

/** message.author が CoAlter（system actor）か。true なら human participant ではない。 */
export function isCoAlterSystemAuthor(author: string): author is CoAlterSystemAuthor {
  return author === COALTER_SYSTEM_AUTHOR;
}

/**
 * session の人間参加者（1〜2 人）。
 *
 * - `userId` は**内部安定 id**（auth user id 相当）。**user-facing 表示に使わない**
 *   （CEO note 2026-06-12: raw userId を UI コピー/ログに漏らさない）。表示は下記 presentation で行う。
 * - `source` は identity 出自（plan_session / culcept_relation / self / talk_pair_member）。
 * - presentation（displayName / initial / tone）は userId と**分離**した表示専用 field。
 */
export interface SessionParticipant {
  readonly userId: string;
  readonly source: ParticipantSourceRef;
  // ── presentation（userId とは別。表示はここだけを使う） ──
  readonly displayName: string;
  readonly initial: string;
  readonly tone: "sky" | "rose";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Session 契約
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 旧 /talk thread への optional 参照（bridge のみ・identity 源でも session root でもない）。 */
export interface AttachedThreadRef {
  readonly threadId: string;
}

export type CoAlterPlanWindow =
  | { readonly date: string }
  | { readonly start: string; readonly end: string; readonly nights: 1 | 2 };

export type CoAlterPlanStage = "understanding" | "curating" | "resolving" | "confirmed";

/**
 * CoAlterPlanSession v0.1（binding skeleton）。
 *
 * **正本は `participants`**（誰と誰の会話か）。`pairStateId` は持たない。
 * plan 内容（conditions / candidates / adjustments）は session state として fixture が現状保持し、
 * 本 skeleton では binding（identity・session 窓・thread bridge）に限定する（後続 slice で拡張）。
 */
export interface CoAlterPlanSession {
  readonly id: string;
  /** 1〜2 人（solo = 1）。**CoAlter は含めない**（system actor）。 */
  readonly participants: readonly SessionParticipant[];
  readonly mode: CoAlterPlanMode;
  readonly window: CoAlterPlanWindow;
  readonly stage: CoAlterPlanStage;
  /** optional bridge。**未指定で session は成立**（thread を要求しない）。 */
  readonly attachedThreadRef?: AttachedThreadRef;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixture → 契約 projection（pure・現状の Kento/Mio を participants 表現に）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * fixture participant → SessionParticipant。
 * 出自は **plan_session**（fixture は plan session の mock data）。**talk_pair_member にしない**。
 * userId = fixture の mock id・表示は displayName/initial/tone（分離）。
 */
export function buildSessionParticipantsFromFixture(
  fixture: CoAlterPlanSessionFixture,
): readonly SessionParticipant[] {
  return fixture.participants.map((p) => ({
    userId: p.id,
    source: { kind: "plan_session", planSessionId: fixture.id, userId: p.id },
    displayName: p.name,
    initial: p.initial,
    tone: p.tone,
  }));
}

/**
 * fixture → CoAlterPlanSession 契約（pure）。
 * **`pairStateId` は読まない**（v0.1 で identity 源は participants）。
 * fixture は thread を持たないため `attachedThreadRef` は付かない（= threadId なしで session 成立）。
 */
export function buildSessionContractFromFixture(
  fixture: CoAlterPlanSessionFixture,
): CoAlterPlanSession {
  return {
    id: fixture.id,
    participants: buildSessionParticipantsFromFixture(fixture),
    mode: fixture.mode,
    window: fixture.window,
    stage: fixture.stage,
    // attachedThreadRef: 付けない（optional bridge・fixture に thread なし）
  };
}
