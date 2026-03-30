/**
 * DeepExplorationFlow 全8フェーズの質問・選択肢データ
 *
 * v2: 探索軸ごとに具体的・感覚的な質問セットを用意
 *     getAxisQuestions(axis) で軸別の質問を取得可能
 */

import type { ExplorationAxis } from "./types";

/* ─── 共通型 ─── */

export type QuestionOption = {
  id: string;
  label: string;
  icon: string;
};

export type SelectQuestion = {
  id: string;
  question: string;
  type: "select";
  options: QuestionOption[];
};

export type MultiSelectQuestion = {
  id: string;
  question: string;
  type: "multi_select";
  options: QuestionOption[];
};

export type ShortTextQuestion = {
  id: string;
  question: string;
  type: "short_text";
  placeholder: string;
};

export type FlowQuestion = SelectQuestion | MultiSelectQuestion | ShortTextQuestion;

/* ─── フェーズ1: 対象断片の選択 ─── */

export const PHASE1_COPY = {
  heading: "どの記憶を掘りますか？",
  sub: "タイムライン上の断片を選ぶか、新しい時期を探します",
  deepDiveIntro: "この時期を、もう少し具体的に辿ってみますか？",
  deepDiveAlt: "この断片の奥にある、日々の動きや気持ちを探りますか？",
  newExplorationIntro: "新しい時期の記憶を探索します",
} as const;

/* ─── フェーズ2: 回想ハンドル ─── */

export const PHASE2_COPY = {
  heading: "思い出す入口を選んでください",
  sub: "この時期を思い出すとき、いちばん近い入口はどれですか？",
} as const;

/* ─── フェーズ3: 生活骨格質問 ─── */

export const PHASE3_COPY = {
  heading: "その頃の1日を辿ります",
  sub: "事件ではなく、繰り返していた日常から記憶を立ち上げます",
} as const;

/* ─── フェーズ4: 事実確認 ─── */

export const PHASE4_COPY = {
  heading: "その頃に起きていたこと",
  sub: "実際に何があったかを、少しずつ辿ります",
} as const;

/* ─── フェーズ5: 内面・緊張の掘り起こし ─── */

export const PHASE5_COPY = {
  heading: "その時の内側",
  sub: "事実の奥にある気持ちを探ります",
} as const;

/* =====================================================================
 * 軸別質問セット
 * ===================================================================== */

type AxisQuestionSet = {
  dailyStructure: SelectQuestion[];
  factGathering: FlowQuestion[];
  innerState: FlowQuestion[];
};

/* ─── place: 場所から辿る ─── */

const PLACE_DAILY: SelectQuestion[] = [
  {
    id: "place_first_impression",
    question: "その場所に初めて行ったとき、何を感じた？",
    type: "select",
    options: [
      { id: "wide", label: "思ったより広かった", icon: "🏟️" },
      { id: "smell", label: "独特な匂いがした", icon: "👃" },
      { id: "noisy", label: "音が印象的だった", icon: "🔊" },
      { id: "cold", label: "空気が冷たかった（暗かった）", icon: "🌫️" },
      { id: "warm", label: "温かくて安心した", icon: "🌤️" },
    ],
  },
  {
    id: "place_smell",
    question: "その場所で何の匂いがした？",
    type: "select",
    options: [
      { id: "food", label: "ごはん・調理の匂い", icon: "🍳" },
      { id: "earth", label: "土や草の匂い", icon: "🌱" },
      { id: "chemical", label: "薬品・洗剤の匂い", icon: "🧪" },
      { id: "old", label: "古い紙・木の匂い", icon: "📚" },
      { id: "none", label: "特に覚えていない", icon: "🤷" },
    ],
  },
  {
    id: "place_fixed_seat",
    question: "その場所での定位置はどこだった？",
    type: "select",
    options: [
      { id: "corner", label: "隅っこ・端の席", icon: "📐" },
      { id: "center", label: "真ん中あたり", icon: "🎯" },
      { id: "window", label: "窓際", icon: "🪟" },
      { id: "back", label: "奥・後ろの方", icon: "🚪" },
      { id: "no_fixed", label: "決まっていなかった", icon: "🔀" },
    ],
  },
  {
    id: "place_sound",
    question: "その場所で聞こえていた音は？",
    type: "select",
    options: [
      { id: "voices", label: "誰かの話し声・笑い声", icon: "🗣️" },
      { id: "machine", label: "機械音・空調の音", icon: "⚙️" },
      { id: "music", label: "音楽が流れていた", icon: "🎵" },
      { id: "silence", label: "ほぼ静かだった", icon: "🤫" },
      { id: "nature", label: "風・雨・虫の声", icon: "🍃" },
    ],
  },
  {
    id: "place_leaving",
    question: "その場所を出るとき、どんな感覚だった？",
    type: "select",
    options: [
      { id: "relief", label: "やっと出られるという解放感", icon: "😮‍💨" },
      { id: "reluctant", label: "もう少しいたかった", icon: "😢" },
      { id: "hurry", label: "急いで出ていた", icon: "🏃" },
      { id: "nothing", label: "何も感じずに出ていた", icon: "🚶" },
      { id: "routine", label: "帰る時間が決まっていた", icon: "⏰" },
    ],
  },
];

const PLACE_FACTS: FlowQuestion[] = [
  {
    id: "place_route",
    question: "その場所への行き方を覚えてる？ 何を通って着いた？",
    type: "short_text",
    placeholder: "例：坂道を登って、自動ドアを押して…",
  },
  {
    id: "place_forbidden",
    question: "その場所で「入っちゃいけない」「触っちゃいけない」エリアはあった？",
    type: "select",
    options: [
      { id: "yes_room", label: "ある部屋がそうだった", icon: "🚫" },
      { id: "yes_area", label: "ある区域に近づけなかった", icon: "⛔" },
      { id: "no", label: "特になかった", icon: "🆓" },
      { id: "sneaked", label: "こっそり入ったことがある", icon: "🤭" },
    ],
  },
  {
    id: "place_weather",
    question: "その場所を思い出すとき、天気は晴れ？ 曇り？ 雨？",
    type: "short_text",
    placeholder: "例：いつも夕方で曇っていた気がする",
  },
];

const PLACE_INNER: FlowQuestion[] = [
  {
    id: "place_body_feeling",
    question: "その場所に入ったとき、体はどうなっていた？",
    type: "select",
    options: [
      { id: "tension", label: "肩に力が入っていた", icon: "💪" },
      { id: "relaxed", label: "体がゆるんでいた", icon: "🧘" },
      { id: "small", label: "小さくなろうとしていた", icon: "🐚" },
      { id: "alert", label: "周りを警戒していた", icon: "👀" },
      { id: "unaware", label: "考えたことがない", icon: "🤔" },
    ],
  },
  {
    id: "place_secret_spot",
    question: "その場所の中に、自分だけの「逃げ場」はあった？",
    type: "select",
    options: [
      { id: "toilet", label: "トイレ", icon: "🚻" },
      { id: "outdoor", label: "外や屋上", icon: "🏞️" },
      { id: "hidden", label: "人に見つかりにくい場所", icon: "🫣" },
      { id: "none", label: "逃げ場はなかった", icon: "🔒" },
      { id: "didnt_need", label: "逃げる必要がなかった", icon: "🍀" },
    ],
  },
  {
    id: "place_now_visit",
    question: "もし今その場所に戻ったら、どうなると思う？",
    type: "select",
    options: [
      { id: "nostalgic", label: "懐かしくなる", icon: "🥹" },
      { id: "heavy", label: "息苦しくなりそう", icon: "😣" },
      { id: "nothing", label: "もう何も感じなさそう", icon: "😐" },
      { id: "curious", label: "少し怖いけど見てみたい", icon: "👁️" },
    ],
  },
  {
    id: "place_one_scene",
    question: "その場所で、今もふと浮かぶ一場面があれば教えて",
    type: "short_text",
    placeholder: "例：窓から見えた夕焼け、廊下の足音…",
  },
];

