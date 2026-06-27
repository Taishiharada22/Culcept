/**
 * lib/plan/places/localBiasGuard.ts
 *   — Place Local Bias Guard（P12-B・pure・no fetch/no DB）
 *
 * 目的: Places textSearch は prominence（全国知名度）で並ぶため、bias が弱い/無いと
 *   「スタバ」→ 東京の有名店が上位に来る。ユーザーに最も適した（= 入力エリア / 居住地周辺の）
 *   候補を上位へ持ち上げるための 純関数の再ランク。
 *
 * 厳守:
 *   - 追加課金 fetch なし・DB なし・外部 API なし（既に取得済みの候補配列を並べ替えるだけ）。
 *   - 除外でなく降格（再ランク）: 候補を消さず順序だけ変える（空結果化を避ける・graceful）。
 *   - 安定ソート: 同点は Google の元順（relevance）を保持。
 *
 * 優先順位（強い順）:
 *   1. localityHit — ユーザー入力エリア（例 船橋）が name/address に含まれる候補
 *   2. withinRadius — bias 半径内（居住地周辺）
 *   3. distance — bias からの近さ（昇順）
 *   4. 元順（Google relevance）
 */

export interface LocalBiasGuardCandidate {
  readonly name: string;
  readonly address: string | null;
  /** bias からの距離（m）。bias 無し時 null。 */
  readonly distanceMeters: number | null;
}

export interface LocalBiasGuardOpts {
  /** client bias の半径（m）。null/未指定 = bias なし（distance 判定はスキップ）。 */
  readonly biasRadiusMeters?: number | null;
  /** ユーザーが入力した locality/area text（例 船橋）。2 文字未満は無視。 */
  readonly localityText?: string | null;
}

/** locality token が候補の name/address に含まれるか（trim のみの素直な部分一致）。 */
function hasLocality(c: LocalBiasGuardCandidate, locality: string): boolean {
  if (locality.length < 2) return false;
  if (c.name.includes(locality)) return true;
  return (c.address ?? "").includes(locality);
}

/**
 * 候補を local bias で再ランク（純・安定・降格のみ）。
 *   入力配列を変更せず、新しい配列を返す。
 */
export function rankByLocalBias<T extends LocalBiasGuardCandidate>(
  results: readonly T[],
  opts: LocalBiasGuardOpts,
): T[] {
  const locality = (opts.localityText ?? "").trim();
  const radius =
    typeof opts.biasRadiusMeters === "number" && opts.biasRadiusMeters > 0
      ? opts.biasRadiusMeters
      : null;

  return results
    .map((r, i) => {
      const localityHit = hasLocality(r, locality);
      const within =
        radius !== null && r.distanceMeters !== null
          ? r.distanceMeters <= radius
          : null;
      return { r, i, localityHit, within, dist: r.distanceMeters };
    })
    .sort((a, b) => {
      // 1. 入力エリア一致を最優先
      if (a.localityHit !== b.localityHit) return a.localityHit ? -1 : 1;
      // 2. bias 半径内を次に（bias がある時のみ）
      if (a.within !== null && b.within !== null && a.within !== b.within) {
        return a.within ? -1 : 1;
      }
      // 3. bias からの近さ（bias がある時のみ）
      if (a.dist !== null && b.dist !== null && a.dist !== b.dist) {
        return a.dist - b.dist;
      }
      // 4. 元順（Google relevance）を保持
      return a.i - b.i;
    })
    .map((x) => x.r);
}
