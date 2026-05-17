/**
 * CoAlter AOO Phase B B-5a — Sleep Store (session-local in-memory)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §8.3
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §4
 *
 * 役割 (B-5a 段階):
 *   `userOverrideSleep` 状態を session-local in-memory に保持する store。
 *
 *   B-5a では UI なし (toggle / detector は B-5b で実装)。
 *   B-5a の `engineAdapter` が `sleepStore.get()` を読み、`MirrorDecisionInput.userOverrideSleep`
 *   として渡す。
 *
 * 設計原則:
 *   - **default sleep = false** (sleep していない、Mirror 動作可能)
 *   - **session-local**: module-level state、page reload で false にリセット
 *   - **cross-session persistence なし**: localStorage / cookie / IndexedDB 使わない
 *   - **raw text なし**: text 入力を受け取らない、boolean のみ
 *   - **B-5b で linguistic stop detector / UI toggle が `setSleep(true)` を呼ぶ前提**
 *
 * No-Effect Contract:
 *   - I/O / network / storage / DOM / event / timer / log 一切なし
 *   - module-level boolean state のみ
 *   - PII 受理なし (raw text / message id / user id 等、型レベルで boolean のみ受け付け)
 *
 * Test isolation:
 *   - `__resetForTest()` で false に初期化
 *   - vitest beforeEach で reset 必須
 */

/**
 * Sleep state (session-local)。default false。
 *
 * - true: user が sleep を明示 (UI toggle or 言語的停止検出、B-5b で実装)
 * - false: default (Mirror 動作可能)
 */
let _sleep: boolean = false;

/**
 * 現在の sleep state を取得する。
 *
 * @returns true (sleep ON) | false (sleep OFF、default)
 */
export function getSleep(): boolean {
  return _sleep;
}

/**
 * Sleep state を設定する。
 *
 * 用途 (B-5b で実装される):
 *   - UI toggle: `setSleep(true)` で sleep ON
 *   - linguistic stop detector: detection 結果に応じて `setSleep(true)`
 *   - 起動時 reset / 設定画面の OFF トグル: `setSleep(false)`
 *
 * @param value - 新しい sleep state (boolean のみ受理、null/undefined/型外は型レベルで拒否)
 */
export function setSleep(value: boolean): void {
  _sleep = value;
}

/**
 * Sleep state を初期化 (false に戻す、明示的 reset)。
 *
 * `setSleep(false)` と等価 だが、意図 ("初期化") を明示するための alias。
 */
export function clearSleep(): void {
  _sleep = false;
}

/**
 * **Test only**: 内部 state を初期化。
 *
 * vitest の beforeEach で呼ぶ。
 *
 * @internal
 */
export function __resetForTest(): void {
  _sleep = false;
}