/* ─── person: 人から辿る ─── */

const PERSON_DAILY: SelectQuestion[] = [
  {
    id: "person_voice",
    question: "その人の声のトーンを覚えてる？",
    type: "select",
    options: [
      { id: "loud", label: "大きくてよく通る声", icon: "📢" },
      { id: "soft", label: "静かで落ち着いた声", icon: "🤫" },
      { id: "sharp", label: "鋭い・早口な声", icon: "⚡" },
      { id: "warm", label: "柔らかくて温かい声", icon: "☀️" },
      { id: "forget", label: "声は思い出せない", icon: "🫥" },
    ],
  },
  {
    id: "person_anger",
    question: "その人が怒るとき、あなたはどうなった？",
    type: "select",
    options: [
      { id: "freeze", label: "固まった", icon: "🧊" },
      { id: "apology", label: "すぐ謝った", icon: "🙇" },
      { id: "escape", label: "その場から離れた", icon: "🚪" },
      { id: "fight", label: "言い返した", icon: "🔥" },
      { id: "never_angry", label: "怒ることがなかった", icon: "🕊️" },
    ],
  },
  {
    id: "person_last_meeting",
    question: "その人に最後に会ったとき、何を着ていた？",
    type: "select",
    options: [
      { id: "formal", label: "きちんとした服", icon: "👔" },
      { id: "casual", label: "いつもの格好", icon: "👕" },
      { id: "uniform", label: "制服・作業着", icon: "🥋" },
      { id: "sick", label: "パジャマ・寝間着", icon: "🛏️" },
      { id: "forget", label: "覚えていない", icon: "❓" },
    ],
  },
  {
    id: "person_habit",
    question: "その人の癖や口癖で覚えてるものは？",
    type: "select",
    options: [
      { id: "gesture", label: "特定の仕草があった", icon: "🤲" },
      { id: "phrase", label: "よく言う言葉があった", icon: "💬" },
      { id: "laugh", label: "笑い方が独特だった", icon: "😆" },
      { id: "silence", label: "黙ることが多かった", icon: "🤐" },
      { id: "none", label: "特に思い出せない", icon: "🤷" },
    ],
  },
  {
    id: "person_distance",
    question: "その人との物理的な距離はどれくらいだった？",
    type: "select",
    options: [
      { id: "close", label: "触れるくらい近かった", icon: "🤝" },
      { id: "normal", label: "普通の会話距離", icon: "👫" },
      { id: "far", label: "少し離れていた", icon: "↔️" },
      { id: "same_space", label: "同じ空間にいるだけ", icon: "🏠" },
      { id: "rare", label: "めったに会わなかった", icon: "🌙" },
    ],
  },
];

const PERSON_FACTS: FlowQuestion[] = [
  {
    id: "person_first_meeting",
    question: "その人と最初に会ったときの場面を覚えてる？",
    type: "short_text",
    placeholder: "例：教室で隣の席だった、親に連れられて…",
  },
  {
    id: "person_shared_time",
    question: "その人と一番長く過ごした時間帯は？",
    type: "select",
    options: [
      { id: "morning", label: "朝〜午前中", icon: "🌅" },
      { id: "afternoon", label: "昼〜夕方", icon: "☀️" },
      { id: "evening", label: "夜", icon: "🌆" },
      { id: "irregular", label: "不規則だった", icon: "🔀" },
    ],
  },
  {
    id: "person_topic",
    question: "その人とよく話していた内容は？",
    type: "short_text",
    placeholder: "例：くだらない話、愚痴、将来のこと…",
  },
];

const PERSON_INNER: FlowQuestion[] = [
  {
    id: "person_before_meeting",
    question: "その人に会う直前、あなたの体はどうなっていた？",
    type: "select",
    options: [
      { id: "light", label: "足取りが軽くなった", icon: "🏃" },
      { id: "heavy", label: "少し構えていた", icon: "🛡️" },
      { id: "nothing", label: "何も変わらなかった", icon: "🚶" },
      { id: "nervous", label: "心臓がドキドキした", icon: "💓" },
      { id: "check", label: "身だしなみを気にした", icon: "🪞" },
    ],
  },
  {
    id: "person_couldnt_show",
    question: "その人の前で見せられなかった自分は？",
    type: "select",
    options: [
      { id: "weak", label: "弱い部分", icon: "🥀" },
      { id: "angry", label: "怒り・不満", icon: "🔥" },
      { id: "real_opinion", label: "本当の考え", icon: "💭" },
      { id: "all_ok", label: "だいたい見せていた", icon: "🌈" },
      { id: "dont_know", label: "よくわからない", icon: "🤔" },
    ],
  },
  {
    id: "person_after_gone",
    question: "その人がいなくなった後、最初に感じたのは？",
    type: "select",
    options: [
      { id: "empty", label: "ぽっかり穴が空いた", icon: "🕳️" },
      { id: "relief", label: "正直ほっとした", icon: "😮‍💨" },
      { id: "angry", label: "怒りが湧いた", icon: "😤" },
      { id: "numb", label: "何も感じなかった", icon: "😶" },
      { id: "still_here", label: "まだ近くにいる", icon: "👤" },
    ],
  },
  {
    id: "person_unsaid",
    question: "その人に今も伝えられていない一言があるとしたら？",
    type: "short_text",
    placeholder: "例：ありがとう、ごめん、本当はずっと…",
  },
];

/* ─── daily_flow: 1日の流れから辿る ─── */

const DAILY_FLOW_DAILY: SelectQuestion[] = [
  {
    id: "daily_first_sight",
    question: "朝起きて最初に見えたものは？",
    type: "select",
    options: [
      { id: "ceiling", label: "天井", icon: "🔲" },
      { id: "window", label: "窓の外の光", icon: "🪟" },
      { id: "clock", label: "時計", icon: "⏰" },
      { id: "phone", label: "携帯・アラーム", icon: "📱" },
      { id: "person", label: "誰かの顔", icon: "👤" },
    ],
  },
  {
    id: "daily_lunch_with",
    question: "お昼ごはんは誰と食べていた？",
    type: "select",
    options: [
      { id: "alone", label: "一人で", icon: "🍱" },
      { id: "group", label: "グループで", icon: "👥" },
      { id: "one_person", label: "決まった一人と", icon: "👫" },
      { id: "varies", label: "日によって違った", icon: "🔀" },
      { id: "skipped", label: "食べないことが多かった", icon: "⏭️" },
    ],
  },
  {
    id: "daily_commute_thought",
    question: "帰り道で何を考えていた？",
    type: "select",
    options: [
      { id: "replay", label: "今日あったことの振り返り", icon: "🔁" },
      { id: "tomorrow", label: "明日のことが気になっていた", icon: "📅" },
      { id: "escape", label: "好きなことの妄想", icon: "💭" },
      { id: "nothing", label: "何も考えず歩いていた", icon: "🚶" },
      { id: "music", label: "音楽を聴いて遮断していた", icon: "🎧" },
    ],
  },
  {
    id: "daily_peak_energy",
    question: "1日の中でいちばん元気だった時間は？",
    type: "select",
    options: [
      { id: "early", label: "朝いちばん", icon: "🌅" },
      { id: "midday", label: "昼前後", icon: "☀️" },
      { id: "after_school", label: "放課後・退勤後", icon: "🏃" },
      { id: "night", label: "夜", icon: "🌙" },
      { id: "never", label: "ずっと低空飛行だった", icon: "😮‍💨" },
    ],
  },
  {
    id: "daily_before_sleep",
    question: "寝る直前、何をしていた？",
    type: "select",
    options: [
      { id: "phone", label: "携帯・スマホをいじっていた", icon: "📱" },
      { id: "tv", label: "テレビ・動画を見ていた", icon: "📺" },
      { id: "book", label: "本を読んでいた", icon: "📖" },
      { id: "think", label: "布団の中で考え事をしていた", icon: "💭" },
      { id: "instant", label: "すぐ寝落ちしていた", icon: "😴" },
    ],
  },
];

