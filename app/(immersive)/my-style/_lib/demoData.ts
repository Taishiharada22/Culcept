import type { WardrobeItem, SavedSetup, SavedState, ColorPrefs } from "./types";

// ---------------------------------------------------------------------------
// 12 demo wardrobe items -- stylish Japanese male wardrobe
// ---------------------------------------------------------------------------

export const DEMO_WARDROBE: WardrobeItem[] = [
  // ── Outerwear ──
  {
    id: "demo-outer-01",
    name: "ネイビーウールチェスターコート",
    category: "outerwear",
    categoryMain: "outer",
    subcategory: "subcategory.coat",
    color: "navy",
    colorName: "ネイビー",
    colorHex: "#1e2a4a",
    season: "aw",
    thickness: "thick",
    formality: "smart",
    materialFamily: ["wool", "cashmere-blend"],
    surfaceFinish: ["melton"],
    drape: "structured",
    silhouette: "regular",
    pattern: "solid",
    addedAt: "2026-01-15T10:00:00Z",
  },
  {
    id: "demo-outer-02",
    name: "オリーブMA-1ブルゾン",
    category: "outerwear",
    categoryMain: "outer",
    subcategory: "subcategory.blouson",
    color: "olive",
    colorName: "オリーブ",
    colorHex: "#556b2f",
    season: "aw",
    thickness: "mid",
    formality: "casual",
    materialFamily: ["nylon"],
    surfaceFinish: ["matte"],
    drape: "structured",
    silhouette: "regular",
    pattern: "solid",
    addedAt: "2026-01-20T10:00:00Z",
  },

  // ── Tops ──
  {
    id: "demo-tops-01",
    name: "白クルーネックTシャツ",
    category: "tops",
    categoryMain: "tops",
    subcategory: "subcategory.tee",
    color: "white",
    colorName: "ホワイト",
    colorHex: "#f8f8f8",
    season: "all",
    thickness: "thin",
    formality: "casual",
    materialFamily: ["cotton"],
    surfaceFinish: ["smooth"],
    drape: "balanced",
    silhouette: "regular",
    pattern: "solid",
    addedAt: "2026-01-10T10:00:00Z",
  },
  {
    id: "demo-tops-02",
    name: "サックスブルーオックスフォードシャツ",
    category: "tops",
    categoryMain: "tops",
    subcategory: "subcategory.shirt",
    color: "light-blue",
    colorName: "サックスブルー",
    colorHex: "#6a9ec2",
    season: "all",
    thickness: "mid",
    formality: "smart",
    materialFamily: ["cotton"],
    surfaceFinish: ["oxford"],
    drape: "structured",
    silhouette: "regular",
    pattern: "solid",
    addedAt: "2026-01-12T10:00:00Z",
  },
  {
    id: "demo-tops-03",
    name: "グレーメリノウールクルーニット",
    category: "tops",
    categoryMain: "tops",
    subcategory: "subcategory.knit",
    color: "gray",
    colorName: "ミディアムグレー",
    colorHex: "#7a7a7a",
    season: "aw",
    thickness: "mid",
    formality: "smart",
    materialFamily: ["wool"],
    surfaceFinish: ["smooth"],
    drape: "balanced",
    silhouette: "regular",
    pattern: "solid",
    knitProfile: { gauge: "high", type: "jersey" },
    addedAt: "2026-01-18T10:00:00Z",
  },
  {
    id: "demo-tops-04",
    name: "ボーダーバスクシャツ",
    category: "tops",
    categoryMain: "tops",
    subcategory: "subcategory.tee",
    color: "white-navy",
    colorName: "生成り×ネイビー",
    colorHex: "#f0ead6",
    season: "ss",
    thickness: "mid",
    formality: "casual",
    materialFamily: ["cotton"],
    surfaceFinish: ["smooth"],
    drape: "balanced",
    silhouette: "regular",
    pattern: "stripe",
    addedAt: "2026-02-01T10:00:00Z",
  },

  // ── Bottoms ──
  {
    id: "demo-bottoms-01",
    name: "インディゴストレートデニム",
    category: "bottoms",
    categoryMain: "bottoms",
    subcategory: "subcategory.denim",
    color: "indigo",
    colorName: "インディゴ",
    colorHex: "#2b3a67",
    season: "all",
    thickness: "mid",
    formality: "casual",
    materialFamily: ["cotton", "denim"],
    surfaceFinish: ["twill"],
    drape: "structured",
    silhouette: "regular",
    pattern: "solid",
    addedAt: "2026-01-08T10:00:00Z",
  },
  {
    id: "demo-bottoms-02",
    name: "チャコールウールスラックス",
    category: "bottoms",
    categoryMain: "bottoms",
    subcategory: "subcategory.slacks",
    color: "charcoal",
    colorName: "チャコール",
    colorHex: "#3c3c3c",
    season: "all",
    thickness: "mid",
    formality: "dress",
    materialFamily: ["wool", "polyester-blend"],
    surfaceFinish: ["smooth"],
    drape: "drapey",
    silhouette: "slim",
    pattern: "solid",
    addedAt: "2026-01-14T10:00:00Z",
  },
  {
    id: "demo-bottoms-03",
    name: "ベージュワイドチノ",
    category: "bottoms",
    categoryMain: "bottoms",
    subcategory: "subcategory.chino",
    color: "beige",
    colorName: "ベージュ",
    colorHex: "#c9b99a",
    season: "all",
    thickness: "mid",
    formality: "casual",
    materialFamily: ["cotton"],
    surfaceFinish: ["twill"],
    drape: "balanced",
    silhouette: "loose",
    pattern: "solid",
    addedAt: "2026-02-05T10:00:00Z",
  },

  // ── Shoes ──
  {
    id: "demo-shoes-01",
    name: "白レザースニーカー",
    category: "shoes",
    categoryMain: "shoes",
    subcategory: "subcategory.sneaker",
    color: "white",
    colorName: "ホワイト",
    colorHex: "#ffffff",
    season: "all",
    thickness: "mid",
    formality: "casual",
    materialFamily: ["leather"],
    surfaceFinish: ["smooth"],
    drape: "structured",
    silhouette: "regular",
    pattern: "solid",
    addedAt: "2026-01-05T10:00:00Z",
  },
  {
    id: "demo-shoes-02",
    name: "ブラウンスエードダービーシューズ",
    category: "shoes",
    categoryMain: "shoes",
    subcategory: "subcategory.derby",
    color: "brown",
    colorName: "ダークブラウン",
    colorHex: "#5c3a1e",
    season: "all",
    thickness: "mid",
    formality: "smart",
    materialFamily: ["suede"],
    surfaceFinish: ["napped"],
    drape: "structured",
    silhouette: "regular",
    pattern: "solid",
    addedAt: "2026-01-22T10:00:00Z",
  },

  // ── Accessories ──
  {
    id: "demo-acc-01",
    name: "ブラックレザートートバッグ",
    category: "accessories",
    categoryMain: "bag",
    subcategory: "subcategory.tote",
    color: "black",
    colorName: "ブラック",
    colorHex: "#1a1a1a",
    season: "all",
    thickness: "mid",
    formality: "smart",
    materialFamily: ["leather"],
    surfaceFinish: ["smooth"],
    drape: "structured",
    silhouette: "regular",
    pattern: "solid",
    addedAt: "2026-01-25T10:00:00Z",
  },
];

