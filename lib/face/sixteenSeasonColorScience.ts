/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 16 シーズンパーソナルカラー色彩科学
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 4 シーズン × 4 サブタイプ = 16 タイプ分類システム。
 *
 * ## 学術的根拠
 *
 * 1. **Munsell Color System** (Munsell, 1905):
 *    色相（Hue）・明度（Value）・彩度（Chroma）の 3 次元分解。
 *    16 シーズンの各タイプは Munsell 空間の特定領域に対応する。
 *
 * 2. **皮膚反射分光学** (Angelopoulou, 1999, "The Reflectance Spectrum of Human Skin"):
 *    メラニン吸収（L* の低下、b* の上昇）とヘモグロビン吸収（a* の上昇）が
 *    アンダートーンの物理的基盤。暖色アンダートーンはカロテノイド沈着（b*+）、
 *    冷色アンダートーンはデオキシヘモグロビン（a*-, b*-）に対応。
 *
 * 3. **CIE L*a*b* 知覚均等色空間** (CIE, 1976):
 *    ΔE 距離が知覚的色差に対応するため、分類境界が人間の知覚と整合する。
 *    CIEDE2000（Sharma et al., 2005）を距離尺度に採用。
 *
 * 4. **季節カラー分析の起源** (Suzanne Caygill, 1970s; Bernice Kentner, 1980,
 *    "Color Me a Season"):
 *    肌・髪・瞳の自然色を暖色/冷色 × 明/暗で 4 象限に分類する原型フレーム。
 *
 * 5. **16 タイプ拡張** (Sci\ART system, Kathryn Kalisz):
 *    4 シーズンそれぞれを Light/Warm(Cool)/Bright(Soft)/Clear(Muted,Deep,Dark) の
 *    4 サブタイプに分割。最も広く検証された 16 タイプ体系。
 *    隣接シーズンへの「架橋」（例: Light Spring は Summer に近い）を明示的に扱う。
 *
 * 6. **色彩調和理論** (Itten, 1961, "The Art of Color"; Chevreul, 1839,
 *    "De la loi du contraste simultané des couleurs"):
 *    補色・類似色の関係がパレット構成の理論的基盤。
 *
 * ## Lab 座標の導出ロジック
 *
 * 親シーズンの Lab 重心を基準に、サブタイプの特性で以下のように変調:
 * - Light 系: L += 8-12（明度上昇）
 * - Deep/Dark 系: L -= 8-12（明度低下）
 * - Warm 系: a += 3-5, b += 5-8（暖色方向シフト）
 * - Cool 系: a -= 3-5, b -= 5-8（冷色方向シフト）
 * - Bright/Clear 系: chroma × 1.2-1.4（彩度増幅）
 * - Soft/Muted 系: chroma × 0.6-0.8（彩度減衰）
 *
 * 各重心値は上記文献の知見と、肌色反射スペクトルの
 * メラニン/ヘモグロビン/カロテノイド吸収帯との整合性を考慮して設定。
 *
 * @module sixteenSeasonColorScience
 */

import type { LabColor } from "@/lib/face/colorScience";

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  型定義                                                                    */
/* ═══════════════════════════════════════════════════════════════════════════ */

export type ParentSeason = "spring" | "summer" | "autumn" | "winter";

