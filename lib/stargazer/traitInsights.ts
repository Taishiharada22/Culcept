// lib/stargazer/traitInsights.ts
// 深層パターンの統合: 見守り型・影・守っているもの
// 心理学的根拠:
//   IFS — 「悪いパーツはない。全ての行動には正の意図がある」
//   Jung — 「影の中に成長の鍵がある」
//   Enneagram — 「パターンに名前がつくと自由になる」
//   Rogers — 「incongruence の解消が変容を生む」

import type { ArchetypeCode, ArchetypeDef, Layer1Code, CognitionCode } from "./archetypeTypes";
import {
  getArchetypeByCode,
  LAYER1_DEFS,
  LAYER2_DEFS,
  LAYER3_DEFS,
  parseArchetypeCode,
} from "./archetypeTypes";
import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";
import type { DualArchetypeResult } from "./archetypeResolver";

// ── Types ──

/** 個別化された見守り型の描写 */
export interface PersonalizedGuardian {
  /** 見守り型の名前（行動パターン） */
  name: string;
  /** この見守り型がどう現れているか（軸スコアベース） */
  manifestation: string;
  /** この見守り型の正の意図 */
  positiveIntent: string;
  /** 過剰に働いた時の副作用 */
  overprotection: string;
}

/** あなたが守っているもの — Level 4 Insight */
export interface ProtectionInsight {
  /** Layer1から: 守っているものの名前 */
  protectionName: string;
  /** 守っているものの深い説明 */
  protectionDescription: string;
  /** 見守り型たち（行動パターン）の説明 */
  guardians: string;
  /** 個別化された見守り型の詳細（軸スコアベース） */
  personalizedGuardians: PersonalizedGuardian[];
  /** 見守り型への感謝 — IFS原則: 全てのパーツに正の意図がある */
  gratitude: string;
  /** 安全な時のあなた */
  safeState: string;
  /** 脅かされた時のあなた */
  stressState: string;
  /** 成長の鍵 */
  growthKey: string;
  /** もうひとりのアーキタイプ */
  shadow: {
    name: string;
    emoji: string;
    tension: string;
    /** もうひとりの自分が持つ「あなたが必要としているもの」 */
    gift: string;
    /** もうひとりの自分との統合のヒント */
    integrationHint: string;
  };
  /** 引用 */
  quote?: { text: string; author: string };
}

/** 自己認識ギャップの深い分析 */
export interface GapAnalysis {
  /** ギャップの種類 */
  gapType: "same" | "layer1" | "layer2" | "layer3" | "multi";
  /** 各層のギャップ詳細 */
  layers: {
    layerName: string;
    selfLabel: string;
    dataLabel: string;
    matches: boolean;
    /** ギャップの仮説（なぜズレるのか） */
    hypothesis: string | null;
  }[];
  /** 全体的な洞察 */
  overallInsight: string;
  /** selfView / observedView */
  selfView: string | null;
  observedView: string | null;
}

// ── Protection Insight (Level 4) ──

const LAYER1_DEEP_DESCRIPTIONS: Record<CognitionCode, {
  protectionDescription: string;
  guardians: string;
  gratitudeBase: string;
}> = {
  A: {
    protectionDescription:
      "あなたの心の奥には「自分はここにいていいのかな」って気持ちがある。結果を出すこと、認められること、何かを証明することで、その不安に答えようとしてる。これは弱さじゃない。誰もが持ってる大事な気持ちだよ。",
    guardians:
      "完璧主義、結果にこだわること、人の評価が気になること。これは全部、同じ大切なものを守るための仕組み。この仕組みは悪者じゃない。ずっとあなたを守ってきた。ただ、頑張りすぎると、あなた自身がしんどくなる。",
    gratitudeBase:
      "あなたの中の「守る仕組み」は、傷つかないようにずっと先回りしてきた。「もっと頑張らなきゃ」「もっとちゃんとしなきゃ」って声は、追い詰めるためじゃなく、守るために生まれたもの。今まで守ってくれて、ありがとう。",
  },
  N: {
    protectionDescription:
      "あなたの心の奥には「誰かと繋がっていたい」って強い気持ちがある。一人が怖いんじゃなくて、繋がりの中にいることで自分を感じられる。人との関係はあなたにとって空気みたいに大事なもの。",
    guardians:
      "相手の気持ちを読む力、場の空気を整える力、自分のことを後回しにする癖。これは繋がりを守るための仕組み。でも繋がりを守ろうとしすぎて、自分自身を見失うことがある。",
    gratitudeBase:
      "あなたの中の「守る仕組み」は、大事な人との絆が切れないように、ずっと橋を架け続けてきた。「相手を傷つけないように」「この関係を壊さないように」って気配り、それはあなたの優しさそのもの。今まで繋がりを守ってくれて、ありがとう。",
  },
  S: {
    protectionDescription:
      "あなたの心の奥には「これを失いたくない」って感覚がある。安心できる場所、予測できる環境、自分でコントロールできる範囲。それを確保することが、あなたのエネルギーの使い方の根っこにある。",
    guardians:
      "慎重に判断すること、リスクを先に考えること、変化を避けること。これは安全を守るための仕組み。でもこの仕組みが強く働きすぎると、本当に欲しいものに手を伸ばせなくなることがある。",
    gratitudeBase:
      "あなたの中の「守る仕組み」は、あなたが安全でいられるように、ずっと見張りを続けてきた。「ここは危ないかも」「もうちょっと様子を見よう」って慎重さのおかげで、今日も無事でいられる。今まで安全を守ってくれて、ありがとう。",
  },
};

