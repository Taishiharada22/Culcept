/**
 * CoAlter AOO Phase B B-4b — Mirror gates barrel
 *
 * 正本: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2
 *
 * 3 gate pure function を一括 export する:
 *   - `checkObserveGate(input)`: 観測十分性 (Observe Gate)
 *   - `checkWorthGate(input)`: 反射価値 (Worth Gate)
 *   - `checkSafeGate(input)`: 安全性 (Safe Gate)
 *
 * すべて pure / deterministic / side-effect-free / fail-closed AND 合成想定。
 *
 * B-4d decisionEngine (未実装) は本 barrel から import して 3 gate を順次評価する。
 * B-4b では engine 統合は行わない (本 barrel は宣言的 export のみ)。
 */

export { checkObserveGate } from "./observeGate";
export { checkWorthGate } from "./worthGate";
export { checkSafeGate } from "./safeGate";