const DAILY_FLOW_FACTS: FlowQuestion[] = [
  {
    id: "daily_repeat",
    question: "その頃、毎日の中で繰り返していたことは？",
    type: "short_text",
    placeholder: "例：朝練、通学、塾、ゲーム...",
  },
  {
    id: "daily_time_warp",
    question: "「時間が過ぎるのが早い」と感じていた時間帯は？",
    type: "select",
    options: [
      { id: "fun_time", label: "好きなことをしている時", icon: "⚡" },
      { id: "busy_time", label: "忙しくて余裕がない時", icon: "🏃" },
      { id: "none", label: "全部遅かった", icon: "🐢" },
      { id: "all_fast", label: "全部早かった", icon: "🚀" },
    ],
  },
  {
    id: "daily_secret_routine",
    question: "誰にも言っていなかった、自分だけのルーティンは？",
    type: "short_text",
    placeholder: "例：帰りにコンビニに寄る、夜中にラジオを聴く…",
  },
];

const DAILY_FLOW_INNER: FlowQuestion[] = [
  {
    id: "daily_morning_body",
    question: "朝、体はすぐに動けた？",
    type: "select",
    options: [
      { id: "quick", label: "パッと起きていた", icon: "⚡" },
      { id: "slow", label: "なかなか布団から出られなかった", icon: "🛏️" },
      { id: "forced", label: "無理やり起きていた", icon: "😣" },
      { id: "alarm", label: "アラーム何回も鳴らしていた", icon: "📢" },
    ],
  },
  {
    id: "daily_tension_moment",
    question: "1日の中で「ここを越えれば大丈夫」というポイントはあった？",
    type: "select",
    options: [
      { id: "first_hour", label: "最初の1時間", icon: "🏁" },
      { id: "specific_class", label: "特定の授業・会議", icon: "📋" },
      { id: "lunchtime", label: "お昼の時間", icon: "🍽️" },
      { id: "no_peak", label: "ずっと均一な緊張だった", icon: "📊" },
      { id: "none", label: "特に緊張はなかった", icon: "🍀" },
    ],
  },
  {
    id: "daily_alone_relief",
    question: "一人になれた瞬間に、最初にしていたことは？",
    type: "select",
    options: [
      { id: "sigh", label: "ため息をついていた", icon: "😮‍💨" },
      { id: "music", label: "好きな音楽を聴いた", icon: "🎧" },
      { id: "snack", label: "何か食べていた", icon: "🍫" },
      { id: "phone", label: "携帯をいじっていた", icon: "📱" },
      { id: "nothing", label: "ぼーっとしていた", icon: "🌫️" },
    ],
  },
  {
    id: "daily_wish",
    question: "あの頃の1日を一つだけ変えられるとしたら、何を変える？",
    type: "short_text",
    placeholder: "例：もっと早く帰りたかった、あの時間がもっと長ければ…",
  },
];

/* ─── belongings: 持ち物から辿る ─── */

const BELONGINGS_DAILY: SelectQuestion[] = [
  {
    id: "belong_bag_contents",
    question: "その頃のカバンの中身で、いつも入っていたものは？",
    type: "select",
    options: [
      { id: "music", label: "音楽プレーヤー・イヤホン", icon: "🎧" },
      { id: "book", label: "本・漫画", icon: "📚" },
      { id: "snack", label: "お菓子・飲み物", icon: "🍬" },
      { id: "charm", label: "お守り・ぬいぐるみ", icon: "🧸" },
      { id: "notebook", label: "ノート・手帳", icon: "📒" },
    ],
  },
  {
    id: "belong_treasure",
    question: "一番大事にしていたものは？",
    type: "select",
    options: [
      { id: "gift", label: "誰かにもらったもの", icon: "🎁" },
      { id: "saved", label: "自分で貯めて買ったもの", icon: "💰" },
      { id: "handmade", label: "手作りのもの", icon: "✂️" },
      { id: "inherited", label: "受け継いだもの", icon: "🏺" },
      { id: "cheap", label: "安いけど気に入っていたもの", icon: "✨" },
    ],
  },
  {
    id: "belong_lost",
    question: "それを手放したのはいつ？",
    type: "select",
    options: [
      { id: "broke", label: "壊れた・なくした", icon: "💔" },
      { id: "outgrew", label: "卒業して自然に離れた", icon: "🎓" },
      { id: "thrown", label: "誰かに捨てられた", icon: "🗑️" },
      { id: "gave_away", label: "自分で手放した", icon: "🤲" },
      { id: "still_have", label: "まだ持っている", icon: "🏠" },
    ],
  },
  {
    id: "belong_clothing",
    question: "その頃、よく着ていた服のイメージは？",
    type: "select",
    options: [
      { id: "uniform", label: "制服・決められた服", icon: "🥋" },
      { id: "dark", label: "暗い色が多かった", icon: "🖤" },
      { id: "bright", label: "明るい色が多かった", icon: "🌈" },
      { id: "loose", label: "だぼっとしたもの", icon: "🧥" },
      { id: "tight", label: "体にフィットするもの", icon: "👔" },
    ],
  },
  {
    id: "belong_device",
    question: "一番触っていた「道具」は？",
    type: "select",
    options: [
      { id: "phone", label: "携帯・スマホ", icon: "📱" },
      { id: "game", label: "ゲーム機", icon: "🎮" },
      { id: "instrument", label: "楽器", icon: "🎸" },
      { id: "pen", label: "ペン・鉛筆", icon: "✏️" },
      { id: "ball", label: "ボール・スポーツ用具", icon: "⚽" },
    ],
  },
];

const BELONGINGS_FACTS: FlowQuestion[] = [
  {
    id: "belong_where_kept",
    question: "一番大事なものは、どこに置いていた？",
    type: "short_text",
    placeholder: "例：枕元、カバンのポケットの奥、引き出しの中…",
  },
  {
    id: "belong_broken_story",
    question: "壊れた・なくした思い出の物はある？ 何が起きた？",
    type: "short_text",
    placeholder: "例：友達に踏まれた、引っ越しでなくなった…",
  },
  {
    id: "belong_money",
    question: "その頃のお小遣いや収入はどれくらいだった？",
    type: "select",
    options: [
      { id: "none", label: "ほぼなかった", icon: "0️⃣" },
      { id: "little", label: "少しだけあった", icon: "🪙" },
      { id: "enough", label: "欲しいものは買えた", icon: "💵" },
      { id: "worked", label: "自分で稼いでいた", icon: "💼" },
    ],
  },
];

const BELONGINGS_INNER: FlowQuestion[] = [
  {
    id: "belong_attachment",
    question: "なぜそれが大事だったと思う？",
    type: "select",
    options: [
      { id: "identity", label: "自分らしさの証だった", icon: "🪪" },
      { id: "connection", label: "誰かとのつながりだった", icon: "🔗" },
      { id: "escape", label: "逃げ場だった", icon: "🏝️" },
      { id: "proof", label: "頑張った証拠だった", icon: "🏅" },
      { id: "comfort", label: "触ると安心した", icon: "🧸" },
    ],
  },
  {
    id: "belong_without",
    question: "それがなくなったとき、代わりに何が来た？",
    type: "select",
    options: [
      { id: "new_thing", label: "新しいものを手に入れた", icon: "🆕" },
      { id: "nothing", label: "何も来なかった", icon: "🕳️" },
      { id: "person", label: "人でその穴を埋めた", icon: "👤" },
      { id: "habit", label: "新しい習慣ができた", icon: "🔁" },
      { id: "forgot", label: "覚えていない", icon: "🤷" },
    ],
  },
  {
    id: "belong_touch",
    question: "その物を手に持ったときの感触を覚えてる？",
    type: "select",
    options: [
      { id: "warm", label: "温かかった", icon: "☀️" },
      { id: "smooth", label: "つるつるしていた", icon: "✨" },
      { id: "rough", label: "ざらざら・ごつごつ", icon: "🪨" },
      { id: "soft", label: "やわらかかった", icon: "☁️" },
      { id: "heavy", label: "ずっしり重かった", icon: "⚓" },
    ],
  },
  {
    id: "belong_if_now",
    question: "今その物が目の前にあったら、何を思う？",
    type: "short_text",
    placeholder: "例：あの頃に戻りたい、もう必要ない、泣きそう…",
  },
];

