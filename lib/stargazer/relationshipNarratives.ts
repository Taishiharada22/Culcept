// lib/stargazer/relationshipNarratives.ts
// 関係カテゴリ別の具体的ナラティブ生成
// 抽象的ではなく、「家族には静かだが芯がある人と見られやすい」のような具体的フレーズ

import type { TraitAxisKey } from "./traitAxes";
import type { RelationshipCategory } from "./partnerTypes";
import { RELATIONSHIP_LABELS, RELATIONSHIP_ICONS } from "./partnerTypes";

/* ═══════════════════════════════════════════════
   Relationship Radar (8 axes)
   ═══════════════════════════════════════════════ */

export const RELATIONSHIP_RADAR_AXES = [
  "warmth",          // 温かさ
  "distance",        // 距離感
  "trust",           // 信頼感
  "pressure",        // 圧
  "readability",     // 読みやすさ
  "softness",        // 柔らかさ
  "approachability", // 近寄りやすさ
  "strength",        // 強さ
] as const;

export type RelationshipRadarKey = (typeof RELATIONSHIP_RADAR_AXES)[number];

export const RELATIONSHIP_RADAR_LABELS: Record<RelationshipRadarKey, string> = {
  warmth: "温かさ",
  distance: "距離感",
  trust: "信頼感",
  pressure: "圧",
  readability: "読みやすさ",
  softness: "柔らかさ",
  approachability: "近寄りやすさ",
  strength: "強さ",
};

export interface RelationshipRadarDimension {
  key: RelationshipRadarKey;
  label: string;
  score: number; // 0-100
}

export interface RelationshipCategoryView {
  category: RelationshipCategory;
  label: string;
  icon: string;
  summary: string;
  impressionTop3: string[];
  comfort: string;
  misunderstanding: string;
  distance: string;
  approachability: string;
  pressure: string;
  trust: string;
  gap: string;
  /** Phase 4 拡張フィールド */
  scene: string;                  // 場面 — どんな状況で特徴が出やすいか
  clothingTendency: string;       // 服装傾向 — この関係で選ばれやすい服装
  speechPattern: string;          // 話し方 — この関係での言葉遣い
  misunderstandingReduction: string; // 誤解を減らす一手 — 具体的アクション
  radar: RelationshipRadarDimension[];
}

/* ═══════════════════════════════════════════════
   Axis → Radar Conversion
   ═══════════════════════════════════════════════ */

type Scores = Partial<Record<TraitAxisKey, number>>;

function s(scores: Scores, key: TraitAxisKey): number {
  return scores[key] ?? 0;
}

/** -1..1 を 0..100 に変換 */
function toPercent(v: number): number {
  return Math.round(Math.max(0, Math.min(100, (v + 1) * 50)));
}

function computeRelationshipRadar(
  scores: Scores,
  category: RelationshipCategory
): RelationshipRadarDimension[] {
  // カテゴリによる微調整係数
  const categoryBoost: Partial<Record<RelationshipCategory, Partial<Record<RelationshipRadarKey, number>>>> = {
    family: { warmth: 10, distance: -5 },
    friend: { approachability: 8, softness: 5 },
    romantic: { warmth: 5, pressure: -5 },
    spouse: { trust: 10, distance: -8 },
    colleague: { pressure: 5, readability: 8 },
    stranger: { distance: 10, approachability: -5 },
    close: { warmth: 8, trust: 5 },
    distant: { distance: 10, pressure: 5 },
  };

  const boost = categoryBoost[category] ?? {};

  const rawValues: Record<RelationshipRadarKey, number> = {
    warmth: toPercent(
      (s(scores, "emotional_variability") + s(scores, "reassurance_need") * 0.5) * 0.8
    ) + (boost.warmth ?? 0),
    distance: toPercent(
      (s(scores, "intimacy_pace") * -1 + s(scores, "boundary_awareness") * 0.6) * 0.7
    ) + (boost.distance ?? 0),
    trust: toPercent(
      (s(scores, "independence_vs_harmony") * 0.5 + s(scores, "emotional_regulation") * 0.5) * 0.8
    ) + (boost.trust ?? 0),
    pressure: toPercent(
      (s(scores, "direct_vs_diplomatic") * -1 + s(scores, "cautious_vs_bold") * 0.4) * 0.7
    ) + (boost.pressure ?? 0),
    readability: toPercent(
      (s(scores, "public_private_gap") * -1 + s(scores, "introvert_vs_extrovert") * 0.3) * 0.7
    ) + (boost.readability ?? 0),
    softness: toPercent(
      (s(scores, "direct_vs_diplomatic") + s(scores, "independence_vs_harmony") * 0.4) * 0.8
    ) + (boost.softness ?? 0),
    approachability: toPercent(
      (s(scores, "introvert_vs_extrovert") * 0.5 + s(scores, "social_initiative") * 0.5) * 0.8
    ) + (boost.approachability ?? 0),
    strength: toPercent(
      (s(scores, "cautious_vs_bold") * 0.5 + s(scores, "emotional_regulation") * 0.3 +
       s(scores, "independence_vs_harmony") * -0.3) * 0.8
    ) + (boost.strength ?? 0),
  };

  return RELATIONSHIP_RADAR_AXES.map((key) => ({
    key,
    label: RELATIONSHIP_RADAR_LABELS[key],
    score: Math.max(0, Math.min(100, Math.round(rawValues[key]))),
  }));
}

