// lib/ui/depthVisualSystem.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Depth as Literal Depth（深度を空間として表現）
//
// 脳科学的根拠:
// 空間的メタファーは抽象概念の理解を深める（Lakoff & Johnson, 1980）。
// 「自己理解が深まる」を「視覚的に深く潜る」として表現することで、
// 認知的流暢性が上がり、進捗感覚が具体化される。
//
// 設計:
// 🌑 Level 0 (未観測) → 水面: 明るい、シンプル、浅い色
// 🌒 Level 1 (覚醒)  → 浅い水中: やや深い青、泡のパーティクル
// 🌓 Level 2 (探索)  → 深海: 暗い青紫、生物発光的な光点
// 🌔 Level 3 (深化)  → 深淵: ほぼ黒、宝石のような洞察が光る
// 🌕 Level 4 (統合)  → 宇宙: 暗闇の中の星座が完成した状態
//
// 既存資産:
// - computeObservationLevel() → level 0-4
// - Hero背景（BG_GRADIENT, Starfield, earth.png等）
// - Zone色システム（Z.presence, Z.observation等）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ObservationLevel = 0 | 1 | 2 | 3 | 4;

/** 深度レベルのビジュアルパラメータ */
export interface DepthVisualParams {
  /** レベル */
  level: ObservationLevel;
  /** レベル名 */
  name: string;
  /** メタファー */
  metaphor: string;

  // ─── Background ───
  /** 背景グラデーション（深度バージョン） */
  depthGradient: string;
  /** 背景の全体的な明るさ（0-1、0=暗い、1=明るい） */
  brightness: number;

  // ─── Starfield ───
  /** 星の数倍率 */
  starCount: number;
  /** 星のベース不透明度 */
  starOpacity: number;
  /** 星のhue */
  starHue: number;
  /** 星の最大サイズ */
  starMaxRadius: number;

  // ─── Depth Particles ───
  /** 深度専用パーティクルの種類 */
  depthParticleType: "bubble" | "plankton" | "bioluminescence" | "gem" | "constellation";
  /** パーティクル色 */
  depthParticleColor: string;
  /** パーティクル数 */
  depthParticleCount: number;
  /** パーティクルの動きの速さ */
  depthParticleSpeed: number;
  /** パーティクルの最大サイズ */
  depthParticleMaxSize: number;

  // ─── Ambient Effects ───
  /** 環境光の色 */
  ambientColor: string;
  /** 環境光の強度（0-1） */
  ambientIntensity: number;
  /** ビネット（周辺減光）の強度（0-1） */
  vignetteIntensity: number;

  // ─── Text ───
  /** テキスト色（深度に合わせた視認性確保） */
  textPrimary: string;
  /** テキストサブ色 */
  textSecondary: string;
  /** テキストの影（暗い背景での視認性） */
  textShadow: string;

