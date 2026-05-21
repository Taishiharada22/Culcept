/**
 * Phase 2-H: Category Inference Map
 *
 * 設計書: docs/alter-plan-phase2-h-place-intent-candidate-search-mini-design.md §5
 *
 * 役割:
 *   title (= 予定名) に含まれる keyword から LocationCategory を推定するための mapping。
 *   既存 8 値の LocationCategory enum を維持 (= migration なし、CEO 制約)。
 *
 * 不変原則:
 *   - LocationCategory enum 不変 (= 既存 8 値: home / office / school / cafe / outdoor / public / transit / unknown)
 *   - keyword は本 file で集中保守、拡張容易
 *   - 複数 category にまたがる title (例: ランチ会議) は priority 順 (= 上から evaluate) で判定
 */

import type { LocationCategory } from "@/lib/plan/location-category";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Category 推定用 keyword mapping (priority 順)。
 *
 * 優先順位設計 (= mini design §5.2):
 *   - home が最優先 (= 自宅 / 在宅 keyword は意図明確)
 *   - office (= 仕事系)
 *   - school (= 学習系)
 *   - cafe (= カフェ / コーヒー、Lunch / ランチ も cafe 扱いで近似)
 *   - outdoor (= 屋外活動)
 *   - public (= 商業 / 文化施設)
 *   - transit (= 移動系)
 *   - unknown は明示 mapping せず (= fallback)
 *
 * 注:
 *   - LocationCategory enum に "medical" / "shopping" 等は存在しない (= 8 値固定)
 *   - 「歯医者」 「病院」 は LocationCategory にマップせず null 推定 (= sensitive 候補だが判定保留)
 *   - 「ショッピング」 等の商業活動は public へ map (= 既存 enum の意味的近接)
 */
export const CATEGORY_INFERENCE_KEYWORDS: ReadonlyArray<{
  category: LocationCategory;
  keywords: ReadonlyArray<string>;
}> = [
  // Priority 1: home (自宅系)
  {
    category: "home",
    keywords: ["自宅", "在宅", "リモート", "テレワーク", "ホーム", "家で"],
  },

  // Priority 2: office (仕事系、 会議含む)
  {
    category: "office",
    keywords: [
      "会議",
      "ミーティング",
      "MTG",
      "打ち合わせ",
      "面談",
      "1on1",
      "出社",
      "オフィス",
      "仕事",
      "業務",
      "商談",
    ],
  },

  // Priority 3: school (学習系)
  {
    category: "school",
    keywords: [
      "授業",
      "講義",
      "学校",
      "塾",
      "セミナー",
      "勉強会",
      "ワークショップ",
      "研修",
      "登校",
    ],
  },

  // Priority 4: cafe (カフェ系、Lunch / ランチ も含める = 飲食店として cafe に近似)
  {
    category: "cafe",
    keywords: [
      "カフェ",
      "コーヒー",
      "スタバ",
      "ベローチェ",
      "ドトール",
      "喫茶",
      "茶店",
      "作業",
      "ランチ",
      "ディナー",
      "夕食",
      "昼食",
      "Lunch",
      "Dinner",
      "Brunch",
    ],
  },

  // Priority 5: outdoor (屋外活動)
  {
    category: "outdoor",
    keywords: [
      "散歩",
      "ウォーキング",
      "ジョギング",
      "ランニング",
      "公園",
      "登山",
      "ハイキング",
      "ピクニック",
      "サイクリング",
      "外で",
    ],
  },

  // Priority 6: public (商業 / 文化施設、ショッピング / 映画 / 美術館 等)
  {
    category: "public",
    keywords: [
      "ショッピング",
      "買い物",
      "デパート",
      "モール",
      "映画",
      "シネマ",
      "ライブ",
      "コンサート",
      "美術館",
      "博物館",
      "図書館",
      "展示",
      "イベント",
    ],
  },

  // Priority 7: transit (移動系)
  {
    category: "transit",
    keywords: ["移動", "電車", "新幹線", "飛行機", "空港", "出張", "通勤", "通学"],
  },
];