/* ─── difference: 今との差から辿る ─── */

const DIFFERENCE_DAILY: SelectQuestion[] = [
  {
    id: "diff_meet_past",
    question: "今の自分が当時の自分に会ったら、最初に何をする？",
    type: "select",
    options: [
      { id: "hug", label: "抱きしめる", icon: "🤗" },
      { id: "warn", label: "「気をつけて」と言う", icon: "⚠️" },
      { id: "watch", label: "黙って見守る", icon: "👁️" },
      { id: "laugh", label: "笑ってしまう", icon: "😂" },
      { id: "cry", label: "泣いてしまうかも", icon: "😢" },
    ],
  },
  {
    id: "diff_gained_skill",
    question: "あの頃できなくて今できることは？",
    type: "select",
    options: [
      { id: "refuse", label: "断ること", icon: "🚫" },
      { id: "alone", label: "一人でいること", icon: "🧘" },
      { id: "express", label: "自分を言葉にすること", icon: "🗣️" },
      { id: "choose", label: "自分で選ぶこと", icon: "✋" },
      { id: "rest", label: "休むこと", icon: "🛌" },
    ],
  },
  {
    id: "diff_lost_skill",
    question: "あの頃の方が上手だったことは？",
    type: "select",
    options: [
      { id: "trust", label: "人を信じること", icon: "🤝" },
      { id: "excitement", label: "ワクワクすること", icon: "✨" },
      { id: "effort", label: "がむしゃらに頑張ること", icon: "🔥" },
      { id: "cry", label: "素直に泣くこと", icon: "😭" },
      { id: "dream", label: "夢を語ること", icon: "🌠" },
    ],
  },
  {
    id: "diff_unchanged",
    question: "あの頃から全く変わっていないところは？",
    type: "select",
    options: [
      { id: "fear", label: "怖いものが同じ", icon: "😨" },
      { id: "taste", label: "好みが同じ", icon: "🎨" },
      { id: "reaction", label: "反応の仕方が同じ", icon: "⚡" },
      { id: "longing", label: "求めているものが同じ", icon: "🌟" },
      { id: "habit", label: "癖が同じ", icon: "🔁" },
    ],
  },
  {
    id: "diff_surprise",
    question: "当時の自分が今の自分を見たら、一番驚くのは？",
    type: "select",
    options: [
      { id: "job", label: "こんな仕事してるの？", icon: "💼" },
      { id: "appearance", label: "見た目が変わった", icon: "🪞" },
      { id: "relationship", label: "こんな人と付き合ってるの？", icon: "💑" },
      { id: "calm", label: "こんなに落ち着いてるの？", icon: "🧘" },
      { id: "same", label: "意外と変わってないね", icon: "🤷" },
    ],
  },
];

const DIFFERENCE_FACTS: FlowQuestion[] = [
  {
    id: "diff_turning_point",
    question: "今の自分に変わったきっかけは、何だったと思う？",
    type: "short_text",
    placeholder: "例：あの別れ、引っ越し、ある一言…",
  },
  {
    id: "diff_environment",
    question: "あの頃と今で、一番違う「環境」は？",
    type: "select",
    options: [
      { id: "people", label: "周りにいる人", icon: "👥" },
      { id: "place", label: "住んでいる場所", icon: "🏠" },
      { id: "money", label: "経済的な余裕", icon: "💰" },
      { id: "freedom", label: "自由の度合い", icon: "🕊️" },
    ],
  },
  {
    id: "diff_regret",
    question: "あの頃の自分に「これだけは伝えたい」と思うことは？",
    type: "short_text",
    placeholder: "例：大丈夫だよ、それは間違ってないよ、逃げていいよ…",
  },
];

const DIFFERENCE_INNER: FlowQuestion[] = [
  {
    id: "diff_inner_distance",
    question: "あの頃の自分は、今の自分からどれくらい遠い？",
    type: "select",
    options: [
      { id: "very_close", label: "すぐそこにいる感じ", icon: "👤" },
      { id: "somewhat", label: "ぼんやり見える距離", icon: "🌫️" },
      { id: "far", label: "かなり遠い", icon: "🔭" },
      { id: "other_person", label: "別人みたい", icon: "👻" },
    ],
  },
  {
    id: "diff_miss",
    question: "あの頃の自分で、今も恋しいところは？",
    type: "select",
    options: [
      { id: "energy", label: "エネルギーの高さ", icon: "🔥" },
      { id: "innocence", label: "素直さ・純粋さ", icon: "🌸" },
      { id: "bonds", label: "周りとの関係", icon: "🤝" },
      { id: "nothing", label: "特にない", icon: "🍃" },
      { id: "fear", label: "怖いもの知らずだったこと", icon: "💪" },
    ],
  },
  {
    id: "diff_growth_or_loss",
    question: "今の自分になったのは「成長」？「喪失」？",
    type: "select",
    options: [
      { id: "growth", label: "成長だと思う", icon: "🌱" },
      { id: "loss", label: "失ったものの方が大きい", icon: "🍂" },
      { id: "both", label: "両方ある", icon: "🌀" },
      { id: "neither", label: "ただ変化しただけ", icon: "🔄" },
    ],
  },
  {
    id: "diff_reconnect",
    question: "あの頃の自分から取り戻したいものがあるとしたら？",
    type: "short_text",
    placeholder: "例：あの頃の情熱、人を好きになる力、怖がらない心…",
  },
];

/* ─── unspoken: 言えなかったことから辿る ─── */

const UNSPOKEN_DAILY: SelectQuestion[] = [
  {
    id: "unspoken_target",
    question: "誰に何を言いたかった？",
    type: "select",
    options: [
      { id: "parent", label: "親に", icon: "👨‍👩‍👧" },
      { id: "friend", label: "友達に", icon: "👫" },
      { id: "teacher", label: "先生・上司に", icon: "👨‍🏫" },
      { id: "partner", label: "恋人・好きな人に", icon: "💕" },
      { id: "self", label: "自分自身に", icon: "🪞" },
    ],
  },
  {
    id: "unspoken_moment",
    question: "黙った瞬間を覚えてる？ どんな状況だった？",
    type: "select",
    options: [
      { id: "group", label: "みんなの前で口をつぐんだ", icon: "👥" },
      { id: "one_on_one", label: "二人きりの時に言えなかった", icon: "🤐" },
      { id: "phone", label: "電話・メールで止めた", icon: "📱" },
      { id: "leaving", label: "去り際に飲み込んだ", icon: "🚪" },
      { id: "many_times", label: "何度もあった", icon: "🔁" },
    ],
  },
  {
    id: "unspoken_instead",
    question: "言えない代わりに、何をしていた？",
    type: "select",
    options: [
      { id: "smile", label: "笑って流した", icon: "😊" },
      { id: "agree", label: "相手に合わせた", icon: "🤝" },
      { id: "diary", label: "書いて発散した", icon: "📓" },
      { id: "someone_else", label: "別の人に話した", icon: "🗣️" },
      { id: "nothing", label: "何もせず抱えた", icon: "🤱" },
    ],
  },
  {
    id: "unspoken_body",
    question: "言葉を飲み込んだとき、体のどこに来た？",
    type: "select",
    options: [
      { id: "throat", label: "喉が詰まった", icon: "😶" },
      { id: "chest", label: "胸が苦しかった", icon: "💔" },
      { id: "stomach", label: "お腹が痛くなった", icon: "🤢" },
      { id: "hands", label: "手が震えた", icon: "🤲" },
      { id: "none", label: "体には出なかった", icon: "🤷" },
    ],
  },
  {
    id: "unspoken_frequency",
    question: "それは「特別な一回」だった？ それとも繰り返し？",
    type: "select",
    options: [
      { id: "once", label: "あの一回だけ鮮明", icon: "⚡" },
      { id: "repeated", label: "何度も繰り返していた", icon: "🔄" },
      { id: "pattern", label: "いつも同じパターンだった", icon: "📋" },
      { id: "gradual", label: "だんだん言えなくなった", icon: "📉" },
    ],
  },
];

