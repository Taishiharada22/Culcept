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
 * [CEO lock 2026-04-20 M1 1a] `stage1LiveEnabled`
 *   - /api/coalter/invoke で Stage 1 Understand を呼ぶかを決める弁。
 *   - 既定 OFF。invoke の response shape は flag OFF で現行と完全一致。
 *   - ON 時のみ collector + `runUnderstanding()` が走り、response.data に
 *     optional `stage1: Stage1Snapshot` が付与される。
 *   - Stage 1 側の例外は invoke route で握り潰し、`stage1` 欠落で返す（fail-open）。
 *   - env から外せば即座に 1a 前状態へ戻る。
 *
 * 既定値は flag ごとに異なる。bookingHandoffEnabled は ON、stage1LiveEnabled は OFF。
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
  /** M1 1a: /api/coalter/invoke で Stage 1 Understand を呼んで response に乗せるか */
  get stage1LiveEnabled(): boolean {
    return envBool("COALTER_STAGE1_LIVE", false);
  },
  /**
   * [CEO lock 2026-04-20 M1 Candidate 2] `stage1NarrationEnabled`
   *   - Stage 1 の todayReading を proposalCard.summary / card.summary に
   *     1 行だけ反映する弁。既定 OFF。
   *   - stage1LiveEnabled と独立。narration 層だけ切り戻したい場面がある。
   *   - outcome が failed の場合は flag に関係なく narration を付けない
   *     (CEO lock: failed を意味あるコピーに見せない)。
   *   - 依存: stage1LiveEnabled = true。snapshot が無い場合は no-op。
   */
  get stage1NarrationEnabled(): boolean {
    return envBool("COALTER_STAGE1_NARRATION", false);
  },
};
