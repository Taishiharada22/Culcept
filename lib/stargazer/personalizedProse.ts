// lib/stargazer/personalizedProse.ts
// ユーザーのスコアから個別化テキストを生成する
// 心理学的根拠: CliftonStrengths (Being Seen)、Frankl (意味の発見)
// 「あなたが当たり前だと思っていたものは、実は稀有な才能だった」

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";
import type { CareerMatch } from "./careerAptitude";

// ── Types ──

export interface PersonalizedCareerInsight {
  /** この職種にあなたが合う理由（スコアベース） */
  whyYouFit: string;
  /** あなた固有の課題 */
  yourChallenge: string;
  /** あなたの強みがどう活きるか */
  strengthApplication: string;
}

// ── Helpers ──

function getAxisDef(axis: TraitAxisKey) {
  return TRAIT_AXES.find((a) => a.id === axis);
}

function getAxisPoleLabel(axis: TraitAxisKey, score: number): string {
  const def = getAxisDef(axis);
  if (!def) return "";
  return score > 0 ? def.labelRight : def.labelLeft;
}

function scoreToIntensity(score: number): string {
  const abs = Math.abs(score);
  if (abs > 0.7) return "強く";
  if (abs > 0.4) return "かなり";
  return "やや";
}

// ── Career Insight Generation ──

/**
 * ユーザーのスコアから、職種ごとのパーソナライズされた説明を生成
 */
export function generateCareerInsight(
  match: CareerMatch,
  axisScores: Partial<Record<TraitAxisKey, number>>,
): PersonalizedCareerInsight {
  const { job, primaryReasons } = match;
  const weights = job.axisWeights;

  // Find the user's strongest matching axes for this job
  const matchingAxes: {
    axis: TraitAxisKey;
    score: number;
    weight: number;
    contribution: number;
  }[] = [];

  const challengeAxes: {
    axis: TraitAxisKey;
    score: number;
    weight: number;
  }[] = [];

  for (const [axis, weight] of Object.entries(weights) as [
    TraitAxisKey,
    number,
  ][]) {
    const score = axisScores[axis];
    if (score === undefined) continue;

    const contribution = score * weight;
    if (contribution > 0) {
      matchingAxes.push({ axis, score, weight, contribution });
    } else if (contribution < -0.1) {
      challengeAxes.push({ axis, score, weight });
    }
  }

  matchingAxes.sort((a, b) => b.contribution - a.contribution);
  challengeAxes.sort((a, b) => a.score * a.weight - b.score * b.weight);

  // Generate "why you fit"
  let whyYouFit: string;
  if (matchingAxes.length >= 2) {
    const top1 = matchingAxes[0];
    const top2 = matchingAxes[1];
    const pole1 = getAxisPoleLabel(top1.axis, top1.score);
    const pole2 = getAxisPoleLabel(top2.axis, top2.score);
    const int1 = scoreToIntensity(top1.score);
    const int2 = scoreToIntensity(top2.score);

    whyYouFit = `あなたが${job.name}に向いているのは、「${pole1}」な面が${int1}出ていて、さらに「${pole2}」な特性も${int2}持っているから。この組み合わせは${job.name}の核心的な力になる。`;
  } else if (matchingAxes.length === 1) {
    const top = matchingAxes[0];
    const pole = getAxisPoleLabel(top.axis, top.score);
    const int = scoreToIntensity(top.score);

    whyYouFit = `あなたの「${pole}」な特性が${int}出ている。これは${job.name}で求められる資質と一致している。`;
  } else {
    whyYouFit = job.whyGoodFit;
  }

  // Generate "your challenge"
  let yourChallenge: string;
  if (challengeAxes.length > 0) {
    const ch = challengeAxes[0];
    const pole = getAxisPoleLabel(ch.axis, ch.score);
    const desiredPole = getAxisPoleLabel(
      ch.axis,
      ch.weight > 0 ? 1 : -1,
    );
    yourChallenge = `あなたは「${pole}」寄りだが、この仕事では「${desiredPole}」が求められる場面がある。ここが意識的にエネルギーを使うポイントになる。`;
  } else {
    yourChallenge = job.watchOut;
  }

  // Generate "strength application"
  let strengthApplication: string;
  if (matchingAxes.length >= 1) {
    const top = matchingAxes[0];
    const pole = getAxisPoleLabel(top.axis, top.score);
    strengthApplication = `あなたの「${pole}」は、この仕事で最も自然に力が流れるポイント。意識しなくても発揮される。`;
  } else {
    strengthApplication = `この仕事ではあなたの全体的なバランスが活きる。特定の突出した強みよりも、安定感が武器になる。`;
  }

  return { whyYouFit, yourChallenge, strengthApplication };
}