  // ─── Card ───
  /** カード背景 */
  cardBg: string;
  /** カードのブラー */
  cardBlur: number;
  /** カードボーダー */
  cardBorder: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Depth Level Definitions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEPTH_LEVELS: Record<ObservationLevel, DepthVisualParams> = {
  // ━━━ 🌑 Level 0: 水面 — 明るく、シンプルに ━━━
  0: {
    level: 0,
    name: "🌑 未観測",
    metaphor: "水面",
    depthGradient: "linear-gradient(180deg, #e8f4f8 0%, #d0e8ef 30%, #c5e0ea 60%, #d5eaf0 100%)",
    brightness: 0.9,
    starCount: 0,
    starOpacity: 0,
    starHue: 200,
    starMaxRadius: 0,
    depthParticleType: "bubble",
    depthParticleColor: "rgba(180,220,240,0.4)",
    depthParticleCount: 15,
    depthParticleSpeed: 0.5,
    depthParticleMaxSize: 4,
    ambientColor: "rgba(200,230,255,0.15)",
    ambientIntensity: 0.3,
    vignetteIntensity: 0,
    textPrimary: "#1a3040",
    textSecondary: "#4a6575",
    textShadow: "none",
    cardBg: "rgba(255,255,255,0.8)",
    cardBlur: 16,
    cardBorder: "1px solid rgba(180,220,240,0.5)",
  },

  // ━━━ 🌒 Level 1: 浅い水中 — やや深い青、泡 ━━━
  1: {
    level: 1,
    name: "🌒 覚醒",
    metaphor: "浅い水中",
    depthGradient: "linear-gradient(180deg, #d5e5f0 0%, #b8d0e8 25%, #a0c0dd 50%, #90b5d5 75%, #a5c5e0 100%)",
    brightness: 0.75,
    starCount: 30,
    starOpacity: 0.3,
    starHue: 210,
    starMaxRadius: 0.8,
    depthParticleType: "bubble",
    depthParticleColor: "rgba(160,200,230,0.35)",
    depthParticleCount: 25,
    depthParticleSpeed: 0.4,
    depthParticleMaxSize: 5,
    ambientColor: "rgba(130,180,220,0.12)",
    ambientIntensity: 0.4,
    vignetteIntensity: 0.1,
    textPrimary: "#1a2e40",
    textSecondary: "#3a5a72",
    textShadow: "0 1px 2px rgba(255,255,255,0.3)",
    cardBg: "rgba(245,250,255,0.72)",
    cardBlur: 18,
    cardBorder: "1px solid rgba(130,180,220,0.4)",
  },

  // ━━━ 🌓 Level 2: 深海 — 暗い青紫、生物発光 ━━━
  2: {
    level: 2,
    name: "🌓 探索",
    metaphor: "深海",
    depthGradient: "linear-gradient(180deg, #c5d0e8 0%, #a0b0d5 20%, #8095c5 40%, #6a80b8 60%, #7a90c0 80%, #90a5cc 100%)",
    brightness: 0.55,
    starCount: 60,
    starOpacity: 0.45,
    starHue: 230,
    starMaxRadius: 1.0,
    depthParticleType: "plankton",
    depthParticleColor: "rgba(100,180,220,0.3)",
    depthParticleCount: 35,
    depthParticleSpeed: 0.3,
    depthParticleMaxSize: 3,
    ambientColor: "rgba(80,120,200,0.1)",
    ambientIntensity: 0.5,
    vignetteIntensity: 0.2,
    textPrimary: "#e8eef5",
    textSecondary: "#b0c0d8",
    textShadow: "0 1px 3px rgba(0,0,0,0.3)",
    cardBg: "rgba(30,40,70,0.45)",
    cardBlur: 20,
    cardBorder: "1px solid rgba(100,150,220,0.3)",
  },

  // ━━━ 🌔 Level 3: 深淵 — ほぼ黒、宝石の光 ━━━
  3: {
    level: 3,
    name: "🌔 深化",
    metaphor: "深淵",
    depthGradient: "linear-gradient(180deg, #3a3560 0%, #2a254a 25%, #201a3a 50%, #18132e 75%, #201a38 100%)",
    brightness: 0.25,
    starCount: 100,
    starOpacity: 0.55,
    starHue: 260,
    starMaxRadius: 1.2,
    depthParticleType: "gem",
    depthParticleColor: "rgba(180,140,255,0.4)",
    depthParticleCount: 20,
    depthParticleSpeed: 0.2,
    depthParticleMaxSize: 6,
    ambientColor: "rgba(140,100,240,0.08)",
    ambientIntensity: 0.6,
    vignetteIntensity: 0.35,
    textPrimary: "#e5e0f5",
    textSecondary: "#a898c8",
    textShadow: "0 1px 4px rgba(0,0,0,0.5)",
    cardBg: "rgba(20,15,40,0.55)",
    cardBlur: 24,
    cardBorder: "1px solid rgba(140,100,240,0.25)",
  },

  // ━━━ 🌕 Level 4: 宇宙 — 暗闇の中の星座 ━━━
  4: {
    level: 4,
    name: "🌕 統合",
    metaphor: "宇宙",
    depthGradient: "linear-gradient(180deg, #0e0a1a 0%, #0a0814 25%, #060510 50%, #080612 75%, #0a0816 100%)",
    brightness: 0.1,
    starCount: 200,
    starOpacity: 0.8,
    starHue: 240,
    starMaxRadius: 1.5,
    depthParticleType: "constellation",
    depthParticleColor: "rgba(200,180,255,0.5)",
    depthParticleCount: 40,
    depthParticleSpeed: 0.15,
    depthParticleMaxSize: 2,
    ambientColor: "rgba(100,80,200,0.06)",
    ambientIntensity: 0.7,
    vignetteIntensity: 0.4,
    textPrimary: "#e8e2f8",
    textSecondary: "#b0a0d0",
    textShadow: "0 0 8px rgba(140,100,255,0.3), 0 1px 4px rgba(0,0,0,0.6)",
    cardBg: "rgba(15,10,30,0.6)",
    cardBlur: 28,
    cardBorder: "1px solid rgba(140,120,255,0.2)",
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Main Entry Points
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 観測レベルからビジュアルパラメータを取得
 */
export function getDepthVisuals(level: ObservationLevel): DepthVisualParams {
  return DEPTH_LEVELS[level];
}

/**
 * 2つのレベル間を補間（レベルアップトランジション用）
 *
 * レベルアップ時に急にビジュアルが変わるのではなく、
 * 「潜水していく」ようなスムーズな遷移を表現。
 */
export function interpolateDepthVisuals(
  fromLevel: ObservationLevel,
  toLevel: ObservationLevel,
  t: number, // 0-1
): DepthVisualParams {
  const from = DEPTH_LEVELS[fromLevel];
  const to = DEPTH_LEVELS[toLevel];
  const lerp = (a: number, b: number) => a + (b - a) * t;

  return {
    ...to,
    level: t < 0.5 ? fromLevel : toLevel,
    name: t < 0.5 ? from.name : to.name,
    metaphor: t < 0.5 ? from.metaphor : to.metaphor,
    depthGradient: t < 0.5 ? from.depthGradient : to.depthGradient,
    brightness: lerp(from.brightness, to.brightness),
    starCount: Math.round(lerp(from.starCount, to.starCount)),
    starOpacity: lerp(from.starOpacity, to.starOpacity),
    starHue: lerp(from.starHue, to.starHue),
    starMaxRadius: lerp(from.starMaxRadius, to.starMaxRadius),
    depthParticleCount: Math.round(lerp(from.depthParticleCount, to.depthParticleCount)),
    depthParticleSpeed: lerp(from.depthParticleSpeed, to.depthParticleSpeed),
    depthParticleMaxSize: lerp(from.depthParticleMaxSize, to.depthParticleMaxSize),
    ambientIntensity: lerp(from.ambientIntensity, to.ambientIntensity),
    vignetteIntensity: lerp(from.vignetteIntensity, to.vignetteIntensity),
    cardBlur: lerp(from.cardBlur, to.cardBlur),
  };
}

/**
 * 深度レベルのCSS変数を生成
 *
 * CSS Custom Properties として注入し、
 * 子コンポーネントが自動的に深度に応じたスタイルを適用。
 *
 * 使い方:
 * ```tsx
 * <div style={getDepthCSSVariables(level)}>
 *   {children} // 子コンポーネントは var(--depth-text-primary) 等を参照
 * </div>
 * ```
 */
export function getDepthCSSVariables(
  level: ObservationLevel,
): Record<string, string> {
  const params = DEPTH_LEVELS[level];

  return {
    "--depth-bg": params.depthGradient,
    "--depth-brightness": String(params.brightness),
    "--depth-text-primary": params.textPrimary,
    "--depth-text-secondary": params.textSecondary,
    "--depth-text-shadow": params.textShadow,
    "--depth-card-bg": params.cardBg,
    "--depth-card-blur": `${params.cardBlur}px`,
    "--depth-card-border": params.cardBorder,
    "--depth-ambient-color": params.ambientColor,
    "--depth-ambient-intensity": String(params.ambientIntensity),
    "--depth-vignette-intensity": String(params.vignetteIntensity),
    "--depth-star-hue": String(params.starHue),
    "--depth-star-opacity": String(params.starOpacity),
    "--depth-particle-color": params.depthParticleColor,
    "--depth-particle-speed": String(params.depthParticleSpeed),
  };
}