const UNSPOKEN_FACTS: FlowQuestion[] = [
  {
    id: "unspoken_words",
    question: "もし言えていたら、どんな言葉だった？",
    type: "short_text",
    placeholder: "例：やめて、助けて、好きだよ、もう無理…",
  },
  {
    id: "unspoken_consequence",
    question: "もしあの時言えていたら、何が変わっていたと思う？",
    type: "select",
    options: [
      { id: "relationship", label: "その人との関係が変わった", icon: "🔀" },
      { id: "self", label: "自分の生き方が変わった", icon: "🌱" },
      { id: "nothing", label: "何も変わらなかったかも", icon: "🤷" },
      { id: "worse", label: "もっと悪くなっていたかも", icon: "😰" },
    ],
  },
  {
    id: "unspoken_trigger",
    question: "何がきっかけで言えなくなった？ 最初に黙ったのはいつ？",
    type: "short_text",
    placeholder: "例：怒られたあの日から、泣いた後から…",
  },
];

const UNSPOKEN_INNER: FlowQuestion[] = [
  {
    id: "unspoken_real_feeling",
    question: "黙っていた本当の理由は？",
    type: "select",
    options: [
      { id: "fear", label: "嫌われるのが怖かった", icon: "😨" },
      { id: "burden", label: "相手の負担になりたくなかった", icon: "🤱" },
      { id: "pointless", label: "言っても無駄だと思った", icon: "😐" },
      { id: "protect", label: "自分を守るために黙った", icon: "🛡️" },
      { id: "habit", label: "黙る癖がついていた", icon: "🔁" },
    ],
  },
  {
    id: "unspoken_now",
    question: "今もまだ同じように飲み込んでいることは？",
    type: "select",
    options: [
      { id: "yes", label: "ある。まだ言えない", icon: "🤐" },
      { id: "less", label: "減ったけどたまにある", icon: "🌊" },
      { id: "different", label: "形が変わった", icon: "🔄" },
      { id: "no", label: "もう言えるようになった", icon: "🗣️" },
    ],
  },
  {
    id: "unspoken_relief",
    question: "もしここで一つだけ「本当はこう思っていた」と言えるなら？",
    type: "short_text",
    placeholder: "例：本当はずっと寂しかった、認めてほしかった…",
  },
  {
    id: "unspoken_weight",
    question: "言えなかったことの重さは、今どれくらいある？",
    type: "select",
    options: [
      { id: "heavy", label: "今も重い", icon: "⚓" },
      { id: "lighter", label: "軽くなってきた", icon: "🎈" },
      { id: "gone", label: "もう手放せた", icon: "🕊️" },
      { id: "forgot", label: "忘れていたけど今思い出した", icon: "💡" },
    ],
  },
];

/* ─── pride: その頃の誇りから辿る ─── */

const PRIDE_DAILY: SelectQuestion[] = [
  {
    id: "pride_happiest",
    question: "一番嬉しかった瞬間は？",
    type: "select",
    options: [
      { id: "result", label: "結果が出たとき", icon: "🏆" },
      { id: "praised", label: "認められたとき", icon: "👏" },
      { id: "helped", label: "誰かの役に立てたとき", icon: "🤝" },
      { id: "overcame", label: "乗り越えたとき", icon: "🧗" },
      { id: "found", label: "好きなものを見つけたとき", icon: "✨" },
    ],
  },
  {
    id: "pride_praised_by",
    question: "誰かに褒められた記憶は？ 誰に何を言われた？",
    type: "select",
    options: [
      { id: "parent", label: "親に褒められた", icon: "👨‍👩‍👧" },
      { id: "teacher", label: "先生・上司に認められた", icon: "👨‍🏫" },
      { id: "friend", label: "友達に「すごい」と言われた", icon: "👫" },
      { id: "stranger", label: "知らない人に褒められた", icon: "🙋" },
      { id: "none", label: "あまり褒められた記憶がない", icon: "🫥" },
    ],
  },
  {
    id: "pride_secret",
    question: "密かに自慢だったことは？",
    type: "select",
    options: [
      { id: "skill", label: "人には負けない技術", icon: "⚔️" },
      { id: "knowledge", label: "誰よりも詳しいこと", icon: "📚" },
      { id: "endurance", label: "我慢強さ", icon: "💪" },
      { id: "kindness", label: "人に優しくできること", icon: "🌸" },
      { id: "unique", label: "自分だけの世界を持っていること", icon: "🎨" },
    ],
  },
  {
    id: "pride_effort",
    question: "一番がんばったのはどんなこと？",
    type: "select",
    options: [
      { id: "study", label: "勉強・成績", icon: "📝" },
      { id: "sports", label: "スポーツ・体を動かすこと", icon: "🏃" },
      { id: "creative", label: "何かを作ること", icon: "🎨" },
      { id: "social", label: "人間関係の維持", icon: "👥" },
      { id: "survive", label: "毎日を生き抜くこと", icon: "🌅" },
    ],
  },
  {
    id: "pride_audience",
    question: "その頑張りを見ていた人はいた？",
    type: "select",
    options: [
      { id: "everyone", label: "みんなの前で示していた", icon: "🏟️" },
      { id: "one_person", label: "一人だけが知っていた", icon: "👤" },
      { id: "no_one", label: "誰にも気づかれなかった", icon: "🫥" },
      { id: "didnt_show", label: "わざと見せなかった", icon: "🤫" },
    ],
  },
];

const PRIDE_FACTS: FlowQuestion[] = [
  {
    id: "pride_moment_detail",
    question: "一番誇らしかった場面を、もう少し具体的に",
    type: "short_text",
    placeholder: "例：全校集会で名前を呼ばれた、試合で最後に決めた…",
  },
  {
    id: "pride_cost",
    question: "それを手に入れるために、何を犠牲にした？",
    type: "select",
    options: [
      { id: "time", label: "自由な時間", icon: "⏰" },
      { id: "relationship", label: "人間関係", icon: "👥" },
      { id: "health", label: "体力・健康", icon: "🏥" },
      { id: "fun", label: "遊び・楽しみ", icon: "🎮" },
      { id: "nothing", label: "特に犠牲はなかった", icon: "🍀" },
    ],
  },
  {
    id: "pride_lost_when",
    question: "その誇りがなくなったのはいつ？ きっかけは？",
    type: "short_text",
    placeholder: "例：もっとすごい人が現れた、環境が変わった…",
  },
];

