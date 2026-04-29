/**
 * CoAlter Stage 4 B-2.2 — Critical Keyword Detector
 *
 * 正本: layout plan v0.3 §7.4 / runtime contract §1.1 critical signal / UI spec §8.5
 *
 * PresenceSignalWiring (本番 ChatClient に既に wire 済) で message 増分を検出した
 * 際に、本文 (body) に明確な危険・緊急・暴言系 keyword が含まれるかを判定する純関数。
 *
 * 設計方針 (CEO 確定 2026-04-29):
 *   - **過剰発火禁止**: 曖昧な不満・軽い違和感では critical を出さない
 *   - **明確な keyword のみ**: false positive 排除を最優先
 *   - **B-2 範囲限定**: explicit / mention / chip tap signal は本 module 範疇外
 *     (B-2 では implicit + critical の 2 種のみ)
 *
 * trigger 命名規約 (urgentTrigger.inferCategory との整合):
 *   - "rupture" を含む trigger 名 → rupture_detected category
 *   - "safety" を含む trigger 名 → safety_concern category
 *   - "heat" を含む trigger 名 → heat_escalation category
 *   - その他 → heat_escalation (default)
 *
 * 不可侵原則:
 *   - 純関数 (副作用ゼロ、test 容易)
 *   - regex は word boundary を持たない場合があるが、明確 keyword のみなので
 *     誤マッチは限定的。曖昧 keyword (「ばか」「クソ」等の軽暴言) は除外
 */

/**
 * Critical keyword 検出結果。
 *
 * matchedPattern は test 用の debug 情報、production logic では使わない。
 */
export interface CriticalDetection {
  /** urgentTrigger.inferCategory が読み取る trigger 名 */
  trigger: string;
  /** test 用 debug 情報 (どの pattern が hit したか) */
  matchedPattern: string;
}

/**
 * 検出 pattern 一覧。順序は優先度 (上位ほど早期 return)。
 *
 * **追加時は必ず CEO 確認を経る** (false positive リスク評価)。
 *
 * 現在 set (B-2 初期):
 *   1. 自傷系 (safety_concern)
 *   2. 攻撃性 (rupture_detected)
 *   3. 限界 sign (rupture_detected)
 *
 * 除外した keyword (false positive リスク高):
 *   - 「ばか」「あほ」 — 自虐表現で頻出 (例: "ばかだなあ自分")
 *   - 「クソ」 — 慣用表現で頻出 (例: "クソゲー" "クソ寒い")
 *   - 「ふざけるな」 — 文脈依存 (例: ジョークの返し)
 */
const CRITICAL_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  trigger: string;
  matchedPattern: string;
}> = [
  // 自傷・命に関わる sign (safety_concern)
  // - 「死にたい」「消えたい」「きえたい」
  {
    pattern: /(死にたい|消えたい|きえたい)/,
    trigger: "safety_violation",
    matchedPattern: "safety:self-harm",
  },
  // 攻撃性 sign (rupture_detected)
  // - 明確な暴言/敵意の表現のみ
  {
    pattern: /(死ね|殺す|消えろ)/,
    trigger: "rupture_detected",
    matchedPattern: "rupture:hostility",
  },
  // 限界 sign (rupture_detected)
  // - 関係性 rupture を予兆する明確な拒絶
  {
    pattern: /(もう限界|もう無理|もうやだ)/,
    trigger: "rupture_detected",
    matchedPattern: "rupture:limit",
  },
];

/**
 * テキストに critical keyword が含まれるか判定。
 *
 * @param text 判定対象 (messages[last].body 等)
 * @returns 検出結果 (なければ null)
 *
 * 不可侵: 純関数、副作用なし、入力 text は変更しない。
 */
export function detectCriticalKeyword(
  text: string | null | undefined,
): CriticalDetection | null {
  if (text == null || text === "") return null;
  if (typeof text !== "string") return null;
  for (const { pattern, trigger, matchedPattern } of CRITICAL_PATTERNS) {
    if (pattern.test(text)) {
      return { trigger, matchedPattern };
    }
  }
  return null;
}

/**
 * 検出 pattern 一覧の export (test / audit 用、production logic では使わない)。
 *
 * pattern 数の網羅性 test 等で使用。
 */
export function getCriticalPatternCount(): number {
  return CRITICAL_PATTERNS.length;
}