/* ═══════════════════════════════════════════════
   Narrative Generation — カテゴリ別テンプレート
   ═══════════════════════════════════════════════ */

interface NarrativeTemplate {
  summary: (s: Scores) => string;
  impressionTop3: (s: Scores) => string[];
  comfort: (s: Scores) => string;
  misunderstanding: (s: Scores) => string;
  distance: (s: Scores) => string;
  approachability: (s: Scores) => string;
  pressure: (s: Scores) => string;
  trust: (s: Scores) => string;
  gap: (s: Scores) => string;
  scene: (s: Scores) => string;
  clothingTendency: (s: Scores) => string;
  speechPattern: (s: Scores) => string;
  misunderstandingReduction: (s: Scores) => string;
}

const TEMPLATES: Record<RelationshipCategory, NarrativeTemplate> = {
  family: {
    summary: (sc) =>
      s(sc, "emotional_variability") > 0.2
        ? "家族の前では感情が素直に出やすく、安心できる存在と見られやすい"
        : s(sc, "direct_vs_diplomatic") < -0.2
          ? "家族には思ったことをストレートに言うタイプ。裏表がないと信頼されやすい"
          : "家族には静かだが芯がある人と見られやすい",
    impressionTop3: (sc) => {
      const items: string[] = [];
      if (s(sc, "emotional_variability") > 0.2) items.push("感情が読みやすい");
      if (s(sc, "boundary_awareness") < -0.2) items.push("距離感が近く、甘え上手");
      if (s(sc, "direct_vs_diplomatic") < -0.2) items.push("思ったことを素直に言う");
      if (s(sc, "independence_vs_harmony") > 0.2) items.push("家族の和を大切にする");
      if (s(sc, "reassurance_need") > 0.2) items.push("確認や共感を求める");
      if (s(sc, "emotional_regulation") > 0.2) items.push("感情のコントロールが効く");
      if (items.length < 3) items.push("安定した存在感");
      return items.slice(0, 3);
    },
    comfort: (sc) =>
      s(sc, "emotional_regulation") > 0.2
        ? "感情が安定しているので、家族は安心して頼れる"
        : "自然体でいられるので、一緒にいて楽",
    misunderstanding: (sc) =>
      s(sc, "introvert_vs_extrovert") < -0.2
        ? "無口なだけで怒っていると誤解されやすい"
        : s(sc, "direct_vs_diplomatic") < -0.3
          ? "率直すぎて冷たいと思われることがある"
          : "考え事をしていると、機嫌が悪いと思われがち",
    distance: (sc) =>
      s(sc, "boundary_awareness") > 0.2
        ? "プライベートの境界をしっかり引くタイプ。家族にも一人の時間が必要"
        : "家族との距離は近め。共有することが安心につながる",
    approachability: (sc) =>
      s(sc, "social_initiative") > 0.2
        ? "自分から話しかける方。家族の中でも積極的"
        : "話しかけられるまで待つことが多い。でも声をかけると応えてくれる",
    pressure: (sc) =>
      s(sc, "direct_vs_diplomatic") < -0.3
        ? "率直に物を言うので、時に圧を感じさせることがある"
        : "穏やかで圧は少ない。ただし譲れないところは譲らない",
    trust: (sc) =>
      s(sc, "emotional_regulation") > 0.2
        ? "感情が安定しているので、信頼されやすい存在"
        : "気分に波はあるが、根底にある信頼は厚い",
    gap: (sc) =>
      s(sc, "public_private_gap") > 0.3
        ? "外での自分と家族の前の自分にかなりギャップがある"
        : "家族の前でも外でも、あまり変わらないタイプ",
    scene: (sc) =>
      s(sc, "emotional_variability") > 0.2
        ? "食卓や団らんの時間で感情が素直に出やすい。リラックスした場で本音が見える"
        : "日常の何気ないやりとりの中で、静かな安定感が伝わる",
    clothingTendency: (sc) =>
      s(sc, "function_vs_expression") > 0.2
        ? "家族の前でも身だしなみに気を配る。自分らしさを大切にする"
        : "家ではラフな格好が多い。飾らない姿が家族の安心につながる",
    speechPattern: (sc) =>
      s(sc, "direct_vs_diplomatic") < -0.2
        ? "ストレートに物を言う。遠回しな表現が少ない分、伝わりやすい"
        : "穏やかな口調で、家族の気持ちを考えながら話す",
    misunderstandingReduction: (sc) =>
      s(sc, "introvert_vs_extrovert") < -0.2
        ? "「考え中」と一言伝えるだけで、怒っている誤解が解ける"
        : s(sc, "direct_vs_diplomatic") < -0.3
          ? "率直さの前に「大事だから言うんだけど」と前置きを添える"
          : "時々「ありがとう」を言葉にすると、安心感が増す",
  },

  friend: {
    summary: (sc) =>
      s(sc, "introvert_vs_extrovert") > 0.2
        ? "友達の中ではムードメーカー的な存在。一緒にいると楽しい"
        : s(sc, "independence_vs_harmony") > 0.2
          ? "友達の輪を大切にしつつ、自分の意見もちゃんと持っている"
          : "少数の深い友人関係を好む。表面的な付き合いは苦手かも",
    impressionTop3: (sc) => {
      const items: string[] = [];
      if (s(sc, "introvert_vs_extrovert") > 0.3) items.push("明るくて話しやすい");
      if (s(sc, "direct_vs_diplomatic") > 0.2) items.push("気遣いができる");
      if (s(sc, "emotional_variability") > 0.2) items.push("感情表現が豊か");
      if (s(sc, "independence_vs_harmony") > 0.2) items.push("協調性がある");
      if (s(sc, "social_initiative") > 0.2) items.push("誘ってくれる");
      if (items.length < 3) items.push("一緒にいて安心");
      return items.slice(0, 3);
    },
    comfort: (sc) =>
      s(sc, "independence_vs_harmony") > 0.2
        ? "グループの空気を読みつつ、みんなが楽しめるよう気を配る"
        : "一対一の深い会話を大切にする。信頼できる友達には本音を見せる",
    misunderstanding: (sc) =>
      s(sc, "introvert_vs_extrovert") < -0.2
        ? "静かなだけで興味がないと思われやすい。実は内心楽しんでいる"
        : "ノリが良すぎて、軽いと思われることがある",
    distance: (sc) =>
      s(sc, "intimacy_pace") < -0.2
        ? "友人関係の深まりに時間がかかるタイプ。でも一度信頼すると長続きする"
        : "割とすぐに打ち解ける。フレンドリーで壁が低い",
    approachability: (sc) =>
      s(sc, "social_initiative") > 0.2
        ? "自分から声をかけるタイプ。友達の輪が広がりやすい"
        : "受け身だけど、誘われたら断らない。控えめな親しみやすさ",
    pressure: (sc) =>
      s(sc, "direct_vs_diplomatic") < -0.2
        ? "思ったことを言うので、時にプレッシャーを感じさせる"
        : "友人に対しては基本的に穏やか。意見の押し付けは少ない",
    trust: (sc) =>
      s(sc, "emotional_regulation") > 0.2
        ? "感情が安定しているので、頼りになる友達"
        : "感情を共有してくれるので、親近感を持たれやすい",
    gap: (sc) =>
      s(sc, "public_private_gap") > 0.3
        ? "仲良くなるほど見える別の顔がある。ギャップに驚かれることも"
        : "誰に対しても大きく変わらない。安心感がある",
    scene: (sc) =>
      s(sc, "introvert_vs_extrovert") > 0.2
        ? "グループの集まりで場を盛り上げる。イベントごとに強い"
        : "一対一のカフェや散歩で深い話をする時間が輝く",
    clothingTendency: (sc) =>
      s(sc, "function_vs_expression") > 0.2
        ? "友人と会う時はおしゃれを楽しむ。一緒にいて映えるスタイル"
        : "カジュアルで気取らないスタイル。親しみやすさが出る",
    speechPattern: (sc) =>
      s(sc, "introvert_vs_extrovert") > 0.2
        ? "テンポよく冗談を交える。ノリの良い会話が得意"
        : "相手の話をじっくり聞く。合いの手は少ないが深い共感がある",
    misunderstandingReduction: (sc) =>
      s(sc, "introvert_vs_extrovert") < -0.2
        ? "「楽しい」と口に出して伝えると、関心がないという誤解が消える"
        : "少し間を置いて、相手の話も聞く姿勢を見せると重みが出る",
  },

  romantic: {
    summary: (sc) =>
      s(sc, "reassurance_need") > 0.2
        ? "恋愛では相手からの確認や言葉を大切にする。愛情表現を求めるタイプ"
        : s(sc, "independence_vs_harmony") < -0.2
          ? "恋愛でも自分のペースを大切にする。独立した関係を好む"
          : "恋人には自然体で接する。無理のない距離感を保ちたい",
    impressionTop3: (sc) => {
      const items: string[] = [];
      if (s(sc, "reassurance_need") > 0.2) items.push("愛情確認を大切にする");
      if (s(sc, "emotional_variability") > 0.3) items.push("感情表現が豊か");
      if (s(sc, "intimacy_pace") > 0.2) items.push("距離を縮めるのが積極的");
      if (s(sc, "boundary_awareness") > 0.2) items.push("パーソナルスペースを大切にする");
      if (s(sc, "direct_vs_diplomatic") < -0.2) items.push("素直に気持ちを伝える");
      if (items.length < 3) items.push("安定した恋愛を求める");
      return items.slice(0, 3);
    },
    comfort: (sc) =>
      s(sc, "emotional_variability") > 0.2
        ? "感情を素直に見せてくれるので、相手も安心しやすい"
        : "穏やかで安定しているので、一緒にいると落ち着く",
    misunderstanding: (sc) =>
      s(sc, "introvert_vs_extrovert") < -0.2
        ? "考え込んでいると、怒っている or 冷めたと思われやすい"
        : s(sc, "reassurance_need") > 0.3
          ? "確認を求めすぎて、束縛と受け取られることがある"
          : "自立しすぎて、愛情が薄いと思われがち",
    distance: (sc) =>
      s(sc, "intimacy_pace") > 0.2
        ? "距離を縮めたいタイプ。近さが安心につながる"
        : "適度な距離感を保ちたい。一人の時間も必要",
    approachability: (sc) =>
      s(sc, "social_initiative") > 0.2
        ? "自分からアプローチするタイプ。積極的に距離を縮める"
        : "相手のペースに合わせる。慎重に距離を測る",
    pressure: (sc) =>
      s(sc, "direct_vs_diplomatic") < -0.3
        ? "恋愛でもストレートに物を言うので、時にプレッシャーになる"
        : "恋人に対しては基本的に優しい。圧は少ない",
    trust: (sc) =>
      s(sc, "emotional_regulation") > 0.2
        ? "感情が安定していて、信頼できるパートナー"
        : "気分に波はあるが、大切にしてくれている実感は伝わる",
    gap: (sc) =>
      s(sc, "public_private_gap") > 0.3
        ? "二人きりの時と外での顔が違う。親密さの中で見せる別の顔がある"
        : "恋人の前でも他の人の前でも大きく変わらない",
    scene: (sc) =>
      s(sc, "reassurance_need") > 0.2
        ? "静かな場所で二人きりの時間がベスト。確認と安心が深まる"
        : "日常の中の何気ない瞬間—料理中や移動中—に自然体が見える",
    clothingTendency: (sc) =>
      s(sc, "function_vs_expression") > 0.2
        ? "デートの服装にこだわる。相手に見られる自分を意識する"
        : "自然体の装いが多い。飾らない姿で一緒にいたい",
    speechPattern: (sc) =>
      s(sc, "reassurance_need") > 0.2
        ? "「これでいい？」「大丈夫？」と確認する言葉が多い"
        : s(sc, "direct_vs_diplomatic") < -0.2
          ? "気持ちをストレートに伝える。察してもらうより言葉にする"
          : "穏やかな口調。相手のペースに合わせた会話",
    misunderstandingReduction: (sc) =>
      s(sc, "introvert_vs_extrovert") < -0.2
        ? "考え事をしている時は「今考え中」と伝えると、冷めたと思われない"
        : s(sc, "reassurance_need") > 0.3
          ? "確認のトーンを「聞きたいから聞いてる」に変えると、束縛感が和らぐ"
          : "「好き」「ありがとう」を意識的に言葉にすると、気持ちが伝わる",
  },

  spouse: {
    summary: (sc) =>
      s(sc, "emotional_regulation") > 0.2
        ? "配偶者として安定感がある。長期的な信頼を築けるタイプ"
        : "配偶者との関係では感情を素直に見せる。良くも悪くも正直",
    impressionTop3: (sc) => {
      const items: string[] = [];
      if (s(sc, "emotional_regulation") > 0.2) items.push("安定している");
      if (s(sc, "direct_vs_diplomatic") < -0.2) items.push("正直に話してくれる");
      if (s(sc, "independence_vs_harmony") > 0.2) items.push("家庭の和を大切にする");
      if (s(sc, "reassurance_need") > 0.2) items.push("愛情確認を求める");
      if (items.length < 3) items.push("信頼できる");
      return items.slice(0, 3);
    },
    comfort: (sc) => "長い時間を共にする中で、お互いの存在が自然な安心になっている",
    misunderstanding: (sc) =>
      s(sc, "introvert_vs_extrovert") < -0.2
        ? "無言の時間が多いと、不満があると思われやすい"
        : "慣れから来る雑さが、大切にされていないと誤解されることがある",
    distance: (sc) => "長い関係の中で、適度な距離感の調整が続いている",
    approachability: (sc) => "日常の中で自然に会話が生まれる関係",
    pressure: (sc) =>
      s(sc, "direct_vs_diplomatic") < -0.3
        ? "率直すぎて、日常の中で圧を感じさせることがある"
        : "基本的に穏やかで、家庭内の空気を壊さない",
    trust: (sc) => "長い時間をかけて築いた信頼がベースにある",
    gap: (sc) =>
      s(sc, "public_private_gap") > 0.3
        ? "外での顔と家での顔にギャップがある。パートナーだけが知る一面"
        : "どこでも大きく変わらない。安心感のある一貫性",
    scene: (sc) =>
      s(sc, "emotional_regulation") > 0.2
        ? "日々の家事や育児の中で安定感が光る。危機に強い"
        : "くつろいだ休日に、本音や甘えが自然に出る",
    clothingTendency: (sc) =>
      s(sc, "function_vs_expression") > 0.2
        ? "家でもきちんとした格好。身だしなみが関係の敬意になっている"
        : "リラックスウェアが中心。家での時間＝くつろぎの象徴",
    speechPattern: (sc) =>
      s(sc, "direct_vs_diplomatic") < -0.3
        ? "長い付き合いで遠慮がない。良くも悪くも率直"
        : "日常のやりとりは簡潔。要点を伝え合える信頼がある",
    misunderstandingReduction: (sc) =>
      s(sc, "introvert_vs_extrovert") < -0.2
        ? "黙っている時間に「不満はないよ」と伝えると、安心感が増す"
        : "慣れで雑になる前に、週一回でも丁寧な言葉を入れる",
  },

  colleague: {
    summary: (sc) =>
      s(sc, "analytical_vs_intuitive") < -0.2
        ? "仕事では分析的でロジカル。データや根拠を重視する"
        : s(sc, "cautious_vs_bold") > 0.2
          ? "仕事では行動力がある。決断が早く、推進力がある"
          : "仕事ではバランス型。状況に応じて柔軟に対応する",
    impressionTop3: (sc) => {
      const items: string[] = [];
      if (s(sc, "analytical_vs_intuitive") < -0.2) items.push("ロジカルで信頼できる");
      if (s(sc, "plan_vs_spontaneous") < -0.2) items.push("計画的に動く");
      if (s(sc, "cautious_vs_bold") > 0.2) items.push("決断力がある");
      if (s(sc, "direct_vs_diplomatic") > 0.2) items.push("配慮ある伝え方をする");
      if (s(sc, "social_initiative") > 0.2) items.push("チーム内で積極的");
      if (items.length < 3) items.push("仕事が丁寧");
      return items.slice(0, 3);
    },
    comfort: (sc) =>
      s(sc, "independence_vs_harmony") > 0.2
        ? "チームワークを大切にするので、一緒に仕事がしやすい"
        : "自分の領域をしっかり持っているので、任せやすい",
    misunderstanding: (sc) =>
      s(sc, "introvert_vs_extrovert") < -0.2
        ? "会議で発言が少ないと、意見がないと思われやすい。実は考えている"
        : s(sc, "direct_vs_diplomatic") < -0.2
          ? "率直なフィードバックが批判と受け取られることがある"
          : "効率重視が冷たいと思われることがある",
    distance: (sc) => "仕事上の距離感を適切に保つ。プロフェッショナルな関係",
    approachability: (sc) =>
      s(sc, "social_initiative") > 0.2
        ? "相談しやすい。オープンな姿勢で話を聞いてくれる"
        : "必要な時にちゃんと対応してくれる。控えめだが頼れる",
    pressure: (sc) =>
      s(sc, "perfectionist_vs_pragmatic") < -0.3
        ? "完璧主義な面があり、周囲にプレッシャーを与えることがある"
        : "適度な要求水準で、チームのバランスを保つ",
    trust: (sc) =>
      s(sc, "plan_vs_spontaneous") < -0.2
        ? "計画通りに動くので、スケジュール面で信頼できる"
        : "柔軟な対応ができるので、急な変更にも頼りになる",
    gap: (sc) =>
      s(sc, "public_private_gap") > 0.3
        ? "仕事モードとプライベートがかなり違う。飲み会で驚かれることも"
        : "オンオフの差が少ない。一貫性がある人という印象",
    scene: (sc) =>
      s(sc, "analytical_vs_intuitive") < -0.2
        ? "会議やレビューの場で冴える。データを基に論を立てる姿が印象的"
        : s(sc, "cautious_vs_bold") > 0.2
          ? "新しいプロジェクトや提案の場で行動力が際立つ"
          : "日常業務の中で安定した対応が信頼を積む",
    clothingTendency: (sc) =>
      s(sc, "function_vs_expression") > 0.2
        ? "ビジネスカジュアルの中にも個性を出す。清潔感＋自分らしさ"
        : "機能的で清潔なスタイル。TPOに合わせた無難な選択",
    speechPattern: (sc) =>
      s(sc, "direct_vs_diplomatic") > 0.2
        ? "丁寧で配慮ある言い回し。指摘もソフトに伝える"
        : "端的で論理的。無駄が少ないが、冷たく聞こえることも",
    misunderstandingReduction: (sc) =>
      s(sc, "introvert_vs_extrovert") < -0.2
        ? "会議で一言でも発言する習慣をつけると、意見がないという誤解が減る"
        : s(sc, "direct_vs_diplomatic") < -0.2
          ? "フィードバックに「ここは良い」を先に入れると、批判と思われにくい"
          : "雑談を少し増やすと、効率重視の冷たさが和らぐ",
  },

  stranger: {
    summary: (sc) =>
      s(sc, "introvert_vs_extrovert") > 0.2
        ? "初対面では明るくフレンドリー。すぐに場に馴染む"
        : s(sc, "social_initiative") < -0.2
          ? "初対面では控えめ。最初は様子を見るタイプ"
          : "初対面では落ち着いた印象。穏やかで安心感がある",
    impressionTop3: (sc) => {
      const items: string[] = [];
      if (s(sc, "introvert_vs_extrovert") > 0.2) items.push("明るい");
      if (s(sc, "introvert_vs_extrovert") < -0.2) items.push("物静か");
      if (s(sc, "direct_vs_diplomatic") > 0.2) items.push("丁寧");
      if (s(sc, "function_vs_expression") > 0.2) items.push("おしゃれ");
      if (s(sc, "cautious_vs_bold") > 0.2) items.push("自信がありそう");
      if (items.length < 3) items.push("落ち着いている");
      return items.slice(0, 3);
    },
    comfort: (sc) =>
      s(sc, "social_initiative") > 0.2
        ? "自分から話しかけてくれるので、初対面でも安心"
        : "穏やかな雰囲気で、威圧感がない",
    misunderstanding: (sc) =>
      s(sc, "introvert_vs_extrovert") < -0.3
        ? "初対面では無口で、とっつきにくいと思われがち"
        : "フレンドリーすぎて、軽い人だと思われることがある",
    distance: (sc) =>
      s(sc, "intimacy_pace") < -0.2
        ? "初対面では距離を保つ。ゆっくり関係を築くタイプ"
        : "初対面でもオープン。壁を感じさせない",
    approachability: (sc) =>
      s(sc, "social_initiative") > 0.2
        ? "話しかけやすい雰囲気がある"
        : "少し話しかけにくいかも。でも声をかけると丁寧に対応する",
    pressure: (sc) =>
      s(sc, "cautious_vs_bold") > 0.3
        ? "初対面では存在感が強め。少し圧を感じる人もいる"
        : "初対面では控えめ。圧は少ない",
    trust: (sc) => "初対面の段階では、まだ信頼の構築中。第一印象が重要",
    gap: (sc) =>
      s(sc, "public_private_gap") > 0.3
        ? "第一印象と親しくなった後の印象にギャップがある"
        : "第一印象通りの人。裏表が少ない",
    scene: (sc) =>
      s(sc, "introvert_vs_extrovert") > 0.2
        ? "パーティーや大人数の場で存在感を発揮する。初対面で印象に残る"
        : "静かな紹介の場やワークショップで落ち着いた印象を与える",
    clothingTendency: (sc) =>
      s(sc, "function_vs_expression") > 0.2
        ? "初対面の場ではしっかりめの服装。第一印象に気を配る"
        : "普段着に近い自然な装い。飾らない姿勢が伝わる",
    speechPattern: (sc) =>
      s(sc, "social_initiative") > 0.2
        ? "自分から話しかけ、相手の話も引き出す。会話の潤滑油"
        : "まず聞く姿勢。相手の話を受け止めてから答える",
    misunderstandingReduction: (sc) =>
      s(sc, "introvert_vs_extrovert") < -0.3
        ? "最初に笑顔で挨拶するだけで、とっつきにくさが大幅に減る"
        : "テンションを少し抑えると、軽い人という印象が和らぐ",
  },

  close: {
    summary: (sc) =>
      s(sc, "emotional_variability") > 0.2
        ? "親しい人の前では感情表現が豊か。喜怒哀楽を見せてくれる"
        : "親しい人の前でも穏やか。落ち着いた安心感がある",
    impressionTop3: (sc) => {
      const items: string[] = [];
      if (s(sc, "emotional_variability") > 0.2) items.push("感情豊か");
      if (s(sc, "direct_vs_diplomatic") < -0.2) items.push("本音で話す");
      if (s(sc, "reassurance_need") > 0.2) items.push("甘え上手");
      if (s(sc, "boundary_awareness") < -0.2) items.push("距離が近い");
      if (s(sc, "independence_vs_harmony") > 0.2) items.push("思いやりがある");
      if (items.length < 3) items.push("信頼できる");
      return items.slice(0, 3);
    },
    comfort: (sc) =>
      s(sc, "boundary_awareness") < -0.2
        ? "距離が近く、一緒にいると安心感がある"
        : "適度な距離感を保ちつつ、しっかり向き合ってくれる",
    misunderstanding: (sc) =>
      s(sc, "emotional_variability") > 0.3
        ? "感情の波があるので、情緒不安定と思われることがある"
        : "落ち着きすぎて、関心がないと思われがち",
    distance: (sc) => "親しい間柄ならではの近い距離感。お互いの領域を尊重しつつ近い",
    approachability: (sc) => "親しくなった相手には心を開く。安心して頼れる存在",
    pressure: (sc) =>
      s(sc, "direct_vs_diplomatic") < -0.3
        ? "親しいからこそ率直に物を言う。時に圧を感じることも"
        : "親しい人には基本的に優しい。圧は感じにくい",
    trust: (sc) => "深い信頼関係が築けている。長い時間をかけた絆",
    gap: (sc) =>
      s(sc, "public_private_gap") > 0.3
        ? "親しい人だけが知る別の一面がある。ギャップの魅力"
        : "誰にでも同じ姿勢。裏表のない信頼感",
    scene: (sc) =>
      s(sc, "emotional_variability") > 0.2
        ? "二人きりの食事やドライブなど、気を遣わない場で感情が溢れる"
        : "日常の中で自然と安心できる空間を作る。穏やかな時間が得意",
    clothingTendency: (sc) =>
      s(sc, "function_vs_expression") > 0.2
        ? "親しい人の前でもおしゃれを楽しむ。自分を表現する手段のひとつ"
        : "リラックスした装い。一緒にいる安心感が服装にも出る",
    speechPattern: (sc) =>
      s(sc, "direct_vs_diplomatic") < -0.2
        ? "本音で話す。回りくどい表現は少なく、信頼の証"
        : "相手に合わせつつ、大事なことは伝える。バランスのいい会話",
    misunderstandingReduction: (sc) =>
      s(sc, "emotional_variability") > 0.3
        ? "「今は感情が波立ってるけど、あなたへの不満じゃない」と伝えると安心する"
        : "「何も言わないけど、一緒にいられるのが嬉しい」と伝えると距離が縮まる",
  },

  distant: {
    summary: (sc) =>
      s(sc, "introvert_vs_extrovert") < -0.2
        ? "距離のある相手に対しては静かで控えめ。必要以上に近づかない"
        : "距離があっても丁寧に接する。礼儀正しい印象",
    impressionTop3: (sc) => {
      const items: string[] = [];
      if (s(sc, "introvert_vs_extrovert") < -0.2) items.push("物静か");
      if (s(sc, "direct_vs_diplomatic") > 0.2) items.push("丁寧");
      if (s(sc, "boundary_awareness") > 0.2) items.push("境界線がしっかり");
      if (s(sc, "public_private_gap") > 0.2) items.push("つかみどころがない");
      if (items.length < 3) items.push("控えめ");
      return items.slice(0, 3);
    },
    comfort: (sc) => "距離感を尊重してくれるので、押し付けがましくない",
    misunderstanding: (sc) =>
      s(sc, "introvert_vs_extrovert") < -0.3
        ? "距離を置いているのではなく、自然にそうなっているだけ"
        : "壁があると思われやすいが、実はただ慎重なだけ",
    distance: (sc) => "距離のある関係にも適切な敬意を持って接する",
    approachability: (sc) =>
      s(sc, "social_initiative") < -0.2
        ? "自分からは近づかない。でも拒否しているわけではない"
        : "必要な時にはちゃんと関わる。選択的な距離感",
    pressure: (sc) => "距離のある相手には圧をかけない。穏やかな存在感",
    trust: (sc) => "距離はあるが、必要な時には頼れる。信頼の芽は持っている",
    gap: (sc) =>
      s(sc, "public_private_gap") > 0.3
        ? "知れば知るほど違う一面が見える可能性がある"
        : "距離があっても見えている姿が本来の姿に近い",
    scene: (sc) =>
      s(sc, "introvert_vs_extrovert") < -0.2
        ? "共通の知人を介した場面で、必要最低限のやりとりをする"
        : "社交的な場面では相手に合わせた距離感を保つ",
    clothingTendency: (sc) =>
      s(sc, "function_vs_expression") > 0.2
        ? "フォーマル寄りの身だしなみ。きちんとした印象を大切にする"
        : "普段通りの装い。距離のある相手にも飾らない",
    speechPattern: (sc) =>
      s(sc, "direct_vs_diplomatic") > 0.2
        ? "丁寧語が基本。礼儀正しく控えめなやりとり"
        : "簡潔で必要なことだけ。無駄がないが冷たく見えることも",
    misunderstandingReduction: (sc) =>
      s(sc, "introvert_vs_extrovert") < -0.3
        ? "目が合った時に軽く頷くだけで、壁を作っている印象が和らぐ"
        : "挨拶に一言だけ付け加える（「暑いですね」等）と距離が縮まる",
  },
};

