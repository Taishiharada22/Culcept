/**
 * Phase 3-M-3c-pure — Per-transition Feasibility Disclosure Adapter (= N-fold lift of M-3b-pure)
 *
 * 役割:
 *   M-3b-pure (= 単一 transition の disclosure state machine) を **N 個 transition**
 *   に lift する pure helper。 caller (= 将来 M-3c-ui) は
 *   `ReadonlySet<number>` 1 つを hold するだけで全 transition の disclosure 状態を
 *   一括管理できる。
 *
 * 思想 (= M-3b-pure 規範を N-fold lift):
 *   - **default = 全 hidden** (= resetAllDisclosures() で取得、 永続定数の外部公開なし)
 *   - **expanded transition の index 集合のみ保持**
 *   - **hidden は補集合** (= 暗黙、 set に含まれない index は hidden)
 *   - **passive_idle で state 不変** (= 圧防止、 M-3b 継承)
 *   - **per-transition で独立** (= 異 index 操作で他 index 不影響)
 *   - **tab/day 切替で reset** (= 「観測の幕間」、 革新 5 永続規約化)
 *   - **空 Set 永続定数を外部公開しない** (= 革新 M-1、 mutation 攻撃面構造的除去、
 *     GPT 補正反映 M-3c-pure-harden 2026-05-23)
 *
 * Aneurasync 中心問いとの接続:
 *   - 「自分って、 そういう人間だったのか」 体験 = user 自身が個別 transition を能動観測
 *   - AI が「不足を指摘する」 pattern を構造的に排除 (= M-3b 継承)
 *   - 各 transition で独立 expand/collapse = user の観測フォーカスは「集合」 という新概念
 *
 * 革新的アイデア (= 本 file 固有):
 *   1. **N-fold lift = state machine 新設計 0**
 *      M-3b-pure を直接 import + 各 index に適用するだけ
 *   2. **expandedIndices = Set<number> 最小 representation**
 *      hidden は補集合 = 暗黙 = 「無」 の表現
 *   3. **EMPTY_EXPANDED_INDICES 永続定数**
 *      初期 stable reference (= React useState 初期値の re-render 削減 hook)
 *   4. **bulk operation 意図的不提供**
 *      expandAll / collapseAll を提供しない = user の能動性を奪わない
 *      但し resetAllDisclosures だけは「観測の幕間」 として permit
 *   5. **「観測フォーカス分布」 という新概念**
 *      expandedIndices = user が「今この瞬間に観測している transition の集合」
 *      将来 M-4+ で 「user の観測パターン」 を統計化できる base data
 *
 * M-3c-pure scope (= 2026-05-23 CEO + GPT 連続 GO 範囲):
 *   - LLM 不使用 / API 不使用 / no DB / no UI / no localStorage / no telemetry sink
 *   - K phase / L / M-1 / M-2 / M-3a / M-3b 既存 file 改変 0
 *   - UI 接続 (= M-3c-ui) は別 audit + CEO smoke 必須
 *
 * 危険境界遵守 (= 絶対に触れない):
 *   - UI 接続 / MapTab / CalendarTab / FlowTab / DayGraphTimeline
 *   - 「不足 N 分」 / 「余白 N 分」 画面表示
 *   - Arrival Risk Memory / warning / recommendation / optimization 文言
 *   - amber / orange / red 警告色 / icon / warning badge
 *   - localStorage / DB / env / package / dependency 変更
 *   - runtime telemetry sink
 *   - Counterfactual / Routes API / mode 推定
 *   - fetch / endpoint / gh / push / reset / restore / stash
 *
 * 参照:
 *   - docs/alter-plan-phase3-m-3c-readiness-audit.md
 *   - lib/plan/feasibility/feasibilityDisclosureState.ts (= M-3b-pure、 単一 state machine)
 *   - lib/plan/feasibility/feasibilityDisplayPipeline.ts (= M-3a、 pipeline)
 */

