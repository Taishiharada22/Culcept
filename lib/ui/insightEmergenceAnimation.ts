// lib/ui/insightEmergenceAnimation.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Insight Emergence Animation（洞察の湧出アニメーション）
//
// 脳科学的根拠:
// 報酬の遅延は期待値を上げる（Kable & Glimcher, 2007）。
// 深い洞察ほどゆっくり現れることで、脳は「これは重要だ」と判断する。
// 即時表示 vs 遅延表示で記憶の定着率が異なる。
//
// 設計:
// - 表層insight → 即座に表示（200ms fade-in）
// - 深層insight → 水中から浮かび上がるように3秒かけて出現
// - 核心insight → 文字が一文字ずつ結晶化するように出現
//
// 3つのアニメーションモード:
// 1. "fade" — 標準的なフェードイン（表層用）
// 2. "emerge" — 下から浮かび上がる（深層用）
// 3. "crystallize" — 一文字ずつ結晶化（核心用）
//
// 既存資産:
// - NeuralWhisper のタイプライター機構（28ms/文字）を再利用
// - Framer Motion の AnimatePresence を活用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 洞察の深度レベル */
export type InsightDepth =
  | "surface"       // 表層: 基本的な観察、パターン確認
  | "intermediate"  // 中間: パターンの意味、因果推論
  | "deep"          // 深層: 盲点、矛盾、無自覚な傾向
  | "core";         // 核心: 自己の根本的な洞察、変容のきっかけ

/** アニメーションモード */
export type EmergenceMode = "fade" | "emerge" | "crystallize";

/** アニメーションパラメータ */
export interface EmergenceParams {
  /** アニメーションモード */
  mode: EmergenceMode;
  /** 全体の所要時間（ms） */
  durationMs: number;
  /** 開始までの遅延（ms） */
  delayMs: number;
  /** テキストが読了可能になるまでの時間（ms） */
  readableAtMs: number;

  // ─── Fade Mode ───
  fade?: {
    /** 初期不透明度 */
    initialOpacity: number;
    /** イージング */
    easing: string;
  };

  // ─── Emerge Mode ───
  emerge?: {
    /** 初期Y位置（px、正の値=下方） */
    initialY: number;
    /** 初期のブラー値（px） */
    initialBlur: number;
    /** 初期のスケール */
    initialScale: number;
    /** イージング */
    easing: string;
    /** 浮上中の不透明度カーブ */
    opacityCurve: number[];
  };

  // ─── Crystallize Mode ───
  crystallize?: {
    /** 1文字あたりの出現時間（ms） */
    charDurationMs: number;
    /** 文字の初期状態 */
    charInitialOpacity: number;
    charInitialScale: number;
    charInitialBlur: number;
    /** 文字間の遅延（ms） */
    charDelayMs: number;
    /** 完了後の全体的な輝きアニメーション */
    glowAfterComplete: boolean;
    /** 輝きの色 */
    glowColor: string;
  };

