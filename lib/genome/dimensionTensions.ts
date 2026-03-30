// lib/genome/dimensionTensions.ts
// ユーザーの15軸パーソナリティスコアから「あなただけの矛盾・洞察・禁断の問い」を生成
// 27アーキタイプの定型文ではなく、スコアの組み合わせから動的に生成する

/**
 * 2軸の組み合わせから生まれる「矛盾」の定義
 * condition: 両軸のスコアがこの条件を満たすとき発火
 * insight: その矛盾から生まれる洞察
 * question: その矛盾を突く「禁断の問い」
 */
interface TensionRule {
  axisA: string;
  axisB: string;
  condition: (a: number, b: number) => boolean;
  insight: string;
  question: string;
  /** 強度: この矛盾がどれだけ「刺さる」か（ソート用） */
  intensity: number;
}

/** 1軸の極端さから生まれる洞察 */
interface ExtremeRule {
  axis: string;
  condition: (score: number) => boolean;
  insight: string;
  question: string;
  intensity: number;
}

// ── 2軸の矛盾ルール ──
const TENSION_RULES: TensionRule[] = [
  // 慎重 × 独立 → 孤立の矛盾
  {
    axisA: "cautious_vs_bold", axisB: "independence_vs_harmony",
    condition: (cautious, independent) => cautious > 0.7 && independent > 0.65,
    insight: "石橋を叩きすぎて、気づいたら橋の向こうに誰もいなくなっている——そんな経験、ないですか？",
    question: "慎重さは、本当に自分を守れていますか？",
    intensity: 9,
  },
  // 社交的 × 独立 → 人が好きなのに合わせたくない
  {
    axisA: "introvert_vs_extrovert", axisB: "independence_vs_harmony",
    condition: (extrovert, independent) => extrovert > 0.6 && independent > 0.6,
    insight: "人が好きなのに、人に合わせるのが嫌い。集まりに行くけど、途中で帰りたくなる。",
    question: "人といるときの自分と、ひとりのときの自分、どっちが本物？",
    intensity: 9,
  },
  // 分析的 × 感情不安定 → 頭ではわかってるのに
  {
    axisA: "analytical_vs_intuitive", axisB: "emotional_stable_vs_volatile",
    condition: (analytical, volatile) => analytical > 0.65 && volatile > 0.6,
    insight: "頭ではわかってるのに、感情がそれを許さない。理屈で自分を説得しようとして、余計に疲れる。",
    question: "正しい選択と、楽になれる選択が違うとき、いつもどっちを選んでいますか？",
    intensity: 10,
  },
  // 直感的 × 慎重 → 感じてるのに動けない
  {
    axisA: "analytical_vs_intuitive", axisB: "cautious_vs_bold",
    condition: (intuitive, cautious) => intuitive < 0.4 && cautious > 0.65,
    insight: "「こうすべき」って直感でわかるのに、確証がないと動けない。その迷っている時間が一番つらい。",
    question: "直感を信じて失敗するのと、慎重に考えて手遅れになるの、どっちが多い？",
    intensity: 8,
  },
  // 表現欲 × 内向 → 見てほしいのに見られたくない
  {
    axisA: "function_vs_expression", axisB: "introvert_vs_extrovert",
    condition: (expression, introvert) => expression > 0.65 && introvert < 0.4,
    insight: "作品は見てほしいけど、自分は見られたくない。表現したいのに、注目されると逃げたくなる。",
    question: "もし誰にも見られないとしたら、何を作りますか？",
    intensity: 8,
  },
  // 大胆 × 調和 → 切り込むけど嫌われたくない
  {
    axisA: "cautious_vs_bold", axisB: "independence_vs_harmony",
    condition: (bold, harmony) => bold < 0.35 && harmony < 0.4,
    insight: "思い切ったことを言うくせに、相手の反応を見て後悔する。切り込んだあとに、嫌われてないか確認してしまう。",
    question: "本音を言ったあと、すぐに相手の顔色を見ていませんか？",
    intensity: 9,
  },
  // 品質志向 × 変化受容 → 完璧主義なのにやり方を変えたい
  {
    axisA: "quality_vs_quantity", axisB: "change_embrace_vs_resist",
    condition: (quality, change) => quality > 0.7 && change > 0.6,
    insight: "完璧に仕上げたいのに、途中で「もっと良い方法がある」と思って最初からやり直す。永遠に完成しない。",
    question: "「これでいい」と思えたのは、最後にいつですか？",
    intensity: 7,
  },
  // 伝統 × 表現 → ルールの中で自分を出す葛藤
  {
    axisA: "tradition_vs_novelty", axisB: "function_vs_expression",
    condition: (tradition, expression) => tradition > 0.6 && expression > 0.6,
    insight: "ルールは守りたいけど、自分らしさも出したい。「ちゃんとしてる人」の仮面の下で、本当は暴れたい自分がいる。",
    question: "「普通」でいることに、疲れていませんか？",
    intensity: 8,
  },
  // 外向 × ストレス内向化 → 人前では元気だけど
  {
    axisA: "introvert_vs_extrovert", axisB: "stress_external_vs_internal",
    condition: (extrovert, stressInternal) => extrovert > 0.6 && stressInternal < 0.4,
    insight: "人前では明るいのに、家に帰ると電池が切れたみたいに動けなくなる。「元気な人」という役割に疲れている。",
    question: "「大丈夫？」って聞かれたとき、本当のことを言えていますか？",
    intensity: 10,
  },
  // 計画的 × 自発的 → 計画するけど守れない
  {
    axisA: "plan_vs_spontaneous", axisB: "cautious_vs_bold",
    condition: (plan, bold) => plan > 0.65 && bold < 0.35,
    insight: "完璧な計画を立てるのが好きなのに、いざとなると「今日じゃなくていいか」と思ってしまう。準備は万端、実行は明日。",
    question: "計画を立てること自体が、行動の代わりになっていませんか？",
    intensity: 7,
  },
  // ミニマル × 社交 → シンプルに生きたいのに断れない
  {
    axisA: "minimal_vs_maximal", axisB: "introvert_vs_extrovert",
    condition: (minimal, social) => minimal > 0.65 && social > 0.55,
    insight: "持ち物は減らせるのに、人間関係は減らせない。「断捨離」したいのは物じゃなくて、付き合いのほう。",
    question: "本当に必要な人は、何人ですか？",
    intensity: 8,
  },
];

