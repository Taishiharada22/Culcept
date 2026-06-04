/**
 * Draft extraction の flag gate（pure / no env / no IO）— S3A-1
 *
 * live draft extraction（画像→VLM→cells）を許可する 2 つの server-side flag を OR で判定する。
 *
 *   - `PLAN_SHIFT_DRAFT_LIVE_ENABLED`: **product 導線（在app入口）の live VLM gate**
 *   - `PLAN_SHIFT_DRAFT_HOST`:         **dev route `/plan/dev-shift-draft` 互換の既存 gate**
 *
 * 意味づけ（CEO 2026-06-04 補正・重要）:
 *   - 「live flag が唯一の VLM gate」**ではない**。**2 つの gate を action が両方許容**する。
 *   - `/plan/dev-shift-draft` は従来どおり `PLAN_SHIFT_DRAFT_HOST` で動く。
 *   - 在app本流導線は `PLAN_SHIFT_DRAFT_LIVE_ENABLED` でだけ live VLM を許可する。
 *   - 入口 flag / live VLM flag / save flag は分離する。
 *
 * 責務境界（本 helper は flag gate のみ）:
 *   - staging allowlist / production deny / `GEMINI_API_KEY` / `B1B_VLM_MODEL` / 認証 / file 検証
 *     は `runExtractShiftDraft` 側の**別 gate**（本 helper は一切触れない）。
 *   - **保存 flag `PLAN_SHIFT_IMPORT_SAVE` とは無関係**（混ぜない・本 helper は save を引数に取らない）。
 *
 * 不変原則: pure（`process.env` / IO / DB / fetch を読まない・呼ばない）。throw しない。
 *   `"true"` 厳密一致のみ（`"1"` / `"yes"` / `"TRUE"` / 前後空白は false）。
 *   env 値は受け取って boolean を返すだけ（値を log / return しない）。
 */

export interface DraftExtractionFlagEnv {
  /** `PLAN_SHIFT_DRAFT_LIVE_ENABLED` の値（product 導線の live VLM gate）。 */
  liveEnabled: string | undefined;
  /** `PLAN_SHIFT_DRAFT_HOST` の値（dev route 互換の既存 gate）。 */
  draftHost: string | undefined;
}

/**
 * live draft extraction が flag 的に許可されるか。
 *
 *   `PLAN_SHIFT_DRAFT_LIVE_ENABLED === "true" || PLAN_SHIFT_DRAFT_HOST === "true"`
 *
 * いずれかが厳密に `"true"` のときのみ true。両方欠落/false なら false。
 */
export function isDraftExtractionFlagAllowed(
  env: DraftExtractionFlagEnv
): boolean {
  return env.liveEnabled === "true" || env.draftHost === "true";
}
