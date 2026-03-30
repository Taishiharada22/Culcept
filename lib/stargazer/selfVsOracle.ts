// lib/stargazer/selfVsOracle.ts
// Self vs Oracle エンジン — 毎日の自己予測 vs AI予測 対決
//
// 核心思想:
// ユーザーが「自分はこう反応するだろう」と予測し、
// AIの Oracle 予測と精度を競う。
// Oracleが勝つ = ユーザーの盲点が露出する瞬間。
// ユーザーが勝つ = 自己理解が深まっている証拠。
//
// SAS (Self-Accuracy Score) は自己認識の精度を0-100で表す。

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES, TRAIT_AXIS_KEYS } from "./traitAxes";
import type { ContradictionMap } from "./contradictionEngine";
import { extractDualityFlags } from "./contradictionEngine";
import type { ArchetypeCode } from "./archetypeTypes";
import { parseArchetypeCode, LAYER1_DEFS, LAYER2_DEFS, LAYER3_DEFS } from "./archetypeTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 型定義
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DailyChallenge {
  id: string;
  userId: string;
  challengeDate: string; // YYYY-MM-DD
  scenarios: ChallengeScenario[];
  status: "pending" | "user_predicted" | "revealed" | "verified";
  createdAt: string;
}

export interface ChallengeScenario {
  id: string;
  situation: string;
  category: ScenarioCategory;
  options: ScenarioOption[];
  /** Oracle の予測（optionId） */
  oraclePrediction: string;
  /** Oracle の理由 */
  oracleReason: string;
  /** 関連する軸 */
  relevantAxes: TraitAxisKey[];
  /** ユーザーの予測 */
  userPrediction?: string;
  /** 実際の結果 */
  actualOutcome?: string;
  /** Oracle が正解したか */
  oracleCorrect?: boolean;
  /** ユーザーが正解したか */
  userCorrect?: boolean;
}

export interface ScenarioOption {
  id: string;
  label: string;
  description: string;
}

export type ScenarioCategory = "social" | "decision" | "emotion" | "energy" | "conflict";

export interface SelfAccuracyScore {
  overall: number; // 0-100
  level: SASLevel;
  history: { date: string; score: number }[];
  oracleAccuracy: number;
  gap: number; // user - oracle（正なら勝ち）
  streakDays: number;
  totalChallenges: number;
  categoryBreakdown: Record<ScenarioCategory, { userAcc: number; oracleAcc: number }>;
}

export type SASLevel =
  | "fog"        // 0-30: 霧の中
  | "dawn"       // 31-50: 夜明け
  | "moonlight"  // 51-65: 月明かり
  | "starry"     // 66-80: 星空
  | "telescope"  // 81-95: 望遠鏡
  | "supernova"; // 96-100: 超新星

export interface GapInsight {
  scenarioId: string;
  situation: string;
  userPrediction: string;
  oraclePrediction: string;
  actual: string;
  explanation: string;
  relevantAxes: TraitAxisKey[];
  blindSpotHint: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 内部: シナリオテンプレート
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ScenarioTemplate {
  category: ScenarioCategory;
  situation: string;
  primaryAxis: TraitAxisKey;
  secondaryAxis?: TraitAxisKey;
  options: { label: string; description: string; axisDirection: number }[];
}

/**
 * 場面テンプレート群 — 日常的な心理反応に焦点
 * 各テンプレートは特定の軸に関連し、反応パターンの3つのバリエーションを提示する
 */
const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  // ── social ──
  {
    category: "social",
    situation: "友人に突然予定を変えられたとき、あなたの最初の心の反応は？",
    primaryAxis: "independence_vs_harmony",
    secondaryAxis: "emotional_regulation",
    options: [
      { label: "内心イラッとするが、合わせる", description: "調和を優先し、不満は飲み込む", axisDirection: 0.7 },
      { label: "率直に「困る」と伝える", description: "自分の境界線を明確にする", axisDirection: -0.7 },
      { label: "特に気にならない", description: "柔軟に受け入れ、深く考えない", axisDirection: 0.0 },
    ],
  },
  {
    category: "social",
    situation: "初対面の人が多い集まりに誘われたとき、心の中で最初に浮かぶのは？",
    primaryAxis: "introvert_vs_extrovert",
    secondaryAxis: "social_initiative",
    options: [
      { label: "新しい出会いにワクワクする", description: "知らない人との接点を楽しめる", axisDirection: 0.8 },
      { label: "行くけど、エネルギー消耗を覚悟する", description: "社交はできるが、コストを感じる", axisDirection: -0.3 },
      { label: "できれば断りたいと思う", description: "知らない場はストレス源になる", axisDirection: -0.8 },
    ],
  },
  {
    category: "social",
    situation: "グループの会話で自分だけ意見が違うと気づいたとき、どうする？",
    primaryAxis: "direct_vs_diplomatic",
    secondaryAxis: "independence_vs_harmony",
    options: [
      { label: "自分の意見を言う", description: "少数派でも、思ったことは伝えるべき", axisDirection: -0.8 },
      { label: "やんわり別の視点として提示する", description: "対立を避けつつ、意見は出す", axisDirection: 0.3 },
      { label: "黙って様子を見る", description: "わざわざ波風を立てなくていい", axisDirection: 0.8 },
    ],
  },