// ── 1軸の極端さルール ──
const EXTREME_RULES: ExtremeRule[] = [
  {
    axis: "emotional_stable_vs_volatile",
    condition: (s) => s > 0.8,
    insight: "感情の波が激しいのは弱さじゃない。世界を強く感じているだけ。でも、その波に溺れそうになるときがある。",
    question: "最後に泣いたのは、いつですか？",
    intensity: 9,
  },
  {
    axis: "emotional_stable_vs_volatile",
    condition: (s) => s < 0.2,
    insight: "どんなときも冷静でいられる。でも、「何も感じない自分」が怖くなることがある。",
    question: "感情を押し殺しているのか、本当に感じていないのか、自分でわかりますか？",
    intensity: 9,
  },
  {
    axis: "independence_vs_harmony",
    condition: (s) => s > 0.85,
    insight: "誰にも頼らなくていい。でも「頼らなくていい」と「頼れない」は、似ているようで全然違う。",
    question: "最後に誰かに「助けて」と言ったのは、いつですか？",
    intensity: 10,
  },
  {
    axis: "cautious_vs_bold",
    condition: (s) => s < 0.15,
    insight: "怖いもの知らず、ではない。怖いものから逃げるために前に進んでいるだけかもしれない。",
    question: "勇気と無謀の違いを、いつも見極められていますか？",
    intensity: 8,
  },
  {
    axis: "introvert_vs_extrovert",
    condition: (s) => s < 0.15,
    insight: "ひとりの時間は充電ではなく、生存に必要な酸素。でも時々、酸素が多すぎて窒息しそうになる。",
    question: "ひとりでいるのが好きなのか、人といるのが怖いのか、どっちですか？",
    intensity: 9,
  },
  {
    axis: "quality_vs_quantity",
    condition: (s) => s > 0.85,
    insight: "「これでいい」と思えない。永遠に磨き続ける。でも、完璧を求める本当の理由は、批判されるのが怖いから。",
    question: "70点で出す勇気と、100点を目指して出さない臆病、どちらを選んでいますか？",
    intensity: 8,
  },
];

export interface PersonalInsight {
  /** 洞察テキスト */
  insight: string;
  /** 禁断の問い */
  question: string;
  /** 発火源（デバッグ・説明用） */
  source: string;
  /** 強度スコア */
  intensity: number;
}

/**
 * 15軸のスコアから「あなただけの矛盾・洞察・問い」を生成
 * @param dimensions Record<axis_id, score(0-1)>
 * @returns 強度順にソートされた洞察（最大3つ）
 */
export function generatePersonalInsights(
  dimensions: Record<string, number>,
): PersonalInsight[] {
  const results: PersonalInsight[] = [];

  // 2軸矛盾をチェック
  for (const rule of TENSION_RULES) {
    const a = dimensions[rule.axisA];
    const b = dimensions[rule.axisB];
    if (a !== undefined && b !== undefined && rule.condition(a, b)) {
      results.push({
        insight: rule.insight,
        question: rule.question,
        source: `${rule.axisA} × ${rule.axisB}`,
        intensity: rule.intensity,
      });
    }
  }

  // 1軸極端をチェック
  for (const rule of EXTREME_RULES) {
    const score = dimensions[rule.axis];
    if (score !== undefined && rule.condition(score)) {
      results.push({
        insight: rule.insight,
        question: rule.question,
        source: rule.axis,
        intensity: rule.intensity,
      });
    }
  }

  // 強度順でソート、最大3つ
  results.sort((a, b) => b.intensity - a.intensity);
  return results.slice(0, 3);
}
