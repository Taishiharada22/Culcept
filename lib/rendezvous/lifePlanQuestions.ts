// ============================================================
// Life Plan 観測質問プール — Partner 枠専用
//
// 8次元の人生設計価値観を、Stargazer と同じシナリオベース形式で観測する。
// アンケートではなく「観測の入口」。回答パターン・矛盾・反復から
// 本音に到達する設計。
//
// 科学的根拠:
// - financial_values: Dew et al. (2012) 金銭葛藤 = 離婚最強予測因子
// - career_family_balance: 日本の離婚原因上位（裁判所統計）
// - family_planning: 子供に関する不一致 = 妥協不可能な因子
// - kinship_boundary: 嫁姑問題 = 日本固有の離婚因子
// - living_standard: 生活水準期待の不一致 = 慢性的不満の源
// - intimacy_expectation: Mark & Murray (2012) 欲求不一致 = 性的満足度の最強予測因子
// - health_lifestyle: 生活習慣の価値観差 = 同居時の摩擦
// - cultural_values: Luo & Klohnen (2005) 態度の類似性 > 性格の類似性
// ============================================================

// ── Life Plan 軸定義 ──

export const LIFE_PLAN_AXIS_KEYS = [
  "financial_values",
  "career_family_balance",
  "family_planning_depth",
  "kinship_boundary",
  "living_standard",
  "intimacy_expectation",
  "health_lifestyle",
  "cultural_values",
] as const;

export type LifePlanAxisKey = (typeof LIFE_PLAN_AXIS_KEYS)[number];

export interface LifePlanAxisDef {
  id: LifePlanAxisKey;
  labelLeft: string;
  labelRight: string;
  description: string;
}

export const LIFE_PLAN_AXES: LifePlanAxisDef[] = [
  {
    id: "financial_values",
    labelLeft: "堅実に守る",
    labelRight: "積極的に使う",
    description: "金銭感覚: 貯蓄・節約志向 ←→ 消費・投資志向",
  },
  {
    id: "career_family_balance",
    labelLeft: "家庭を最優先",
    labelRight: "キャリアを最優先",
    description: "仕事と家庭のバランス: 家庭中心 ←→ キャリア中心",
  },
  {
    id: "family_planning_depth",
    labelLeft: "自然に任せる",
    labelRight: "綿密に計画する",
    description: "家族計画の姿勢: 柔軟 ←→ 計画的",
  },
  {
    id: "kinship_boundary",
    labelLeft: "家族ぐるみで近く",
    labelRight: "二人の世界を優先",
    description: "親族との距離感: 密接 ←→ 独立",
  },
  {
    id: "living_standard",
    labelLeft: "質素でも豊かに",
    labelRight: "快適さを追求",
    description: "生活水準: ミニマル ←→ コンフォート重視",
  },
  {
    id: "intimacy_expectation",
    labelLeft: "心のつながり重視",
    labelRight: "身体的つながりも重視",
    description: "親密さの形: 精神的 ←→ 身体的も含む",
  },
  {
    id: "health_lifestyle",
    labelLeft: "自由に楽しむ",
    labelRight: "健康を意識する",
    description: "健康・生活習慣: おおらか ←→ 意識的",
  },
  {
    id: "cultural_values",
    labelLeft: "伝統を大切に",
    labelRight: "自分たちのスタイルで",
    description: "文化的価値観: 伝統重視 ←→ 自由重視",
  },
];

// ── 質問定義 ──

export interface LifePlanQuestion {
  id: string;
  /** 質問テキスト（シナリオベース） */
  questionText: string;
  /** セマンティックディファレンシャル: 左ラベル */
  leftLabel: string;
  /** セマンティックディファレンシャル: 右ラベル */
  rightLabel: string;
  /** スケール (5段階 or 7段階) */
  scale: 5 | 7;
  /** この質問が測定する軸 */
  axes: Array<{
    key: LifePlanAxisKey;
    weight: number;
    invert?: boolean;
  }>;
  /** 質問のカテゴリ（UIのグルーピング用） */
  category: "financial" | "career" | "family" | "kinship" | "lifestyle" | "intimacy" | "health" | "culture";
  /** 補足テキスト（任意） */
  note?: string;
}

// ── 質問プール（8次元 × 4-5問 = 35問）──

