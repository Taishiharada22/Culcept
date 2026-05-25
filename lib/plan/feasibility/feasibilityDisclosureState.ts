/**
 * Phase 3-M-3b-pure — Feasibility Disclosure State Machine (= observational disclosure 規範)
 *
 * 役割:
 *   M-3b の core 思想「**観測の主導権を user に渡す**」 を **pure layer で確立**する
 *   state machine。 UI を作らずに「disclosure pattern」 を data として表現し、
 *   将来 (= M-3c 以降) の UI 実装がこの規範に従う約束として機能する。
 *
 * 思想 (= observational disclosure):
 *   - **default = hidden** (= push 表示禁止、 圧防止)
 *   - **user action が disclosure trigger** (= tap / expand 等)
 *   - **passive_idle で state 不変** (= 「何もしない」 = 何も表示しない)
 *   - **未知 action で state 不変** (= 防御、 forward compat)
 *
 * Aneurasync 中心問いとの接続:
 *   - 「自分って、 そういう人間だったのか」 体験 = user 自身が能動的に観測する
 *   - 「AI が指摘する」 pattern は完全排除
 *   - 「不足 N 分」 が見える瞬間 = user が「観測したい」 と思って action した瞬間
 *
 * M-3b-pure scope (= 2026-05-23 CEO + GPT 連続 GO 範囲):
 *   - LLM 不使用 / API 不使用 / no DB / no UI / no localStorage / no telemetry sink
 *   - K phase / L / M-1 / M-2 / M-3a 既存 file 改変 0
 *   - UI 接続は M-3c 以降、 別 audit + CEO smoke 必須
 *
 * 「pure layer で UI 規範を確立」 する革新:
 *   - 通常: UI を作ってから規約を後付けで明文化
 *   - 本 file: UI を作る **前** に規範を pure state machine で固定
 *   - これにより、 将来 UI が実装される時、 type system + runtime assertion が
 *     「default hidden」 等の規範を機械保証する
 *
 * 参照:
 *   - docs/alter-plan-phase3-m-3b-readiness-audit.md
 *   - lib/plan/feasibility/feasibilityDisplayPipeline.ts (= M-3a)
 *   - lib/plan/feasibility/feasibilityDisplayContract.ts (= M-2b)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. FeasibilityDisclosureState — 開示 state (= 3 値)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Feasibility disclosure state — user に対する開示 state。
 *
 * - **"hidden"**:      非表示 (= **default**、 push 表示禁止、 圧防止)
 * - "previewing":      preview hint (= **M-3b では未使用**、 M-4+ ambient indicator 用の forward compat hook)
 * - **"expanded"**:    詳細展開 (= user 操作後、 「余白 N 分」 / 「不足 N 分」 表示)
 *
 * 思想:
 *   - 観測の主導権を user に渡す
 *   - AI が指摘する pattern を構造的に排除
 */
export type FeasibilityDisclosureState = "hidden" | "previewing" | "expanded";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. FeasibilityDisclosureAction — user action (= 3 値)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * User action — disclosure state を変更する操作。
 *
 * - **"request_expand"**:   user が詳細を開く意図 (= tap / expand 等の能動操作)
 * - **"request_collapse"**: user が詳細を閉じる意図 (= tap close / X 等)
 * - **"passive_idle"**:     何もしない (= 圧防止 default、 「待ちの観測」)
 *
 * 思想:
 *   - user の能動意図 (= request_*) のみが disclosure を変える
 *   - passive_idle で state 不変 → 「何もしないと何も表示されない」 が保証
 */
export type FeasibilityDisclosureAction =
  | "request_expand"
  | "request_collapse"
  | "passive_idle";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. Default state — 永続規約「default = hidden」
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Default disclosure state — **"hidden"** 固定。
 *
 * これは observational disclosure 思想の **核心**:
 *   - 初期表示は何も出さない
 *   - user が能動的に "request_expand" を発火させた瞬間に初めて表示
 *   - push 表示は構造的に不可能 (= initial state を "expanded" に変える方法がない)
 *
 * 将来 UI 実装 (= M-3c) は本定数を必ず初期 state として使用する **永続規約**。
 */
