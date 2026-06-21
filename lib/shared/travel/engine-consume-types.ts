/**
 * T11-G-B — Consume trust-tier 契約型（**pure types only**・未配線）
 *
 * 設計: docs/t11-consume-contract-preflight.md（2 trust tier の型壁化）
 *
 * 役割: T9 `runTravelPlanEngine` 出力の **consume trust tier を TypeScript で非バイパス化**する。
 *   将来 UI/CoAlter/Plan Intelligence の配線が **authoritative packet を client/display に渡す事故**を
 *   **コンパイル時に**防ぐ。実装・配線・runtime は含まない（型壁のみ）。
 *
 * ★ 2 tier（preflight §2）:
 *   - **T-S（server / authoritative）**: `AuthoritativePacketForServer`。private を持ち実行権限の正本。
 *     `toServerAuthoritativePacket` 経由でのみ得られる。**client に出してはならない**。
 *   - **T-D（client / display）**: `DisplayPacketForClient`。`authoritative=false` / `executionAuthority=false`
 *     を **型レベルで強制**・private 非搭載。`toDisplayPacket` 経由でのみ得られる。
 *
 * ★ 非バイパス: brand は **export しない unique symbol**。生の `PlanDecisionPacket`（= `output.authoritative`）は
 *   brand を持たず literal false も満たさないため、`DisplayPacketForClient` に**代入できない**。
 *
 * 純粋性: 型のみ（`declare const` は runtime emit なし）。
 */

import type { PlanDecisionPacket } from "./packet-types";

// brand: 非 export の unique symbol（外部で forge 不能）
declare const CONSUME_TIER: unique symbol;

/**
 * T-S: server-only authoritative packet。
 *   - private（confirmationQueue private / rationale.forParticipant / fitSummary full grade）を持つ。
 *   - 実行権限の正本（executionAuthority はここでのみ意味を持つ）。
 *   - **client/display consumer の引数型にしてはならない**。
 */
export type AuthoritativePacketForServer = PlanDecisionPacket & {
  readonly [CONSUME_TIER]: "server";
};

/**
 * T-D: client/display 専用 packet。
 *   - `authoritative` / `executionAuthority` を **literal `false` に narrowing**（型レベルで権限を排除）。
 *   - private 非搭載（engine の shared/viewer 射影由来）。
 *   - 生の `PlanDecisionPacket` は brand を持たず authoritative も `boolean` のため **代入不可**。
 */
export type DisplayPacketForClient = Omit<PlanDecisionPacket, "authoritative" | "executionAuthority"> & {
  readonly authoritative: false;
  readonly executionAuthority: false;
  readonly [CONSUME_TIER]: "display";
};

/** 別名（shared / viewer はどちらも display tier）。可読性のための alias。 */
export type SharedDisplayPacket = DisplayPacketForClient;
export type ViewerDisplayPacket = DisplayPacketForClient;
