/**
 * Reality Control OS — Integration layer（既存 Plan/DayGraph ↔ kernel の境界）
 *
 * Stage ①-A: pure input adapter（既存型 → RealityInput の純粋変換）。
 * Stage ②: shadow runner skeleton（runtime-unconnected。adapter→kernel→redacted summary 純関数）。
 * 設計書: docs/aneurasync-reality-control-os-connection-design.md
 *
 * 未実装（要 CEO 承認・段階別）:
 *   - shadow runner を実 runtime から呼ぶ（route/UI/PlanClient/実データ）
 *   - Stage ③ dev-only report（画面表示）
 *   - PRM 永続化 / push / native / Routes 接続
 */

export * from "./input-adapter";
export * from "./shadow-runner";
