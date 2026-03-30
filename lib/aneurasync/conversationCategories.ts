// lib/aneurasync/conversationCategories.ts
// 5固定会話カテゴリ — HOMEロボの会話を構造化
// 既存 dailyObservation.ts の7テーマを5カテゴリに再マッピング

import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import { getTimeOfDay, type TimeOfDay } from "@/lib/shared/timeOfDay";
import type { DayContext, ObservationTheme, ChoiceValue } from "./dailyObservation";
export type { ChoiceValue };

/* ═══════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════ */

export type ConversationCategory =
  | "partner"       // 相手/マッチング
  | "outfit"        // コーデフィードバック
  | "care"          // 洗濯/服の運用
  | "preparation"   // 明日の準備
  | "impression";   // 印象/自己表現

export type QuestionKind = "fixed" | "rotating" | "anomaly";

export type SupplementaryLens =
  | "energy"
  | "place_weather"
  | "relational_distance"
  | "expectation_gap"
  | "repetition_pattern"
  | "others_view"
  | "true_feeling"
  | "controllable_vs_uncontrollable";

export type AnswerBranch =
  | "reproduction"    // positive → 再現条件探索
  | "cause_drill"     // negative → 原因深掘り
  | "angle_change"    // ambiguous → 角度変更
  | "anomaly_probe";  // anomaly → 異常パターン探索

export interface AxisMapping {
  axis: TraitAxisKey;
  scoreMap: Partial<Record<number, number>>;  // choiceValue → axis delta
}

export interface CategoryQuestion {
  id: string;
  category: ConversationCategory;
  /** 質問種別 (default: "fixed") */
  questionKind?: QuestionKind;
  /** 補足レンズ */
  lens?: SupplementaryLens;
  robotLine: string;
  /** robotLine の代替表現バリエーション（同じ意味の別フレーズ） */
  robotLineVariants?: string[];
  choices: { value: ChoiceValue; label: string }[];
  reactions: Partial<Record<ChoiceValue, string>>;
  followUp?: { question: string; options: string[] };
  /** Stargazer に観測として保存するか */
  isObservation: boolean;
  /** Stargazer 軸マッピング */
  axisMapping?: AxisMapping[];
  /** この質問が出やすい時間帯 */
  timePreference: TimeOfDay[];
  /** 元の ObservationTheme (互換用) */
  legacyTheme?: ObservationTheme;
  /** true = 対人インタラクション(hadPeople/hadDate)が前提の質問。該当しない日はスキップ */
  requiresInteraction?: boolean;
  /** true = デートが前提の質問。hadDate でない日はスキップ */
  requiresDate?: boolean;
  /** true = 今日のコーデ/アイテムが選択済みであることが前提 */
  requiresOutfitSelected?: boolean;
  /** 類似質問グループ。同一セッション内で同グループの質問は1つのみ選ばれる */
  similarGroup?: string;
}

/* ═══════════════════════════════════════════════
   Category Metadata
   ═══════════════════════════════════════════════ */

export const CATEGORY_LABELS: Record<ConversationCategory, string> = {
  partner: "相手",
  outfit: "コーデ",
  care: "ケア",
  preparation: "準備",
  impression: "印象",
};

export const CATEGORY_ICONS: Record<ConversationCategory, string> = {
  partner: "👥",
  outfit: "👔",
  care: "🧺",
  preparation: "📋",
  impression: "🪞",
};

/** カテゴリ→既存テーマのマッピング */
export const CATEGORY_THEME_MAP: Record<ConversationCategory, ObservationTheme[]> = {
  partner: ["interpersonal", "date"],
  outfit: ["outfit", "selfMatch"],
  care: ["laundry"],
  preparation: ["eventFit"],
  impression: ["mood"],
};

/* ═══════════════════════════════════════════════
   Time-of-Day Priority
   ═══════════════════════════════════════════════ */

export const TIME_PRIORITY: Record<TimeOfDay, ConversationCategory[]> = {
  morning: ["preparation", "outfit", "impression"],
  afternoon: ["impression", "outfit", "partner"],
  night: ["outfit", "care", "partner"],
};

/* ═══════════════════════════════════════════════
   Question Bank — 5カテゴリ
   ═══════════════════════════════════════════════ */