// ---------------------------------------------------------------------------
// 3 demo setups
// ---------------------------------------------------------------------------

export const DEMO_SETUPS: SavedSetup[] = [
  {
    id: "demo-setup-01",
    title: "通勤スタイル",
    itemIds: [
      "demo-outer-01",   // ネイビーコート
      "demo-tops-02",    // サックスブルーシャツ
      "demo-bottoms-02", // チャコールスラックス
      "demo-shoes-02",   // ブラウンダービー
      "demo-acc-01",     // ブラックトート
    ],
    moodTags: ["clean", "composed"],
    impressionTags: ["きちんと感", "信頼感"],
    createdAt: "2026-02-10T09:00:00Z",
    updatedAt: "2026-02-10T09:00:00Z",
  },
  {
    id: "demo-setup-02",
    title: "休日カジュアル",
    itemIds: [
      "demo-outer-02",   // オリーブMA-1
      "demo-tops-01",    // 白T
      "demo-bottoms-01", // インディゴデニム
      "demo-shoes-01",   // 白スニーカー
    ],
    moodTags: ["natural", "playful"],
    impressionTags: ["こなれ感", "リラックス"],
    createdAt: "2026-02-12T11:00:00Z",
    updatedAt: "2026-02-12T11:00:00Z",
  },
  {
    id: "demo-setup-03",
    title: "デートコーデ",
    itemIds: [
      "demo-tops-03",    // グレーニット
      "demo-bottoms-02", // チャコールスラックス
      "demo-shoes-02",   // ブラウンダービー
      "demo-acc-01",     // ブラックトート
    ],
    moodTags: ["soft", "calm"],
    impressionTags: ["大人っぽさ", "品の良さ"],
    createdAt: "2026-02-15T15:00:00Z",
    updatedAt: "2026-02-15T15:00:00Z",
  },
];

// ---------------------------------------------------------------------------
// Build a complete demo SavedState
// ---------------------------------------------------------------------------

export function createDemoState(): Partial<SavedState> {
  const colorPrefs: ColorPrefs = {
    dominant: [
      { value: "navy", hex: "#1e2a4a", count: 2 },
      { value: "white", hex: "#f8f8f8", count: 2 },
      { value: "gray", hex: "#7a7a7a", count: 2 },
      { value: "brown", hex: "#5c3a1e", count: 1 },
      { value: "black", hex: "#1a1a1a", count: 1 },
    ],
  };

  return {
    wardrobe: DEMO_WARDROBE,
    setups: DEMO_SETUPS,
    colorPrefs,
    styleSelections: [
      {
        laneCode: "clean",
        bucket: "core",
        priority: 1,
        createdAt: "2026-02-10T09:00:00Z",
      },
      {
        laneCode: "smart-casual",
        bucket: "core",
        priority: 2,
        createdAt: "2026-02-10T09:00:00Z",
      },
      {
        laneCode: "minimal",
        bucket: "rare",
        priority: 3,
        createdAt: "2026-02-10T09:00:00Z",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Check whether saved state has any real user data
// ---------------------------------------------------------------------------

export function isEmptyState(state: SavedState): boolean {
  return !state.wardrobe || state.wardrobe.length === 0;
}
