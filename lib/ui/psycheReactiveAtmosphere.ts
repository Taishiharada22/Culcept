// lib/ui/psycheReactiveAtmosphere.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Psyche-Reactive Atmosphere（心理状態反応型UI）
//
// 脳科学的根拠:
// 環境が自己の内的状態を反映すると、自己参照処理（mPFC）が増幅される。
// 鏡を見たときと同じ神経反応が起き、
// 「このアプリは今の自分を知っている」という確信が生まれる。
//
// 設計思想:
// Inner Weather の weatherType/emotionalTone/energyLevel から
// UI全体の雰囲気パラメータを動的に生成する。
// - 背景グラデーション色
// - Starfieldのパーティクル挙動
// - カード/テキストの色温度
// - アニメーション速度
//
// 既存資産:
// - /api/stargazer/inner-weather → weatherType, energyLevel, stressLevel, emotionalTone
// - BG_GRADIENT（現在は静的な紫系グラデーション）
// - Starfield（200星、hue 210-240 固定）
// - C / Z カラートークン
//
// 世界参照:
// - Apple Dynamic Island（状態反応UI）
// - Journey（ゲーム、環境が感情を語る）
// - Calm（瞑想アプリ、心拍連動の背景アニメーション）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Inner Weather の入力データ */
export interface WeatherInput {
  weatherType: WeatherType;
  energyLevel: number;      // -1 ~ 1
  stressLevel: number;      // 0 ~ 1
  emotionalTone: EmotionalTone;
  socialBattery: number;    // 0 ~ 1
  stability?: number;       // 0 ~ 1
}

export type WeatherType =
  | "sunny" | "cloudy" | "rainy" | "stormy"
  | "foggy" | "windy" | "snow" | "aurora";

export type EmotionalTone =
  | "calm" | "anxious" | "excited" | "melancholic"
  | "irritated" | "hopeful" | "numb" | "restless"
  | "content" | "overwhelmed";

/** UI全体の雰囲気パラメータ */
export interface AtmosphereParams {
  // ─── Background ───
  /** 背景グラデーション（CSS linear-gradient） */
  bgGradient: string;
  /** Starfieldのベースhue */
  starfieldHue: number;
  /** Starfieldのhue幅（揺らぎの範囲） */
  starfieldHueRange: number;
  /** Starfield星の最大不透明度 */
  starfieldMaxOpacity: number;
  /** Starfieldの脈動速度倍率 */
  starfieldPulseSpeed: number;

  // ─── Particles ───
  /** パーティクル速度倍率（1.0 = 通常） */
  particleSpeed: number;
  /** パーティクル数倍率 */
  particleDensity: number;
  /** パーティクル色 */
  particleColor: string;

  // ─── Cards & Surfaces ───
  /** カード背景の基調色（白ベース） */
  cardTint: string;
  /** カードの backdrop-blur 値 */
  cardBlur: number;
  /** カードボーダーの不透明度 */
  cardBorderOpacity: number;

  // ─── Typography ───
  /** テキストの主要色（微調整） */
  textPrimary: string;
  /** テキストの二次色 */
  textSecondary: string;

  // ─── Animation ───
  /** 全体のアニメーション速度倍率（<1 = ゆっくり、>1 = 速い） */
  animationSpeed: number;
  /** トランジションの ease カーブ */
  transitionEase: string;

  // ─── Fog Effect ───
  /** フォグの強度（0-1、0=なし） */
  fogIntensity: number;
  /** フォグの色 */
  fogColor: string;

  // ─── PresenceOrb ───
  /** PresenceOrbの脈動速度 */
  orbPulseSpeed: number;
  /** PresenceOrbの色相 */
  orbHue: number;
  /** PresenceOrbの輝度 */
  orbBrightness: number;

