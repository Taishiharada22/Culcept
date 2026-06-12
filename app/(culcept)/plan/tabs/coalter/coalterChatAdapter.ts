/**
 * coalterChatAdapter — /plan CoAlter タブのチャット adapter 境界（TalkBridge-T1a skeleton）
 *
 * 正本: docs/coalter-plan-tab-talk-migration-design.md §4（T1 を T1a/T1b/T1c に分割・
 *   CEO 承認 2026-06-12）。実装順序の正本: ①デザイン正本化(済) → ②adapter 境界(本 file)
 *   → ③read-only /talk thread 表示(T1b) → ④send/realtime(T1c) → ⑤useCoAlter → ⑥Plan Intelligence 投影。
 *
 * スコープ（T1a skeleton + T1b read-only live read）:
 *   - fixture が既定かつ現行動作（flag OFF で視覚的に完全不変）
 *   - T1b: **read-only live read のみ**。既存 `GET /api/talk/threads/[threadId]/messages` を
 *     flag ON ∧ dev threadId 注入時に 1 回だけ読む（fetchImpl は `(url)=>Response` 形＝
 *     **POST/PATCH/DELETE が構文上発行できない**）。失敗/empty は fail-closed で fixture へ。
 *   - **存在しないもの**: send・既読 mark・typing・Realtime 購読・/api/coalter/*・
 *     useCoAlter import・CoAlter runtime invoke・DB write（T1c 以降・各 CEO GO）
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
  /**
   * identity 出自（**fixture ではなく** plan_session 等の正規 source）。
   *
   * T1b: **未解決（unresolved）の場合は省略する**。talk thread の messages API は
   * senderId しか返さず名前解決 API は T1b scope 外のため、live 閲覧の参加者は
   * 匿名メンバーとして表示し source を持たない（= thread 参加者を旧 /talk pair と
   * **断定しない**。無理に talk_pair_member を名乗らせない）。union 4 kinds は不変。
   */
  readonly source?: CoAlterParticipantSource;
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
 * 同期 adapter 解決（fixture 正本）。
 *
 * T1b 以降: live（talk_thread read-only）は **async のため `useCoAlterChatAdapter` hook が
 *   担う**（fetch は hook 内部に閉じる）。本関数は同期 fixture 解決の正本として残り、
 *   hook の fixture 経路・fail-closed 経路もここを通る。`liveEnabled` が true でも本関数は
 *   fixture を返す（live への昇格は hook 側の責務）。
 *   ★ flag（NEXT_PUBLIC_PLAN_COALTER_CHAT_LIVE）は read-only の gate であって、
 *     send/realtime/既読/invoke を点ける物ではない（capabilities の独立 field・各々別段階）。
 */