  // ── decision ──
  {
    category: "decision",
    situation: "大きな買い物（10万円以上）で迷っているとき、最終的な決め手は？",
    primaryAxis: "analytical_vs_intuitive",
    secondaryAxis: "cautious_vs_bold",
    options: [
      { label: "比較表を作って論理的に決める", description: "データと根拠で判断を固める", axisDirection: -0.8 },
      { label: "「これだ」というフィーリング", description: "直感が合図を出したら決める", axisDirection: 0.8 },
      { label: "信頼できる人の意見を聞く", description: "他者の経験や視点を判断材料にする", axisDirection: 0.2 },
    ],
  },
  {
    category: "decision",
    situation: "転職や引っ越しなど人生の大きな選択の前夜、あなたの心理状態は？",
    primaryAxis: "change_embrace_vs_resist",
    secondaryAxis: "rumination_tendency",
    options: [
      { label: "ワクワクして眠れない", description: "新しいステージへの期待が勝る", axisDirection: -0.8 },
      { label: "不安で何度もシミュレーションする", description: "最悪のケースを想定して備える", axisDirection: 0.8 },
      { label: "意外と普通に寝られる", description: "決めたことは受け入れて進む", axisDirection: -0.3 },
    ],
  },
  {
    category: "decision",
    situation: "2つの魅力的な選択肢があり、どちらも捨てがたいとき、あなたの傾向は？",
    primaryAxis: "exploration_closure",
    secondaryAxis: "decision_tempo",
    options: [
      { label: "締切ギリギリまで両方の可能性を探る", description: "情報を集めきるまで決めたくない", axisDirection: -0.8 },
      { label: "直感で素早く決めて前に進む", description: "迷う時間がもったいない", axisDirection: 0.8 },
      { label: "第三の選択肢がないか考え始める", description: "与えられた枠に収まりたくない", axisDirection: -0.4 },
    ],
  },

  // ── emotion ──
  {
    category: "emotion",
    situation: "仕事で理不尽な批判を受けたとき、最初の内面的反応は？",
    primaryAxis: "emotional_regulation",
    secondaryAxis: "shame_vs_guilt",
    options: [
      { label: "怒りが湧くが、冷静に分析しようとする", description: "感情を認識しつつ、理性で制御する", axisDirection: 0.7 },
      { label: "落ち込んで自分を責めてしまう", description: "批判を自分の価値と結びつけてしまう", axisDirection: -0.7 },
      { label: "「相手の問題だ」と割り切る", description: "自分の領域と他者の領域を分ける", axisDirection: 0.3 },
    ],
  },
  {
    category: "emotion",
    situation: "親しい人に裏切られたと感じたとき、その後の心の動きは？",
    primaryAxis: "rumination_tendency",
    secondaryAxis: "attachment_style",
    options: [
      { label: "何日も繰り返し考えてしまう", description: "なぜそうなったか、頭から離れない", axisDirection: 0.8 },
      { label: "距離を置いて自分を守る", description: "傷つくリスクを減らすために離れる", axisDirection: -0.3 },
      { label: "直接話し合って解決しようとする", description: "モヤモヤを抱えるより向き合いたい", axisDirection: -0.5 },
    ],
  },
  {
    category: "emotion",
    situation: "涙が出そうになる場面（感動・悲しみ）で、人前にいるとき、あなたは？",
    primaryAxis: "public_private_gap",
    secondaryAxis: "emotional_variability",
    options: [
      { label: "自然に涙を見せる", description: "感情を隠す必要を感じない", axisDirection: -0.8 },
      { label: "必死にこらえる", description: "人前で感情を見せたくない", axisDirection: 0.8 },
      { label: "場所を変えてから泣く", description: "感情は大切にするが、TPOも意識する", axisDirection: 0.4 },
    ],
  },