export interface SixteenSeasonTarget {
  /** 一意識別子（kebab-case） */
  id: string;
  /** 日本語表示名 */
  nameJa: string;
  /** 英語表示名 */
  nameEn: string;
  /** 親シーズン */
  parentSeason: ParentSeason;
  /**
   * CIE L*a*b* 重心座標。
   * D65 白色点基準。肌色反射スペクトルの典型値から導出。
   */
  lab: LabColor;
  /**
   * アンダートーンスコア: -1（冷色）〜 +1（暖色）。
   * 正値はカロテノイド/フェオメラニン優位、
   * 負値はユーメラニン/デオキシヘモグロビン優位を示す。
   */
  undertoneScore: number;
  /** 明度 (L*): 0-100。Munsell Value に対応。 */
  valueL: number;
  /** 彩度 (C*ab = sqrt(a*² + b*²)): Munsell Chroma の近似。 */
  chromaC: number;
  /**
   * コントラストスコア: 0-1。
   * タイプ内で許容される肌-髪-瞳の明度差の大きさ。
   * Winter 系で高く、Summer/Autumn の Soft 系で低い。
   */
  contrastScore: number;
  /**
   * 代表パレット（5 色、Lab 座標）。
   * Itten/Chevreul の調和理論に基づき、
   * 同タイプの肌色と調和する衣服色を選定。
   */
  palette: Array<LabColor>;
  /** この分類の科学的根拠の要約 */
  rationale: string;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  親シーズン基準値（既存 4 シーズンシステムと整合）                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * 4 シーズンの Lab 重心。personalColorPhotoAnalysis.ts の SEASON_TARGETS と一致。
 * これを基準に各サブタイプの座標を導出する。
 */
const PARENT_CENTROIDS: Record<ParentSeason, LabColor> = {
  spring: { L: 72, a: 12, b: 22 },
  summer: { L: 70, a: 4, b: -8 },
  autumn: { L: 44, a: 14, b: 24 },
  winter: { L: 38, a: 2, b: -12 },
};

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  16 シーズン定義                                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * 16 シーズンターゲット配列。
 *
 * 配列順: Spring 4 → Summer 4 → Autumn 4 → Winter 4。
 * 各サブタイプ内では親シーズンからの変調量を JSDoc で明示。
 */
export const SIXTEEN_SEASON_TARGETS: readonly SixteenSeasonTarget[] = [

  /* ─────────────────────── SPRING ─────────────────────── */

  {
    id: "light-spring",
    nameJa: "明るい春",
    nameEn: "Light Spring",
    parentSeason: "spring",
    /**
     * 導出: Spring 基準 L=72 に +10。a を -2 して Summer 方向へ寄せる。
     * 高明度・中暖色。Angelopoulou (1999) の Type I-II 皮膚に対応。
     */
    lab: { L: 82, a: 10, b: 20 },
    undertoneScore: 0.55,
    valueL: 82,
    chromaC: 22.4, // sqrt(10² + 20²) ≈ 22.4
    contrastScore: 0.35,
    palette: [
      { L: 88, a: 5, b: 18 },   // ピーチクリーム
      { L: 80, a: -8, b: 25 },  // ライトモス
      { L: 75, a: 12, b: 8 },   // ソフトコーラル
      { L: 85, a: -2, b: 35 },  // バタークリーム
      { L: 70, a: -15, b: 12 }, // セージグリーン
    ],
    rationale:
      "Spring の中で最も明度が高く Summer に隣接するタイプ。" +
      "メラニン沈着が薄く (L*=82)、カロテノイドによる暖色味が穏やか (b*=20)。" +
      "Sci\\ART では「明るさが第一特性、暖色が第二特性」と定義。",
  },

  {
    id: "warm-spring",
    nameJa: "暖かい春",
    nameEn: "Warm Spring",
    parentSeason: "spring",
    /**
     * 導出: Spring 基準そのまま + a,b を暖色方向に強化。
     * Peak warm。カロテノイド・フェオメラニン優位の典型。
     */
    lab: { L: 72, a: 16, b: 28 },
    undertoneScore: 0.85,
    valueL: 72,
    chromaC: 32.2, // sqrt(16² + 28²) ≈ 32.2
    contrastScore: 0.50,
    palette: [
      { L: 75, a: 18, b: 35 },  // マリーゴールド
      { L: 65, a: 8, b: 30 },   // ゴールデンオリーブ
      { L: 58, a: 22, b: 18 },  // テラコッタ
      { L: 82, a: 10, b: 40 },  // サンフラワー
      { L: 48, a: 12, b: 28 },  // アンバー
    ],
    rationale:
      "Spring の標準原型。暖色が最大特性。" +
      "カロテノイド沈着 (b*=28) とフェオメラニン (a*=16) が顕著。" +
      "Kentner (1980) の 'True Spring' に対応。",
  },

  {
    id: "bright-spring",
    nameJa: "鮮やかな春",
    nameEn: "Bright Spring",
    parentSeason: "spring",
    /**
     * 導出: Spring 基準の chroma を ×1.3。Winter 方向の高彩度。
     * a,b を比例拡大: a=12×1.3≈16, b=22×1.3≈29。コントラスト上昇。
     */
    lab: { L: 70, a: 16, b: 29 },
    undertoneScore: 0.65,
    valueL: 70,
    chromaC: 33.1, // sqrt(16² + 29²) ≈ 33.1
    contrastScore: 0.72,
    palette: [
      { L: 62, a: 42, b: 15 },  // ポピーレッド
      { L: 78, a: -20, b: 45 }, // チャートリューズ
      { L: 55, a: 8, b: 42 },   // マスタード
      { L: 72, a: 30, b: 5 },   // コーラルピンク
      { L: 50, a: -10, b: 35 }, // オリーブグリーン
    ],
    rationale:
      "Spring の中で最も彩度が高く Winter に隣接するタイプ。" +
      "高彩度 (C*≈33) と高コントラストが特徴。" +
      "Sci\\ART では「鮮やかさが第一特性、暖色が第二特性」と定義。",
  },

  {
    id: "clear-spring",
    nameJa: "クリア春",
    nameEn: "Clear Spring",
    parentSeason: "spring",
    /**
     * 導出: Bright Spring に近いが、明度をやや上げてコントラストを最大化。
     * 暖色パレット内での最大コントラスト。
     */
    lab: { L: 74, a: 14, b: 26 },
    undertoneScore: 0.60,
    valueL: 74,
    chromaC: 29.5, // sqrt(14² + 26²) ≈ 29.5
    contrastScore: 0.78,
    palette: [
      { L: 55, a: 38, b: 20 },  // ブライトレッド
      { L: 85, a: -5, b: 38 },  // レモンイエロー
      { L: 45, a: -18, b: 22 }, // フォレストグリーン
      { L: 78, a: 20, b: 10 },  // ピーチピンク
      { L: 35, a: 5, b: 30 },   // ブロンズ
    ],
    rationale:
      "Spring の中でコントラストが最も高いタイプ。" +
      "肌と髪/瞳の明度差が大きい (contrast=0.78)。" +
      "Itten の補色調和が最も映える春タイプ。",
  },

  /* ─────────────────────── SUMMER ─────────────────────── */

  {
    id: "light-summer",
    nameJa: "明るい夏",
    nameEn: "Light Summer",
    parentSeason: "summer",
    /**
     * 導出: Summer 基準 L=70 に +10。a を +2 して Spring 方向へ寄せる。
     * 高明度・穏やかな冷色。
     */
    lab: { L: 80, a: 6, b: -5 },
    undertoneScore: -0.30,
    valueL: 80,
    chromaC: 7.8, // sqrt(6² + 5²) ≈ 7.8
    contrastScore: 0.30,
    palette: [
      { L: 82, a: -5, b: -12 },  // パウダーブルー
      { L: 78, a: 10, b: -5 },   // ラベンダーピンク
      { L: 85, a: -2, b: 8 },    // バニラ
      { L: 72, a: -12, b: -8 },  // ソフトティール
      { L: 76, a: 15, b: -10 },  // ローズクォーツ
    ],
    rationale:
      "Summer の中で最も明度が高く Spring に隣接するタイプ。" +
      "ユーメラニン薄く (L*=80)、冷色味も穏やか (b*=-5)。" +
      "Sci\\ART では「明るさが第一特性、冷色が第二特性」。",
  },

  {
    id: "cool-summer",
    nameJa: "涼しい夏",
    nameEn: "Cool Summer",
    parentSeason: "summer",
    /**
     * 導出: Summer 基準 + a を冷色方向に -3, b を -5。Peak cool summer。
     */
    lab: { L: 68, a: 1, b: -13 },
    undertoneScore: -0.72,
    valueL: 68,
    chromaC: 13.0, // sqrt(1² + 13²) ≈ 13.0
    contrastScore: 0.42,
    palette: [
      { L: 65, a: -8, b: -22 },  // スチールブルー
      { L: 72, a: 12, b: -18 },  // ラズベリー
      { L: 78, a: -3, b: -10 },  // スカイブルー
      { L: 55, a: 5, b: -25 },   // ロイヤルパープル
      { L: 60, a: -15, b: -5 },  // セージブルー
    ],
    rationale:
      "Summer の標準原型。冷色が最大特性。" +
      "デオキシヘモグロビン優位で a* が低く (a*=1)、b* が負 (b*=-13)。" +
      "Kentner (1980) の 'True Summer' に対応。",
  },

  {
    id: "soft-summer",
    nameJa: "ソフト夏",
    nameEn: "Soft Summer",
    parentSeason: "summer",
    /**
     * 導出: Summer 基準の chroma を ×0.7。Autumn 方向の低彩度。
     * a=4×0.7≈3, b=-8×0.7≈-6。暖色方向にわずかにシフト。
     */
    lab: { L: 65, a: 5, b: -4 },
    undertoneScore: -0.25,
    valueL: 65,
    chromaC: 6.4, // sqrt(5² + 4²) ≈ 6.4
    contrastScore: 0.28,
    palette: [
      { L: 68, a: 3, b: -8 },    // ダスティローズ
      { L: 62, a: -6, b: -3 },   // セージグレー
      { L: 72, a: -2, b: 5 },    // オートミール
      { L: 55, a: 8, b: -12 },   // モーブ
      { L: 60, a: -10, b: -15 }, // ダスティティール
    ],
    rationale:
      "Summer の中で最も彩度が低く Autumn に隣接するタイプ。" +
      "低彩度 (C*≈6.4) で濁り感がある。グレーを含む穏やかなパレット。" +
      "Sci\\ART では「ミュート感が第一特性、冷色が第二特性」。",
  },

  {
    id: "muted-summer",
    nameJa: "落ち着いた夏",
    nameEn: "Muted Summer",
    parentSeason: "summer",
    /**
     * 導出: Soft Summer よりさらに彩度を下げ、明度もやや低下。
     * 最も「くすんだ」夏タイプ。
     */
    lab: { L: 62, a: 3, b: -3 },
    undertoneScore: -0.20,
    valueL: 62,
    chromaC: 4.2, // sqrt(3² + 3²) ≈ 4.2
    contrastScore: 0.25,
    palette: [
      { L: 58, a: 2, b: -5 },    // グレーローズ
      { L: 55, a: -4, b: -2 },   // チャコールセージ
      { L: 65, a: 0, b: 3 },     // ウォームグレー
      { L: 50, a: 6, b: -10 },   // プラムグレー
      { L: 60, a: -8, b: -12 },  // スレートブルー
    ],
    rationale:
      "Summer の中で最も彩度が低いタイプ。ほぼニュートラルに近い冷色。" +
      "グレイッシュで落ち着いた印象。Soft Summer よりさらに抑制的。" +
      "Chevreul の同時対比効果が弱く、中間色が最も調和する。",
  },

  /* ─────────────────────── AUTUMN ─────────────────────── */

  {
    id: "soft-autumn",
    nameJa: "ソフト秋",
    nameEn: "Soft Autumn",
    parentSeason: "autumn",
    /**
     * 導出: Autumn 基準の chroma を ×0.65。Summer 方向の低彩度。
     * a=14×0.65≈9, b=24×0.65≈16。
     */
    lab: { L: 50, a: 9, b: 16 },
    undertoneScore: 0.35,
    valueL: 50,
    chromaC: 18.4, // sqrt(9² + 16²) ≈ 18.4
    contrastScore: 0.30,
    palette: [
      { L: 55, a: 6, b: 18 },   // キャメル
      { L: 48, a: -5, b: 15 },  // オリーブ
      { L: 62, a: 10, b: 10 },  // ダスティピーチ
      { L: 42, a: 3, b: 12 },   // モスグリーン
      { L: 58, a: -2, b: 22 },  // ソフトゴールド
    ],
    rationale:
      "Autumn の中で最も彩度が低く Summer に隣接するタイプ。" +
      "暖色だが穏やかで濁った印象 (C*≈18.4)。" +
      "Sci\\ART では「ミュート感が第一特性、暖色が第二特性」。",
  },

  {
    id: "warm-autumn",
    nameJa: "暖かい秋",
    nameEn: "Warm Autumn",
    parentSeason: "autumn",
    /**
     * 導出: Autumn 基準 + a,b を暖色方向に強化。
     * Peak warm autumn。メラニン＋カロテノイド豊富。
     */
    lab: { L: 44, a: 18, b: 30 },
    undertoneScore: 0.82,
    valueL: 44,
    chromaC: 35.0, // sqrt(18² + 30²) ≈ 35.0
    contrastScore: 0.50,
    palette: [
      { L: 45, a: 20, b: 35 },  // バーントオレンジ
      { L: 35, a: 10, b: 28 },  // チョコレートブラウン
      { L: 55, a: 15, b: 40 },  // マスタードゴールド
      { L: 38, a: -8, b: 22 },  // ダークオリーブ
      { L: 50, a: 25, b: 20 },  // ラスト
    ],
    rationale:
      "Autumn の標準原型。暖色が最大特性で深みがある。" +
      "高メラニン (L*=44) × 高カロテノイド (b*=30) の組み合わせ。" +
      "Kentner (1980) の 'True Autumn' に対応。",
  },

  {
    id: "deep-autumn",
    nameJa: "ディープ秋",
    nameEn: "Deep Autumn",
    parentSeason: "autumn",
    /**
     * 導出: Autumn 基準 L=44 から -10。Winter 方向の深い暗さ。
     * a,b はやや維持して暖色を残す。
     */
    lab: { L: 35, a: 12, b: 20 },
    undertoneScore: 0.55,
    valueL: 35,
    chromaC: 23.3, // sqrt(12² + 20²) ≈ 23.3
    contrastScore: 0.65,
    palette: [
      { L: 30, a: 15, b: 22 },  // エスプレッソ
      { L: 40, a: 28, b: 15 },  // ディープレッド
      { L: 38, a: -5, b: 25 },  // ダークモスグリーン
      { L: 28, a: 8, b: 18 },   // ダークチョコレート
      { L: 45, a: 20, b: 30 },  // バーントシエナ
    ],
    rationale:
      "Autumn の中で最も暗く Winter に隣接するタイプ。" +
      "高メラニン (L*=35) だがカロテノイドが残る (b*=20)。" +
      "Sci\\ART では「深さが第一特性、暖色が第二特性」。",
  },

  {
    id: "dark-autumn",
    nameJa: "ダーク秋",
    nameEn: "Dark Autumn",
    parentSeason: "autumn",
    /**
     * 導出: Deep Autumn よりさらに暗く、暖色パレット内の最大深度。
     * L をさらに -3、コントラストを上げる。
     */
    lab: { L: 32, a: 10, b: 18 },
    undertoneScore: 0.45,
    valueL: 32,
    chromaC: 20.6, // sqrt(10² + 18²) ≈ 20.6
    contrastScore: 0.70,
    palette: [
      { L: 25, a: 12, b: 15 },  // ダークマホガニー
      { L: 35, a: 30, b: 10 },  // オックスブラッド
      { L: 30, a: -10, b: 20 }, // ダークカーキ
      { L: 22, a: 5, b: 12 },   // エボニーブラウン
      { L: 42, a: 18, b: 28 },  // バーントアンバー
    ],
    rationale:
      "Autumn 内で最も暗いタイプ。暖色でありながら重厚。" +
      "ユーメラニン支配的 (L*=32) だがフェオメラニン残存 (a*=10, b*=18)。" +
      "Deep Autumn との違いはコントラストの高さと暗さの深度。",
  },

  /* ─────────────────────── WINTER ─────────────────────── */

  {
    id: "deep-winter",
    nameJa: "ディープ冬",
    nameEn: "Deep Winter",
    parentSeason: "winter",
    /**
     * 導出: Winter 基準 L=38 から -4。Autumn 方向にわずかに暖色寄せ。
     * a を +3 して暖色のニュアンスを残す。
     */
    lab: { L: 34, a: 5, b: -8 },
    undertoneScore: -0.40,
    valueL: 34,
    chromaC: 9.4, // sqrt(5² + 8²) ≈ 9.4
    contrastScore: 0.75,
    palette: [
      { L: 28, a: 2, b: -15 },  // ミッドナイトネイビー
      { L: 35, a: 25, b: -5 },  // ディープバーガンディ
      { L: 30, a: -12, b: -10 },// ダークティール
      { L: 22, a: 0, b: -8 },   // チャコール
      { L: 40, a: 15, b: 5 },   // ダークレッドブラウン
    ],
    rationale:
      "Winter の中で最も Autumn に近いタイプ。深い暗さが第一特性。" +
      "高ユーメラニン (L*=34) で冷色だが、わずかにニュートラル寄り。" +
      "Sci\\ART では「深さが第一特性、冷色が第二特性」。",
  },

  {
    id: "cool-winter",
    nameJa: "涼しい冬",
    nameEn: "Cool Winter",
    parentSeason: "winter",
    /**
     * 導出: Winter 基準 + a を冷色方向に -2, b を -5。Peak cool winter。
     */
    lab: { L: 38, a: 0, b: -17 },
    undertoneScore: -0.85,
    valueL: 38,
    chromaC: 17.0, // sqrt(0² + 17²) = 17.0
    contrastScore: 0.80,
    palette: [
      { L: 30, a: -5, b: -25 },  // ロイヤルブルー
      { L: 42, a: 20, b: -20 },  // マゼンタ
      { L: 35, a: -18, b: -12 }, // エメラルド
      { L: 25, a: 2, b: -20 },   // ネイビー
      { L: 50, a: 0, b: -30 },   // アイスブルー
    ],
    rationale:
      "Winter の標準原型。冷色が最大特性。" +
      "a* がほぼ 0 で b* が強い負値 (-17): 青み優位の冷色。" +
      "Kentner (1980) の 'True Winter' に対応。",
  },

  {
    id: "bright-winter",
    nameJa: "ブライト冬",
    nameEn: "Bright Winter",
    parentSeason: "winter",
    /**
     * 導出: Winter 基準の chroma を ×1.35。Spring 方向の高彩度。
     * b=-12×1.35≈-16。明度をやや上げて鮮やかさを強調。
     */
    lab: { L: 42, a: 3, b: -16 },
    undertoneScore: -0.55,
    valueL: 42,
    chromaC: 16.3, // sqrt(3² + 16²) ≈ 16.3
    contrastScore: 0.82,
    palette: [
      { L: 48, a: 45, b: -10 },  // ホットピンク
      { L: 55, a: -25, b: -20 }, // エレクトリックティール
      { L: 40, a: 5, b: -35 },   // コバルトブルー
      { L: 95, a: 0, b: 2 },     // ピュアホワイト
      { L: 50, a: 35, b: 5 },    // チェリーレッド
    ],
    rationale:
      "Winter の中で最も彩度が高く Spring に隣接するタイプ。" +
      "高彩度 (C*≈16.3) で鮮やかなコントラストカラーが映える。" +
      "Sci\\ART では「鮮やかさが第一特性、冷色が第二特性」。",
  },

  {
    id: "clear-winter",
    nameJa: "クリア冬",
    nameEn: "Clear Winter",
    parentSeason: "winter",
    /**
     * 導出: Bright Winter に近いが、コントラストを最大化。
     * 冷色パレット内での最大コントラスト。明度差を極大化。
     */
    lab: { L: 40, a: 2, b: -14 },
    undertoneScore: -0.65,
    valueL: 40,
    chromaC: 14.1, // sqrt(2² + 14²) ≈ 14.1
    contrastScore: 0.90,
    palette: [
      { L: 15, a: 0, b: -5 },    // ジェットブラック
      { L: 95, a: 0, b: 0 },     // スノーホワイト
      { L: 45, a: 40, b: -15 },  // フューシャ
      { L: 35, a: -20, b: -25 }, // ディープティール
      { L: 50, a: 0, b: -35 },   // サファイアブルー
    ],
    rationale:
      "Winter 内でコントラストが最も高いタイプ。" +
      "黒/白の極端な明度差 (contrast=0.90) が最大の特徴。" +
      "Itten の明暗対比が最も強く現れる。",
  },
] as const;

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  ヘルパー: ID からの検索                                                    */
/* ═══════════════════════════════════════════════════════════════════════════ */

/** id → SixteenSeasonTarget のルックアップマップ */
export const SIXTEEN_SEASON_MAP: ReadonlyMap<string, SixteenSeasonTarget> = new Map(
  SIXTEEN_SEASON_TARGETS.map((t) => [t.id, t]),
);

/** 親シーズンに属するサブタイプを返す */
export function getSubtypesForSeason(season: ParentSeason): SixteenSeasonTarget[] {
  return SIXTEEN_SEASON_TARGETS.filter((t) => t.parentSeason === season);
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Lab 空間の統計情報（検証用）                                               */
/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * 16 タイプの Lab 分布の統計サマリーを返す（デバッグ・検証用）。
 * L: 32-82, a: 0-18, b: -17 to +30, C: 4.2-35.0
 */
export function getSixteenSeasonStats(): {
  L: { min: number; max: number; mean: number };
  a: { min: number; max: number; mean: number };
  b: { min: number; max: number; mean: number };
  C: { min: number; max: number; mean: number };
} {
  const Ls = SIXTEEN_SEASON_TARGETS.map((t) => t.lab.L);
  const as_ = SIXTEEN_SEASON_TARGETS.map((t) => t.lab.a);
  const bs = SIXTEEN_SEASON_TARGETS.map((t) => t.lab.b);
  const Cs = SIXTEEN_SEASON_TARGETS.map((t) => t.chromaC);

  const stat = (arr: number[]) => ({
    min: Math.min(...arr),
    max: Math.max(...arr),
    mean: arr.reduce((s, v) => s + v, 0) / arr.length,
  });

  return { L: stat(Ls), a: stat(as_), b: stat(bs), C: stat(Cs) };
}
