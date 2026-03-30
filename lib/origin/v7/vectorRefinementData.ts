/**
 * Vector Refinement Data — 10次元 × 2-4問のプリセット質問テンプレート
 * 各次元の underivable / low-confidence を埋めるためのカード選択式質問。
 */

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   型定義
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type TargetedPromptOption = {
  id: string;
  label: string;
  icon: string;
  dimensionEffect: number; // この選択肢が次元に与える値 (0-1)
};

export type TargetedPrompt = {
  id: string;
  question: string;
  responseOptions: TargetedPromptOption[];
  targetDimension: string;
  signalStrength: number; // この質問の信号強度 (0-1)
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   プリセット質問テンプレート
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const DIMENSION_PROMPTS: Record<string, TargetedPrompt[]> = {
  /* ─── 1. conversation_temperature ─── */
  conversation_temperature: [
    {
      id: "ct_1",
      question: "休日に友人と過ごすとき、どんな会話が心地いい？",
      targetDimension: "conversation_temperature",
      signalStrength: 0.8,
      responseOptions: [
        { id: "ct_1a", label: "くだらない雑談で笑っていたい", icon: "😄", dimensionEffect: 0.8 },
        { id: "ct_1b", label: "お互いの近況を深く聞き合いたい", icon: "☕", dimensionEffect: 0.6 },
        { id: "ct_1c", label: "同じ空間にいるだけで十分", icon: "🌿", dimensionEffect: 0.3 },
      ],
    },
    {
      id: "ct_2",
      question: "初対面の人との食事。沈黙が10秒続いたら？",
      targetDimension: "conversation_temperature",
      signalStrength: 0.7,
      responseOptions: [
        { id: "ct_2a", label: "自分から話題を振る", icon: "💬", dimensionEffect: 0.8 },
        { id: "ct_2b", label: "相手が話すまで少し待つ", icon: "⏳", dimensionEffect: 0.5 },
        { id: "ct_2c", label: "沈黙も居心地が良い", icon: "🤫", dimensionEffect: 0.2 },
      ],
    },
  ],

  /* ─── 2. distance_need ─── */
  distance_need: [
    {
      id: "dn_1",
      question: "大切な人との理想の距離感は？",
      targetDimension: "distance_need",
      signalStrength: 0.9,
      responseOptions: [
        { id: "dn_1a", label: "毎日連絡を取り合いたい", icon: "📱", dimensionEffect: 0.2 },
        { id: "dn_1b", label: "週に数回、自然なペースで", icon: "🌊", dimensionEffect: 0.5 },
        { id: "dn_1c", label: "会わない時間も大切にしたい", icon: "🏔️", dimensionEffect: 0.8 },
      ],
    },
    {
      id: "dn_2",
      question: "一人で過ごす時間について",
      targetDimension: "distance_need",
      signalStrength: 0.8,
      responseOptions: [
        { id: "dn_2a", label: "一人の時間は充電に必須", icon: "🔋", dimensionEffect: 0.85 },
        { id: "dn_2b", label: "あった方がいいけど、なくても平気", icon: "⚖️", dimensionEffect: 0.5 },
        { id: "dn_2c", label: "誰かと一緒の方がエネルギーが出る", icon: "✨", dimensionEffect: 0.2 },
      ],
    },
  ],

  /* ─── 3. depth_speed ─── */
  depth_speed: [
    {
      id: "ds_1",
      question: "新しい人と出会ったとき、どちらに近い？",
      targetDimension: "depth_speed",
      signalStrength: 0.9,
      responseOptions: [
        { id: "ds_1a", label: "まず距離を置いて様子を見る", icon: "🔭", dimensionEffect: 0.3 },
        { id: "ds_1b", label: "すぐに深い話がしたくなる", icon: "🤝", dimensionEffect: 0.7 },
        { id: "ds_1c", label: "相手次第で変わる", icon: "🎭", dimensionEffect: 0.5 },
      ],
    },
    {
      id: "ds_2",
      question: "友人になるまでに、どのくらいかかる？",
      targetDimension: "depth_speed",
      signalStrength: 0.7,
      responseOptions: [
        { id: "ds_2a", label: "初日で仲良くなれることもある", icon: "⚡", dimensionEffect: 0.8 },
        { id: "ds_2b", label: "数ヶ月はかかる", icon: "🌱", dimensionEffect: 0.4 },
        { id: "ds_2c", label: "年単位でゆっくり深まる", icon: "🌳", dimensionEffect: 0.2 },
      ],
    },
  ],

  /* ─── 4. stability_need ─── */
  stability_need: [
    {
      id: "sn_1",
      question: "人生で大切なのは？",
      targetDimension: "stability_need",
      signalStrength: 0.8,
      responseOptions: [
        { id: "sn_1a", label: "安心できる日常の繰り返し", icon: "🏡", dimensionEffect: 0.85 },
        { id: "sn_1b", label: "新しい挑戦と変化", icon: "🚀", dimensionEffect: 0.2 },
        { id: "sn_1c", label: "安定した土台の上での冒険", icon: "🧗", dimensionEffect: 0.5 },
      ],
    },
    {
      id: "sn_2",
      question: "突然の予定変更。どう感じる？",
      targetDimension: "stability_need",
      signalStrength: 0.7,
      responseOptions: [
        { id: "sn_2a", label: "正直ストレスを感じる", icon: "😤", dimensionEffect: 0.8 },
        { id: "sn_2b", label: "むしろワクワクする", icon: "🎉", dimensionEffect: 0.2 },
        { id: "sn_2c", label: "内容次第で変わる", icon: "🤔", dimensionEffect: 0.5 },
      ],
    },
  ],

  /* ─── 5. stimulation_need ─── */
  stimulation_need: [
    {
      id: "st_1",
      question: "理想の休日は？",
      targetDimension: "stimulation_need",
      signalStrength: 0.8,
      responseOptions: [
        { id: "st_1a", label: "行ったことのない場所に出かける", icon: "🗺️", dimensionEffect: 0.8 },
        { id: "st_1b", label: "好きな場所でのんびり過ごす", icon: "☕", dimensionEffect: 0.3 },
        { id: "st_1c", label: "新しいことを学んだり試したり", icon: "📚", dimensionEffect: 0.65 },
      ],
    },
    {
      id: "st_2",
      question: "同じルーティンが3ヶ月続いたら？",
      targetDimension: "stimulation_need",
      signalStrength: 0.7,
      responseOptions: [
        { id: "st_2a", label: "安心する。むしろ心地いい", icon: "😌", dimensionEffect: 0.2 },
        { id: "st_2b", label: "少し飽きてくるかも", icon: "😐", dimensionEffect: 0.5 },
        { id: "st_2c", label: "変化がないと息苦しくなる", icon: "💨", dimensionEffect: 0.85 },
      ],
    },
  ],

  /* ─── 6. initiative ─── */
  initiative: [
    {
      id: "in_1",
      question: "グループで何かを決めるとき",
      targetDimension: "initiative",
      signalStrength: 0.9,
      responseOptions: [
        { id: "in_1a", label: "自分が案を出して引っ張る", icon: "🎯", dimensionEffect: 0.85 },
        { id: "in_1b", label: "みんなの意見を聞いてまとめる", icon: "🔄", dimensionEffect: 0.55 },
        { id: "in_1c", label: "誰かが決めてくれたら従う", icon: "👋", dimensionEffect: 0.2 },
      ],
    },
    {
      id: "in_2",
      question: "友人との約束。誘うのはどちら？",
      targetDimension: "initiative",
      signalStrength: 0.7,
      responseOptions: [
        { id: "in_2a", label: "自分から誘うことが多い", icon: "📲", dimensionEffect: 0.8 },
        { id: "in_2b", label: "半々くらい", icon: "🤝", dimensionEffect: 0.5 },
        { id: "in_2c", label: "誘われるのを待つことが多い", icon: "📬", dimensionEffect: 0.25 },
      ],
    },
  ],

  /* ─── 7. emotional_openness ─── */
  emotional_openness: [
    {
      id: "eo_1",
      question: "辛いことがあったとき、どうする？",
      targetDimension: "emotional_openness",
      signalStrength: 0.9,
      responseOptions: [
        { id: "eo_1a", label: "信頼できる人にすぐ話す", icon: "💬", dimensionEffect: 0.8 },
        { id: "eo_1b", label: "時間が経ってから話すかも", icon: "⏰", dimensionEffect: 0.5 },
        { id: "eo_1c", label: "自分の中で処理する", icon: "🔒", dimensionEffect: 0.2 },
      ],
    },
    {
      id: "eo_2",
      question: "嬉しいことがあったとき、どうする？",
      targetDimension: "emotional_openness",
      signalStrength: 0.7,
      responseOptions: [
        { id: "eo_2a", label: "すぐ誰かに共有したい", icon: "🎊", dimensionEffect: 0.8 },
        { id: "eo_2b", label: "聞かれたら話す", icon: "😊", dimensionEffect: 0.5 },
        { id: "eo_2c", label: "一人で噛み締める方が好き", icon: "✨", dimensionEffect: 0.2 },
      ],
    },
    {
      id: "eo_3",
      question: "涙を見せることについて",
      targetDimension: "emotional_openness",
      signalStrength: 0.6,
      responseOptions: [
        { id: "eo_3a", label: "自然なこと。我慢しない", icon: "💧", dimensionEffect: 0.8 },
        { id: "eo_3b", label: "相手による", icon: "👀", dimensionEffect: 0.5 },
        { id: "eo_3c", label: "できるだけ見せたくない", icon: "🛡️", dimensionEffect: 0.15 },
      ],
    },
  ],

  /* ─── 8. conflict_directness ─── */
  conflict_directness: [
    {
      id: "cd_1",
      question: "意見が食い違ったとき、どうすることが多い？",
      targetDimension: "conflict_directness",
      signalStrength: 0.9,
      responseOptions: [
        { id: "cd_1a", label: "まず自分の考えを伝える", icon: "🗣️", dimensionEffect: 0.8 },
        { id: "cd_1b", label: "相手の意見を聞いてから", icon: "👂", dimensionEffect: 0.5 },
        { id: "cd_1c", label: "場の空気を読んで合わせる", icon: "🌫️", dimensionEffect: 0.2 },
      ],
    },
    {
      id: "cd_2",
      question: "友人が約束を破ったら？",
      targetDimension: "conflict_directness",
      signalStrength: 0.8,
      responseOptions: [
        { id: "cd_2a", label: "直接理由を聞く", icon: "❓", dimensionEffect: 0.8 },
        { id: "cd_2b", label: "様子を見て、続くようなら言う", icon: "⏳", dimensionEffect: 0.5 },
        { id: "cd_2c", label: "気にしないフリをする", icon: "🙈", dimensionEffect: 0.15 },
        { id: "cd_2d", label: "静かに距離を置く", icon: "🚶", dimensionEffect: 0.3 },
      ],
    },
  ],

  /* ─── 9. social_energy ─── */
  social_energy: [
    {
      id: "se_1",
      question: "大人数の集まりの後、どう感じる？",
      targetDimension: "social_energy",
      signalStrength: 0.9,
      responseOptions: [
        { id: "se_1a", label: "楽しかった！もっと話したい", icon: "🎉", dimensionEffect: 0.85 },
        { id: "se_1b", label: "楽しいけど、少し疲れた", icon: "😮‍💨", dimensionEffect: 0.5 },
        { id: "se_1c", label: "一人になりたい…充電したい", icon: "🔋", dimensionEffect: 0.2 },
      ],
    },
    {
      id: "se_2",
      question: "新しいコミュニティに参加するとき",
      targetDimension: "social_energy",
      signalStrength: 0.7,
      responseOptions: [
        { id: "se_2a", label: "積極的に色んな人と話す", icon: "🌟", dimensionEffect: 0.8 },
        { id: "se_2b", label: "気の合いそうな人を見つけて話す", icon: "🎯", dimensionEffect: 0.5 },
        { id: "se_2c", label: "しばらく観察してから動く", icon: "👀", dimensionEffect: 0.25 },
      ],
    },
  ],

  /* ─── 10. structure_preference ─── */
  structure_preference: [
    {
      id: "sp_1",
      question: "旅行の計画。どちらが好き？",
      targetDimension: "structure_preference",
      signalStrength: 0.8,
      responseOptions: [
        { id: "sp_1a", label: "細かく計画を立てたい", icon: "📋", dimensionEffect: 0.85 },
        { id: "sp_1b", label: "大まかな方針だけ決めて行く", icon: "🧭", dimensionEffect: 0.5 },
        { id: "sp_1c", label: "ノープラン。その場の気分で", icon: "🎲", dimensionEffect: 0.15 },
      ],
    },
    {
      id: "sp_2",
      question: "仕事やタスクの進め方は？",
      targetDimension: "structure_preference",
      signalStrength: 0.8,
      responseOptions: [
        { id: "sp_2a", label: "リストを作って順番に片付ける", icon: "✅", dimensionEffect: 0.8 },
        { id: "sp_2b", label: "優先度だけ決めて柔軟に", icon: "🔄", dimensionEffect: 0.5 },
        { id: "sp_2c", label: "やりたいものからやる", icon: "⚡", dimensionEffect: 0.2 },
      ],
    },
    {
      id: "sp_3",
      question: "部屋の状態は？",
      targetDimension: "structure_preference",
      signalStrength: 0.6,
      responseOptions: [
        { id: "sp_3a", label: "常に整理整頓されている", icon: "✨", dimensionEffect: 0.85 },
        { id: "sp_3b", label: "自分なりの秩序がある", icon: "🏠", dimensionEffect: 0.5 },
        { id: "sp_3c", label: "創造的な混沌", icon: "🎨", dimensionEffect: 0.2 },
      ],
    },
  ],
};