  // ── energy ──
  {
    category: "energy",
    situation: "休日の朝、特に予定がないとき、最初にしたくなることは？",
    primaryAxis: "plan_vs_spontaneous",
    secondaryAxis: "introvert_vs_extrovert",
    options: [
      { label: "今日やることリストを作る", description: "自由時間も構造化して充実させたい", axisDirection: -0.8 },
      { label: "気分のまま過ごす", description: "計画なしの時間こそ贅沢", axisDirection: 0.8 },
      { label: "誰かを誘って外出する", description: "人と一緒の方が楽しい", axisDirection: 0.3 },
    ],
  },
  {
    category: "energy",
    situation: "連日忙しくて疲れ切ったとき、回復に必要なのは？",
    primaryAxis: "stress_isolation_vs_social",
    secondaryAxis: "reassurance_need",
    options: [
      { label: "一人の時間をたっぷり取る", description: "静寂と孤独が最大の回復源", axisDirection: -0.8 },
      { label: "気の置けない友人と話す", description: "人とのつながりがエネルギーになる", axisDirection: 0.8 },
      { label: "没頭できる趣味に逃げ込む", description: "現実から離れて別世界で回復する", axisDirection: -0.3 },
    ],
  },
  {
    category: "energy",
    situation: "新しいプロジェクトの初日、あなたのエネルギーの使い方は？",
    primaryAxis: "cautious_vs_bold",
    secondaryAxis: "abstract_structuring",
    options: [
      { label: "まず全体像を把握してから動く", description: "情報を集め、リスクを見極めてから着手", axisDirection: -0.7 },
      { label: "とりあえずやってみる", description: "動きながら学ぶのが一番早い", axisDirection: 0.8 },
      { label: "チームメンバーの様子を観察する", description: "人間関係の力学を先に把握したい", axisDirection: 0.0 },
    ],
  },