// ── Personalized Guardian Generation ──

/** 軸スコアの上位N件を取得（絶対値が大きい順） */
function getTopAxes(
  axisScores: Partial<Record<TraitAxisKey, number>>,
  categories?: string[],
  count = 3,
): { axis: TraitAxisKey; score: number; label: string }[] {
  const entries = Object.entries(axisScores) as [TraitAxisKey, number][];
  return entries
    .filter(([axis, score]) => {
      if (score === undefined || score === 0) return false;
      if (!categories) return true;
      const def = TRAIT_AXES.find((a) => a.id === axis);
      return def ? categories.includes(def.category) : false;
    })
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, count)
    .map(([axis, score]) => {
      const def = TRAIT_AXES.find((a) => a.id === axis);
      const label = def
        ? (score > 0 ? def.labelRight : def.labelLeft)
        : axis;
      return { axis, score, label };
    });
}

/** Layer1コードと軸スコアの組み合わせから見守り型パターンを定義 */
const GUARDIAN_PATTERNS: Record<CognitionCode, {
  axis: TraitAxisKey;
  /** scoreが閾値を超えた時（正方向）に発動 */
  positiveMatch: {
    name: string;
    manifestation: (intensity: string) => string;
    positiveIntent: string;
    overprotection: string;
  };
  /** scoreが閾値を超えた時（負方向）に発動 */
  negativeMatch: {
    name: string;
    manifestation: (intensity: string) => string;
    positiveIntent: string;
    overprotection: string;
  };
}[]> = {
  A: [
    {
      axis: "analytical_vs_intuitive",
      positiveMatch: {
        name: "直感の戦士",
        manifestation: (i) => `あなたの証明欲求は${i}「直感でパッと掴んで結果を出す」という形で現れている。根拠を問われると不安になる`,
        positiveIntent: "スピードで先に証明してしまうことで、疑われる前に結果を見せようとしている",
        overprotection: "「なぜそう判断したか」を後から説明できず、成果が認められにくくなることがある",
      },
      negativeMatch: {
        name: "分析の鎧",
        manifestation: (i) => `あなたの証明欲求は${i}「データと根拠で自分を武装する」という形で現れている。完璧な証拠がないと動けない`,
        positiveIntent: "論理で武装することで、反論される余地をなくし、自分の立場を守ろうとしている",
        overprotection: "証拠集めに時間をかけすぎて、チャンスを逃すことがある",
      },
    },
    {
      axis: "perfectionist_vs_pragmatic",
      positiveMatch: {
        name: "前進の推進力",
        manifestation: (i) => `「完璧じゃなくてもまず出す」という姿勢が${i}出ている。でもその裏には「成果の量で証明したい」という欲求がある`,
        positiveIntent: "たくさんの成果を積み上げることで、自分の存在価値を担保しようとしている",
        overprotection: "一つ一つの質に不安を感じながらも止められず、疲弊することがある",
      },
      negativeMatch: {
        name: "完璧の門番",
        manifestation: (i) => `「完璧でなければ出せない」という感覚が${i}強い。あなたにとって不完全な成果は、自分の不完全さの証拠に感じる`,
        positiveIntent: "質の高い成果だけを外に出すことで、自分の価値を確実に証明しようとしている",
        overprotection: "出すタイミングを永遠に先延ばしにし、結局何も証明できないまま自分を責める",
      },
    },
    {
      axis: "independence_vs_harmony",
      positiveMatch: {
        name: "調和の仮面",
        manifestation: (i) => `他者との調和を${i}重視する一方で、内心では「自分の実力が認められているのか」を常に気にしている`,
        positiveIntent: "調和を保つことで、評価される土台を安定させようとしている",
        overprotection: "和を優先するあまり、自分の本当の実力を見せる機会を自ら手放してしまう",
      },
      negativeMatch: {
        name: "孤高の証明者",
        manifestation: (i) => `独力で成果を出すことに${i}こだわる。誰の助けも借りずに証明することが「本物の実力」だと感じている`,
        positiveIntent: "自分一人の力で成し遂げることで、疑いの余地がない証明をしようとしている",
        overprotection: "助けを求められず、限界を超えて一人で抱え込む",
      },
    },
    {
      axis: "cautious_vs_bold",
      positiveMatch: {
        name: "果敢な挑戦者",
        manifestation: (i) => `大胆に挑戦することが${i}あなたの証明の手段になっている。リスクを取ること自体が「自分は特別だ」の証拠`,
        positiveIntent: "大きな挑戦に飛び込むことで、自分の勇気と能力を同時に証明しようとしている",
        overprotection: "リスクを取りすぎて、失敗した時のダメージが深くなる",
      },
      negativeMatch: {
        name: "慎重な準備者",
        manifestation: (i) => `慎重さが${i}あなたの証明方法を規定している。「失敗しない」ことが「有能である」ことの証拠`,
        positiveIntent: "確実に成功できる道を選ぶことで、自分の能力を安全に証明しようとしている",
        overprotection: "安全な範囲でしか動けず、本当に証明したいことに到達できない",
      },
    },
  ],
  N: [
    {
      axis: "direct_vs_diplomatic",
      positiveMatch: {
        name: "配慮の翻訳者",
        manifestation: (i) => `繋がりを守るために${i}「相手を傷つけない言い方」を自動的に選んでいる。本音を飲み込むのはもう癖になっている`,
        positiveIntent: "言葉を選ぶことで関係の摩擦を最小化し、繋がりを安全に保とうとしている",
        overprotection: "本音を言わないことで、相手との本当の繋がりがかえって浅くなっている",
      },
      negativeMatch: {
        name: "正直の剣",
        manifestation: (i) => `率直に思いを伝えることが${i}あなたの繋がり方。でも「本当のことを言う＝本当の関係」という信念が、時に相手を遠ざける`,
        positiveIntent: "嘘のない関係だけが本物だという信念で、繋がりの質を守ろうとしている",
        overprotection: "相手の準備ができていない真実を突きつけて、繋がりを壊してしまうことがある",
      },
    },
    {
      axis: "intimacy_pace",
      positiveMatch: {
        name: "距離の加速装置",
        manifestation: (i) => `人との距離を${i}早く縮めたいと感じている。「繋がっていない時間」が不安を生む`,
        positiveIntent: "早く深い関係を築くことで、孤立する時間を最小化しようとしている",
        overprotection: "相手のペースを超えて距離を詰めすぎて、かえって引かれてしまうことがある",
      },
      negativeMatch: {
        name: "距離の調律師",
        manifestation: (i) => `繋がりたいのに${i}慎重に距離を取る。「急いで近づくと壊れる」という経験が、あなたのペースを決めている`,
        positiveIntent: "ゆっくり距離を縮めることで、壊れにくい確実な繋がりを構築しようとしている",
        overprotection: "慎重すぎて「この人は自分に興味がない」と相手に誤解されることがある",
      },
    },
    {
      axis: "reassurance_need",
      positiveMatch: {
        name: "確認の錨",
        manifestation: (i) => `「大丈夫？ 嫌われてない？」という確認欲求が${i}強く出ている。沈黙が不安の種になる`,
        positiveIntent: "関係の状態を常にモニターすることで、繋がりの危機を早期に察知しようとしている",
        overprotection: "確認が頻繁すぎて、相手に重さを感じさせてしまうことがある",
      },
      negativeMatch: {
        name: "自立の壁",
        manifestation: (i) => `確認を求めないあなたは${i}「自分から繋がりの状態を聞かない」。でもそれは不安がないからではなく、聞くのが怖いから`,
        positiveIntent: "自分の不安を見せないことで、相手の負担にならないようにしている",
        overprotection: "本当は不安なのに聞けず、一人で抱え込んで関係が冷えていく",
      },
    },
    {
      axis: "introvert_vs_extrovert",
      positiveMatch: {
        name: "賑わいの灯台",
        manifestation: (i) => `外向性が${i}あなたの繋がりの手段になっている。人がいる場所にいること自体が安心`,
        positiveIntent: "多くの人と接点を持つことで、繋がりのネットワークを広く保とうとしている",
        overprotection: "広く浅い繋がりばかりで、本当に深い関係を築く時間が取れない",
      },
      negativeMatch: {
        name: "少数精鋭の番人",
        manifestation: (i) => `内向性が${i}あなたの繋がり方を限定している。少人数との深い関係だけが「本物」だと感じている`,
        positiveIntent: "限られた人との深い繋がりに集中することで、関係の質を守ろうとしている",
        overprotection: "新しい出会いを避けすぎて、世界が狭くなっていく",
      },
    },
  ],
  S: [
    {
      axis: "change_embrace_vs_resist",
      positiveMatch: {
        name: "安定の番人",
        manifestation: (i) => `変化への抵抗が${i}強く出ている。「今のまま」を維持することが、あなたにとっての安全保障`,
        positiveIntent: "予測可能な環境を維持することで、不確実性という最大の脅威から身を守っている",
        overprotection: "変化を拒みすぎて、より良い状態への移行も遮断してしまう",
      },
      negativeMatch: {
        name: "変化の先取り",
        manifestation: (i) => `変化を${i}歓迎するのは、「先に自分から変わることで不意打ちを防ぐ」という安全戦略`,
        positiveIntent: "自分から変化を起こすことで、コントロール不能な変化に巻き込まれるリスクを減らしている",
        overprotection: "常に先回りしすぎて、安定を味わう時間がなくなっている",
      },
    },
    {
      axis: "plan_vs_spontaneous",
      positiveMatch: {
        name: "自由の防御壁",
        manifestation: (i) => `即興的なスタイルが${i}出ているが、実はそれは「計画に縛られない＝誰にもコントロールされない」という安全確保の手段`,
        positiveIntent: "柔軟に動ける状態を保つことで、あらゆる脅威に対応できる余地を確保している",
        overprotection: "計画を拒むことで、長期的な安全の基盤が築けない",
      },
      negativeMatch: {
        name: "予測の要塞",
        manifestation: (i) => `計画性が${i}あなたの安心の土台になっている。予定通りに進むことが「安全」の証拠`,
        positiveIntent: "未来を予測可能にすることで、不意の脅威を事前に排除しようとしている",
        overprotection: "計画外の出来事にパニックし、本当は豊かな偶然も排除してしまう",
      },
    },
    {
      axis: "cautious_vs_bold",
      positiveMatch: {
        name: "大胆な防衛線",
        manifestation: (i) => `一見大胆に見えるが、その大胆さは${i}「先に脅威を潰す」という安全確保の攻撃的な形`,
        positiveIntent: "受け身で脅威を待つのではなく、先制的に安全を確保しようとしている",
        overprotection: "攻撃的な安全確保が周囲との摩擦を生み、新たな脅威を作り出してしまう",
      },
      negativeMatch: {
        name: "慎重の壁",
        manifestation: (i) => `慎重さが${i}あなたの安全戦略の中核。「まだ十分に安全とは言えない」が口癖に近い`,
        positiveIntent: "リスクを徹底的に検証することで、一度も侵入を許さない防衛線を構築しようとしている",
        overprotection: "慎重すぎて行動が遅れ、安全を確保するためのチャンスすら逃してしまう",
      },
    },
    {
      axis: "stress_isolation_vs_social",
      positiveMatch: {
        name: "共助の盾",
        manifestation: (i) => `ストレス時に人と回復することを${i}選ぶが、それは「一人になると安全を感じられない」から`,
        positiveIntent: "信頼できる人のそばにいることで、脅威に対する監視の目を増やしている",
        overprotection: "一人の時間が取れず、自分自身で安全を感じる力が育たない",
      },
      negativeMatch: {
        name: "孤独の砦",
        manifestation: (i) => `ストレス時に一人で整理することを${i}選ぶ。安全な空間に引きこもることが最も確実な回復方法`,
        positiveIntent: "外部の刺激を遮断することで、自分だけがコントロールできる安全空間を確保している",
        overprotection: "一人で閉じこもりすぎて、助けが必要な時にも誰にも頼れなくなる",
      },
    },
  ],
};