export const CATEGORY_QUESTIONS: CategoryQuestion[] = [
  // ────────────── partner (相手/マッチング) ──────────────
  {
    id: "cat_partner_1",
    category: "partner",
    requiresInteraction: true,
    similarGroup: "social_comfort",
    robotLine: "今日、人と接してて一番エネルギーを使った瞬間は？",
    robotLineVariants: ["人といて一番消耗した場面って何だった？", "誰かと関わるなかで、一番力を使ったのはどこ？"],
    choices: [
      { value: 5, label: "相手に合わせようとしたとき" },
      { value: 4, label: "自分の意見を通そうとしたとき" },
      { value: 3, label: "沈黙をどう埋めるか考えたとき" },
      { value: 2, label: "話を聞き続けたとき" },
      { value: 1, label: "特にエネルギーは使わなかった" },
    ],
    reactions: {
      5: "合わせる方にエネルギーが向くんだね。その傾向、記録しておく。",
      4: "自分を出すのにも体力がいる。それは大事な観測。",
      3: "沈黙への反応は、対人パターンの核心に近い。",
      2: "聞き役に回りやすいんだね。それが自然なのか、癖なのか。",
      1: "エネルギーを使わなかった。自然体でいられたか、距離を取ってたか。",
    },
    followUp: {
      question: "どれに近い？",
      options: ["話しやすかった", "安心できた", "少し無理した", "距離感が合わなかった", "一人で充実してた"],
    },
    isObservation: true,
    axisMapping: [
      { axis: "intimacy_pace", scoreMap: { 1: -0.15, 2: -0.08, 3: 0, 4: 0.08, 5: 0.15 } },
      { axis: "boundary_awareness", scoreMap: { 1: -0.1, 2: -0.05, 3: 0, 4: 0.05, 5: 0.1 } },
      { axis: "stress_isolation_vs_social", scoreMap: { 1: -0.1, 2: -0.05, 3: 0, 4: 0.05, 5: 0.1 } },
    ],
    timePreference: ["afternoon", "night"],
    legacyTheme: "interpersonal",
  },
  {
    id: "cat_partner_2",
    category: "partner",
    robotLine: "デート中、一番「素の自分」が出た瞬間と、一番「隠した」瞬間は？",
    robotLineVariants: ["今日のデートで、自分を出せた場面と出せなかった場面は？", "デート中、どこまで本音を見せられた？"],
    choices: [
      { value: 5, label: "ほぼずっと素でいられた" },
      { value: 4, label: "楽しい場面では素が出た" },
      { value: 3, label: "素を出すタイミングを計ってた" },
      { value: 2, label: "相手のリアクションを見て調整してた" },
      { value: 1, label: "ほとんど取り繕ってた" },
    ],
    reactions: {
      5: "素のまま通せた。相手との相性が見えてくる。",
      4: "楽しさが自然さを引き出す。その条件を覚えておく。",
      3: "タイミングを計る、という行動パターン。慎重さの表れかも。",
      2: "相手に合わせて自分を変える癖。それ自体は悪くないけど、疲れないか。",
      1: "取り繕ってた。何を隠したかったのか、そこに本音がある。",
    },
    followUp: {
      question: "印象に残ったのは？",
      options: ["会話のテンポ", "安心感", "見た目", "緊張感"],
    },
    isObservation: true,
    axisMapping: [
      { axis: "intimacy_pace", scoreMap: { 1: -0.2, 2: -0.1, 3: 0, 4: 0.1, 5: 0.2 } },
      { axis: "reassurance_need", scoreMap: { 1: 0.1, 2: 0.05, 3: 0, 4: -0.05, 5: -0.1 } },
    ],
    timePreference: ["night"],
    legacyTheme: "date",
    requiresDate: true,
    requiresInteraction: true,
  },
  {
    id: "cat_partner_3",
    category: "partner",
    requiresInteraction: true,
    similarGroup: "distance_feel",
    robotLine: "誰かに踏み込まれて「ちょっと嫌だな」と感じた瞬間、最近あった？",
    robotLineVariants: ["最近、人との距離で「ここまでにして」と思ったことある？", "誰かに境界線を越えられた感覚、なかった？"],
    choices: [
      { value: 5, label: "ない。人との距離は自分でコントロールできてる" },
      { value: 4, label: "少しあったけど、自分から軌道修正できた" },
      { value: 3, label: "あったけど、その場ではスルーした" },
      { value: 2, label: "あった。でも言い出せなかった" },
      { value: 1, label: "頻繁にある。距離感の主導権を握れていない" },
    ],
    reactions: {
      5: "境界線を自分で引ける。それは対人関係の土台になる。",
      4: "違和感に気づいて修正できる。その感覚は鋭い。",
      3: "スルーしたけど心に残ってる。その引っかかりが大事。",
      2: "言えなかった。なぜ言えなかったのか、そこに対人パターンが見える。",
      1: "距離感の主導権。それを取り戻す条件を、一緒に見つけよう。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "boundary_awareness", scoreMap: { 1: -0.15, 2: -0.08, 3: 0, 4: 0.08, 5: 0.15 } },
      { axis: "independence_vs_harmony", scoreMap: { 1: -0.1, 2: -0.05, 3: 0, 4: 0.05, 5: 0.1 } },
    ],
    timePreference: ["afternoon", "night"],
  },

  // ────────────── outfit (コーデフィードバック) ──────────────
  {
    id: "cat_outfit_1",
    category: "outfit",
    similarGroup: "outfit_satisfaction",
    robotLine: "今日の服を選ぶとき、最後の決め手になったのは何だった？",
    robotLineVariants: ["今朝、最終的に何がコーデの決め手になった？", "今日の服、選んだ理由の核心は？"],
    choices: [
      { value: 5, label: "気分に合うかどうか" },
      { value: 4, label: "予定や場に合うかどうか" },
      { value: 3, label: "なんとなく手に取った" },
      { value: 2, label: "昨日と違うものを選びたかった" },
      { value: 1, label: "人にどう見られるか" },
    ],
    reactions: {
      5: "気分ドリブン。内側の感覚を信じて選んでる。",
      4: "場に合わせる判断力。外側の条件を読んでから選ぶタイプ。",
      3: "無意識の選択。でもその『なんとなく』にパターンがある。",
      2: "変化を求める衝動。昨日の自分との差分を作りたい。",
      1: "他者の目が基準になってる。それは戦略か、それとも不安か。",
    },
    followUp: {
      question: "何が一番大きかった？",
      options: ["見た目", "気分", "動きやすさ", "気温", "場の雰囲気"],
    },
    isObservation: true,
    axisMapping: [
      { axis: "function_vs_expression", scoreMap: { 1: -0.1, 2: -0.05, 3: 0, 4: 0.05, 5: 0.1 } },
    ],
    timePreference: ["afternoon", "night"],
    legacyTheme: "outfit",
  },
  {
    id: "cat_outfit_2",
    category: "outfit",
    similarGroup: "self_authenticity",
    robotLine: "今日着てた服と、今の気分にズレはある？",
    robotLineVariants: ["朝選んだ服と、今の自分の温度差は？", "今日のコーデ、今振り返ると合ってた？"],
    choices: [
      { value: 5, label: "朝の選択がぴったりだった" },
      { value: 4, label: "途中まで合ってたけど、後半ズレてきた" },
      { value: 3, label: "朝は良かったけど、気分が変わった" },
      { value: 2, label: "最初からちょっと違和感があった" },
      { value: 1, label: "一日中、服と気分がバラバラだった" },
    ],
    reactions: {
      5: "朝の直感が正しかった。自分の状態を読む精度が高い。",
      4: "後半のズレ。時間帯で気分が変わるパターンが見えてくる。",
      3: "気分の変化に服が追いつかない。どのタイミングで変わった？",
      2: "朝から違和感。選ぶ時点で迷いがあったのかも。",
      1: "ズレが一日続いた。服の問題か、気分の問題か。そこを切り分けよう。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "public_private_gap", scoreMap: { 1: 0.15, 2: 0.08, 3: 0, 4: -0.05, 5: -0.1 } },
    ],
    timePreference: ["night"],
    legacyTheme: "selfMatch",
  },

  // ────────────── care (洗濯/服の運用) ──────────────
  {
    id: "cat_care_1",
    category: "care",
    robotLine: "今日、自分のことを後回しにした瞬間はあった？",
    robotLineVariants: ["自分のケアより他のことを優先した場面、あった？", "今日、自分を大事にできてた？"],
    choices: [
      { value: 5, label: "常に自分を優先できた" },
      { value: 4, label: "少し後回しにしたけど問題なかった" },
      { value: 3, label: "気づいたら後回しにしてた" },
      { value: 2, label: "意識的に我慢した" },
      { value: 1, label: "自分のことを考える余裕がなかった" },
    ],
    reactions: {
      5: "自分を優先できてる。それがケアの土台。",
      4: "小さな後回しが積もる前に気づけてる。いい感覚。",
      3: "無意識の後回し。それが習慣になってないか、観測する。",
      2: "意識的な我慢。何のために我慢したのか、そこに価値観が見える。",
      1: "余裕がなかった。何に奪われたのか、パターンを見にいこう。",
    },
    isObservation: false,
    requiresOutfitSelected: true,
    timePreference: ["night"],
    legacyTheme: "laundry",
  },
  {
    id: "cat_care_2",
    category: "care",
    robotLine: "「疲れてるのに休めない」とき、自分をどう扱ってる？",
    robotLineVariants: ["限界に近いとき、自分にどう声をかけてる？", "消耗してるのに止まれないとき、どうなる？"],
    choices: [
      { value: 5, label: "ちゃんと立ち止まれる" },
      { value: 4, label: "あと少しだけ、と自分を説得する" },
      { value: 3, label: "疲れてることに気づかないフリをする" },
      { value: 2, label: "他人のために頑張り続ける" },
      { value: 1, label: "壊れるまで走り続けてしまう" },
    ],
    reactions: {
      5: "止まれる力。それは自己管理の最上位スキル。",
      4: "『あと少し』の距離感。その基準がいつも同じか、観測する。",
      3: "気づかないフリ。体は正直だから、どこかでツケが来る。",
      2: "他人のために自分を削る。その優しさの代償を見ておこう。",
      1: "壊れるまで走る。止まる条件を一緒に見つけよう。",
    },
    isObservation: false,
    timePreference: ["night"],
  },

  // ────────────── preparation (明日の準備) ──────────────
  {
    id: "cat_prep_1",
    category: "preparation",
    robotLine: "今日、予想外のことが起きたとき、最初に何をした？",
    robotLineVariants: ["想定外の事態に直面したとき、まず何が動いた？", "予定通りにいかなかったとき、自分はどう反応した？"],
    choices: [
      { value: 5, label: "すぐ行動に移した" },
      { value: 4, label: "少し考えてから対応した" },
      { value: 3, label: "誰かに相談した" },
      { value: 2, label: "しばらく固まった" },
      { value: 1, label: "見なかったことにした" },
    ],
    reactions: {
      5: "即行動型。不確実性に強いタイプだ。",
      4: "考えてから動く。精度を大事にしてる。",
      3: "人に頼れる。それは弱さじゃなく、判断の一つ。",
      2: "固まった。その瞬間に何が頭をよぎったか、そこに核心がある。",
      1: "見なかったことにする。回避パターンの奥に何がある？",
    },
    followUp: {
      question: "どんな予定？",
      options: ["仕事/会議", "友達と会う", "デート", "お出かけ", "家でゆっくり"],
    },
    isObservation: false,
    timePreference: ["night"],
    legacyTheme: "eventFit",
  },
  {
    id: "cat_prep_2",
    category: "preparation",
    robotLine: "明日に対して、今どんな感覚がある？",
    robotLineVariants: ["明日を思い浮かべたとき、体はどう反応してる？", "明日という日に、今の自分はどんな気持ち？"],
    choices: [
      { value: 5, label: "楽しみで早く来てほしい" },
      { value: 4, label: "やるべきことがあって、身が引き締まる" },
      { value: 3, label: "特に何も感じない" },
      { value: 2, label: "なんとなく重たい" },
      { value: 1, label: "できれば来ないでほしい" },
    ],
    reactions: {
      5: "ワクワクしてる。その期待の正体は何だろう。",
      4: "緊張感がある。それはエネルギーが向いてる証拠。",
      3: "何も感じない。平穏か、無関心か。その違いは大きい。",
      2: "重たさ。何がその重さを作ってるのか、分解してみよう。",
      1: "来ないでほしい。その回避の奥にある本音を、ゆっくり見にいこう。",
    },
    isObservation: false,
    timePreference: ["night"],
  },

  // ────────────── impression (印象/自己表現) ──────────────
  {
    id: "cat_impression_1",
    category: "impression",
    similarGroup: "mood_eval",
    robotLine: "今日、自分の印象を「作った」瞬間はあった？",
    robotLineVariants: ["今日、意識的に自分の見え方をコントロールした場面ある？", "自分の印象を演出した瞬間、あった？"],
    choices: [
      { value: 5, label: "意識せず自然だった" },
      { value: 4, label: "少し意識したけどほぼ自然" },
      { value: 3, label: "場面によって使い分けた" },
      { value: 2, label: "かなり意識して演じた" },
      { value: 1, label: "ずっと取り繕ってた" },
    ],
    reactions: {
      5: "自然体でいられた。それが一番消耗しない。",
      4: "少しの意識。それは自己演出じゃなく、気配りかもしれない。",
      3: "使い分け。どの場面でスイッチが入ったか、そこにパターンがある。",
      2: "かなり演じた。その労力の先に、何を守ろうとしてた？",
      1: "ずっと取り繕ってた。本当の自分はどこにいた？",
    },
    isObservation: true,
    axisMapping: [
      { axis: "emotional_variability", scoreMap: { 1: -0.1, 2: -0.05, 3: 0, 4: 0.05, 5: 0.1 } },
    ],
    timePreference: ["afternoon", "night"],
    legacyTheme: "mood",
  },
  {
    id: "cat_impression_2",
    category: "impression",
    similarGroup: "others_perception",
    robotLine: "今日の自分を一言で表すなら、どれが近い？",
    robotLineVariants: ["今日一日を振り返って、自分はどんな存在だった？", "今日の自分にキャッチコピーをつけるなら？"],
    choices: [
      { value: 5, label: "舵を握ってた。主導権は自分にあった" },
      { value: 4, label: "流れに乗ってた。悪くない波だった" },
      { value: 3, label: "観察者だった。周りを見てることが多かった" },
      { value: 2, label: "反応する側だった。受け身が多かった" },
      { value: 1, label: "透明人間だった。存在感を消してた" },
    ],
    reactions: {
      5: "主導権を握れる日。何がその状態を作ったのか。",
      4: "流れに乗れた。その波を呼び込む条件を探ろう。",
      3: "観察者モード。安全な立ち位置を選んだとも言える。",
      2: "受け身。それは省エネか、それとも自信のなさか。",
      1: "透明になりたかった。何から隠れようとしてたんだろう。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "public_private_gap", scoreMap: { 1: -0.08, 2: -0.04, 3: 0, 4: 0.06, 5: 0.12 } },
      { axis: "function_vs_expression", scoreMap: { 1: -0.05, 2: -0.02, 3: 0, 4: 0.04, 5: 0.08 } },
    ],
    timePreference: ["afternoon", "night"],
  },
  {
    id: "cat_impression_3",
    category: "impression",
    similarGroup: "others_perception",
    robotLine: "「他人が見てる自分」と「自分が感じてる自分」、今日どれくらいズレてた？",
    robotLineVariants: ["外から見えてる自分と内側の自分、今日はどれくらい距離があった？", "表に出してる自分と本当の自分、今日の乖離は？"],
    choices: [
      { value: 5, label: "ほぼ一致してた。内も外も同じ自分だった" },
      { value: 4, label: "少しだけ外向けにチューニングしてた" },
      { value: 3, label: "場面ごとに別人を出してた気がする" },
      { value: 2, label: "かなりズレてた。でもそうするしかなかった" },
      { value: 1, label: "もはやどっちが本物かわからない" },
    ],
    reactions: {
      5: "内と外が一致。その条件が揃ったのはなぜだろう。",
      4: "少しのチューニング。それは社会性の範囲内。",
      3: "場面ごとに別人。その使い分けにどれくらい疲れた？",
      2: "ズレてた、でもそうするしかなかった。その『しかなかった』を掘り下げたい。",
      1: "どっちが本物かわからない。それ自体が最も深い観測データ。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "reassurance_need", scoreMap: { 1: -0.08, 2: 0.08, 3: 0.04, 4: -0.02, 5: -0.06 } },
    ],
    timePreference: ["night"],
  },

  // ══════════════════════════════════════════════════════════════
  //  Extended Questions — 40+ additional (questionKind + lens)
  // ══════════════════════════════════════════════════════════════

  // ────────────── partner (追加10問) ──────────────
  {
    id: "cat_partner_4", category: "partner", questionKind: "fixed",
    lens: "relational_distance", requiresInteraction: true,
    similarGroup: "social_comfort",
    robotLine: "今日、誰かの期待に応えようとして、自分の本音を曲げた場面はあった？",
    robotLineVariants: ["相手に合わせるために、自分の気持ちを飲み込んだことはあった？", "誰かの前で、思ってもないことに同意した瞬間ある？"],
    choices: [
      { value: 5, label: "本音のまま通せた" },
      { value: 4, label: "小さな妥協はしたけど、核心は守れた" },
      { value: 3, label: "場の空気を読んで本音を引っ込めた" },
      { value: 2, label: "相手を傷つけたくなくて、嘘をついた" },
      { value: 1, label: "自分の意見がどれだったか、わからなくなった" },
    ],
    reactions: {
      5: "本音を貫ける。それ自体が一つの強さ。",
      4: "核心を守れたなら健全。どこまでが許容範囲か、見えてくる。",
      3: "空気を読む力と本音のバランス。その天秤がいつも同じ方に傾いてないか。",
      2: "優しさから出た嘘。でもそれが自分を消耗させてないか。",
      1: "自分の意見が溶けてしまう感覚。それは重要なシグナル。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "independence_vs_harmony", scoreMap: { 1: 0.15, 2: 0.08, 3: 0, 4: -0.05, 5: -0.1 } },
    ],
    timePreference: ["afternoon", "night"],
  },
  {
    id: "cat_partner_5", category: "partner", questionKind: "rotating",
    requiresInteraction: true,
    similarGroup: "social_comfort",
    robotLine: "一緒にいて一番「楽だった瞬間」は？",
    robotLineVariants: ["リラックスできた瞬間ってあった？", "一番肩の力が抜けたのはいつ？"],
    choices: [
      { value: 5, label: "ずっと楽だった" },
      { value: 4, label: "会話してる時" },
      { value: 3, label: "黙ってる時" },
      { value: 2, label: "別れ際" },
      { value: 1, label: "楽な瞬間がなかった" },
    ],
    reactions: {
      5: "それは理想的な関係。",
      3: "沈黙が楽なのは、信頼の証。",
      1: "楽じゃなかった。その感覚、ちゃんと残す。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "intimacy_pace", scoreMap: { 1: -0.12, 3: 0.05, 5: 0.12 } },
    ],
    timePreference: ["night"],
  },
  {
    id: "cat_partner_6", category: "partner", questionKind: "fixed",
    lens: "true_feeling", requiresInteraction: true,
    robotLine: "「言いたかったけど言えなかったこと」ある？",
    robotLineVariants: ["飲み込んだ言葉、ある？", "伝えそびれたこと、なかった？"],
    choices: [
      { value: 5, label: "全部言えた" },
      { value: 4, label: "ほぼ言えた" },
      { value: 3, label: "少しある" },
      { value: 2, label: "けっこうある" },
      { value: 1, label: "かなりある" },
    ],
    reactions: {
      5: "全部伝えられた。それは強い。",
      3: "少し飲み込んだ分、覚えておくよ。",
      1: "溜め込みすぎないで。その引っかかり、観測する。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "direct_vs_diplomatic", scoreMap: { 1: 0.12, 2: 0.06, 3: 0, 4: -0.06, 5: -0.1 } },
    ],
    timePreference: ["night"],
  },
  {
    id: "cat_partner_7", category: "partner", questionKind: "rotating",
    lens: "expectation_gap", requiresInteraction: true,
    similarGroup: "distance_feel",
    robotLine: "今日の相手との距離感、理想と比べてどう？",
    robotLineVariants: ["理想の距離感に近かった？", "相手との間合い、思い通りだった？"],
    choices: [
      { value: 5, label: "理想通り" },
      { value: 4, label: "近い" },
      { value: 3, label: "わからない" },
      { value: 2, label: "ちょっとズレてる" },
      { value: 1, label: "だいぶ違う" },
    ],
    reactions: {
      5: "理想が叶ってるなら、大切にしよう。",
      3: "理想が見えてないなら、そこから見つけていこう。",
      1: "ズレが大きい。どこを直したいか、考えてみよう。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "boundary_awareness", scoreMap: { 1: -0.1, 3: 0, 5: 0.1 } },
    ],
    timePreference: ["night"],
  },
  {
    id: "cat_partner_8", category: "partner", questionKind: "fixed",
    requiresInteraction: true,
    robotLine: "この人との時間、また取りたい？",
    robotLineVariants: ["また会いたいと思った？", "次も一緒に過ごしたい？"],
    choices: [
      { value: 5, label: "ぜひ" },
      { value: 4, label: "たぶん" },
      { value: 3, label: "どちらでもない" },
      { value: 2, label: "あまり" },
      { value: 1, label: "しばらくいい" },
    ],
    reactions: {
      5: "いい関係が続いてるね。",
      3: "迷ってるなら、少し距離を置いてみるのもアリ。",
      1: "しばらくいいと思うなら、自分の時間を大事に。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "intimacy_pace", scoreMap: { 1: -0.1, 3: 0, 5: 0.1 } },
    ],
    timePreference: ["night"],
  },
  {
    id: "cat_partner_9", category: "partner", questionKind: "rotating",
    requiresInteraction: true,
    robotLine: "今日の相手との沈黙、苦しかった？",
    robotLineVariants: ["沈黙の時間、気まずくなかった？", "黙ってる時間、どう感じた？"],
    choices: [
      { value: 5, label: "心地よかった" },
      { value: 4, label: "気にならなかった" },
      { value: 3, label: "微妙" },
      { value: 2, label: "少し気まずかった" },
      { value: 1, label: "かなり苦しかった" },
    ],
    reactions: {
      5: "沈黙が心地いいのは深い関係の証。",
      3: "微妙な沈黙は、距離感を測ってる証拠。",
      1: "沈黙がつらいなら、何か理由があるはず。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "reassurance_need", scoreMap: { 1: 0.1, 3: 0, 5: -0.08 } },
    ],
    timePreference: ["night"],
  },
  {
    id: "cat_partner_10", category: "partner", questionKind: "rotating",
    requiresInteraction: true,
    robotLine: "相手のテンポ、今日は合ってた？",
    robotLineVariants: ["会話のリズム、噛み合ってた？", "お互いのペース、合ってた？"],
    choices: [
      { value: 5, label: "ぴったり" },
      { value: 4, label: "だいたい合ってた" },
      { value: 3, label: "ふつう" },
      { value: 2, label: "少しズレた" },
      { value: 1, label: "合わなかった" },
    ],
    reactions: {
      5: "テンポが合う相手は貴重。",
      3: "テンポのズレは調整可能。意識が大事。",
      1: "テンポが合わないのはストレスの元。記録しておく。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "independence_vs_harmony", scoreMap: { 1: -0.08, 3: 0, 5: 0.08 } },
    ],
    timePreference: ["afternoon", "night"],
  },
  {
    id: "cat_partner_11", category: "partner", questionKind: "rotating",
    lens: "repetition_pattern", requiresInteraction: true,
    robotLine: "この関係、最近どう変化してる？",
    robotLineVariants: ["最近、この人との関係に変化ある？", "二人の関係、動きがあった？"],
    choices: [
      { value: 5, label: "良くなってる" },
      { value: 4, label: "安定してる" },
      { value: 3, label: "わからない" },
      { value: 2, label: "停滞してる" },
      { value: 1, label: "距離が出てる" },
    ],
    reactions: {
      5: "良い方向の変化、続けよう。",
      3: "変化が見えないなら、少し刺激を入れてみるのもアリ。",
      1: "距離の変化は見逃さない。記録しておく。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "intimacy_pace", scoreMap: { 1: -0.08, 3: 0, 5: 0.08 } },
    ],
    timePreference: ["night"],
  },
  {
    id: "cat_partner_12", category: "partner", questionKind: "rotating",
    lens: "true_feeling", requiresInteraction: true,
    similarGroup: "distance_feel",
    robotLine: "相手のどこに引っかかった？",
    robotLineVariants: ["ちょっとモヤっとしたポイントある？", "気になった部分、あった？"],
    choices: [
      { value: 5, label: "何も引っかからなかった" },
      { value: 4, label: "小さなことだけ" },
      { value: 3, label: "言葉遣い" },
      { value: 2, label: "態度や反応" },
      { value: 1, label: "価値観のズレ" },
    ],
    reactions: {
      5: "引っかかりなし。穏やかな関係。",
      3: "言葉遣いが気になったか。その感覚は正直。",
      1: "価値観のズレは根が深い。しっかり観測する。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "boundary_awareness", scoreMap: { 1: -0.1, 3: 0, 5: 0.05 } },
    ],
    timePreference: ["night"],
  },
  {
    id: "cat_partner_13", category: "partner", questionKind: "anomaly",
    lens: "others_view", requiresInteraction: true,
    robotLine: "今日の自分、「普段の自分」と違った？",
    robotLineVariants: ["いつもと違う自分がいた？", "普段の自分とのギャップ、感じた？"],
    choices: [
      { value: 5, label: "いつも通り" },
      { value: 4, label: "少し違った（良い方）" },
      { value: 3, label: "少し違った" },
      { value: 2, label: "かなり違った" },
      { value: 1, label: "別人だった" },
    ],
    reactions: {
      5: "いつもの自分でいられたんだね。",
      3: "いつもと違う自分、そこに何がある？",
      1: "別人のようだった。その変化の理由が知りたい。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "public_private_gap", scoreMap: { 1: 0.15, 2: 0.1, 3: 0.05, 4: -0.02, 5: -0.05 } },
    ],
    timePreference: ["night"],
  },

  // ────────────── outfit (追加10問) ──────────────
  {
    id: "cat_outfit_3", category: "outfit", questionKind: "rotating",
    similarGroup: "outfit_satisfaction",
    robotLine: "今日の服を着てるとき、自分の「見られ方」を意識した瞬間ある？",
    robotLineVariants: ["今日のコーデで、人の視線を感じた場面はあった？", "自分の服装が他人にどう映ってるか、気になった？"],
    choices: [
      { value: 5, label: "全く意識しなかった。自分のための服だった" },
      { value: 4, label: "少し意識したけど、それも含めて楽しんでた" },
      { value: 3, label: "特定の場面で急に気になった" },
      { value: 2, label: "一日を通してちょっと気にしてた" },
      { value: 1, label: "他人の評価がずっと頭にあった" },
    ],
    reactions: {
      5: "自分軸で着てる。内側からの選択だ。",
      4: "見られることも楽しめる。表現として服を使えてる。",
      3: "特定の場面。その場面が何だったか、覚えておいて。",
      2: "他者の目が基準に入り込んでる。いつもそうか、今日だけか。",
      1: "他人の評価に支配されてた。そのプレッシャーの正体を見にいこう。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "function_vs_expression", scoreMap: { 1: -0.08, 3: 0, 5: 0.08 } },
    ],
    timePreference: ["afternoon", "night"],
  },
  {
    id: "cat_outfit_4", category: "outfit", questionKind: "rotating",
    lens: "energy",
    robotLine: "もし今日をもう一回やり直せるなら、同じ服を選ぶ？",
    robotLineVariants: ["今日のコーデ、やり直すとしたら変える？", "同じ一日をもう一度過ごすなら、服はそのまま？"],
    choices: [
      { value: 5, label: "まったく同じでいい" },
      { value: 4, label: "大枠は同じで、小物だけ変える" },
      { value: 3, label: "気分次第でどちらでも" },
      { value: 2, label: "方向性は合ってたけど、別の服にする" },
      { value: 1, label: "全部変えたい" },
    ],
    reactions: {
      5: "迷いなく同じ。今日の選択に確信がある。",
      4: "微調整したい部分がある。その精度が上がってきてる証拠。",
      3: "気分次第。つまり服より状態に左右されてる。",
      2: "方向性は見えてた。実行の精度を上げたい。",
      1: "全部やり直したい。何が一番引っかかった？",
    },
    isObservation: false,
    timePreference: ["afternoon", "night"],
  },
  {
    id: "cat_outfit_5", category: "outfit", questionKind: "rotating",
    robotLine: "一番気に入ったポイントは？",
    robotLineVariants: ["今日のコーデで好きなところは？", "どこが一番良かった？"],
    choices: [
      { value: 5, label: "全体のバランス" },
      { value: 4, label: "色の組み合わせ" },
      { value: 3, label: "シルエット" },
      { value: 2, label: "素材の質感" },
      { value: 1, label: "特にない" },
    ],
    reactions: {
      5: "全体で見れてるのは上級者。",
      4: "色合いに自信があるんだね。",
      1: "特にないか。次は一つ意識してみよう。",
    },
    isObservation: false,
    timePreference: ["afternoon", "night"],
  },
  {
    id: "cat_outfit_6", category: "outfit", questionKind: "rotating",
    lens: "others_view",
    robotLine: "誰かに見られて意識した？",
    robotLineVariants: ["人の視線、気になった？", "見られてる感覚、あった？"],
    choices: [
      { value: 5, label: "意識して良い方に出た" },
      { value: 4, label: "少し意識した" },
      { value: 3, label: "特に気にしなかった" },
      { value: 2, label: "見られたくなかった" },
      { value: 1, label: "恥ずかしかった" },
    ],
    reactions: {
      5: "見られて良い方に出たなら、コーデ成功。",
      3: "気にしなかったなら、それも自然体の証。",
      1: "恥ずかしかったか。何が引っかかったか覚えておこう。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "public_private_gap", scoreMap: { 1: 0.1, 3: 0, 5: -0.06 } },
    ],
    timePreference: ["afternoon", "night"],
  },
  {
    id: "cat_outfit_7", category: "outfit", questionKind: "fixed",
    robotLine: "今日のコーデ、もう一回着たいと思う？",
    robotLineVariants: ["この組み合わせ、リピートあり？", "同じコーデ、またやりたい？"],
    choices: [
      { value: 5, label: "明日も着たい" },
      { value: 4, label: "また着る" },
      { value: 3, label: "まあ" },
      { value: 2, label: "しばらくいい" },
      { value: 1, label: "もう着ない" },
    ],
    reactions: {
      5: "リピートしたいコーデ、それが正解。",
      3: "まあまあなら、少し変えるとまた新鮮に。",
      1: "卒業か。その判断も大事なデータ。",
    },
    isObservation: false,
    timePreference: ["night"],
  },
  {
    id: "cat_outfit_8", category: "outfit", questionKind: "fixed",
    robotLine: "朝、コーデに迷った？",
    robotLineVariants: ["今朝の服選び、スムーズだった？", "朝、何着るか悩んだ？"],
    choices: [
      { value: 5, label: "即決だった" },
      { value: 4, label: "少し考えた" },
      { value: 3, label: "何着か迷った" },
      { value: 2, label: "かなり迷った" },
      { value: 1, label: "決められなかった" },
    ],
    reactions: {
      5: "即決できる日は調子いい。",
      3: "迷うのは選択肢がある証。悪くない。",
      1: "決められなかったか。ワードローブ整理してみる？",
    },
    isObservation: false,
    timePreference: ["morning", "afternoon"],
  },
  {
    id: "cat_outfit_9", category: "outfit", questionKind: "rotating",
    lens: "place_weather",
    similarGroup: "outfit_satisfaction",
    robotLine: "外に出てコーデ後悔した？",
    robotLineVariants: ["家を出てから、やっぱ違ったなって思った？", "外に出て服のチョイス、後悔しなかった？"],
    choices: [
      { value: 5, label: "全く後悔なし" },
      { value: 4, label: "ほぼ満足" },
      { value: 3, label: "少し後悔" },
      { value: 2, label: "けっこう後悔" },
      { value: 1, label: "完全に失敗" },
    ],
    reactions: {
      5: "後悔なしなら完璧。",
      3: "少しの後悔は次に活かせる。",
      1: "失敗日もデータ。何が原因か覚えておこう。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "function_vs_expression", scoreMap: { 1: -0.1, 3: 0, 5: 0.08 } },
    ],
    timePreference: ["afternoon", "night"],
  },
  {
    id: "cat_outfit_10", category: "outfit", questionKind: "fixed",
    lens: "place_weather",
    robotLine: "今日のコーデ、気温と合ってた？",
    robotLineVariants: ["服と天気、マッチしてた？", "気温的に今日の服、ちょうど良かった？"],
    choices: [
      { value: 5, label: "ぴったり" },
      { value: 4, label: "ほぼ合ってた" },
      { value: 3, label: "まあまあ" },
      { value: 2, label: "暑かった/寒かった" },
      { value: 1, label: "全然合わなかった" },
    ],
    reactions: {
      5: "気温と合ってるなら快適だったはず。",
      3: "まあまあなら十分。",
      1: "気温ミス、次は天気予報チェックしよう。",
    },
    isObservation: false,
    timePreference: ["afternoon", "night"],
  },
  {
    id: "cat_outfit_11", category: "outfit", questionKind: "rotating",
    lens: "energy",
    robotLine: "この服、どんな気分の日に着たくなる？",
    robotLineVariants: ["どんな日にこの服を選ぶ？", "この服が着たくなるのってどんな時？"],
    choices: [
      { value: 5, label: "気合を入れたい日" },
      { value: 4, label: "楽しい日" },
      { value: 3, label: "普通の日" },
      { value: 2, label: "疲れてる日" },
      { value: 1, label: "何も考えたくない日" },
    ],
    reactions: {
      5: "気合の一着なんだね。パターン覚えておく。",
      3: "デイリーコーデか。使い勝手がいいんだね。",
      1: "ノーガード用。それも大事なカテゴリ。",
    },
    isObservation: false,
    timePreference: ["night"],
  },
  {
    id: "cat_outfit_12", category: "outfit", questionKind: "rotating",
    lens: "repetition_pattern",
    robotLine: "次に同じ場面があったら、何を変える？",
    robotLineVariants: ["もう一回同じ日があったら、何変える？", "今日を振り返って、変えたい部分ある？"],
    choices: [
      { value: 5, label: "何も変えない" },
      { value: 4, label: "小物だけ変える" },
      { value: 3, label: "トップスかボトムスを変える" },
      { value: 2, label: "全体的に変える" },
      { value: 1, label: "完全に別のコーデにする" },
    ],
    reactions: {
      5: "完成形なんだ。勝ちパターン認定。",
      3: "一部変えるだけで印象変わるよ。",
      1: "全面変更か。今日の何が引っかかったか残しておく。",
    },
    isObservation: false,
    timePreference: ["night"],
  },

  // ────────────── care (追加8問) ──────────────
  {
    id: "cat_care_3", category: "care", questionKind: "fixed",
    robotLine: "最近、「本当はやりたいけど後回しにしてること」ある？",
    robotLineVariants: ["ずっと先延ばしにしてる自分へのケア、何かない？", "やろうと思ってるのに手をつけてないこと、ある？"],
    choices: [
      { value: 5, label: "特にない。やるべきことはやれてる" },
      { value: 4, label: "あるけど、タイミングを待ってる" },
      { value: 3, label: "あるけど、面倒で手をつけてない" },
      { value: 2, label: "ある。でも自分を責めたくない" },
      { value: 1, label: "あるけど、何から始めればいいかわからない" },
    ],
    reactions: {
      5: "やるべきことをこなせてる。その実行力のパターンを覚えておく。",
      4: "タイミング待ち。その『タイミング』が来ない可能性も視野に。",
      3: "面倒。でもその面倒の中に、本当は大事なものが混ざってないか。",
      2: "自分を責めない、という判断。それ自体がケアの一つ。",
      1: "最初の一歩が見えない。何が一番ハードルが低い？",
    },
    isObservation: false,
    timePreference: ["night"],
  },
  {
    id: "cat_care_4", category: "care", questionKind: "rotating",
    robotLine: "自分の調子が悪いとき、最初に崩れるのはどこ？",
    robotLineVariants: ["コンディションが落ちたとき、一番最初にサインが出るのは？", "調子悪いなって気づくきっかけ、何が多い？"],
    choices: [
      { value: 5, label: "睡眠の質が落ちる" },
      { value: 4, label: "身だしなみが雑になる" },
      { value: 3, label: "食事が適当になる" },
      { value: 2, label: "人と話すのが億劫になる" },
      { value: 1, label: "自分では気づけない" },
    ],
    reactions: {
      5: "睡眠がバロメーター。崩れる前の早期警戒システムだ。",
      4: "身だしなみに出る。外見が内面の鏡になってる。",
      3: "食事が乱れる。生存本能のレベルで余裕がなくなってる。",
      2: "社交が減る。エネルギーの優先順位が変わるんだね。",
      1: "気づけない。だからこそ、こうやって記録していく意味がある。",
    },
    isObservation: false,
    timePreference: ["night"],
  },
  {
    id: "cat_care_5", category: "care", questionKind: "rotating",
    lens: "place_weather",
    robotLine: "季節の変わり目、衣替えした？",
    robotLineVariants: ["衣替え、もう済ませた？", "クローゼットの入れ替え、やった？"],
    choices: [
      { value: 5, label: "済んだ" },
      { value: 3, label: "途中" },
      { value: 1, label: "まだ" },
    ],
    reactions: {
      5: "準備万端。",
      3: "少しずつ進めよう。",
      1: "次の休日にやろう。",
    },
    isObservation: false,
    timePreference: ["night"],
  },
  {
    id: "cat_care_6", category: "care", questionKind: "rotating",
    robotLine: "クローゼット、最近見直した？",
    robotLineVariants: ["ワードローブの整理、最近した？", "クローゼットの中、把握できてる？"],
    choices: [
      { value: 5, label: "最近整理した" },
      { value: 3, label: "しばらく見てない" },
      { value: 1, label: "カオス" },
    ],
    reactions: {
      5: "スッキリしてるなら選びやすいね。",
      3: "週末に15分だけ見てみよう。",
      1: "カオスか…一緒に整理する？",
    },
    isObservation: false,
    timePreference: ["night"],
  },
  {
    id: "cat_care_7", category: "care", questionKind: "rotating",
    robotLine: "型崩れや色落ちが気になるものある？",
    robotLineVariants: ["へたりや色あせが気になるアイテムは？", "傷みが出てきた服、ない？"],
    choices: [
      { value: 5, label: "ない" },
      { value: 3, label: "1〜2個ある" },
      { value: 1, label: "けっこうある" },
    ],
    reactions: {
      5: "状態良好。",
      3: "早めに対処すると長持ちするよ。",
      1: "まとめてメンテ日を作ろう。",
    },
    isObservation: false,
    timePreference: ["night"],
  },
  {
    id: "cat_care_8", category: "care", questionKind: "rotating",
    lens: "repetition_pattern",
    robotLine: "今週、何回洗濯した？",
    robotLineVariants: ["洗濯の頻度、今週どのくらい？", "今週の洗濯回数、覚えてる？"],
    choices: [
      { value: 5, label: "3回以上" },
      { value: 4, label: "2回" },
      { value: 3, label: "1回" },
      { value: 2, label: "まだしてない" },
      { value: 1, label: "覚えてない" },
    ],
    reactions: {
      5: "こまめだね。服が喜んでる。",
      3: "週1は最低ラインかな。",
      1: "忘れてるなら、リマインダー設定する？",
    },
    isObservation: false,
    timePreference: ["night"],
  },
  {
    id: "cat_care_9", category: "care", questionKind: "rotating",
    robotLine: "靴のケア、してる？",
    robotLineVariants: ["足元のお手入れ、できてる？", "靴の状態、最近チェックした？"],
    choices: [
      { value: 5, label: "定期的にしてる" },
      { value: 3, label: "たまにする" },
      { value: 1, label: "してない" },
    ],
    reactions: {
      5: "足元大事にしてるね。",
      3: "たまにでも偉い。",
      1: "靴は意外と見られてる。少しだけ手入れしよう。",
    },
    isObservation: false,
    timePreference: ["night"],
  },
  {
    id: "cat_care_10", category: "care", questionKind: "rotating",
    lens: "true_feeling",
    robotLine: "捨てるか迷ってるものある？",
    robotLineVariants: ["手放すか悩んでるアイテムある？", "処分するか迷ってる服、ない？"],
    choices: [
      { value: 5, label: "ない" },
      { value: 3, label: "1〜2個" },
      { value: 1, label: "けっこうある" },
    ],
    reactions: {
      5: "スッキリしてるね。",
      3: "迷ってるなら、一度着てみて決めよう。",
      1: "思い切りも大事。一つずつ向き合おう。",
    },
    isObservation: false,
    timePreference: ["night"],
  },

  // ────────────── preparation (追加8問) ──────────────
  {
    id: "cat_prep_3", category: "preparation", questionKind: "fixed",
    lens: "place_weather",
    robotLine: "準備するとき、「完璧にしたい」と「もういいや」の境界線はどこにある？",
    robotLineVariants: ["準備を切り上げるタイミング、何で決めてる？", "どこまで準備すれば『十分』と感じる？"],
    choices: [
      { value: 5, label: "納得いくまでやらないと気が済まない" },
      { value: 4, label: "8割できたら次に進む" },
      { value: 3, label: "そのときの気分で変わる" },
      { value: 2, label: "時間が来たら強制終了する" },
      { value: 1, label: "最低限で済ませたい" },
    ],
    reactions: {
      5: "完璧主義の傾向。それが安心をくれるけど、時間を奪うことも。",
      4: "8割で切れる。効率と品質のバランス感覚が優れてる。",
      3: "気分次第。つまり準備の基準が外ではなく内にある。",
      2: "時間で区切る。割り切りの強さがある。",
      1: "最低限主義。余白を残す生き方とも言える。",
    },
    isObservation: false,
    timePreference: ["night"],
  },
  {
    id: "cat_prep_4", category: "preparation", questionKind: "fixed",
    robotLine: "迷ったとき、「考え抜く」のと「直感で決める」の、どっちが多い？",
    robotLineVariants: ["判断に迷ったら、頭で考える？それとも感覚で動く？", "選択の場面で、論理と直感、どっちが勝つ？"],
    choices: [
      { value: 5, label: "ほぼ直感。考えすぎると迷うから" },
      { value: 4, label: "直感で仮決めして、あとで確認する" },
      { value: 3, label: "場面によって使い分けてる" },
      { value: 2, label: "できるだけ情報を集めてから決めたい" },
      { value: 1, label: "考え抜かないと不安で決められない" },
    ],
    reactions: {
      5: "直感型。その直感がどこから来てるのか、掘っていく。",
      4: "直感＋検証。バランスの取れた意思決定スタイル。",
      3: "使い分け。何が切り替えのトリガーになってるか、そこが面白い。",
      2: "情報重視。安心の土台が『知ること』にある。",
      1: "考え抜く。不安を潰すための行動。その不安の正体は何だろう。",
    },
    isObservation: false,
    timePreference: ["night"],
  },
  {
    id: "cat_prep_5", category: "preparation", questionKind: "rotating",
    robotLine: "明日の靴、決まってる？",
    robotLineVariants: ["足元のチョイス、もう決めた？", "明日履く靴、イメージある？"],
    choices: [
      { value: 5, label: "決まってる" },
      { value: 3, label: "まだ" },
      { value: 1, label: "靴で迷ってる" },
    ],
    reactions: {
      5: "足元が決まれば全体が決まる。",
      3: "コーデに合わせて決めよう。",
      1: "靴から逆算するのもアリだよ。",
    },
    isObservation: false,
    timePreference: ["night"],
  },
  {
    id: "cat_prep_6", category: "preparation", questionKind: "fixed",
    lens: "relational_distance",
    robotLine: "明日、誰に会う？",
    robotLineVariants: ["明日会う予定の人、いる？", "明日は誰と過ごす？"],
    choices: [
      { value: 5, label: "大事な人" },
      { value: 4, label: "友達" },
      { value: 3, label: "仕事の人" },
      { value: 2, label: "初対面" },
      { value: 1, label: "特に誰にも" },
    ],
    reactions: {
      5: "大事な人に会うなら、ちょっと気合入れよう。",
      3: "仕事なら、清潔感重視で。",
      1: "自分だけの日。リラックスコーデで。",
    },
    isObservation: false,
    timePreference: ["night"],
  },
  {
    id: "cat_prep_7", category: "preparation", questionKind: "fixed",
    robotLine: "明日、何時に家を出る？",
    robotLineVariants: ["明日の出発時間、決まった？", "何時ごろに出る予定？"],
    choices: [
      { value: 5, label: "早朝" },
      { value: 4, label: "午前中" },
      { value: 3, label: "午後" },
      { value: 2, label: "夕方" },
      { value: 1, label: "予定なし" },
    ],
    reactions: {
      5: "早いね。前夜に準備しておくのが吉。",
      3: "午後なら余裕あるね。",
      1: "家の日か。楽に過ごそう。",
    },
    isObservation: false,
    timePreference: ["night"],
  },
  {
    id: "cat_prep_8", category: "preparation", questionKind: "rotating",
    robotLine: "明日の自分に一言言うなら？",
    robotLineVariants: ["明日の自分への一言、何て言う？", "明日の自分にメッセージあるとしたら？"],
    choices: [
      { value: 5, label: "楽しんで" },
      { value: 4, label: "頑張れ" },
      { value: 3, label: "いつも通りで" },
      { value: 2, label: "無理しないで" },
      { value: 1, label: "早く終われ" },
    ],
    reactions: {
      5: "いいね、ポジティブな予感。",
      3: "いつも通りが一番。",
      1: "それでも朝は来る。少しでも楽にしよう。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "emotional_variability", scoreMap: { 1: -0.06, 3: 0, 5: 0.06 } },
    ],
    timePreference: ["night"],
  },
  {
    id: "cat_prep_9", category: "preparation", questionKind: "rotating",
    lens: "repetition_pattern",
    robotLine: "前回の失敗、繰り返さない準備はできた？",
    robotLineVariants: ["同じミスを避ける準備、した？", "前の反省、活かせそう？"],
    choices: [
      { value: 5, label: "対策済み" },
      { value: 3, label: "少し意識してる" },
      { value: 1, label: "何も変えてない" },
    ],
    reactions: {
      5: "学んでる。成長してる。",
      3: "意識するだけでも違う。",
      1: "同じ失敗は避けたい。一つだけ変えてみよう。",
    },
    isObservation: false,
    timePreference: ["night"],
  },
  {
    id: "cat_prep_10", category: "preparation", questionKind: "rotating",
    lens: "expectation_gap",
    robotLine: "明日のベストシナリオは？",
    robotLineVariants: ["明日うまくいったら、どんな感じ？", "最高の明日って、どんなイメージ？"],
    choices: [
      { value: 5, label: "全部うまくいく" },
      { value: 4, label: "まあまあ順調" },
      { value: 3, label: "普通にこなせればOK" },
      { value: 2, label: "乗り越えられれば御の字" },
      { value: 1, label: "考えたくない" },
    ],
    reactions: {
      5: "ポジティブな見通し。叶うといいね。",
      3: "普通にこなす、それが一番大事。",
      1: "考えたくない日もある。でも一つだけ準備しよう。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "emotional_variability", scoreMap: { 1: -0.08, 3: 0, 5: 0.06 } },
    ],
    timePreference: ["night"],
  },

  // ────────────── impression (追加9問) ──────────────
  {
    id: "cat_impression_4", category: "impression", questionKind: "rotating",
    lens: "others_view",
    similarGroup: "self_authenticity",
    robotLine: "今日、誰かに褒められたら嬉しいのと、自分で納得できてる方と、どっちが大きい？",
    robotLineVariants: ["他人からの評価と自分の手応え、今日はどっちが支えになってる？", "認められることと、自分で認めること、今日はどちらが強い？"],
    choices: [
      { value: 5, label: "自分の納得感が圧倒的に大きい" },
      { value: 4, label: "自分の手応えが主だけど、褒められたらもっと嬉しい" },
      { value: 3, label: "どちらも同じくらい" },
      { value: 2, label: "正直、人からの評価の方が気になる" },
      { value: 1, label: "誰かに認めてもらわないと不安" },
    ],
    reactions: {
      5: "内発的な基準で動けてる。それは揺るぎにくい。",
      4: "自分軸がベースにあるけど、承認も力になる。バランスがいい。",
      3: "半々。どちらかに偏る日とそうでない日、何が違うんだろう。",
      2: "他者の評価が気になる。その相手は誰で、なぜその人なのか。",
      1: "認められないと不安。その不安の底にあるものを、少しずつ見ていこう。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "public_private_gap", scoreMap: { 1: 0.15, 2: 0.08, 3: 0, 4: -0.04, 5: -0.08 } },
    ],
    timePreference: ["night"],
  },
  {
    id: "cat_impression_5", category: "impression", questionKind: "rotating",
    lens: "expectation_gap",
    similarGroup: "self_authenticity",
    robotLine: "「見られたかった自分」と「実際の自分」のズレは？",
    robotLineVariants: ["理想の自分と今日の自分、どれくらい近かった？", "なりたい自分と現実のギャップ、感じた？"],
    choices: [
      { value: 5, label: "ほぼ一致" },
      { value: 4, label: "少しだけズレ" },
      { value: 3, label: "わからない" },
      { value: 2, label: "けっこうズレてた" },
      { value: 1, label: "全然違った" },
    ],
    reactions: {
      5: "一致してるなら安定してる。",
      3: "わからないのも一つのデータ。",
      1: "ズレが大きい日。何がそうさせた？",
    },
    isObservation: true,
    axisMapping: [
      { axis: "public_private_gap", scoreMap: { 1: 0.12, 3: 0, 5: -0.08 } },
      { axis: "reassurance_need", scoreMap: { 1: 0.08, 3: 0, 5: -0.04 } },
    ],
    timePreference: ["night"],
  },
  {
    id: "cat_impression_6", category: "impression", questionKind: "rotating",
    requiresInteraction: true,
    similarGroup: "others_perception",
    robotLine: "周りの反応で気になったことは？",
    robotLineVariants: ["人からのリアクション、何かあった？", "周囲の反応で印象に残ったのは？"],
    choices: [
      { value: 5, label: "いい反応をもらえた" },
      { value: 4, label: "特に気にならなかった" },
      { value: 3, label: "少し気になった" },
      { value: 2, label: "ネガティブな反応があった" },
      { value: 1, label: "無視された/反応なし" },
    ],
    reactions: {
      5: "いい反応は自信につながる。",
      4: "気にならなかったなら安定してる。",
      1: "反応がないのも一つのメッセージ。気にしすぎないで。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "reassurance_need", scoreMap: { 1: 0.1, 3: 0, 5: -0.06 } },
    ],
    timePreference: ["afternoon", "night"],
  },
  {
    id: "cat_impression_7", category: "impression", questionKind: "rotating",
    requiresInteraction: true,
    robotLine: "今日、褒められた？",
    robotLineVariants: ["誰かにいいね、って言われた？", "褒め言葉、もらった？"],
    choices: [
      { value: 5, label: "何回か褒められた" },
      { value: 4, label: "一回褒められた" },
      { value: 3, label: "覚えてない" },
      { value: 2, label: "褒められなかった" },
      { value: 1, label: "否定的なことを言われた" },
    ],
    reactions: {
      5: "複数回褒められたか。いい日だね。",
      3: "覚えてないなら、次は意識してみて。",
      1: "否定的なこと、引きずらないで。でも記録はしておく。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "reassurance_need", scoreMap: { 1: 0.08, 3: 0, 5: -0.06 } },
    ],
    timePreference: ["afternoon", "night"],
  },
  {
    id: "cat_impression_8", category: "impression", questionKind: "rotating",
    lens: "true_feeling",
    similarGroup: "mood_eval",
    robotLine: "今日の自分を一言で表すと？",
    robotLineVariants: ["一言で今日を振り返ると？", "今日の自分、キーワードで言うと？"],
    choices: [
      { value: 5, label: "充実してた" },
      { value: 4, label: "穏やかだった" },
      { value: 3, label: "ふつうだった" },
      { value: 2, label: "もやもやした" },
      { value: 1, label: "消耗した" },
    ],
    reactions: {
      5: "充実感、いいね。この感覚を覚えておこう。",
      3: "ふつうの日も積み重ねの一部。",
      1: "消耗した日。ちゃんと回復しよう。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "emotional_variability", scoreMap: { 1: -0.1, 3: 0, 5: 0.08 } },
    ],
    timePreference: ["night"],
  },
  {
    id: "cat_impression_9", category: "impression", questionKind: "rotating",
    lens: "expectation_gap",
    robotLine: "「もっとこう見せたかった」はある？",
    robotLineVariants: ["もうちょっとこうだったらな、ってある？", "理想と違った部分、ある？"],
    choices: [
      { value: 5, label: "ない、満足" },
      { value: 4, label: "少しだけ" },
      { value: 3, label: "わからない" },
      { value: 2, label: "けっこうある" },
      { value: 1, label: "全然ダメだった" },
    ],
    reactions: {
      5: "満足できた日。パターンを覚えておく。",
      3: "わからないなら、理想像を少し考えてみよう。",
      1: "ギャップが大きかったか。次に活かす材料にしよう。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "public_private_gap", scoreMap: { 1: 0.1, 3: 0, 5: -0.06 } },
    ],
    timePreference: ["night"],
  },
  {
    id: "cat_impression_10", category: "impression", questionKind: "rotating",
    lens: "energy",
    robotLine: "帰り際の自分は、朝と変わってた？",
    robotLineVariants: ["朝と今の自分、変化あった？", "一日の始まりと終わりで自分、違う？"],
    choices: [
      { value: 5, label: "元気になってた" },
      { value: 4, label: "変わらなかった" },
      { value: 3, label: "少し疲れた" },
      { value: 2, label: "けっこう消耗した" },
      { value: 1, label: "別人のように疲れた" },
    ],
    reactions: {
      5: "エネルギーが増えた日。いい環境だったんだね。",
      4: "変わらないなら安定してる。",
      1: "大きく消耗したか。回復の時間を取ろう。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "emotional_regulation", scoreMap: { 1: -0.1, 3: -0.03, 5: 0.06 } },
    ],
    timePreference: ["night"],
  },
  {
    id: "cat_impression_11", category: "impression", questionKind: "rotating",
    robotLine: "今日の表情、どうだった？",
    robotLineVariants: ["今日一日、どんな顔してた？", "表情、柔らかかった？"],
    choices: [
      { value: 5, label: "よく笑ってた" },
      { value: 4, label: "穏やかだった" },
      { value: 3, label: "ふつう" },
      { value: 2, label: "硬かったかも" },
      { value: 1, label: "暗かったと思う" },
    ],
    reactions: {
      5: "笑顔が多い日は周りにも伝わるよ。",
      3: "ふつうの表情も立派なデータ。",
      1: "暗かったか。表情は心の鏡。無理しなくていいよ。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "emotional_variability", scoreMap: { 1: -0.08, 3: 0, 5: 0.06 } },
    ],
    timePreference: ["afternoon", "night"],
  },
  {
    id: "cat_impression_12", category: "impression", questionKind: "anomaly",
    robotLine: "今日、一番自分らしかった瞬間は？",
    robotLineVariants: ["素の自分が出せた瞬間、いつ？", "一番ナチュラルでいられたのはいつ？"],
    choices: [
      { value: 5, label: "ずっと自分だった" },
      { value: 4, label: "リラックスしてた時" },
      { value: 3, label: "一人の時" },
      { value: 2, label: "仕事してた時" },
      { value: 1, label: "自分らしい瞬間がなかった" },
    ],
    reactions: {
      5: "一日中自分でいられた。理想的。",
      3: "一人の時が自分らしいか。大事にしよう。",
      1: "自分らしさが出せなかった日。何が邪魔した？",
    },
    isObservation: true,
    axisMapping: [
      { axis: "public_private_gap", scoreMap: { 1: 0.12, 3: 0.04, 5: -0.06 } },
    ],
    timePreference: ["night"],
  },

  // ────────────── MORNING: preparation ──────────────
  {
    id: "cat_prep_m1", category: "preparation", questionKind: "fixed",
    robotLine: "今日の予定、ざっくりどんな感じ？",
    robotLineVariants: ["今日はどんな一日になりそう？", "今日のスケジュール、ざっくり教えて？"],
    choices: [
      { value: 5, label: "仕事中心" },
      { value: 4, label: "人と会う" },
      { value: 3, label: "自由な日" },
      { value: 2, label: "まだ白紙" },
      { value: 1, label: "考えたくない" },
    ],
    reactions: {
      5: "仕事モードか。切り替えていこう。",
      3: "自由な日。何に使う？",
      1: "考えたくない日もある。それでいい。",
    },
    isObservation: false,
    timePreference: ["morning"],
  },
  {
    id: "cat_prep_m2", category: "preparation", questionKind: "fixed",
    robotLine: "服装の方向性、もう決まった？",
    robotLineVariants: ["今日の服、方向性見えてる？", "着ていく服のイメージ、固まった？"],
    choices: [
      { value: 5, label: "完璧に決めた" },
      { value: 4, label: "だいたい決めた" },
      { value: 3, label: "迷ってる" },
      { value: 2, label: "これから" },
      { value: 1, label: "何でもいい" },
    ],
    reactions: {
      5: "完璧。自信ある朝だ。",
      3: "迷いは選択肢がある証。",
      1: "何でもいい日もある。",
    },
    isObservation: false,
    timePreference: ["morning"],
  },
  {
    id: "cat_prep_m3", category: "preparation", questionKind: "rotating",
    lens: "energy",
    robotLine: "今日、気合を入れたい場面ある？",
    robotLineVariants: ["勝負の場面、今日はある？", "ちょっと張り切りたいシーンある？"],
    choices: [
      { value: 5, label: "ある、準備した" },
      { value: 4, label: "少しある" },
      { value: 3, label: "特にない" },
      { value: 2, label: "力抜きたい" },
      { value: 1, label: "考えてない" },
    ],
    reactions: {
      5: "準備してるのはいい。きっと上手くいく。",
      2: "力を抜く日も大事。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "emotional_variability", scoreMap: { 1: -0.05, 3: 0, 5: 0.08 } },
    ],
    timePreference: ["morning"],
  },
  {
    id: "cat_prep_m4", category: "preparation", questionKind: "fixed",
    robotLine: "出かける前の自分、今どんな気分？",
    robotLineVariants: ["家を出る前の今の気持ちは？", "出発前の気分、どう？"],
    choices: [
      { value: 5, label: "やる気十分" },
      { value: 4, label: "まあまあ" },
      { value: 3, label: "ふつう" },
      { value: 2, label: "ちょっと重い" },
      { value: 1, label: "起きたくない" },
    ],
    reactions: {
      5: "やる気十分。いい朝だ。",
      3: "ふつうは安定の証。",
      1: "起きたくなかったか。…それでも起きた。偉い。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "emotional_variability", scoreMap: { 1: -0.1, 2: -0.05, 3: 0, 4: 0.05, 5: 0.1 } },
      { axis: "emotional_regulation", scoreMap: { 1: -0.06, 3: 0, 5: 0.06 } },
    ],
    timePreference: ["morning"],
  },
  {
    id: "cat_prep_m5", category: "preparation", questionKind: "rotating",
    robotLine: "朝の余裕、ある？",
    robotLineVariants: ["今朝はゆとりある？", "時間的な余裕、どう？"],
    choices: [
      { value: 5, label: "余裕たっぷり" },
      { value: 4, label: "普通" },
      { value: 3, label: "ギリギリ" },
      { value: 2, label: "遅刻しそう" },
      { value: 1, label: "もう遅刻" },
    ],
    reactions: {
      5: "余裕のある朝。理想だ。",
      1: "…急ごう。",
    },
    isObservation: false,
    timePreference: ["morning"],
  },
  {
    id: "cat_prep_m6", category: "preparation", questionKind: "rotating",
    lens: "repetition_pattern",
    robotLine: "昨日の反省、今日に活かせそう？",
    robotLineVariants: ["昨日の学び、今日に使える？", "昨日気づいたこと、活かせる？"],
    choices: [
      { value: 5, label: "はい、活かす" },
      { value: 4, label: "少し意識する" },
      { value: 3, label: "特にない" },
      { value: 2, label: "忘れた" },
      { value: 1, label: "反省点がない" },
    ],
    reactions: {
      5: "昨日から学べる人は強い。",
      2: "忘れた？ それもまた人間。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "emotional_regulation", scoreMap: { 1: 0, 2: -0.03, 5: 0.06 } },
    ],
    timePreference: ["morning"],
  },
  {
    id: "cat_prep_m7", category: "preparation", questionKind: "fixed",
    lens: "energy",
    robotLine: "今日一日のテーマ、一言で言うと？",
    robotLineVariants: ["今日の自分のキーワード、何？", "今日をひと言で表すなら？"],
    choices: [
      { value: 5, label: "チャレンジ" },
      { value: 4, label: "安定" },
      { value: 3, label: "回復" },
      { value: 2, label: "義務" },
      { value: 1, label: "まだわからない" },
    ],
    reactions: {
      5: "チャレンジの日。記録しておく。",
      3: "回復は前進の一部。",
      1: "わからないまま始まる日も、悪くない。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "emotional_variability", scoreMap: { 1: -0.03, 3: 0.02, 5: 0.08 } },
    ],
    timePreference: ["morning"],
  },
  {
    id: "cat_prep_m8", category: "preparation", questionKind: "rotating",
    robotLine: "今日のバッグ、何持ってく？",
    robotLineVariants: ["バッグ、決まった？", "荷物、どのくらい持ってく？"],
    choices: [
      { value: 5, label: "ちゃんとしたバッグ" },
      { value: 4, label: "いつもの" },
      { value: 3, label: "最小限" },
      { value: 2, label: "まだ決めてない" },
      { value: 1, label: "手ぶら" },
    ],
    reactions: {
      5: "しっかり準備してるね。",
      1: "手ぶら。身軽でいい。",
    },
    isObservation: false,
    timePreference: ["morning"],
  },

  // ────────────── MORNING: outfit ──────────────
  {
    id: "cat_outfit_m1", category: "outfit", questionKind: "fixed",
    robotLine: "今日のコーデ、何を基準に選んだ？",
    robotLineVariants: ["今日の服選び、何がポイントだった？", "今朝の服、何で決めた？"],
    choices: [
      { value: 5, label: "予定に合わせた" },
      { value: 4, label: "気分で" },
      { value: 3, label: "天気で" },
      { value: 2, label: "時間なくて適当" },
      { value: 1, label: "昨日決めてた" },
    ],
    reactions: {
      5: "予定に合わせる戦略的選択。",
      4: "気分で選ぶのは直感力。",
      2: "時間がなかったか。でもちゃんと着て出た。",
    },
    isObservation: false,
    timePreference: ["morning"],
  },
  {
    id: "cat_outfit_m2", category: "outfit", questionKind: "fixed",
    robotLine: "鏡見て、しっくり来た？",
    robotLineVariants: ["鏡チェック、納得いった？", "自分を見て、いい感じだった？"],
    choices: [
      { value: 5, label: "ばっちり" },
      { value: 4, label: "まあまあ" },
      { value: 3, label: "微妙" },
      { value: 2, label: "見てない" },
      { value: 1, label: "着替え直した" },
    ],
    reactions: {
      5: "ばっちりなら最高の朝。",
      3: "微妙か。何が引っかかった？",
      1: "着替え直すのは妥協しないってこと。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "function_vs_expression", scoreMap: { 1: 0.08, 3: 0, 5: 0.05 } },
      { axis: "public_private_gap", scoreMap: { 2: -0.05, 5: 0.05 } },
    ],
    timePreference: ["morning"],
  },
  {
    id: "cat_outfit_m3", category: "outfit", questionKind: "rotating",
    robotLine: "今日の自分、何色が気分？",
    robotLineVariants: ["今日の気分を色にすると？", "今日は何色の日？"],
    choices: [
      { value: 5, label: "明るい色" },
      { value: 4, label: "落ち着いた色" },
      { value: 3, label: "モノトーン" },
      { value: 2, label: "気にしてない" },
      { value: 1, label: "色より形" },
    ],
    reactions: {
      5: "明るい色。気分も明るいんだな。",
      3: "モノトーン。安定の選択。",
    },
    isObservation: false,
    timePreference: ["morning", "afternoon"],
  },
  {
    id: "cat_outfit_m4", category: "outfit", questionKind: "rotating",
    lens: "place_weather",
    robotLine: "アウター、迷わなかった？",
    robotLineVariants: ["上着、すんなり決まった？", "羽織もの、どうした？"],
    choices: [
      { value: 5, label: "即決" },
      { value: 4, label: "少し考えた" },
      { value: 3, label: "迷った" },
      { value: 2, label: "何回も着替えた" },
      { value: 1, label: "結局なしで出た" },
    ],
    reactions: {
      5: "即決。自分のスタイルが固まってる。",
      1: "アウターなし。攻めたな。",
    },
    isObservation: false,
    timePreference: ["morning"],
  },

  // ────────────── MORNING: impression ──────────────
  {
    id: "cat_impression_m1", category: "impression", questionKind: "fixed",
    robotLine: "今日の自分のテンション、どのくらい？",
    robotLineVariants: ["今朝のテンション、どう？", "今の気分の温度、どのくらい？"],
    choices: [
      { value: 5, label: "高い" },
      { value: 4, label: "やや高い" },
      { value: 3, label: "ふつう" },
      { value: 2, label: "やや低い" },
      { value: 1, label: "低い" },
    ],
    reactions: {
      5: "テンション高い。いい朝。",
      3: "ふつう。安定してる。",
      1: "テンション低いか。…記録した。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "emotional_variability", scoreMap: { 1: -0.1, 2: -0.05, 3: 0, 4: 0.05, 5: 0.1 } },
    ],
    timePreference: ["morning"],
  },
  {
    id: "cat_impression_m2", category: "impression", questionKind: "rotating",
    lens: "others_view",
    robotLine: "今日、誰かに会ったらどう見られたい？",
    robotLineVariants: ["今日の印象戦略、ある？", "人に会うとしたら、どんな自分でいたい？"],
    choices: [
      { value: 5, label: "頼れる感じ" },
      { value: 4, label: "親しみやすく" },
      { value: 3, label: "自然体" },
      { value: 2, label: "あまり目立ちたくない" },
      { value: 1, label: "考えてない" },
    ],
    reactions: {
      5: "頼れる感じを目指す日。記録。",
      3: "自然体。最高の印象戦略。",
      1: "考えてないか。それも自然体。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "public_private_gap", scoreMap: { 1: -0.05, 3: 0.03, 5: 0.08 } },
      { axis: "reassurance_need", scoreMap: { 2: 0.05, 5: -0.03 } },
    ],
    timePreference: ["morning"],
  },
  {
    id: "cat_impression_m3", category: "impression", questionKind: "fixed",
    robotLine: "朝の自分、元気度は？",
    robotLineVariants: ["今朝のコンディション、どう？", "起きた時の元気レベルは？"],
    choices: [
      { value: 5, label: "絶好調" },
      { value: 4, label: "まあまあ" },
      { value: 3, label: "ふつう" },
      { value: 2, label: "眠い" },
      { value: 1, label: "起きてるだけ偉い" },
    ],
    reactions: {
      5: "絶好調。記録した。",
      1: "起きてるだけ偉い。同意する。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "emotional_regulation", scoreMap: { 1: -0.06, 3: 0, 5: 0.06 } },
    ],
    timePreference: ["morning"],
  },
  {
    id: "cat_impression_m4", category: "impression", questionKind: "rotating",
    lens: "true_feeling",
    robotLine: "今日、自分らしくいられそう？",
    robotLineVariants: ["素のままで過ごせそう？", "今日は自然体でいけそう？"],
    choices: [
      { value: 5, label: "きっとできる" },
      { value: 4, label: "たぶん" },
      { value: 3, label: "わからない" },
      { value: 2, label: "少し不安" },
      { value: 1, label: "無理かも" },
    ],
    reactions: {
      5: "自信がある朝。いいな。",
      3: "わからないか。一日の終わりに聞くよ。",
      1: "無理かもと思ってるんだ。…観測続ける。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "public_private_gap", scoreMap: { 1: 0.1, 3: 0, 5: -0.06 } },
    ],
    timePreference: ["morning"],
  },

  // ────────────── AFTERNOON: impression ──────────────
  {
    id: "cat_impression_a1", category: "impression", questionKind: "fixed",
    robotLine: "午前中、どうだった？",
    robotLineVariants: ["午前の調子はどうだった？", "ここまでの半日、振り返ってみてどう？"],
    choices: [
      { value: 5, label: "すごく良かった" },
      { value: 4, label: "まあまあ" },
      { value: 3, label: "ふつう" },
      { value: 2, label: "ちょっと疲れた" },
      { value: 1, label: "大変だった" },
    ],
    reactions: {
      5: "すごく良い午前。何があった？",
      3: "ふつうの午前。安定。",
      1: "大変だったか。午後は巻き返せるかな。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "emotional_variability", scoreMap: { 1: -0.08, 3: 0, 5: 0.08 } },
    ],
    timePreference: ["afternoon"],
  },
  {
    id: "cat_impression_a2", category: "impression", questionKind: "rotating",
    lens: "true_feeling",
    robotLine: "午前の自分、自然でいられた？",
    robotLineVariants: ["午前中、素の自分でいれた？", "ここまで無理してない？"],
    choices: [
      { value: 5, label: "全然自然" },
      { value: 4, label: "だいたい" },
      { value: 3, label: "少し無理した" },
      { value: 2, label: "けっこう合わせた" },
      { value: 1, label: "ずっと演じてた" },
    ],
    reactions: {
      5: "自然体でいられたか。それがいい。",
      1: "演じてたか。…何が演じさせた？",
    },
    isObservation: true,
    axisMapping: [
      { axis: "public_private_gap", scoreMap: { 1: 0.12, 3: 0.04, 5: -0.06 } },
    ],
    timePreference: ["afternoon"],
  },
  {
    id: "cat_impression_a3", category: "impression", questionKind: "rotating",
    robotLine: "昼の気分、朝と変わった？",
    robotLineVariants: ["朝と比べて今の気分、どう？", "午前中で気分に変化あった？"],
    choices: [
      { value: 5, label: "良くなった" },
      { value: 4, label: "変わらない" },
      { value: 3, label: "少し下がった" },
      { value: 2, label: "かなり変わった" },
      { value: 1, label: "覚えてない" },
    ],
    reactions: {
      5: "朝より良くなったか。何が効いた？",
      4: "変わらない。安定してる。",
      2: "かなり変わったか。何があった？",
    },
    isObservation: true,
    axisMapping: [
      { axis: "emotional_variability", scoreMap: { 1: 0, 2: 0.08, 3: -0.04, 5: 0.04 } },
    ],
    timePreference: ["afternoon"],
  },
  {
    id: "cat_impression_a4", category: "impression", questionKind: "fixed",
    lens: "energy",
    robotLine: "今の自分のエネルギー残量は？",
    robotLineVariants: ["バッテリー残量、どのくらい？", "今のエネルギーレベルは？"],
    choices: [
      { value: 5, label: "まだ十分" },
      { value: 4, label: "半分くらい" },
      { value: 3, label: "少し減ってきた" },
      { value: 2, label: "かなり減った" },
      { value: 1, label: "空っぽ" },
    ],
    reactions: {
      5: "まだ十分か。夕方も期待。",
      3: "減ってきたか。ペース配分大事。",
      1: "空っぽか。…今日の夜、ゆっくり聞くよ。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "emotional_regulation", scoreMap: { 1: -0.08, 3: -0.03, 5: 0.06 } },
    ],
    timePreference: ["afternoon"],
  },

  // ────────────── AFTERNOON: outfit ──────────────
  {
    id: "cat_outfit_a1", category: "outfit", questionKind: "fixed",
    robotLine: "今のコーデ、午後も行ける？",
    robotLineVariants: ["今の服、午後もいける感じ？", "コーデ、後半戦も大丈夫そう？"],
    choices: [
      { value: 5, label: "まだまだ快適" },
      { value: 4, label: "まあ大丈夫" },
      { value: 3, label: "ちょっと直したい" },
      { value: 2, label: "着替えたい" },
      { value: 1, label: "もう限界" },
    ],
    reactions: {
      5: "快適が続いてる。いいコーデだったな。",
      1: "限界か。何が辛い？",
    },
    isObservation: false,
    timePreference: ["afternoon"],
  },
  {
    id: "cat_outfit_a2", category: "outfit", questionKind: "rotating",
    lens: "others_view", requiresInteraction: true,
    robotLine: "午前中、コーデ褒められた？",
    robotLineVariants: ["今日の服、誰かに反応もらった？", "コーデについて何か言われた？"],
    choices: [
      { value: 5, label: "褒められた" },
      { value: 4, label: "反応あった" },
      { value: 3, label: "特になし" },
      { value: 2, label: "わからない" },
      { value: 1, label: "誰にも会ってない" },
    ],
    reactions: {
      5: "褒められた。どこが刺さった？",
      3: "反応なしか。でも自分が気に入ってればいい。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "reassurance_need", scoreMap: { 1: 0, 3: -0.03, 5: 0.06 } },
    ],
    timePreference: ["afternoon"],
  },
  {
    id: "cat_outfit_a3", category: "outfit", questionKind: "rotating",
    robotLine: "今日の靴、足疲れてない？",
    robotLineVariants: ["足元、大丈夫？", "靴のコンディション、どう？"],
    choices: [
      { value: 5, label: "全然平気" },
      { value: 4, label: "まだ大丈夫" },
      { value: 3, label: "少し疲れてきた" },
      { value: 2, label: "けっこう辛い" },
      { value: 1, label: "脱ぎたい" },
    ],
    reactions: {
      5: "靴は快適が正義。",
      1: "脱ぎたいか。次回の靴選び、記録しておく。",
    },
    isObservation: false,
    timePreference: ["afternoon"],
  },

  // ────────────── AFTERNOON: partner ──────────────
  {
    id: "cat_partner_a1", category: "partner", questionKind: "fixed",
    requiresInteraction: true,
    robotLine: "午前中の人間関係、スムーズだった？",
    robotLineVariants: ["午前中、人との関わりはどうだった？", "ここまでの対人関係、順調だった？"],
    choices: [
      { value: 5, label: "すごくスムーズ" },
      { value: 4, label: "まあまあ" },
      { value: 3, label: "ふつう" },
      { value: 2, label: "少し引っかかった" },
      { value: 1, label: "疲れた" },
    ],
    reactions: {
      5: "スムーズ。いい流れだ。",
      2: "引っかかりがあったか。何だろう。",
      1: "人間関係に疲れた日。…夜に聞くよ。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "intimacy_pace", scoreMap: { 1: -0.06, 3: 0, 5: 0.06 } },
      { axis: "boundary_awareness", scoreMap: { 1: -0.05, 5: 0.05 } },
    ],
    timePreference: ["afternoon"],
  },
  {
    id: "cat_partner_a2", category: "partner", questionKind: "rotating",
    requiresInteraction: true,
    robotLine: "ランチ、誰と食べた？",
    robotLineVariants: ["お昼、誰かと一緒だった？", "昼ごはん、どんな感じだった？"],
    choices: [
      { value: 5, label: "気の合う人と" },
      { value: 4, label: "仕事仲間と" },
      { value: 3, label: "一人で" },
      { value: 2, label: "まだ食べてない" },
      { value: 1, label: "スキップ" },
    ],
    reactions: {
      5: "気の合う人と。いいランチだね。",
      3: "一人ランチ。それも大事な時間。",
      1: "スキップか。…午後ちゃんと食べてね。",
    },
    isObservation: false,
    timePreference: ["afternoon"],
  },

  // ────────────── NIGHT: impression (夜の振り返り用) ──────────────
  {
    id: "cat_impression_n1", category: "impression", questionKind: "fixed",
    similarGroup: "mood_eval",
    robotLine: "今日一日を一言で表すと？",
    robotLineVariants: ["今日を振り返って、一言どう？", "今日の一日、総合的にどうだった？"],
    choices: [
      { value: 5, label: "最高だった" },
      { value: 4, label: "いい日だった" },
      { value: 3, label: "まあまあ" },
      { value: 2, label: "微妙だった" },
      { value: 1, label: "しんどかった" },
    ],
    reactions: {
      5: "最高の日。何が良かったか、覚えておこう。",
      3: "まあまあの日。それが普通で、それでいい。",
      1: "しんどかったね。今日はゆっくり休んで。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "emotional_variability", scoreMap: { 1: 0.1, 2: 0.05, 3: 0, 4: -0.03, 5: -0.08 } },
    ],
    timePreference: ["night"],
  },
  {
    id: "cat_impression_n2", category: "impression", questionKind: "rotating",
    robotLine: "今日、一番エネルギーを使ったのは何だった？",
    robotLineVariants: ["一番体力を使ったのは何？", "エネルギーの使い道、何が一番大きかった？"],
    choices: [
      { value: 5, label: "楽しいことに使えた" },
      { value: 4, label: "仕事・作業に集中した" },
      { value: 3, label: "人付き合いに" },
      { value: 2, label: "気を遣うことに" },
      { value: 1, label: "我慢に" },
    ],
    reactions: {
      5: "楽しいことにエネルギー使えたなら、いい一日。",
      3: "人付き合いにエネルギー使ったんだ。充電しよう。",
      1: "我慢にエネルギー使うのは消耗する。パターン観測しておく。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "emotional_regulation", scoreMap: { 1: 0.1, 2: 0.06, 3: 0, 4: -0.04, 5: -0.08 } },
      { axis: "stress_isolation_vs_social", scoreMap: { 3: 0.05, 4: 0, 5: -0.05 } },
    ],
    timePreference: ["night"],
  },
  {
    id: "cat_impression_n3", category: "impression", questionKind: "rotating",
    robotLine: "明日の自分に、今日の自分から一言あるとしたら？",
    robotLineVariants: ["今日の自分から明日の自分へメッセージ、ある？", "明日の自分に伝えたいこと、何かある？"],
    choices: [
      { value: 5, label: "この調子でいこう" },
      { value: 4, label: "もう少しゆっくりでいい" },
      { value: 3, label: "特にない" },
      { value: 2, label: "もう少し素直になろう" },
      { value: 1, label: "無理しないで" },
    ],
    reactions: {
      5: "前向きなメッセージだね。明日も楽しみ。",
      3: "特にないのも、穏やかな証拠。",
      1: "今日頑張りすぎたんだね。明日はペース落としていいよ。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "public_private_gap", scoreMap: { 1: 0.08, 2: 0.04, 3: 0, 4: -0.03, 5: -0.06 } },
    ],
    timePreference: ["night"],
  },
  {
    id: "cat_impression_n4", category: "impression", questionKind: "rotating",
    robotLine: "今日、自分で自分を褒められることある？",
    robotLineVariants: ["今日の自分、褒めポイントある？", "自分に「よくやった」って言えること、ある？"],
    choices: [
      { value: 5, label: "いくつもある" },
      { value: 4, label: "一つある" },
      { value: 3, label: "うーん…" },
      { value: 2, label: "特に思いつかない" },
      { value: 1, label: "むしろ反省したい" },
    ],
    reactions: {
      5: "自分を褒められるの、大事な力。",
      3: "すぐに出てこなくても、振り返ると見つかるもの。",
      1: "反省も大事だけど、責めすぎないで。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "reassurance_need", scoreMap: { 1: 0.08, 2: 0.04, 3: 0.02, 4: -0.04, 5: -0.08 } },
    ],
    timePreference: ["night"],
  },

  // ────────────── SOLO DAY: partner 代替質問（一人で過ごした日用） ──────────────
  // requiresInteraction なしなので、誰とも会わなかった日にも出せる
  {
    id: "cat_partner_solo_1", category: "partner", questionKind: "rotating",
    similarGroup: "solo_state",
    robotLine: "今日、誰かのことが頭に浮かんだ？",
    robotLineVariants: ["ふと誰かを思い出した？", "頭に浮かんだ人、いた？"],
    choices: [
      { value: 5, label: "特定の人が浮かんだ" },
      { value: 4, label: "少し気になる人がいた" },
      { value: 3, label: "ぼんやりと" },
      { value: 2, label: "あまり浮かばなかった" },
      { value: 1, label: "全く浮かばなかった" },
    ],
    reactions: {
      5: "気になる人がいるんだね。その感覚、残しておく。",
      3: "ぼんやり浮かぶ人って、意外と大事な存在かも。",
      1: "一人で完結できる日。それも強さだよ。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "intimacy_pace", scoreMap: { 1: -0.1, 3: 0, 5: 0.1 } },
      { axis: "reassurance_need", scoreMap: { 1: -0.08, 3: 0, 5: 0.06 } },
    ],
    timePreference: ["afternoon", "night"],
  },
  {
    id: "cat_partner_solo_2", category: "partner", questionKind: "rotating",
    similarGroup: "solo_state",
    robotLine: "一人の時間、今日はどうだった？",
    robotLineVariants: ["今日のソロタイム、どうだった？", "自分だけの時間、楽しめた？"],
    choices: [
      { value: 5, label: "充実してた" },
      { value: 4, label: "まあ良かった" },
      { value: 3, label: "ふつう" },
      { value: 2, label: "少し寂しかった" },
      { value: 1, label: "けっこう寂しかった" },
    ],
    reactions: {
      5: "充実した一人時間は最高のリチャージ。",
      3: "ふつうの一人時間。穏やかだったんだね。",
      1: "寂しかったんだね。その感覚、ちゃんと観測してる。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "stress_isolation_vs_social", scoreMap: { 1: 0.12, 2: 0.06, 3: 0, 4: -0.06, 5: -0.1 } },
      { axis: "intimacy_pace", scoreMap: { 1: 0.08, 2: 0.04, 3: 0, 4: -0.04, 5: -0.08 } },
    ],
    timePreference: ["afternoon", "night"],
  },
  {
    id: "cat_partner_solo_3", category: "partner", questionKind: "rotating",
    robotLine: "今日、連絡したいけどしなかった人いる？",
    robotLineVariants: ["メッセージ送ろうか迷った人いる？", "連絡しようか悩んだ人、いた？"],
    choices: [
      { value: 5, label: "いない" },
      { value: 4, label: "少し迷った人がいた" },
      { value: 3, label: "いるけどまだいいかな" },
      { value: 2, label: "いる、でもためらった" },
      { value: 1, label: "いるけど連絡できなかった" },
    ],
    reactions: {
      5: "自分で完結できてるね。",
      3: "迷う距離感って、関係を大事にしてる証拠。",
      1: "ためらいの裏に、大事な気持ちがあるかもね。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "boundary_awareness", scoreMap: { 1: 0.08, 3: 0, 5: -0.05 } },
      { axis: "direct_vs_diplomatic", scoreMap: { 1: 0.06, 3: 0, 5: -0.04 } },
    ],
    timePreference: ["night"],
  },
  {
    id: "cat_partner_solo_4", category: "partner", questionKind: "rotating",
    similarGroup: "solo_state",
    robotLine: "人と会いたい気持ち、今日はどれくらい？",
    robotLineVariants: ["誰かに会いたい欲、今日はどう？", "人恋しさ、感じた？"],
    choices: [
      { value: 5, label: "全然いらない" },
      { value: 4, label: "一人で十分" },
      { value: 3, label: "どっちでもいい" },
      { value: 2, label: "少し会いたいかも" },
      { value: 1, label: "かなり会いたい" },
    ],
    reactions: {
      5: "完全に一人モードだね。自分の時間を楽しんで。",
      3: "どっちでもいい時って、実は一番正直な日。",
      1: "会いたい気持ちがあるなら、素直に動いてもいいかも。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "stress_isolation_vs_social", scoreMap: { 1: 0.15, 2: 0.08, 3: 0, 4: -0.06, 5: -0.12 } },
    ],
    timePreference: ["afternoon", "night"],
  },
  {
    id: "cat_partner_solo_5", category: "partner", questionKind: "rotating",
    robotLine: "今日、自分自身との対話はあった？",
    robotLineVariants: ["自分の内面と向き合う時間あった？", "心の中で考え事する時間、あった？"],
    choices: [
      { value: 5, label: "静かに考え事した" },
      { value: 4, label: "少しだけ内省した" },
      { value: 3, label: "特に意識しなかった" },
      { value: 2, label: "考える余裕がなかった" },
      { value: 1, label: "何も浮かばなかった" },
    ],
    reactions: {
      5: "内なる対話は、自分を深く知る一番の方法。",
      4: "少しでも振り返れたなら、それだけで十分。",
      3: "それも一つのモード。無理に内省しなくていい。",
      2: "余裕がない日ほど、後から振り返ると気づきがある。",
      1: "そういう日もある。ただ、ここに来たこと自体が対話だよ。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "emotional_regulation", scoreMap: { 1: -0.08, 2: -0.04, 3: 0, 4: 0.06, 5: 0.1 } },
    ],
    timePreference: ["afternoon", "night"],
  },
  {
    id: "cat_partner_solo_6", category: "partner", questionKind: "rotating",
    robotLine: "一人でいて一番心地よかった瞬間は？",
    robotLineVariants: ["一人の時間で一番良かった瞬間は？", "自分だけの時間で、心地よかったのはいつ？"],
    choices: [
      { value: 5, label: "好きなことに没頭した時" },
      { value: 4, label: "ぼーっとしてた時" },
      { value: 3, label: "特に覚えてない" },
      { value: 2, label: "一人が少し落ち着かなかった" },
      { value: 1, label: "一人が辛かった" },
    ],
    reactions: {
      5: "没頭できる時間は最高の一人時間。",
      4: "ぼーっとできるのも才能。リセットされてるよ。",
      3: "意識しなくても、身体は休めてたかもね。",
      2: "落ち着かなさの裏に、求めてるものが見える。",
      1: "辛さを感じられること自体、自分に正直な証拠。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "independence_vs_harmony", scoreMap: { 1: -0.12, 2: -0.06, 3: 0, 4: 0.06, 5: 0.1 } },
    ],
    timePreference: ["afternoon", "night"],
  },
  {
    id: "cat_partner_solo_7", category: "partner", questionKind: "rotating",
    robotLine: "今日、無意識にやっていた行動は？",
    robotLineVariants: ["気づいたらやってたこと、ある？", "無意識の行動パターン、今日はどうだった？"],
    choices: [
      { value: 5, label: "SNSをずっと見てた" },
      { value: 4, label: "同じ曲をリピートしてた" },
      { value: 3, label: "特に思い当たらない" },
      { value: 2, label: "何度もため息をついてた" },
      { value: 1, label: "食べすぎ・飲みすぎてた" },
    ],
    reactions: {
      5: "無意識のSNSは、何かを探してるサインかも。",
      4: "リピートする曲には、今の気分が映ってる。",
      3: "気づかないほど自然だったのかもね。",
      2: "ため息は身体のリセット機能。悪いことじゃない。",
      1: "身体が何かを埋めようとしてたのかも。観測しておく。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "public_private_gap", scoreMap: { 1: 0.1, 2: 0.06, 3: 0, 4: -0.04, 5: 0.08 } },
    ],
    timePreference: ["afternoon", "night"],
  },
  {
    id: "cat_partner_solo_8", category: "partner", questionKind: "rotating",
    robotLine: "自分の中で、今日一番大きかった感情は？",
    robotLineVariants: ["今日、一番強く感じた気持ちは？", "心の中で一番大きかった感情って何？"],
    choices: [
      { value: 5, label: "穏やかさ・安心" },
      { value: 4, label: "期待・ワクワク" },
      { value: 3, label: "特になし・平坦" },
      { value: 2, label: "不安・焦り" },
      { value: 1, label: "怒り・苛立ち" },
    ],
    reactions: {
      5: "穏やかでいられた日。その条件、覚えておこう。",
      4: "ワクワクのエネルギーは明日にも続くよ。",
      3: "平坦な日も大事なデータ。波がない日の自分を知る。",
      2: "不安や焦りの正体、少しずつ見えてくるはず。",
      1: "苛立ちの裏には、大事にしたいものが隠れてる。",
    },
    isObservation: true,
    axisMapping: [
      { axis: "emotional_variability", scoreMap: { 1: 0.12, 2: 0.08, 3: -0.04, 4: 0.06, 5: -0.06 } },
    ],
    timePreference: ["afternoon", "night"],
  },

  // ────────────── AFTERNOON: preparation ──────────────
  {
    id: "cat_prep_a1", category: "preparation", questionKind: "fixed",
    robotLine: "午後の予定、見通し立ってる？",
    robotLineVariants: ["午後のスケジュール、見えてる？", "残りの予定、把握できてる？"],
    choices: [
      { value: 5, label: "完璧" },
      { value: 4, label: "だいたい" },
      { value: 3, label: "まだ不明" },
      { value: 2, label: "予定変わった" },
      { value: 1, label: "何もない" },
    ],
    reactions: {
      5: "完璧。午後も順調に。",
      2: "予定変わったか。柔軟に対応しよう。",
      1: "何もないなら自分の時間。",
    },
    isObservation: false,
    timePreference: ["afternoon"],
  },
];

