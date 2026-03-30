// ============================================================
// Couple Games Library
// Rendezvous チャット内で2人が一緒に遊べるゲーム/ミッション
// 25+ テンプレート: icebreaker, deepening, playful, challenge, creative
// ============================================================

export type GameCategory =
  | "icebreaker"
  | "deepening"
  | "playful"
  | "challenge"
  | "creative";

export type RelationshipPhase =
  | "spark"         // 接続直後
  | "flame"         // 会話が続いている
  | "glow"          // 深い話ができるようになった
  | "constellation"; // 強い繋がり

export type GameFormat =
  | "simultaneous_answer"  // 同時回答型
  | "turn_based"           // 交互型
  | "collaborative"        // 共同作業型
  | "timed_challenge";     // 時間制限型

export type GameQuestion = {
  text: string;
  options?: string[];
};

export interface CoupleGame {
  id: string;
  title: string;
  titleJa: string;
  description: string;
  descriptionJa: string;
  category: GameCategory;
  minRelationshipPhase: RelationshipPhase;
  duration: number; // 所要時間（分）
  format: GameFormat;
  questions?: GameQuestion[];
  /** ゲーム内で使うアイコン */
  icon: string;
  /** 結果の表示形式 */
  resultType?: "match_rate" | "ranking_compare" | "free_text" | "reveal" | "none";
}

// ────────────────────────────────────────────
// Phase 順序（比較用）
// ────────────────────────────────────────────
const PHASE_ORDER: Record<RelationshipPhase, number> = {
  spark: 0,
  flame: 1,
  glow: 2,
  constellation: 3,
};

/**
 * 現在のフェーズで遊べるゲームをフィルタリングして返す
 */
export function getAvailableGames(
  currentPhase: RelationshipPhase,
  category?: GameCategory,
): CoupleGame[] {
  const phaseLevel = PHASE_ORDER[currentPhase];
  return COUPLE_GAMES.filter((game) => {
    const gameLevel = PHASE_ORDER[game.minRelationshipPhase];
    if (gameLevel > phaseLevel) return false;
    if (category && game.category !== category) return false;
    return true;
  });
}

/**
 * カテゴリ別のゲーム数を返す（バッジ表示用）
 */
export function getGameCountByCategory(
  currentPhase: RelationshipPhase,
): Record<GameCategory, number> {
  const result: Record<GameCategory, number> = {
    icebreaker: 0,
    deepening: 0,
    playful: 0,
    challenge: 0,
    creative: 0,
  };
  const available = getAvailableGames(currentPhase);
  for (const game of available) {
    result[game.category]++;
  }
  return result;
}

/** カテゴリの日本語ラベル */
export const CATEGORY_LABELS: Record<GameCategory, string> = {
  icebreaker: "アイスブレイク",
  deepening: "深める",
  playful: "遊ぶ",
  challenge: "チャレンジ",
  creative: "クリエイティブ",
};

/** カテゴリのアイコン */
export const CATEGORY_ICONS: Record<GameCategory, string> = {
  icebreaker: "🧊",
  deepening: "🔮",
  playful: "🎮",
  challenge: "💪",
  creative: "🎨",
};

/** フォーマットの日本語ラベル */
export const FORMAT_LABELS: Record<GameFormat, string> = {
  simultaneous_answer: "同時回答",
  turn_based: "交互",
  collaborative: "共同",
  timed_challenge: "タイムアタック",
};

// ============================================================
// 25+ ゲームテンプレート
// ============================================================

