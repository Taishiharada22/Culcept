/**
 * SR A4 visual smoke — dev preview route の gate（pure・testable）
 *
 * auth を回避する dev preview のため **強い gate**:
 *   - 専用 flag `PLAN_SHIFT_A4_VISUAL_SMOKE_PREVIEW === "true"`（明示 opt-in・本番 flag と混ぜない）
 *   - `NODE_ENV !== "production"`（production deny）
 *   両方満たすときのみ true。**default OFF**・production では常に false（→ route は notFound）。
 *
 * 不変: pure・throw しない・env 文字列だけを見る（NEXT_PUBLIC で安易に開けない server 専用 flag）。
 */
export function isA4SmokePreviewEnabled(env: {
  flag?: string | undefined;
  nodeEnv?: string | undefined;
}): boolean {
  return env.flag === "true" && env.nodeEnv !== "production";
}