  // ─── Metadata ───
  /** この雰囲気の名前（デバッグ用） */
  atmosphereName: string;
  /** 雰囲気の説明 */
  atmosphereDescription: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Default (Current) Atmosphere
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 現在のAneurasyncHomeの静的な雰囲気（フォールバック） */
const DEFAULT_ATMOSPHERE: AtmosphereParams = {
  bgGradient: "linear-gradient(180deg, #f8f6f3 0%, #f6f3f0 30%, #f4f1ed 60%, #f6f3f0 100%)",
  starfieldHue: 225,
  starfieldHueRange: 30,
  starfieldMaxOpacity: 0.7,
  starfieldPulseSpeed: 1.0,
  particleSpeed: 1.0,
  particleDensity: 1.0,
  particleColor: "rgba(190,175,130,0.3)",
  cardTint: "rgba(255,255,255,0.72)",
  cardBlur: 20,
  cardBorderOpacity: 0.9,
  textPrimary: "#1a1a2e",
  textSecondary: "#4a4a68",
  animationSpeed: 1.0,
  transitionEase: "cubic-bezier(0.4, 0, 0.2, 1)",
  fogIntensity: 0,
  fogColor: "rgba(255,255,255,0)",
  orbPulseSpeed: 1.0,
  orbHue: 225,
  orbBrightness: 1.0,
  atmosphereName: "default",
  atmosphereDescription: "静かな紫の空",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Weather-to-Atmosphere Mapping
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Weather Type ごとの雰囲気ベース
 *
 * 各天候は「背景色・パーティクル・アニメーション」の
 * 組み合わせで固有の世界観を作る。
 */
const WEATHER_ATMOSPHERES: Record<WeatherType, Partial<AtmosphereParams>> = {
  sunny: {
    bgGradient: "linear-gradient(180deg, #faf7f2 0%, #f8f4ee 30%, #f6f2eb 60%, #f8f4ee 100%)",
    starfieldHue: 40,
    starfieldMaxOpacity: 0.4,
    particleColor: "rgba(234,179,8,0.25)",
    particleSpeed: 0.8,
    cardTint: "rgba(255,252,245,0.75)",
    orbHue: 40,
    orbBrightness: 1.2,
    atmosphereName: "sunny",
    atmosphereDescription: "温かい陽光。エネルギーに満ちた状態",
  },

  cloudy: {
    bgGradient: "linear-gradient(180deg, #f5f3f0 0%, #f2f0ed 30%, #efede9 60%, #f2f0ed 100%)",
    starfieldHue: 240,
    starfieldMaxOpacity: 0.5,
    particleColor: "rgba(160,160,190,0.25)",
    particleSpeed: 0.7,
    cardTint: "rgba(245,245,250,0.7)",
    textSecondary: "#555570",
    orbHue: 240,
    orbBrightness: 0.85,
    atmosphereName: "cloudy",
    atmosphereDescription: "曇天。落ち着いているが少し重い",
  },

  rainy: {
    bgGradient: "linear-gradient(180deg, #f4f5f6 0%, #f0f2f3 30%, #eceef0 60%, #f0f2f3 100%)",
    starfieldHue: 210,
    starfieldMaxOpacity: 0.45,
    starfieldPulseSpeed: 0.7,
    particleColor: "rgba(100,140,200,0.3)",
    particleSpeed: 1.5,         // 雨粒のように速い
    particleDensity: 1.5,       // パーティクル増量
    cardTint: "rgba(240,245,252,0.7)",
    textSecondary: "#4a5a72",
    animationSpeed: 1.2,
    orbHue: 210,
    orbBrightness: 0.8,
    atmosphereName: "rainy",
    atmosphereDescription: "雨。内省的な気分。感情が流れている",
  },

  stormy: {
    bgGradient: "linear-gradient(180deg, #f2f0f4 0%, #eeecf0 30%, #eae8ec 60%, #eeedf0 100%)",
    starfieldHue: 260,
    starfieldHueRange: 40,
    starfieldMaxOpacity: 0.6,
    starfieldPulseSpeed: 2.0,   // 激しく明滅
    particleColor: "rgba(140,120,200,0.35)",
    particleSpeed: 2.5,         // 嵐のように激しい
    particleDensity: 2.0,
    cardTint: "rgba(240,238,248,0.65)",
    cardBlur: 24,
    textPrimary: "#1a1830",
    animationSpeed: 1.5,
    orbHue: 270,
    orbPulseSpeed: 1.8,
    orbBrightness: 1.3,         // 嵐の中の閃光
    atmosphereName: "stormy",
    atmosphereDescription: "嵐。感情が激しく動いている。内面の乱流",
  },

  foggy: {
    bgGradient: "linear-gradient(180deg, #f6f4f2 0%, #f3f1ef 30%, #f0eeec 60%, #f3f1ef 100%)",
    starfieldHue: 230,
    starfieldMaxOpacity: 0.25,  // 霧の中で星がぼやける
    starfieldPulseSpeed: 0.5,
    particleColor: "rgba(200,200,220,0.2)",
    particleSpeed: 0.4,
    particleDensity: 0.5,
    cardTint: "rgba(248,248,252,0.6)",
    cardBlur: 30,               // 強いブラー = 霧の表現
    textSecondary: "#6a6a80",
    fogIntensity: 0.6,          // 霧のオーバーレイ
    fogColor: "rgba(235,232,242,0.5)",
    animationSpeed: 0.6,
    orbHue: 230,
    orbBrightness: 0.6,
    atmosphereName: "foggy",
    atmosphereDescription: "霧。境界が曖昧になっている。思考がぼやけている",
  },

  windy: {
    bgGradient: "linear-gradient(180deg, #f4f6f8 0%, #f0f3f5 30%, #eceff2 60%, #f0f3f5 100%)",
    starfieldHue: 200,
    starfieldPulseSpeed: 1.5,
    particleColor: "rgba(130,170,210,0.3)",
    particleSpeed: 2.0,         // 風に流されるパーティクル
    particleDensity: 1.3,
    cardTint: "rgba(245,248,255,0.7)",
    animationSpeed: 1.3,
    orbHue: 200,
    orbPulseSpeed: 1.5,
    atmosphereName: "windy",
    atmosphereDescription: "風。変化の気配。落ち着かない心",
  },

  snow: {
    bgGradient: "linear-gradient(180deg, #f7f5f3 0%, #f4f2f0 30%, #f1efed 60%, #f4f2f0 100%)",
    starfieldHue: 220,
    starfieldMaxOpacity: 0.35,
    starfieldPulseSpeed: 0.6,
    particleColor: "rgba(220,220,240,0.4)",
    particleSpeed: 0.3,         // ゆっくり降る雪
    particleDensity: 2.0,       // 雪の密度
    cardTint: "rgba(252,252,255,0.8)",
    cardBorderOpacity: 0.6,
    textSecondary: "#5a5a72",
    animationSpeed: 0.5,
    fogIntensity: 0.2,
    fogColor: "rgba(245,245,252,0.3)",
    orbHue: 220,
    orbBrightness: 0.9,
    orbPulseSpeed: 0.5,
    atmosphereName: "snow",
    atmosphereDescription: "雪。静寂。全てが止まっているような感覚",
  },

  aurora: {
    bgGradient: "linear-gradient(180deg, #f6f4f8 0%, #f3f1f5 30%, #f0eef2 60%, #f3f1f5 100%)",
    starfieldHue: 180,
    starfieldHueRange: 60,      // 広い色相範囲（オーロラ的）
    starfieldMaxOpacity: 0.8,
    starfieldPulseSpeed: 1.2,
    particleColor: "rgba(100,200,180,0.3)",
    particleSpeed: 0.9,
    particleDensity: 1.2,
    cardTint: "rgba(245,248,255,0.72)",
    animationSpeed: 0.8,
    orbHue: 160,
    orbBrightness: 1.15,
    orbPulseSpeed: 0.8,
    atmosphereName: "aurora",
    atmosphereDescription: "オーロラ。希望と静けさが共存している。特別な瞬間",
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 4. Emotional Tone Modifiers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * EmotionalTone による微調整
 * Weather Type で大枠を決め、Tone で微妙なニュアンスを加える
 */
function applyEmotionalToneModifiers(
  base: AtmosphereParams,
  tone: EmotionalTone,
  energyLevel: number,
  stressLevel: number,
): AtmosphereParams {
  const modified = { ...base };

  // エネルギーレベルによる全体の明るさ調整
  if (energyLevel < -0.3) {
    // 低エネルギー → 全体的に暗く、ゆっくり
    modified.animationSpeed *= 0.8;
    modified.orbBrightness *= 0.85;
    modified.particleSpeed *= 0.7;
  } else if (energyLevel > 0.5) {
    // 高エネルギー → 全体的に明るく、速く
    modified.animationSpeed *= 1.15;
    modified.orbBrightness *= 1.1;
    modified.particleSpeed *= 1.2;
  }

  // ストレスレベルによるパーティクル調整
  if (stressLevel > 0.6) {
    modified.particleSpeed *= 1.3;
    modified.starfieldPulseSpeed *= 1.2;
    modified.orbPulseSpeed *= 1.3;
  }

  // 感情トーンによる色温度の微調整
  switch (tone) {
    case "anxious":
    case "restless":
      modified.starfieldPulseSpeed *= 1.4;
      modified.particleSpeed *= 1.2;
      break;
    case "calm":
    case "content":
      modified.animationSpeed *= 0.85;
      modified.particleSpeed *= 0.7;
      modified.fogIntensity = Math.min(0.3, modified.fogIntensity + 0.1);
      break;
    case "melancholic":
      modified.orbBrightness *= 0.8;
      modified.starfieldMaxOpacity *= 0.7;
      break;
    case "excited":
    case "hopeful":
      modified.orbBrightness *= 1.15;
      modified.starfieldMaxOpacity = Math.min(0.9, modified.starfieldMaxOpacity * 1.2);
      break;
    case "numb":
      modified.animationSpeed *= 0.6;
      modified.particleDensity *= 0.5;
      modified.fogIntensity = Math.min(0.5, modified.fogIntensity + 0.2);
      break;
    case "overwhelmed":
      modified.particleSpeed *= 1.5;
      modified.particleDensity *= 1.5;
      modified.starfieldPulseSpeed *= 1.5;
      break;
    default:
      break;
  }

  return modified;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 5. Main Entry Point
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Inner Weather データから UI雰囲気パラメータを生成
 *
 * 使い方（AneurasyncHome内で）:
 * ```tsx
 * const [atmosphere, setAtmosphere] = useState(getDefaultAtmosphere());
 *
 * useEffect(() => {
 *   if (innerWeatherData) {
 *     setAtmosphere(generateAtmosphere(innerWeatherData));
 *   }
 * }, [innerWeatherData]);
 *
 * // Starfield に適用:
 * <Starfield hue={atmosphere.starfieldHue} pulseSpeed={atmosphere.starfieldPulseSpeed} />
 *
 * // 背景に適用:
 * <div style={{ background: atmosphere.bgGradient }}>
 *
 * // フォグオーバーレイ:
 * {atmosphere.fogIntensity > 0 && (
 *   <div style={{
 *     position: 'absolute', inset: 0,
 *     background: atmosphere.fogColor,
 *     opacity: atmosphere.fogIntensity,
 *     backdropFilter: `blur(${atmosphere.fogIntensity * 8}px)`,
 *     pointerEvents: 'none',
 *   }} />
 * )}
 * ```
 */
export function generateAtmosphere(weather: WeatherInput): AtmosphereParams {
  // Weather Type でベースを選択
  const weatherBase = WEATHER_ATMOSPHERES[weather.weatherType] ?? {};
  const base: AtmosphereParams = { ...DEFAULT_ATMOSPHERE, ...weatherBase };

  // Emotional Tone で微調整
  return applyEmotionalToneModifiers(
    base,
    weather.emotionalTone,
    weather.energyLevel,
    weather.stressLevel,
  );
}

/**
 * デフォルト雰囲気（Inner Weatherデータ取得前のフォールバック）
 */
export function getDefaultAtmosphere(): AtmosphereParams {
  return { ...DEFAULT_ATMOSPHERE };
}

/**
 * 2つの雰囲気間を補間（トランジション用）
 *
 * Inner Weatherが更新されたとき、急に雰囲気が変わるのではなく、
 * ゆっくりと新しい雰囲気に遷移するために使用。
 */
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § Extended Atmosphere — HomeState シグナル統合
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface AtmosphereExtension {
  /** 矛盾の強度 (0-1) — パーティクル揺らぎと速度に影響 */
  contradictionIntensity?: number;
  /** ストリーク勢い (0-1) — グラデーション暖色化 */
  streakMomentum?: number;
  /** ナラティブフェーズ — 背景の微かなアクセント */
  narrativePhase?: "prologue" | "exploration" | "confrontation" | "integration" | "mastery";
  /** 予測精度トレンド (-1 to 1: negative=下降, positive=上昇) */
  predictionAccuracyTrend?: number;
  /** パーティクルモード (HomeStateEngineから) */
  particleMode?: "standard" | "celebration" | "tension" | "stillness";
  /** 全体強度オーバーライド (0-1) */
  overrideIntensity?: number;
}

const NARRATIVE_ACCENT: Record<string, { hueShift: number; satBoost: number }> = {
  prologue:      { hueShift: 0,    satBoost: 0 },
  exploration:   { hueShift: -15,  satBoost: 0.05 },
  confrontation: { hueShift: 20,   satBoost: 0.15 },  // 赤みを帯びる
  integration:   { hueShift: -30,  satBoost: 0.08 },  // teal方向
  mastery:       { hueShift: 10,   satBoost: 0.1 },   // 金色方向
};

/**
 * 拡張版 Atmosphere 生成
 * Inner Weather + HomeState シグナルを統合して最終的なUI雰囲気を決定する
 */
export function generateExtendedAtmosphere(
  weather: WeatherInput,
  ext: AtmosphereExtension,
): AtmosphereParams {
  // ベース: Inner Weather から通常の雰囲気を生成
  const base = generateAtmosphere(weather);

  // 矛盾 → パーティクル速度・hue揺らぎ増加
  const ci = ext.contradictionIntensity ?? 0;
  if (ci > 0) {
    base.particleSpeed += ci * 0.4;           // 最大40%速く
    base.starfieldHueRange += ci * 20;        // hue揺らぎ拡大
    base.starfieldPulseSpeed += ci * 0.3;
  }

  // ストリーク → 暖色化
  const sm = ext.streakMomentum ?? 0;
  if (sm > 0.3) {
    base.starfieldHue = base.starfieldHue + sm * 15;  // hueを暖色方向に
    base.orbBrightness = Math.min(base.orbBrightness + sm * 0.2, 1);
  }

  // ナラティブフェーズ → hueシフト + 彩度
  const np = ext.narrativePhase;
  if (np && NARRATIVE_ACCENT[np]) {
    const accent = NARRATIVE_ACCENT[np];
    base.starfieldHue += accent.hueShift;
    base.orbHue += accent.hueShift;
    // 彩度はorbBrightnessで近似
    base.orbBrightness = Math.min(base.orbBrightness + accent.satBoost, 1);
  }

  // 予測精度下降 → foggy化
  const pat = ext.predictionAccuracyTrend ?? 0;
  if (pat < -0.1) {
    const fog = Math.abs(pat) * 0.5; // 最大0.5
    base.fogIntensity = Math.min(base.fogIntensity + fog, 0.8);
    base.starfieldMaxOpacity *= (1 - Math.abs(pat) * 0.3);
  } else if (pat > 0.1) {
    // 精度上昇 → 星が明るく
    base.starfieldMaxOpacity = Math.min(base.starfieldMaxOpacity + pat * 0.2, 1);
    base.orbBrightness = Math.min(base.orbBrightness + pat * 0.15, 1);
  }

  // パーティクルモード
  switch (ext.particleMode) {
    case "celebration":
      base.particleDensity *= 1.8;
      base.particleSpeed *= 1.3;
      base.particleColor = "rgba(234,179,8,0.4)";  // gold
      break;
    case "tension":
      base.particleSpeed *= 1.4;
      base.starfieldPulseSpeed *= 1.5;
      break;
    case "stillness":
      base.particleSpeed *= 0.5;
      base.particleDensity *= 0.6;
      base.animationSpeed *= 0.7;
      break;
  }

  // 全体強度オーバーライド
  const oi = ext.overrideIntensity ?? 0;
  if (oi > 0) {
    base.orbBrightness = Math.min(base.orbBrightness + oi * 0.2, 1);
    base.starfieldMaxOpacity = Math.min(base.starfieldMaxOpacity + oi * 0.15, 1);
  }

  return base;
}

/**
 * 2つの雰囲気間を補間（トランジション用）
 *
 * Inner Weatherが更新されたとき、急に雰囲気が変わるのではなく、
 * ゆっくりと新しい雰囲気に遷移するために使用。
 */
export function interpolateAtmosphere(
  from: AtmosphereParams,
  to: AtmosphereParams,
  t: number, // 0-1
): AtmosphereParams {
  const lerp = (a: number, b: number) => a + (b - a) * t;

  return {
    ...to,
    bgGradient: t < 0.5 ? from.bgGradient : to.bgGradient, // グラデーションは中間でスナップ
    starfieldHue: lerp(from.starfieldHue, to.starfieldHue),
    starfieldHueRange: lerp(from.starfieldHueRange, to.starfieldHueRange),
    starfieldMaxOpacity: lerp(from.starfieldMaxOpacity, to.starfieldMaxOpacity),
    starfieldPulseSpeed: lerp(from.starfieldPulseSpeed, to.starfieldPulseSpeed),
    particleSpeed: lerp(from.particleSpeed, to.particleSpeed),
    particleDensity: lerp(from.particleDensity, to.particleDensity),
    cardBlur: lerp(from.cardBlur, to.cardBlur),
    cardBorderOpacity: lerp(from.cardBorderOpacity, to.cardBorderOpacity),
    animationSpeed: lerp(from.animationSpeed, to.animationSpeed),
    fogIntensity: lerp(from.fogIntensity, to.fogIntensity),
    orbPulseSpeed: lerp(from.orbPulseSpeed, to.orbPulseSpeed),
    orbHue: lerp(from.orbHue, to.orbHue),
    orbBrightness: lerp(from.orbBrightness, to.orbBrightness),
  };
}