export const LIFE_PLAN_QUESTIONS: LifePlanQuestion[] = [
  // ================================================================
  // financial_values（金銭感覚）— 5問
  // Dew et al. (2012): 金銭葛藤は離婚の最強予測因子
  // Rick et al. (2011): Tightwad vs Spendthrift の不一致が葛藤源
  // ================================================================
  {
    id: "lp-fin-01",
    questionText: "友人が「貯金ゼロだけど毎月旅行に行ってる」と話しました。あなたの気持ちに近いのは？",
    leftLabel: "少しは将来のことも考えた方がいい",
    rightLabel: "人生は経験。楽しんでいるなら素敵",
    scale: 5,
    axes: [{ key: "financial_values", weight: 0.8 }],
    category: "financial",
  },
  {
    id: "lp-fin-02",
    questionText: "パートナーが「高いけど本当に欲しい」と言った服（月収の15%相当）。あなたの反応は？",
    leftLabel: "来月まで待って考えよう",
    rightLabel: "欲しいなら買おう",
    scale: 5,
    axes: [{ key: "financial_values", weight: 1.0 }],
    category: "financial",
  },
  {
    id: "lp-fin-03",
    questionText: "ボーナスが入りました。まず何を考えますか？",
    leftLabel: "まず貯蓄・投資に回す",
    rightLabel: "ずっと欲しかったものを買う",
    scale: 5,
    axes: [{ key: "financial_values", weight: 0.9 }],
    category: "financial",
  },
  {
    id: "lp-fin-04",
    questionText: "家計の管理について、理想に近いのは？",
    leftLabel: "毎月の収支を細かく把握したい",
    rightLabel: "大枠で回っていれば細かくは気にしない",
    scale: 5,
    axes: [
      { key: "financial_values", weight: 0.7, invert: true },
    ],
    category: "financial",
    note: "financial_valuesが高い=消費志向なので、管理の緻密さは逆転",
  },
  {
    id: "lp-fin-05",
    questionText: "将来のために「今の楽しみを我慢する」ことについて、どう感じますか？",
    leftLabel: "将来のためなら今は我慢できる",
    rightLabel: "今しかできないことを優先したい",
    scale: 5,
    axes: [{ key: "financial_values", weight: 0.8 }],
    category: "financial",
  },

  // ================================================================
  // career_family_balance（キャリア×家庭バランス）— 5問
  // 日本の離婚原因: 長時間労働による家庭参加不足が上位
  // OECD: 日本男性の家事育児時間は先進国最低水準
  // ================================================================
  {
    id: "lp-car-01",
    questionText: "転職の話が来ました。年収は上がるけど、帰宅が毎日2時間遅くなります。",
    leftLabel: "家族との時間を優先して断る",
    rightLabel: "キャリアの成長を優先して受ける",
    scale: 5,
    axes: [{ key: "career_family_balance", weight: 1.0 }],
    category: "career",
  },
  {
    id: "lp-car-02",
    questionText: "パートナーが「仕事に集中したいから、しばらく家事の比率を変えてほしい」と言いました。",
    leftLabel: "もちろん応援する。家事は引き受ける",
    rightLabel: "二人の時間も大事。バランスを話し合いたい",
    scale: 5,
    axes: [{ key: "career_family_balance", weight: 0.7 }],
    category: "career",
  },
  {
    id: "lp-car-03",
    questionText: "理想の平日の夜はどちらに近いですか？",
    leftLabel: "18時には帰って一緒にご飯を作る",
    rightLabel: "自分のプロジェクトに没頭する",
    scale: 5,
    axes: [{ key: "career_family_balance", weight: 0.9 }],
    category: "career",
  },
  {
    id: "lp-car-04",
    questionText: "子どもが生まれたら、育休についてどう考えますか？",
    leftLabel: "できるだけ長く取りたい",
    rightLabel: "必要最低限にしてキャリアを守りたい",
    scale: 5,
    axes: [{ key: "career_family_balance", weight: 0.8 }],
    category: "career",
  },
  {
    id: "lp-car-05",
    questionText: "パートナーに「私のキャリアより家庭を優先してほしい」と言われたら？",
    leftLabel: "相手の気持ちを尊重したい",
    rightLabel: "自分のキャリアも同じくらい大事",
    scale: 5,
    axes: [{ key: "career_family_balance", weight: 0.8 }],
    category: "career",
  },

  // ================================================================
  // family_planning_depth（家族計画の深度）— 5問
  // 子供に関する不一致は妥協不可能な離婚因子
  // ================================================================
  {
    id: "lp-fam-01",
    questionText: "子どもについて、今の気持ちに近いのは？",
    leftLabel: "自然に任せたい",
    rightLabel: "時期も人数もしっかり計画したい",
    scale: 7,
    axes: [{ key: "family_planning_depth", weight: 1.0 }],
    category: "family",
  },
  {
    id: "lp-fam-02",
    questionText: "子育ての方針について、パートナーと意見が違ったら？",
    leftLabel: "柔軟に擦り合わせていけばいい",
    rightLabel: "事前にしっかり話し合って合意したい",
    scale: 5,
    axes: [{ key: "family_planning_depth", weight: 0.8 }],
    category: "family",
  },
  {
    id: "lp-fam-03",
    questionText: "子どもの教育について、どちらに近いですか？",
    leftLabel: "のびのび育てたい。子どもが選べばいい",
    rightLabel: "教育環境は親がしっかり用意するべき",
    scale: 5,
    axes: [{ key: "family_planning_depth", weight: 0.7 }],
    category: "family",
  },
  {
    id: "lp-fam-04",
    questionText: "経済的に余裕がない時期に子どもを望むパートナー。あなたの考えは？",
    leftLabel: "タイミングより気持ちを優先したい",
    rightLabel: "まず経済基盤を固めてから",
    scale: 5,
    axes: [{ key: "family_planning_depth", weight: 0.9 }],
    category: "family",
  },
  {
    id: "lp-fam-05",
    questionText: "家族の形について、あなたの理想は？",
    leftLabel: "二人だけでも十分に幸せ",
    rightLabel: "子どもがいてこそ家族",
    scale: 7,
    axes: [{ key: "family_planning_depth", weight: 0.6 }],
    category: "family",
    note: "子供の有無そのものではなく、家族観の深度を測る",
  },

  // ================================================================
  // kinship_boundary（親族との距離感）— 4問
  // 嫁姑問題: 日本固有の離婚因子。裁判所統計で上位
  // ================================================================
  {
    id: "lp-kin-01",
    questionText: "結婚後、親との関係はどうありたいですか？",
    leftLabel: "頻繁に行き来して、家族ぐるみで過ごしたい",
    rightLabel: "二人の生活を中心に、適度な距離を保ちたい",
    scale: 5,
    axes: [{ key: "kinship_boundary", weight: 1.0 }],
    category: "kinship",
  },
  {
    id: "lp-kin-02",
    questionText: "パートナーの親が「近くに住んでほしい」と言ったら？",
    leftLabel: "できるだけ応えたい",
    rightLabel: "二人で決めたい。距離は自分たちの問題",
    scale: 5,
    axes: [{ key: "kinship_boundary", weight: 0.9 }],
    category: "kinship",
  },
  {
    id: "lp-kin-03",
    questionText: "年末年始や盆、どちらの実家に行くか問題。あなたの理想は？",
    leftLabel: "交互に訪問。親を大切にしたい",
    rightLabel: "二人で過ごす時間も確保したい",
    scale: 5,
    axes: [{ key: "kinship_boundary", weight: 0.7 }],
    category: "kinship",
  },
  {
    id: "lp-kin-04",
    questionText: "親の介護が必要になったとき、どう対応したいですか？",
    leftLabel: "できる限り自分たちで面倒を見たい",
    rightLabel: "プロに任せて、自分たちの生活を守りたい",
    scale: 5,
    axes: [{ key: "kinship_boundary", weight: 0.8 }],
    category: "kinship",
  },

  // ================================================================
  // living_standard（生活水準の期待）— 4問
  // 生活レベルの不一致 = 慢性的不満の源
  // ================================================================
  {
    id: "lp-liv-01",
    questionText: "住まいについて、理想に近いのは？",
    leftLabel: "広さより立地。コンパクトでもいい",
    rightLabel: "広くて快適な空間が欲しい",
    scale: 5,
    axes: [{ key: "living_standard", weight: 0.8 }],
    category: "lifestyle",
  },
  {
    id: "lp-liv-02",
    questionText: "外食の頻度について、理想は？",
    leftLabel: "自炊中心。外食は特別な日に",
    rightLabel: "忙しいときは気軽に外食したい",
    scale: 5,
    axes: [{ key: "living_standard", weight: 0.7 }],
    category: "lifestyle",
  },
  {
    id: "lp-liv-03",
    questionText: "旅行について、どちらに近いですか？",
    leftLabel: "近場でゆっくり。お金をかけなくても楽しめる",
    rightLabel: "年に数回はしっかり旅行したい",
    scale: 5,
    axes: [{ key: "living_standard", weight: 0.8 }],
    category: "lifestyle",
  },
  {
    id: "lp-liv-04",
    questionText: "「もっと節約しよう」と「もっと楽しもう」、パートナーとの会話で多くなりそうなのは？",
    leftLabel: "節約しようと言いそう",
    rightLabel: "楽しもうと言いそう",
    scale: 5,
    axes: [
      { key: "living_standard", weight: 0.9 },
      { key: "financial_values", weight: 0.4 },
    ],
    category: "lifestyle",
  },

  // ================================================================
  // intimacy_expectation（身体的親密さの期待）— 4問
  // Mark & Murray (2012): 欲求不一致 = 性的満足度の最強予測因子
  // Muise et al. (2016): 週1回まで満足度と正相関
  // ================================================================
  {
    id: "lp-int-01",
    questionText: "パートナーとの親密さで、より大切なのは？",
    leftLabel: "言葉や態度で伝わる心のつながり",
    rightLabel: "スキンシップや身体的な近さ",
    scale: 5,
    axes: [{ key: "intimacy_expectation", weight: 1.0 }],
    category: "intimacy",
  },
  {
    id: "lp-int-02",
    questionText: "忙しい日が続いたとき、パートナーに求めるのは？",
    leftLabel: "話を聞いてくれること",
    rightLabel: "そばにいてくれること（物理的な近さ）",
    scale: 5,
    axes: [{ key: "intimacy_expectation", weight: 0.8 }],
    category: "intimacy",
  },
  {
    id: "lp-int-03",
    questionText: "愛情表現について、自然に感じるのは？",
    leftLabel: "手紙を書く、気遣いの言葉をかける",
    rightLabel: "ハグ、手をつなぐ、身体的な距離を縮める",
    scale: 5,
    axes: [{ key: "intimacy_expectation", weight: 0.9 }],
    category: "intimacy",
  },
  {
    id: "lp-int-04",
    questionText: "関係が安定してきた後、親密さについて重要なのは？",
    leftLabel: "深い会話や共有体験で心の距離を保つ",
    rightLabel: "身体的なつながりも意識的に大切にする",
    scale: 5,
    axes: [{ key: "intimacy_expectation", weight: 0.8 }],
    category: "intimacy",
  },

  // ================================================================
  // health_lifestyle（健康・生活習慣の価値観）— 4問
  // ================================================================
  {
    id: "lp-hlt-01",
    questionText: "休日の過ごし方として、より自然なのは？",
    leftLabel: "のんびり家で過ごす",
    rightLabel: "体を動かしたり、外に出かけたりする",
    scale: 5,
    axes: [{ key: "health_lifestyle", weight: 0.8 }],
    category: "health",
  },
  {
    id: "lp-hlt-02",
    questionText: "食事について、より近い考えは？",
    leftLabel: "好きなものを好きなときに食べたい",
    rightLabel: "栄養バランスや体への影響を気にする",
    scale: 5,
    axes: [{ key: "health_lifestyle", weight: 0.9 }],
    category: "health",
  },
  {
    id: "lp-hlt-03",
    questionText: "パートナーの生活習慣（夜更かし、ジャンクフード等）が気になったら？",
    leftLabel: "その人のスタイル。尊重する",
    rightLabel: "健康のために一緒に改善したい",
    scale: 5,
    axes: [{ key: "health_lifestyle", weight: 0.7 }],
    category: "health",
  },
  {
    id: "lp-hlt-04",
    questionText: "飲酒について、あなたの考えは？",
    leftLabel: "お酒は楽しみの一つ。自由に楽しむ",
    rightLabel: "控えめがいい。飲まない日も大切",
    scale: 5,
    axes: [{ key: "health_lifestyle", weight: 0.6 }],
    category: "health",
  },

  // ================================================================
  // cultural_values（文化的・宗教的価値観）— 4問
  // Luo & Klohnen (2005): 態度・価値観の類似性が婚姻満足度を予測
  // Gaunt (2006): Conservation と Self-Transcendence の類似性が最重要
  // ================================================================
  {
    id: "lp-cul-01",
    questionText: "冠婚葬祭やお祝い事について、どちらに近いですか？",
    leftLabel: "しきたりを大切にしたい",
    rightLabel: "形にこだわらず、気持ちがあればいい",
    scale: 5,
    axes: [{ key: "cultural_values", weight: 1.0, invert: true }],
    category: "culture",
    note: "伝統重視=左なので、軸のlabelLeftに合わせてinvert",
  },
  {
    id: "lp-cul-02",
    questionText: "結婚式について、理想に近いのは？",
    leftLabel: "親族を招いてちゃんとした式を挙げたい",
    rightLabel: "二人だけ、または少人数でシンプルに",
    scale: 5,
    axes: [{ key: "cultural_values", weight: 0.8, invert: true }],
    category: "culture",
  },
  {
    id: "lp-cul-03",
    questionText: "「家」や「家族の伝統」について、どう感じますか？",
    leftLabel: "受け継ぐべき大切なもの",
    rightLabel: "自分たちで新しく作ればいい",
    scale: 5,
    axes: [{ key: "cultural_values", weight: 0.9 }],
    category: "culture",
  },
  {
    id: "lp-cul-04",
    questionText: "パートナーと宗教観や信条が異なる場合、どう考えますか？",
    leftLabel: "共有できる方が安心",
    rightLabel: "違いを尊重し合えればいい",
    scale: 5,
    axes: [{ key: "cultural_values", weight: 0.7 }],
    category: "culture",
  },
];