/**
 * Layer1コードと軸スコアから個別化された見守り型を生成する
 */
export function generatePersonalizedGuardians(
  layer1: Layer1Code,
  axisScores: Partial<Record<TraitAxisKey, number>>,
): PersonalizedGuardian[] {
  const patterns = GUARDIAN_PATTERNS[layer1];
  const guardians: PersonalizedGuardian[] = [];
  const threshold = 0.2;

  for (const pattern of patterns) {
    const score = axisScores[pattern.axis];
    if (score === undefined) continue;

    const abs = Math.abs(score);
    if (abs < threshold) continue;

    const intensity =
      abs > 0.7 ? "非常に" : abs > 0.4 ? "かなり" : "やや";

    const match = score > 0 ? pattern.positiveMatch : pattern.negativeMatch;
    guardians.push({
      name: match.name,
      manifestation: match.manifestation(intensity),
      positiveIntent: match.positiveIntent,
      overprotection: match.overprotection,
    });
  }

  // 最大3つまで返す（最もスコアが極端な軸を優先）
  return guardians.slice(0, 3);
}

/**
 * 見守り型への感謝メッセージを生成する（IFS原則）
 */
function generateGratitude(
  layer1: Layer1Code,
  personalizedGuardians: PersonalizedGuardian[],
): string {
  const base = LAYER1_DEEP_DESCRIPTIONS[layer1].gratitudeBase;

  if (personalizedGuardians.length === 0) return base;

  // 具体的な見守り型名を使った感謝
  const guardianNames = personalizedGuardians
    .map((g) => `「${g.name}」`)
    .join("、");

  return `${base}特にあなたの中の${guardianNames}は、あなたが気づかないところで、ずっと働き続けてきた見守り型たち。彼らがいたからこそ、あなたは今日まで自分を保てた。感謝した上で、少しだけ休ませてあげることが、次の成長の入口になる。`;
}