export const COUPLE_GAMES: CoupleGame[] = [
  // === ICEBREAKER (Phase: spark) ===
  {
    id: "two-truths",
    title: "Two Truths and a Lie",
    titleJa: "2つの本当と1つの嘘",
    description: "Write 3 statements and have your partner guess the lie",
    descriptionJa: "3つの文を書いて、相手に嘘を当ててもらう",
    category: "icebreaker",
    minRelationshipPhase: "spark",
    duration: 10,
    format: "turn_based",
    icon: "🤥",
    resultType: "reveal",
  },
  {
    id: "photo-story",
    title: "Photo Caption",
    titleJa: "写真で一言",
    description: "Send a funny photo and caption each other's",
    descriptionJa: "面白い写真を送って、お互いにキャプションをつける",
    category: "playful",
    minRelationshipPhase: "spark",
    duration: 5,
    format: "simultaneous_answer",
    icon: "📸",
    resultType: "free_text",
  },
  {
    id: "this-or-that",
    title: "This or That",
    titleJa: "どっち派？",
    description: "Answer 20 'either/or' questions simultaneously and see your match rate",
    descriptionJa: "20の「どっち？」に同時回答。一致率を見る",
    category: "icebreaker",
    minRelationshipPhase: "spark",
    duration: 5,
    format: "simultaneous_answer",
    icon: "⚖️",
    resultType: "match_rate",
    questions: [
      { text: "朝型？夜型？", options: ["朝型", "夜型"] },
      { text: "海？山？", options: ["海", "山"] },
      { text: "犬？猫？", options: ["犬", "猫"] },
      { text: "インドア？アウトドア？", options: ["インドア", "アウトドア"] },
      { text: "計画派？即興派？", options: ["計画派", "即興派"] },
      { text: "甘党？辛党？", options: ["甘党", "辛党"] },
      { text: "映画？ドラマ？", options: ["映画", "ドラマ"] },
      { text: "一人旅？グループ旅行？", options: ["一人旅", "グループ旅行"] },
      { text: "電話？テキスト？", options: ["電話", "テキスト"] },
      { text: "和食？洋食？", options: ["和食", "洋食"] },
      { text: "夏？冬？", options: ["夏", "冬"] },
      { text: "都会？田舎？", options: ["都会", "田舎"] },
      { text: "読書？音楽？", options: ["読書", "音楽"] },
      { text: "早起き？寝坊？", options: ["早起き", "寝坊"] },
      { text: "カフェ？居酒屋？", options: ["カフェ", "居酒屋"] },
      { text: "新しいもの好き？定番派？", options: ["新しいもの好き", "定番派"] },
      { text: "サプライズ？予定通り？", options: ["サプライズ", "予定通り"] },
      { text: "少人数？大人数？", options: ["少人数", "大人数"] },
      { text: "記念日重視？日常重視？", options: ["記念日重視", "日常重視"] },
      { text: "言葉で伝える？態度で示す？", options: ["言葉で伝える", "態度で示す"] },
    ],
  },
  {
    id: "music-exchange",
    title: "Mood Song Exchange",
    titleJa: "今の気分ソング",
    description: "Pick a song that matches your current mood and exchange",
    descriptionJa: "今の気分に合う曲を1曲選んで交換",
    category: "creative",
    minRelationshipPhase: "spark",
    duration: 5,
    format: "simultaneous_answer",
    icon: "🎵",
    resultType: "free_text",
  },
  {
    id: "emoji-story",
    title: "Emoji Self-Portrait",
    titleJa: "絵文字だけで自己紹介",
    description: "Describe yourself using only 5 emojis. Have your partner decode it",
    descriptionJa: "絵文字5個だけで自分を表現。相手に解読してもらう",
    category: "playful",
    minRelationshipPhase: "spark",
    duration: 5,
    format: "turn_based",
    icon: "😄",
    resultType: "reveal",
  },
  {
    id: "first-impression",
    title: "First Impression",
    titleJa: "第一印象を交換",
    description: "Write your honest first impression of each other and reveal simultaneously",
    descriptionJa: "お互いの第一印象を正直に書いて、同時に開封",
    category: "icebreaker",
    minRelationshipPhase: "spark",
    duration: 5,
    format: "simultaneous_answer",
    icon: "👀",
    resultType: "reveal",
  },
  {
    id: "rapid-fire",
    title: "30-Second Challenge",
    titleJa: "30秒チャレンジ",
    description: "Answer 10 questions in 30 seconds. No time to think!",
    descriptionJa: "30秒で10の質問に即答。考える暇なし！",
    category: "playful",
    minRelationshipPhase: "spark",
    duration: 3,
    format: "timed_challenge",
    icon: "⚡",
    resultType: "match_rate",
    questions: [
      { text: "好きな色は？" },
      { text: "好きな季節は？" },
      { text: "最後に泣いたのは？" },
      { text: "一番好きな食べ物は？" },
      { text: "行きたい国は？" },
      { text: "朝ごはん食べる？" },
      { text: "座右の銘は？" },
      { text: "無人島に1つだけ持っていくなら？" },
      { text: "生まれ変わったら何になりたい？" },
      { text: "今一番欲しいものは？" },
    ],
  },

  // === DEEPENING (Phase: flame) ===
  {
    id: "36-questions-lite",
    title: "10 Questions to Get Closer",
    titleJa: "心が近づく10の質問",
    description: "Answer deep questions designed by psychologists to build intimacy",
    descriptionJa: "心理学者が設計した、親密さを深める質問に交互に回答",
    category: "deepening",
    minRelationshipPhase: "flame",
    duration: 20,
    format: "turn_based",
    icon: "💫",
    resultType: "free_text",
    questions: [
      { text: "世界中の誰でもディナーに招待できるなら、誰を選ぶ？" },
      { text: "有名になりたい？どんな方法で？" },
      { text: "電話をかける前に、何を言うかリハーサルする？" },
      { text: "あなたにとって「完璧な日」とは？" },
      { text: "最後に一人で歌を歌ったのはいつ？誰かに向かって歌ったのは？" },
      { text: "90歳まで生きられるとして、30歳の心か30歳の体、どちらを選ぶ？" },
      { text: "自分がどのように死ぬか、密かな予感はある？" },
      { text: "相手と自分の共通点を3つ挙げて" },
      { text: "人生で最も感謝していることは？" },
      { text: "子供時代の思い出を1つ変えられるとしたら？" },
    ],
  },
  {
    id: "value-ranking",
    title: "Values Ranking",
    titleJa: "価値観ランキング",
    description: "Rank 10 values by importance and compare",
    descriptionJa: "10の価値観を重要度で並べ替え。一致度と違いを比較",
    category: "deepening",
    minRelationshipPhase: "flame",
    duration: 10,
    format: "simultaneous_answer",
    icon: "📊",
    resultType: "ranking_compare",
    questions: [
      {
        text: "以下を大切な順に並べてください",
        options: [
          "家族",
          "自由",
          "安定",
          "冒険",
          "成長",
          "友情",
          "お金",
          "健康",
          "創造性",
          "愛",
        ],
      },
    ],
  },
  {
    id: "dream-board",
    title: "Dream Board Exchange",
    titleJa: "夢ボード交換",
    description: "Describe your ideal life in 5 years with 3 photos",
    descriptionJa: "5年後の理想の生活を写真3枚で表現して交換",
    category: "creative",
    minRelationshipPhase: "flame",
    duration: 15,
    format: "simultaneous_answer",
    icon: "✨",
    resultType: "free_text",
  },
  {
    id: "conflict-style",
    title: "Conflict Style Quiz",
    titleJa: "ケンカのスタイル診断",
    description: "Discover your argument style through scenarios",
    descriptionJa: "シナリオベースで自分のケンカスタイルを発見。相性も見る",
    category: "deepening",
    minRelationshipPhase: "flame",
    duration: 10,
    format: "simultaneous_answer",
    icon: "🌊",
    resultType: "match_rate",
    questions: [
      {
        text: "相手が約束を忘れたら？",
        options: ["すぐ伝える", "しばらく黙る", "冗談にする", "次から確認する"],
      },
      {
        text: "意見が対立したら？",
        options: ["論理で説得", "相手に合わせる", "妥協点を探す", "時間を置く"],
      },
      {
        text: "イライラした時は？",
        options: ["すぐ話す", "一人になる", "運動する", "別のことで気を紛らわす"],
      },
      {
        text: "謝る時のスタイルは？",
        options: ["言葉で直接", "行動で示す", "手紙を書く", "プレゼントする"],
      },
      {
        text: "相手が落ち込んでいたら？",
        options: [
          "話を聞く",
          "そっとしておく",
          "楽しいことに誘う",
          "実用的な助けを出す",
        ],
      },
    ],
  },
  {
    id: "love-language",
    title: "Love Language Quiz",
    titleJa: "愛情表現クイズ",
    description: "Discover which of the 5 love languages you each value most",
    descriptionJa: "5つの愛の言語のうち、お互いがどれを重視するか発見",
    category: "deepening",
    minRelationshipPhase: "flame",
    duration: 10,
    format: "simultaneous_answer",
    icon: "💝",
    resultType: "match_rate",
    questions: [
      {
        text: "嬉しい時、相手にどうしてほしい？",
        options: ["言葉で褒めてほしい", "ハグしてほしい", "一緒に時間を過ごしたい", "何かプレゼントしてほしい", "手伝ってほしい"],
      },
      {
        text: "相手への愛情をどう表現する？",
        options: ["感謝の言葉を伝える", "スキンシップ", "デートの計画を立てる", "サプライズプレゼント", "家事を手伝う"],
      },
      {
        text: "一番寂しいのは？",
        options: ["褒められない", "触れ合いがない", "一緒の時間がない", "何ももらえない", "頼んでも手伝ってくれない"],
      },
    ],
  },
  {
    id: "bucket-list",
    title: "Shared Bucket List",
    titleJa: "一緒にやりたいことリスト",
    description: "Write 5 bucket list items each. Matches become 'promises'",
    descriptionJa: "お互いのバケットリストを5個書いて、被ったものを「約束」にする",
    category: "creative",
    minRelationshipPhase: "flame",
    duration: 10,
    format: "simultaneous_answer",
    icon: "📝",
    resultType: "match_rate",
  },
  {
    id: "word-association",
    title: "Word Association",
    titleJa: "連想ゲーム",
    description: "Answer word associations simultaneously. Match = +1 point",
    descriptionJa: "キーワードから連想する言葉を同時に回答。一致したら+1点",
    category: "playful",
    minRelationshipPhase: "spark",
    duration: 5,
    format: "simultaneous_answer",
    icon: "💬",
    resultType: "match_rate",
    questions: [
      { text: "「夏」と言えば？" },
      { text: "「幸せ」と言えば？" },
      { text: "「旅行」と言えば？" },
      { text: "「朝」と言えば？" },
      { text: "「友達」と言えば？" },
      { text: "「音楽」と言えば？" },
      { text: "「休日」と言えば？" },
      { text: "「恋」と言えば？" },
      { text: "「挑戦」と言えば？" },
      { text: "「家」と言えば？" },
    ],
  },

  // === PLAYFUL (Phase: spark-glow) ===
  {
    id: "guess-playlist",
    title: "Playlist Guess",
    titleJa: "プレイリスト当て",
    description: "Pick 3 songs your partner might like. See how many you got right",
    descriptionJa: "相手の好きそうな曲を3曲選んで、何曲当たるか",
    category: "playful",
    minRelationshipPhase: "spark",
    duration: 10,
    format: "turn_based",
    icon: "🎧",
    resultType: "match_rate",
  },
  {
    id: "role-reverse",
    title: "Role Reverse Chat",
    titleJa: "入れ替わりチャット",
    description: "Chat as each other for 5 minutes. How well can you impersonate?",
    descriptionJa: "5分間、相手になりきってチャット。どれだけ似せられるか",
    category: "playful",
    minRelationshipPhase: "flame",
    duration: 5,
    format: "collaborative",
    icon: "🔄",
    resultType: "free_text",
  },
  {
    id: "cook-together",
    title: "Air Cooking Battle",
    titleJa: "エア料理対決",
    description: "Given 3 ingredients, what would you cook? Judge each other",
    descriptionJa: "同じ食材3つで何を作るか考えて発表。審査員はお互い",
    category: "playful",
    minRelationshipPhase: "flame",
    duration: 10,
    format: "simultaneous_answer",
    icon: "🍳",
    resultType: "free_text",
    questions: [
      { text: "食材：卵、トマト、チーズ。何を作る？" },
      { text: "食材：鶏肉、レモン、ハーブ。何を作る？" },
      { text: "食材：パスタ、ベーコン、クリーム。何を作る？" },
    ],
  },
  {
    id: "movie-pitch",
    title: "Movie Pitch",
    titleJa: "映画企画プレゼン",
    description: "Pitch a movie about your relationship in 3 sentences",
    descriptionJa: "2人の関係を映画にするなら？3行で企画をプレゼン",
    category: "creative",
    minRelationshipPhase: "flame",
    duration: 10,
    format: "simultaneous_answer",
    icon: "🎬",
    resultType: "free_text",
  },
  {
    id: "guess-answer",
    title: "Predict Partner's Answer",
    titleJa: "相手の回答を予想",
    description: "Predict how your partner would answer, then compare",
    descriptionJa: "相手がどう答えるか予想。当たった数で親密度がわかる",
    category: "playful",
    minRelationshipPhase: "flame",
    duration: 10,
    format: "simultaneous_answer",
    icon: "🔮",
    resultType: "match_rate",
    questions: [
      { text: "相手の一番好きな食べ物は？" },
      { text: "相手が一番リラックスできる場所は？" },
      { text: "相手が子供の頃になりたかったものは？" },
      { text: "相手が最近ハマっていることは？" },
      { text: "相手が絶対に譲れないこだわりは？" },
    ],
  },

  // === CHALLENGE (Phase: glow-constellation) ===
  {
    id: "vulnerability-exchange",
    title: "Vulnerability Exchange",
    titleJa: "弱さの交換",
    description: "Share one vulnerability each. A token of trust",
    descriptionJa: "お互いの「弱い部分」を1つだけ打ち明ける。信頼の証",
    category: "challenge",
    minRelationshipPhase: "glow",
    duration: 15,
    format: "turn_based",
    icon: "🫂",
    resultType: "free_text",
  },
  {
    id: "gratitude-letter",
    title: "Gratitude Letter",
    titleJa: "感謝の手紙",
    description: "Write a thank-you letter to each other. Open simultaneously",
    descriptionJa: "相手への感謝を手紙形式で書く。同時に開封",
    category: "challenge",
    minRelationshipPhase: "glow",
    duration: 15,
    format: "simultaneous_answer",
    icon: "💌",
    resultType: "reveal",
  },
  {
    id: "future-us",
    title: "Future Us",
    titleJa: "未来の私たち",
    description: "Imagine your relationship in 1 year. Compare notes 1 year later",
    descriptionJa: "1年後の2人の関係を想像して書く。答え合わせは1年後",
    category: "challenge",
    minRelationshipPhase: "glow",
    duration: 10,
    format: "simultaneous_answer",
    icon: "🔭",
    resultType: "reveal",
  },
  {
    id: "honest-feedback",
    title: "Honest Feedback",
    titleJa: "正直フィードバック",
    description: "Share one constructive 'wish' for your partner",
    descriptionJa: "相手の「もっとこうしてほしい」を1つだけ。建設的に",
    category: "challenge",
    minRelationshipPhase: "constellation",
    duration: 15,
    format: "turn_based",
    icon: "💎",
    resultType: "free_text",
  },
  {
    id: "memory-capsule",
    title: "Memory Capsule",
    titleJa: "記憶カプセル",
    description: "Save a moment in photos + words. Open in 3 months",
    descriptionJa: "今の2人の思い出を写真+言葉でカプセルに。3ヶ月後に開封",
    category: "challenge",
    minRelationshipPhase: "glow",
    duration: 10,
    format: "collaborative",
    icon: "💊",
    resultType: "none",
  },
  {
    id: "truth-compass",
    title: "Truth Compass",
    titleJa: "本音コンパス",
    description: "Answer 5 deep 'would you rather' questions honestly",
    descriptionJa: "5つの深い「究極の選択」に正直に答える",
    category: "challenge",
    minRelationshipPhase: "glow",
    duration: 10,
    format: "simultaneous_answer",
    icon: "🧭",
    resultType: "match_rate",
    questions: [
      { text: "過去に戻れる vs 未来が見える", options: ["過去に戻れる", "未来が見える"] },
      { text: "一生旅行し続ける vs 一生同じ場所で暮らす", options: ["旅行し続ける", "同じ場所"] },
      { text: "本音だけ言う世界 vs 嘘がバレない世界", options: ["本音だけ", "嘘がバレない"] },
      { text: "全ての記憶を共有 vs 完全なプライバシー", options: ["記憶を共有", "完全プライバシー"] },
      { text: "永遠に一緒 vs 最高の10年間", options: ["永遠に", "最高の10年"] },
    ],
  },
  {
    id: "daily-highlight",
    title: "Daily Highlight Share",
    titleJa: "今日のハイライト",
    description: "Share the best moment of your day in one photo or sentence",
    descriptionJa: "今日一番良かった瞬間を写真か一文で共有",
    category: "icebreaker",
    minRelationshipPhase: "spark",
    duration: 3,
    format: "simultaneous_answer",
    icon: "☀️",
    resultType: "free_text",
  },
  {
    id: "compliment-chain",
    title: "Compliment Chain",
    titleJa: "褒めリレー",
    description: "Take turns giving genuine compliments. First to hesitate loses!",
    descriptionJa: "交互に相手を褒める。先に詰まった方が負け！",
    category: "playful",
    minRelationshipPhase: "flame",
    duration: 5,
    format: "turn_based",
    icon: "🌟",
    resultType: "none",
  },
  {
    id: "secret-talent",
    title: "Secret Talent Show",
    titleJa: "隠し芸大会",
    description: "Show a hidden talent via photo or video. Vote for the winner",
    descriptionJa: "隠し芸を写真か動画で披露。お互いに採点",
    category: "creative",
    minRelationshipPhase: "flame",
    duration: 15,
    format: "turn_based",
    icon: "🎪",
    resultType: "free_text",
  },
];
