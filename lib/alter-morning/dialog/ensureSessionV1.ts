/**
 * ensureSessionV1 — DialogState v2 lazy migration (PR-8 rev 3 commit 16)
 *
 * 位置づけ:
 *   route.ts が session を hydrate / serialize する両端で呼ばれる「単一の
 *   migration 関数」。pure で flag-gated、flag OFF では完全中立（同一参照を返す）。
 *
 * 設計書:
 *   - docs/alter-morning-pr8-rev3-implementation-detail.md §6 (ensureSessionV1)
 *
 * CEO 方針（2026-04-22 commit 16 条件）:
 *   1. flag OFF 中は完全中立: session 不変、log/alloc/DB 書き込みなし
 *   2. migration は lazy: read 時点で判定、自動書き戻しはしない
 *   3. flag source of truth は 1 箇所: ALTER_MORNING_FLAGS.dialogStateV2
 *   4. adapter / phase / runtime behavior は触らない: 本関数は dialogState field のみを操作
 *   5. 単体テスト追加: flag OFF 不変 / flag ON init / 将来 version reset
 *
 * 振る舞い表:
 *   | flag    | session.dialogState | 戻り値 |
 *   |---------|---------------------|-----------------------------------|
 *   | false   | undefined           | session そのまま（同一参照）       |
 *   | false   | null                | session そのまま（同一参照）       |
 *   | false   | v1                  | session そのまま（同一参照）       |
 *   | false   | 将来 version        | session そのまま（同一参照）       |
 *   | true    | undefined / null    | { ...session, dialogState: v1 init } |
 *   | true    | v1                  | session そのまま（同一参照）       |
 *   | true    | 将来 version        | { ...session, dialogState: v1 init } (detail §6 beta-only reset) |
 *
 * 注意:
 *   - 本関数は session object を mutate しない（pure）。
 *   - flag OFF では allocation しない（return session）。メモリ圧を flag-OFF ユーザーに課さない。
 *   - flag ON でも、既存 v1 の場合は allocation しない（先述の通り同一参照）。
 *   - downstream（adapter / phase / reducer runtime）は commit 16 では本 field を読まない。
 *     route が write-back 時に単に round-trip するのみ（CEO wiring-only 条件）。
 */

import { ALTER_MORNING_FLAGS } from "./flags";
import {
  createInitialDialogState,
  isDialogStateV1,
  type DialogState,
} from "./types";
import type { MorningSession } from "../types";

/**
 * MorningSession に DialogState v2 を lazy-migrate する pure 関数。
 *
 * 入力 session object を mutate しない。flag OFF / v1 済みの場合は同一参照を返す
 * （shallow equality / Object.is 維持）。flag ON + 未初期化 / 将来 version の場合
 * のみ新 object を allocate する。
 *
 * 呼び出し規約:
 *   - route の session hydrate 直後に 1 回呼ぶ（read-side）。
 *   - downstream は session.dialogState を **読まない**（commit 16 範囲外）。
 *     その制約下で、本関数の戻り値は単に「write-back 時に serialize される field を
 *     準備するだけ」の役割を持つ。
 */
export function ensureSessionV1(session: MorningSession): MorningSession {
  // ── Step 1: flag OFF — 完全中立 ─────────────────────────────────────────────
  //   同一参照を返す。allocation / log / DB なし。呼び出しコストは function call のみ。
  if (!ALTER_MORNING_FLAGS.dialogStateV2) {
    return session;
  }

  // ── Step 2: flag ON — dialogState の版判定 ────────────────────────────────
  //   既に v1 なら何もしない（同一参照）。
  //   未初期化 or 将来 version なら v1 init に置換（detail §6 beta-only policy）。
  const current = session.dialogState;
  if (isDialogStateV1(current)) {
    return session;
  }

  // ── Step 3: lazy init（flag ON + 未初期化 or 将来 version）─────────────────
  //   新 session object を返す。input session は mutate しない。
  const initial: DialogState = createInitialDialogState();
  return { ...session, dialogState: initial };
}