/**
 * アーキタイプから「守っているもの」の深層洞察を生成
 */
export function generateProtectionInsight(
  archetypeDef: ArchetypeDef,
  axisScores?: Partial<Record<TraitAxisKey, number>>,
): ProtectionInsight {
  const layer1 = archetypeDef.cognition;
  const deep = LAYER1_DEEP_DESCRIPTIONS[layer1];
  const scores = axisScores ?? {};

  // Personalized guardians
  const personalizedGuardians = generatePersonalizedGuardians(layer1, scores);

  // Gratitude
  const gratitude = generateGratitude(layer1, personalizedGuardians);

  // Shadow analysis
  const shadowDef = getArchetypeByCode(archetypeDef.shadowCode);
  const selfLayers = parseArchetypeCode(archetypeDef.code);
  const shadowLayers = parseArchetypeCode(archetypeDef.shadowCode);

  // The shadow's "gift" - what it has that the user needs (enhanced)
  let shadowGift: string;
  let integrationHint: string;

  if (shadowLayers.layer3 !== selfLayers.layer3) {
    const selfL3 = LAYER3_DEFS[selfLayers.layer3];
    const shadowL3 = LAYER3_DEFS[shadowLayers.layer3];

    // 具体的なシナリオベースの影のギフト
    const giftScenarios: Record<string, { gift: string; hint: string }> = {
      "A_W": {
        gift: "あなたが「突き進む」ことで安心を得ているなら、もうひとりの自分が持つ「じっと見る」力は、立ち止まることで初めて見えてくる景色を教えてくれる。あなたの行動力は素晴らしいが、止まった時にだけ聞こえる声がある。",
        hint: "週に一度、「今日は何もしない」と決める日を作ってみる。何も成し遂げなくても、あなたはあなたのまま。",
      },
      "A_D": {
        gift: "あなたが前に出ることで世界と戦っているなら、もうひとりの自分が持つ「内にこもる」力は、自分自身との対話を可能にしてくれる。外に向かうエネルギーを内側に向けた時、あなたはまだ出会ったことのない自分に出会う。",
        hint: "一日の終わりに5分だけ、何も考えずに座ってみる。行動しない自分も、あなたの一部。",
      },
      "W_A": {
        gift: "あなたが「じっと見る」ことで安全を確保しているなら、もうひとりの自分が持つ「突き進む」力は、不完全な情報のまま動く自由を教えてくれる。全てがわかってからでは遅い瞬間がある。",
        hint: "小さなことで「考える前に動く」を一日一回試してみる。失敗しても大丈夫な小さな冒険から始める。",
      },
      "W_D": {
        gift: "あなたが観察者でいることで安心を得ているなら、もうひとりの自分が持つ「内にこもる」力は、外を見るのではなく自分の内側を見つめる時間の豊かさを教えてくれる。",
        hint: "観察の対象を外ではなく内側に向ける日を作る。「私は何を感じているか」に意識を向ける。",
      },
      "D_A": {
        gift: "あなたが内側に潜ることで安全を確保しているなら、もうひとりの自分が持つ「突き進む」力は、内面の豊かさを外に表現する勇気を教えてくれる。あなたの内側にあるものは、外に出す価値がある。",
        hint: "内側で感じたことを一つだけ、信頼できる人に話してみる。全てを見せなくていい、一つだけ。",
      },
      "D_W": {
        gift: "あなたが内にこもることで世界と距離を取っているなら、もうひとりの自分が持つ「じっと見る」力は、完全に引きこもるのではなく外を観察する立ち位置を教えてくれる。窓は閉めなくていい。",
        hint: "引きこもりたくなった時、部屋にいながらも外の世界を観察してみる。距離を取りつつも繋がっている状態を体験する。",
      },
    };

    const key = `${selfLayers.layer3}_${shadowLayers.layer3}`;
    const scenario = giftScenarios[key];
    if (scenario) {
      shadowGift = scenario.gift;
      integrationHint = scenario.hint;
    } else {
      shadowGift = `あなたが避けている「${shadowL3.label}」という反応の中に、あなたが実は必要としている力がある。あなたの「${selfL3.label}」パターンは強力だが、「${shadowL3.label}」を取り入れることで、より柔軟に状況に対応できるようになる。`;
      integrationHint = `ストレスを感じた時、普段と違う反応を一度だけ試してみる。「${shadowL3.label}」をほんの少しだけ許可してみる。`;
    }
  } else if (shadowLayers.layer2 !== selfLayers.layer2) {
    const selfL2 = LAYER2_DEFS[selfLayers.layer2];
    const shadowL2 = LAYER2_DEFS[shadowLayers.layer2];

    const convictionGifts: Record<string, { gift: string; hint: string }> = {
      "E_I": {
        gift: `あなたは「${selfL2.label}」で世界を理解しているが、もうひとりの自分は「${shadowL2.label}」を通じて世界を掴んでいる。データでは捉えきれない「なんとなくそう感じる」を信じてみると、新しい扉が開く。`,
        hint: "次の大事な判断で、データを見る前に「直感ではどう感じるか」を先にメモしてみる。",
      },
      "E_S": {
        gift: `あなたは「${selfL2.label}」で世界を理解しているが、もうひとりの自分は「${shadowL2.label}」を通じて世界を掴んでいる。頭ではなく身体が「腑に落ちる」感覚を信じてみると、データでは見えない真実が見えてくる。`,
        hint: "判断に迷った時、一度立ち上がって身体を動かし、「身体はどう感じているか」に注意を向けてみる。",
      },
      "I_E": {
        gift: `あなたは「${selfL2.label}」で世界を掴んでいるが、もうひとりの自分は「${shadowL2.label}」を持っている。直感を裏付けるデータを集めてみると、あなたのひらめきがより確かなものになる。`,
        hint: "直感で「これだ」と感じた後、それを裏付ける事実を一つだけ探してみる。直感と証拠が重なった時の確信の深さを体験する。",
      },
      "I_S": {
        gift: `あなたは「${selfL2.label}」で世界を掴んでいるが、もうひとりの自分は「${shadowL2.label}」を持っている。パターンや意味を超えて、純粋に「身体がどう感じるか」に耳を傾けてみると、思考では到達できない答えがある。`,
        hint: "考えがまとまらない時、身体の感覚に意識を向ける。胸の辺り、お腹の辺り、何か感じるものはないか。",
      },
      "S_E": {
        gift: `あなたは「${selfL2.label}」で世界を感じているが、もうひとりの自分は「${shadowL2.label}」を持っている。感覚を言語化し、データとして捉え直してみると、あなたの感覚の精度がさらに上がる。`,
        hint: "「なんとなく良い/悪い」と感じた時、それを数値（10点中何点？）で表してみる。感覚が客観化される体験を試す。",
      },
      "S_I": {
        gift: `あなたは「${selfL2.label}」で世界を感じているが、もうひとりの自分は「${shadowL2.label}」を持っている。身体感覚の背後にあるパターンや意味を読み解いてみると、感覚がより深い洞察に変わる。`,
        hint: "身体が反応した時、「この感覚は何を教えてくれているのか」と問いかけてみる。感覚の奥にあるメッセージを探る。",
      },
    };

    const key = `${selfLayers.layer2}_${shadowLayers.layer2}`;
    const scenario = convictionGifts[key];
    if (scenario) {
      shadowGift = scenario.gift;
      integrationHint = scenario.hint;
    } else {
      shadowGift = `「${shadowL2.label}」というあなたが使わない確信の方法に、新しい視点がある。`;
      integrationHint = `普段と違う方法で「納得」を探してみる。それが新しい世界の見方を教えてくれる。`;
    }
  } else {
    // Same layer2 and layer3 — Layer1 difference (rare, same archetype family)
    shadowGift = `もうひとりの自分は、あなたが「自分らしくない」と排除した特性の集合。しかしユングが言うように、その中にこそ未発達の可能性が眠っている。あなたが最も「自分とは違う」と感じる人の中に、次の成長の種がある。`;
    integrationHint = `「絶対に自分はこうはならない」と思う人の特性を一つ挙げ、その特性の良い面を考えてみる。`;
  }

  return {
    protectionName: LAYER1_DEFS[layer1].label,
    protectionDescription: deep.protectionDescription,
    guardians: deep.guardians,
    personalizedGuardians,
    gratitude,
    safeState: archetypeDef.safeState,
    stressState: archetypeDef.stressState,
    growthKey: archetypeDef.growthKey,
    shadow: {
      name: shadowDef?.name ?? "不明",
      emoji: shadowDef?.emoji ?? "",
      tension: archetypeDef.shadowTension,
      gift: shadowGift,
      integrationHint,
    },
    quote: archetypeDef.quote,
  };
}

