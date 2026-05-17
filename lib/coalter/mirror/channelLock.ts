/**
 * CoAlter AOO Phase B B-5a — Channel Lock (Mirror-side mutex, minimum version)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §10.1
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §10.1
 *
 * 役割 (B-5a 段階):
 *   Mirror 側の **mutex**。同 turn / 同 React render cycle 内で `decideMirror` が
 *   重複実行されないことを保証する。
 *
 * **最小版**: B-5a では Mirror-side mutex のみ実装。presence layer への接続なし。
 *   → presence との発話衝突は B-5c canary smoke で CEO が実機観察 → 必要なら次 phase で
 *     DOM observation based lock (DOM 上の last-assistant-message timestamp 観察) 追加検討。
 *
 * 設計原則:
 *   - **presence layer 触らない / 読まない**: CEO B-5a 仕様の絶対境界
 *   - **module-level state** (session-local): tab 内のすべての MirrorHost mount で共有
 *   - **tryAcquire → release pattern**: acquire 成功時のみ work 実行、必ず release
 *   - **timeout 機構**: lock が release されずに残ったら次の tryAcquire で強制 release
 *
 * No-Effect Contract:
 *   - I/O / network / storage / DOM / event / timer / log 一切なし
 *   - setTimeout 不使用 (timeout は次 acquire 時の elapsed time check)
 *   - addEventListener 不使用
 *
 * Test isolation:
 *   - `__resetForTest()` で lock state クリア
 *   - vitest beforeEach で reset 必須
 */

/**
 * Lock の保持時間 (ms)。これを超えて release されていない lock は強制 release 対象。
 *
 * 通常の Mirror engine 実行は数 ms で終わるため、5000ms (5 秒) は十分安全側。
 */
const LOCK_TIMEOUT_MS = 5000 as const;

/** Lock の現在保持者 (null = 解放されている)。 */
let _holder: string | null = null;

/** Lock の acquire 時刻 (Date.now())。null = 解放されている。 */
let _acquiredAt: number | null = null;

/**
 * Lock を取得する試み。
 *
 * - lock が解放されている (`_holder === null`) → 取得成功、`true` を返す
 * - すでに保持されているが `LOCK_TIMEOUT_MS` 超過 → 強制 release 後に取得、`true` を返す
 * - すでに保持されており timeout 未経過 → 取得失敗、`false` を返す
 *
 * `holder` 引数は debugging 用識別子 (e.g., "mirror-engine"、"test-1")。
 * 同じ `holder` でも複数 tryAcquire で取れるわけではない (mutex は holder 不問)。
 *
 * @param holder - 取得者の識別子 (debugging 用、機能上は使わない)
 * @returns 取得成功 → true / 失敗 → false
 */
export function tryAcquireMirrorLock(holder: string): boolean {
  const now = Date.now();

  if (_holder === null) {
    // 解放されている → 取得成功
    _holder = holder;
    _acquiredAt = now;
    return true;
  }

  // すでに保持されている → timeout チェック
  if (_acquiredAt !== null && now - _acquiredAt > LOCK_TIMEOUT_MS) {
    // 強制 release (timeout 超過)、新規取得
    _holder = holder;
    _acquiredAt = now;
    return true;
  }

  // 保持中、timeout 未経過 → 取得失敗
  return false;
}

/**
 * Lock を解放する。
 *
 * - `holder` が現在保持者と一致 → 解放成功
 * - 一致しない / 解放済 → no-op (defensive、エラーにしない)
 *
 * @param holder - 解放者の識別子 (tryAcquireMirrorLock と同じ値であるべき)
 */
export function releaseMirrorLock(holder: string): void {
  if (_holder === holder) {
    _holder = null;
    _acquiredAt = null;
  }
  // 不一致時は no-op (test や同時 acquire 失敗時のクリーンアップを安全に)
}

/**
 * Lock の現在保持者を取得 (test / observability 用)。
 */
export function getMirrorLockHolder(): string | null {
  return _holder;
}

/**
 * Lock が保持されているかを返す (timeout 考慮)。
 */
export function isMirrorLockHeld(): boolean {
  if (_holder === null) return false;
  if (_acquiredAt === null) return false;
  const now = Date.now();
  return now - _acquiredAt <= LOCK_TIMEOUT_MS;
}

/**
 * **Test only**: 内部 state を初期化。
 *
 * @internal
 */
export function __resetForTest(): void {
  _holder = null;
  _acquiredAt = null;
}

/**
 * **Test only**: lock の acquire 時刻を override (timeout 経過 test 用)。
 *
 * @internal
 */
export function __setAcquiredAtForTest(timestamp: number | null): void {
  _acquiredAt = timestamp;
}

/**
 * **Test only**: lock timeout 時間 ms を取得。
 *
 * @internal
 */
export function __getLockTimeoutForTest(): number {
  return LOCK_TIMEOUT_MS;
}
