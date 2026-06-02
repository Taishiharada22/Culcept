/**
 * Reality Control OS — Integration layer（既存 Plan/DayGraph ↔ kernel の境界）
 *
 * Stage ①-A: pure input adapter のみ（既存型 → RealityInput の純粋変換）。
 * 設計書: docs/aneurasync-reality-control-os-connection-design.md
 *
 * 未実装（要 CEO 承認・段階別）:
 *   - Stage ② shadow runner（runtime 接続）
 *   - Stage ③ dev-only report（redacted）
 *   - PRM 永続化 / push / 既存 Plan UI / route 接続
 */

export * from "./input-adapter";