// ── Gap Analysis (Level 2) ──

/** Layer1ギャップの仮説 */
function hypothesizeLayer1Gap(
  selfCode: Layer1Code,
  dataCode: Layer1Code,
): string {
  const key = `${selfCode}_${dataCode}`;
  const hypotheses: Record<string, string> = {
    P_B: "自分では「証明が必要」と思っているが、実際の行動は「繋がり」を求めている。もしかすると、証明は繋がりを得るための手段なのかもしれない。",
    P_H: "自分では「証明したい」と思っているが、データは「安全の確保」を示している。証明することで安心を得ようとしている可能性がある。",
    B_P: "自分では「繋がりが大事」と思っているが、実際は「認められたい」欲求が根底にある。繋がりの中で承認を得ようとしているのかもしれない。",
    B_H: "自分では「人との繋がり」を重視しているが、データは「安全な場所の確保」を示している。繋がりは安全の手段かもしれない。",
    H_P: "自分では「安全を確保したい」と思っているが、実際は「自分を証明したい」欲求がある。安全圏から出て挑戦する自分に気づいていないのかもしれない。",
    H_B: "自分では「安全が大事」と思っているが、データは「繋がり」を求めていると示している。安全な場所とは、信頼できる人がいる場所なのかもしれない。",
  };
  return hypotheses[key] ?? "自己認識と行動データにズレがある。このズレ自体が自己理解を深める手がかり。";
}