// ── Decision Pattern Generation ──

export interface DecisionPattern {
  /** 意思決定の傾向 */
  tendency: string;
  /** 見落としやすいもの */
  blindSpot: string;
  /** ストレス下の判断変化 */
  stressShift: string;
  /** 日常生活での具体例 */
  dailyExample: string;
}

/** あなたの人生のコンパス — Level 5 "meaning" insight */
export interface LifeCompass {
  /** "あなたは〇〇な人間" */
  coreStatement: string;
  /** あなたが自然に世界に与えているもの */
  naturalGifts: string[];
  /** あなたが深く必要としているもの */
  deepNeed: string;
  /** 次の成長が待っている場所 */
  growthEdge: string;
  /** 今日できるひとつのこと */
  dailyPractice: string;
}

/**
 * 軸スコアから意思決定パターンを導出する
 */
export function generateDecisionPattern(
  axisScores: Partial<Record<TraitAxisKey, number>>,
): DecisionPattern | null {
  const analytical = axisScores.analytical_vs_intuitive;
  const plan = axisScores.plan_vs_spontaneous;
  const bold = axisScores.cautious_vs_bold;
  const regulation = axisScores.emotional_regulation;
  const direct = axisScores.direct_vs_diplomatic;
  const independence = axisScores.independence_vs_harmony;

  if (
    analytical === undefined &&
    plan === undefined &&
    bold === undefined
  ) {
    return null;
  }

  // Determine tendency
  let tendency: string;
  if ((analytical ?? 0) < -0.3 && (plan ?? 0) < -0.3) {
    tendency =
      "情報を十分に集め、分析してから判断する。決断は遅めだが精度が高い。締め切りがないと永遠に分析し続ける危険がある。";
  } else if ((analytical ?? 0) > 0.3 && (bold ?? 0) > 0.3) {
    tendency =
      "直感と勢いで判断する。決断は速い。ただし、後から「もう少し考えればよかった」と思うこともある。";
  } else if ((analytical ?? 0) < -0.3 && (bold ?? 0) > 0.3) {
    tendency =
      "分析した上で大胆に動く。情報収集と即断のバランスが取れているが、時に「分析は言い訳で、実は最初から答えは決まっていた」ことがある。";
  } else if ((plan ?? 0) < -0.3) {
    tendency =
      "計画を立ててから動く。予定外のことが起きると一瞬固まる。ただし、計画があるからこそ柔軟な対応もできる。";
  } else if ((bold ?? 0) < -0.3) {
    tendency =
      "リスクを慎重に見積もってから判断する。大きな賭けは避ける。でもそれは弱さではなく、失うものの大きさを正確に理解しているから。";
  } else {
    tendency =
      "状況に応じて柔軟に判断スタイルを変える。特定のパターンに偏りすぎない、バランス型の意思決定者。";
  }

  // Determine blind spot
  let blindSpot: string;
  if ((direct ?? 0) < -0.3 && (independence ?? 0) > 0.3) {
    blindSpot =
      "率直に言える反面、相手の感情面への影響を見落としやすい。自分の論理が正しければ伝わると思いがちだが、人は論理だけでは動かない。";
  } else if ((direct ?? 0) > 0.3) {
    blindSpot =
      "配慮が先に立つため、自分の本当の意見を後回しにしがち。結果として「自分は何を選びたかったのか」がわからなくなることがある。";
  } else if ((analytical ?? 0) < -0.3) {
    blindSpot =
      "データや論理で武装するが、「この判断は感情から来ているのに論理で正当化している」パターンに気づきにくい。";
  } else if ((bold ?? 0) > 0.3) {
    blindSpot =
      "勢いで決めた後に「なぜこれを選んだか」を説明できないことがある。直感は正しいことが多いが、説明できないと周囲の理解を得にくい。";
  } else {
    blindSpot =
      "バランスが取れている分、「これだけは譲れない」という軸が見えにくいことがある。柔軟さと優柔不断の境界に注意。";
  }

  // Stress shift
  let stressShift: string;
  if ((regulation ?? 0) > 0.3) {
    stressShift =
      "ストレス下でも判断の質はあまり落ちない。ただし「冷静でいること自体」にエネルギーを消費しているので、判断の後にどっと疲れが来る。";
  } else if ((regulation ?? 0) < -0.3) {
    stressShift =
      "ストレス下では普段と違う判断をしがち。感情に引っ張られる。重要な判断は、感情が落ち着いてから行うルールを持つと良い。";
  } else {
    stressShift =
      "ストレス時の判断は場合による。自分のストレスサインに気づくことが、判断の質を保つ鍵。";
  }

  // Daily example — concrete scenario
  let dailyExample: string;
  if ((analytical ?? 0) < -0.3 && (plan ?? 0) < -0.3) {
    dailyExample =
      "たとえばランチの店を選ぶ時、口コミを5件以上読んでから決める。「なんとなく」では入れない。友人に「考えすぎ」と言われるが、外れを引いた経験を思い出すとやめられない。";
  } else if ((analytical ?? 0) > 0.3 && (bold ?? 0) > 0.3) {
    dailyExample =
      "たとえば新しい店を見つけたら、レビューも見ずに入る。「ピンときた」が最強の判断基準。結果が良ければ「やっぱり直感は正しい」、悪くても「経験値が増えた」と変換できる。";
  } else if ((analytical ?? 0) < -0.3 && (bold ?? 0) > 0.3) {
    dailyExample =
      "たとえば引っ越しを検討する時、家賃相場・通勤時間・治安データを徹底的に調べた上で、最終的には「この部屋、なんか好き」で決める。分析は安心材料で、最後は直感。";
  } else if ((plan ?? 0) < -0.3) {
    dailyExample =
      "たとえば旅行は出発の2週間前から時間割を作る。予定外の予定が入ると一瞬フリーズするが、リカバリープランを立て直す速度は実は速い。";
  } else if ((bold ?? 0) < -0.3) {
    dailyExample =
      "たとえば転職を考えた時、「今の会社を辞めるリスク」を先に計算する。安定を捨てる怖さは弱さではなく、今あるものの価値を正確に知っているということ。";
  } else if ((direct ?? 0) > 0.3) {
    dailyExample =
      "たとえば会議で意見を求められた時、場の空気を読んで「皆さんはどう思いますか」と返す。自分の意見はあるが、先に出すと波風が立つ気がして言えない。帰り道で「あの時言えばよかった」と思う。";
  } else if ((independence ?? 0) < -0.3) {
    dailyExample =
      "たとえばグループでの食事の店選びで、自分が行きたい店があっても「みんなに合わせます」と言ってしまう。後から「本当はあの店に行きたかった」と気づくが、次も同じことをする。";
  } else {
    dailyExample =
      "たとえば週末の過ごし方を決める時、その日の気分やエネルギー状態で判断スタイルが変わる。元気な時は直感的に、疲れている時は慎重に。一貫しないのは弱みではなく、自分の状態に適応できている証拠。";
  }

  return { tendency, blindSpot, stressShift, dailyExample };
}

