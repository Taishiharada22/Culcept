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
 *   - **default = 全 hidden** (= EMPTY_EXPANDED_INDICES 永続定数)
 *   - **expanded transition の index 集合のみ保持**
 *   - **hidden は補集合** (= 暗黙、 set に含まれない index は hidden)
 *   - **passive_idle で state 不変** (= 圧防止、 M-3b 継承)
 *   - **per-transition で独立** (= 異 index 操作で他 index 不影響)
 *   - **tab/day 切替で reset** (= 「観測の幕間」、 革新 5 永続規約化)
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
// §2. EMPTY_EXPANDED_INDICES — 永続定数 (= 「全 hidden」 の唯一の正本)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * **空 Set<number> 永続定数**。
 *
 * 思想:
 *   - 「全 transition が hidden」 状態は **常にこの定数 1 つ** で表現
 *   - 初期 state / reset 後の state は **必ずこの定数 reference** を返す
 *   - これにより:
 *     1. React useState の初期値として stable reference を提供 → re-render 削減 hook
 *     2. 「全 hidden = この定数」 が機械保証 (= 別 instance を作らない規約)
 *     3. assertion で「empty 検知」 が O(1) で可能 (= reference 同値性)
 *
 * 注: 「**ReadonlySet<number>** 型」 + 「Object.freeze」 を併用しない理由:
 *   - TypeScript 型 narrowing で `add` / `delete` / `clear` を call 不能
 *   - runtime freeze は overhead、 type-time の保証で十分
 *   - 別 caller が `as Set<number>` で type assertion して mutate するのは
 *     CEO 規約違反 (= 規約は機械保証ではなく規範遵守)
 */
export const EMPTY_EXPANDED_INDICES: ExpandedTransitionIndices = new Set<number>();

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
 * 実装:
 *   - 常に `EMPTY_EXPANDED_INDICES` を返す (= 永続定数の同参照)
 *   - 副作用 0、 deterministic
 *
 * caller の使い方:
 *   ```
 *   // tab 切替 / 別 day 移動時
 *   setExpandedIndices(resetAllDisclosures());
 *   ```
 *
 * @returns EMPTY_EXPANDED_INDICES (= 永続定数の同参照)
 */
export function resetAllDisclosures(): ExpandedTransitionIndices {
  return EMPTY_EXPANDED_INDICES;
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
 * Per-transition disclosure adapter の不変条件 (= 10 invariants)。
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
 * 10. resetReturnsEmptyConstant:       resetAllDisclosures() → EMPTY_EXPANDED_INDICES 同参照
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
  readonly resetReturnsEmptyConstant: true;
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
  resetReturnsEmptyConstant: true,
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
 * 10 invariants 全件を機械検証する pure function。
 *
 * 検証範囲:
 *   1. emptySetIsAllHidden: EMPTY_EXPANDED_INDICES の全 lookup が "hidden"
 *      (= sample indices で確認、 0 / 1 / 100 / Number.MAX_SAFE_INTEGER)
 *   2. hiddenIsComplement: set 外 index は "hidden"
 *   3. expandedIsMembership: set 内 index は "expanded"
 *   4. requestExpandAddsIndex
 *   5. requestCollapseRemovesIndex
 *   6. passiveIdleKeepsSet (= 同参照)
 *   7. idempotency (= 同 action 連続で同参照)
 *   8. perTransitionIndependence (= 異 index 操作で他 index 不影響)
 *   9. inputSetNotMutated (= original set の size 不変)
 *   10. resetReturnsEmptyConstant (= EMPTY_EXPANDED_INDICES 同参照)
 *
 * 用途:
 *   - dev / test 時に呼び出して contract が壊れていないことを確認
 *   - runtime に毎回呼ぶ必要はない (= pure / deterministic、 構造的に invariants は不変)
 *
 * 違反時は `FeasibilityDisclosureAdapterError` を throw。
 */
export function assertNFoldDisclosureCompliance(): void {
  const sampleIndices: ReadonlyArray<number> = [0, 1, 2, 5, 10, 100, Number.MAX_SAFE_INTEGER];

  // 1. emptySetIsAllHidden
  if (EMPTY_EXPANDED_INDICES.size !== 0) {
    throw new FeasibilityDisclosureAdapterError(
      "emptySetIsAllHidden",
      `EMPTY_EXPANDED_INDICES.size=${EMPTY_EXPANDED_INDICES.size}`,
    );
  }
  for (const idx of sampleIndices) {
    if (getDisclosureStateForIndex(EMPTY_EXPANDED_INDICES, idx) !== "hidden") {
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
    const result = applyDisclosureAction(EMPTY_EXPANDED_INDICES, 2, "request_expand");
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

  // 7. idempotency (= 同 action 連続で同参照)
  {
    const initial: ExpandedTransitionIndices = new Set([4]);
    const r1 = applyDisclosureAction(initial, 4, "request_expand"); // 既に expanded
    if (r1 !== initial) {
      throw new FeasibilityDisclosureAdapterError(
        "idempotency",
        "request_expand on expanded did not return same reference",
      );
    }
    const r2 = applyDisclosureAction(EMPTY_EXPANDED_INDICES, 4, "request_collapse"); // 既に hidden
    if (r2 !== EMPTY_EXPANDED_INDICES) {
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

  // 10. resetReturnsEmptyConstant
  if (resetAllDisclosures() !== EMPTY_EXPANDED_INDICES) {
    throw new FeasibilityDisclosureAdapterError(
      "resetReturnsEmptyConstant",
      "resetAllDisclosures() did not return EMPTY_EXPANDED_INDICES constant",
    );
  }
}