  // ── conflict ──
  {
    category: "conflict",
    situation: "パートナーや親しい友人と意見が真っ向から対立したとき、あなたの自然な反応は？",
    primaryAxis: "direct_vs_diplomatic",
    secondaryAxis: "intimacy_pace",
    options: [
      { label: "自分の立場を論理的に説明する", description: "正しさを根拠で示したい", axisDirection: -0.8 },
      { label: "相手の気持ちを先に聞く", description: "関係性を壊さないことが最優先", axisDirection: 0.8 },
      { label: "一旦距離を置いて冷却する", description: "感情的なときに話しても良くならない", axisDirection: 0.0 },
    ],
  },
  {
    category: "conflict",
    situation: "自分のミスで他人に迷惑をかけてしまったとき、その後の行動パターンは？",
    primaryAxis: "shame_vs_guilt",
    secondaryAxis: "locus_of_control",
    options: [
      { label: "すぐ謝って具体的にリカバリーする", description: "行動で取り返すのが一番", axisDirection: 0.8 },
      { label: "しばらく自己嫌悪に陥る", description: "「自分はダメだ」という気持ちが先に来る", axisDirection: -0.8 },
      { label: "原因を分析して再発防止策を考える", description: "感情より仕組みの改善に向かう", axisDirection: 0.3 },
    ],
  },
  {
    category: "conflict",
    situation: "誰かがあなたの境界線を越えてきたとき（過干渉・お節介）、どう対処する？",
    primaryAxis: "boundary_awareness",
    secondaryAxis: "rejection_response_maturity",
    options: [
      { label: "はっきり「それは困る」と伝える", description: "自分の領域を明確に守る", axisDirection: 0.8 },
      { label: "やんわり話題を変える", description: "直接的な拒否は避けたい", axisDirection: -0.3 },
      { label: "我慢してしまう", description: "相手を傷つけたくなくて受け入れてしまう", axisDirection: -0.8 },
    ],
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 内部ユーティリティ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function safeScore(
  axisScores: Partial<Record<TraitAxisKey, number>>,
  key: TraitAxisKey,
): number {
  return axisScores[key] ?? 0;
}

function axisLabel(key: TraitAxisKey): string {
  const def = TRAIT_AXES.find((a) => a.id === key);
  return def ? `${def.labelLeft} / ${def.labelRight}` : key;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Oracle 予測ロジック
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Oracle の予測を決定論的に算出
 *
 * 軸スコアとアーキタイプから、各シナリオで最も選ばれやすい選択肢を予測する。
 * 選択肢の axisDirection と軸スコアの内積が最大の選択肢を予測とする。
 */
function computeOraclePrediction(
  template: ScenarioTemplate,
  axisScores: Partial<Record<TraitAxisKey, number>>,
  archetypeCode?: ArchetypeCode,
): { optionIndex: number; reason: string; confidence: number } {
  const primaryScore = safeScore(axisScores, template.primaryAxis);
  const secondaryScore = template.secondaryAxis
    ? safeScore(axisScores, template.secondaryAxis)
    : 0;

  // アーキタイプからのバイアス
  let archetypeBias = 0;
  if (archetypeCode) {
    try {
      const parsed = parseArchetypeCode(archetypeCode);
      const l1 = LAYER1_DEFS[parsed.cognition];
      const l2 = LAYER2_DEFS[parsed.emotion];
      // 認知スタイルと感情スタイルから微調整
      if (l1) archetypeBias += (l1.label?.includes("直感") ? 0.1 : -0.1);
      if (l2) archetypeBias += (l2.label?.includes("安定") ? -0.05 : 0.05);
    } catch {
      // アーキタイプ解析失敗は無視
    }
  }

  // 各選択肢のスコアを計算
  const scores = template.options.map((opt) => {
    // 主軸との一致度（重み 0.6）+ 副軸との一致度（重み 0.25）+ アーキタイプバイアス（重み 0.15）
    const primaryMatch = 1 - Math.abs(primaryScore - opt.axisDirection);
    const secondaryMatch = template.secondaryAxis
      ? 1 - Math.abs(secondaryScore - opt.axisDirection * 0.5)
      : 0.5;
    return primaryMatch * 0.6 + secondaryMatch * 0.25 + (0.5 + archetypeBias) * 0.15;
  });

  const maxScore = Math.max(...scores);
  const bestIndex = scores.indexOf(maxScore);

  // 確信度: 最大と次点の差
  const sorted = [...scores].sort((a, b) => b - a);
  const confidence = sorted.length >= 2 ? sorted[0] - sorted[1] : 0.5;

  // 理由生成
  const primaryLabel = axisLabel(template.primaryAxis);
  const reason = generateOracleReason(
    template,
    bestIndex,
    primaryScore,
    primaryLabel,
    confidence,
  );

  return { optionIndex: bestIndex, reason, confidence };
}

function generateOracleReason(
  template: ScenarioTemplate,
  optionIndex: number,
  primaryScore: number,
  primaryLabel: string,
  confidence: number,
): string {
  const option = template.options[optionIndex];
  const direction = primaryScore > 0 ? "右寄り" : primaryScore < 0 ? "左寄り" : "中央";
  const strengthWord = Math.abs(primaryScore) > 0.5 ? "強く" : "やや";

  const reasons: string[] = [
    `あなたの「${primaryLabel}」軸が${strengthWord}${direction}であることから、` +
    `「${option.label}」を選ぶ傾向が予測されます。`,

    `${primaryLabel}のスコアパターンと過去の反応傾向から、` +
    `この場面では「${option.label}」が自然な反応と考えられます。`,

    `あなたの判断パターンを分析すると、` +
    `「${option.description}」という行動原理が${strengthWord}働く場面です。`,
  ];

  // 確信度に基づいてバリエーションを選択（決定論的）
  const idx = Math.floor(Math.abs(primaryScore * 10 + confidence * 7)) % reasons.length;
  return reasons[idx];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// シナリオ選択ロジック
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 今日のシナリオ3つを選択する
 *
 * 選択基準:
 * 1. 矛盾マップの上位ペアに関連する場面を優先（盲点が出やすい）
 * 2. カテゴリが偏らないようにバランス
 * 3. 日付ベースのシードで決定論的に選択（同じ日は同じ結果）
 */
function selectScenarios(
  axisScores: Partial<Record<TraitAxisKey, number>>,
  contradictionMap: ContradictionMap,
  dateStr: string,
  userId: string,
): ScenarioTemplate[] {
  // 日付 + ユーザーID からシードを生成（決定論的）
  const seed = hashCode(`${dateStr}_${userId}`);

  // 矛盾の強い軸を特定
  const dualityFlags = extractDualityFlags(contradictionMap);
  const contradictionAxes = new Set(dualityFlags.slice(0, 5).map((f) => f.axis));

  // 各テンプレートにスコアを付ける
  const scored = SCENARIO_TEMPLATES.map((t, i) => {
    let score = 0;
    // 矛盾軸に関連するテンプレートを優先
    if (contradictionAxes.has(t.primaryAxis)) score += 3;
    if (t.secondaryAxis && contradictionAxes.has(t.secondaryAxis)) score += 2;
    // 軸スコアの絶対値が高い（=強い傾向がある）テンプレートも面白い
    score += Math.abs(safeScore(axisScores, t.primaryAxis)) * 1.5;
    // シードで微調整（ランダム性の代替）
    score += ((seed + i * 7) % 100) / 100;
    return { template: t, score, index: i };
  });

  // スコア順にソート
  scored.sort((a, b) => b.score - a.score);

  // カテゴリバランスを保ちながら3つ選択
  const selected: ScenarioTemplate[] = [];
  const usedCategories = new Set<ScenarioCategory>();

  for (const item of scored) {
    if (selected.length >= 3) break;
    // 最初の2つはカテゴリ重複を避ける
    if (selected.length < 2 && usedCategories.has(item.template.category)) continue;
    selected.push(item.template);
    usedCategories.add(item.template.category);
  }

  // 3つに満たない場合（カテゴリ制約が厳しすぎた場合）
  for (const item of scored) {
    if (selected.length >= 3) break;
    if (!selected.includes(item.template)) {
      selected.push(item.template);
    }
  }

  return selected;
}

/** 文字列のハッシュコード（決定論的シード用） */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // 32bit int
  }
  return Math.abs(hash);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メイン関数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 今日の Daily Challenge を生成する
 *
 * 45軸 + 矛盾マップ + アーキタイプから、3つの場面を生成。
 * 各場面には Oracle の予測が含まれる。
 */
export function generateDailyChallenge(
  userId: string,
  axisScores: Partial<Record<TraitAxisKey, number>>,
  contradictionMap: ContradictionMap,
  archetypeCode?: ArchetypeCode,
): DailyChallenge {
  const dateStr = todayString();
  const templates = selectScenarios(axisScores, contradictionMap, dateStr, userId);

  const scenarios: ChallengeScenario[] = templates.map((template, idx) => {
    const prediction = computeOraclePrediction(template, axisScores, archetypeCode);
    const options: ScenarioOption[] = template.options.map((opt, optIdx) => ({
      id: `opt_${idx}_${optIdx}`,
      label: opt.label,
      description: opt.description,
    }));

    return {
      id: `scenario_${dateStr}_${idx}`,
      situation: template.situation,
      category: template.category,
      options,
      oraclePrediction: options[prediction.optionIndex].id,
      oracleReason: prediction.reason,
      relevantAxes: [
        template.primaryAxis,
        ...(template.secondaryAxis ? [template.secondaryAxis] : []),
      ],
    };
  });

  return {
    id: `challenge_${dateStr}_${userId.slice(0, 8)}`,
    userId,
    challengeDate: dateStr,
    scenarios,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}

/**
 * ユーザーの予測を記録する
 */
export function submitUserPrediction(
  challenge: DailyChallenge,
  predictions: { scenarioId: string; optionId: string }[],
): DailyChallenge {
  const updated = { ...challenge, scenarios: [...challenge.scenarios] };

  for (const pred of predictions) {
    const scenarioIdx = updated.scenarios.findIndex((s) => s.id === pred.scenarioId);
    if (scenarioIdx === -1) continue;
    updated.scenarios[scenarioIdx] = {
      ...updated.scenarios[scenarioIdx],
      userPrediction: pred.optionId,
    };
  }

  // 全シナリオに予測が入ったらステータス更新
  const allPredicted = updated.scenarios.every((s) => s.userPrediction);
  if (allPredicted) {
    updated.status = "user_predicted";
  }

  return updated;
}

/**
 * 実際の結果を記録し、Oracle vs ユーザーの正否を判定する
 */
export function revealResults(
  challenge: DailyChallenge,
  actuals: { scenarioId: string; optionId: string }[],
): DailyChallenge {
  const updated = { ...challenge, scenarios: [...challenge.scenarios] };

  for (const actual of actuals) {
    const scenarioIdx = updated.scenarios.findIndex((s) => s.id === actual.scenarioId);
    if (scenarioIdx === -1) continue;

    const scenario = updated.scenarios[scenarioIdx];
    updated.scenarios[scenarioIdx] = {
      ...scenario,
      actualOutcome: actual.optionId,
      oracleCorrect: scenario.oraclePrediction === actual.optionId,
      userCorrect: scenario.userPrediction === actual.optionId,
    };
  }

  // 全シナリオに結果が入ったらステータス更新
  const allRevealed = updated.scenarios.every((s) => s.actualOutcome !== undefined);
  if (allRevealed) {
    updated.status = "verified";
  } else {
    updated.status = "revealed";
  }

  return updated;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SAS (Self-Accuracy Score) 計算
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function sasLevelFromScore(score: number): SASLevel {
  if (score <= 30) return "fog";
  if (score <= 50) return "dawn";
  if (score <= 65) return "moonlight";
  if (score <= 80) return "starry";
  if (score <= 95) return "telescope";
  return "supernova";
}

/**
 * 全履歴から SAS を計算する
 *
 * 直近のチャレンジほど重みが大きい指数移動平均を使用。
 * カテゴリ別のブレイクダウンも算出する。
 */
export function calculateSAS(
  userId: string,
  history: DailyChallenge[],
): SelfAccuracyScore {
  // verified のみ対象
  const verified = history
    .filter((c) => c.status === "verified" && c.userId === userId)
    .sort((a, b) => a.challengeDate.localeCompare(b.challengeDate));

  if (verified.length === 0) {
    return {
      overall: 0,
      level: "fog",
      history: [],
      oracleAccuracy: 0,
      gap: 0,
      streakDays: 0,
      totalChallenges: 0,
      categoryBreakdown: {
        social: { userAcc: 0, oracleAcc: 0 },
        decision: { userAcc: 0, oracleAcc: 0 },
        emotion: { userAcc: 0, oracleAcc: 0 },
        energy: { userAcc: 0, oracleAcc: 0 },
        conflict: { userAcc: 0, oracleAcc: 0 },
      },
    };
  }

  // カテゴリ別集計
  const catStats: Record<ScenarioCategory, { userCorrect: number; oracleCorrect: number; total: number }> = {
    social: { userCorrect: 0, oracleCorrect: 0, total: 0 },
    decision: { userCorrect: 0, oracleCorrect: 0, total: 0 },
    emotion: { userCorrect: 0, oracleCorrect: 0, total: 0 },
    energy: { userCorrect: 0, oracleCorrect: 0, total: 0 },
    conflict: { userCorrect: 0, oracleCorrect: 0, total: 0 },
  };

  // 日別スコア計算（指数移動平均用）
  const dailyScores: { date: string; score: number }[] = [];
  let totalUserCorrect = 0;
  let totalOracleCorrect = 0;
  let totalScenarios = 0;

  for (const challenge of verified) {
    let dayUserCorrect = 0;
    let dayTotal = 0;

    for (const scenario of challenge.scenarios) {
      if (scenario.actualOutcome === undefined) continue;
      dayTotal++;
      totalScenarios++;

      if (scenario.userCorrect) {
        dayUserCorrect++;
        totalUserCorrect++;
      }
      if (scenario.oracleCorrect) {
        totalOracleCorrect++;
      }

      // カテゴリ別
      const cat = scenario.category;
      if (catStats[cat]) {
        catStats[cat].total++;
        if (scenario.userCorrect) catStats[cat].userCorrect++;
        if (scenario.oracleCorrect) catStats[cat].oracleCorrect++;
      }
    }

    const dayScore = dayTotal > 0 ? (dayUserCorrect / dayTotal) * 100 : 0;
    dailyScores.push({ date: challenge.challengeDate, score: Math.round(dayScore) });
  }

  // 全体スコア: 指数移動平均（直近重視）
  const alpha = 0.3; // 平滑化係数
  let emaScore = dailyScores[0]?.score ?? 0;
  for (let i = 1; i < dailyScores.length; i++) {
    emaScore = alpha * dailyScores[i].score + (1 - alpha) * emaScore;
  }
  const overall = Math.round(Math.max(0, Math.min(100, emaScore)));

  const userAccuracy = totalScenarios > 0 ? totalUserCorrect / totalScenarios : 0;
  const oracleAccuracy = totalScenarios > 0 ? totalOracleCorrect / totalScenarios : 0;

  // 連続日数
  let streakDays = 0;
  const today = todayString();
  for (let i = verified.length - 1; i >= 0; i--) {
    const expected = offsetDate(today, -(verified.length - 1 - i));
    if (verified[i].challengeDate === expected) {
      streakDays++;
    } else {
      break;
    }
  }

  // カテゴリブレイクダウン
  const categoryBreakdown = {} as Record<ScenarioCategory, { userAcc: number; oracleAcc: number }>;
  for (const [cat, stats] of Object.entries(catStats) as [ScenarioCategory, typeof catStats.social][]) {
    categoryBreakdown[cat] = {
      userAcc: stats.total > 0 ? Math.round((stats.userCorrect / stats.total) * 100) : 0,
      oracleAcc: stats.total > 0 ? Math.round((stats.oracleCorrect / stats.total) * 100) : 0,
    };
  }

  return {
    overall,
    level: sasLevelFromScore(overall),
    history: dailyScores,
    oracleAccuracy: Math.round(oracleAccuracy * 100),
    gap: Math.round((userAccuracy - oracleAccuracy) * 100),
    streakDays,
    totalChallenges: verified.length,
    categoryBreakdown,
  };
}

/** 日付をオフセット */
function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gap Insight 生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Oracle が勝ったシナリオについて「なぜ自己認識がズレていたか」の解説を生成
 */
export function generateInsightFromGap(
  challenge: DailyChallenge,
  axisScores: Partial<Record<TraitAxisKey, number>>,
  contradictionMap: ContradictionMap,
): GapInsight[] {
  const insights: GapInsight[] = [];

  for (const scenario of challenge.scenarios) {
    // Oracle が正解 かつ ユーザーが不正解 のシナリオのみ
    if (!scenario.oracleCorrect || scenario.userCorrect) continue;
    if (!scenario.actualOutcome || !scenario.userPrediction) continue;

    const actualOption = scenario.options.find((o) => o.id === scenario.actualOutcome);
    const userOption = scenario.options.find((o) => o.id === scenario.userPrediction);
    const oracleOption = scenario.options.find((o) => o.id === scenario.oraclePrediction);
    if (!actualOption || !userOption || !oracleOption) continue;

    // 関連軸の矛盾状況をチェック
    const contradictionHints: string[] = [];
    for (const axis of scenario.relevantAxes) {
      const stats = contradictionMap[axis];
      if (stats?.isDual && stats.poles) {
        contradictionHints.push(
          `「${axisLabel(axis)}」に二面性が検出されています ` +
          `— 状況によって異なる反応パターンを持っているため、` +
          `自己予測が難しくなりやすい軸です。`,
        );
      }
    }

    // 盲点のヒント生成
    const blindSpotHint = generateBlindSpotHint(
      scenario.relevantAxes,
      axisScores,
      contradictionMap,
    );

    const explanation = buildGapExplanation(
      scenario.situation,
      userOption.label,
      actualOption.label,
      scenario.relevantAxes,
      axisScores,
      contradictionHints,
    );

    insights.push({
      scenarioId: scenario.id,
      situation: scenario.situation,
      userPrediction: userOption.label,
      oraclePrediction: oracleOption.label,
      actual: actualOption.label,
      explanation,
      relevantAxes: scenario.relevantAxes,
      blindSpotHint,
    });
  }

  return insights;
}

function buildGapExplanation(
  situation: string,
  userPredicted: string,
  actual: string,
  relevantAxes: TraitAxisKey[],
  axisScores: Partial<Record<TraitAxisKey, number>>,
  contradictionHints: string[],
): string {
  const parts: string[] = [];

  parts.push(
    `あなたは「${userPredicted}」と予測しましたが、` +
    `実際は「${actual}」でした。`,
  );

  // 軸スコアに基づく分析
  for (const axis of relevantAxes.slice(0, 2)) {
    const score = safeScore(axisScores, axis);
    const label = axisLabel(axis);
    if (Math.abs(score) > 0.3) {
      parts.push(
        `あなたの「${label}」スコアは${score > 0 ? "右寄り" : "左寄り"}ですが、` +
        `この場面では普段と異なる反応パターンが現れました。` +
        `これは状況特有の要因が判断に影響した可能性を示しています。`,
      );
    }
  }

  if (contradictionHints.length > 0) {
    parts.push(contradictionHints[0]);
  }

  parts.push(
    `自己認識とのギャップは、あなたの中にまだ言語化されていない` +
    `判断基準が存在することを示唆しています。` +
    `このパターンを観察し続けることで、自己理解がさらに深まります。`,
  );

  return parts.join("\n");
}

function generateBlindSpotHint(
  relevantAxes: TraitAxisKey[],
  axisScores: Partial<Record<TraitAxisKey, number>>,
  contradictionMap: ContradictionMap,
): string {
  for (const axis of relevantAxes) {
    const stats = contradictionMap[axis];
    if (stats?.isDual) {
      return `この軸では二面性が検出されています。「こうあるべき自分」と「実際の自分」にズレがある可能性があります。`;
    }
    const score = safeScore(axisScores, axis);
    if (Math.abs(score) > 0.6) {
      return `「${axisLabel(axis)}」で強い傾向が出ていますが、特定の状況では逆の反応が出ることがあります。これが盲点になりやすいポイントです。`;
    }
  }
  return `自分の反応パターンをさらに観察することで、予測精度が向上します。`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SAS レベルの表示用情報
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const SAS_LEVEL_INFO: Record<SASLevel, { label: string; description: string; emoji: string }> = {
  fog: {
    label: "霧の中",
    description: "自分の反応パターンがまだ見えていない段階。観測を続けることで霧が晴れていきます。",
    emoji: "🌫",
  },
  dawn: {
    label: "夜明け",
    description: "自己認識の輪郭が見え始めた段階。パターンの一部を掴みかけています。",
    emoji: "🌅",
  },
  moonlight: {
    label: "月明かり",
    description: "自分の反応傾向をある程度予測できる段階。ただし影の部分はまだ見えにくい。",
    emoji: "🌙",
  },
  starry: {
    label: "星空",
    description: "自己理解が深まり、多くの場面で正確に自分を予測できる段階。",
    emoji: "🌟",
  },
  telescope: {
    label: "望遠鏡",
    description: "自分の盲点すら認識し、高精度で反応パターンを把握している段階。",
    emoji: "🔭",
  },
  supernova: {
    label: "超新星",
    description: "自己認識がOracleを凌駕する極めて稀な段階。あなた自身が最高の観測者です。",
    emoji: "💥",
  },
};