export const DEFAULT_DISCLOSURE_STATE: FeasibilityDisclosureState = "hidden";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. State transition rules (= 純粋関数、 副作用なし)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * State machine transition table:
 *
 * | Current State | Action              | Next State    |
 * |---|---|---|
 * | "hidden"      | "request_expand"    | "expanded"    |
 * | "hidden"      | "request_collapse"  | "hidden"      |  (= 既に hidden、 不変)
 * | "hidden"      | "passive_idle"      | "hidden"      |  (= 不変、 圧防止)
 * | "previewing"  | "request_expand"    | "expanded"    |
 * | "previewing"  | "request_collapse"  | "hidden"      |
 * | "previewing"  | "passive_idle"      | "previewing"  |  (= 不変)
 * | "expanded"    | "request_expand"    | "expanded"    |  (= 既に expanded、 不変)
 * | "expanded"    | "request_collapse"  | "hidden"      |
 * | "expanded"    | "passive_idle"      | "expanded"    |  (= 不変)
 *
 * 不変条件 (= contract で機械保証):
 *   1. default は "hidden"
 *   2. passive_idle で state 不変
 *   3. 未知 action で state 不変 (= 防御)
 *   4. "hidden" + request_expand → "expanded"
 *   5. "expanded" + request_collapse → "hidden"
 *   6. "previewing" は M-3b では default で発生しない (= forward compat)
 *
 * Pure function:
 *   - 副作用なし
 *   - input mutation なし
 *   - deterministic (= 同じ input → 同じ output)
 */
