"use client";

/**
 * useAlterConfirmation React Hook (Wave 1 / W1-7)
 *
 * Thin wrapper around the pure transition function. React state 以外の
 * 副作用は一切持たない（IO / 永続化 / API は呼ばない、表現層に渡さない）。
 *
 * 設計書: docs/alter-plan-foundation-design.md §4
 *
 * Wave 1 範囲外（含めない）:
 *   - UI / 表現層（シーン別: PDF / chat / draft）
 *   - API / DB / localStorage
 *   - Plan 画面接続
 *   - Home 変更
 */

import { useCallback, useMemo, useReducer } from "react";

import type {
  AlterConfirmationAction,
  AlterConfirmationMeta,
  AlterConfirmationState,
} from "./alter-confirmation";

import {
  type AlterConfirmationStateValue,
  type TransitionPayload,
  canTransition,
  createInitialState,
  isTerminal,
  transition,
} from "./alter-confirmation-state";

type ReducerAction = {
  type: AlterConfirmationAction;
  payload?: TransitionPayload;
};

function reducer(
  state: AlterConfirmationStateValue,
  action: ReducerAction
): AlterConfirmationStateValue {
  return transition(state, action.type, action.payload);
}

export interface UseAlterConfirmationResult {
  /** 現在の状態 */
  state: AlterConfirmationStateValue;
  /** 終端状態か（UI で完了表示判定） */
  isTerminal: boolean;
  /** 与えられた action が現状態から可能か（UI で button disable 判定） */
  canDispatch: (action: AlterConfirmationAction) => boolean;
  /** action を発火する */
  dispatch: (
    action: AlterConfirmationAction,
    payload?: TransitionPayload
  ) => void;
}

/**
 * AlterConfirmation の React hook。
 *
 * 内部実装は pure な transition 関数を useReducer でラップしただけ。
 * テストは alter-confirmation-state.test.ts で pure 関数側を網羅する。
 *
 * @param meta         確認対象のメタ情報（不変、遷移で保持される）
 * @param initialState 初期状態。default は "pending"。confirmed/rejected/snoozed
 *                     を指定すると createInitialState が throw する。
 */
export function useAlterConfirmation(
  meta: AlterConfirmationMeta,
  initialState: AlterConfirmationState = "pending"
): UseAlterConfirmationResult {
  const [state, reactDispatch] = useReducer(
    reducer,
    undefined,
    () => createInitialState(meta, initialState)
  );

  const dispatch = useCallback(
    (action: AlterConfirmationAction, payload?: TransitionPayload) => {
      reactDispatch({ type: action, payload });
    },
    []
  );

  const canDispatch = useCallback(
    (action: AlterConfirmationAction) => canTransition(state.state, action),
    [state.state]
  );

  return useMemo(
    () => ({
      state,
      isTerminal: isTerminal(state.state),
      canDispatch,
      dispatch,
    }),
    [state, canDispatch, dispatch]
  );
}