const PRIDE_INNER: FlowQuestion[] = [
  {
    id: "pride_source",
    question: "その誇りの「本当の源」は何だったと思う？",
    type: "select",
    options: [
      { id: "approval", label: "認められたいという欲求", icon: "🌟" },
      { id: "survival", label: "生き残るための必死さ", icon: "🔥" },
      { id: "joy", label: "純粋に好きだった", icon: "💗" },
      { id: "escape", label: "つらさから逃げるため", icon: "🏃" },
      { id: "prove", label: "自分を証明したかった", icon: "📜" },
    ],
  },
  {
    id: "pride_after_loss",
    question: "誇りを失ったとき、何で自分を支えた？",
    type: "select",
    options: [
      { id: "new_pride", label: "新しい誇りを見つけた", icon: "🆕" },
      { id: "people", label: "人に支えてもらった", icon: "🤝" },
      { id: "nothing", label: "しばらく空っぽだった", icon: "🕳️" },
      { id: "denial", label: "失ったことを認めなかった", icon: "🙈" },
      { id: "still_lost", label: "まだ見つかっていない", icon: "🔍" },
    ],
  },
  {
    id: "pride_now",
    question: "今、同じくらいの誇りを感じるものはある？",
    type: "select",
    options: [
      { id: "yes", label: "ある", icon: "✨" },
      { id: "different", label: "形は違うけどある", icon: "🔄" },
      { id: "searching", label: "探している最中", icon: "🔍" },
      { id: "no", label: "まだない", icon: "🌫️" },
    ],
  },
  {
    id: "pride_define",
    question: "あの頃の自分を一言で表すなら？",
    type: "short_text",
    placeholder: "例：負けず嫌いの塊、静かな戦士、ひたすら走っていた人…",
  },
];

/* ─── defense: 身につけた守り方から辿る ─── */

const DEFENSE_DAILY: SelectQuestion[] = [
  {
    id: "defense_method",
    question: "どうやって自分を守っていた？",
    type: "select",
    options: [
      { id: "invisible", label: "目立たないようにした", icon: "🫥" },
      { id: "funny", label: "笑いで場をごまかした", icon: "🤡" },
      { id: "perfect", label: "完璧にして隙を見せなかった", icon: "💎" },
      { id: "fight", label: "先に攻撃した", icon: "🥊" },
      { id: "flee", label: "逃げた・避けた", icon: "🏃" },
    ],
  },
  {
    id: "defense_last_cry",
    question: "泣いたのは最後いつ？",
    type: "select",
    options: [
      { id: "often", label: "よく泣いていた", icon: "😢" },
      { id: "hidden", label: "隠れて泣いていた", icon: "🚿" },
      { id: "long_ago", label: "ずっと前に泣くのをやめた", icon: "🧊" },
      { id: "once", label: "あの一回だけ覚えている", icon: "💧" },
      { id: "never", label: "泣かなかった", icon: "😶" },
    ],
  },
  {
    id: "defense_smile_pain",
    question: "一番きつかったのに笑っていた場面は？",
    type: "select",
    options: [
      { id: "bullied", label: "からかわれた時", icon: "😅" },
      { id: "ignored", label: "無視された時", icon: "🫣" },
      { id: "failed", label: "失敗した時", icon: "📉" },
      { id: "goodbye", label: "別れの時", icon: "👋" },
      { id: "none", label: "そういう場面はなかった", icon: "🍀" },
    ],
  },
  {
    id: "defense_armor",
    question: "「鎧」はいつ身につけた？",
    type: "select",
    options: [
      { id: "always", label: "物心ついた時からあった", icon: "🏰" },
      { id: "after_event", label: "ある出来事がきっかけ", icon: "⚡" },
      { id: "gradual", label: "少しずつ厚くなっていった", icon: "📈" },
      { id: "taught", label: "誰かに教わった", icon: "👨‍🏫" },
      { id: "no_armor", label: "鎧はなかった", icon: "🌸" },
    ],
  },
  {
    id: "defense_trusted",
    question: "その守りを解いていい相手はいた？",
    type: "select",
    options: [
      { id: "one_person", label: "一人だけいた", icon: "👤" },
      { id: "few", label: "数人いた", icon: "👥" },
      { id: "animal", label: "人じゃなくて動物", icon: "🐕" },
      { id: "no_one", label: "誰にも見せなかった", icon: "🔒" },
      { id: "online", label: "ネット上の誰か", icon: "💻" },
    ],
  },
];

const DEFENSE_FACTS: FlowQuestion[] = [
  {
    id: "defense_trigger_event",
    question: "守りが必要になった最初の出来事を覚えてる？",
    type: "short_text",
    placeholder: "例：あの日怒鳴られた、裏切られた、見捨てられた…",
  },
  {
    id: "defense_daily_scene",
    question: "守りが発動する場面はいつも同じだった？",
    type: "select",
    options: [
      { id: "authority", label: "目上の人の前", icon: "👔" },
      { id: "group", label: "集団の中", icon: "👥" },
      { id: "intimate", label: "親しくなりそうな時", icon: "💗" },
      { id: "judged", label: "評価される場面", icon: "📊" },
      { id: "random", label: "予測できなかった", icon: "🎲" },
    ],
  },
  {
    id: "defense_side_effect",
    question: "その守り方のせいで、困ったことは？",
    type: "short_text",
    placeholder: "例：友達ができなかった、疲れすぎた、本音がわからなくなった…",
  },
];

const DEFENSE_INNER: FlowQuestion[] = [
  {
    id: "defense_real_fear",
    question: "本当に守りたかったのは、何から？",
    type: "select",
    options: [
      { id: "rejection", label: "拒絶されること", icon: "🚫" },
      { id: "pain", label: "また傷つくこと", icon: "💔" },
      { id: "shame", label: "恥をかくこと", icon: "😳" },
      { id: "loss", label: "大事なものを失うこと", icon: "🕊️" },
      { id: "truth", label: "本当の自分がバレること", icon: "🎭" },
    ],
  },
  {
    id: "defense_without_armor",
    question: "もし守りがなかったら、どうなっていたと思う？",
    type: "select",
    options: [
      { id: "broken", label: "壊れていた", icon: "💥" },
      { id: "different", label: "もっと自由だった", icon: "🦋" },
      { id: "same", label: "結局同じだった", icon: "🔁" },
      { id: "both", label: "壊れていたけど、自由だった", icon: "🌀" },
    ],
  },
  {
    id: "defense_now_status",
    question: "今もその守り方を使ってる？",
    type: "select",
    options: [
      { id: "yes", label: "まだ使っている", icon: "🛡️" },
      { id: "evolved", label: "形を変えて残っている", icon: "🔄" },
      { id: "sometimes", label: "ふとした瞬間に出る", icon: "⚡" },
      { id: "shed", label: "脱ぎ捨てた", icon: "🧥" },
    ],
  },
  {
    id: "defense_message",
    question: "あの頃の自分に「もう守らなくていいよ」と言えるとしたら？",
    type: "short_text",
    placeholder: "例：もう安全だよ、大丈夫、一人じゃないよ…",
  },
];

/* ─── loss: 失ったものから辿る ─── */