  // ─── Sound & Haptics ───
  /** 効果音の種類（optional） */
  soundEffect: "none" | "soft_chime" | "deep_resonance" | "crystal_tone";
  /** ハプティクスの種類（optional） */
  hapticPattern: "none" | "gentle_tap" | "slow_pulse" | "impact";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Depth-to-Animation Mapping
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 洞察の深度に応じたアニメーションパラメータを生成
 *
 * 核心原理: 深いほど遅い。遅いほど脳は「重要」と判断する。
 */
export function getEmergenceParams(depth: InsightDepth): EmergenceParams {
  switch (depth) {
    // ━━━ Surface: 即座に表示（200ms） ━━━
    case "surface":
      return {
        mode: "fade",
        durationMs: 200,
        delayMs: 0,
        readableAtMs: 100,
        fade: {
          initialOpacity: 0,
          easing: "ease-out",
        },
        soundEffect: "none",
        hapticPattern: "none",
      };

    // ━━━ Intermediate: ゆるやかに浮上（1.2秒） ━━━
    case "intermediate":
      return {
        mode: "emerge",
        durationMs: 1200,
        delayMs: 200,
        readableAtMs: 800,
        emerge: {
          initialY: 20,
          initialBlur: 4,
          initialScale: 0.98,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          opacityCurve: [0, 0.3, 0.7, 1], // 序盤は遅く、後半で一気に
        },
        soundEffect: "soft_chime",
        hapticPattern: "gentle_tap",
      };

    // ━━━ Deep: 深海から浮上（3秒） ━━━
    case "deep":
      return {
        mode: "emerge",
        durationMs: 3000,
        delayMs: 500,
        readableAtMs: 2000,
        emerge: {
          initialY: 40,
          initialBlur: 8,
          initialScale: 0.95,
          easing: "cubic-bezier(0.11, 0, 0.5, 0)",
          opacityCurve: [0, 0.1, 0.4, 0.8, 1], // 非常にゆっくり明確に
        },
        soundEffect: "deep_resonance",
        hapticPattern: "slow_pulse",
      };

    // ━━━ Core: 一文字ずつ結晶化（テキスト長に依存） ━━━
    case "core":
      return {
        mode: "crystallize",
        durationMs: 0, // テキスト長に依存（計算で決まる）
        delayMs: 800,
        readableAtMs: 0, // 最後の文字が出現した時点
        crystallize: {
          charDurationMs: 40,
          charInitialOpacity: 0,
          charInitialScale: 0.8,
          charInitialBlur: 3,
          charDelayMs: 40,
          glowAfterComplete: true,
          glowColor: "rgba(140,100,255,0.15)",
        },
        soundEffect: "crystal_tone",
        hapticPattern: "impact",
      };
  }
}

/**
 * テキストの長さからCrystallizeモードの実際の所要時間を計算
 */
export function calculateCrystallizeDuration(
  text: string,
  params: EmergenceParams,
): number {
  if (params.mode !== "crystallize" || !params.crystallize) {
    return params.durationMs;
  }

  const charCount = text.length;
  const totalCharTime = charCount * params.crystallize.charDelayMs;
  const lastCharDuration = params.crystallize.charDurationMs;
  const glowDuration = params.crystallize.glowAfterComplete ? 600 : 0;

  return params.delayMs + totalCharTime + lastCharDuration + glowDuration;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Framer Motion Variants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Framer Motion の variants を生成
 *
 * 使い方:
 * ```tsx
 * const params = getEmergenceParams("deep");
 * const variants = toFramerVariants(params);
 *
 * <motion.div
 *   variants={variants}
 *   initial="hidden"
 *   animate="visible"
 * >
 *   {insightText}
 * </motion.div>
 * ```
 */
export function toFramerVariants(params: EmergenceParams): {
  hidden: Record<string, unknown>;
  visible: Record<string, unknown>;
} {
  switch (params.mode) {
    case "fade":
      return {
        hidden: {
          opacity: params.fade?.initialOpacity ?? 0,
        },
        visible: {
          opacity: 1,
          transition: {
            duration: params.durationMs / 1000,
            delay: params.delayMs / 1000,
            ease: params.fade?.easing ?? "easeOut",
          },
        },
      };

    case "emerge":
      return {
        hidden: {
          opacity: 0,
          y: params.emerge?.initialY ?? 30,
          scale: params.emerge?.initialScale ?? 0.97,
          filter: `blur(${params.emerge?.initialBlur ?? 6}px)`,
        },
        visible: {
          opacity: 1,
          y: 0,
          scale: 1,
          filter: "blur(0px)",
          transition: {
            duration: params.durationMs / 1000,
            delay: params.delayMs / 1000,
            ease: params.emerge?.easing
              ? (() => {
                  const nums = params.emerge!.easing.match(/[\d.]+/g);
                  return nums ? nums.map(Number) : [0.22, 1, 0.36, 1];
                })()
              : [0.22, 1, 0.36, 1],
          },
        },
      };

    case "crystallize":
      // Crystallizeモードでは親コンテナのvariantsは最小限
      // 個々の文字は別途アニメーション
      return {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            delay: params.delayMs / 1000,
            duration: 0.3,
          },
        },
      };
  }
}

