/**
 * Reality Control OS — 判断 OS 骨格（Phase 0 限定実装）
 *
 * 純関数 + 型のみ。DB / push / native / Routes API / 既存 Plan 本番接続には未接続。
 * 親設計:
 *   - docs/aneurasync-reality-control-os-phase0-design.md
 *   - docs/aneurasync-live-plan-controller-adaptive-trigger-matrix.md
 *   - docs/aneurasync-live-plan-controller-golden-scenarios.md
 *
 * 実装済み（本コミット）:
 *   - lsat.ts      LSAT / critical-fractile / Safety Floor / confidence
 *   - authority.ts Origin / Authority / Flexibility / ProtectionReason 権限モデル
 *
 * 次スライス（未実装）:
 *   - source-trace 型（INV-4/23）, change-set/undo 型（INV-24）, PRM event 型
 *   - Best Action 評価関数（scoring）, Receptivity Gate, Invariant checker
 *   - Golden Scenario fixtures（35）
 */

export * from "./lsat";
export * from "./authority";