// ── 質問選択ロジック ──

/**
 * パートナー枠のオンボーディング用に最小質問セットを選出
 *
 * 各軸から最も weight が高い質問を1つずつ選び、
 * 8問で全8次元をカバーする最小セット
 */
export function selectMinimalQuestionSet(): LifePlanQuestion[] {
  const selected: LifePlanQuestion[] = [];
  const usedIds = new Set<string>();

  for (const axisKey of LIFE_PLAN_AXIS_KEYS) {
    // この軸に最も関連する質問を見つける（weight最大）
    const candidates = LIFE_PLAN_QUESTIONS
      .filter((q) => !usedIds.has(q.id))
      .filter((q) => q.axes.some((a) => a.key === axisKey))
      .sort((a, b) => {
        const wA = a.axes.find((ax) => ax.key === axisKey)?.weight ?? 0;
        const wB = b.axes.find((ax) => ax.key === axisKey)?.weight ?? 0;
        return wB - wA;
      });

    if (candidates.length > 0) {
      selected.push(candidates[0]);
      usedIds.add(candidates[0].id);
    }
  }

  return selected;
}

/**
 * 信頼度に基づいて追加質問を選出
 *
 * 各軸の現在の信頼度（回答数に基づく）が低い軸から追加質問を選ぶ
 * targetCount: 追加したい質問数
 */