/**
 * Crystallizeモードの個々の文字のvariantsを生成
 *
 * 使い方:
 * ```tsx
 * const charVariants = toCrystallizeCharVariants(params, index);
 *
 * {text.split("").map((char, i) => (
 *   <motion.span
 *     key={i}
 *     variants={toCrystallizeCharVariants(params, i)}
 *     initial="hidden"
 *     animate="visible"
 *   >
 *     {char}
 *   </motion.span>
 * ))}
 * ```
 */
export function toCrystallizeCharVariants(
  params: EmergenceParams,
  charIndex: number,
): {
  hidden: Record<string, unknown>;
  visible: Record<string, unknown>;
} {
  const c = params.crystallize;
  if (!c) {
    return { hidden: { opacity: 0 }, visible: { opacity: 1 } };
  }

  return {
    hidden: {
      opacity: c.charInitialOpacity,
      scale: c.charInitialScale,
      filter: `blur(${c.charInitialBlur}px)`,
    },
    visible: {
      opacity: 1,
      scale: 1,
      filter: "blur(0px)",
      transition: {
        duration: c.charDurationMs / 1000,
        delay: (params.delayMs + charIndex * c.charDelayMs) / 1000,
        ease: "easeOut",
      },
    },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 4. Insight Depth Classification
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 洞察テキストの特性から深度を自動判定
 *
 * source: どのエンジンから生成されたか
 * confidence: エンジンの確信度
 * isContradiction: 矛盾に関する洞察か
 * isFirstOccurrence: 初めて検出されたか
 */
export function classifyInsightDepth(params: {
  source: string;
  confidence: number;
  isContradiction?: boolean;
  isFirstOccurrence?: boolean;
  isBlindSpot?: boolean;
  isPredictionError?: boolean;
  textLength?: number;
}): InsightDepth {
  // 矛盾 + 盲点 + 初出 = 核心
  if (
    params.isContradiction &&
    params.isBlindSpot &&
    params.isFirstOccurrence
  ) {
    return "core";
  }

  // 盲点の初出 = 深層
  if (params.isBlindSpot && params.isFirstOccurrence) {
    return "deep";
  }

  // 矛盾 OR 予測誤差 = 深層
  if (params.isContradiction || params.isPredictionError) {
    return "deep";
  }

  // 確信度が高い + 長いテキスト = 中間
  if (params.confidence >= 0.7 && (params.textLength ?? 0) > 50) {
    return "intermediate";
  }

  // デフォルト = 表層
  return "surface";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 5. Glow Effect (Post-Crystallize)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Crystallizeモード完了後の輝きエフェクトのCSS
 *
 * 核心洞察が完全に結晶化した後、
 * テキスト全体がほのかに輝く瞬間を作る。
 * 「これは特別な洞察だ」という視覚的シグナル。
 */
export function getGlowEffectCSS(
  params: EmergenceParams,
): Record<string, string> | null {
  if (
    params.mode !== "crystallize" ||
    !params.crystallize?.glowAfterComplete
  ) {
    return null;
  }

  return {
    textShadow: `0 0 20px ${params.crystallize.glowColor}, 0 0 40px ${params.crystallize.glowColor}`,
    transition: "text-shadow 0.6s ease-in-out",
  };
}

/**
 * 深度に応じた背景の「呼吸」アニメーション
 *
 * 洞察が表示されている間、背景が微かに脈動する。
 * 深い洞察ほどゆっくり、大きく脈動。
 */
export function getBreathingAnimation(depth: InsightDepth): {
  scale: [number, number];
  opacity: [number, number];
  durationMs: number;
} {
  switch (depth) {
    case "surface":
      return { scale: [1, 1], opacity: [1, 1], durationMs: 0 };
    case "intermediate":
      return { scale: [1, 1.005], opacity: [1, 0.95], durationMs: 4000 };
    case "deep":
      return { scale: [1, 1.01], opacity: [1, 0.9], durationMs: 6000 };
    case "core":
      return { scale: [1, 1.015], opacity: [1, 0.85], durationMs: 8000 };
  }
}
