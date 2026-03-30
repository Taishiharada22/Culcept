// lib/stargazer/dailyProphecy.ts
// Stargazer v4 — Daily Prophecy Engine (Rewritten)
//
// 原理: 毎朝、今日のユーザーの行動を1つ予測する。
// 翌日ユーザーが検証し、「予測 → 検証」のループが回る。
// 精度スコアが蓄積され、情報ギャップ理論による中毒性を生む。
// 「73%当たっている…残り27%は何なのか？」という問いが
// ユーザーを継続的な自己観測へ導く。
//
// v4 改善点:
// - バーナム効果を排除: 予測は具体的・検証可能な行動描写
// - fluctuationEngine 連携: 条件シフトで予測を変調
// - 曜日コンテキスト: 平日/週末で予測の質感が変わる
// - アーキタイプ固有: 24タイプ別の予測バリアント
// - 5段階検証: exact/close/partial/off/opposite
// - パターン検出: 「月曜の先送り癖」等の具体的パターン
// - シナリオベース: 12+シナリオ × アーキタイプバリアント = 80+予測

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";
import type { Layer1Code, Layer3Code } from "./archetypeTypes";
import type { ConditionShift } from "./fluctuationEngine";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types (backward-compatible)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ProphecyCategory =
  | "decision"
  | "emotion"
  | "social"
  | "energy"
  | "avoidance"
  | "impulse";

export interface DailyProphecy {
  id: string;
  /** 予測対象の日付 (YYYY-MM-DD) */
  prophecyDate: string;
  /** 予測テキスト */
  prediction: string;
  /** カテゴリ */
  category: ProphecyCategory;
  /** システムの確信度 (0-1) */
  confidence: number;
  /** 予測の根拠 */
  basis: ProphecyBasis;
  /** 検証用プロンプト */
  verificationPrompt: string;
  /** 予測が外れた場合の代替解釈 */
  alternativeOutcome: string;
  /** v4: シナリオID (追跡用) */
  scenarioId?: string;
  /** v4: アーキタイプバリアント適用済みか */
  archetypeVariant?: boolean;
  /** v4: 曜日コンテキスト適用済みか */
  weekdayContextApplied?: boolean;
}

export interface ProphecyBasis {
  /** 最も影響力の大きい軸 */
  primaryAxes: string[];
  /** アーキタイプの影響度 (0-1) */
  archetypeInfluence: number;
  /** 現在状態の影響度 (0-1) */
  weatherInfluence: number;
  /** 過去パターンの影響度 (0-1) */
  patternInfluence: number;
  /** この行動を引き起こす状況 */
  triggerCondition: string;
  /** v4: 揺らぎ条件の影響 */
  conditionShifts?: string[];
  /** v4: 信頼度の内訳 */
  confidenceBreakdown?: {
    historical: number;
    axisStability: number;
    dataFreshness: number;
    archetypeConfidence: number;
  };
}

export interface ProphecyVerification {
  prophecyId: string;
  status: "correct" | "partially_correct" | "wrong" | "skipped";
  userNote?: string;
  accuracyScore: number; // 0-1
  /** v4: 5段階の検証レベル */
  verificationLevel?: VerificationLevel;
  /** v4: カテゴリ (追跡用) */
  category?: ProphecyCategory;
}

/** v4: 5段階検証 */
export type VerificationLevel = "exact" | "close" | "partial" | "off" | "opposite";

export interface PredictionAccuracy {
  totalPredictions: number;
  correctPredictions: number;
  partiallyCorrect: number;
  accuracyPercentage: number;
  categoryAccuracy: Record<ProphecyCategory, number>;
  currentStreak: number;
  bestStreak: number;
  trend: "improving" | "stable" | "declining";
  /** v4: カテゴリ別トレンド */
  categoryTrends?: Record<ProphecyCategory, "improving" | "stable" | "declining">;
  /** v4: 検出された行動パターン */
  detectedPatterns?: string[];
}

export interface ProphecyInput {
  userId: string;
  archetypeCode: string;
  axisScores: Record<string, number>;
  currentWeather?: {
    weatherType: string;
    energyLevel: number;
    stressLevel: number;
    emotionalTone: string;
  };
  recentProphecies?: Array<{
    category: ProphecyCategory;
    wasCorrect: boolean;
  }>;
  dayOfWeek: number; // 0=Sunday
  historicalPatterns?: Array<{
    dayOfWeek: number;
    category: string;
    pattern: string;
  }>;
  observationDepth: number; // 0-1
  /** v4: 揺らぎエンジンの条件シフトデータ */
  conditionShifts?: ConditionShift[];
  /** v4: 予測対象日 (YYYY-MM-DD) — 省略時は today */
  targetDate?: string;
}

/** 行動パターン検出結果 */
export interface BehaviorPattern {
  dayOfWeek: number;
  category: ProphecyCategory;
  pattern: string;
  frequency: number;
  confidence: number;
  /** v4: パターンの種別 */
  patternType?: BehaviorPatternType;
}

export type BehaviorPatternType =
  | "weekday_tendency"       // 月曜の先送り癖
  | "post_stress_withdrawal" // ストレス後の引きこもり
  | "weekend_impulsivity"    // 週末の衝動スパイク
  | "energy_cycle"           // エネルギー周期
  | "social_fatigue"         // 社交疲労パターン
  | "avoidance_cascade"      // 回避の連鎖
  | "general";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 決定論的ハッシュ — 同一入力に同一結果を保証する */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** seeded pseudo-random (0-1) from hash */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/** 軸スコアを取得（undefined の場合 0） */
function axis(scores: Record<string, number>, key: TraitAxisKey): number {
  return scores[key] ?? 0;
}

/** 軸IDから日本語ラベルを取得 */
function axisLabel(key: TraitAxisKey, score: number): string {
  const def = TRAIT_AXES.find((a) => a.id === key);
  if (!def) return key;
  return score < 0 ? def.labelLeft : def.labelRight;
}

/** 連続的な軸スコアを modifier (0-1) に変換 */
function axisModifier(scores: Record<string, number>, key: TraitAxisKey, direction: "positive" | "negative"): number {
  const raw = axis(scores, key);
  const v = direction === "positive" ? raw : -raw;
  return Math.max(0, Math.min(1, (v + 1) / 2));
}

/** ISO日付文字列を取得 */
function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}

const DAY_LABELS = ["日曜", "月曜", "火曜", "水曜", "木曜", "金曜", "土曜"] as const;
const CATEGORY_LABELS: Record<ProphecyCategory, string> = {
  decision: "判断",
  emotion: "感情",
  social: "対人",
  energy: "エネルギー",
  avoidance: "回避",
  impulse: "衝動",
};