/* ═══════════════════════════════════════════════
   Public API
   ═══════════════════════════════════════════════ */

/**
 * 関係カテゴリ別の具体的ナラティブを生成
 */
export function generateCategoryNarrative(
  category: RelationshipCategory,
  axisScores: Partial<Record<TraitAxisKey, number>>,
  contextScores?: Partial<Record<TraitAxisKey, number>>
): RelationshipCategoryView {
  // コンテキストスコアがあればそちらを優先
  const scores = contextScores && Object.keys(contextScores).length > 0
    ? contextScores
    : axisScores;

  const template = TEMPLATES[category];
  const radar = computeRelationshipRadar(scores, category);

  return {
    category,
    label: RELATIONSHIP_LABELS[category],
    icon: RELATIONSHIP_ICONS[category],
    summary: template.summary(scores),
    impressionTop3: template.impressionTop3(scores),
    comfort: template.comfort(scores),
    misunderstanding: template.misunderstanding(scores),
    distance: template.distance(scores),
    approachability: template.approachability(scores),
    pressure: template.pressure(scores),
    trust: template.trust(scores),
    gap: template.gap(scores),
    scene: template.scene(scores),
    clothingTendency: template.clothingTendency(scores),
    speechPattern: template.speechPattern(scores),
    misunderstandingReduction: template.misunderstandingReduction(scores),
    radar,
  };
}

/**
 * 全8カテゴリのナラティブを一括生成
 */
export function generateAllCategoryNarratives(
  axisScores: Partial<Record<TraitAxisKey, number>>,
  contextScoresMap?: Record<string, Partial<Record<TraitAxisKey, number>>>
): RelationshipCategoryView[] {
  const categories: RelationshipCategory[] = [
    "family", "friend", "romantic", "spouse",
    "colleague", "stranger", "close", "distant",
  ];

  // カテゴリ→コンテキストキーのマッピング
  const contextKeyMap: Partial<Record<RelationshipCategory, string>> = {
    family: "family",
    friend: "friends",
    romantic: "romance",
    spouse: "romance",
    colleague: "work",
  };

  return categories.map((cat) => {
    const ctxKey = contextKeyMap[cat];
    const ctxScores = ctxKey && contextScoresMap ? contextScoresMap[ctxKey] : undefined;
    return generateCategoryNarrative(cat, axisScores, ctxScores);
  });
}
