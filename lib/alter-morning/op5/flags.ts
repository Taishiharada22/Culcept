/**
 * ALTER_MORNING_OP5_* flags — OP-5.1 (CEO 2026-05-06)
 *
 * OP-5 shadow path 起動 / canary / log level の feature flag。
 *
 * 既存 STARGAZER_* / ALTER_MORNING_* 命名慣例を踏襲し、 名前空間を明示して
 * 他機能の flag と衝突しないようにする (CEO 修正点 5)。
 *
 * 規律:
 *   - **default は全 OFF** (= flag 未設定 = production no-op)
 *   - 「flag off 時は production behavior no-op」 (= 既存 PlanState / response /
 *     UI / telemetry に影響なし)
 *   - 注: 「byte-diff zero」 表現は禁止 (CEO 修正点 1)。 import / bundle 経路の
 *     差分はゼロではない可能性があるため、 厳密には no-op behavior を保証する。
 *   - allowlist 空文字なら誰も含まれない (= shadowEnabled=true でも canary 不在)
 *   - logLevel default "none" → emit しない
 *
 * OP-5.1 scope:
 *   - flag 値の読み取りのみ。
 *   - shadowOrchestrator は本 module の値を参照可能だが、
 *     **OP-5.1 では runtime に接続しない**。
 *   - morningPipeline / route.ts / legacyAdapter / DB / telemetry 永続化なし。
 *
 * 環境変数:
 *   - ALTER_MORNING_OP5_SHADOW_ENABLED       ("true" のみ true)
 *   - ALTER_MORNING_OP5_SHADOW_USER_ALLOWLIST (= comma-separated user_id 列)
 *   - ALTER_MORNING_OP5_SHADOW_LOG_LEVEL     ("none" | "summary" | "verbose")
 */

export type Op5ShadowLogLevel = "none" | "summary" | "verbose";

export interface Op5Flags {
  /** shadow path 起動可否 (default: false) */
  shadowEnabled: boolean;

  /**
   * shadow 適用対象 user_id list。
   * shadowEnabled=true でも、 ここに含まれる user_id のみ shadow 起動。
   * 空配列 → 起動対象 0。
   */
  shadowAllowlist: ReadonlyArray<string>;

  /**
   * shadow log 出力詳細度 (default: "none")。
   *   - "none":    emit しない (= shadowEnabled=true でも観測ログ出さない)
   *   - "summary": kind / source / type / count / match のみ
   *   - "verbose": OP-5.2 で redaction 設計後に有効化想定。
   *                **OP-5.1 では verbose 時の永続化なし** (= flag 値の読み取りのみ)。
   */
  shadowLogLevel: Op5ShadowLogLevel;
}

/**
 * env-like map (= process.env / test mock 兼用)。
 * NodeJS.ProcessEnv より緩い型で、 test での mock object literal を受け付ける。
 */
export type Op5EnvLike = Readonly<Record<string, string | undefined>>;

/**
 * 環境変数から OP-5 flags を読む pure 関数。
 *
 * caller (= shadowOrchestrator / 将来の OP-5.3 morningPipeline 接続) は
 * 本関数を呼ぶ。 test では env mock + 関数呼び出しで決定的に検証可能。
 *
 * @param env process.env 相当 (test では mock を渡す)
 */
export function readOp5Flags(env: Op5EnvLike = process.env): Op5Flags {
  const shadowEnabled = env.ALTER_MORNING_OP5_SHADOW_ENABLED === "true";

  const allowlistRaw = env.ALTER_MORNING_OP5_SHADOW_USER_ALLOWLIST ?? "";
  const shadowAllowlist = allowlistRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const levelRaw = env.ALTER_MORNING_OP5_SHADOW_LOG_LEVEL ?? "none";
  const shadowLogLevel: Op5ShadowLogLevel =
    levelRaw === "summary" || levelRaw === "verbose" ? levelRaw : "none";

  return {
    shadowEnabled,
    shadowAllowlist,
    shadowLogLevel,
  };
}

/**
 * shadow を起動すべきか判定する pure helper。
 *
 * 全 AND 条件:
 *   - shadowEnabled === true
 *   - userId が allowlist に含まれる
 *
 * 注: logLevel は emit 段階の判定。 起動可否には関与しない (= 起動して logLevel
 * "none" なら emit を skip する設計を OP-5.2 で固定する)。
 *
 * OP-5.1 では本関数の呼び出し側 (= morningPipeline 等) が存在しない。
 * helper のみ提供。
 */
export function shouldRunShadow(
  flags: Op5Flags,
  userId: string | null | undefined,
): boolean {
  if (!flags.shadowEnabled) return false;
  if (!userId) return false;
  return flags.shadowAllowlist.includes(userId);
}
