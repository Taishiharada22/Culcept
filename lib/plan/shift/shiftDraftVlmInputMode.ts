/**
 * 在app live draft flow の VLM 画像入力モード解決（pure）— S3A-2-2-2
 *
 * `PLAN_SHIFT_VLM_INPUT_MODE` を **combined-biased** に正規化する:
 *   `"split"` のみ split / それ以外（`"combined"` / 未設定 / 不正値）は combined。
 *
 * なぜ combined-biased か（CEO/GPT 2026-06-04）:
 *   - combined は Phase A/B で検証済みの成功経路（split は列レジストレーション drift の原因）。
 *   - 今後の本流候補は combined。split は明示 opt-out（dev route 互換）としてのみ残す。
 *
 * ★ 重要（client↔action の整合）:
 *   - action 側 gate（extractShiftDraftAction / runExtractShiftDraft）は **split-biased**
 *     （`PLAN_SHIFT_VLM_INPUT_MODE === "combined" ? "combined" : "split"`）。
 *   - FormData の mode は action が server 再評価して照合するため、**client mode == action mode**
 *     が必要。両者を一致させるには **env を明示的に `"combined"` か `"split"` に設定**する
 *     （env="combined" → 双方 combined ＝ live smoke の前提）。
 *   - env 未設定/不正値: client=combined / action=split → **mode 不一致で invalid_input**
 *     （= fail-loud。silent な列ズレデータより安全。要 env 設定）。
 *   - 将来オプション: action 側 normalize も combined-bias に揃えれば未設定でも一致（別 scope）。
 *
 * 不変: pure（process.env / IO なし）。throw しない。`"split"` 厳密一致のみ split。
 */

export type ShiftDraftVlmInputMode = "split" | "combined";

export function resolveShiftDraftVlmInputMode(
  raw: string | undefined
): ShiftDraftVlmInputMode {
  return raw === "split" ? "split" : "combined";
}
