// lib/stargazer/decisionOracle.ts
// Decision Oracle -- 現実の決断に対する予測と洞察エンジン
//
// 核心思想:
// 「あなたは何を選ぶか」を予測するだけではない。
// 「なぜそれを選ぶのか」「本当はどうしたいのか」「影ならどうするか」
// ——3つの視点から決断を照らし出す鏡。
//
// 予測の精度が上がるほど、ユーザーは自分の判断パターンを自覚する。
// 予測が外れた瞬間こそ、ユーザーの「変容」が起きた証拠となる。
//
// 構造:
// predictedChoice -> あなたのパターンが導く選択
// shadowChoice    -> 影（無意識）が望む選択
// idealChoice     -> 成長方向が示す選択

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";
import type { ArchetypeCode } from "./archetypeTypes";
import { LAYER1_DEFS, LAYER2_DEFS, LAYER3_DEFS, ARCHETYPE_DEFS, parseArchetypeCode } from "./archetypeTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ユーザーの決断クエリ */
export interface DecisionQuery {
  /** ユーザー ID */
  userId: string;
  /** 決断の内容 */
  decision: string;
  /** 選択肢A（明示的に提示された場合） */
  optionA?: string;
  /** 選択肢B（明示的に提示された場合） */
  optionB?: string;
}

/** Oracle の応答 */
export interface OracleResponse {
  /** あなたがおそらく選ぶもの */
  predictedChoice: string;
  /** なぜそれを選ぶか（パターンに基づく理由） */
  predictedReason: string;
  /** 影（無意識）が選ぶもの */
  shadowChoice: string;
  /** 理想の自己が選ぶもの */
  idealChoice: string;
  /** 予測の確信度 (0-1) */
  confidenceLevel: number;
  /** パターン参照 */
  patternReference: string;
  /** 後日確認用の質問 */
  verificationQuestion: string;
  /** この決断がなぜ難しいのかの洞察 */
  insight: string;
  /** 3つの選択を繋ぐ統合的な物語 */
  narrative: string;
}