/** 感情軸ギャップの仮説 */
function hypothesizeLayer2Gap(selfCode: string, dataCode: string): string {
  return `自分の感情のあり方は「${LAYER2_DEFS[selfCode as keyof typeof LAYER2_DEFS]?.label ?? selfCode}」だと思っているが、実際の行動パターンは「${LAYER2_DEFS[dataCode as keyof typeof LAYER2_DEFS]?.label ?? dataCode}」寄り。自分が思う感情の扱い方と、実際の動き方にギャップがある。`;
}

/** 社交軸ギャップの仮説 */
function hypothesizeLayer3Gap(selfCode: string, dataCode: string): string {
  return `人との関わり方は「${LAYER3_DEFS[selfCode as keyof typeof LAYER3_DEFS]?.label ?? selfCode}」だと思っているが、データは「${LAYER3_DEFS[dataCode as keyof typeof LAYER3_DEFS]?.label ?? dataCode}」を示している。自覚している対人スタイルと実際の振る舞いにズレがある。`;
}

/**
 * DualArchetypeResult から深いギャップ分析を生成
 */
export function analyzeGap(
  dualResult: DualArchetypeResult,
): GapAnalysis {
  const subLayers = parseArchetypeCode(dualResult.subjective.code);
  const objLayers = parseArchetypeCode(dualResult.objective.code);

  const subDef = getArchetypeByCode(dualResult.subjective.code);
  const objDef = getArchetypeByCode(dualResult.objective.code);

  const layers = [
    {
      layerName: "大切なもの",
      selfLabel: LAYER1_DEFS[subLayers.layer1].label,
      dataLabel: LAYER1_DEFS[objLayers.layer1].label,
      matches: subLayers.layer1 === objLayers.layer1,
      hypothesis:
        subLayers.layer1 !== objLayers.layer1
          ? hypothesizeLayer1Gap(subLayers.layer1, objLayers.layer1)
          : null,
    },
    {
      layerName: "納得のしかた",
      selfLabel: LAYER2_DEFS[subLayers.layer2].label,
      dataLabel: LAYER2_DEFS[objLayers.layer2].label,
      matches: subLayers.layer2 === objLayers.layer2,
      hypothesis:
        subLayers.layer2 !== objLayers.layer2
          ? hypothesizeLayer2Gap(subLayers.layer2, objLayers.layer2)
          : null,
    },
    {
      layerName: "プレッシャー下の行動",
      selfLabel: LAYER3_DEFS[subLayers.layer3].label,
      dataLabel: LAYER3_DEFS[objLayers.layer3].label,
      matches: subLayers.layer3 === objLayers.layer3,
      hypothesis:
        subLayers.layer3 !== objLayers.layer3
          ? hypothesizeLayer3Gap(subLayers.layer3, objLayers.layer3)
          : null,
    },
  ];

  const matchCount = layers.filter((l) => l.matches).length;

  let gapType: GapAnalysis["gapType"];
  if (matchCount === 3) gapType = "same";
  else if (matchCount === 2) {
    const diff = layers.find((l) => !l.matches);
    gapType = diff?.layerName === "大切なもの"
      ? "layer1"
      : diff?.layerName === "納得のしかた"
        ? "layer2"
        : "layer3";
  } else gapType = "multi";

  let overallInsight: string;
  if (matchCount === 3) {
    overallInsight =
      "自己認識とデータが一致している。自分のことをよく理解できている状態。ただし「正確に自分を知っている」ことと「変化し続けている」ことは両立する。今の認識が永遠に正しいとは限らない。";
  } else if (matchCount === 2) {
    const diffLayer = layers.find((l) => !l.matches);
    overallInsight = `3つの層のうち1つにズレがある。特に「${diffLayer?.layerName ?? ""}」の認識にギャップがある。これは盲点であると同時に、自己理解を深める最大のチャンス。`;
  } else if (matchCount === 1) {
    overallInsight =
      "自己認識とデータの間にかなりのギャップがある。これは「自分を知らない」のではなく、「自分が思っている自分」と「無意識に動いている自分」が別々に動いているということ。統合するプロセスが成長の鍵。";
  } else {
    overallInsight =
      "自己認識とデータが大きく異なる。社会的な期待に応えようとする自分と、本来の自分の間に大きな距離がある可能性がある。まず「本当はどちらが自分か」ではなく「両方とも自分だ」と受け入れることから始める。";
  }

  return {
    gapType,
    layers,
    overallInsight,
    selfView: subDef?.dualView?.selfView ?? null,
    observedView: objDef?.dualView?.observedView ?? null,
  };
}
