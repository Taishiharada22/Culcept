/**
 * CoAlter AOO Phase B B-5a — Frequency Cap (session-local SPEAK counter)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §2.3 / §5.1
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §5
 *
 * 役割 (B-5a 段階):
 *   session-local SPEAK 関連の counter を管理。
 *
 *   B-5a (shadow mode) では:
 *     - visible Mirror 出力なし
 *     - engine の `MIRROR_CANDIDATE` 判定回数を `candidateCount` で記録
 *     - engine 実行回数を `engineInvokedCount` で記録
 *     - これらは diagnostic snapshot の補助情報
 *     - cap (1/session) に達しても engine 実行は止めない (diagnostic 蓄積継続)
 *
 *   B-5b (visible mode) で `visibleSpeakCount` 管理 + cap check が visible 出力を gate する。
 *
 * 設計原則:
 *   - **initial cap = 1** (1 visible Mirror / session、B-5b で enforce)
 *   - **session-local**: module-level state、page reload でリセット
 *   - **cross-session persistence なし**
 *   - **counter 単純加算のみ** (decrement なし)
 *   - **3 種類の counter** を区別:
 *     - `engineInvokedCount`: engine 走った回数 (decideMirror 呼出 = 1)
 *     - `candidateCount`: MIRROR_CANDIDATE 判定回数
 *     - `visibleSpeakCount`: 実際 visible 出力された回数 (B-5b で increment、B-5a 常に 0)
 *
 * `timeSinceLastSpeakTurns` 計算:
 *   - 厳密 turn 計測には chat layer subscription 必要 (B-5b scope)
 *   - B-5a では engine 実行 1 回 = 1 turn と簡略化 (defensive: 大きめの値返す)
 *   - 「最後の visible SPEAK から何 turn 経過」を engine 実行カウンタで近似
 *
 * No-Effect Contract:
 *   - I/O / network / storage / DOM / event / timer / log 一切なし
 *   - module-level number state のみ
 *
 * Test isolation:
 *   - `__resetForTest()` で counter を 0 に初期化
 *   - vitest beforeEach で reset 必須
 */

// Phase C C-3: forced canary mode の cap override (Preview only).
// flag OFF (default) 時は本 import は no-op (関数戻り値 false / cap = INITIAL_VISIBLE_CAP)。
import {
  isForcedCanaryActive,
  getForcedCanaryVisibleCap,
} from "./forcedCanaryMode";

/** Visible Mirror の session 内発話上限 (initial canary、通常 mode)。 */
const INITIAL_VISIBLE_CAP = 1 as const;

/** engine 走った回数 (decideMirror 呼出回数)。 */
let _engineInvokedCount: number = 0;

/** MIRROR_CANDIDATE 判定回数 (visible 出力されなくても candidate なら count)。 */
let _candidateCount: number = 0;

/** Visible Mirror として実際出力された回数 (B-5b で increment、B-5a は常に 0)。 */
let _visibleSpeakCount: number = 0;

/** Engine 最後に実行された時の engineInvokedCount 値 (turn 経過計算用)。 */
let _lastVisibleSpeakInvokeNumber: number | null = null;

/**
 * engine 実行を 1 回 記録する。
 *
 * 呼出: `useMirrorEngine` が `decideMirror` を呼ぶ前に increment。
 */
export function incrementEngineInvoked(): void {
  _engineInvokedCount += 1;
}

/**
 * MIRROR_CANDIDATE 判定を 1 回 記録する。
 *
 * 呼出: `useMirrorEngine` が `decideMirror` の結果が MIRROR_CANDIDATE のとき increment。
 */
export function incrementCandidateCount(): void {
  _candidateCount += 1;
}

/**
 * Visible Mirror 出力を 1 回 記録する。
 *
 * 呼出: B-5b で実装される visible surface が render 完了時に increment。
 * B-5a では呼ばれない (visible 出力なし)。
 */
export function incrementVisibleSpeak(): void {
  _visibleSpeakCount += 1;
  _lastVisibleSpeakInvokeNumber = _engineInvokedCount;
}

/**
 * Phase C C-3 拡張: forced canary mode 時の effective visible cap を返す。
 *
 *   - forced flag OFF (default、env 未投入): `INITIAL_VISIBLE_CAP = 1` (Phase B 設計)
 *   - forced flag ON (CEO 手動 branch-scoped Preview only): `FORCED_CANARY_VISIBLE_CAP = 10`
 *
 * **緩和は cap のみ**。sleep / verification / 4-gate / PII firewall は strict 維持。
 *
 * 設計詳細: `lib/coalter/mirror/forcedCanaryMode.ts` および
 * `docs/coalter-aoo-phase-c-integration-design.md` §4.3。
 *
 * @returns 現在 effective な visible cap (1 or 10)
 */
export function getEffectiveVisibleCap(): number {
  if (isForcedCanaryActive()) {
    return getForcedCanaryVisibleCap();
  }
  return INITIAL_VISIBLE_CAP;
}

/**
 * Visible cap に達しているかを判定する (B-5b で enforce、C-3 で effective cap 化)。
 *
 * Phase C C-3 拡張: `getEffectiveVisibleCap()` 経由で forced canary mode の
 * cap override (1 → 10) を反映。
 *
 * @returns true: cap 到達 (visible 出力禁止) / false: まだ余裕あり
 */
export function isVisibleCapReached(): boolean {
  return _visibleSpeakCount >= getEffectiveVisibleCap();
}

/**
 * 各種 counter の現在値を取得 (test / observability 用)。
 */
export function getCounters(): {
  readonly engineInvokedCount: number;
  readonly candidateCount: number;
  readonly visibleSpeakCount: number;
  readonly lastVisibleSpeakInvokeNumber: number | null;
} {
  return {
    engineInvokedCount: _engineInvokedCount,
    candidateCount: _candidateCount,
    visibleSpeakCount: _visibleSpeakCount,
    lastVisibleSpeakInvokeNumber: _lastVisibleSpeakInvokeNumber,
  };
}

/**
 * 最後の visible SPEAK から何 turn 経過したかを返す (近似値、B-5a 簡略実装)。
 *
 * - Visible SPEAK がまだなら **大きな値 (Number.MAX_SAFE_INTEGER)** を返す
 *   (Worth Gate の WORTH_TIME_SINCE_MIN_TURNS = 5 を必ず満たす意図、defensive)
 * - 簡略実装: engine 実行カウンタ差分 = 経過 turn 数
 * - 厳密な turn 計測は B-5b 以降 (chat message subscription 経由)
 *
 * @returns 経過 turn 数の近似値 (非負整数)
 */
export function getTimeSinceLastSpeakTurns(): number {
  if (_lastVisibleSpeakInvokeNumber === null) {
    // まだ visible SPEAK したことがない → 無限大相当 (Worth Gate 通過させる)
    return Number.MAX_SAFE_INTEGER;
  }
  const diff = _engineInvokedCount - _lastVisibleSpeakInvokeNumber;
  return Math.max(0, diff);
}

/**
 * **Test only**: 内部 state を初期化。
 *
 * @internal
 */
export function __resetForTest(): void {
  _engineInvokedCount = 0;
  _candidateCount = 0;
  _visibleSpeakCount = 0;
  _lastVisibleSpeakInvokeNumber = null;
}

/**
 * **Test only**: cap 上限値を取得。
 *
 * @internal
 */
export function __getInitialVisibleCapForTest(): number {
  return INITIAL_VISIBLE_CAP;
}
