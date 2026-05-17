/**
 * AlterConfirmation State Machine (Wave 1 / W1-7)
 *
 * Pure functions for state transitions. No side effects, no React, no IO.
 * Testable in isolation. UI / 永続化はここに含めない（疎結合）。
 *
 * 設計書: docs/alter-plan-foundation-design.md §4
 *
 * 不変原則の物理化:
 *   1. confirmed への遷移は action='accept' のみ（discriminated union で
 *      `decidedBy: "accept"` を必須化）
 *   2. 終端状態（confirmed / rejected）からの遷移は no-op（current をそのまま返す）
 *   3. meta は遷移で変わらない（immutable）
 *
 * Wave 1 範囲外（含めない）:
 *   - UI component（表現層、Wave 2/3）
 *   - API / DB / localStorage
 *   - PDF / chat / DraftPlan 具体 UI
 *   - Plan 画面接続
 *   - Home 変更
 */

import type {
  AlterConfirmationAction,
  AlterConfirmationMeta,
  AlterConfirmationState,
} from "./alter-confirmation";

/**
 * 内部状態。
 *
 * Discriminated union で「confirmed → decidedBy='accept' 必須」を
 * TypeScript の型レベルで強制する。ランタイムテストと型の二重防御。
 */
export type AlterConfirmationStateValue =
  | {
      state: "pending";
      meta: AlterConfirmationMeta;
    }
  | {
      state: "editing";
      meta: AlterConfirmationMeta;
      draft?: unknown;
    }
  | {
      state: "confirmed";
      meta: AlterConfirmationMeta;
      decidedBy: "accept"; // 不変原則: confirmed には accept でのみ到達可
      decidedAt: string;
      draft?: unknown;
    }
  | {
      state: "rejected";
      meta: AlterConfirmationMeta;
      decidedBy: "reject";
      decidedAt: string;
    }
  | {
      state: "snoozed";
      meta: AlterConfirmationMeta;
      decidedBy: "snooze";
      decidedAt: string;
    };

/**
 * transition の任意 payload。
 *  - draft: editing 中の編集内容
 *  - now:   テストで時刻 inject するため
 */
export type TransitionPayload = {
  draft?: unknown;
  now?: string;
};

/**
 * 終端状態か（再アクション不可、不変原則 2）。
 *
 * Terminal states:
 *   - confirmed: 最終確定（accept 経由）
 *   - rejected:  最終棄却（reject 経由）
 *
 * Non-terminal states:
 *   - pending:   初期状態
 *   - editing:   編集中
 *   - snoozed:   一時停止 / 再開可能（"paused"）。
 *                snooze は「拒否」ではなく「後で決める」であり、
 *                snoozed から accept / edit / reject に遷移できる。
 *                時間経過による pending 自動復帰は API/UI 層の責務（FSM 外）。
 */
export function isTerminal(state: AlterConfirmationState): boolean {
  return state === "confirmed" || state === "rejected";
}

/**
 * state から action で遷移可能か。
 * 終端状態（confirmed / rejected）からは全 action 不可。
 * active 状態（pending / editing / snoozed）からは全 action 可。
 */
export function canTransition(
  state: AlterConfirmationState,
  action: AlterConfirmationAction
): boolean {
  if (isTerminal(state)) return false;
  // action の値はランタイムで検証されるが、TypeScript の型で限定済み
  void action;
  return true;
}

/**
 * 初期状態を作る helper。
 *
 * 初期状態として渡せるのは "pending" / "editing" のみ。
 *   - "pending":  default、新規 confirmation の起点
 *   - "editing":  下書きから再開する場合等
 *
 * 以下は action 経由でのみ到達可能なため、bootstrap を禁止する（throw）:
 *   - "confirmed": action='accept' 経由
 *   - "rejected":  action='reject' 経由
 *   - "snoozed":   action='snooze' 経由
 *     ※ snoozed は terminal ではなく paused（再開可能）。
 *        ただし「snooze は判断行為」であり、初期状態にはなり得ない。
 *
 * これは「未確認 AI 推測の confirmed 化禁止（§10 永久 OUT）」を始め、
 * 「判断系状態は action 経由でのみ到達」という原則の延長。
 */
export function createInitialState(
  meta: AlterConfirmationMeta,
  initialState: AlterConfirmationState = "pending"
): AlterConfirmationStateValue {
  switch (initialState) {
    case "pending":
      return { state: "pending", meta };
    case "editing":
      return { state: "editing", meta };
    case "confirmed":
      throw new Error(
        "createInitialState: cannot bootstrap as 'confirmed' — must transit via action='accept'"
      );
    case "rejected":
      throw new Error(
        "createInitialState: cannot bootstrap as 'rejected' — must transit via action='reject'"
      );
    case "snoozed":
      throw new Error(
        "createInitialState: cannot bootstrap as 'snoozed' — must transit via action='snooze'"
      );
  }
}

/**
 * Pure transition function.
 *
 * 終端状態（confirmed / rejected）からは current をそのまま返す（no-op）。
 * これは冪等性を保ち、本番 throw による事故を避けるための設計判断。
 *
 * @param current 現在の状態
 * @param action  遷移トリガー
 * @param payload draft / now（任意）
 * @returns 次の状態（または不変、終端時）
 */
export function transition(
  current: AlterConfirmationStateValue,
  action: AlterConfirmationAction,
  payload?: TransitionPayload
): AlterConfirmationStateValue {
  // 終端状態からは遷移不可（no-op）
  if (isTerminal(current.state)) {
    return current;
  }

  const now = payload?.now ?? new Date().toISOString();

  switch (action) {
    case "accept": {
      // editing 中なら draft を持ち越す、なければ payload.draft を使う
      const draft =
        current.state === "editing"
          ? current.draft
          : payload?.draft;
      return {
        state: "confirmed",
        meta: current.meta,
        decidedBy: "accept",
        decidedAt: now,
        ...(draft !== undefined ? { draft } : {}),
      };
    }

    case "edit": {
      const draft =
        payload?.draft !== undefined
          ? payload.draft
          : current.state === "editing"
            ? current.draft
            : undefined;
      return {
        state: "editing",
        meta: current.meta,
        ...(draft !== undefined ? { draft } : {}),
      };
    }

    case "reject":
      return {
        state: "rejected",
        meta: current.meta,
        decidedBy: "reject",
        decidedAt: now,
      };

    case "snooze":
      return {
        state: "snoozed",
        meta: current.meta,
        decidedBy: "snooze",
        decidedAt: now,
      };
  }
}