// ── Strength Narrative Generation ──

/**
 * ユーザーの上位軸スコアから、自然な強みのナラティブ（物語）を生成する
 * CliftonStrengths の Being Seen 原則: 「あなたが当たり前だと思っていたことは、稀有な才能」
 */
export function generateStrengthNarrative(
  axisScores: Partial<Record<TraitAxisKey, number>>,
): string | null {
  // 上位5軸を取得（絶対値が大きい順、coreとmotionカテゴリ優先）
  const entries = Object.entries(axisScores) as [TraitAxisKey, number][];
  const scored = entries
    .filter(([, s]) => s !== undefined && Math.abs(s) >= 0.3)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 5)
    .map(([axis, score]) => ({
      axis,
      score,
      pole: getAxisPoleLabel(axis, score),
      intensity: scoreToIntensity(score),
    }));

  if (scored.length < 2) return null;

  // 軸の組み合わせから強みのストーリーを紡ぐ
  const fragments: string[] = [];

  // 第一の力: 最強の軸
  const primary = scored[0];
  fragments.push(
    `あなたの中で最も自然に、最も力強く流れているのは「${primary.pole}」という特性。これはあなたが意識しなくても発揮される、いわば呼吸のような力。`,
  );

  // 第二の力: 2番目の軸との組み合わせ
  const secondary = scored[1];
  fragments.push(
    `そしてこの力は「${secondary.pole}」と組み合わさることで、独自の形を取る。${primary.pole}と${secondary.pole}——この二つが同時に働くことで、あなたにしかできないアプローチが生まれている。`,
  );

  // 第三以降: サポートする軸
  if (scored.length >= 3) {
    const supporting = scored.slice(2);
    const supportLabels = supporting.map((s) => `「${s.pole}」`).join("、");
    fragments.push(
      `さらに${supportLabels}がこれを支えている。あなたが「普通のこと」だと思っているこの組み合わせは、実は全人口の中でもかなり珍しい。`,
    );
  }

  // 締め: Being Seen の瞬間
  fragments.push(
    "周囲の人があなたに頼ってくるのは、この力を無意識に感じ取っているから。あなたが当たり前だと思っていることが、他の人にとっては「どうやっているの？」と不思議に思われること——それがあなたの天賦の力。",
  );

  return fragments.join("");
}

