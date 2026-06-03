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
 *   - invariant-check.ts  決定時 Invariant の fail 可能チェック（INV-1/2/4/5/7/15/16/19/22/23/24）
 *   - golden-scenario.ts  シナリオ fixture + runner（best-action/receptivity/invariant を実行照合）
 *   - hysteresis.ts       INV-6 純粋状態機械（flapping 防止）
 *   - monitoring.ts       INV-9 監視 cadence 純関数
 *   - authority-escalation.ts INV-13 権限獲得制 pure policy
 *   - gap-meaning.ts      INV-17 空白意味づけ分類器
 *   - post-event-recompute.ts INV-20 後続波及 純計算
 *
 * Phase 0 判断 OS 純粋核は完成（24/24 INV 純粋カバレッジ）。次フェーズ（要 CEO 承認）:
 *   - 既存 Plan / DayGraph / PRM 永続化 / push / native への接続（本番化・runtime 検証）
 */

export * from "./lsat";
export * from "./authority";
export * from "./source-trace";
export * from "./change-set";
export * from "./prm-event";
export * from "./best-action";
export * from "./receptivity-gate";
export * from "./invariant-check";
export * from "./golden-scenario";
export * from "./hysteresis";
export * from "./monitoring";
export * from "./authority-escalation";
export * from "./gap-meaning";
export * from "./post-event-recompute";
