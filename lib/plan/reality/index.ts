/**
 * Reality Control OS — 判断 OS 骨格（Phase 0 限定実装）
 *
 * 純関数 + 型のみ。DB / push / native / Routes API / 既存 Plan 本番接続には未接続。
 * 親設計:
 *   - docs/aneurasync-reality-control-os-phase0-design.md
 *   - docs/aneurasync-live-plan-controller-adaptive-trigger-matrix.md
 *   - docs/aneurasync-live-plan-controller-golden-scenarios.md
 *
 * 実装済み:
 *   - lsat.ts         LSAT / critical-fractile / Safety Floor / confidence（INV-3/8/21）
 *   - authority.ts    Origin / Authority / Flexibility / ProtectionReasons 権限モデル（INV-5/7/18/23）
 *   - source-trace.ts 根拠追跡（INV-4/23）
 *   - change-set.ts   変更差分・Undo（INV-24/5）
 *   - prm-event.ts    PRM 学習イベント契約（INV-12）
 *   - best-action.ts  Gate first→score の候補選定（INV-1/4/5/16/19/24）
 *   - receptivity-gate.ts 配信判断 push/on_open/silent/urgent/permission_prompt（INV-1/9/10/14）
 *
 * 次スライス（未実装）:
 *   - Invariant checker, Golden Scenario fixtures（35）
 */

export * from "./lsat";
export * from "./authority";
export * from "./source-trace";
export * from "./change-set";
export * from "./prm-event";
export * from "./best-action";
export * from "./receptivity-gate";