/** Oracle 入力データ */
export interface OracleInput {
  /** 決断の内容 */
  decision: string;
  /** 選択肢A */
  optionA?: string;
  /** 選択肢B */
  optionB?: string;
  /** メインアーキタイプコード */
  archetypeCode: ArchetypeCode;
  /** シャドウアーキタイプコード */
  shadowCode: ArchetypeCode;
  /** 軸スコア */
  axisScores: Partial<Record<TraitAxisKey, number>>;
  /** 三面鏡ギャップ（あれば） */
  mirrorGaps?: Partial<Record<TraitAxisKey, number>>;
  /** 現在の心理的天気 */
  currentWeather?: string;
  /** 観測深度 (0-100) */
  observationDepth: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal: Archetype Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** アーキタイプコードから Layer 定義を取得 */
function parseLayers(code: ArchetypeCode) {
  const parsed = parseArchetypeCode(code);
  return {
    layer1: LAYER1_DEFS[parsed.cognition],
    layer2: LAYER2_DEFS[parsed.emotion],
    layer3: LAYER3_DEFS[parsed.social],
  };
}

/** スコアを安全に取得（なければ0） */
function score(
  axisScores: Partial<Record<TraitAxisKey, number>>,
  key: TraitAxisKey
): number {
  return axisScores[key] ?? 0;
}

/** アーキタイプ定義を取得 */
function getArchetypeDef(code: ArchetypeCode) {
  return ARCHETYPE_DEFS.find((a) => a.code === code);
}

/** 軸ラベル */
function axisLabel(key: TraitAxisKey): string {
  const def = TRAIT_AXES.find((a) => a.id === key);
  return def ? `${def.labelLeft}/${def.labelRight}` : key;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal: Decision Tendency Analysis
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 決断傾向の多次元プロファイル。
 * 単一ラベルではなく、複数の軸の相互作用として決断パターンを表現する。
 */
interface DecisionProfile {
  /** 主要傾向 */
  primary: DecisionTendency;
  /** 副次傾向（矛盾する場合がある） */
  secondary: DecisionTendency | null;
  /** Layer1 による決断の核心動機 */
  coreMotivation: string;
  /** Layer2 による確信の取り方 */
  confirmationStyle: string;
  /** Layer3 によるストレス下の決断変化 */
  stressShift: string;
  /** 決断時の盲点 */
  blindSpot: string;
  /** 最もスコア差が大きい軸（決断に最も影響） */
  dominantAxis: TraitAxisKey | null;
  /** 主要傾向の強度 (0-1) */
  strength: number;
}

/** 決断傾向パターン */
interface DecisionTendency {
  style:
    | "bold"
    | "cautious"
    | "overthinking"
    | "pleasing"
    | "intuitive"
    | "analytical"
    | "impulsive"
    | "avoidant";
  label: string;
  description: string;
  predictedBehavior: string;
  shadowDesire: string;
}

/** 8つの決断傾向定義 */
const TENDENCY_DEFS: Record<DecisionTendency["style"], Omit<DecisionTendency, "style">> = {
  bold: {
    label: "攻めの決断タイプ",
    description: "リスクがあっても前に進むことを選びがち",
    predictedBehavior: "より挑戦的で、今の状況を変える方を選ぶ",
    shadowDesire: "本当はたまに立ち止まって、安心したい時もある",
  },
  cautious: {
    label: "手堅い決断タイプ",
    description: "確実な方を選んで、リスクを減らしたい傾向がある",
    predictedBehavior: "より安全で、実績のある方を選ぶ",
    shadowDesire: "本当はたまに無謀なくらい大胆に飛び込みたい",
  },
  overthinking: {
    label: "考えすぎちゃうタイプ",
    description: "全部の可能性を考えすぎて、決断が遅くなりがち",
    predictedBehavior: "決断を先延ばしにして、もっと情報を集めようとする",
    shadowDesire: "本当は考えずに直感で飛び込む気持ちよさが欲しい",
  },
  pleasing: {
    label: "みんなを大事にするタイプ",
    description: "周りの気持ちを優先して、自分の本音を後回しにしがち",
    predictedBehavior: "周りが望む方、波風が立たない方を選ぶ",
    shadowDesire: "本当は誰の期待も気にせず、自分だけの選択をしたい",
  },
  intuitive: {
    label: "直感で決めるタイプ",
    description: "理屈より「なんかこっち」って感覚で決める傾向がある",
    predictedBehavior: "理由はうまく言えないけど「こっち」と感じた方を選ぶ",
    shadowDesire: "本当は自分の直感が正しいって確証が欲しい",
  },
  analytical: {
    label: "論理で決めるタイプ",
    description: "データと論理を積み上げて最適解を出そうとする傾向がある",
    predictedBehavior: "メリット・デメリットを整理してから、論理的に最適な方を選ぶ",
    shadowDesire: "本当は論理を捨てて、心が叫ぶ方に飛び込みたい",
  },
  impulsive: {
    label: "即決タイプ",
    description: "考えるより先に体が動く。行動が思考に先行する傾向がある",
    predictedBehavior: "最初にピンと来た方を、ほぼ反射的に選ぶ",
    shadowDesire: "本当は一回立ち止まって、なぜそれを選ぶのか知りたい",
  },
  avoidant: {
    label: "保留タイプ",
    description: "決断そのものを避けて、現状維持を選びがち",
    predictedBehavior: "「今は決めない」「もう少し様子を見る」を選ぶ",
    shadowDesire: "本当は覚悟を決めて、何かを選び取る自分になりたい",
  },
};

/**
 * 軸スコアから多次元の決断プロファイルを構築する。
 *
 * 単一のラベルではなく、複数の軸の相互作用を分析し、
 * 主要傾向・副次傾向・盲点を含む立体的な決断プロファイルを返す。
 */
function buildDecisionProfile(
  axisScores: Partial<Record<TraitAxisKey, number>>,
  archetypeCode: ArchetypeCode
): DecisionProfile {
  const layers = parseLayers(archetypeCode);

  // --- 各決断関連軸のスコア ---
  const boldness = score(axisScores, "cautious_vs_bold");
  const changeEmbrace = score(axisScores, "change_embrace_vs_resist");
  const perfectionism = score(axisScores, "perfectionist_vs_pragmatic");
  const harmony = score(axisScores, "independence_vs_harmony");
  const diplomacy = score(axisScores, "direct_vs_diplomatic");
  const intuition = score(axisScores, "analytical_vs_intuitive");
  const planning = score(axisScores, "plan_vs_spontaneous");
  const stressIsolation = score(axisScores, "stress_isolation_vs_social");

  // --- 各傾向のスコアを算出 ---
  const tendencyScores: Record<DecisionTendency["style"], number> = {
    bold: (boldness + 1) / 2 * 0.5 + (1 - (changeEmbrace + 1) / 2) * 0.3 + (1 - (perfectionism + 1) / 2) * 0.2,
    cautious: (1 - (boldness + 1) / 2) * 0.4 + ((changeEmbrace + 1) / 2) * 0.3 + ((perfectionism + 1) / 2) * 0.3,
    overthinking: (1 - (boldness + 1) / 2) * 0.3 + ((1 - (perfectionism + 1) / 2)) * 0.4 + ((1 - (planning + 1) / 2)) * 0.3,
    pleasing: ((harmony + 1) / 2) * 0.4 + ((diplomacy + 1) / 2) * 0.3 + (1 - (boldness + 1) / 2) * 0.3,
    intuitive: ((intuition + 1) / 2) * 0.5 + ((planning + 1) / 2) * 0.3 + ((boldness + 1) / 2) * 0.2,
    analytical: ((1 - (intuition + 1) / 2)) * 0.4 + ((1 - (planning + 1) / 2)) * 0.3 + ((1 - (perfectionism + 1) / 2)) * 0.3,
    impulsive: ((boldness + 1) / 2) * 0.3 + ((planning + 1) / 2) * 0.4 + ((intuition + 1) / 2) * 0.3,
    avoidant: (1 - (boldness + 1) / 2) * 0.3 + ((changeEmbrace + 1) / 2) * 0.3 + ((stressIsolation + 1) / 2) * 0.2 + (1 - Math.abs(harmony)) * 0.2,
  };

  // ソートして上位2つを取得
  const sorted = Object.entries(tendencyScores)
    .sort(([, a], [, b]) => b - a) as Array<[DecisionTendency["style"], number]>;

  const primaryStyle = sorted[0][0];
  const primaryStrength = sorted[0][1];
  const secondaryStyle = sorted[1][0];
  const secondaryStrength = sorted[1][1];

  const primary: DecisionTendency = {
    style: primaryStyle,
    ...TENDENCY_DEFS[primaryStyle],
  };

  // 副次傾向は主要との差が小さい場合のみ（内的葛藤がある）
  const secondary: DecisionTendency | null =
    primaryStrength - secondaryStrength < 0.15
      ? { style: secondaryStyle, ...TENDENCY_DEFS[secondaryStyle] }
      : null;

  // 最も極端な軸を特定
  let dominantAxis: TraitAxisKey | null = null;
  let maxAbsScore = 0;
  const decisionRelevantAxes: TraitAxisKey[] = [
    "cautious_vs_bold",
    "analytical_vs_intuitive",
    "plan_vs_spontaneous",
    "independence_vs_harmony",
    "perfectionist_vs_pragmatic",
    "change_embrace_vs_resist",
    "direct_vs_diplomatic",
  ];
  for (const axis of decisionRelevantAxes) {
    const s = Math.abs(score(axisScores, axis));
    if (s > maxAbsScore) {
      maxAbsScore = s;
      dominantAxis = axis;
    }
  }

  // Layer 固有の決断特性
  const coreMotivations: Record<string, string> = {
    P: "「これで自分の価値を示せるか」が無意識の判断基準になってる",
    B: "「これで大事な人との関係を守れるか」が無意識の判断基準になってる",
    H: "「これで安全が脅かされないか」が無意識の判断基準になってる",
  };

  const confirmationStyles: Record<string, string> = {
    E: "決断が正しいかどうかを、データや実績で確かめようとする",
    I: "決断が正しいかどうかを、「なんか筋が通る」って感覚で確かめようとする",
    S: "決断が正しいかどうかを、胸がざわつくか・しっくりくるか、体の感覚で確かめようとする",
  };

  const stressShifts: Record<string, string> = {
    A: "追い詰められると「とにかく選ぶ！」モードに切り替わる",
    W: "追い詰められると固まって「選べない」状態になる",
    D: "追い詰められると「一人にして」って引きこもりモードになる",
  };

  // 盲点: 主要傾向 x Layer1 の組み合わせ
  const blindSpotTemplates: Record<string, Record<string, string>> = {
    P: {
      bold: "挑戦的な選択が「自分を証明する」ためだけのものになっていないか見えない",
      cautious: "安全な選択が「失敗して価値を失うこと」への恐怖から来ていると気づかない",
      overthinking: "情報を集めること自体が「完璧な自分」を演じる手段になっている",
      pleasing: "他者の期待に応えることで「存在価値」を確認しようとしている構造が見えない",
      intuitive: "直感の奥にある「証明したい」という欲求に気づいていない",
      analytical: "分析が「間違えたら価値がない」という恐怖の産物だと気づかない",
      impulsive: "即断即決が「自分はできる人間だ」という証明行為になっている",
      avoidant: "選ばないことで「失敗しなかった自分」を守っている",
    },
    B: {
      bold: "大胆な選択が「一緒に来てくれる人がいるか」で無意識にフィルターされている",
      cautious: "安全な選択の裏に「関係を壊したくない」が隠れている",
      overthinking: "考え続けるのは「誰も傷つけない完璧な答え」を探しているから",
      pleasing: "他者配慮の中に自分の意志があるのか、もはや分からなくなっている",
      intuitive: "直感の正体が「相手はこうして欲しいはず」という読み取りになっている",
      analytical: "分析が「相手にとってのベスト」を計算する手段になっている",
      impulsive: "衝動的に動くのは「繋がりが切れる前に何かしなきゃ」という焦りから",
      avoidant: "選ばないことで「どちらも失わない」と錯覚している",
    },
    H: {
      bold: "攻撃的に見える選択が実は「先に脅威を潰す」防衛行動",
      cautious: "慎重さの裏に「想定外が起きたら全てが崩壊する」という恐怖がある",
      overthinking: "全てのリスクを潰そうとする完璧主義が決断を不可能にしている",
      pleasing: "波風を立てないのは「関係の安全」を守るための生存戦略",
      intuitive: "直感の正体が「危険を察知するセンサー」になっている",
      analytical: "分析が「安全の保証」を得るための手段になっている",
      impulsive: "衝動的に動くのは「脅威が来る前に動かなきゃ」という過覚醒反応",
      avoidant: "決めないことで「間違った選択のリスク」を回避している",
    },
  };

  const l1 = archetypeCode[0] as "P" | "B" | "H";
  const l2 = archetypeCode[1] as "E" | "I" | "S";
  const l3 = archetypeCode[2] as "A" | "W" | "D";

  return {
    primary,
    secondary,
    coreMotivation: coreMotivations[l1] ?? coreMotivations["P"],
    confirmationStyle: confirmationStyles[l2] ?? confirmationStyles["E"],
    stressShift: stressShifts[l3] ?? stressShifts["A"],
    blindSpot:
      blindSpotTemplates[l1]?.[primaryStyle] ??
      `${primary.label}としてのパターンの中に、${layers.layer1.label}を守るための無意識の判断基準が隠れている`,
    dominantAxis,
    strength: primaryStrength,
  };
}

/**
 * 観測深度に基づく確信度を算出する。
 * 深度が高いほど予測の確信度が上がるが、0.95 を超えることはない。
 */
function calculateConfidence(
  observationDepth: number,
  profileStrength: number
): number {
  const depthFactor = Math.min(observationDepth / 100, 1) * 0.5;
  const strengthFactor = profileStrength * 0.3;
  const base = 0.2;
  return Math.min(base + depthFactor + strengthFactor, 0.95);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 軸スコアとアーキタイプから、選択とその理由を予測する。
 *
 * 予測は決断プロファイル（主要傾向 + Layer1動機 + Layer2確認方法）を
 * 組み合わせた多層的な推論に基づく。
 */
export function predictChoice(
  axisScores: Partial<Record<TraitAxisKey, number>>,
  archetypeCode: ArchetypeCode,
  decision: string,
  optionA?: string,
  optionB?: string
): { choice: string; reason: string; confidence: number; profile: DecisionProfile } {
  const profile = buildDecisionProfile(axisScores, archetypeCode);
  const layers = parseLayers(archetypeCode);

  // 選択肢が明示されている場合: 具体的な予測
  if (optionA && optionB) {
    // Layer1 動機に基づいてどちらが「核の安全」を守るかを推定
    const choiceText =
      `この決断で、君はおそらく` +
      `${profile.primary.predictedBehavior}。\n` +
      `${profile.coreMotivation}。\n` +
      `そして${profile.confirmationStyle}。`;

    const reasonText =
      `「${profile.primary.label}」としてのパターン` +
      `${profile.secondary ? `と、「${profile.secondary.label}」との間の揺れ` : ""}` +
      `に基づく予測。\n` +
      `${profile.blindSpot}`;

    return {
      choice: choiceText,
      reason: reasonText,
      confidence: profile.strength,
      profile,
    };
  }

  // 選択肢が不明な場合: パターンの記述
  const choiceText =
    `この種の決断で、君は「${profile.primary.label}」として振る舞う。\n` +
    `${profile.primary.predictedBehavior}。\n` +
    (profile.secondary
      ? `ただし「${profile.secondary.label}」の傾向も同時に作動するため、決断の直前で揺れる。`
      : `この傾向は比較的はっきりしている。`);

  const reasonText =
    `${profile.coreMotivation}。\n` +
    `${profile.confirmationStyle}。\n` +
    `${profile.dominantAxis ? `特に「${axisLabel(profile.dominantAxis)}」の軸が、この決断パターンを強く形作っている。` : ""}`;

  return {
    choice: choiceText,
    reason: reasonText,
    confidence: profile.strength,
    profile,
  };
}

/**
 * シャドウアーキタイプが選ぶであろう選択を生成する。
 *
 * もうひとりの自分は、ユーザーが抑圧している欲求に基づいて選択する。
 * 単にメインの反対ではなく、もうひとりのアーキタイプ固有の動機・確信方法・行動パターンから
 * 「選ばなかったもう一つの人生」を具体的に描く。
 */
export function generateShadowChoice(
  shadowCode: ArchetypeCode,
  mainCode: ArchetypeCode,
  axisScores: Partial<Record<TraitAxisKey, number>>,
  decision: string,
  mirrorGaps?: Partial<Record<TraitAxisKey, number>>
): string {
  const shadow = parseLayers(shadowCode);
  const main = parseLayers(mainCode);
  const shadowDef = getArchetypeDef(shadowCode);
  const shadowProfile = buildDecisionProfile(axisScores, shadowCode);

  // 三面鏡ギャップから最も抑圧された欲求を特定
  let suppressedDesire = "";
  if (mirrorGaps) {
    const mostSuppressed = Object.entries(mirrorGaps)
      .filter(([, gap]) => gap !== undefined && gap < -0.3)
      .sort(([, a], [, b]) => (a ?? 0) - (b ?? 0))[0];
    if (mostSuppressed) {
      const axis = TRAIT_AXES.find((a) => a.id === mostSuppressed[0]);
      if (axis) {
        const direction = (mostSuppressed[1] ?? 0) < 0 ? axis.labelRight : axis.labelLeft;
        suppressedDesire = `\n特に「${direction}」への渇望——これは君が最も抑え込んでいる欲求だ。`;
      }
    }
  }

  // Layer1 が異なる場合: 核心的な欲求の対立
  if (mainCode[0] !== shadowCode[0]) {
    return (
      `もうひとりの${shadowDef?.name ?? shadowCode}は、全く別の基準でこの決断を見ている。\n\n` +
      `君が「${main.layer1.label}」を守ろうとする一方で、\n` +
      `もうひとりの自分は「${shadow.layer1.label}」を最優先する。\n` +
      `${shadow.layer1.description}——この欲求に従うなら、\n` +
      `君は今と正反対の選択をするだろう。\n\n` +
      `もうひとりの選択は「間違い」ではない。それは、\n` +
      `君が「選ばなかった自分」が選ぶ人生だ。${suppressedDesire}`
    );
  }

  // 同じLayer1, 異なるLayer2/3: 手段と反応の違い
  return (
    `もうひとりの${shadowDef?.name ?? shadowCode}も、${main.layer1.label}を守りたい点は同じ。\n` +
    `でも確認の仕方が違う。\n\n` +
    `君は${main.layer2.description}。\n` +
    `もうひとりの自分は${shadow.layer2.description}。\n\n` +
    `そして追い詰められた時——\n` +
    `君は${main.layer3.description}。\n` +
    `もうひとりの自分は${shadow.layer3.description}。\n\n` +
    `つまりもうひとりの自分なら、同じ目的のために全く別の道を選ぶ。\n` +
    `${shadowProfile.primary.shadowDesire}——これがもうひとりの本音だ。${suppressedDesire}`
  );
}

/**
 * 理想の自己が選ぶであろう選択を生成する。
 *
 * 理想の自己は、メインアーキタイプの長所を最大化しつつ、
 * もうひとりの知恵を統合し、決断の盲点を克服した姿。
 * 決断プロファイルの「死角」を補完する方向を提示する。
 */
export function generateIdealChoice(
  archetypeCode: ArchetypeCode,
  shadowCode: ArchetypeCode,
  axisScores: Partial<Record<TraitAxisKey, number>>,
  decision: string
): string {
  const main = parseLayers(archetypeCode);
  const shadow = parseLayers(shadowCode);
  const mainDef = getArchetypeDef(archetypeCode);
  const profile = buildDecisionProfile(axisScores, archetypeCode);

  // 成長の鍵を使用
  const growthKey = mainDef?.growthKey ?? "";

  // 主要傾向と副次傾向の統合
  const integrationText = profile.secondary
    ? `「${profile.primary.label}」と「${profile.secondary.label}」の間で揺れる必要はない。\n` +
      `両方の知恵を使えばいい。`
    : `「${profile.primary.label}」としてのパターンを手放す必要はない。\n` +
      `でも、そのパターンの「外側」にも目を向けてみる。`;

  return (
    `理想の君——${main.layer1.label}を核に持ちながら、もうひとりの${shadow.layer1.label}の知恵も統合した姿——ならこう考える:\n\n` +
    `${integrationText}\n\n` +
    `${profile.blindSpot}\n` +
    `——これに気づいた上で、もう一度この決断を見てみて。\n\n` +
    `${growthKey ? `君の成長の鍵は「${growthKey}」。\n` : ""}` +
    `今回の決断は、その方向に一歩踏み出すチャンスかもしれない。\n` +
    `「不自然」に感じる方——それが、成長の方向だ。`
  );
}

/**
 * この決断がなぜ難しいのかの深い洞察を生成する。
 *
 * アーキタイプとシャドウの構造、決断プロファイルの内的矛盾から、
 * 決断の困難さの根源を照らし出す。
 */
export function generateDecisionInsight(
  archetypeCode: ArchetypeCode,
  shadowCode: ArchetypeCode,
  axisScores: Partial<Record<TraitAxisKey, number>>,
  decision: string
): string {
  const main = parseLayers(archetypeCode);
  const shadow = parseLayers(shadowCode);
  const profile = buildDecisionProfile(axisScores, archetypeCode);

  // Layer1 が同じ場合: 核は同じだが手段が違う
  if (archetypeCode[0] === shadowCode[0]) {
    return (
      `この決断が難しいのは、どちらを選んでも「${main.layer1.label}」を守れるから。\n` +
      `問題は「何を守るか」ではなく「どう守るか」——\n` +
      `${main.layer2.label}で確認するか、${shadow.layer2.label}に委ねるか。\n\n` +
      `${profile.stressShift}\n` +
      `今がストレス下であれば、いつものパターンはさらに強化される。\n` +
      `この矛盾こそが、あなたという人間の奥行きそのものだ。`
    );
  }

  // Layer1 が違う場合: 核心の価値観が対立している
  if (profile.secondary) {
    return (
      `この決断が難しい本当の理由を教えよう。\n\n` +
      `あなたの中には「${main.layer1.label}」を守りたい自分と、` +
      `「${shadow.layer1.label}」を求める自分がいる。\n` +
      `そして決断の瞬間、「${profile.primary.label}」と「${profile.secondary.label}」が同時に作動する。\n\n` +
      `${profile.primary.description}。でも同時に、${profile.secondary.description}。\n` +
      `この内的矛盾が、どちらの選択肢にもつきまとう。\n\n` +
      `迷えるということは、両方の自分を感じ取れているということだ。\n` +
      `それは弱さではない——複雑さという強さだ。`
    );
  }

  return (
    `この決断が難しい本当の理由を教えよう。\n\n` +
    `あなたの中には「${main.layer1.label}」を守りたい自分と、` +
    `「${shadow.layer1.label}」を求める自分がいる。\n` +
    `${profile.coreMotivation}。\n` +
    `でもこの決断では、そのパターンだけでは答えが出ない。\n\n` +
    `${profile.stressShift}\n` +
    `追い詰められるほど、いつもの自分に戻ろうとする。\n` +
    `——だから迷っている。それは悪いことじゃない。\n` +
    `迷いの中にいる時だけ、新しい自分に出会える。`
  );
}

/**
 * 3つの選択を繋ぐ統合的な物語を生成する。
 *
 * 予測・もうひとりの選択・理想の選択を独立したものではなく、
 * ユーザーの心理構造の異なる層として統合的に語る。
 */
function generateNarrative(
  archetypeCode: ArchetypeCode,
  shadowCode: ArchetypeCode,
  profile: DecisionProfile
): string {
  const main = parseLayers(archetypeCode);
  const shadow = parseLayers(shadowCode);
  const mainDef = getArchetypeDef(archetypeCode);
  const shadowDef = getArchetypeDef(shadowCode);

  return (
    `この3つの選択は、バラバラのものではない。\n` +
    `1つの心の中にある、3つの層だ。\n\n` +
    `【表層】${mainDef?.name ?? archetypeCode}としての君——` +
    `${profile.primary.predictedBehavior}。\n` +
    `これは「いつもの自分」であり、最も安全な選択。\n\n` +
    `【深層】${shadowDef?.name ?? shadowCode}としての影——` +
    `${profile.primary.shadowDesire}。\n` +
    `これは「認めたくない本音」であり、最も正直な選択。\n\n` +
    `【統合】この二つを同時に抱えられた時に見える第三の道——` +
    `${main.layer1.label}も${shadow.layer1.label}も捨てずに、\n` +
    `新しい自分として選ぶ道。\n\n` +
    `どれを選んでも間違いではない。\n` +
    `でも、どれを選んだかで、「次の自分」が変わる。`
  );
}

/**
 * Oracle の完全な応答を生成する。
 *
 * ユーザーの決断に対して、予測・もうひとりの選択・理想の選択・洞察・統合物語を
 * 統合した応答を返す。
 */
export function generateOracleResponse(input: OracleInput): OracleResponse {
  const {
    decision,
    optionA,
    optionB,
    archetypeCode,
    shadowCode,
    axisScores,
    mirrorGaps,
    observationDepth,
  } = input;

  const prediction = predictChoice(axisScores, archetypeCode, decision, optionA, optionB);
  const confidence = calculateConfidence(observationDepth, prediction.profile.strength);

  return {
    predictedChoice: prediction.choice,
    predictedReason: prediction.reason,
    shadowChoice: generateShadowChoice(
      shadowCode,
      archetypeCode,
      axisScores,
      decision,
      mirrorGaps
    ),
    idealChoice: generateIdealChoice(archetypeCode, shadowCode, axisScores, decision),
    confidenceLevel: confidence,
    patternReference:
      `「${prediction.profile.primary.label}」` +
      `${prediction.profile.secondary ? ` x 「${prediction.profile.secondary.label}」` : ""}` +
      `パターンに基づく予測（観測深度: ${observationDepth}%）`,
    verificationQuestion:
      `この決断の結果を教えてください。\n` +
      `予測通りだった場合: パターンの精度が上がります。\n` +
      `予測と違った場合: それはあなたの中で何かが変わった証拠。` +
      `その「何か」を一緒に探りましょう。`,
    insight: generateDecisionInsight(archetypeCode, shadowCode, axisScores, decision),
    narrative: generateNarrative(archetypeCode, shadowCode, prediction.profile),
  };
}
