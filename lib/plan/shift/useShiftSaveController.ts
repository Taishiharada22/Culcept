/**
 * useShiftSaveController — SR Step 6D（host が差し込む React adapter / 薄い wrapper）
 *
 * pure な createShiftSaveController を React state に橋渡しするだけの薄い hook。
 * 分岐ロジックは持たず、controller の onStateChange → setState を繋ぐのみ
 *（ロジックは shiftSaveController.test.ts で検証済）。
 *
 * host での想定:
 *   const { state, requestSave, confirmBlankRisk, cancel } = useShiftSaveController({
 *     save: importShiftRosterAction,   // 実 server action（host が注入）
 *     year, month, dictionary,
 *     saveEnabled,                     // server で isShiftImportSaveEnabled() を読んで渡す
 *     onSuccess: () => refetchPlan(),  // /plan 全 refetch（ICS/Google と同型）
 *   });
 *   <ShiftReviewGrid ... saveEnabled saveState={state}
 *     onConfirm={requestSave} onConfirmBlankRisk={confirmBlankRisk} onCancel={cancel} />
 */

import { useRef, useState } from "react";
import {
  createShiftSaveController,
  type ShiftSaveController,
  type ShiftSaveControllerDeps,
  type ShiftSaveState,
} from "./shiftSaveController";

export type UseShiftSaveControllerDeps = Omit<
  ShiftSaveControllerDeps,
  "onStateChange"
>;

export interface UseShiftSaveController {
  state: ShiftSaveState;
  requestSave: ShiftSaveController["requestSave"];
  confirmBlankRisk: ShiftSaveController["confirmBlankRisk"];
  cancel: ShiftSaveController["cancel"];
  reset: ShiftSaveController["reset"];
}

export function useShiftSaveController(
  deps: UseShiftSaveControllerDeps
): UseShiftSaveController {
  const [state, setState] = useState<ShiftSaveState>({ status: "idle" });

  // 最新 deps を ref 経由で読む（controller は一度だけ生成し、closure が古い deps を掴まないように getter で参照）
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const controllerRef = useRef<ShiftSaveController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createShiftSaveController({
      save: (input) => depsRef.current.save(input),
      onSuccess: () => depsRef.current.onSuccess?.(),
      onStateChange: setState,
      get year() {
        return depsRef.current.year;
      },
      get month() {
        return depsRef.current.month;
      },
      get dictionary() {
        return depsRef.current.dictionary;
      },
      get saveEnabled() {
        return depsRef.current.saveEnabled;
      },
      get source() {
        return depsRef.current.source;
      },
      get lowConfidenceThreshold() {
        return depsRef.current.lowConfidenceThreshold;
      },
    });
  }
  const controller = controllerRef.current;

  return {
    state,
    requestSave: controller.requestSave,
    confirmBlankRisk: controller.confirmBlankRisk,
    cancel: controller.cancel,
    reset: controller.reset,
  };
}
