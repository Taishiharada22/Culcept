// lib/origin/lifeProfile/types.ts
// 人生のプロフィール — Life Profile type system (Approach B: Aneurasync depth)
//
// 設計原則:
//   事実 + 「なぜ」「どう自分を形作ったか」= 深層プロフィール
//   Rendezvousには profile_details(趣味,ペット,職業,ライフスタイル等)があるが
//   Originでは「事実の奥にある文脈」を掘る。
//   同じ「犬を飼っている」でも、ここでは「なぜ飼い始めたか」「生活がどう変わったか」を記録。

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Category definitions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type LifeProfileCategory =
  | "skills"          // 資格・できること
  | "family"          // 家族・同居
  | "pets"            // ペット・動物
  | "romantic"        // 恋愛・パートナー
  | "friendships"     // 友人関係
  | "passions"        // 情熱・好きなこと
  | "life_events"     // 人生の転機
  | "career"          // 仕事・キャリア
  | "living"          // 住環境・生活圏
  | "values";         // 価値観・信念

export type CategoryMeta = {
  label: string;
  emoji: string;
  description: string;
  /** 深掘り質問のテンプレート */
  depthQuestions: string[];
};

export const CATEGORY_META: Record<LifeProfileCategory, CategoryMeta> = {
  skills: {
    label: "資格・できること",
    emoji: "🛠",
    description: "身につけてきた力と、その背景にある物語",
    depthQuestions: [
      "なぜこれを身につけようと思った？",
      "取得・習得した時の自分はどんな状態だった？",
      "これが自分の人生をどう変えた？",
      "今もこのスキルに愛着がある？",
    ],
  },
  family: {
    label: "家族・同居",
    emoji: "🏠",
    description: "一緒に暮らす人たち、そしてその関係性",
    depthQuestions: [
      "この人との関係性を一言で表すと？",
      "この人から一番影響を受けたことは？",
      "この関係が自分の判断にどう影響している？",
    ],
  },
  pets: {
    label: "ペット・動物",
    emoji: "🐾",
    description: "共に暮らす命、そして自分への影響",
    depthQuestions: [
      "なぜこの子を迎え入れた？",
      "この子がいることで、生活がどう変わった？",
      "この子から学んだことはある？",
    ],
  },
  romantic: {
    label: "恋愛・パートナー",
    emoji: "💫",
    description: "恋愛の傾向と、自分が求めるもの",
    depthQuestions: [
      "恋愛において、自分が一番大切にしていることは？",
      "過去の経験から気づいた、自分の恋愛パターンは？",
      "理想のパートナーシップとは？",
    ],
  },
  friendships: {
    label: "友人関係",
    emoji: "🤝",
    description: "友人の層と、自分にとっての友情の意味",
    depthQuestions: [
      "どんな人と自然に仲良くなる？",
      "友人関係で一番嬉しい瞬間は？",
      "友人関係で傷ついた経験が、今の自分にどう影響している？",
    ],
  },
  passions: {
    label: "情熱・好きなこと",
    emoji: "🔥",
    description: "時間を忘れるもの、そしてその変遷",
    depthQuestions: [
      "いつからこれが好き？きっかけは？",
      "なぜこれに惹かれると思う？深い理由は？",
      "かつて好きだったけど離れたものはある？なぜ？",
      "この情熱が自分の人生をどう彩っている？",
    ],
  },
  life_events: {
    label: "人生の転機",
    emoji: "⚡",
    description: "自分を大きく変えた出来事たち",
    depthQuestions: [
      "この出来事の前と後で、自分の何が変わった？",
      "今振り返ると、この出来事にどんな意味がある？",
      "あの時の自分に、今の自分から一言伝えるなら？",
    ],
  },
  career: {
    label: "仕事・キャリア",
    emoji: "💼",
    description: "働くことの意味と、仕事の道のり",
    depthQuestions: [
      "なぜこの仕事を選んだ？",
      "仕事で一番達成感を感じる瞬間は？",
      "仕事に対する価値観が変わった転機は？",
      "今の仕事は自分らしいと感じる？",
    ],
  },
  living: {
    label: "住環境・生活圏",
    emoji: "🌏",
    description: "住んできた場所と、環境が自分に与えた影響",
    depthQuestions: [
      "この場所で暮らすことを選んだ理由は？",
      "この環境が自分の性格にどう影響した？",
      "理想の住環境はどんなもの？",
    ],
  },
  values: {
    label: "価値観・信念",
    emoji: "🌟",
    description: "譲れないもの、変わってきたもの",
    depthQuestions: [
      "この価値観はいつ、どうやって形成された？",
      "この信念が揺らいだことはある？",
      "周りと価値観が合わないと感じる瞬間は？",
    ],
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Entry types — 各カテゴリの記録単位
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 深掘り質問と回答のペア */
export type DepthResponse = {
  question: string;
  answer: string;
  answeredAt: string;
};

/** 1つのプロフィール項目 */
export type LifeProfileEntry = {
  id: string;
  category: LifeProfileCategory;
  /** 事実の要約（例: "犬（ポメラニアン）を飼っている"） */
  title: string;
  /** 自由メモ */
  note: string | null;
  /** 圧縮サムネイル (data:image/jpeg;base64,...) */
  thumbnail: string | null;
  /** 音声メモURL (blob URL — セッション中のみ有効) */
  audioUrl: string | null;
  /** 音声の文字起こし結果 */
  voiceTranscript: string | null;
  /** 位置情報 */
  location: {
    latitude: number;
    longitude: number;
    label: string | null;
  } | null;
  /** 深掘り回答（段階的に増える） */
  depthResponses: DepthResponse[];
  /** 現在も有効か（false = 過去の記録） */
  active: boolean;
  /** 開始時期（任意: "2020-04" のような年月） */
  since: string | null;
  /** 終了時期（任意: 現在も続いていればnull） */
  until: string | null;
  /** 自分への影響度 1-5 */
  impact: number;
  createdAt: string;
  updatedAt: string;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Depth completion tracking
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** カテゴリごとの入力深度 */
export type CategoryDepth = {
  category: LifeProfileCategory;
  /** 登録項目数 */
  entryCount: number;
  /** 深掘り回答数（全エントリの合計） */
  totalDepthAnswers: number;
  /** 深掘り可能な質問の合計 */
  totalDepthQuestions: number;
  /** 完成度 0-100 */
  completeness: number;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Store
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type LifeProfileStore = {
  version: 1;
  entries: LifeProfileEntry[];
  /** Rendezvousパイプライン同意 */
  rendezvousConsentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rendezvous pipeline types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Rendezvousに送る要約シグナル */
export type RendezvousSignal = {
  /** ペット関連（飼育中の動物、重要度） */
  petSignals: { type: string; importance: number }[];
  /** 家族構成シグナル */
  familySignals: { role: string; livingTogether: boolean }[];
  /** 価値観キーワード */
  coreValues: string[];
  /** キャリア特性 */
  careerTraits: string[];
  /** 恋愛パターン特性 */
  romanticTraits: string[];
  /** 情熱・趣味（深層理由付き） */
  passionSignals: { what: string; deepReason: string | null }[];
  /** 生活環境特性 */
  livingTraits: string[];
  /** #8 受動観測: 最も関心の高いカテゴリ */
  topInterestCategories: string[];
  /** #8 受動観測: 深掘り姿勢（スキップ率が低い = 内省的） */
  introspectionLevel: "high" | "medium" | "low";
  /** 全体の自己理解深度 0-100 */
  selfUnderstandingDepth: number;
  /** 生成日時 */
  generatedAt: string;
};
