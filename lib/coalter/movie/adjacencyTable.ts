/**
 * CoAlter Stage 3 Resolve (movie) — Adjacency Table (主要 50 駅)
 *
 * 三段式 §2.4.1 / mainstream plan §3.3 元 D-3-b / handover §6 D-2-b /
 * D-2 設計レビュー §3.2.
 *
 * Concentric Area Expansion (Tier 0 → Tier 1 → Tier 2、`areaExpansion.ts`) で
 * 使用する **静的 adjacency データ**。Tier 0 (ユーザー指定 area) で劇場が見つから
 * ない時、Tier 1 として隣接 area を試行する。
 *
 * 範囲 (CEO 採用 A2 主要 50 駅、本セッション 2026-05-11):
 *   - 関東 30 駅 (山手線 + 主要乗り換え + 横浜 / 大宮 / 千葉 周辺)
 *   - 関西 15 駅 (大阪 / 京都 / 神戸 主要)
 *   - 名古屋 5 駅
 *
 * 各駅の隣接基準 (三段式 §2.4.1):
 *   - 物理近接 (3km 以内、徒歩 + バス + 短距離移動)
 *   - 同路線 2 駅以内 (山手線 / 中央線 / 東海道線 等の主要乗り換え)
 *   - 各駅 3-5 個の隣接 (過剰隣接防止 + Tier 1 cost 制御)
 *
 * 構造 invariant (test で verify):
 *   - 50 駅収録 (string key unique)
 *   - 対称性: A の neighbors に B が含まれれば、B の neighbors にも A が含まれる
 *   - 自己参照禁止: 駅 X の neighbors に X 自身は含まれない
 *   - 各駅 neighbors 数: 3-5 (上下限)
 *   - 孤立参照禁止: neighbors の各駅も ADJACENCY_TABLE の key として存在
 *
 * 拡張方針 (Step E 別審議):
 *   - Step E 観測で「Tier 1 拡張で空振りが多い駅」が判明したら adjacency を
 *     強化 (例: 新宿 → 池袋 を追加)
 *   - 全国網羅は overkill、Step E 観測値ベースで段階拡張
 */

/**
 * 主要 50 駅 × 隣接駅 (cluster 設計、50 駅内 closure + 対称性担保)。
 *
 *   - 各 key: 駅名 (日本語、ユーザー area 文字列と一致)
 *   - 各 value: 隣接駅一覧 (各駅 2-5 個、すべて 50 駅 key 内に閉じる)
 *
 * Cluster 構造 (50 駅内で closure 担保):
 *   - 副都心 cluster (11): 渋谷ハブ、cluster 内相互隣接
 *   - 都心 cluster (8): 東京ハブ、cluster 内相互隣接
 *   - 多摩 (1=町田): 副都心 cluster と接続
 *   - 横浜 cluster (4): 横浜ハブ
 *   - 埼玉 cluster (3): 大宮ハブ、副都心 (池袋) + 都心 (北千住) と接続
 *   - 千葉 cluster (3): 都心 (錦糸町, 北千住) と接続
 *   - 大阪 cluster (6): 梅田ハブ
 *   - 京都 cluster (3) / 神戸 cluster (3) / 関西郊外 (3)
 *   - 名古屋 cluster (5)
 *
 * 対称性は構造 invariant test で verify (A の neighbors に B が含まれれば
 * B の neighbors にも A が含まれる)。
 */
