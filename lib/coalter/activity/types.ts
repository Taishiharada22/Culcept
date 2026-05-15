/**
 * CoAlter Activity Domain — Pure Domain Types (AD1 phase)
 *
 * 正本:
 *   - docs/coalter-activity-domain-mapping.md (PR #126、design completion)
 *   - docs/coalter-master-design.md v1.2 §13.4 (Activity reflection)
 *
 * 役割:
 *   PR #126 (Activity domain mapping、7 軸 Taxonomy + Daily 内軽量 outing MVP) の
 *   AD1 phase = **pure types only**。runtime function / detector / parser /
 *   generator / constants は **含まない** (CEO 新スピードルール、Batch-C 制約)。
 *
 * MVP scope (Master Design v1.2 §13.4、PR #126):
 *   - Daily mode 内 軽量 outing 提案
 *   - 1-3 時間程度 (short + medium)、近距離
 *   - 2-3 案、4 軸評価 (fatigue / cost / novelty / weather)
 *   - 予約しない (合意までの議論支援)
 *   - food / movie / travel に該当するものは **各 domain handoff** (本 type 内 comment 明示)
 *
 * Activity の構造的位置づけ:
 *   - food / movie / travel に該当しない、user 日常選択として重要な独自カテゴリ
 *   - 残余カテゴリではなく **独自定義** (PR #126 §1.3)
 *
 * 既存 Phase B `ActivityCandidate` (lib/coalter/types.ts:480+) との関係:
 *   - Phase B 既存 = 「提案単位 wrapper」、Phase B 三段式 framework 内の共通 type
 *   - 本 type `ActivityCandidate` = **ConversationTheme="activity"** の domain orchestrator 用
 *   - 別概念だが impl 時に既存 wrapper を base として再利用可能 (AD3 phase で検討)
 *   - 本 PR では re-export しない、別 namespace で型定義
 *
 * 本 PR の不可触 (Batch-C 制約):
 *   - runtime function / detector / parser / scorer / generator / validator
 *   - constants array
 *   - orchestrator connection / route / API / env
 *   - 既存 file touch
 */

// ─────────────────────────────────────────────
// 7 軸 Taxonomy (PR #126 §2.1)
// ─────────────────────────────────────────────

/**
 * 軸 A: indoor / outdoor / hybrid.
 *
 * 例:
 *   - indoor: 美術館 / カフェ / 映画館 (movie domain との handoff 検討)
 *   - outdoor: 公園散歩 / 神社参拝 / 街歩き
 *   - hybrid: shopping mall (屋根あり + 大きい施設)
 */
export type ActivityIndoorOutdoor = "indoor" | "outdoor" | "hybrid";

/**
 * 軸 B: duration band.
 *
 * MVP scope (Daily 軽量 outing):
 *   - short: 1h 以下 (カフェ滞在 / 短い散歩)
 *   - medium: 1-3h (美術館 / 公園 / 軽い hike)
 *
 * future scope (本 MVP では含めない):
 *   - half_day: 3-6h (動物園 / 終日観光、travel domain との handoff 検討)
 */
export type ActivityDurationBand = "short" | "medium" | "half_day";

/**
 * 軸 C: cost band.
 *
 * 単位: 円。
 *   - free: 無料 (公園 / 散歩 / 神社参拝 等)
 *   - low: ~1k (カフェ / 軽食)
 *   - medium: 1-5k (美術館 / イベント)
 *   - high: 5k+ (演劇 / コンサート、MVP では基本回避)
 */
export type ActivityCostBand = "free" | "low" | "medium" | "high";

/**
 * 軸 D: weather dependency.
 *
 * MVP では晴 / 雨 / 曇の 3 値判定 (weather forecast API は future).
 *   - weather_dependent: 屋外、雨天 fallback 必要
 *   - weather_independent: 屋内、天候不問
 */
export type ActivityWeatherDependency = "weather_dependent" | "weather_independent";

/**
 * 軸 E: pair compatibility.
 *
 *   - solo_friendly: 1 人でも OK (読書 / 個人趣味)
 *   - pair_compatible: 2 人で行ける + 1 人でも OK (散歩 / カフェ)
 *   - explicitly_pair: 2 人前提 (cooking class / 料理体験)
 */
export type ActivityPairCompatibility = "solo_friendly" | "pair_compatible" | "explicitly_pair";

/**
 * 軸 F: novelty level (PR #126 Idea 4 + Idea 13).
 *
 *   - routine: 馴染みの場所 (毎週通うカフェ)
 *   - familiar: 知っている場所 (前に行った美術館)
 *   - novelty: 新規 (初めての街歩き)
 */
export type ActivityNoveltyLevel = "routine" | "familiar" | "novelty";

/**
 * 軸 G: fatigue level (PR #126 Idea 1 Fatigue-aware Selection).
 *
 * Scale (Travel と同 1-5 scale、共通体系):
 *   - 1: very low (カフェ滞在)
 *   - 2: low (散歩 / 短時間滞在)
 *   - 3: medium (美術館 / 街歩き)
 *   - 4: high (一日 activity)
 *   - 5: very high (long hike、MVP では基本回避)
 */
export type ActivityFatigueLevel = 1 | 2 | 3 | 4 | 5;

// ─────────────────────────────────────────────
// ActivityTaxonomy: 7 軸の組合せ
// ─────────────────────────────────────────────