/* ═══════════════════════════════════════════════
   Question Selection
   ═══════════════════════════════════════════════ */

/**
 * 時間帯 + コンテキスト + 履歴を考慮して質問を選択
 * @param maxCount 出す質問数 (default 2)
 */
export function selectDailyQuestions(
  timeOfDay: TimeOfDay,
  dayContext: DayContext,
  recentQuestionIds: string[],
  maxCount: number = 2,
): CategoryQuestion[] {
  const priorityCategories = TIME_PRIORITY[timeOfDay];
  const selected: CategoryQuestion[] = [];
  const usedCategories = new Set<ConversationCategory>();

  /** コンテキストに合わない質問を除外するフィルタ */
  const isContextValid = (q: CategoryQuestion): boolean => {
    if (q.requiresDate && !dayContext.hadDate) return false;
    if (q.requiresInteraction && !dayContext.hadPeople && !dayContext.hadDate) return false;
    if (q.requiresOutfitSelected && !dayContext.hasOutfitToday) return false;
    return true;
  };

  // Step 1: コンテキスト条件で強制追加 (最大1問)
  // hadDate のみ強制。hadPeople は Step 2 の通常カテゴリ選出に任せる（偏り防止）
  if (dayContext.hadDate) {
    const dateQ = CATEGORY_QUESTIONS.find(
      (q) => q.id === "cat_partner_2" && !recentQuestionIds.includes(q.id)
    );
    if (dateQ) {
      selected.push(dateQ);
      usedCategories.add("partner");
    }
  }

  // Step 2: 時間帯優先カテゴリから残り枠を埋める
  for (const category of priorityCategories) {
    if (selected.length >= maxCount) break;
    if (usedCategories.has(category)) continue;

    // このカテゴリの候補を取得 (7日間の重複回避 + コンテキストフィルタ)
    const candidates = CATEGORY_QUESTIONS.filter(
      (q) =>
        q.category === category &&
        !recentQuestionIds.includes(q.id) &&
        isContextValid(q)
    );

    if (candidates.length > 0) {
      // 時間帯優先度が高いものを優先
      const matched = candidates.find((c) =>
        c.timePreference.includes(timeOfDay)
      );
      selected.push(matched ?? candidates[0]);
      usedCategories.add(category);
    }
  }

  // Step 3: まだ枠が余っている場合、残りカテゴリから（時間帯マッチ優先）
  if (selected.length < maxCount) {
    const remaining = CATEGORY_QUESTIONS.filter(
      (q) =>
        !usedCategories.has(q.category) &&
        !recentQuestionIds.includes(q.id) &&
        q.timePreference.includes(timeOfDay) &&
        isContextValid(q)
    );
    for (const q of remaining) {
      if (selected.length >= maxCount) break;
      if (!usedCategories.has(q.category)) {
        selected.push(q);
        usedCategories.add(q.category);
      }
    }
  }

  // Step 4: 安全弁 — まだ足りない場合 timePreference を無視して未使用質問から補充
  if (selected.length < maxCount) {
    const selectedIds = new Set(selected.map((s) => s.id));
    const fallback = CATEGORY_QUESTIONS.filter(
      (q) =>
        !selectedIds.has(q.id) &&
        !recentQuestionIds.includes(q.id) &&
        isContextValid(q)
    );
    // カテゴリ多様性を優先
    for (const q of fallback) {
      if (selected.length >= maxCount) break;
      if (!usedCategories.has(q.category)) {
        selected.push(q);
        usedCategories.add(q.category);
      }
    }
    // それでもまだ足りなければカテゴリ重複を許可
    for (const q of fallback) {
      if (selected.length >= maxCount) break;
      if (!selectedIds.has(q.id) && !selected.some((s) => s.id === q.id)) {
        selected.push(q);
      }
    }
  }

  return selected;
}

