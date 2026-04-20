/**
 * Travel Time Table — 3層の移動時間推定テーブル
 *
 * Layer 0: 同一地点 (0分) / 同一エリア (5-15分)
 * Layer 1: カテゴリ別デフォルト (15分) — travelTimeEngine.ts の既存テーブルと連携
 * Layer 2: 都市エリア間マトリクス (~20主要エリア + 都道府県フォールバック)
 *
 * CEO方針: start minimal。精度よりも「移動時間がゼロでなくなる」ことが最大の改善。
 * エリア名はユーザー入力のテキストから推定する（正確な住所は不要）。
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 0: 同一地点 / 同一エリア判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 2つの場所が同一地点かどうか判定する。
 * canonicalId が同じなら同一地点。
 */
export function isSamePoint(fromId?: string, toId?: string): boolean {
  if (!fromId || !toId) return false;
  return fromId === toId;
}

/**
 * 2つの場所が同一エリアかどうか判定する。
 * 同一エリア内の移動は徒歩 5-15分。
 *
 * 判定ロジック:
 * - 両方にエリア名が含まれていて一致 → 同一エリア
 * - テキストヒントに「近くの」「すぐ」「隣の」が含まれる → 同一エリア
 */
export function isSameArea(
  fromLabel?: string,
  toLabel?: string,
  textHint?: string
): boolean {
  if (textHint && /近く|すぐ|隣|向かい|同じビル|同じ通り/.test(textHint)) {
    return true;
  }
  if (!fromLabel || !toLabel) return false;
  // 同じエリア名を含む（「渋谷のスタバ」と「渋谷のマック」）
  const fromArea = extractAreaName(fromLabel);
  const toArea = extractAreaName(toLabel);
  if (fromArea && toArea && fromArea === toArea) return true;
  return false;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 2: 都市エリア間マトリクス（電車での移動時間 in 分）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 主要エリア間の電車移動時間（分）。
 * 乗り換え・徒歩込みの実効時間。
 *
 * キーは `${from}→${to}`（方向なし: 小さい方→大きい方で正規化）
 */
const AREA_MATRIX: Record<string, number> = {
  // 東京都心エリア
  "渋谷→新宿": 8,
  "渋谷→池袋": 20,
  "渋谷→東京": 20,
  "渋谷→品川": 12,
  "渋谷→六本木": 10,
  "渋谷→表参道": 5,
  "渋谷→恵比寿": 3,
  "渋谷→原宿": 5,
  "渋谷→下北沢": 5,
  "渋谷→中目黒": 5,
  "新宿→池袋": 10,
  "新宿→東京": 15,
  "新宿→品川": 20,
  "新宿→六本木": 15,
  "新宿→吉祥寺": 18,
  "新宿→立川": 30,
  "新宿→町田": 35,
  "池袋→東京": 20,
  "池袋→上野": 20,
  "東京→品川": 10,
  "東京→上野": 8,
  "東京→秋葉原": 5,
  "品川→横浜": 20,
  "品川→羽田": 15,
  // 横浜エリア
  "横浜→川崎": 10,
  "横浜→みなとみらい": 5,
  // 大阪エリア
  "梅田→難波": 10,
  "梅田→天王寺": 18,
  "梅田→心斎橋": 12,
  "梅田→京都": 30,
  "梅田→三宮": 25,
  "難波→天王寺": 10,
  "難波→心斎橋": 3,
  // 名古屋エリア
  "名古屋→栄": 5,
  "名古屋→金山": 5,
  // 福岡エリア
  "博多→天神": 5,
  // 札幌エリア
  "札幌→すすきの": 5,
  "札幌→大通": 3,
};

/**
 * 都道府県間の電車移動時間（分）のフォールバック。
 * AREA_MATRIX に該当エリアがない場合に使用。
 */
const PREFECTURE_FALLBACK: Record<string, number> = {
  // 近隣都道府県（新幹線なし）
  "東京→神奈川": 35,
  "東京→千葉": 40,
  "東京→埼玉": 35,
  "大阪→京都": 30,
  "大阪→兵庫": 25,
  "大阪→奈良": 35,
  "愛知→岐阜": 25,
  "愛知→三重": 40,
  "福岡→佐賀": 45,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// エリア名抽出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 主要エリア名リスト（AREA_MATRIX のキーから自動生成） */
const KNOWN_AREAS: string[] = (() => {
  const areas = new Set<string>();
  for (const key of Object.keys(AREA_MATRIX)) {
    const [from, to] = key.split("→");
    areas.add(from);
    areas.add(to);
  }
  return Array.from(areas).sort((a, b) => b.length - a.length); // 長い名前から優先マッチ
})();

/**
 * テキストからエリア名を抽出する。
 * 「渋谷のスタバ」→ "渋谷"、「新宿駅前のマック」→ "新宿"
 */
function extractAreaName(text: string): string | null {
  for (const area of KNOWN_AREAS) {
    if (text.includes(area)) return area;
  }
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メイン API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 2つの場所間の移動時間を推定する（3層統合）。
 *
 * Layer 0: 同一地点 → 0分 / 同一エリア → 7分
 * Layer 2: AREA_MATRIX にヒット → その値
 * Layer 1: フォールバック（既存の travelTimeEngine に委譲）→ null
 *
 * @returns 移動時間（分）。Layer 1 にフォールバックする場合は null。
 */
export function lookupTravelTime(
  fromLabel: string,
  toLabel: string,
  fromId?: string,
  toId?: string,
  textHint?: string,
): number | null {
  // Layer 0: 同一地点
  if (isSamePoint(fromId, toId)) return 0;

  // Layer 0: 同一エリア
  if (isSameArea(fromLabel, toLabel, textHint)) return 7;

  // Layer 2: エリアマトリクス
  const fromArea = extractAreaName(fromLabel);
  const toArea = extractAreaName(toLabel);
  if (fromArea && toArea && fromArea !== toArea) {
    // 正順・逆順の両方をチェック
    const key1 = `${fromArea}→${toArea}`;
    const key2 = `${toArea}→${fromArea}`;
    if (AREA_MATRIX[key1] !== undefined) return AREA_MATRIX[key1];
    if (AREA_MATRIX[key2] !== undefined) return AREA_MATRIX[key2];
  }

  // Layer 1: 既存テーブルにフォールバック（呼び出し元で処理）
  return null;
}