const LOSS_DAILY: SelectQuestion[] = [
  {
    id: "loss_sudden",
    question: "突然なくなったものは？",
    type: "select",
    options: [
      { id: "person", label: "大事な人", icon: "👤" },
      { id: "place", label: "居場所", icon: "🏠" },
      { id: "role", label: "役割・立場", icon: "🎭" },
      { id: "routine", label: "日常そのもの", icon: "🔁" },
      { id: "dream", label: "夢・目標", icon: "🌠" },
    ],
  },
  {
    id: "loss_last_day",
    question: "最後の日のことを覚えてる？",
    type: "select",
    options: [
      { id: "vivid", label: "鮮明に覚えている", icon: "📸" },
      { id: "blurry", label: "ぼんやりしている", icon: "🌫️" },
      { id: "didnt_know", label: "最後だと知らなかった", icon: "😶" },
      { id: "avoided", label: "思い出したくない", icon: "🙈" },
      { id: "no_last", label: "はっきりした「最後」がなかった", icon: "🔀" },
    ],
  },
  {
    id: "loss_replacement",
    question: "代わりに何を手に入れた？",
    type: "select",
    options: [
      { id: "strength", label: "強さ・覚悟", icon: "💪" },
      { id: "independence", label: "自立・一人で生きる力", icon: "🧘" },
      { id: "empathy", label: "人の痛みがわかるようになった", icon: "🤲" },
      { id: "nothing", label: "何も手に入れていない", icon: "🕳️" },
      { id: "new_bond", label: "新しいつながり", icon: "🔗" },
    ],
  },
  {
    id: "loss_mourning",
    question: "ちゃんと悲しめた？",
    type: "select",
    options: [
      { id: "yes", label: "泣いて悲しんだ", icon: "😭" },
      { id: "couldnt", label: "悲しめなかった", icon: "😶" },
      { id: "later", label: "後からやっと泣けた", icon: "🌧️" },
      { id: "anger", label: "悲しみより怒りだった", icon: "😤" },
      { id: "numb", label: "感覚が麻痺していた", icon: "🧊" },
    ],
  },
  {
    id: "loss_sign",
    question: "なくなる予兆はあった？",
    type: "select",
    options: [
      { id: "yes", label: "薄々わかっていた", icon: "👁️" },
      { id: "ignored", label: "気づいていたけど目をそらした", icon: "🙈" },
      { id: "no", label: "まったくなかった", icon: "⚡" },
      { id: "told", label: "誰かに言われていた", icon: "🗣️" },
    ],
  },
];

const LOSS_FACTS: FlowQuestion[] = [
  {
    id: "loss_detail",
    question: "失ったものについて、もう少し具体的に教えて",
    type: "short_text",
    placeholder: "例：転校で離れた親友、引っ越しで離れた地元…",
  },
  {
    id: "loss_timeline",
    question: "失ってからどれくらい引きずった？",
    type: "select",
    options: [
      { id: "days", label: "数日で立ち直った", icon: "🌅" },
      { id: "months", label: "数ヶ月", icon: "📅" },
      { id: "years", label: "何年も", icon: "📆" },
      { id: "still", label: "今もまだ", icon: "🌊" },
    ],
  },
  {
    id: "loss_coping",
    question: "失った直後、毎日どうやって過ごしていた？",
    type: "short_text",
    placeholder: "例：何も手につかなかった、逆にめちゃくちゃ忙しくした…",
  },
];

const LOSS_INNER: FlowQuestion[] = [
  {
    id: "loss_phantom",
    question: "失ったものの「幻」を感じることは今もある？",
    type: "select",
    options: [
      { id: "dream", label: "夢に出てくる", icon: "🌙" },
      { id: "similar", label: "似たものを見ると思い出す", icon: "👀" },
      { id: "date", label: "決まった日に思い出す", icon: "📅" },
      { id: "sudden", label: "ふと突然やってくる", icon: "⚡" },
      { id: "gone", label: "もうあまり感じない", icon: "🍃" },
    ],
  },
  {
    id: "loss_meaning",
    question: "その喪失が自分に教えたことは？",
    type: "select",
    options: [
      { id: "impermanence", label: "何も永遠じゃないこと", icon: "⏳" },
      { id: "cherish", label: "今あるものを大事にすること", icon: "💎" },
      { id: "self_reliance", label: "自分しか頼れないこと", icon: "🧘" },
      { id: "nothing", label: "まだわからない", icon: "❓" },
      { id: "anger", label: "世界は不公平だということ", icon: "😤" },
    ],
  },
  {
    id: "loss_if_returned",
    question: "もしそれが戻ってきたら、どうする？",
    type: "select",
    options: [
      { id: "accept", label: "喜んで受け入れる", icon: "🤗" },
      { id: "hesitate", label: "迷うと思う", icon: "🤔" },
      { id: "reject", label: "もう受け取れない", icon: "🚫" },
      { id: "different", label: "違う形で受け取りたい", icon: "🔄" },
    ],
  },
  {
    id: "loss_letter",
    question: "失ったものへの一言",
    type: "short_text",
    placeholder: "例：ありがとう、ごめん、まだ忘れてないよ…",
  },
];

/* ─── weapon: 得た武器から辿る ─── */

const WEAPON_DAILY: SelectQuestion[] = [
  {
    id: "weapon_skill",
    question: "この時期に身につけたスキルは？",
    type: "select",
    options: [
      { id: "communication", label: "人と話す力", icon: "🗣️" },
      { id: "endurance", label: "耐える力", icon: "🏋️" },
      { id: "observation", label: "観察する力", icon: "👁️" },
      { id: "creation", label: "何かを作る力", icon: "🎨" },
      { id: "analysis", label: "考える・分析する力", icon: "🧠" },
    ],
  },
  {
    id: "weapon_unbeatable",
    question: "誰にも負けなかったことは？",
    type: "select",
    options: [
      { id: "effort", label: "努力の量", icon: "🔥" },
      { id: "speed", label: "スピード", icon: "⚡" },
      { id: "detail", label: "細かさ・丁寧さ", icon: "🔍" },
      { id: "empathy", label: "人の気持ちを読むこと", icon: "🤲" },
      { id: "patience", label: "粘り強さ", icon: "🐢" },
    ],
  },
  {
    id: "weapon_still_using",
    question: "それは今も使っている？",
    type: "select",
    options: [
      { id: "daily", label: "毎日使っている", icon: "🔧" },
      { id: "sometimes", label: "必要な時に出る", icon: "🎯" },
      { id: "evolved", label: "進化した形で使っている", icon: "🔄" },
      { id: "rusty", label: "錆びついている", icon: "🗡️" },
      { id: "abandoned", label: "捨てた", icon: "🗑️" },
    ],
  },
  {
    id: "weapon_how_learned",
    question: "その武器はどうやって手に入れた？",
    type: "select",
    options: [
      { id: "taught", label: "誰かに教わった", icon: "👨‍🏫" },
      { id: "self_taught", label: "自分で試行錯誤した", icon: "🔬" },
      { id: "forced", label: "やらざるを得なかった", icon: "😤" },
      { id: "natural", label: "気づいたら身についていた", icon: "🌱" },
      { id: "copied", label: "誰かの真似から始まった", icon: "🪞" },
    ],
  },
  {
    id: "weapon_recognition",
    question: "その武器を周りに認められたことはある？",
    type: "select",
    options: [
      { id: "praised", label: "褒められた・頼られた", icon: "🌟" },
      { id: "depended", label: "それのせいで頼られすぎた", icon: "⚖️" },
      { id: "unnoticed", label: "誰にも気づかれなかった", icon: "🫥" },
      { id: "envied", label: "うらやましがられた", icon: "👀" },
      { id: "taken_granted", label: "当たり前にされた", icon: "🤷" },
    ],
  },
];

const WEAPON_FACTS: FlowQuestion[] = [
  {
    id: "weapon_origin_scene",
    question: "その武器が初めて役に立った場面を覚えてる？",
    type: "short_text",
    placeholder: "例：初めて人前で話せた日、あの問題を解けた瞬間…",
  },
  {
    id: "weapon_teacher",
    question: "その武器に関係する「師匠」的な存在はいた？",
    type: "select",
    options: [
      { id: "person", label: "特定の人がいた", icon: "👤" },
      { id: "rival", label: "ライバルだった", icon: "🤼" },
      { id: "book", label: "本・メディアから学んだ", icon: "📚" },
      { id: "no_one", label: "独学だった", icon: "🧘" },
    ],
  },
  {
    id: "weapon_limit",
    question: "その武器が通用しなかった経験は？",
    type: "short_text",
    placeholder: "例：努力では勝てない相手、観察しても読めない人…",
  },
];

