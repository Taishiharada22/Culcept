/**
 * CoAlter runtime flags — kill switch集約
 *
 * Phase A (2026-04-18): `bookingHandoffEnabled`
 *   - false のとき narrationTemplate の `buildCandidateDetail` 呼び出しをスキップし、
 *     候補カードに `detail` を載せない。UI 側は `current.detail` が無ければ
 *     bottom sheet 起動ボタンを出さないため、旧体験に戻る。
 *   - 本番で違和感が出たときに「全体を止める」のではなく
 *     「detail sheet だけ止める」粒度で切り戻せるようにするための弁。
 *
 * 既定値は ON。明示的に `false` / `0` / `off` を指定したときだけ無効化する。
 */

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "" || v === "1" || v === "true" || v === "on" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return fallback;
}

export const COALTER_FLAGS = {
  /** Phase A: bottom sheet 用 detail を candidate に付与するか */
  get bookingHandoffEnabled(): boolean {
    return envBool("COALTER_BOOKING_HANDOFF_ENABLED", true);
  },
};