/**
 * Activity Taxonomy: 7 軸 categorical space で activity を構造化 (PR #126 §2.1).
 *
 * MVP では 4 軸評価 (fatigue / cost / novelty / weather) を中心に、7 軸全 tag は
 * future phase で本格活用。
 */
export interface ActivityTaxonomy {
  indoorOutdoor: ActivityIndoorOutdoor;
  durationBand: ActivityDurationBand;
  costBand: ActivityCostBand;
  weatherDependency: ActivityWeatherDependency;
  pairCompatibility: ActivityPairCompatibility;
  noveltyLevel: ActivityNoveltyLevel;
  fatigueLevel: ActivityFatigueLevel;
}

// ─────────────────────────────────────────────
// ActivityRationale: 候補理由 (PR #126 Idea 8 Explanation)
// ─────────────────────────────────────────────

/**
 * Activity candidate の rationale.
 *
 * **PII 不含 caller 責任**: 本 type は format のみ規定、raw user preference text
 * を保存しないこと (caller / runtime layer 責任、本 type comment で明示)。
 */
export interface ActivityRationale {
  /**
   * user A 視点 (PII 不含 caller 責任、normalized 説明のみ).
   *
   * 例: "outdoor walking preference, low fatigue today"
   */
  perUserA: string;
  /** user B 視点 (同上) */
  perUserB: string;
  /** 統合理由 (二人合意点) */
  synthesis: string;
}

// ─────────────────────────────────────────────
// ActivityUncertaintyLabel: 不確実性 (Travel と共通 4 段階)
// ─────────────────────────────────────────────

/**
 * 不確実性 label (PR #126 で言及、Travel と共通体系 = 4 段階).
 *
 * Travel `TravelUncertaintyLabel` と独立した type だが、value space は同じ。
 * 将来 (Master Design v1.3 等) で共通 `CoalterUncertaintyLabel` に整理可能性あり、
 * 本 PR では type 分離維持 (cross-domain 結合避ける)。
 */
export type ActivityUncertaintyLabel =
  | "high_confidence"
  | "mid_confidence"
  | "low_confidence"
  | "info_lacking";

// ─────────────────────────────────────────────
// ActivityCandidate: 提案単位 (Daily 軽量 outing MVP)
// ─────────────────────────────────────────────

/**
 * Activity candidate.
 *
 * **重要 (PR #126 §1.2 既存 Phase B との関係)**:
 *   - 既存 `ActivityCandidate` (lib/coalter/types.ts:480+) は **Phase B 三段式
 *     framework の共通 wrapper**、本 type とは **別概念**
 *   - 本 type = ConversationTheme="activity" の domain orchestrator が扱う candidate
 *   - 別 namespace で型定義、re-export しない (本 PR スコープ)
 *   - AD3 phase impl 時に Phase B wrapper を base として再利用検討
 *
 * MVP scope (Daily 内軽量 outing):
 *   - 1-3 時間程度 (durationBand: short or medium)
 *   - 近距離 (場所 metadata は caller 責任)
 *   - 7 軸 taxonomy 全 tag、ただし 4 軸評価 (fatigue / cost / novelty / weather) 中心
 *
 * Domain boundary (PR #126 §4.3):
 *   - cafe = food 先勝ち (本 type 範囲外)
 *   - 映画館 = movie 先勝ち (本 type 範囲外、ただし「映画館への activity 移動」は本 type)
 *   - 1-2 泊旅行 = travel mode 先勝ち
 *   - 関係話題 = Action Mode (clarify / negotiate) 先勝ち
 *   - 上記いずれも該当しない → activity default
 */
export interface ActivityCandidate {
  candidateId: string;
  /**
   * 短い活動名 (caller 抽出済の normalized 説明、PII 不含).
   *
   * 例: "park walk" / "neighborhood cafe" / "art museum".
   *
   * 注: raw user text / raw place name を保存しない (caller 責任で normalize).
   */
  name: string;
  taxonomy: ActivityTaxonomy;
  rationale: ActivityRationale;
  uncertaintyLabel: ActivityUncertaintyLabel;
}

// ─────────────────────────────────────────────
// ActivityHandoffTarget: Activity から他 domain への委譲先 (PR #126 §4.4)
// ─────────────────────────────────────────────

/**
 * Activity の途中で他 domain 該当が判明した場合の handoff target (PR #126 §4.4).
 *
 * Daily planner が dispatch 中に keyword 検出した場合、activity → 他 domain
 * への handoff を decide:
 *   - food: cafe / restaurant 系
 *   - movie: 映画館
 *   - travel: 1-2 泊以上の旅行 mode escalation
 *
 * 本 type は handoff event の format のみ規定、actual handoff logic は AD2/AD3 phase。
 */
export type ActivityHandoffTarget = "food" | "movie" | "travel";

// ─────────────────────────────────────────────
// Future scope (型に含めない、reader への明示):
// ─────────────────────────────────────────────
//
// - half-day 以上の activity (4 時間以上、travel mode escalate 検討)
// - 遠出 activity (近距離以外、travel domain に統合)
// - Google Places / OpenStreetMap 接続 (location metadata 拡張)
// - 天候 forecast API (weather_dependent の actual forecast)
// - 予約連携 (動物園 / 美術館 / イベント等)
// - Schedule / Gift domain との handoff
// - Curated activity templates (PR #126 Idea 12 library、AD3 phase impl)
// - Activity affinity map 4D (time × energy × weather × mood、AD4 phase)
//
// → これらは本 MVP では含めない、future PR で追加 (各 phase AD2-AD6 + future)。