const WEAPON_INNER: FlowQuestion[] = [
  {
    id: "weapon_motivation",
    question: "その武器を磨き続けた本当の動機は？",
    type: "select",
    options: [
      { id: "survival", label: "生き残るため", icon: "🔥" },
      { id: "love", label: "好きだったから", icon: "💗" },
      { id: "approval", label: "認められたかったから", icon: "🌟" },
      { id: "fear", label: "できない自分が怖かったから", icon: "😨" },
      { id: "habit", label: "気づいたら磨いていた", icon: "🔁" },
    ],
  },
  {
    id: "weapon_identity",
    question: "その武器がなくなったら、自分は何者？",
    type: "select",
    options: [
      { id: "nothing", label: "何もなくなる気がする", icon: "🕳️" },
      { id: "still_me", label: "それでも自分は自分", icon: "🧘" },
      { id: "scared", label: "考えるのが怖い", icon: "😰" },
      { id: "free", label: "逆に楽になるかも", icon: "🦋" },
    ],
  },
  {
    id: "weapon_double_edge",
    question: "その武器のせいで苦しんだことは？",
    type: "select",
    options: [
      { id: "overwork", label: "頑張りすぎて壊れた", icon: "💥" },
      { id: "isolated", label: "人と距離ができた", icon: "🏝️" },
      { id: "trapped", label: "その役割から抜け出せない", icon: "🔒" },
      { id: "nothing", label: "特にない", icon: "🍀" },
      { id: "perfectionism", label: "完璧を求めすぎるようになった", icon: "💎" },
    ],
  },
  {
    id: "weapon_next",
    question: "これからその武器をどうしたい？",
    type: "short_text",
    placeholder: "例：もっと磨きたい、手放したい、誰かに教えたい…",
  },
];

/* =====================================================================
 * 軸 → 質問セットのマッピング
 * ===================================================================== */

const AXIS_QUESTION_MAP: Record<ExplorationAxis, AxisQuestionSet> = {
  place: {
    dailyStructure: PLACE_DAILY,
    factGathering: PLACE_FACTS,
    innerState: PLACE_INNER,
  },
  person: {
    dailyStructure: PERSON_DAILY,
    factGathering: PERSON_FACTS,
    innerState: PERSON_INNER,
  },
  daily_flow: {
    dailyStructure: DAILY_FLOW_DAILY,
    factGathering: DAILY_FLOW_FACTS,
    innerState: DAILY_FLOW_INNER,
  },
  belongings: {
    dailyStructure: BELONGINGS_DAILY,
    factGathering: BELONGINGS_FACTS,
    innerState: BELONGINGS_INNER,
  },
  difference: {
    dailyStructure: DIFFERENCE_DAILY,
    factGathering: DIFFERENCE_FACTS,
    innerState: DIFFERENCE_INNER,
  },
  unspoken: {
    dailyStructure: UNSPOKEN_DAILY,
    factGathering: UNSPOKEN_FACTS,
    innerState: UNSPOKEN_INNER,
  },
  pride: {
    dailyStructure: PRIDE_DAILY,
    factGathering: PRIDE_FACTS,
    innerState: PRIDE_INNER,
  },
  defense: {
    dailyStructure: DEFENSE_DAILY,
    factGathering: DEFENSE_FACTS,
    innerState: DEFENSE_INNER,
  },
  loss: {
    dailyStructure: LOSS_DAILY,
    factGathering: LOSS_FACTS,
    innerState: LOSS_INNER,
  },
  weapon: {
    dailyStructure: WEAPON_DAILY,
    factGathering: WEAPON_FACTS,
    innerState: WEAPON_INNER,
  },
};

/* =====================================================================
 * 公開API
 * ===================================================================== */

/**
 * 探索軸ごとの質問セットを返す
 * @param axis 探索軸
 * @returns { dailyStructure, factGathering, innerState }
 */
export function getAxisQuestions(axis: ExplorationAxis): AxisQuestionSet {
  return AXIS_QUESTION_MAP[axis];
}

export type { AxisQuestionSet };

/* =====================================================================
 * 後方互換: デフォルトエクスポート（daily_flow軸をフォールバック）
 * 既存コンポーネントが直接 import している定数を維持
 * ===================================================================== */

export const DAILY_STRUCTURE_QUESTIONS: SelectQuestion[] = DAILY_FLOW_DAILY;
export const FACT_GATHERING_QUESTIONS: FlowQuestion[] = DAILY_FLOW_FACTS;
export const INNER_STATE_QUESTIONS: FlowQuestion[] = DAILY_FLOW_INNER;

/* ─── フェーズ6: 覚えた生き方の言語化（軸共通） ─── */

export const PHASE6_COPY = {
  heading: "その時に覚えた動き方",
  sub: "この頃の自分は、どうやってその場を成立させていましたか？",
} as const;

export type PatternOption = QuestionOption & {
  /** "close" | "somewhat" | "different" */
  defaultRating?: string;
};

export const LEARNED_PATTERN_OPTIONS: PatternOption[] = [
  { id: "observe_first", label: "先に周囲を見る", icon: "👁️" },
  { id: "fulfill_role", label: "役割を果たして安心する", icon: "🎯" },
  { id: "act_bright", label: "明るく振る舞う", icon: "😊" },
  { id: "prioritize_group", label: "自分より全体を優先する", icon: "👥" },
  { id: "carry_alone", label: "一人で抱える", icon: "🎒" },
  { id: "read_air", label: "空気を読む", icon: "🌡️" },
  { id: "anticipate", label: "先回りする", icon: "⏩" },
  { id: "suppress_self", label: "自分を少し抑える", icon: "🤫" },
  { id: "seek_approval", label: "認められることで安定する", icon: "🌟" },
  { id: "stay_flexible", label: "柔軟に合わせる", icon: "🔄" },
  { id: "protect_space", label: "自分の空間を守る", icon: "🛡️" },
  { id: "perfectionism", label: "完璧を目指す", icon: "💎" },
];

/** 評価段階 */
export const PATTERN_RATINGS = [
  { id: "close", label: "近い" },
  { id: "somewhat", label: "少し近い" },
  { id: "different", label: "違う" },
] as const;

export type PatternRating = (typeof PATTERN_RATINGS)[number]["id"];

/* ─── フェーズ7: 今への接続（軸共通） ─── */

export const PHASE7_COPY = {
  heading: "今の自分との接続",
  sub: "その頃の感覚が、今にも残っているか辿ります",
} as const;

export const PRESENT_CONNECTION_QUESTIONS: FlowQuestion[] = [
  {
    id: "similar_reaction",
    question: "今も似た反応が出る場面はある？",
    type: "select",
    options: [
      { id: "yes_often", label: "よくある", icon: "⚡" },
      { id: "sometimes", label: "たまにある", icon: "🌊" },
      { id: "not_anymore", label: "もうない", icon: "🍃" },
      { id: "changed", label: "形が変わった", icon: "🔄" },
    ],
  },
  {
    id: "helpful_or_heavy",
    question: "その時に覚えたやり方は、今も役立っている？それとも重くなっている？",
    type: "select",
    options: [
      { id: "useful", label: "今も役立っている", icon: "✨" },
      { id: "heavy", label: "少し重くなっている", icon: "⚖️" },
      { id: "both", label: "両方ある", icon: "🌀" },
      { id: "neutral", label: "どちらでもない", icon: "😐" },
    ],
  },
  {
    id: "what_remains",
    question: "今の自分に一番残っているのは、この時の何だと思う？",
    type: "short_text",
    placeholder: "例：人を見てから動く癖、頼られると断れない感覚...",
  },
];

/* ─── フェーズ8: 仮説提示と修正（軸共通） ─── */

export const PHASE8_COPY = {
  heading: "この頃のあなたについて",
  sub: "集めた断片から、仮説を描きます。合っているか教えてください",
} as const;

export const CORRECTION_OPTIONS: (QuestionOption & { hasInput?: boolean })[] = [
  { id: "very_close", label: "かなり近い", icon: "🎯" },
  { id: "partly_close", label: "一部だけ近い", icon: "🔄" },
  { id: "different", label: "そこは違う", icon: "❌" },
  { id: "close_but", label: "近いのはこっち", icon: "💬", hasInput: true },
];
