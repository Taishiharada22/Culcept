/**
 * T11-G-C — Consume trust-tier helpers（**pure・未配線**）
 *
 * 設計: engine-consume-types.ts + consume-contract preflight
 *
 * 役割: T9 `runTravelPlanEngine` 出力を **trust tier 別の安全な consume 形**に変換する純 helper。
 *   - display 向けは **`output.shared` / `output.viewer` からのみ**構築（authoritative を混ぜない）。
 *   - authoritative は **server 文脈専用**として明示的に取り出す。
 *   - runtime 防御（fail-closed assertion）で型壁をすり抜けた誤用も検知。
 *
 * 厳守（純・決定論・境界）:
 *   - authoritative と shared を **1 つの display 向けオブジェクトに混ぜない**。
 *   - raw FitResult を露出しない（packet には元々載らない）。
 *   - authoritative⊥shared の **差分から private を逆推論しない**（本 helper は差分を取らない）。
 *   - 場所/経路/天候/予約 API・DB・runtime・UI・app import なし。import は travel engine/packet 型のみ。
 */

import type { PlanDecisionPacket } from "./packet-types";
import type { TravelPlanEngineOutput } from "./engine-types";
import type { AuthoritativePacketForServer, DisplayPacketForClient } from "./engine-consume-types";

// ─────────────────────────────────────────────────────────────────────────────
// assertions（runtime 防御・fail-closed）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * display 向け packet が **権限/private を一切持たない**ことを保証（持っていたら throw＝fail-closed）。
 *   - authoritative=false / executionAuthority=false。
 *   - confirmationQueue に private visibility の確認が無い。
 *   （viewer の rationale.forParticipant は当該 viewer 自身の note のみ＝display-safe なので検査しない。）
 */
export function assertDisplayPacketHasNoAuthority(p: PlanDecisionPacket): void {
  if (p.authoritative !== false) throw new Error("consume-tier: display packet must have authoritative=false");
  if (p.executionAuthority !== false) throw new Error("consume-tier: display packet must have executionAuthority=false");
  if (p.confirmationQueue.some((c) => c.visibility === "private")) {
    throw new Error("consume-tier: display packet must not expose private confirmation");
  }
}

/** client に渡そうとしている packet が **authoritative でない**ことを保証（authoritative なら throw）。 */
export function assertNoAuthoritativePacketForClient(p: PlanDecisionPacket): void {
  if (p.authoritative === true) throw new Error("consume-tier: authoritative packet must not be sent to client");
}

// ─────────────────────────────────────────────────────────────────────────────
// tier 変換 helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * client/display 向け packet を取得（**shared / viewer からのみ**）。
 *   - `viewerId` 指定かつ `output.viewer` あり → viewer 射影 / それ以外 → shared 射影。
 *   - どちらも engine の射影由来で `authoritative=false`・private 非搭載（runtime でも fail-closed 検査）。
 *   - **diagnostics（server-only）は含めない**（戻り値は packet のみ）。
 */
export function toDisplayPacket(output: TravelPlanEngineOutput, viewerId?: string): DisplayPacketForClient {
  const base: PlanDecisionPacket = viewerId !== undefined && output.viewer !== null ? output.viewer : output.shared;
  // 防御: 射影は構造的に非権限（engine 保証）。万一権限/private が立っていたら fail-closed。
  assertDisplayPacketHasNoAuthority(base);
  return base as unknown as DisplayPacketForClient; // brand 付与（display tier であることは上で検証済み）
}

/**
 * server 文脈専用の authoritative packet を取得（schedule/reserve/book の可否判定に使う正本）。
 *   - **client/display に渡してはならない**（private を持つ）。型で display 引数に渡せない。
 */
export function toServerAuthoritativePacket(output: TravelPlanEngineOutput): AuthoritativePacketForServer {
  return output.authoritative as unknown as AuthoritativePacketForServer;
}