// ── Life Compass Generation (Level 5) ──

/** 軸パターンから深い欲求を推定 */
function inferDeepNeed(
  axisScores: Partial<Record<TraitAxisKey, number>>,
): string {
  const introvert = axisScores.introvert_vs_extrovert ?? 0;
  const independence = axisScores.independence_vs_harmony ?? 0;
  const reassurance = axisScores.reassurance_need ?? 0;
  const regulation = axisScores.emotional_regulation ?? 0;
  const perfectionist = axisScores.perfectionist_vs_pragmatic ?? 0;
  const quality = axisScores.quality_vs_quantity ?? 0;

  // パターンマッチで深い欲求を推定
  if (reassurance > 0.3) {
    return "あなたが最も深く必要としているのは「無条件の承認」。成果や貢献に関係なく、存在そのものを認められること。それがあれば、あなたは最も自然な状態でいられる。";
  }
  if (introvert < -0.3 && independence < -0.3) {
    return "あなたが最も深く必要としているのは「自分だけの聖域」。外界から遮断された、誰にも侵入されない空間と時間。そこであなたは自分を取り戻す。";
  }
  if (independence > 0.3 && introvert > 0.3) {
    return "あなたが最も深く必要としているのは「帰属感」。自分が受け入れられていると感じるコミュニティや関係。でもそれを求めていることを認めるのが、少し怖い。";
  }
  if (perfectionist < -0.3 && quality < -0.3) {
    return "あなたが最も深く必要としているのは「不完全でも愛される経験」。完璧でなくても価値があると、頭ではなく心で感じられる瞬間。";
  }
  if (regulation < -0.3) {
    return "あなたが最も深く必要としているのは「感情の安全基地」。感情が揺れた時にそのまま受け止めてくれる存在や環境。自分を否定せずに「今そう感じているんだね」と言ってくれること。";
  }
  if (regulation > 0.3) {
    return "あなたが最も深く必要としているのは「鎧を脱げる場所」。常に冷静で適切に振る舞えるあなたが、感情をそのまま表に出せる安全な空間。";
  }

  return "あなたが最も深く必要としているのは「自分であることへの許可」。社会的な期待や自分が作り上げた基準から一度離れて、素の自分を肯定できること。";
}