export function resolveCoAlterChatAdapter(opts: {
  readonly session: CoAlterPlanSessionFixture;
  readonly liveEnabled: boolean;
}): CoAlterChatAdapter {
  return createFixtureChatAdapter(opts.session);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T1b: talk_thread read-only 経路（GET 1回のみ・fail-closed）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * live read を試みる対象 threadId の解決（gate・pure）。
 *   - flag OFF → null（fetch 経路に入らない）
 *   - flag ON でも threadId 未指定/空 → null（fixture のまま・CEO T1b-3）
 *   - thread picker は作らない: threadId は dev 注入（env）のみ（CEO T1b thread resolution）
 */
export function resolveLiveReadTarget(opts: {
  readonly liveEnabled: boolean;
  readonly devThreadId: string;
}): string | null {
  if (!opts.liveEnabled) return null;
  const id = opts.devThreadId.trim();
  return id.length > 0 ? id : null;
}

/** GET /api/talk/threads/[threadId]/messages のレスポンス shape（route.ts 実装より）。 */
interface TalkThreadMessagesPayload {
  readonly ok?: boolean;
  readonly messages?: ReadonlyArray<{
    readonly id: string;
    readonly senderId: string;
    readonly body: string | null;
    readonly createdAt: string;
    readonly mediaUrl?: string | null;
    readonly reactions?: ReadonlyArray<{ readonly type: string; readonly userId: string }>;
  }>;
}

/** reaction type → 絵文字（/talk ChatClient の GENOME_REACTIONS と同値・表示のみ）。 */
const TALK_REACTION_EMOJI: Readonly<Record<string, string>> = {
  resonance: "∞",
  discovery: "💡",
  tell_more: "👂",
  moved: "🫀",
};

/** 匿名メンバーのラベル（identity 未解決・出現順。tone は交互）。 */
const ANON_MEMBER_LABELS = ["A", "B", "C", "D"] as const;

/**
 * sender 出現順 → 匿名 participant 導出（pure）。
 * source は付けない（unresolved）。旧 /talk pair（talk_pair_member）と**断定しない**。
 */
export function deriveAnonymousTalkParticipants(
  senderIdsInOrder: readonly string[],
): readonly CoAlterChatParticipant[] {
  const seen: string[] = [];
  for (const id of senderIdsInOrder) {
    if (!seen.includes(id)) seen.push(id);
  }
  return seen.map((id, i) => {
    const label = ANON_MEMBER_LABELS[i] ?? String(i + 1);
    return {
      id,
      name: `メンバー ${label}`,
      initial: label,
      tone: i % 2 === 0 ? ("sky" as const) : ("rose" as const),
      // source なし = identity 未解決（T1b read-only preview）
    };
  });
}

/** API message → view message（pure）。 */
export function mapTalkMessagesToView(
  raw: NonNullable<TalkThreadMessagesPayload["messages"]>,
): readonly CoAlterChatMessage[] {
  return raw.map((m) => {
    const body = (m.body ?? "").trim();
    const reactions = m.reactions ?? [];
    return {
      id: m.id,
      author: m.senderId,
      time: new Date(m.createdAt).toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      text: body.length > 0 ? body : m.mediaUrl ? "（画像）" : "",
      reaction:
        reactions.length > 0
          ? {
              emoji: TALK_REACTION_EMOJI[reactions[0].type] ?? "💡",
              count: reactions.length,
            }
          : undefined,
    };
  });
}

export type TalkThreadReadFailure =
  | "unauthorized" // 401
  | "forbidden" // 403
  | "not_found" // 404
  | "http_error" // その他 status
  | "empty" // ok だが messages 0 件（CEO T1b-4: empty も fail-closed）
  | "invalid_payload"
  | "network_error";

export type TalkThreadReadResult =
  | {
      readonly ok: true;
      readonly messages: readonly CoAlterChatMessage[];
      readonly participants: readonly CoAlterChatParticipant[];
    }
  | { readonly ok: false; readonly reason: TalkThreadReadFailure };

/**
 * GET-only fetch（読み取り専用を**構造で**担保する）。
 *
 *   - `fetchImpl` のシグネチャは `(url) => Promise<Response>` のみ＝ method/init を
 *     指定できない。既定の `fetch(url)` は GET。**POST/PATCH/DELETE は本経路から
 *     構文上発行できない**（CEO T1b: no POST/PATCH/DELETE）。
 *   - 既読 mark・typing・Realtime・/api/coalter/* は本 file に存在しない。
 *   - 401/403/404/HTTP error/empty/parse 失敗/network 例外 → すべて fail-closed
 *     （throw しない・呼び出し側は fixture へ）。
 */
export async function fetchTalkThreadMessagesOnce(
  threadId: string,
  fetchImpl: (url: string) => Promise<Response> = (url) => fetch(url),
): Promise<TalkThreadReadResult> {
  try {
    const res = await fetchImpl(
      `/api/talk/threads/${encodeURIComponent(threadId)}/messages`,
    );
    if (!res.ok) {
      const reason: TalkThreadReadFailure =
        res.status === 401
          ? "unauthorized"
          : res.status === 403
            ? "forbidden"
            : res.status === 404
              ? "not_found"
              : "http_error";
      return { ok: false, reason };
    }
    const payload = (await res.json()) as TalkThreadMessagesPayload;
    if (payload.ok !== true || !Array.isArray(payload.messages)) {
      return { ok: false, reason: "invalid_payload" };
    }
    if (payload.messages.length === 0) {
      return { ok: false, reason: "empty" };
    }
    const messages = mapTalkMessagesToView(payload.messages);
    const participants = deriveAnonymousTalkParticipants(
      payload.messages.map((m) => m.senderId),
    );
    return { ok: true, messages, participants };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}

/**
 * talk_thread read-only adapter（T1b・**閲覧のみ**）。
 *   - capabilities: read="live" / send="none"（**local echo も不可**＝実 thread に偽メッセージを
 *     乗せない）/ realtime・既読・invoke はすべて false
 *   - getViewer() は null（send なしのため viewer 解決自体を行わない）
 */
export function createTalkThreadReadonlyAdapter(
  threadId: string,
  data: {
    readonly messages: readonly CoAlterChatMessage[];
    readonly participants: readonly CoAlterChatParticipant[];
  },
): CoAlterChatAdapter {
  return {
    provider: { kind: "talk_thread", threadId },
    capabilities: {
      read: "live",
      send: "none",
      realtime: false,
      readReceipts: false,
      coalterInvoke: false,
    },
    getParticipants: () => data.participants,
    getViewer: () => null,
    getInitialMessages: () => data.messages,
  };
}