export function nextDisclosureState(
  current: FeasibilityDisclosureState,
  action: FeasibilityDisclosureAction,
): FeasibilityDisclosureState {
  switch (action) {
    case "request_expand":
      // user 能動意図 → expanded に遷移 (= "hidden" / "previewing" / "expanded" いずれからも)
      return "expanded";
    case "request_collapse":
      // user 能動意図 → hidden に遷移 (= 全 state から)
      return "hidden";
    case "passive_idle":
      // 圧防止: 何もしない場合 state 不変
      return current;
    default: {
      // 未知 action: 防御として state 不変 (= 将来 action 追加時の forward compat)
      // ts-expect-error 経由でも防御可能だが、 runtime 防御も維持
      const exhaustiveCheck: never = action;
      // exhaustive check 不発時は state 不変
      void exhaustiveCheck;
      return current;
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. Contract — 9 invariants の literal record + assertion
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Disclosure state machine の不変条件。
 *
 * 9 invariants:
 *   1. defaultIsHidden:                DEFAULT_DISCLOSURE_STATE === "hidden"
 *   2. passiveIdleKeepsState:          全 state + passive_idle → 不変
 *   3. requestExpandReachesExpanded:    全 state + request_expand → "expanded"
 *   4. requestCollapseReachesHidden:   全 state + request_collapse → "hidden"
 *   5. hiddenIsValidState:             "hidden" は valid state
 *   6. previewingIsValidState:         "previewing" は valid state (= forward compat)
 *   7. expandedIsValidState:           "expanded" は valid state
 *   8. stateTransitionIsDeterministic: 同 input → 同 output (= pure function)
 *   9. unknownActionKeepsState:        TypeScript narrowing 経由で未知 action は到達不能だが、
 *                                       実用上 default state 不変を保証
 */
export interface FeasibilityDisclosureContract {
  readonly defaultIsHidden: true;
  readonly passiveIdleKeepsState: true;
  readonly requestExpandReachesExpanded: true;
  readonly requestCollapseReachesHidden: true;
  readonly hiddenIsValidState: true;
  readonly previewingIsValidState: true;
  readonly expandedIsValidState: true;
  readonly stateTransitionIsDeterministic: true;
  readonly unknownActionKeepsState: true;
}

export const FEASIBILITY_DISCLOSURE_CONTRACT: FeasibilityDisclosureContract = {
  defaultIsHidden: true,
  passiveIdleKeepsState: true,
  requestExpandReachesExpanded: true,
  requestCollapseReachesHidden: true,
  hiddenIsValidState: true,
  previewingIsValidState: true,
  expandedIsValidState: true,
  stateTransitionIsDeterministic: true,
  unknownActionKeepsState: true,
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. Error class
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export class FeasibilityDisclosureContractError extends Error {
  readonly violation: keyof FeasibilityDisclosureContract;
  constructor(violation: keyof FeasibilityDisclosureContract, detail?: string) {
    const suffix = detail ? ` (${detail})` : "";
    super(`[M-3b-pure] Disclosure contract violates ${violation}${suffix}`);
    this.name = "FeasibilityDisclosureContractError";
    this.violation = violation;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7. Assertion — runtime check
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const VALID_STATES: ReadonlySet<FeasibilityDisclosureState> = new Set<FeasibilityDisclosureState>([
  "hidden",
  "previewing",
  "expanded",
]);

/**
 * 単一 state value が valid (= 3 literal のいずれか) を assert する。
 * 違反時は throw。
 */
export function assertValidDisclosureState(value: unknown): void {
  if (typeof value !== "string" || !VALID_STATES.has(value as FeasibilityDisclosureState)) {
    throw new FeasibilityDisclosureContractError(
      "hiddenIsValidState",
      `value=${String(value)} is not a valid disclosure state`,
    );
  }
}

/**
 * State machine 全体の不変条件を機械検証する pure function。
 *
 * 9 invariants 全件 PASS なら void、 違反時は throw。
 *
 * 使い方:
 *   - dev / test 時に呼び出して contract が壊れていないことを確認
 *   - runtime に毎回呼ぶ必要はない (= state machine logic 自体が pure / deterministic)
 */
export function assertDisclosureStateMachineCompliance(): void {
  // 1. defaultIsHidden
  if (DEFAULT_DISCLOSURE_STATE !== "hidden") {
    throw new FeasibilityDisclosureContractError(
      "defaultIsHidden",
      `DEFAULT_DISCLOSURE_STATE=${DEFAULT_DISCLOSURE_STATE}`,
    );
  }

  const states: ReadonlyArray<FeasibilityDisclosureState> = [
    "hidden",
    "previewing",
    "expanded",
  ];

  for (const state of states) {
    // 2. passiveIdleKeepsState
    if (nextDisclosureState(state, "passive_idle") !== state) {
      throw new FeasibilityDisclosureContractError(
        "passiveIdleKeepsState",
        `state=${state}`,
      );
    }
    // 3. requestExpandReachesExpanded
    if (nextDisclosureState(state, "request_expand") !== "expanded") {
      throw new FeasibilityDisclosureContractError(
        "requestExpandReachesExpanded",
        `state=${state}`,
      );
    }
    // 4. requestCollapseReachesHidden
    if (nextDisclosureState(state, "request_collapse") !== "hidden") {
      throw new FeasibilityDisclosureContractError(
        "requestCollapseReachesHidden",
        `state=${state}`,
      );
    }
    // 5-7. 各 state が valid
    assertValidDisclosureState(state);
  }

  // 8. stateTransitionIsDeterministic (= 2 回呼んで同じ結果)
  for (const state of states) {
    for (const action of ["request_expand", "request_collapse", "passive_idle"] as const) {
      const r1 = nextDisclosureState(state, action);
      const r2 = nextDisclosureState(state, action);
      if (r1 !== r2) {
        throw new FeasibilityDisclosureContractError(
          "stateTransitionIsDeterministic",
          `state=${state}, action=${action}, r1=${r1}, r2=${r2}`,
        );
      }
    }
  }

  // 9. unknownActionKeepsState (= type narrowing 経由で到達不能だが、 runtime 防御)
  //    実用上、 type system の exhaustive check で未知 action は到達しない。
  //    contract literal record に "unknownActionKeepsState: true" を含めることで宣言。
}