export function selectAdditionalQuestions(params: {
  /** 現在の各軸の回答数 */
  axisResponseCounts: Partial<Record<LifePlanAxisKey, number>>;
  /** 既に回答済みの質問ID */
  answeredQuestionIds: Set<string>;
  /** 追加質問数 */
  targetCount: number;
}): LifePlanQuestion[] {
  const { axisResponseCounts, answeredQuestionIds, targetCount } = params;

  // 回答数が少ない軸を優先
  const axisPriority = [...LIFE_PLAN_AXIS_KEYS].sort((a, b) => {
    const countA = axisResponseCounts[a] ?? 0;
    const countB = axisResponseCounts[b] ?? 0;
    return countA - countB;
  });

  const selected: LifePlanQuestion[] = [];
  const usedIds = new Set<string>(answeredQuestionIds);

  for (const axisKey of axisPriority) {
    if (selected.length >= targetCount) break;

    const candidates = LIFE_PLAN_QUESTIONS
      .filter((q) => !usedIds.has(q.id))
      .filter((q) => q.axes.some((a) => a.key === axisKey));

    if (candidates.length > 0) {
      selected.push(candidates[0]);
      usedIds.add(candidates[0].id);
    }
  }

  return selected;
}

/**
 * Life Plan 質問のカテゴリ別グルーピング（UI表示用）
 */
export function groupQuestionsByCategory(): Record<string, LifePlanQuestion[]> {
  const groups: Record<string, LifePlanQuestion[]> = {};
  for (const q of LIFE_PLAN_QUESTIONS) {
    if (!groups[q.category]) groups[q.category] = [];
    groups[q.category].push(q);
  }
  return groups;
}
