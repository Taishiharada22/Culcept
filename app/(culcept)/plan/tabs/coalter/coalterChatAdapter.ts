/**
 * coalterChatAdapter — /plan CoAlter タブのチャット adapter 境界（T1a skeleton）
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
 * 境界の設計原則（CEO 指示 T1a-4）:
 *   - participant の出自を adapter が抽象化する。**「/plan の CoAlter 相手が旧 /talk の
 *     coalter_pair_states 由来」を前提にしない**。source union が
 *     fixture / 旧 talk thread / 将来の Culcept relation / self（solo）を対等に許容する。
 *   - チャット UI（CoAlterChatPanel）は本 adapter の view 型のみを見る。fixture 型・
 *     /talk API payload 型への直接依存を持たない（T1b で adapter 実装だけ差し替える）。
 */

import type { CoAlterPlanSessionFixture } from "./coalterPlanSessionFixture";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Source 境界（participant の出自・T1a-4）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type CoAlterChatSource =
  /** fixture / plan session 由来（T1a の既定・現行動作） */
  | { readonly kind: "fixture"; readonly sessionId: string }
  /** 旧 /talk スレッド由来（T1b read-only 以降。**唯一の出自ではない**） */
  | { readonly kind: "talk_thread"; readonly threadId: string }
  /** 将来の Culcept 関係正本由来（pair/relation の新スキーマ・設計のみ） */
  | { readonly kind: "culcept_relation"; readonly relationId: string }
  /** solo 利用（1人 + CoAlter） */
  | { readonly kind: "self" };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// View 型（UI が見る唯一の形。fixture 型は構造的に互換だが import 依存はここで切る）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface CoAlterChatParticipant {
  readonly id: string;
  readonly name: string;
  readonly initial: string;
  readonly tone: "sky" | "rose";
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
 * 送信能力の段階（UI はこれで入力欄の挙動を分岐できる）:
 *   - "local_echo": ローカル append のみ（fixture・現行動作）
 *   - "none"      : 閲覧のみ（T1b read-only thread 想定）
 *   - "live"      : 実送信（T1c 以降・本 slice では実装しない）
 */
export type CoAlterChatSendMode = "local_echo" | "none" | "live";

export interface CoAlterChatCapabilities {
  /** Realtime 購読で更新されるか（T1a は常に false） */
  readonly live: boolean;
  readonly send: CoAlterChatSendMode;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Adapter 契約
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface CoAlterChatAdapter {
  readonly source: CoAlterChatSource;
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

export function createFixtureChatAdapter(
  session: CoAlterPlanSessionFixture,
): CoAlterChatAdapter {
  return {
    source: { kind: "fixture", sessionId: session.id },
    capabilities: { live: false, send: "local_echo" },
    getParticipants: () => session.participants,
    getViewer: () => session.participants[0] ?? null,
    getInitialMessages: () => session.messages,
  };
}

/**
 * Adapter 解決（UI からの唯一の入口）。
 *
 * T1a: `liveEnabled`（= NEXT_PUBLIC_PLAN_COALTER_CHAT_LIVE）が true でも **fixture を返す**。
 *   live adapter（talk_thread read-only）は T1b で本関数の分岐にのみ追加し、UI は不変のまま
 *   差し替わる。flag default OFF ＝ 既定・現行動作は fixture（視覚的に完全不変）。
 */
export function resolveCoAlterChatAdapter(opts: {
  readonly session: CoAlterPlanSessionFixture;
  readonly liveEnabled: boolean;
}): CoAlterChatAdapter {
  // T1b 接続点: if (opts.liveEnabled) return createTalkThreadReadonlyAdapter(...)（CEO GO 後）
  return createFixtureChatAdapter(opts.session);
}
