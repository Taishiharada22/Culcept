/**
 * Canonical locationText helpers (Phase 2-D)
 *
 * 設計書: docs/alter-plan-phase2-d-place-picker-mini-design.md §5.4
 *
 * 目的:
 *   Phase 2-D で user が PlaceCandidatesPanel から候補を tap した瞬間、
 *   locationText を **canonical text** に update する。これにより:
 *   - cache key 衝突回避 (W3 解決、同 query で複数 place の上書き防止)
 *   - MapTab pin 精度向上 (canonical text で `place_resolution_cache` cache hit)
 *   - migration なし (ExternalAnchor schema 不変)
 *
 * Format:
 *   `${displayName} · ${formattedAddress}`
 *
 *   例: "スターバックス コーヒー 成田空港第1ターミナル店 · 千葉県成田市古込1番地"
 *
 *   separator は ` · ` (middle dot + 前後空白)。Aneurasync 慣用 (Phase 2-B/2-C で
 *   "今日 · M月D日(曜)" 等で使用)。user の通常 free-text 入力に出現しない、
 *   parse 容易な separator。
 *
 * UI 表示戦略 (GPT 補正、世界トップアプリ標準):
 *   保存値: canonical full text
 *   表示値: displayName を主、address を補足 (smaller / secondary)
 *
 *   理由:
 *   - canonical full は noisy (50+ 文字あり得る)
 *   - Apple Maps / Google Maps / Notion 等の世界トップアプリでは
 *     place name (primary, bold) + address (secondary, gray) の階層表示が標準
 *
 * 不変原則:
 *   - すべて pure (副作用なし、入力 mutate なし)
 *   - server / client 両方で import 可能
 *   - test deterministic
 */

/** canonical separator (middle dot + 前後空白) */
export const CANONICAL_SEPARATOR = " · ";

/** parse-friendly な canonical separator pattern */
const CANONICAL_SPLIT_REGEX = /\s+·\s+/;

/**
 * displayName + formattedAddress を canonical text に format。
 *
 * 例:
 *   formatCanonicalLocationText("スターバックス 成田空港第1ターミナル店", "千葉県成田市古込1番地")
 *   → "スターバックス 成田空港第1ターミナル店 · 千葉県成田市古込1番地"
 *
 *   formatCanonicalLocationText("自宅", null)
 *   → "自宅"
 *
 *   formatCanonicalLocationText("", "千葉県成田市") (= displayName 空)
 *   → "千葉県成田市" (address のみ)
 */
export function formatCanonicalLocationText(
  displayName: string | null | undefined,
  formattedAddress: string | null | undefined,
): string {
  const name = displayName?.trim() ?? "";
  const addr = formattedAddress?.trim() ?? "";
  if (name && addr) return `${name}${CANONICAL_SEPARATOR}${addr}`;
  if (name) return name;
  return addr;
}

/**
 * canonical text を { displayName, address } に parse。
 * canonical 化されていない (= separator なし) text は { displayName: text, address: null }。
 *
 * 例:
 *   parseCanonicalLocationText("スターバックス 成田空港第1ターミナル店 · 千葉県成田市古込1番地")
 *   → { displayName: "スターバックス 成田空港第1ターミナル店", address: "千葉県成田市古込1番地" }
 *
 *   parseCanonicalLocationText("近所のスタバ")  (canonical でない)
 *   → { displayName: "近所のスタバ", address: null }
 *
 *   parseCanonicalLocationText("")
 *   → { displayName: "", address: null }
 */
export function parseCanonicalLocationText(text: string): {
  displayName: string;
  address: string | null;
} {
  const t = text.trim();
  if (!t) return { displayName: "", address: null };
  const parts = t.split(CANONICAL_SPLIT_REGEX);
  if (parts.length < 2) {
    return { displayName: t, address: null };
  }
  // 3+ parts は最初の part を displayName、残りを address として join
  const displayName = parts[0]!.trim();
  const address = parts.slice(1).join(CANONICAL_SEPARATOR).trim();
  return { displayName, address: address || null };
}

/**
 * canonical text かどうかの heuristic check。
 *
 * 判定:
 *   - separator (` · `) を含む
 *   - displayName と address が両方 non-empty
 *
 * 用途:
 *   - Cross-tab 未確定 indicator (Phase 2-D B8): isCanonical=false の anchor に
 *     "🔍 場所未確定" subtle indicator を表示
 *   - MapTab で cache lookup 時の hint
 */
export function isCanonicalLocationText(text: string | null | undefined): boolean {
  if (!text) return false;
  const { displayName, address } = parseCanonicalLocationText(text);
  return !!displayName && !!address;
}

/**
 * UI 表示用に displayName のみ抽出 (CalendarTab / FlowTab / MapTab 共通)。
 *
 * canonical text なら displayName 部分、そうでなければ text そのまま。
 *
 * 用途: Calendar/Flow/Map の anchor row 表示で canonical full を出さず、
 *       displayName のみで visual noise を削減 (GPT 補正、世界トップ pattern)。
 */
export function extractDisplayNameForUI(text: string | null | undefined): string {
  if (!text) return "";
  return parseCanonicalLocationText(text).displayName;
}