/** 軸パターンから成長のエッジを推定 */
function inferGrowthEdge(
  axisScores: Partial<Record<TraitAxisKey, number>>,
): string {
  const entries = Object.entries(axisScores) as [TraitAxisKey, number][];

  // 最も極端な軸を見つける（これが偏りの最大地点）
  const mostExtreme = entries
    .filter(([, s]) => s !== undefined)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];

  if (!mostExtreme) {
    return "あなたの次の成長は、「これだけは譲れない」という一つの軸を見つけること。バランスの良さは強みだが、軸がないと流されやすい。";
  }

  const [axis, score] = mostExtreme;
  const def = TRAIT_AXES.find((a) => a.id === axis);
  if (!def) {
    return "あなたの次の成長は、最も得意なことの反対側を少しだけ探索すること。";
  }

  const currentPole = score > 0 ? def.labelRight : def.labelLeft;
  const oppositePole = score > 0 ? def.labelLeft : def.labelRight;

  return `あなたの次の成長が待っている場所は「${currentPole}」の反対側——「${oppositePole}」の領域。これはあなたの強みを捨てることではなく、強みをより柔軟に使えるようになること。「${oppositePole}」を少し取り入れた時、あなたの「${currentPole}」はさらに輝く。`;
}

/** 軸パターンから自然に与えているものを推定 */
function inferNaturalGifts(
  axisScores: Partial<Record<TraitAxisKey, number>>,
): string[] {
  const gifts: string[] = [];

  const analytical = axisScores.analytical_vs_intuitive ?? 0;
  const direct = axisScores.direct_vs_diplomatic ?? 0;
  const independence = axisScores.independence_vs_harmony ?? 0;
  const bold = axisScores.cautious_vs_bold ?? 0;
  const plan = axisScores.plan_vs_spontaneous ?? 0;
  const introvert = axisScores.introvert_vs_extrovert ?? 0;
  const perfectionist = axisScores.perfectionist_vs_pragmatic ?? 0;
  const regulation = axisScores.emotional_regulation ?? 0;
  const quality = axisScores.quality_vs_quantity ?? 0;
  const change = axisScores.change_embrace_vs_resist ?? 0;

  if (analytical < -0.3) gifts.push("物事を整理し、複雑さの中に構造を見出す力");
  if (analytical > 0.3) gifts.push("直感で本質を掴み、言語化される前の答えに到達する力");
  if (direct < -0.3) gifts.push("正直さ——あなたの言葉には嘘がなく、周囲はそれを信頼している");
  if (direct > 0.3) gifts.push("場の空気を読み、誰もが安心できる環境を作る力");
  if (independence > 0.3) gifts.push("他者と自然に調和し、チームの一体感を生み出す力");
  if (independence < -0.3) gifts.push("独自の視点を持ち続ける強さ——流されない軸を周囲に示している");
  if (bold > 0.3) gifts.push("「やってみよう」という勇気で、周囲に可能性を見せる力");
  if (bold < -0.3) gifts.push("慎重さによる安定感——あなたがいると周囲は安心して冒険できる");
  if (plan < -0.3) gifts.push("計画と構造を作り出し、混沌を秩序に変える力");
  if (plan > 0.3) gifts.push("即興で状況に対応する柔軟さ——予想外の事態でも楽しめる軽やかさ");
  if (introvert > 0.3) gifts.push("エネルギーで場を明るくし、人を巻き込む力");
  if (perfectionist < -0.3) gifts.push("妥協しない品質基準で、周囲の水準を引き上げている");
  if (regulation > 0.3) gifts.push("感情が荒れている場面でも冷静さを保ち、周囲の錨になる力");
  if (quality < -0.3) gifts.push("深く掘り下げ、表面では見えない価値を見つけ出す力");
  if (change < -0.3) gifts.push("変化を恐れず新しい可能性を探索し、停滞を打破する力");

  // 最低2つは返す
  if (gifts.length < 2) {
    gifts.push("あなたのバランス感覚——偏りすぎない安定した視点を自然に提供している");
    gifts.push("場に合わせた適切な反応で、周囲に安心感を与えている");
  }

  return gifts.slice(0, 4);
}