/**
 * カテゴリ質問をIDで取得
 */
export function getCategoryQuestion(id: string): CategoryQuestion | undefined {
  return CATEGORY_QUESTIONS.find((q) => q.id === id);
}

/**
 * すべてのカテゴリ質問を取得
 */
export function getAllCategoryQuestions(): CategoryQuestion[] {
  return [...CATEGORY_QUESTIONS];
}

/**
 * カテゴリ別に質問を取得
 */
export function getQuestionsByCategory(category: ConversationCategory): CategoryQuestion[] {
  return CATEGORY_QUESTIONS.filter((q) => q.category === category);
}

/**
 * 観測系のカテゴリかどうか
 */
export function isObservationCategory(category: ConversationCategory): boolean {
  return category === "partner" || category === "outfit" || category === "impression";
}

/**
 * 回答値からブランチを判定
 */
export function classifyAnswerBranch(value: number, isAnomaly?: boolean): AnswerBranch {
  if (isAnomaly) return "anomaly_probe";
  if (value >= 4) return "reproduction";
  if (value <= 2) return "cause_drill";
  return "angle_change";
}

/**
 * questionKind を取得 (undefined = "fixed")
 */
export function getQuestionKind(q: CategoryQuestion): QuestionKind {
  return q.questionKind ?? "fixed";
}

/**
 * 日付シードで robotLine または robotLineVariants からテキストを選択。
 * 同じ日には同じバリアントが返り、日が変わると別のバリアントになる。
 */
export function getQuestionText(q: CategoryQuestion): string {
  const variants = q.robotLineVariants;
  if (!variants || variants.length === 0) return q.robotLine;

  // 日付ベースのシード: YYYYMMDD + question id をハッシュ化
  const now = new Date();
  const dateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const seed = hashString(`${dateKey}_${q.id}`);

  // オリジナル + バリアントの全候補から選択
  const candidates = [q.robotLine, ...variants];
  const index = ((seed % candidates.length) + candidates.length) % candidates.length;
  return candidates[index];
}

/** 簡易文字列ハッシュ (djb2) */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