import {
  DEFAULT_DISCLOSURE_STATE,
  nextDisclosureState,
  type FeasibilityDisclosureAction,
  type FeasibilityDisclosureState,
} from "./feasibilityDisclosureState";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. ExpandedTransitionIndices — N-fold lift の中心 representation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 全 transition の disclosure state を表す **immutable Set<number>**。
 *
 * 設計判断:
 *   - **expanded transition の index 集合のみ保持**
 *   - **hidden は補集合** (= 暗黙)
 *   - **`previewing` state は本 phase では表現しない** (= M-3b-pure では forward compat hook、 M-3c-pure では未使用)
 *
 * 制約 (= M-3c-pure で機械保証):
 *   - 全 element は **非負整数** (= transitionIndex の規約)
 *   - 文字列 / null / undefined は含まれない (= TypeScript で型保証)
 *   - PII (= anchor_, location_, user_, title) は **構造的に含まれない**
 *     (= Set<number> 型 narrowing)
 *
 * 命名 alias (= 可読性):
 *   ExpandedTransitionIndices = ReadonlySet<number>
 *
 * 注: TypeScript の type alias ではなく `interface` だと extends しか効かないため
 *     ここでは type alias を採用 (= ReadonlySet<number> の構造的サブタイプを保持)。
 */
export type ExpandedTransitionIndices = ReadonlySet<number>;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. createEmptyExpandedIndices — 「全 hidden」 の唯一の正本 (= function-only API)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * **空 Set<number> 生成 helper (= internal、 export しない)**。
 *
 * GPT 補正反映 (= 2026-05-23、 M-3c-pure-harden):
 *   - 「永続定数 Set を外部公開する」 設計は **runtime mutation 危険**
 *   - TypeScript の `ReadonlySet<number>` は type-time だけで、
 *     `(set as Set<number>).add(0)` で runtime 破壊可能
 *   - もし永続定数が mutation されると、 「全 default hidden」 不変条件が崩壊
 *
 * 修正方針 (= 自律推論):
 *   - **stable reference を外部公開しない** (= EMPTY_EXPANDED_INDICES export 削除)
 *   - caller は `resetAllDisclosures()` 経由で **毎回新規 Set** を取得
 *   - reference equality (= 同 instance 共有) は意図的に放棄
 *   - その代わり mutation 攻撃面を **構造的に除去**
 *
 * 性能影響:
 *   - reset / 初期化時のみ alloc (= hot path ではない)
 *   - applyDisclosureAction の idempotency (= 入力 set 同参照保持) は維持
 *   - React useState 初期値は 1 度しか呼ばれないため、 stable reference 不要
 *
 * 注: 本 helper は **internal**、 export しない。
 *     外部公開 API は `resetAllDisclosures()` のみ。
 */
