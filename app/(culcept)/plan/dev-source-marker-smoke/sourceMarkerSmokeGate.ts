/**
 * B-2 source marker visual smoke — dev preview route の gate（pure・testable）
 *
 * auth を回避しない（CEO 認証ブラウザ前提）が、それでも **強い gate**:
 *   - 専用 flag `PLAN_SHIFT_SOURCE_MARKER_VISUAL_SMOKE_PREVIEW === "true"`
 *     （明示 opt-in・本番 flag と混ぜない・NEXT_PUBLIC でない server 専用）
 *   - `NODE_ENV !== "production"`（production deny）
 *   両方満たすときのみ true。**default OFF**・production では常に false（→ route は notFound）。
 *
 * 不変: pure・throw しない・env 文字列だけを見る。a4SmokeGate と同方針。
 */
export function isSourceMarkerSmokeEnabled(env: {
  flag?: string | undefined;
  nodeEnv?: string | undefined;
}): boolean {
  return env.flag === "true" && env.nodeEnv !== "production";
}