const ALL_CATEGORIES: ProphecyCategory[] = [
  "decision", "emotion", "social", "energy", "avoidance", "impulse",
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Archetype Modifiers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ArchetypeModifier {
  /** 予測テキストに挿入する行動の質感 */
  actionFlavor: string;
  /** ストレス下の反応 */
  stressReaction: string;
  /** 決断パターン */
  decisionStyle: string;
  /** 社交パターン */
  socialStyle: string;
  /** 回避パターン */
  avoidanceStyle: string;
  /** 衝動パターン */
  impulseStyle: string;
}

/** Layer1 (核: P/B/H) の予測修飾 */
const LAYER1_MODIFIERS: Record<string, Partial<ArchetypeModifier>> = {
  P: {
    actionFlavor: "自分の価値を証明するように",
    decisionStyle: "成果が出る方を選ぶ",
    socialStyle: "能力を認められたい欲求が動く",
    avoidanceStyle: "評価されない場面を避ける",
    impulseStyle: "「もっとやれる」という衝動",
  },
  B: {
    actionFlavor: "誰かとの繋がりを守るように",
    decisionStyle: "関係性を壊さない方を選ぶ",
    socialStyle: "相手の反応を読みすぎる",
    avoidanceStyle: "孤立するリスクを避ける",
    impulseStyle: "「この人ともっと話したい」という衝動",
  },
  H: {
    actionFlavor: "安全な領域を守るように",
    decisionStyle: "リスクが低い方を選ぶ",
    socialStyle: "自分のペースを崩されることを警戒する",
    avoidanceStyle: "未知の領域に踏み込むことを避ける",
    impulseStyle: "「ここは安全じゃない」という警戒の衝動",
  },
};

/** Layer3 (行動スイッチ: A/W/D) の予測修飾 */
const LAYER3_MODIFIERS: Record<string, Partial<ArchetypeModifier>> = {
  A: {
    stressReaction: "圧がかかるほど前に出て、行動で解決しようとする",
    actionFlavor: "攻めの姿勢で",
  },
  W: {
    stressReaction: "立ち止まって状況を観察し、動くタイミングを計る",
    actionFlavor: "慎重に様子を見ながら",
  },
  D: {
    stressReaction: "内側に潜り、一人で処理しようとする",
    actionFlavor: "静かに内面で処理しながら",
  },
};

function getArchetypeModifier(code: string): ArchetypeModifier {
  const l1 = LAYER1_MODIFIERS[code.charAt(0)] ?? {};
  const l3 = LAYER3_MODIFIERS[code.charAt(2)] ?? {};
  return {
    actionFlavor: l3.actionFlavor ?? l1.actionFlavor ?? "",
    stressReaction: l3.stressReaction ?? "普段と違う反応を示す",
    decisionStyle: l1.decisionStyle ?? "いつもの判断パターンに従う",
    socialStyle: l1.socialStyle ?? "普段の対人パターンが出る",
    avoidanceStyle: l1.avoidanceStyle ?? "面倒なことを後回しにする",
    impulseStyle: l1.impulseStyle ?? "抑えていた欲求が表面化する",
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Weekday Context
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface WeekdayContext {
  isWeekend: boolean;
  label: string;
  /** 予測に付加する状況の前提 */
  situationPrefix: string;
  /** カテゴリ重み補正 */
  categoryBoosts: Partial<Record<ProphecyCategory, number>>;
}

const WEEKDAY_CONTEXTS: Record<number, WeekdayContext> = {
  0: {
    isWeekend: true, label: "日曜",
    situationPrefix: "休日の終わり、明日への意識が浮上する中で",
    categoryBoosts: { emotion: 0.15, avoidance: 0.1, energy: 0.1 },
  },
  1: {
    isWeekend: false, label: "月曜",
    situationPrefix: "週の始まり、切り替えのエネルギーが必要な中で",
    categoryBoosts: { decision: 0.15, avoidance: 0.15, energy: 0.1 },
  },
  2: {
    isWeekend: false, label: "火曜",
    situationPrefix: "週のリズムに乗り始め、タスクが動き出す中で",
    categoryBoosts: { decision: 0.1, social: 0.15 },
  },
  3: {
    isWeekend: false, label: "水曜",
    situationPrefix: "週の折り返し、疲労と惰性が交差する中で",
    categoryBoosts: { energy: 0.15, avoidance: 0.1, emotion: 0.1 },
  },
  4: {
    isWeekend: false, label: "木曜",
    situationPrefix: "週末が見え始め、集中力と開放感がせめぎ合う中で",
    categoryBoosts: { social: 0.15, impulse: 0.1 },
  },
  5: {
    isWeekend: false, label: "金曜",
    situationPrefix: "一週間の疲労が蓄積し、解放への期待が高まる中で",
    categoryBoosts: { impulse: 0.2, emotion: 0.1, social: 0.1 },
  },
  6: {
    isWeekend: true, label: "土曜",
    situationPrefix: "自由な時間の中で、普段抑えているものが顔を出す中で",
    categoryBoosts: { impulse: 0.15, emotion: 0.15, social: 0.1 },
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scenario-Based Prediction System
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface PredictionScenario {
  id: string;
  category: ProphecyCategory;
  /** 軸条件: 連続値として使用 (閾値ではなく強度として) */
  primaryAxis: TraitAxisKey;
  secondaryAxis?: TraitAxisKey;
  /** 予測生成関数: 軸スコア・アーキタイプ・曜日から具体的テキストを生成 */
  generate: (ctx: ScenarioContext) => ScenarioOutput;
}

interface ScenarioContext {
  scores: Record<string, number>;
  archMod: ArchetypeModifier;
  archetypeCode: string;
  weekday: WeekdayContext;
  weather?: ProphecyInput["currentWeather"];
  conditionShifts?: ConditionShift[];
  /** primary axis score (-1 to 1) */
  primary: number;
  /** secondary axis score (-1 to 1) */
  secondary: number;
  /** seeded random 0-1 for this scenario */
  rand: number;
}

interface ScenarioOutput {
  text: string;
  alternative: string;
  trigger: string;
  axes: TraitAxisKey[];
}

// --- DECISION scenarios (14) ---
const DECISION_SCENARIOS: PredictionScenario[] = [
  {
    id: "dec_safe_regret",
    category: "decision",
    primaryAxis: "cautious_vs_bold",
    secondaryAxis: "analytical_vs_intuitive",
    generate: (ctx) => {
      const cautiousness = 1 - axisModifier(ctx.scores, "cautious_vs_bold", "positive");
      if (cautiousness > 0.6) {
        return {
          text: `${ctx.weekday.situationPrefix}、選択肢が2つ以上ある場面で、あなたはリスクの低い方を選ぶ。そして${ctx.weekday.isWeekend ? "夜" : "帰り道"}に「もう一方を選んでいたら」と具体的に想像する。${ctx.archMod.decisionStyle}から、その想像は5分以上続く`,
          alternative: "リスクのある方を選べた場合、あなたの判断回路に新しい経路が生まれつつある。これは観測すべき変化",
          trigger: "2つ以上の選択肢がある場面で",
          axes: ["cautious_vs_bold", "analytical_vs_intuitive"],
        };
      }
      return {
        text: `${ctx.weekday.situationPrefix}、誰かが「こっちの方が安全だよ」と助言する。あなたはその助言を聞いた上で、あえて別の選択をする。理由を聞かれたら「なんとなく」と答えるが、実際には明確な直感がある`,
        alternative: "安全策を選んだ場合、今日は大胆さより知恵が勝った日。どちらもあなたの武器",
        trigger: "他者から安全策を勧められる場面で",
        axes: ["cautious_vs_bold", "analytical_vs_intuitive"],
      };
    },
  },
  {
    id: "dec_procrastinate",
    category: "decision",
    primaryAxis: "plan_vs_spontaneous",
    secondaryAxis: "perfectionist_vs_pragmatic",
    generate: (ctx) => {
      const perfectionism = 1 - axisModifier(ctx.scores, "perfectionist_vs_pragmatic", "positive");
      const isMonday = ctx.weekday.label === "月曜";
      const dayNote = isMonday ? "週明けの億劫さも重なり、" : "";
      if (perfectionism > 0.55) {
        return {
          text: `${dayNote}今日、あるタスクの着手を「もう少し情報を集めてから」と先送りにする。実際には情報は十分あるが、${ctx.archMod.actionFlavor}完璧な状態を待ってしまう。先送りの時間は合計で40分以上になる`,
          alternative: "すぐ着手できた場合、完璧主義の壁が低くなっている。この変化は3週間前には見られなかったはず",
          trigger: "新しいタスクや返信が必要な場面で",
          axes: ["plan_vs_spontaneous", "perfectionist_vs_pragmatic"],
        };
      }
      return {
        text: `${dayNote}今日、計画にないことを突然始める。本来やるべきことがあるのに、${ctx.archMod.actionFlavor}別のことに30分以上集中してしまう。それは逃避ではなく、脳が本当に欲しいものを教えている`,
        alternative: "計画通りに動けた場合、即興性が発動しなかった分、近いうちにどこかで爆発する",
        trigger: "予定の隙間に偶然何かを見つけたとき",
        axes: ["plan_vs_spontaneous", "perfectionist_vs_pragmatic"],
      };
    },
  },
  {
    id: "dec_opposing_opinion",
    category: "decision",
    primaryAxis: "independence_vs_harmony",
    secondaryAxis: "direct_vs_diplomatic",
    generate: (ctx) => {
      const harmony = axisModifier(ctx.scores, "independence_vs_harmony", "positive");
      if (harmony > 0.6) {
        return {
          text: "誰かがあなたの提案に異論を述べる。あなたは表面上「なるほど」と受け入れるが、内心では自分の案の方が正しいと確信している。その不一致を、今日は誰にも言わずに飲み込む",
          alternative: "本音を伝えられた場合、調和より正直さを選ぶ力が育っている",
          trigger: "自分の意見に反対される場面で",
          axes: ["independence_vs_harmony", "direct_vs_diplomatic"],
        };
      }
      return {
        text: "誰かがあなたの考えに反対意見を述べる。あなたは即座に反論し、自分の論理で相手を説得しようとする。会話の後、相手の表情が少し硬かったことに気づくが、意見は曲げない",
        alternative: "相手に合わせた場合、独立性が協調に歩み寄った日。どちらが正解かは3日後にわかる",
        trigger: "意見が対立する場面で",
        axes: ["independence_vs_harmony", "direct_vs_diplomatic"],
      };
    },
  },
  {
    id: "dec_intuition_test",
    category: "decision",
    primaryAxis: "analytical_vs_intuitive",
    generate: (ctx) => {
      const intuitive = axisModifier(ctx.scores, "analytical_vs_intuitive", "positive");
      if (intuitive > 0.6) {
        return {
          text: "今日、情報が不十分な状態で判断を求められる。あなたは「感覚的にこっち」と即断する。その判断は後から振り返っても正しいが、なぜ正しかったかを言語化できない",
          alternative: "分析的に判断した場合、直感回路が一時オフラインの日。データが力になる",
          trigger: "情報不足で判断を迫られる場面で",
          axes: ["analytical_vs_intuitive"],
        };
      }
      return {
        text: "今日、直感で「こっちだ」と感じる瞬間がある。しかしあなたはその直感を信じず、データや根拠を探し始める。探した結果、直感と同じ結論に至るが、30分余計にかかる",
        alternative: "直感に従えた場合、分析的な脳が直感を信じ始めている。大きな転換点",
        trigger: "複数の選択肢を比較検討する場面で",
        axes: ["analytical_vs_intuitive"],
      };
    },
  },
  {
    id: "dec_change_crossroads",
    category: "decision",
    primaryAxis: "change_embrace_vs_resist",
    generate: (ctx) => {
      const resistChange = 1 - axisModifier(ctx.scores, "change_embrace_vs_resist", "positive");
      const isFriday = ctx.weekday.label === "金曜";
      if (resistChange > 0.6) {
        return {
          text: `今日、${isFriday ? "来週からの" : ""}何かを変えるチャンスが来る。新しいやり方、新しいルート、新しい選択。あなたは一瞬考えた後、いつも通りを選ぶ。安心感と、かすかな物足りなさが同居する`,
          alternative: "変化を選べた場合、安定志向の壁を超え始めている。その勇気を記録して",
          trigger: "いつもと違うやり方を提案される場面で",
          axes: ["change_embrace_vs_resist"],
        };
      }
      return {
        text: `今日、${isFriday ? "来週に向けて" : ""}何かを変えたくなる衝動が来る。まだ変える必要がないのに、プロセスやルーティンを壊したくなる。その衝動に従うと、周りは少し驚く`,
        alternative: "現状維持を選んだ場合、変化欲求が一時的に静まった日。次の波は近い",
        trigger: "日常のルーティンの中で退屈を感じた瞬間",
        axes: ["change_embrace_vs_resist"],
      };
    },
  },
  {
    id: "dec_time_pressure",
    category: "decision",
    primaryAxis: "cautious_vs_bold",
    secondaryAxis: "plan_vs_spontaneous",
    generate: (ctx) => ({
      text: `今日、時間に追われる場面がある。${axis(ctx.scores, "plan_vs_spontaneous") < -0.2 ? "普段なら計画的に対処するあなたが、" : ""}締め切りが近づくと${ctx.archMod.actionFlavor}、最後の10分で普段の2倍の速度で仕上げる。結果は悪くないが、「もっと早くやれたのに」と思う`,
      alternative: "余裕を持って終えられた場合、時間管理の新しいパターンが定着しつつある",
      trigger: "締め切りや時間制限のある場面で",
      axes: ["cautious_vs_bold", "plan_vs_spontaneous"],
    }),
  },
  {
    id: "dec_midweek_fatigue",
    category: "decision",
    primaryAxis: "perfectionist_vs_pragmatic",
    generate: (ctx) => {
      const isWednesday = ctx.weekday.label === "水曜";
      return {
        text: `${isWednesday ? "週の折り返しの疲労感の中で、" : ""}今日、「まあいいか」と妥協する場面がある。普段の基準なら許せないクオリティだが、${ctx.archMod.actionFlavor}エネルギーを温存する判断をする。それは怠慢ではなく、${isWednesday ? "水曜日特有の" : ""}省エネモード`,
        alternative: "妥協しなかった場合、完璧主義が今日も健在。ただしエネルギー消費に注意",
        trigger: "タスクの質と完了速度を天秤にかける場面で",
        axes: ["perfectionist_vs_pragmatic"],
      };
    },
  },
];

// --- EMOTION scenarios (14) ---
const EMOTION_SCENARIOS: PredictionScenario[] = [
  {
    id: "emo_overreact_recover",
    category: "emotion",
    primaryAxis: "emotional_variability",
    secondaryAxis: "emotional_regulation",
    generate: (ctx) => {
      const variability = axisModifier(ctx.scores, "emotional_variability", "positive");
      if (variability > 0.6) {
        return {
          text: `今日の${ctx.weekday.isWeekend ? "午後" : "仕事中"}、予想外の出来事に対して声のトーンが上がる。周りには分からない程度だが、心拍数は確実に上がっている。ただし${ctx.weekday.isWeekend ? "2時間" : "1時間"}後にはもう笑っている`,
          alternative: "冷静でいられた場合、感情の波が穏やかになっている期間に入った",
          trigger: "予期しない出来事が起きた瞬間",
          axes: ["emotional_variability", "emotional_regulation"],
        };
      }
      return {
        text: `今日、周りの人が感情的になる場面で、あなたは${ctx.archMod.actionFlavor}静かに状況を観察している。その冷静さは強さだが、「なぜ自分は動揺しないのか」という疑問が一瞬よぎる`,
        alternative: "珍しく感情が動いた場合、安定の下にある感情層が表面化した。注目すべき瞬間",
        trigger: "周囲の感情が高まる場面で",
        axes: ["emotional_variability", "emotional_regulation"],
      };
    },
  },
  {
    id: "emo_reassurance_word",
    category: "emotion",
    primaryAxis: "reassurance_need",
    generate: (ctx) => {
      const needsReassurance = axisModifier(ctx.scores, "reassurance_need", "positive");
      if (needsReassurance > 0.55) {
        return {
          text: "今日、誰かからの短い一言——「ありがとう」「助かった」「すごいね」——が、予想以上に心に残る。その言葉を、寝る前にもう一度思い出す",
          alternative: "特に響く言葉がなかった場合、今日は自分の内側に安心の源がある状態",
          trigger: "信頼する人との何気ない会話の中で",
          axes: ["reassurance_need"],
        };
      }
      return {
        text: "今日、誰かがあなたを褒める。あなたは「そんなことないよ」と流すが、その言葉は実は正確にあなたの努力を捉えている。受け取り下手が発動する",
        alternative: "素直に受け取れた場合、自己評価の壁が薄くなっている",
        trigger: "評価やフィードバックを受ける場面で",
        axes: ["reassurance_need"],
      };
    },
  },
  {
    id: "emo_solitude_impulse",
    category: "emotion",
    primaryAxis: "stress_isolation_vs_social",
    generate: (ctx) => {
      const isolate = 1 - axisModifier(ctx.scores, "stress_isolation_vs_social", "positive");
      if (isolate > 0.6) {
        return {
          text: `今日の${ctx.weekday.isWeekend ? "午前中" : "15時頃"}、突然一人になりたくなる。理由は説明できないが、人の声が少しだけ重く感じる。${ctx.archMod.stressReaction}。15分の静寂が、2時間分の休息と同じ効果を持つ`,
          alternative: "一人になりたくならなかった場合、今日のエネルギーは十分に充電されている",
          trigger: "人が多い環境に30分以上いた後で",
          axes: ["stress_isolation_vs_social"],
        };
      }
      return {
        text: "今日、一人の時間に落ち着かなくなる瞬間がある。静かすぎる空間が逆にストレスに感じ、誰かに連絡したくなる。孤独耐性が低い日",
        alternative: "一人で平気だった場合、社交エネルギーが十分蓄積されている状態",
        trigger: "一人で過ごす時間が長くなったとき",
        axes: ["stress_isolation_vs_social"],
      };
    },
  },
  {
    id: "emo_public_private_gap",
    category: "emotion",
    primaryAxis: "public_private_gap",
    generate: (ctx) => ({
      text: `今日、人前で笑顔を見せた直後に、${ctx.weekday.isWeekend ? "鏡の前" : "トイレか休憩室"}で真顔に戻る瞬間がある。その切り替えの速さに、自分でも少し驚く。それは演技ではなく、社会的自分と本当の自分の切り替えコスト`,
      alternative: "表裏の差を感じなかった場合、今日は社会的自分と本音の自分が近い距離にいる",
      trigger: "社交的な場面の直後に一人になった瞬間",
      axes: ["public_private_gap"],
    }),
  },
  {
    id: "emo_aesthetic_hit",
    category: "emotion",
    primaryAxis: "function_vs_expression",
    generate: (ctx) => {
      const expressive = axisModifier(ctx.scores, "function_vs_expression", "positive");
      if (expressive > 0.55) {
        return {
          text: `今日、視覚的に美しいもの——${ctx.weekday.isWeekend ? "空の色、街の風景、誰かの服" : "画面のデザイン、文章の構成、照明の具合"}——に、3秒以上見入る瞬間がある。言語化できない「いい」という感覚。それを誰かに伝えたくなるが、伝えない`,
          alternative: "特に感動がなかった場合、今は実用モードが優勢。美的感覚は充電中",
          trigger: "日常の中で美的なものに触れる瞬間",
          axes: ["function_vs_expression"],
        };
      }
      return {
        text: "今日、「きれいだな」と思う瞬間がある。普段は機能性を重視するあなたが、珍しく見た目や雰囲気に反応する。その反応を大事にして",
        alternative: "美的反応がなかった場合、実用モードが安定稼働中。それもあなたのリズム",
        trigger: "視覚的に印象的なものに出会ったとき",
        axes: ["function_vs_expression"],
      };
    },
  },
  {
    id: "emo_sunday_dread",
    category: "emotion",
    primaryAxis: "emotional_regulation",
    generate: (ctx) => {
      const isSunday = ctx.weekday.label === "日曜";
      return {
        text: `${isSunday ? "夕方になると、明日への漠然とした重さが胸に浮かぶ。" : ""}今日、特定の理由がないのに気分が少し沈む時間帯がある。${ctx.archMod.actionFlavor}それに対処しようとするが、原因がないので対処のしようがない。${isSunday ? "日曜の夜特有の現象" : "ただ通り過ぎるのを待つ"}`,
        alternative: "終日安定していた場合、感情のベースラインが高い位置にある",
        trigger: isSunday ? "日曜の夕方以降" : "午後の静かな時間帯",
        axes: ["emotional_regulation"],
      };
    },
  },
  {
    id: "emo_frustration_leak",
    category: "emotion",
    primaryAxis: "emotional_regulation",
    secondaryAxis: "direct_vs_diplomatic",
    generate: (ctx) => ({
      text: `今日、小さな苛立ちが蓄積する。一つ一つは些細だが、3つ目の刺激で${axis(ctx.scores, "direct_vs_diplomatic") < 0 ? "つい言葉に出てしまう。後で「言い過ぎた」と思う" : "表情に出る。周りは気づかないが、自分では気づいている"}`,
      alternative: "苛立ちがなかった場合、今日のストレス耐性は高水準。または刺激が少なかった日",
      trigger: "小さな不便や期待外れが重なったとき",
      axes: ["emotional_regulation", "direct_vs_diplomatic"],
    }),
  },
];

// --- SOCIAL scenarios (14) ---
const SOCIAL_SCENARIOS: PredictionScenario[] = [
  {
    id: "soc_post_chat_anxiety",
    category: "social",
    primaryAxis: "social_initiative",
    secondaryAxis: "reassurance_need",
    generate: (ctx) => {
      const needsReassurance = axisModifier(ctx.scores, "reassurance_need", "positive");
      if (needsReassurance > 0.55) {
        return {
          text: `今日、誰かと${ctx.weekday.isWeekend ? "会って話した" : "メッセージをやり取りした"}後、「変なこと言わなかったかな」と振り返る時間がある。実際には何も問題ないが、相手の反応の微細なニュアンスを過剰に解釈する`,
          alternative: "気にならなかった場合、対人不安が和らいでいる。信頼のベースが上がっている",
          trigger: "やや重要な相手との会話やメッセージの後で",
          axes: ["social_initiative", "reassurance_need"],
        };
      }
      return {
        text: `今日、${ctx.weekday.isWeekend ? "友人や家族" : "同僚や知人"}との会話で、あなたが場の空気を自然と作る場面がある。意図していないのに、話題の中心にいる`,
        alternative: "控えめだった場合、今日は聞き役の日。それも重要な社交スキル",
        trigger: "3人以上で話す場面で",
        axes: ["social_initiative", "reassurance_need"],
      };
    },
  },
  {
    id: "soc_boundary_draw",
    category: "social",
    primaryAxis: "boundary_awareness",
    secondaryAxis: "intimacy_pace",
    generate: (ctx) => {
      const boundaryHigh = axisModifier(ctx.scores, "boundary_awareness", "positive");
      if (boundaryHigh > 0.6) {
        return {
          text: "今日、誰かがあなたのパーソナルスペースに一歩踏み込んでくる。物理的にか心理的にか。あなたは笑顔のまま、しかし明確に線を引く。相手は気づいていないかもしれないが、あなたの中では境界線がはっきり動いた",
          alternative: "境界線を緩めた場合、その相手への信頼が想像以上に深い",
          trigger: "距離が近づきつつある人との場面で",
          axes: ["boundary_awareness", "intimacy_pace"],
        };
      }
      return {
        text: "今日、誰かとの距離が急に近くなる感覚がある。いつの間にか打ち解けていて、「もうこんな話をしているのか」と少し驚く",
        alternative: "距離が変わらなかった場合、今日は対人エネルギーが内向きの日",
        trigger: "比較的新しい関係の人と過ごす場面で",
        axes: ["boundary_awareness", "intimacy_pace"],
      };
    },
  },
  {
    id: "soc_straight_talk",
    category: "social",
    primaryAxis: "direct_vs_diplomatic",
    generate: (ctx) => {
      const direct = 1 - axisModifier(ctx.scores, "direct_vs_diplomatic", "positive");
      if (direct > 0.6) {
        return {
          text: "今日、本音をストレートに口に出す場面がある。言った瞬間「しまった」と感じるが、相手は意外と受け入れる。あなたの率直さは、思っているほど嫌われていない",
          alternative: "言葉を選んだ場合、外交力が育っているか、相手との関係を大切に思っている証拠",
          trigger: "意見を求められる場面で",
          axes: ["direct_vs_diplomatic"],
        };
      }
      return {
        text: "今日、言いたいことがあるのに、相手の反応を想像して飲み込む場面がある。帰り道に、あの時言えばよかったと思う。言葉は胃の中に沈んでいく",
        alternative: "本音が言えた場合、外交モードが正直モードに一時切り替わった。記録すべき変化",
        trigger: "意見が異なる相手との会話で",
        axes: ["direct_vs_diplomatic"],
      };
    },
  },
  {
    id: "soc_mode_switch",
    category: "social",
    primaryAxis: "relationship_mode_split",
    generate: (ctx) => ({
      text: `今日、${ctx.weekday.isWeekend ? "友人と家族、あるいは異なるグループの人" : "仕事の人とプライベートの人"}に連続して会うことがある。声のトーン、話し方、振る舞いが切り替わる瞬間を、今日は自覚する。どちらも本当のあなただが、切り替えコストが少しだけ疲れとして残る`,
      alternative: "一貫した自分でいられた場合、関係モードの統合が進んでいる",
      trigger: "異なる人間関係を行き来する場面で",
      axes: ["relationship_mode_split"],
    }),
  },
  {
    id: "soc_introvert_drain",
    category: "social",
    primaryAxis: "introvert_vs_extrovert",
    generate: (ctx) => {
      const introvert = 1 - axisModifier(ctx.scores, "introvert_vs_extrovert", "positive");
      if (introvert > 0.6) {
        return {
          text: `今日、人と会った後に「電池残量20%」のような疲労を感じる。${ctx.weekday.isWeekend ? "帰宅後はしばらく誰とも話したくない" : "デスクに戻った後、5分間何もしない時間が必要"}。それは弱さではなく、深く関わった証拠`,
          alternative: "疲れなかった場合、相手との相性が非常に良いか、浅い付き合いで済んだ",
          trigger: "30分以上の対面コミュニケーションの後で",
          axes: ["introvert_vs_extrovert"],
        };
      }
      return {
        text: `今日、誰かと話すことでエネルギーが充電される瞬間がある。${ctx.weekday.isWeekend ? "友人との会話" : "同僚との雑談"}の後、タスクへの集中力が上がる。あなたにとって人は消耗源ではなくエネルギー源`,
        alternative: "一人が心地よかった場合、今日は内向モードの日。外向的な人にもそういう日がある",
        trigger: "人と話す機会がある場面で",
        axes: ["introvert_vs_extrovert"],
      };
    },
  },
  {
    id: "soc_harmony_cost",
    category: "social",
    primaryAxis: "independence_vs_harmony",
    generate: (ctx) => ({
      text: `今日、${ctx.archMod.socialStyle}。${axis(ctx.scores, "independence_vs_harmony") > 0.2 ? "グループの意思決定で、自分の意見を飲み込んで多数派に合わせる場面がある。帰り道に「なぜ合わせたんだろう」と思う" : "集団の中で、あなたの意見が少数派になる。しかし自分の立場を変えない。その頑固さが、実は周りに安心感を与えている"}`,
      alternative: "予測と逆の行動をとった場合、この軸が揺れている日。観測データとして貴重",
      trigger: "グループで何かを決める場面で",
      axes: ["independence_vs_harmony"],
    }),
  },
];

// --- ENERGY scenarios (14) ---
const ENERGY_SCENARIOS: PredictionScenario[] = [
  {
    id: "nrg_afternoon_crash",
    category: "energy",
    primaryAxis: "cautious_vs_bold",
    secondaryAxis: "perfectionist_vs_pragmatic",
    generate: (ctx) => {
      const isWednesday = ctx.weekday.label === "水曜";
      return {
        text: `今日の${isWednesday ? "14時頃" : "午後"}、エネルギーが急降下する瞬間がある。${ctx.archMod.actionFlavor}無理をして乗り切ろうとするが、集中力は確実に落ちている。${isWednesday ? "水曜日のエネルギー低下パターン" : "午後の自然なリズム"}を認めた方が、明日の自分が楽になる`,
        alternative: "終日安定していた場合、エネルギー管理が上手くいった日。何をしたか記録して",
        trigger: "午後の時間帯",
        axes: ["cautious_vs_bold", "perfectionist_vs_pragmatic"],
      };
    },
  },
  {
    id: "nrg_spontaneous_burst",
    category: "energy",
    primaryAxis: "plan_vs_spontaneous",
    generate: (ctx) => ({
      text: `今日、${ctx.weekday.isWeekend ? "朝起きた瞬間に" : "ルーティンの隙間で"}突然やる気が出るタスクがある。計画にないことだが、${ctx.archMod.actionFlavor}そこにエネルギーが流れ込む。それは退屈への反応であり、脳が本当に欲しいものを教えている`,
      alternative: "計画通りに動いた場合、即興性がセーブされた分、蓄積されている",
      trigger: "予定の隙間に何かを見つけたとき",
      axes: ["plan_vs_spontaneous"],
    }),
  },
  {
    id: "nrg_social_battery",
    category: "energy",
    primaryAxis: "introvert_vs_extrovert",
    generate: (ctx) => {
      const introvert = 1 - axisModifier(ctx.scores, "introvert_vs_extrovert", "positive");
      return {
        text: `今日、${introvert > 0.6 ? "人と会った後に予想以上の疲労を感じる。帰宅後、30分は何もできない" : "人と話すことでエネルギーが充電され、一人になると逆に消耗する"}。${ctx.weekday.isWeekend ? "休日なのにエネルギー管理が必要" : "仕事後の残りエネルギーに影響する"}`,
        alternative: `${introvert > 0.6 ? "疲れなかった場合、相手との距離が心地よかった証拠" : "一人でも平気だった場合、内向モードの日"}`,
        trigger: "対人コミュニケーションの前後",
        axes: ["introvert_vs_extrovert"],
      };
    },
  },
  {
    id: "nrg_novelty_charge",
    category: "energy",
    primaryAxis: "change_embrace_vs_resist",
    secondaryAxis: "tradition_vs_novelty",
    generate: (ctx) => ({
      text: `今日、いつもと少し違うことをする。${ctx.weekday.isWeekend ? "いつもと違う店に行く、違う道を歩く、違うジャンルの音楽を聴く" : "いつもと違う順序でタスクをこなす、違うツールを試す"}。その小さな変化が、予想以上にエネルギーを生む`,
      alternative: "いつも通りだった場合、安定を選ぶ力も武器。変化と安定のバランスが取れている",
      trigger: "日常のルーティンの中で",
      axes: ["change_embrace_vs_resist", "tradition_vs_novelty"],
    }),
  },
  {
    id: "nrg_deep_focus",
    category: "energy",
    primaryAxis: "quality_vs_quantity",
    generate: (ctx) => ({
      text: `今日、一つのことに深く集中して時間を忘れる。気づいたら${ctx.weekday.isWeekend ? "2時間" : "45分"}経っている。${ctx.archMod.actionFlavor}フロー状態に入る。ただし、その後の反動で別のタスクへの切り替えに苦労する`,
      alternative: "集中できなかった場合、心が何かを処理中。表面の散漫さの下に内的整理がある",
      trigger: "興味のあるタスクに取り組むとき",
      axes: ["quality_vs_quantity"],
    }),
  },
  {
    id: "nrg_weekend_recharge",
    category: "energy",
    primaryAxis: "introvert_vs_extrovert",
    generate: (ctx) => {
      if (ctx.weekday.isWeekend) {
        return {
          text: "今日、「何もしない」という選択をする時間がある。罪悪感を少し感じるが、その時間こそが来週のエネルギーを生む。何もしない能力は、実は高度なスキル",
          alternative: "活動的に過ごした場合、エネルギー残高が高い状態。ただし月曜の自分に相談してから決めて",
          trigger: "休日の空白時間",
          axes: ["introvert_vs_extrovert"],
        };
      }
      return {
        text: `今日、「週末までもう少し」という意識が、${ctx.archMod.actionFlavor}タスクへの取り組み方に微妙に影響する。緊急度の低いものは無意識に後回しにし、「金曜にやればいい」という計算が走る`,
        alternative: "全力で取り組めた場合、エネルギー管理が優秀な日",
        trigger: "優先度の低いタスクに向き合うとき",
        axes: ["introvert_vs_extrovert"],
      };
    },
  },
];

// --- AVOIDANCE scenarios (14) ---
const AVOIDANCE_SCENARIOS: PredictionScenario[] = [
  {
    id: "avo_topic_dodge",
    category: "avoidance",
    primaryAxis: "emotional_regulation",
    secondaryAxis: "stress_isolation_vs_social",
    generate: (ctx) => ({
      text: `今日、ある特定のテーマ——${ctx.archMod.avoidanceStyle}——について考えることを無意識に避ける。スマホを触る、別の作業を始める、音楽をかける。回避行動自体には気づかないが、夜に振り返ると「そういえばあれについて考えなかった」と気づく`,
      alternative: "向き合えた場合、心の準備が整ったサイン。タイミングが来ていた",
      trigger: "未解決の問題が頭の端をよぎるとき",
      axes: ["emotional_regulation", "stress_isolation_vs_social"],
    }),
  },
  {
    id: "avo_invitation_decline",
    category: "avoidance",
    primaryAxis: "boundary_awareness",
    generate: (ctx) => ({
      text: `今日、${ctx.weekday.isWeekend ? "遊びや外出" : "飲み会や集まり"}の誘いが来る。${ctx.archMod.actionFlavor}断る理由を考え始めた時点で、答えは「行きたくない」。でも断った後に罪悪感が${axis(ctx.scores, "boundary_awareness") > 0.3 ? "一瞬だけ" : "30分以上"}続く`,
      alternative: "行った場合、意外と楽しかったなら、あなたの直感より社交性の方が正しい日だった",
      trigger: "予定外の誘いが来たとき",
      axes: ["boundary_awareness"],
    }),
  },
  {
    id: "avo_perfectionism_delay",
    category: "avoidance",
    primaryAxis: "perfectionist_vs_pragmatic",
    generate: (ctx) => {
      const perfectionism = 1 - axisModifier(ctx.scores, "perfectionist_vs_pragmatic", "positive");
      if (perfectionism > 0.55) {
        return {
          text: `今日、${ctx.weekday.label === "月曜" ? "週明けのタスクの中で" : ""}完璧にできる自信がないことを先延ばしにする。「もう少し準備してから」「今日は調子が悪いから」。言い訳は合理的に聞こえるが、本音は「失敗が怖い」`,
          alternative: "着手できた場合、完璧主義の壁を越えた。この一歩は見た目より大きい",
          trigger: "新しいタスクや挑戦的な依頼に直面したとき",
          axes: ["perfectionist_vs_pragmatic"],
        };
      }
      return {
        text: "今日、「とりあえずやってみる」精神で着手するが、途中で「これでいいのか」という疑念が湧く。しかし最後までやり切る。完成度は70%だが、それで十分機能する",
        alternative: "着手できなかった場合、普段の実行力が一時オフラインの日",
        trigger: "不確実なタスクに取り組むとき",
        axes: ["perfectionist_vs_pragmatic"],
      };
    },
  },
  {
    id: "avo_honesty_swallow",
    category: "avoidance",
    primaryAxis: "public_private_gap",
    secondaryAxis: "direct_vs_diplomatic",
    generate: (ctx) => ({
      text: `今日、本音を言うべき場面で、${ctx.archMod.actionFlavor}無意識にオブラートに包む。${ctx.weekday.isWeekend ? "家族や友人" : "同僚や上司"}に対して。帰り道に「あのとき本当のことを言えばよかった」と思うが、言わなかった理由も分かっている`,
      alternative: "本音が言えた場合、表裏のギャップが縮まりつつある成長の証",
      trigger: "信頼できる人との会話で意見が異なるとき",
      axes: ["public_private_gap", "direct_vs_diplomatic"],
    }),
  },
  {
    id: "avo_change_safety",
    category: "avoidance",
    primaryAxis: "change_embrace_vs_resist",
    generate: (ctx) => ({
      text: `今日、変化のチャンスが来る。新しい方法、新しい場所、新しい関係。あなたは${axis(ctx.scores, "change_embrace_vs_resist") < -0.2 ? "一瞬興味を示すが、最終的にいつも通りを選ぶ。安心感と、かすかな物足りなさが同居する" : "変化に飛び込むが、心のどこかで「前の方が良かったかも」と感じる瞬間がある"}`,
      alternative: "予測と逆だった場合、この軸が揺れている時期。変化への態度が再構築中",
      trigger: "新しい選択肢が提示されたとき",
      axes: ["change_embrace_vs_resist"],
    }),
  },
  {
    id: "avo_monday_resistance",
    category: "avoidance",
    primaryAxis: "plan_vs_spontaneous",
    generate: (ctx) => {
      const isMonday = ctx.weekday.label === "月曜";
      return {
        text: `${isMonday ? "月曜日特有の現象: " : ""}今日、やるべきことリストの中に「見て見ぬフリ」をする項目が1つある。そのタスクの存在は認識しているが、${ctx.archMod.actionFlavor}目を逸らす。${isMonday ? "週明けの切り替えコストが回避を加速させている" : "先送りすればするほど心理的重さが増すことは分かっている"}`,
        alternative: "全て処理できた場合、今日の実行力は高水準。何がその力を生んだか記録して",
        trigger: "タスクリストを見たとき",
        axes: ["plan_vs_spontaneous"],
      };
    },
  },
];

// --- IMPULSE scenarios (14) ---
const IMPULSE_SCENARIOS: PredictionScenario[] = [
  {
    id: "imp_unplanned_passion",
    category: "impulse",
    primaryAxis: "plan_vs_spontaneous",
    secondaryAxis: "tradition_vs_novelty",
    generate: (ctx) => ({
      text: `今日、${ctx.weekday.isWeekend ? "SNSやネットで見つけた何か" : "仕事の合間にふと目に入った何か"}に、計画外の時間を注ぎ込む。${ctx.archMod.impulseStyle}。それは逃避ではなく、あなたの本当の興味の方角を示すコンパスの針`,
      alternative: "計画通りだった場合、即興性が蓄積中。近いうちに爆発するかもしれない",
      trigger: "予定の隙間に偶然何かを見つけたとき",
      axes: ["plan_vs_spontaneous", "tradition_vs_novelty"],
    }),
  },
  {
    id: "imp_impulse_buy",
    category: "impulse",
    primaryAxis: "cautious_vs_bold",
    secondaryAxis: "analytical_vs_intuitive",
    generate: (ctx) => {
      const isFriday = ctx.weekday.label === "金曜";
      const isSaturday = ctx.weekday.label === "土曜";
      return {
        text: `今日、${isFriday || isSaturday ? "週末の開放感も手伝って" : ""}何かを衝動的に買う（またはカートに入れる）。${axis(ctx.scores, "analytical_vs_intuitive") > 0.2 ? "金額は問題ないが、「本当に必要か」の検証をスキップした" : "買った後で費用対効果を計算し始めるが、もう遅い"}。その衝動の正体は、${ctx.archMod.impulseStyle}`,
        alternative: "衝動を抑えた場合、理性と本能のバランスが取れている。でも本能の声も聞いてあげて",
        trigger: "買い物やサービスの選択場面で",
        axes: ["cautious_vs_bold", "analytical_vs_intuitive"],
      };
    },
  },
  {
    id: "imp_expression_surge",
    category: "impulse",
    primaryAxis: "function_vs_expression",
    secondaryAxis: "minimal_vs_maximal",
    generate: (ctx) => ({
      text: `今日、自分を表現したい衝動が沸き上がる。${ctx.weekday.isWeekend ? "服の選び方、部屋の模様替え、SNS投稿" : "メールの言い回し、資料のデザイン、話し方"}に、いつもより力が入る。${ctx.archMod.actionFlavor}、あなたの美学が表面化する日`,
      alternative: "表現欲が静かだった場合、内側に蓄積中。次の爆発は近い",
      trigger: "自分を見せる機会がある場面で",
      axes: ["function_vs_expression", "minimal_vs_maximal"],
    }),
  },
  {
    id: "imp_contact_urge",
    category: "impulse",
    primaryAxis: "social_initiative",
    generate: (ctx) => ({
      text: `今日、普段は連絡しない人に突然メッセージを送りたくなる。${ctx.archMod.actionFlavor}指がスマホに伸びる。${axis(ctx.scores, "social_initiative") > 0.3 ? "実際に送る。相手は少し驚くが、嫌がってはいない" : "送ろうとして、やめる。「今さら何を話すんだ」と自分にブレーキをかける"}`,
      alternative: "その衝動がなかった場合、今は自分の内側と向き合う時期",
      trigger: "SNSやメッセージアプリを開いたとき",
      axes: ["social_initiative"],
    }),
  },
  {
    id: "imp_life_disruption",
    category: "impulse",
    primaryAxis: "change_embrace_vs_resist",
    secondaryAxis: "cautious_vs_bold",
    generate: (ctx) => ({
      text: `今日、現状を壊したい衝動がチラッと顔を出す。${ctx.weekday.isWeekend ? "生活、関係、住む場所" : "仕事、チーム、プロジェクト"}——何かを根本から変えたくなる。${ctx.archMod.actionFlavor}その衝動は${axis(ctx.scores, "cautious_vs_bold") > 0.2 ? "行動として一歩踏み出す。小さな変化だが、方向は大きい" : "5分で収まるが、その5分間の感情の強さを覚えておいて"}`,
      alternative: "衝動がなかった場合、今の生活への満足度が高い。それ自体が貴重な情報",
      trigger: "ルーティンの繰り返しの中で",
      axes: ["change_embrace_vs_resist", "cautious_vs_bold"],
    }),
  },
  {
    id: "imp_friday_release",
    category: "impulse",
    primaryAxis: "plan_vs_spontaneous",
    generate: (ctx) => {
      const isFriday = ctx.weekday.label === "金曜";
      return {
        text: `${isFriday ? "金曜日の解放感が引き金になり、" : ""}今日、「自分にご褒美」という名目で、普段なら選ばない選択をする。${ctx.archMod.actionFlavor}少し贅沢な食事、予定外の寄り道、いつもより長い休憩。それは怠慢ではなく、${isFriday ? "一週間の" : ""}蓄積された自制心の解放`,
        alternative: "自制が続いた場合、意志力が高い日。ただしどこかで解放しないと反動が来る",
        trigger: `${isFriday ? "金曜の午後以降" : "自由時間がある場面で"}`,
        axes: ["plan_vs_spontaneous"],
      };
    },
  },
];

const SCENARIO_MAP: Record<ProphecyCategory, PredictionScenario[]> = {
  decision: DECISION_SCENARIOS,
  emotion: EMOTION_SCENARIOS,
  social: SOCIAL_SCENARIOS,
  energy: ENERGY_SCENARIOS,
  avoidance: AVOIDANCE_SCENARIOS,
  impulse: IMPULSE_SCENARIOS,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Category Selection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function selectProphecyCategory(input: ProphecyInput): ProphecyCategory {
  const weekdayCtx = WEEKDAY_CONTEXTS[input.dayOfWeek] ?? WEEKDAY_CONTEXTS[1];
  const weights: Record<ProphecyCategory, number> = {
    decision: 0.15,
    emotion: 0.15,
    social: 0.15,
    energy: 0.15,
    avoidance: 0.15,
    impulse: 0.15,
  };

  // Weekday context boosts
  for (const [cat, boost] of Object.entries(weekdayCtx.categoryBoosts)) {
    weights[cat as ProphecyCategory] += boost;
  }

  // Archetype Layer1 boost
  const layer1 = input.archetypeCode.charAt(0);
  const layer3 = input.archetypeCode.charAt(2);
  if (layer1 === "P") weights.decision += 0.1;
  if (layer1 === "B") weights.social += 0.1;
  if (layer1 === "H") weights.avoidance += 0.1;
  if (layer3 === "A") weights.impulse += 0.1;
  if (layer3 === "W") weights.avoidance += 0.08;
  if (layer3 === "D") weights.emotion += 0.1;

  // Weather-based adjustments
  if (input.currentWeather) {
    if (input.currentWeather.stressLevel > 0.6) {
      weights.avoidance += 0.1;
      weights.emotion += 0.08;
    }
    if (input.currentWeather.energyLevel < 0.3) {
      weights.energy += 0.12;
      weights.avoidance += 0.05;
    }
    if (input.currentWeather.energyLevel > 0.7) {
      weights.impulse += 0.08;
      weights.social += 0.05;
    }
  }

  // Condition shift influence
  if (input.conditionShifts && input.conditionShifts.length > 0) {
    for (const shift of input.conditionShifts) {
      if (shift.condition.includes("stress") || shift.condition.includes("frustrated")) {
        weights.avoidance += 0.05 * shift.confidence;
        weights.emotion += 0.05 * shift.confidence;
      }
      if (shift.condition.includes("low_energy") || shift.condition.includes("tired")) {
        weights.energy += 0.08 * shift.confidence;
      }
      if (shift.condition.includes("social") || shift.condition.includes("many_people")) {
        weights.social += 0.05 * shift.confidence;
      }
    }
  }

  // Suppress recently used categories (3-day window)
  const recentCategories = (input.recentProphecies ?? []).slice(0, 3).map((p) => p.category);
  for (const recent of recentCategories) {
    weights[recent] *= 0.2;
  }

  // Boost categories with high accuracy (build user confidence)
  if (input.recentProphecies && input.recentProphecies.length > 0) {
    const accurateCategories = new Map<ProphecyCategory, number>();
    for (const p of input.recentProphecies) {
      const current = accurateCategories.get(p.category) ?? 0;
      accurateCategories.set(p.category, current + (p.wasCorrect ? 1 : 0));
    }
    for (const [cat, correct] of accurateCategories) {
      if (correct > 0) {
        weights[cat] *= (1 + correct * 0.12);
      }
    }
  }

  // FIX #10: Include ISO date string in seed for date-dependent selection
  const dateStr = input.targetDate ?? toISODate(new Date());
  const seed = hashStr(input.userId + dateStr + input.archetypeCode);
  const entries = Object.entries(weights) as [ProphecyCategory, number][];
  const totalWeight = entries.reduce((s, [, w]) => s + w, 0);
  if (totalWeight === 0) return "decision";

  const target = seededRandom(seed) * totalWeight;
  let cumulative = 0;
  for (const [cat, w] of entries) {
    cumulative += w;
    if (cumulative >= target) return cat;
  }
  return entries[entries.length - 1][0];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prediction Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function generatePrediction(
  category: ProphecyCategory,
  axisScores: Record<string, number>,
  weather: ProphecyInput["currentWeather"],
  archetype: string,
  dayOfWeek?: number,
  targetDate?: string,
  conditionShifts?: ConditionShift[],
): { text: string; basis: ProphecyBasis; alternative: string; scenarioId: string } {
  const weekday = WEEKDAY_CONTEXTS[dayOfWeek ?? new Date().getDay()] ?? WEEKDAY_CONTEXTS[1];
  const archMod = getArchetypeModifier(archetype);
  const scenarios = SCENARIO_MAP[category];

  // Date-dependent deterministic selection
  const dateStr = targetDate ?? toISODate(new Date());
  const seed = hashStr(category + archetype + dateStr);

  // Score each scenario by how well its axes match the user
  const scored = scenarios.map((s) => {
    const primary = axis(axisScores, s.primaryAxis);
    const secondary = s.secondaryAxis ? axis(axisScores, s.secondaryAxis) : 0;
    // Higher absolute value = more differentiated = better prediction
    const relevance = Math.abs(primary) * 0.7 + Math.abs(secondary) * 0.3 + 0.1;
    return { scenario: s, relevance, primary, secondary };
  });

  // Sort by relevance, then pick from top 3 using seed
  scored.sort((a, b) => b.relevance - a.relevance);
  const topN = Math.min(3, scored.length);
  const pick = scored[seed % topN];
  const s = pick.scenario;

  const ctx: ScenarioContext = {
    scores: axisScores,
    archMod,
    archetypeCode: archetype,
    weekday,
    weather,
    conditionShifts,
    primary: pick.primary,
    secondary: pick.secondary,
    rand: seededRandom(seed + 1),
  };

  const output = s.generate(ctx);

  // Weather modulation
  let text = output.text;
  if (weather) {
    if (weather.stressLevel > 0.7) {
      text += "。ストレスが高い今日は、特にその傾向が強く出る";
    } else if (weather.energyLevel < 0.3) {
      text += "。エネルギーが低い分、その反応はより穏やかな形で現れるかもしれない";
    }
  }

  // Condition shift modulation
  const conditionNotes: string[] = [];
  if (conditionShifts && conditionShifts.length > 0) {
    for (const shift of conditionShifts.slice(0, 2)) {
      if (shift.confidence > 0.5) {
        conditionNotes.push(shift.conditionLabel);
      }
    }
  }

  // Influence calculation
  const matchStrength = Math.min(pick.relevance, 1);
  const archetypeInfluence = 0.25 + matchStrength * 0.15;
  const weatherInfluence = weather
    ? Math.min(weather.stressLevel * 0.3 + (1 - weather.energyLevel) * 0.2, 0.4)
    : 0;
  const patternInfluence = Math.max(0.1, 1 - archetypeInfluence - weatherInfluence);

  const basis: ProphecyBasis = {
    primaryAxes: output.axes,
    archetypeInfluence,
    weatherInfluence,
    patternInfluence,
    triggerCondition: output.trigger,
    conditionShifts: conditionNotes.length > 0 ? conditionNotes : undefined,
  };

  return { text, basis, alternative: output.alternative, scenarioId: s.id };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Confidence Calibration (FIX #6)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function calibrateConfidence(
  observationDepth: number,
  categoryAccuracy: number,
  isNovel: boolean,
  options?: {
    axisStability?: number;       // 0-1
    dataFreshnessDays?: number;   // days since last observation
    archetypeConfidence?: number; // 0-1
  },
): number {
  // Base: observation depth
  let confidence = 0.3 + observationDepth * 0.25;

  // Historical category accuracy
  const historicalBoost = categoryAccuracy > 0 ? categoryAccuracy * 0.2 : 0;
  confidence += historicalBoost;

  // Axis stability bonus
  const stability = options?.axisStability ?? 0.5;
  confidence += stability * 0.1;

  // Data freshness penalty
  const freshness = options?.dataFreshnessDays ?? 0;
  if (freshness > 14) {
    confidence *= 0.85;
  } else if (freshness > 7) {
    confidence *= 0.92;
  }

  // Archetype confidence
  const archConf = options?.archetypeConfidence ?? 0.5;
  confidence += archConf * 0.08;

  // Novel penalty
  if (isNovel) {
    confidence *= 0.78;
  }

  // Clamp
  return Math.max(0.25, Math.min(0.88, confidence));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Verification Prompt
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function generateVerificationPrompt(prediction: string, category: ProphecyCategory): string {
  const shortPrediction =
    prediction.length > 60 ? prediction.slice(0, 60) + "..." : prediction;

  const categoryPrompts: Record<ProphecyCategory, string> = {
    decision: "今日、予言のような判断の場面はありましたか？",
    emotion: "今日、予言のような感情の動きはありましたか？",
    social: "今日、予言のような対人場面はありましたか？",
    energy: "今日、予言のようなエネルギーの変化はありましたか？",
    avoidance: "今日、予言のような回避行動はありましたか？",
    impulse: "今日、予言のような衝動はありましたか？",
  };

  return `昨日の予言：「${shortPrediction}」\n${categoryPrompts[category]}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Accuracy Calculation (FIX #5, #9)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Map 5-level verification to legacy status and score */
export function mapVerificationLevel(level: VerificationLevel): { status: ProphecyVerification["status"]; score: number } {
  switch (level) {
    case "exact":    return { status: "correct", score: 1.0 };
    case "close":    return { status: "correct", score: 0.8 };
    case "partial":  return { status: "partially_correct", score: 0.5 };
    case "off":      return { status: "wrong", score: 0.15 };
    case "opposite": return { status: "wrong", score: 0.0 };
  }
}

export function calculateAccuracy(
  verifications: ProphecyVerification[],
): PredictionAccuracy {
  const evaluated = verifications.filter((v) => v.status !== "skipped");

  if (evaluated.length === 0) {
    return {
      totalPredictions: 0,
      correctPredictions: 0,
      partiallyCorrect: 0,
      accuracyPercentage: 0,
      categoryAccuracy: {
        decision: 0, emotion: 0, social: 0,
        energy: 0, avoidance: 0, impulse: 0,
      },
      currentStreak: 0,
      bestStreak: 0,
      trend: "stable",
    };
  }

  const correct = evaluated.filter((v) => v.status === "correct").length;
  const partial = evaluated.filter((v) => v.status === "partially_correct").length;

  // Weighted accuracy: correct=1.0, partially_correct=0.5
  const weightedScore = correct + partial * 0.5;
  const accuracyPercentage =
    evaluated.length > 0
      ? Math.round((weightedScore / evaluated.length) * 100)
      : 0;

  // Category accuracy (FIX #5: use category field from verification)
  const categoryGroups = new Map<ProphecyCategory, { total: number; score: number }>();
  for (const v of evaluated) {
    const cat = v.category;
    if (!cat) continue;
    const group = categoryGroups.get(cat) ?? { total: 0, score: 0 };
    group.total++;
    group.score += v.accuracyScore;
    categoryGroups.set(cat, group);
  }

  const categoryAccuracy: Record<ProphecyCategory, number> = {
    decision: 0, emotion: 0, social: 0,
    energy: 0, avoidance: 0, impulse: 0,
  };
  const categoryTrends: Record<ProphecyCategory, "improving" | "stable" | "declining"> = {
    decision: "stable", emotion: "stable", social: "stable",
    energy: "stable", avoidance: "stable", impulse: "stable",
  };

  for (const [cat, data] of categoryGroups) {
    categoryAccuracy[cat] = data.total > 0 ? data.score / data.total : 0;
  }

  // FIX #9: Streak calculation with clean forward iteration
  let currentStreak = 0;
  let bestStreak = 0;
  let runningStreak = 0;

  for (let i = 0; i < evaluated.length; i++) {
    const v = evaluated[i];
    if (v.status === "correct" || v.status === "partially_correct") {
      runningStreak++;
      bestStreak = Math.max(bestStreak, runningStreak);
    } else {
      runningStreak = 0;
    }
  }
  // currentStreak = streak at the end of the array
  currentStreak = runningStreak;

  // Trend: recent 5 vs previous 5
  let trend: "improving" | "stable" | "declining" = "stable";
  if (evaluated.length >= 10) {
    const recent5 = evaluated.slice(-5);
    const prev5 = evaluated.slice(-10, -5);
    const recentScore = recent5.reduce((s, v) => s + v.accuracyScore, 0) / 5;
    const prevScore = prev5.reduce((s, v) => s + v.accuracyScore, 0) / 5;
    const diff = recentScore - prevScore;
    if (diff > 0.1) trend = "improving";
    else if (diff < -0.1) trend = "declining";
  }

  // Category trends
  for (const cat of ALL_CATEGORIES) {
    const catVerifications = evaluated.filter((v) => v.category === cat);
    if (catVerifications.length >= 6) {
      const half = Math.floor(catVerifications.length / 2);
      const recentHalf = catVerifications.slice(half);
      const earlierHalf = catVerifications.slice(0, half);
      const recentAvg = recentHalf.reduce((s, v) => s + v.accuracyScore, 0) / recentHalf.length;
      const earlierAvg = earlierHalf.reduce((s, v) => s + v.accuracyScore, 0) / earlierHalf.length;
      const diff = recentAvg - earlierAvg;
      if (diff > 0.12) categoryTrends[cat] = "improving";
      else if (diff < -0.12) categoryTrends[cat] = "declining";
    }
  }

  // Detect patterns for return
  const detectedPatterns: string[] = [];
  // Check for weekday tendencies in the data if we have category info
  const catCounts = new Map<ProphecyCategory, number>();
  for (const v of evaluated) {
    if (v.category && v.accuracyScore >= 0.5) {
      catCounts.set(v.category, (catCounts.get(v.category) ?? 0) + 1);
    }
  }
  for (const [cat, count] of catCounts) {
    if (count >= 3 && categoryAccuracy[cat] > 0.6) {
      detectedPatterns.push(`${CATEGORY_LABELS[cat]}カテゴリの予測精度が高い（${Math.round(categoryAccuracy[cat] * 100)}%）`);
    }
  }

  return {
    totalPredictions: evaluated.length,
    correctPredictions: correct,
    partiallyCorrect: partial,
    accuracyPercentage,
    categoryAccuracy,
    currentStreak,
    bestStreak,
    trend,
    categoryTrends,
    detectedPatterns: detectedPatterns.length > 0 ? detectedPatterns : undefined,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Behavior Pattern Detection (FIX #7)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function detectBehaviorPatterns(
  history: Array<{
    dayOfWeek: number;
    category: ProphecyCategory;
    wasCorrect: boolean;
    prediction: string;
  }>,
  targetDayOfWeek: number,
): BehaviorPattern[] {
  if (history.length < 7) return [];

  const patterns: BehaviorPattern[] = [];

  // --- Pattern Type 1: Weekday-specific category tendencies ---
  const dayData = history.filter((h) => h.dayOfWeek === targetDayOfWeek);
  const categoryGroups = new Map<ProphecyCategory, { total: number; correct: number }>();
  for (const entry of dayData) {
    const group = categoryGroups.get(entry.category) ?? { total: 0, correct: 0 };
    group.total++;
    if (entry.wasCorrect) group.correct++;
    categoryGroups.set(entry.category, group);
  }

  for (const [category, data] of categoryGroups) {
    if (data.total < 2) continue;
    const accuracy = data.correct / data.total;
    if (accuracy > 0.6) {
      patterns.push({
        dayOfWeek: targetDayOfWeek,
        category,
        pattern: `${DAY_LABELS[targetDayOfWeek]}に${CATEGORY_LABELS[category]}系の予測が当たりやすい（${Math.round(accuracy * 100)}%）`,
        frequency: data.total,
        confidence: Math.min(accuracy * (data.total / 5), 1),
        patternType: "weekday_tendency",
      });
    }
  }

  // --- Pattern Type 2: Monday procrastination ---
  const mondayAvoidance = history.filter(
    (h) => h.dayOfWeek === 1 && h.category === "avoidance" && h.wasCorrect,
  );
  if (mondayAvoidance.length >= 2) {
    const total = history.filter((h) => h.dayOfWeek === 1 && h.category === "avoidance").length;
    const rate = mondayAvoidance.length / Math.max(total, 1);
    if (rate > 0.5) {
      patterns.push({
        dayOfWeek: 1,
        category: "avoidance",
        pattern: `月曜日に先送り・回避パターンが発動しやすい（${Math.round(rate * 100)}%的中）`,
        frequency: mondayAvoidance.length,
        confidence: Math.min(rate * (mondayAvoidance.length / 3), 1),
        patternType: "weekday_tendency",
      });
    }
  }

  // --- Pattern Type 3: Weekend impulsivity ---
  const weekendImpulse = history.filter(
    (h) => (h.dayOfWeek === 0 || h.dayOfWeek === 6) && h.category === "impulse" && h.wasCorrect,
  );
  if (weekendImpulse.length >= 2) {
    const total = history.filter(
      (h) => (h.dayOfWeek === 0 || h.dayOfWeek === 6) && h.category === "impulse",
    ).length;
    const rate = weekendImpulse.length / Math.max(total, 1);
    if (rate > 0.5) {
      patterns.push({
        dayOfWeek: -1,
        category: "impulse",
        pattern: `週末に衝動的行動が増える傾向（${Math.round(rate * 100)}%的中）`,
        frequency: weekendImpulse.length,
        confidence: Math.min(rate * (weekendImpulse.length / 3), 1),
        patternType: "weekend_impulsivity",
      });
    }
  }

  // --- Pattern Type 4: Post-stress withdrawal (consecutive day pattern) ---
  // Look for: avoidance/emotion correct on day after energy correct
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];
    if (
      prev.category === "energy" && prev.wasCorrect &&
      (curr.category === "avoidance" || curr.category === "emotion") && curr.wasCorrect
    ) {
      const existing = patterns.find((p) => p.patternType === "post_stress_withdrawal");
      if (existing) {
        existing.frequency++;
        existing.confidence = Math.min(existing.confidence + 0.1, 1);
      } else {
        patterns.push({
          dayOfWeek: -1,
          category: curr.category,
          pattern: "エネルギー消耗の翌日に感情的回避・引きこもりパターンが出やすい",
          frequency: 1,
          confidence: 0.4,
          patternType: "post_stress_withdrawal",
        });
      }
    }
  }

  // --- Pattern Type 5: Social fatigue cycle ---
  const socialCorrect = history.filter((h) => h.category === "social" && h.wasCorrect);
  const energyAfterSocial: number[] = [];
  for (let i = 0; i < history.length - 1; i++) {
    if (history[i].category === "social" && history[i].wasCorrect) {
      if (history[i + 1].category === "energy" && history[i + 1].wasCorrect) {
        energyAfterSocial.push(i);
      }
    }
  }
  if (energyAfterSocial.length >= 2) {
    patterns.push({
      dayOfWeek: -1,
      category: "energy",
      pattern: "社交的な日の翌日にエネルギー低下パターンが出やすい",
      frequency: energyAfterSocial.length,
      confidence: Math.min(energyAfterSocial.length / 4, 1),
      patternType: "social_fatigue",
    });
  }

  // --- General: High accuracy categories ---
  const allCategoryGroups = new Map<ProphecyCategory, { total: number; correct: number }>();
  for (const entry of history) {
    const group = allCategoryGroups.get(entry.category) ?? { total: 0, correct: 0 };
    group.total++;
    if (entry.wasCorrect) group.correct++;
    allCategoryGroups.set(entry.category, group);
  }
  for (const [category, data] of allCategoryGroups) {
    if (data.total < 5) continue;
    const accuracy = data.correct / data.total;
    if (accuracy > 0.7) {
      patterns.push({
        dayOfWeek: -1,
        category,
        pattern: `${CATEGORY_LABELS[category]}カテゴリの予測精度が全体的に高い（${Math.round(accuracy * 100)}%）`,
        frequency: data.total,
        confidence: Math.min(accuracy * (data.total / 10), 1),
        patternType: "general",
      });
    }
  }

  return patterns.sort((a, b) => b.confidence - a.confidence);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Entry Point
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function generateDailyProphecy(input: ProphecyInput): DailyProphecy {
  const dateStr = input.targetDate ?? toISODate(new Date());

  // Step 1: Category selection
  const category = selectProphecyCategory(input);

  // Step 2: Prediction generation
  const { text, basis, alternative, scenarioId } = generatePrediction(
    category,
    input.axisScores,
    input.currentWeather,
    input.archetypeCode,
    input.dayOfWeek,
    dateStr,
    input.conditionShifts,
  );

  // Step 3: Confidence calibration
  const recentOfCategory = (input.recentProphecies ?? []).filter(
    (p) => p.category === category,
  );
  const categoryAccuracy =
    recentOfCategory.length > 0
      ? recentOfCategory.filter((p) => p.wasCorrect).length / recentOfCategory.length
      : 0;
  const isNovel = recentOfCategory.length < 2;

  const confidence = calibrateConfidence(
    input.observationDepth,
    categoryAccuracy,
    isNovel,
  );

  // Step 4: Verification prompt
  const verificationPrompt = generateVerificationPrompt(text, category);

  // ID: user + date + category (unique per day)
  const id = `prophecy_${input.userId.slice(0, 8)}_${dateStr}_${category}`;

  return {
    id,
    prophecyDate: dateStr,
    prediction: text,
    category,
    confidence,
    basis,
    verificationPrompt,
    alternativeOutcome: alternative,
    scenarioId,
    archetypeVariant: true,
    weekdayContextApplied: true,
  };
}