function createEmptyExpandedIndices(): ExpandedTransitionIndices {
  return new Set<number>();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. getDisclosureStateForIndex — Set + index → 単一 state
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 該当 index の disclosure state を取得する pure 関数。
 *
 * 規約:
 *   - set に index が含まれる → `"expanded"`
 *   - set に index が含まれない → `"hidden"` (= 補集合、 DEFAULT_DISCLOSURE_STATE)
 *   - `"previewing"` state は本 phase では出現しない (= M-3b forward compat hook 未使用)
 *
 * 純度保証:
 *   - input mutation なし
 *   - 副作用なし
 *   - deterministic (= 同 input → 同 output)
 *
 * @param expandedIndices 現在の expanded set
 * @param index 取得対象 transitionIndex (= 非負整数想定)
 * @returns "expanded" or "hidden"
 */
export function getDisclosureStateForIndex(
  expandedIndices: ExpandedTransitionIndices,
  index: number,
): FeasibilityDisclosureState {
  if (expandedIndices.has(index)) {
    return "expanded";
  }
  return DEFAULT_DISCLOSURE_STATE; // = "hidden"
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. applyDisclosureAction — Set + index + action → 新 Set
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 単一 transitionIndex に対し disclosure action を適用し、 新しい
 * `ExpandedTransitionIndices` を返す pure 関数。
 *
 * 規約 (= M-3b-pure の N-fold lift):
 *   - 該当 index の現 state を get → M-3b-pure の `nextDisclosureState` で次 state を計算
 *   - 次 state が "expanded" → set に add (= 既に含まれていれば同参照を返す = 革新 D)
 *   - 次 state が "hidden" → set から delete (= 含まれていなければ同参照を返す)
 *   - 次 state が "previewing" → 本 phase では発生しない (= M-3b で action から "previewing" に
 *     遷移する path がないため、 構造的に到達不能)
 *
 * 純度保証:
 *   - **input set を mutate しない** (= 新 Set を返すか、 同参照を返す)
 *   - 副作用なし
 *   - deterministic / idempotent (= 同 action 連続適用で結果安定)
 *
 * Idempotency (= 革新 G):
 *   - request_expand を expanded index に再適用 → 同参照 (= 無駄な Set 生成 0)
 *   - request_collapse を hidden index に再適用 → 同参照
 *   - passive_idle は常に同参照 (= 不変)
 *
 * Reference equality 保持の利点:
 *   - React.memo 等の shallow compare で re-render skip 可
 *   - caller (= useState setter) で「変更なし」 検知が O(1)
 *
 * @param expandedIndices 現在の expanded set
 * @param index 対象 transitionIndex (= 非負整数想定)
 * @param action user action
 * @returns 新しい expanded set (= 変更なしなら同参照)
 */
export function applyDisclosureAction(
  expandedIndices: ExpandedTransitionIndices,
  index: number,
  action: FeasibilityDisclosureAction,
): ExpandedTransitionIndices {
  const current = getDisclosureStateForIndex(expandedIndices, index);
  const next = nextDisclosureState(current, action);

  // next === "expanded" → set に追加
  if (next === "expanded") {
    if (expandedIndices.has(index)) {
      // 既に expanded → 同参照を返す (= idempotency、 革新 G)
      return expandedIndices;
    }
    const out = new Set<number>(expandedIndices);
    out.add(index);
    return out;
  }

  // next === "hidden" → set から削除
  if (next === "hidden") {
    if (!expandedIndices.has(index)) {
      // 既に hidden → 同参照を返す (= idempotency)
      return expandedIndices;
    }
    const out = new Set<number>(expandedIndices);
    out.delete(index);
    return out;
  }

  // next === "previewing" → 本 phase では到達不能、 防御として同参照
  //   (= M-3b で action 経由で previewing には遷移しないため、 ここに来るのは
  //      構造的に未来の拡張時のみ。 現時点では fail-safe で不変)
  return expandedIndices;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. resetAllDisclosures — 「観測の幕間」 (= 革新 5、 永続規約)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 全 transition の disclosure を hidden にリセットする pure 関数。
 *
 * 思想 (= 革新 5):
 *   - tab 切替 / 別 day 移動で呼び出す想定
 *   - 「観測の幕間」 = 「観測の場を変える」 = 全 hidden に戻る
 *   - localStorage 禁止と整合 (= persist しない = reset で新鮮な観測再起動)
 *   - 「観測したことを忘れる」 体験 (= revolutionary 9、 forgetting curve 設計)
 *
 * 実装 (= 2026-05-23 M-3c-pure-harden 修正後):
 *   - **毎回新規 empty Set を返す** (= reference equality 意図的放棄)
 *   - GPT 補正反映: 永続定数の外部公開は runtime mutation 危険のため不採用
 *   - 副作用 0、 deterministic (= 「空 Set を返す」 は決定的)
 *
 * caller の使い方:
 *   ```
 *   // tab 切替 / 別 day 移動時
 *   setExpandedIndices(resetAllDisclosures());
 *
 *   // 初期 state (= React lazy initial state pattern 推奨)
 *   const [expanded, setExpanded] = useState<ExpandedTransitionIndices>(
 *     resetAllDisclosures,
 *   );
 *   ```
 *
 * 設計判断 (= reference equality 放棄の正当化):
 *   - React useState 初期値は 1 度しか呼ばれない → stable reference 不要
 *   - reset は tab/day 切替時のみ呼ばれる (= 高頻度ではない)
 *   - applyDisclosureAction の idempotency (= 入力同参照保持) は維持済み
 *   - mutation 攻撃面を構造的に除去 (= 永続定数を外部公開しない)
 *
 * @returns 新規空 Set (= 毎回別 instance、 mutation しても次回 reset に影響しない)
 */
export function resetAllDisclosures(): ExpandedTransitionIndices {
  return createEmptyExpandedIndices();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. getExpandedCount — 「観測フォーカス件数」 (= 革新 I、 helper のみ)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 現在 expanded な transition 数を返す helper。
 *
 * 用途 (= 自律推論):
 *   - **画面表示用途は M-3c-pure scope 外** (= 「不足 N 分」 と同様、 count UI 化は禁止)
 *   - 但し M-4+ で 「観測パターン統計」 を起こす際の base helper として提供
 *   - test での invariants 検証用
 *
 * 純度保証:
 *   - set.size を返すだけ
 *   - 副作用 0
 *
 * @param expandedIndices 現在の expanded set
 * @returns expanded 件数 (= 非負整数)
 */
export function getExpandedCount(
  expandedIndices: ExpandedTransitionIndices,
): number {
  return expandedIndices.size;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7. Contract — N-fold disclosure invariants の literal record
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Per-transition disclosure adapter の不変条件 (= 11 invariants、 M-3c-pure-harden で +1)。
 *
 * 1. emptySetIsAllHidden:              空 Set ⇔ 全 transition が hidden
 * 2. hiddenIsComplement:               set に含まれない index は "hidden"
 * 3. expandedIsMembership:             set に含まれる index は "expanded"
 * 4. requestExpandAddsIndex:           request_expand → set に index が含まれる
 * 5. requestCollapseRemovesIndex:      request_collapse → set から index が外れる
 * 6. passiveIdleKeepsSet:              passive_idle → set 同参照 (= 不変)
 * 7. idempotency:                      同 action 連続適用で同参照 (= O(1) 再 set 削減)
 * 8. perTransitionIndependence:        index_a の操作で index_b の state 不影響
 * 9. inputSetNotMutated:               input set の mutation 0
 * 10. resetReturnsFreshEmpty:          resetAllDisclosures() → **毎回新規** empty set
 *                                      (= 永続定数の外部 mutation 攻撃面を構造的に除去、
 *                                         GPT 補正反映 M-3c-pure-harden)
 * 11. noExternallyMutableEmptyConstant: 「空 Set 永続定数」 を外部公開しない
 *                                       (= EMPTY_EXPANDED_INDICES export なし)
 */
export interface FeasibilityDisclosureAdapterContract {
  readonly emptySetIsAllHidden: true;
  readonly hiddenIsComplement: true;
  readonly expandedIsMembership: true;
  readonly requestExpandAddsIndex: true;
  readonly requestCollapseRemovesIndex: true;
  readonly passiveIdleKeepsSet: true;
  readonly idempotency: true;
  readonly perTransitionIndependence: true;
  readonly inputSetNotMutated: true;
  readonly resetReturnsFreshEmpty: true;
  readonly noExternallyMutableEmptyConstant: true;
}

export const FEASIBILITY_DISCLOSURE_ADAPTER_CONTRACT: FeasibilityDisclosureAdapterContract = {
  emptySetIsAllHidden: true,
  hiddenIsComplement: true,
  expandedIsMembership: true,
  requestExpandAddsIndex: true,
  requestCollapseRemovesIndex: true,
  passiveIdleKeepsSet: true,
  idempotency: true,
  perTransitionIndependence: true,
  inputSetNotMutated: true,
  resetReturnsFreshEmpty: true,
  noExternallyMutableEmptyConstant: true,
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8. Error class
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export class FeasibilityDisclosureAdapterError extends Error {
  readonly violation: keyof FeasibilityDisclosureAdapterContract | "invalidIndex" | "invalidSetElement";
  constructor(
    violation: FeasibilityDisclosureAdapterError["violation"],
    detail?: string,
  ) {
    const suffix = detail ? ` (${detail})` : "";
    super(`[M-3c-pure] Disclosure adapter violates ${violation}${suffix}`);
    this.name = "FeasibilityDisclosureAdapterError";
    this.violation = violation;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §9. Assertions — 入力値防御 + N-fold invariants 機械検証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 単一 index が valid (= 非負整数) を assert する。
 *
 * 防御:
 *   - 非 number → throw
 *   - NaN → throw
 *   - 負数 → throw
 *   - 非整数 (= 小数点あり) → throw
 *   - Infinity → throw
 *
 * 違反時は `FeasibilityDisclosureAdapterError` を throw。
 */
export function assertValidTransitionIndex(value: unknown): void {
  if (typeof value !== "number") {
    throw new FeasibilityDisclosureAdapterError(
      "invalidIndex",
      `value=${String(value)} is not a number`,
    );
  }
  if (!Number.isFinite(value)) {
    throw new FeasibilityDisclosureAdapterError(
      "invalidIndex",
      `value=${value} is not finite`,
    );
  }
  if (!Number.isInteger(value)) {
    throw new FeasibilityDisclosureAdapterError(
      "invalidIndex",
      `value=${value} is not an integer`,
    );
  }
  if (value < 0) {
    throw new FeasibilityDisclosureAdapterError(
      "invalidIndex",
      `value=${value} is negative`,
    );
  }
}

/**
 * `ExpandedTransitionIndices` 自体の構造的健全性を assert する。
 *
 * 検証項目:
 *   - 全 element が非負整数 (= assertValidTransitionIndex を 各 element で実行)
 *   - 文字列 / null / undefined / object 不在 (= TypeScript narrowing 補強)
 *
 * 用途:
 *   - caller (= 将来 M-3c-ui) が誤って string を含む set を渡した場合の防御
 *   - test での invariants 検証
 */
export function assertValidExpandedIndices(value: unknown): void {
  if (!(value instanceof Set)) {
    throw new FeasibilityDisclosureAdapterError(
      "invalidSetElement",
      `value is not a Set instance`,
    );
  }
  for (const element of value.values()) {
    if (typeof element !== "number") {
      throw new FeasibilityDisclosureAdapterError(
        "invalidSetElement",
        `set contains non-number element: ${String(element)}`,
      );
    }
    try {
      assertValidTransitionIndex(element);
    } catch (e) {
      if (e instanceof FeasibilityDisclosureAdapterError) {
        throw new FeasibilityDisclosureAdapterError(
          "invalidSetElement",
          `set contains invalid index: ${e.message}`,
        );
      }
      throw e;
    }
  }
}

/**
 * 11 invariants 全件を機械検証する pure function (= M-3c-pure-harden で +1)。
 *
 * 検証範囲:
 *   1. emptySetIsAllHidden: 新規 empty Set の全 lookup が "hidden"
 *      (= sample indices で確認、 0 / 1 / 100 / Number.MAX_SAFE_INTEGER)
 *   2. hiddenIsComplement: set 外 index は "hidden"
 *   3. expandedIsMembership: set 内 index は "expanded"
 *   4. requestExpandAddsIndex
 *   5. requestCollapseRemovesIndex
 *   6. passiveIdleKeepsSet (= 同参照)
 *   7. idempotency (= 同 action 連続で同参照)
 *   8. perTransitionIndependence (= 異 index 操作で他 index 不影響)
 *   9. inputSetNotMutated (= original set の size 不変)
 *   10. resetReturnsFreshEmpty (= resetAllDisclosures() で毎回新規 empty set、
 *                                 reference equality は意図的に放棄、
 *                                 GPT 補正反映 M-3c-pure-harden)
 *   11. noExternallyMutableEmptyConstant (= 空 Set 永続定数を外部公開しない、
 *                                          GPT 補正反映、 mutation 攻撃面構造的除去)
 *
 * 用途:
 *   - dev / test 時に呼び出して contract が壊れていないことを確認
 *   - runtime に毎回呼ぶ必要はない (= pure / deterministic、 構造的に invariants は不変)
 *
 * 違反時は `FeasibilityDisclosureAdapterError` を throw。
 */
export function assertNFoldDisclosureCompliance(): void {
  const sampleIndices: ReadonlyArray<number> = [0, 1, 2, 5, 10, 100, Number.MAX_SAFE_INTEGER];

  // 1. emptySetIsAllHidden (= 新規 empty set で確認)
  const emptySet1 = createEmptyExpandedIndices();
  if (emptySet1.size !== 0) {
    throw new FeasibilityDisclosureAdapterError(
      "emptySetIsAllHidden",
      `createEmptyExpandedIndices().size=${emptySet1.size}`,
    );
  }
  for (const idx of sampleIndices) {
    if (getDisclosureStateForIndex(emptySet1, idx) !== "hidden") {
      throw new FeasibilityDisclosureAdapterError(
        "emptySetIsAllHidden",
        `empty set lookup at ${idx} did not return "hidden"`,
      );
    }
  }

  // 2. hiddenIsComplement (= 部分 set で確認)
  const partialSet: ExpandedTransitionIndices = new Set([1, 3, 5]);
  if (getDisclosureStateForIndex(partialSet, 2) !== "hidden") {
    throw new FeasibilityDisclosureAdapterError("hiddenIsComplement", "index 2 not in set, expected hidden");
  }
  if (getDisclosureStateForIndex(partialSet, 4) !== "hidden") {
    throw new FeasibilityDisclosureAdapterError("hiddenIsComplement", "index 4 not in set, expected hidden");
  }

  // 3. expandedIsMembership
  if (getDisclosureStateForIndex(partialSet, 1) !== "expanded") {
    throw new FeasibilityDisclosureAdapterError("expandedIsMembership", "index 1 in set, expected expanded");
  }
  if (getDisclosureStateForIndex(partialSet, 5) !== "expanded") {
    throw new FeasibilityDisclosureAdapterError("expandedIsMembership", "index 5 in set, expected expanded");
  }

  // 4. requestExpandAddsIndex
  {
    const empty = createEmptyExpandedIndices();
    const result = applyDisclosureAction(empty, 2, "request_expand");
    if (!result.has(2)) {
      throw new FeasibilityDisclosureAdapterError("requestExpandAddsIndex", "index 2 not added");
    }
  }

  // 5. requestCollapseRemovesIndex
  {
    const initial: ExpandedTransitionIndices = new Set([1, 2, 3]);
    const result = applyDisclosureAction(initial, 2, "request_collapse");
    if (result.has(2)) {
      throw new FeasibilityDisclosureAdapterError("requestCollapseRemovesIndex", "index 2 still in set");
    }
    if (!result.has(1) || !result.has(3)) {
      throw new FeasibilityDisclosureAdapterError(
        "perTransitionIndependence",
        "other indices affected by collapse",
      );
    }
  }

  // 6. passiveIdleKeepsSet (= 同参照)
  {
    const initial: ExpandedTransitionIndices = new Set([7]);
    const result = applyDisclosureAction(initial, 7, "passive_idle");
    if (result !== initial) {
      throw new FeasibilityDisclosureAdapterError(
        "passiveIdleKeepsSet",
        "passive_idle returned different reference",
      );
    }
  }

  // 7. idempotency (= 同 action 連続で同参照、 但し 「empty + collapse」 は新規 vs 同参照 検証外
  //    → 「expanded + expand」 の idempotency のみ検証で十分)
  {
    const initial: ExpandedTransitionIndices = new Set([4]);
    const r1 = applyDisclosureAction(initial, 4, "request_expand"); // 既に expanded
    if (r1 !== initial) {
      throw new FeasibilityDisclosureAdapterError(
        "idempotency",
        "request_expand on expanded did not return same reference",
      );
    }
    // 「hidden + collapse」 idempotency は同参照保持を検証
    const startEmpty = createEmptyExpandedIndices();
    const r2 = applyDisclosureAction(startEmpty, 4, "request_collapse");
    if (r2 !== startEmpty) {
      throw new FeasibilityDisclosureAdapterError(
        "idempotency",
        "request_collapse on hidden did not return same reference",
      );
    }
  }

  // 8. perTransitionIndependence
  {
    const initial: ExpandedTransitionIndices = new Set([1, 2, 3]);
    const result = applyDisclosureAction(initial, 5, "request_expand");
    for (const idx of [1, 2, 3]) {
      if (!result.has(idx)) {
        throw new FeasibilityDisclosureAdapterError(
          "perTransitionIndependence",
          `expand at 5 affected index ${idx}`,
        );
      }
    }
    if (!result.has(5)) {
      throw new FeasibilityDisclosureAdapterError(
        "requestExpandAddsIndex",
        "index 5 not added",
      );
    }
  }

  // 9. inputSetNotMutated
  {
    const initial: ExpandedTransitionIndices = new Set([10, 20]);
    const sizeBefore = initial.size;
    applyDisclosureAction(initial, 30, "request_expand");
    applyDisclosureAction(initial, 10, "request_collapse");
    applyDisclosureAction(initial, 10, "passive_idle");
    if (initial.size !== sizeBefore) {
      throw new FeasibilityDisclosureAdapterError(
        "inputSetNotMutated",
        `initial set size changed: ${sizeBefore} → ${initial.size}`,
      );
    }
    if (!initial.has(10) || !initial.has(20)) {
      throw new FeasibilityDisclosureAdapterError(
        "inputSetNotMutated",
        `initial set elements changed`,
      );
    }
  }

  // 10. resetReturnsFreshEmpty (= 毎回新規 empty set、 reference equality 放棄)
  {
    const r1 = resetAllDisclosures();
    const r2 = resetAllDisclosures();
    if (r1.size !== 0) {
      throw new FeasibilityDisclosureAdapterError(
        "resetReturnsFreshEmpty",
        `resetAllDisclosures() size=${r1.size}, expected 0`,
      );
    }
    if (r2.size !== 0) {
      throw new FeasibilityDisclosureAdapterError(
        "resetReturnsFreshEmpty",
        `resetAllDisclosures() second call size=${r2.size}, expected 0`,
      );
    }
    // 別 instance であること (= reference equality 放棄 = mutation 攻撃面除去)
    if (r1 === r2) {
      throw new FeasibilityDisclosureAdapterError(
        "resetReturnsFreshEmpty",
        "resetAllDisclosures() returned same reference (= should be fresh per call after harden)",
      );
    }
  }

  // 11. noExternallyMutableEmptyConstant (= 構造保証検証)
  //     - 「外部から mutation しても次回 reset が破壊されない」 ことを実機検証
  //     - reset 結果に対し (set as Set<number>).add(0) を試みた後、 別 reset で空が返る
  {
    const corrupted = resetAllDisclosures() as Set<number>;
    corrupted.add(999); // ← 攻撃シミュレーション (= 外部 caller の意図的破壊)
    // 攻撃後に再度 reset → 攻撃の影響がない新 empty set を返すか
    const fresh = resetAllDisclosures();
    if (fresh.size !== 0) {
      throw new FeasibilityDisclosureAdapterError(
        "noExternallyMutableEmptyConstant",
        `after external mutation attempt, reset returned non-empty set (size=${fresh.size}). Persistent constant leaked.`,
      );
    }
    if (fresh.has(999)) {
      throw new FeasibilityDisclosureAdapterError(
        "noExternallyMutableEmptyConstant",
        "external mutation leaked into fresh reset result",
      );
    }
  }
}