/**
 * Level 5 インサイト: 人生のコンパスを生成する
 * Frankl の「意味の発見」原則: 人は意味を見出した時に最も力を発揮する
 */
export function generateLifeCompass(
  axisScores: Partial<Record<TraitAxisKey, number>>,
  archetypeCode?: string,
): LifeCompass | null {
  const entries = Object.entries(axisScores) as [TraitAxisKey, number][];
  const significantAxes = entries.filter(
    ([, s]) => s !== undefined && Math.abs(s) >= 0.3,
  );

  if (significantAxes.length < 3) return null;

  // コアステートメントの生成
  const top3 = significantAxes
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3)
    .map(([axis, score]) => getAxisPoleLabel(axis, score));

  const coreStatement = `あなたは、「${top3[0]}」と「${top3[1]}」を自然に兼ね備え、「${top3[2]}」で世界と関わる人間。この組み合わせが、あなたを「あなた」にしている。`;

  const naturalGifts = inferNaturalGifts(axisScores);
  const deepNeed = inferDeepNeed(axisScores);
  const growthEdge = inferGrowthEdge(axisScores);

  // 日常プラクティスの生成（成長のエッジに対応）
  const mostExtreme = significantAxes.sort(
    (a, b) => Math.abs(b[1]) - Math.abs(a[1]),
  )[0];
  let dailyPractice: string;

  if (mostExtreme) {
    const [axis, score] = mostExtreme;
    const def = TRAIT_AXES.find((a) => a.id === axis);
    const oppositePole = def
      ? (score > 0 ? def.labelLeft : def.labelRight)
      : "反対側";

    const practices: Record<string, string> = {
      introvert_vs_extrovert:
        score > 0
          ? "今日、一人で15分間静かに過ごす時間を意識的に作ってみる"
          : "今日、誰か一人に自分から声をかけてみる。小さな会話でいい",
      analytical_vs_intuitive:
        score > 0
          ? "今日の一つの判断を、理由を3つ挙げてから決めてみる"
          : "今日の一つの判断を、直感に従って即決してみる",
      cautious_vs_bold:
        score > 0
          ? "今日、一つだけ「やめておこう」と思ったことをあえてやってみる"
          : "今日、一つだけ「もう少し考えてから」を自分に許可してみる",
      plan_vs_spontaneous:
        score > 0
          ? "今日の午後は、予定を入れずに「その場で決める」を試してみる"
          : "今日、明日の予定を一つだけ前もって決めてみる",
      independence_vs_harmony:
        score > 0
          ? "今日、自分の意見をいったん保留して、相手の視点に完全に乗ってみる"
          : "今日、「私はこう思う」を一回だけ先に言ってみる",
      direct_vs_diplomatic:
        score > 0
          ? "今日、言いたいことを一度飲み込んで、相手の気持ちを先に想像してみる"
          : "今日、感じていることを一つだけ率直に伝えてみる",
      perfectionist_vs_pragmatic:
        score > 0
          ? "今日、何か一つを「60%の完成度」で意図的に提出してみる"
          : "今日、何か一つに普段より10分多く時間をかけて仕上げてみる",
    };

    dailyPractice =
      practices[axis] ??
      `今日、「${oppositePole}」を5分だけ意識してみる。それだけで新しい自分の側面に出会える。`;
  } else {
    dailyPractice =
      "今日、自分の判断や行動を一つだけ観察してみる。「なぜそうしたか」を問うのではなく、「何を感じたか」に注目する。";
  }

  return {
    coreStatement,
    naturalGifts,
    deepNeed,
    growthEdge,
    dailyPractice,
  };
}
