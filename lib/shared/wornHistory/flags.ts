/**
 * shared WornHistory runtime flags（Phase 5-C: engine read 切替の弁）
 *
 * `engineReadsCorpus`: engine が shared WornHistory 由来 input（learningCorpus / entries）を読むか。 既定 false。
 *   - engine は /plan・/calendar とも **client 実行** → flag は client で評価される。
 *     webpack DefinePlugin は `process.env.NEXT_PUBLIC_X`（直接 member access）のみ build 置換するため、
 *     client 可視には `NEXT_PUBLIC_` + 直接 member access が必須（`lib/coalter/flags.ts` と同教訓）。
 *   - **override 引数を最優先**（call-site 制御 / test）。 未設定・空・不正値は false。
 *   - 5-C1 では「作るだけ」。 engine 未接続のため ON 運用しない。
 */

/** 値ベースの bool 正規化（未設定・空・不正値は fallback）。 */
function normalizeBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return fallback;
}

export const WORN_HISTORY_FLAGS = {
  /**
   * engine が shared WornHistory 由来 input を読むか。 既定 false。
   *   - override が boolean ならそれを優先（test / call-site）。
   *   - それ以外は `NEXT_PUBLIC_WORN_HISTORY_ENGINE_READS_CORPUS`（client 可視・直接 member access）。
   */
  engineReadsCorpus(override?: boolean): boolean {
    if (typeof override === "boolean") return override;
    return normalizeBool(process.env.NEXT_PUBLIC_WORN_HISTORY_ENGINE_READS_CORPUS, false);
  },
};
