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
 *
 * 次スライス（未実装）:
 *   - PRM event 型 → Best Action 評価関数（scoring）→ Receptivity Gate
 *   - Invariant checker, Golden Scenario fixtures（35）
 */

export * from "./lsat";
export * from "./authority";
export * from "./source-trace";
export * from "./change-set";