export const ADJACENCY_TABLE: Readonly<Record<string, readonly string[]>> = {
  // ──────── 関東 30 駅 ────────
  // 副都心 cluster (11)
  渋谷: ["新宿", "表参道", "恵比寿", "原宿", "下北沢"],
  新宿: ["渋谷", "池袋", "中野", "原宿"],
  池袋: ["新宿", "中野", "大宮", "浦和"],
  中野: ["新宿", "池袋", "下北沢", "吉祥寺", "立川"],
  原宿: ["渋谷", "新宿", "表参道"],
  表参道: ["渋谷", "原宿", "六本木"],
  恵比寿: ["渋谷", "六本木", "品川"],
  下北沢: ["渋谷", "中野", "吉祥寺"],
  吉祥寺: ["中野", "立川", "下北沢"],
  立川: ["吉祥寺", "町田", "中野"],
  六本木: ["表参道", "恵比寿", "銀座"],
  // 都心 cluster (8)
  東京: ["銀座", "秋葉原", "品川", "上野"],
  銀座: ["東京", "秋葉原", "六本木", "豊洲"],
  秋葉原: ["東京", "銀座", "上野", "錦糸町"],
  上野: ["秋葉原", "東京", "北千住"],
  品川: ["東京", "横浜", "恵比寿"],
  北千住: ["上野", "錦糸町", "川口", "柏"],
  錦糸町: ["秋葉原", "北千住", "豊洲", "千葉", "船橋"],
  豊洲: ["銀座", "錦糸町"],
  // 多摩 (1)
  町田: ["立川", "川崎", "横浜"],
  // 横浜 cluster (4)
  横浜: ["みなとみらい", "川崎", "武蔵小杉", "品川", "町田"],
  みなとみらい: ["横浜", "川崎", "武蔵小杉"],
  川崎: ["横浜", "みなとみらい", "武蔵小杉", "町田"],
  武蔵小杉: ["横浜", "川崎", "みなとみらい"],
  // 埼玉 cluster (3)
  大宮: ["浦和", "川口", "池袋"],
  浦和: ["大宮", "川口", "池袋"],
  川口: ["大宮", "浦和", "北千住"],
  // 千葉 cluster (3)
  千葉: ["船橋", "柏", "錦糸町"],
  船橋: ["千葉", "柏", "錦糸町"],
  柏: ["千葉", "船橋", "北千住"],
  // ──────── 関西 15 駅 ────────
  // 大阪 cluster (6)
  梅田: ["難波", "心斎橋", "京橋", "西宮北口", "尼崎"],
  難波: ["梅田", "心斎橋", "天王寺", "京橋", "阿倍野"],
  心斎橋: ["梅田", "難波", "京橋"],
  天王寺: ["難波", "阿倍野", "京橋"],
  京橋: ["梅田", "心斎橋", "難波", "天王寺"],
  阿倍野: ["天王寺", "難波"],
  // 京都 cluster (3)
  京都: ["四条河原町", "烏丸", "高槻"],
  四条河原町: ["京都", "烏丸"],
  烏丸: ["京都", "四条河原町", "高槻"],
  // 神戸 cluster (3)
  三宮: ["元町", "神戸", "西宮北口"],
  元町: ["三宮", "神戸"],
  神戸: ["三宮", "元町", "尼崎"],
  // 関西郊外 (3)
  西宮北口: ["梅田", "三宮", "尼崎"],
  尼崎: ["神戸", "西宮北口", "梅田"],
  高槻: ["京都", "烏丸"],
  // ──────── 名古屋 5 駅 ────────
  名古屋: ["栄", "金山", "千種"],
  栄: ["名古屋", "金山", "千種", "大曽根"],
  金山: ["名古屋", "栄", "千種"],
  大曽根: ["栄", "千種"],
  千種: ["名古屋", "栄", "金山", "大曽根"],
};

/**
 * Region 区分 (test 用、構造 invariant verify)。
 *
 *   各駅がどの region に属するかを記録。test で各 region の駅数を verify する。
 */
export const STATION_REGION: Readonly<Record<string, "kanto" | "kansai" | "nagoya">> = {
  // 関東 30
  渋谷: "kanto",
  新宿: "kanto",
  池袋: "kanto",
  銀座: "kanto",
  六本木: "kanto",
  上野: "kanto",
  秋葉原: "kanto",
  東京: "kanto",
  品川: "kanto",
  恵比寿: "kanto",
  表参道: "kanto",
  原宿: "kanto",
  下北沢: "kanto",
  中野: "kanto",
  吉祥寺: "kanto",
  立川: "kanto",
  町田: "kanto",
  横浜: "kanto",
  みなとみらい: "kanto",
  川崎: "kanto",
  武蔵小杉: "kanto",
  大宮: "kanto",
  浦和: "kanto",
  川口: "kanto",
  千葉: "kanto",
  船橋: "kanto",
  柏: "kanto",
  北千住: "kanto",
  錦糸町: "kanto",
  豊洲: "kanto",
  // 関西 15
  梅田: "kansai",
  難波: "kansai",
  心斎橋: "kansai",
  天王寺: "kansai",
  京橋: "kansai",
  阿倍野: "kansai",
  京都: "kansai",
  四条河原町: "kansai",
  烏丸: "kansai",
  三宮: "kansai",
  元町: "kansai",
  神戸: "kansai",
  西宮北口: "kansai",
  尼崎: "kansai",
  高槻: "kansai",
  // 名古屋 5
  名古屋: "nagoya",
  栄: "nagoya",
  金山: "nagoya",
  大曽根: "nagoya",
  千種: "nagoya",
};

/**
 * 指定 area の隣接 area 一覧を取得する pure function。
 *
 *   - area が ADJACENCY_TABLE に存在しない → 空配列
 *   - 存在する → readonly array (mutation 禁止)
 */
export function getAdjacentAreas(area: string): readonly string[] {
  return ADJACENCY_TABLE[area] ?? [];
}

/**
 * ADJACENCY_TABLE 全駅一覧 (順序は object key insertion order)。
 * test の構造 invariant verify で使用。
 */
export function getAllAreas(): readonly string[] {
  return Object.keys(ADJACENCY_TABLE);
}
