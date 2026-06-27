/**
 * シフト取り込み 本保存の **接続先 guard**（pure / no env / no IO）— S-save-0
 *
 * 保存は DB write に直結するため、flag だけでなく **接続先 supabase が staging か**を
 * fail-closed で確認する（extraction action と同等の多重防御。env 誤設定でも production 保存をコードで遮断）。
 *
 *   - **staging allowlist**: 接続先 URL が `stagingRef` を含む
 *   - **production deny**:    接続先 URL が `productionRef` を含まない
 *   両方を満たす時のみ true（どちらか欠ければ false ＝ fail-closed）。
 *
 * 重要（CEO 2026-06-04）:
 *   - NG は **接続先 URL（NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL）が production を指す**こと。
 *     production deny ref が `.env.local` に定数として存在すること自体は問題ではない（照合元の定数）。
 *   - 本 helper は **flag を見ない**（flag は `isShiftImportSaveEnabled` が別途判定）。
 *     呼出側（runShiftImportSave）は flag → 接続先 guard の順に両方を通す。
 *   - 入口 flag / live VLM flag / 保存 flag、および VLM・raw画像/base64 とは無関係。
 *
 * 不変: pure（`process.env` / IO / DB / fetch を読まない・呼ばない）。throw しない。
 *   URL 値は受け取って boolean を返すだけ（値を log / return しない）。
 */

export interface ShiftImportSaveConnectionEnv {
  /** 接続先 supabase URL（`NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL`）。 */
  supabaseUrl: string | undefined;
  /** staging allowlist ref（接続先がこれを含むことを要求）。 */
  stagingRef: string;
  /** production deny ref（接続先がこれを含まないことを要求）。 */
  productionRef: string;
}

/**
 * 本保存の接続先が許可されるか（staging allowlist ∧ production deny）。
 *   `url.includes(stagingRef) && !url.includes(productionRef)`
 * URL 未設定 / staging 不一致 / production 含有 はすべて false（fail-closed）。
 */
export function isShiftImportSaveConnectionAllowed(
  env: ShiftImportSaveConnectionEnv
): boolean {
  const url = env.supabaseUrl ?? "";
  return url.includes(env.stagingRef) && !url.includes(env.productionRef);
}

/**
 * P14: production 本番への保存を **canary allowlist** に限って許可する lane（pure）。
 *   production に接続している ∧ userId が allowlist に含まれる時のみ true。
 *   staging lane（isShiftImportSaveConnectionAllowed）とは OR で併存し、どちらかが true なら保存可。
 *   allowlist 空 / userId null / production 非接続 はすべて false（fail-closed）。
 *   ★これは flag（isShiftImportSaveEnabled）が既に true で、auth 済 userId を渡される前提の最終 gate。
 */
export function isShiftImportSaveProductionCanaryAllowed(
  env: ShiftImportSaveConnectionEnv,
  userId: string | null,
  canaryUserIds: readonly string[]
): boolean {
  if (!userId) return false;
  const url = env.supabaseUrl ?? "";
  if (!url.includes(env.productionRef)) return false; // production 接続でなければ本 lane 対象外
  return canaryUserIds.includes(userId);
}
