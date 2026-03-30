// lib/stargazer/archetypeTypes.ts
// Stargazer v4 — 4-Axis Type System
// 24 Types = Cognition(3) × Emotion(2) × Social(2) × Execution(2)
// "MBTIは4軸×2択=16。Aneurasyncは4軸（1×3択+3×2択）=24。"

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Axis Definitions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Axis 1: 認知 — どう考えるか (ternary) */
export type CognitionCode = "A" | "N" | "S";
/** Axis 2: 感情 — 感情がどう動くか (binary) */
export type EmotionCode = "C" | "V";
/** Axis 3: 社交 — エネルギーの方向 (binary) */
export type SocialCode = "I" | "E";
/** Axis 4: 実行 — どう動くか (binary) */
export type ExecutionCode = "O" | "X";

// Backwards-compatible aliases (old code may reference these)
export type Layer1Code = CognitionCode;
export type Layer2Code = EmotionCode;
export type Layer3Code = SocialCode;
export type Layer4Code = ExecutionCode;

/** 4文字コード e.g. "ACIO", "NVEX", "SCIO" */
export type ArchetypeCode =
  | "ACIO" | "ACIX" | "ACEO" | "ACEX"
  | "AVIO" | "AVIX" | "AVEO" | "AVEX"
  | "NCIO" | "NCIX" | "NCEO" | "NCEX"
  | "NVIO" | "NVIX" | "NVEO" | "NVEX"
  | "SCIO" | "SCIX" | "SCEO" | "SCEX"
  | "SVIO" | "SVIX" | "SVEO" | "SVEX";

export interface AxisDef {
  code: string;
  label: string;
  englishLabel: string;
  description: string;
}

export const COGNITION_DEFS: Record<CognitionCode, AxisDef> = {
  A: {
    code: "A",
    label: "分析",
    englishLabel: "Analytical",
    description: "データ・論理・構造で世界を理解し、判断する",
  },
  N: {
    code: "N",
    label: "直感",
    englishLabel: "iNtuitive",
    description: "パターン・閃き・文脈の整合で本質を掴む",
  },
  S: {
    code: "S",
    label: "体感",
    englishLabel: "Sensory",
    description: "身体感覚・五感・実体験を通じて世界を知る",
  },
};

export const EMOTION_DEFS: Record<EmotionCode, AxisDef> = {
  C: {
    code: "C",
    label: "冷静",
    englishLabel: "Calm",
    description: "感情は制御下にある。波は小さく、判断を乱さない",
  },
  V: {
    code: "V",
    label: "情熱",
    englishLabel: "Vivid",
    description: "感情がはっきり動く。喜怒哀楽が表に出やすく、それが原動力になる",
  },
};

export const SOCIAL_DEFS: Record<SocialCode, AxisDef> = {
  I: {
    code: "I",
    label: "内向",
    englishLabel: "Internal",
    description: "一人の時間でエネルギーを充電する。内省が思考の源",
  },
  E: {
    code: "E",
    label: "外向",
    englishLabel: "External",
    description: "人といることでエネルギーが生まれる。対話が思考の起点",
  },
};

export const EXECUTION_DEFS: Record<ExecutionCode, AxisDef> = {
  O: {
    code: "O",
    label: "最適化",
    englishLabel: "Optimize",
    description: "最短距離を設計する。無駄を削り、効率と合理性を重んじる",
  },
  X: {
    code: "X",
    label: "探索",
    englishLabel: "eXplore",
    description: "試行錯誤を楽しむ。効率より発見、計画より適応を選ぶ",
  },
};

// Legacy aliases for backwards compatibility
export const LAYER1_DEFS = COGNITION_DEFS;
export const LAYER2_DEFS = EMOTION_DEFS;
export const LAYER3_DEFS = SOCIAL_DEFS;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Color Group (6 Groups: Cognition × Emotion)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ColorFamily = "navy" | "magenta" | "indigo" | "orange" | "emerald" | "gold";
export type ColorTone = "standard";

export interface ColorGroup {
  family: ColorFamily;
  tone: ColorTone;
  label: string;
  englishLabel: string;
  tagline: string;
}

export type ColorGroupKey = `${CognitionCode}_${EmotionCode}`;

export const COLOR_GROUPS: Record<ColorGroupKey, ColorGroup> = {
  A_C: {
    family: "navy",
    tone: "standard",
    label: "Architects",
    englishLabel: "Architects",
    tagline: "冷静に設計する者たち",
  },
  A_V: {
    family: "magenta",
    tone: "standard",
    label: "Ignitors",
    englishLabel: "Ignitors",
    tagline: "論理と情熱を両立する者たち",
  },
  N_C: {
    family: "indigo",
    tone: "standard",
    label: "Oracles",
    englishLabel: "Oracles",
    tagline: "静かに見通す者たち",
  },
  N_V: {
    family: "orange",
    tone: "standard",
    label: "Catalysts",
    englishLabel: "Catalysts",
    tagline: "閃きで世界を動かす者たち",
  },
  S_C: {
    family: "emerald",
    tone: "standard",
    label: "Artisans",
    englishLabel: "Artisans",
    tagline: "手と体で真実に触れる者たち",
  },
  S_V: {
    family: "gold",
    tone: "standard",
    label: "Dynamos",
    englishLabel: "Dynamos",
    tagline: "燃える体で世界を掴む者たち",
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Archetype Definition Interface
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 主観/客観の二面描写 */
export interface DualView {
  selfView: string;
  observedView: string;
}

export interface ArchetypeDef {
  code: ArchetypeCode;
  cognition: CognitionCode;
  emotion: EmotionCode;
  social: SocialCode;
  execution: ExecutionCode;
  name: string;
  englishName: string;
  emoji: string;
  tagline: string;
  description: string;
  strengths: string[];
  blindSpots: string[];
  safeState: string;
  stressState: string;
  growthKey: string;
  shadowCode: ArchetypeCode;
  shadowTension: string;
  dualView?: DualView;
  quote?: { text: string; author: string };
  motto?: string;
  midnightThought?: string;
  forbiddenPhrase?: string;
  secretDesire?: string;
  innerContradiction?: string;
  lovePattern?: string;
  childhoodScene?: string;
  romanticMatch?: {
    code: ArchetypeCode;
    attraction: string;
    dynamic: string;
    warning: string;
  };
  /** 根源的恐怖 — このタイプが最も恐れること */
  coreFear?: string;
  /** 根源的欲求 — このタイプが最も求めること */
  coreDesire?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 24 Archetype Definitions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const ARCHETYPE_DEFS: ArchetypeDef[] = [
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ARCHITECTS (A×C) — 分析×静 🔵 Navy
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    code: "ACIO",
    cognition: "A", emotion: "C", social: "I", execution: "O",
    name: "建築家",
    englishName: "Architect",
    emoji: "📐",
    tagline: "最短距離を設計する静かな頭脳。完璧な構造に美しさを見る",
    description: "頭の中に常に設計図がある。感情ではなくデータで判断し、一人で黙々と最適解を組み上げる。無駄を見ると物理的に不快になるタイプ。",
    strengths: ["筋の通った仕組みを作れる", "感情に流されず冷静に判断できる", "一人でも圧倒的な成果を出せる"],
    blindSpots: ["課題を3日前に終わらせてるのに、提出5分前までずっと修正してる。結局最初のバージョンと大差ない"],
    safeState: "日曜の朝、誰にも邪魔されずにスプレッドシートの構造を整えている。コーヒーが冷めていることにも気づかない",
    stressState: "提出物を何度もやり直して、気づいたら深夜2時。「もう一箇所だけ」が5回目",
    growthKey: "「とりあえず70点で出す」を今週一回やってみる。出してから直せばいい",
    shadowCode: "SVEX",
    shadowTension: "何も考えずに体ごと飛び込める人を見ると、うらやましいのかイラつくのか自分でもわからない",
    dualView: {
      selfView: "ちゃんとしたものを作りたいだけ。それの何が悪いの？",
      observedView: "完璧にこだわりすぎて動きが遅い。周りは「もう十分だよ」って思ってる",
    },
    quote: { text: "完璧とは、取り去るものがなくなった時に達せられる", author: "サン＝テグジュペリ" },
    motto: "設計は裏切らない",
    midnightThought: "あのとき70点で出してたら、今ごろどうなってたんだろう",
    forbiddenPhrase: "もうそれで十分じゃん、出しなよ",
    secretDesire: "本当は、誰かに「すごいね」って言われたい。でもそれを求めてる自分が嫌",
    innerContradiction: "完璧を求めるのに、完璧なものを一度も完成させたことがない",
    lovePattern: "好きな人ができると、関係性を「設計」しようとする。自然体でいられない",
    childhoodScene: "レゴを説明書通りに完璧に作り上げて、大人に褒められた瞬間",
    romanticMatch: {
      code: "NVEX",
      attraction: "自分にない予測不能さに惹かれる。計画通りにいかないことが、この人となら楽しい",
      dynamic: "片方が設計し、片方が壊す。でもその繰り返しが二人の成長になる",
      warning: "建築家が「もっとちゃんとして」と言い始めると関係が冷える",
    },
    coreFear: "不完全なまま人に見られること",
    coreDesire: "完璧な仕組みで、自分の存在価値を証明したい",
  },
  {
    code: "ACIX",
    cognition: "A", emotion: "C", social: "I", execution: "X",
    name: "発明家",
    englishName: "Inventor",
    emoji: "🔬",
    tagline: "思考の迷宮を楽しむ探究者。答えより問いに価値を見る",
    description: "答えより問いが好き。「なぜ？」の連鎖が快感で、気づいたら誰も興味のないテーマを一人で深掘りしている。アウトプットより思考プロセスが本体。",
    strengths: ["誰も思いつかない角度から問題を解ける", "知的好奇心が尽きない", "一つの問いに粘り強く向き合える"],
    blindSpots: ["飲み会で面白い話を思いついても、頭の中で推敲してるうちに話題が変わってる。毎回"],
    safeState: "Wikipediaのリンクを辿って4時間。最初に調べてたことは忘れたけど、今が一番面白い",
    stressState: "頭の中で同じ仮説をぐるぐる検証し続けて、気づいたら何も手につかないまま一日が終わる",
    growthKey: "「面白い」と思ったら3秒以内に口に出す。完璧な表現は後から直せばいい",
    shadowCode: "SVEO",
    shadowTension: "体を張って人を引っ張る人を見ると、胸がざわつく。自分は一人で考えてるだけで、誰の役にも立ってないんじゃないか——その考えが頭に居座ると、好きだった問いすら色褪せる",
    dualView: {
      selfView: "世界には面白い問いが無限にある。それを探すのが自分の役目",
      observedView: "頭の中では天才だけど、アウトプットが少なすぎる。もったいない",
    },
    quote: { text: "大切なのは、疑問を持ち続けることだ", author: "アインシュタイン" },
    motto: "問いが世界を変える",
    midnightThought: "あの仮説、まだ誰にも話してないけど、もしかしたら正しいかもしれない",
    forbiddenPhrase: "で、結局何が言いたいの？",
    secretDesire: "自分の発見で世界が変わる瞬間を、一度でいいから見てみたい",
    innerContradiction: "答えを見つけるのが怖い。見つけたら探す理由がなくなるから",
    lovePattern: "相手を分析しすぎて「あなたといると面接みたい」って言われる",
    childhoodScene: "図鑑を端から端まで読み尽くして、次の図鑑を求めた子ども時代",
    romanticMatch: {
      code: "SVIO",
      attraction: "自分の頭だけでは到達できない世界を、体と感覚で教えてくれる存在",
      dynamic: "知と体の補完。一緒にいると世界の解像度が二倍になる",
      warning: "発明家が理屈で相手の感覚を否定し始めると、芸術家は黙って離れる",
    },
    coreFear: "答えが見つかってしまうこと。探す理由がなくなること",
    coreDesire: "誰も気づいていない真実を、自分の手で見つけたい",
  },
  {
    code: "ACEO",
    cognition: "A", emotion: "C", social: "E", execution: "O",
    name: "軍師",
    englishName: "Strategist",
    emoji: "🗺️",
    tagline: "正しい答えは出せる。ただし、人がついてくるかは別問題",
    description: "頭では常に最善手を計算し、口では人を動かす。感情を変数として扱えるから判断が速い。ただし「合理的すぎて怖い」と思われていることに、本人だけ気づいていない。",
    strengths: ["複雑な状況を整理して最適な判断を下せる", "チームの力を最大化できる", "感情に流されず冷静にリードできる"],
    blindSpots: ["正論で会議を制圧した後、帰り道に「なんか空気悪かったな」と気づく。でも何が悪かったかわからない"],
    safeState: "チームの作業フローを最適化して、予定通りに成果が出ている。ホワイトボードの前で一人ニヤリとする",
    stressState: "「自分でやったほうが早い」が口癖になって、メンバーの仕事を巻き取り始める",
    growthKey: "結論を言う前に「みんなはどう思う？」と一回聞いてみる",
    shadowCode: "SVIX",
    shadowTension: "直感だけで動いて結果まで出す人を見ると、手が冷たくなる。自分が積み上げた分析を、一瞬の閃きが軽々と追い越していく。あの努力は何だったのかと認めたくない自分がいる",
    dualView: {
      selfView: "感情を排して最善手を打つ。それがリーダーの責任",
      observedView: "あなたの正論に反論できる人はいない。でもみんな、あなたに本音を言うのをやめてる。それに気づいてないのが一番怖い",
    },
    quote: { text: "勝つための最善の方法は、戦わずに勝つことだ", author: "孫子" },
    motto: "最善手を打て",
    midnightThought: "あの判断は正しかった。でも、あの人を傷つけたかもしれない",
    forbiddenPhrase: "もっと人の気持ち考えなよ",
    secretDesire: "本当は、正しさじゃなくて「あなたについていきたい」って言われたい",
    innerContradiction: "人を動かしたいのに、人の感情が一番の不確定要素で苦手",
    lovePattern: "恋愛も戦略的に進めようとして、「計算高い」と見抜かれて引かれる",
    childhoodScene: "グループ課題でいつもリーダーになって、計画を立てて全員を動かしていた子",
    romanticMatch: {
      code: "NVIO",
      attraction: "自分の冷静さが届かない感情の深みを、この人は言葉にできる",
      dynamic: "戦略と詩が出会うとき、驚くほど豊かな関係が生まれる",
      warning: "軍師が吟遊詩人の感情を「非効率」と切り捨てると、致命傷になる",
    },
    coreFear: "自分の判断が間違っていたと証明されること",
    coreDesire: "正しさではなく「あなたについていきたい」と言われたい",
  },
  {
    code: "ACEX",
    cognition: "A", emotion: "C", social: "E", execution: "X",
    name: "革命家",
    englishName: "Revolutionary",
    emoji: "🔥",
    tagline: "論理で未知を切り拓く開拓者。冷静に、しかし大胆に",
    description: "「おかしいものはおかしい」が生存本能。冷静にシステムの欠陥を見抜き、周囲を巻き込んで壊しにかかる。正論の破壊力を自覚していないのが、最大の武器であり弱点。",
    strengths: ["現状の問題を論理的に指摘できる", "人を巻き込みながら変革を起こせる", "リスクを冷静に計算した上で大胆に動ける"],
    blindSpots: ["『このやり方おかしくない？』って会議で言って空気凍らせるけど、代案がない。みんな内心「じゃあどうすんの」って思ってる"],
    safeState: "新しいプロジェクトの企画書を書いていて、仲間に「これ、面白くない？」と熱弁している瞬間",
    stressState: "「なんでこんな非効率なやり方してるの」が止まらなくなって、チームの空気が凍る",
    growthKey: "壊す前に「代わりにどうするか」を3行で書いてみる",
    shadowCode: "SCIO",
    shadowTension: "黙って一つのことを極め続ける人を見ると、喉が詰まる。自分は壊すことしかできないんじゃないか。壊した後に何も建てられない人間が「おかしい」と叫ぶのは、ただの破壊でしかない——その恐怖だけは誰にも言えない",
    dualView: {
      selfView: "おかしいことを「おかしい」と言ってるだけ。変えなきゃ意味ない",
      observedView: "あなたが去った後の会議室で、みんなが黙ってる。怒ってるんじゃない。あなたの正論に傷ついたことすら、言えない空気をあなたが作ってる",
    },
    quote: { text: "現状に満足する者に、革命は起こせない", author: "チェ・ゲバラ" },
    motto: "現状維持は後退だ",
    midnightThought: "壊したあと、ちゃんと新しいものを作れただろうか",
    forbiddenPhrase: "今のままでいいじゃん",
    secretDesire: "本当は、自分が作った新しい秩序の中で、安心して暮らしたい",
    innerContradiction: "安定を壊したいのに、壊した先に求めてるのは安定",
    lovePattern: "相手の「ここを直したほうがいい」を論理的に指摘して、ケンカになる",
    childhoodScene: "「なんでこのルールがあるの？」と先生に聞いて、答えられないと従わなかった子",
    romanticMatch: {
      code: "SCIX",
      attraction: "自分が見落とす細部を、静かに観察して教えてくれる。地に足のついた視点に救われる",
      dynamic: "革命家が旗を立て、哲学者が足元を固める。理想と現実の最強タッグ",
      warning: "革命家のスピードに哲学者がついていけないとき、置き去りにしてしまう",
    },
    coreFear: "壊した後に、何も建てられなかった自分を見ること",
    coreDesire: "自分が正しいと信じた新しい秩序を、この手で作りたい",
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // IGNITORS (A×V) — 分析×動 🟣 Magenta
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    code: "AVIO",
    cognition: "A", emotion: "V", social: "I", execution: "O",
    name: "構築者",
    englishName: "Builder",
    emoji: "🔨",
    tagline: "情熱を注いで完璧を追求する。妥協は存在しない",
    description: "論理的に考えて、情熱的に実行する。妥協が嫌いなのではなく、妥協した自分が嫌い。一人で没頭する時間が燃料で、そのクオリティで自分の価値を証明する。",
    strengths: ["圧倒的な集中力で成果を出せる", "論理と情熱の両方で人を動かせる", "一度決めたら絶対にやり抜く"],
    blindSpots: ["チームに「みんなもっと本気出そうよ」って言ったら、翌日から誰もランチに誘ってくれなくなった"],
    safeState: "締め切りまで残り3日。誰もいないオフィスで、自分が納得するクオリティに仕上げている。今が一番生きてる",
    stressState: "「このレベルじゃ出せない」と徹夜を重ねて、体調を崩す。でもまだ手を止められない",
    growthKey: "相手の100%は自分の70%かもしれない。「ありがとう」を先に言ってみる",
    shadowCode: "SCEX",
    shadowTension: "穏やかに場を支える人を見ると、自分の熱量が暴力に見えた瞬間を思い出して息が苦しくなる。あの時「もう少し力抜いて」と言われた顔が、今も消えない",
    dualView: {
      selfView: "本気じゃないなら、やる意味がない",
      observedView: "熱量がすごいけど、近くにいると疲れる。「もう少し力抜いて」と言いたい",
    },
    quote: { text: "情熱なしに達成された偉大なことは何もない", author: "ヘーゲル" },
    motto: "妥協するくらいなら壊してやり直せ",
    midnightThought: "自分はこんなに本気なのに、なんで周りは温度が違うんだろう",
    forbiddenPhrase: "そこまで頑張らなくてもよくない？",
    secretDesire: "本当は、同じ温度で燃えてくれる仲間がほしい",
    innerContradiction: "完璧を求めるのに、完璧な状態では退屈してしまう。常に何かが足りない",
    lovePattern: "好きな人に対して全力投球しすぎて、重いと言われる",
    childhoodScene: "自由研究に3ヶ月かけて、先生が驚くレベルのものを作り上げた子",
    romanticMatch: {
      code: "NCEX",
      attraction: "自分の情熱を受け止めつつ、見たことない世界を静かに見せてくれる",
      dynamic: "構築者が作り、開拓者が新しい地平を指し示す。終わりのない冒険になる",
      warning: "構築者の完璧主義が開拓者の自由を奪うと、開拓者は静かに消える",
    },
    coreFear: "自分が全力を出したものが「普通」と評価されること",
    coreDesire: "自分の基準で完璧なものを作り、それで世界を黙らせたい",
  },
  {
    code: "AVIX",
    cognition: "A", emotion: "V", social: "I", execution: "X",
    name: "錬金術師",
    englishName: "Alchemist",
    emoji: "⚗️",
    tagline: "感情を燃料に仮説を試し続ける。失敗は実験データ",
    description: "失敗を実験データとして回収できる稀有な脳の持ち主。感情の波をそのまま研究の燃料に変えて、夜中に一人で仮説と検証を繰り返す。生活リズムは崩壊しがち。",
    strengths: ["失敗から学ぶ力が飛び抜けている", "情熱と論理を同時に使える", "誰もやらなかった実験に手を出せる"],
    blindSpots: ["新しいアイデアに興奮して夜3時まで作業した結果、翌日の大事な予定をすっぽかす。これが月2回ある"],
    safeState: "深夜のデスクで、誰にも見せていない実験がうまくいった瞬間。ガッツポーズは小さめ",
    stressState: "実験が何度やっても失敗して、イライラから八つ当たりしてしまう。後から猛烈に後悔する",
    growthKey: "感情が爆発しそうなとき「10分だけ待つ」ルールを試してみる",
    shadowCode: "SCEO",
    shadowTension: "着実に組織を回す人を見ると、腹の奥が冷える。自分が「実験」と呼んでるものは、ただ一つのことを続ける忍耐がないだけじゃないのか。その問いが浮かぶと、次の仮説に逃げたくなる——それがもう答えだと薄々気づいている",
    dualView: {
      selfView: "世界は巨大な実験室。全部試してみないとわからない",
      observedView: "面白い人だけど、あなたの「実験」に巻き込まれた人は後片付けしてる。あなたが次に夢中になってる間に",
    },
    quote: { text: "私は失敗したのではない。うまくいかない方法を一万通り見つけたのだ", author: "エジソン" },
    motto: "混沌から金を取り出せ",
    midnightThought: "あの実験、もう一回やり方を変えたらうまくいくかもしれない",
    forbiddenPhrase: "いい加減、一つに絞ったら？",
    secretDesire: "自分の発見を誰かに「天才だ」と言ってほしい。でも素直に受け取れない",
    innerContradiction: "自由に実験したいのに、認められたい気持ちが足を引っ張る",
    lovePattern: "恋愛も「実験」として捉えがち。相手に「私は実験台じゃない」と怒られる",
    childhoodScene: "台所で謎の液体を混ぜて、親に怒られながらも目が輝いていた子",
    romanticMatch: {
      code: "NCIO",
      attraction: "自分のカオスを静かに見守り、核心だけを言い当ててくれる存在",
      dynamic: "錬金術師が実験し、先見者が意味を読み取る。発見が加速する",
      warning: "錬金術師のカオスに先見者が疲弊したとき、無言の距離が生まれる",
    },
    coreFear: "自分の情熱が誰にも理解されず、ただの変人で終わること",
    coreDesire: "混沌の中から、誰も見たことのないものを取り出したい",
  },
  {
    code: "AVEO",
    cognition: "A", emotion: "V", social: "E", execution: "O",
    name: "指揮官",
    englishName: "Commander",
    emoji: "⚔️",
    tagline: "データと熱量で軍団を率いる。止まったら、自分が壊れる",
    description: "データで武装し、情熱で人を動かす。「結果を出す」が人生のOSで、休むことに罪悪感がある。チームの先頭に立つのが自然だが、その理由が「一人になりたくないから」だとは自分でも気づいていない。",
    strengths: ["圧倒的なカリスマで人を引っ張れる", "論理と感情の両方で説得できる", "目標に向かって全速力で走れる"],
    blindSpots: ["体調悪くても「休んだら負け」と出社して、結局チーム全員にうつす。しかも本人は「大したことない」と思ってる"],
    safeState: "チームが目標を達成して、みんなが笑ってる。その中心に自分がいる。この瞬間のために生きてる",
    stressState: "数字が足りない。でも弱音を吐くわけにいかないから、さらに自分を追い込む。誰にも相談できない",
    growthKey: "今日一つだけ「やらないこと」を決めてみる。休むのも戦略",
    shadowCode: "SCIX",
    shadowTension: "静かに世界を観察する哲学者を見ると、自分がなぜこんなに走り続けるのかわからなくなる",
    dualView: {
      selfView: "結果で引っ張るリーダー。それが自分の生き方",
      observedView: "結果が出てないときの焦りが周りに伝わってる。プレッシャーをかけてる自覚がない",
    },
    quote: { text: "為せば成る、為さねば成らぬ何事も", author: "上杉鷹山" },
    motto: "結果で示せ",
    midnightThought: "結果を出し続けないと、誰も自分のそばにいてくれないのかな",
    forbiddenPhrase: "別にそこまで頑張らなくてよくない？",
    secretDesire: "本当は、何もしなくても「いてくれるだけでいい」って言われたい",
    innerContradiction: "人を引っ張りたいのに、引っ張る理由が「一人になりたくない」だったりする",
    lovePattern: "好きな人ができると、すぐ「この人のために結果出さなきゃ」モードに入る",
    childhoodScene: "テストで100点を取ったときだけ親が笑ってくれた子",
    romanticMatch: {
      code: "NVIX",
      attraction: "言葉にしなくても全部わかってくれる。結果を出さなくても受け止めてくれる感覚",
      dynamic: "片方が走り回って、片方が静かに見守る。帰ってきたら何も聞かずに受け止めてくれる",
      warning: "巫女の共感に甘えすぎて、弱さを言語化するのをサボると、巫女側が消耗する",
    },
    coreFear: "結果を出せなくなった自分には、誰もそばにいてくれないこと",
    coreDesire: "何もしなくても「いてくれるだけでいい」と言われたい",
  },
  {
    code: "AVEX",
    cognition: "A", emotion: "V", social: "E", execution: "X",
    name: "起業家",
    englishName: "Entrepreneur",
    emoji: "🚀",
    tagline: "論理と感情で常識を壊す。走りながら考える天才",
    description: "走りながら考え、失敗しながら学ぶ。計画を立てるより動いたほうが速いことを経験で知っている。ただし「完遂」が苦手で、始めたプロジェクトの墓場が脳内にある。",
    strengths: ["スピード感のある意思決定ができる", "失敗してもすぐ立ち直れる", "人を巻き込む熱量と論理を持っている"],
    blindSpots: ["「次はこれやりたい」のメモが30個あるけど、完成したのは2個。しかも両方とも他の人に仕上げてもらった"],
    safeState: "新しい企画を3つ同時に動かしてて、毎日違う人と打ち合わせ。カオスだけど、これが最高に楽しい",
    stressState: "全部中途半端なのに新しいことに手を出して、優先順位がぐちゃぐちゃ。怒りっぽくなる",
    growthKey: "今やってることを一つ「完了」にしてから次に行く。完遂の快感を一回知る",
    shadowCode: "SCIO",
    shadowTension: "一つのことを黙々と極めている人を見ると、笑えなくなる。自分の「次へ行こう」は好奇心じゃなくて、一つのことに留まる勇気がないだけかもしれない。それを認めたら、自分の全部が崩れる気がする",
    dualView: {
      selfView: "チャンスは一瞬。考えてる暇があったら動け",
      observedView: "エネルギーはすごいけど、散らかしっぱなし。後始末は誰がやるの？",
    },
    quote: { text: "最大のリスクは、リスクを取らないことだ", author: "マーク・ザッカーバーグ" },
    motto: "動いてから考えろ",
    midnightThought: "あのプロジェクト、途中で投げ出したの、まだちょっと後悔してる",
    forbiddenPhrase: "また新しいこと始めたの？前のはどうなったの？",
    secretDesire: "本当は、一つのことをずっと続けられる人になりたい",
    innerContradiction: "自由を求めるのに、自由すぎると不安になる。枠が必要なのに枠を壊す",
    lovePattern: "恋愛初期は猛烈にアプローチ。でも安定すると新鮮味を求めて目移りしがち",
    childhoodScene: "何にでも手を出して、全部中途半端って言われたけど、それが楽しかった子",
    romanticMatch: {
      code: "NCIX",
      attraction: "自分が見落とす深みを、静かに、確実に見ている人。落ち着く",
      dynamic: "起業家が走り、陰陽師が見通す。二人で盲点がなくなる",
      warning: "起業家のスピードに陰陽師がストレスを感じたとき、黙って距離を取られる",
    },
    coreFear: "一つのことに縛られて、可能性を失うこと",
    coreDesire: "何かを最後までやり遂げた自分を、一度でいいから見てみたい",
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ORACLES (N×C) — 直感×静 🔮 Indigo
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    code: "NCIO",
    cognition: "N", emotion: "C", social: "I", execution: "O",
    name: "先見者",
    englishName: "Visionary",
    emoji: "🔭",
    tagline: "少ない言葉で核心を突く。静寂の中に全てが見える",
    description: "沈黙の中に全てが見える。発言は少ないが、一言が的確すぎて周りがハッとする。「なんでわかったの？」と聞かれても、説明できない。見えたものは見えただけ。",
    strengths: ["本質を一言で言い当てられる", "長期的な視野で判断できる", "雑音に惑わされない"],
    blindSpots: ["後から「あのとき言えばよかった」って思うアドバイスが毎回ある。でも言うタイミングを逃して、相手はもう手遅れ"],
    safeState: "カフェの隅で本を読んでいて、ふと全てが繋がる瞬間が来る。静かに「なるほど」とつぶやく",
    stressState: "LINEの通知を全部無視。誰とも会いたくない。自分の殻に閉じこもって、何日も出てこない",
    growthKey: "「ちょっと思ったんだけど」を今日一回使ってみる。完璧な言葉じゃなくていい",
    shadowCode: "SVEO",
    shadowTension: "体一つで現場を変えてしまう人を見ると、胃の底が重くなる。自分は全部「見えている」のに何も動かせていない。見えることと動けることは全く違うと知った瞬間、この能力が呪いに変わる",
    dualView: {
      selfView: "見えてるものを見えてるままに受け取っているだけ",
      observedView: "静かすぎて何を考えてるかわからない。でも発言すると的確すぎて怖い",
    },
    quote: { text: "多くを語るな。すべてを見よ", author: "老子" },
    motto: "見えるものは語らずとも伝わる",
    midnightThought: "あの時もっとちゃんと伝えていたら、あの人は違う道を選んだかもしれない",
    forbiddenPhrase: "何考えてるかわからないんだけど",
    secretDesire: "言葉にしなくても、全部わかってくれる人がほしい",
    innerContradiction: "全部見えてるのに、自分のことだけは見えない",
    lovePattern: "好きな人に対して「言わなくても伝わるはず」と思い込んで、すれ違う",
    childhoodScene: "みんなが騒いでいる教室の隅で窓の外を見ていた。でも誰よりも多くのことに気づいていた",
    romanticMatch: {
      code: "AVIX",
      attraction: "自分が見ているビジョンに、情熱で色を塗ってくれる。世界が立体になる",
      dynamic: "先見者が方向を示し、錬金術師が実験で形にする。静と動の理想的な補完",
      warning: "先見者の沈黙を錬金術師が「興味がない」と誤解すると溝が深まる",
    },
    coreFear: "見えているのに伝えられず、大切な人を守れないこと",
    coreDesire: "言葉にしなくても、全てをわかってくれる人がほしい",
  },
  {
    code: "NCIX",
    cognition: "N", emotion: "C", social: "I", execution: "X",
    name: "陰陽師",
    englishName: "Onmyoji",
    emoji: "☯️",
    tagline: "直感の海に静かに潜る。見えないものを見る探索者",
    description: "目に見えないものが見える。人の言葉の裏側、場の空気の変化、まだ起きていないことの予兆。その読みは時々不気味なほど正確だが、本人にとっては「普通に感じ取っているだけ」。",
    strengths: ["目に見えない法則を感じ取れる", "内なる世界が豊かで創造性がある", "独自の視点で物事を捉えられる"],
    blindSpots: ["友達と会ってるのに、頭の中は別の世界にいる。「聞いてた？」って言われてハッとするのが日常"],
    safeState: "散歩中に、空の色と昨日の会話が繋がって新しい理解が生まれる。誰にも言わないけど、今日は良い日",
    stressState: "現実が遠くなる。話しかけられても上の空で、自分でも何を考えてるかわからなくなる",
    growthKey: "見えてるものを一人だけに話してみる。「こう感じるんだけど」から始める",
    shadowCode: "AVEO",
    shadowTension: "データと情熱で現実を動かす人を見ると、体が強張る。自分が「見えている」と信じてきたものは、現実に触れる勇気がない人間の逃げ場だったのかもしれない——その疑いが一度浮かぶと、数日間何も感じ取れなくなる",
    dualView: {
      selfView: "見えない世界にこそ真実がある。それを探るのが自分の使命",
      observedView: "独特すぎて何を言ってるかわからないことがある。でも時々、鳥肌が立つほど正しい",
    },
    quote: { text: "大切なものは目に見えない", author: "サン＝テグジュペリ" },
    motto: "見えないものこそ真実",
    midnightThought: "この世界の裏側に、誰も気づいていないもう一つの秩序があるはず",
    forbiddenPhrase: "現実見なよ",
    secretDesire: "自分の見ている世界を、誰か一人だけでも「わかる」と言ってほしい",
    innerContradiction: "この世の法則を読みたいのに、自分自身のことはコントロールできない",
    lovePattern: "相手の深層心理を読みすぎて、本人より先に気づいてしまう。「怖い」と言われる",
    childhoodScene: "夜空の星を見ながら、星同士の関係に物語を感じていた子",
    romanticMatch: {
      code: "AVEX",
      attraction: "自分の直感を現実世界で爆発的に動かしてくれるエネルギー",
      dynamic: "陰陽師が「こっちだ」と示し、起業家が全速力で走る。不思議と当たる",
      warning: "起業家のスピードについていけないと、黙って距離を置いてしまう",
    },
    coreFear: "自分の見ている世界が、ただの妄想だったと気づくこと",
    coreDesire: "自分が感じ取っている「見えない秩序」を、誰か一人にだけでもわかってほしい",
  },
  {
    code: "NCEO",
    cognition: "N", emotion: "C", social: "E", execution: "O",
    name: "預言者",
    englishName: "Prophet",
    emoji: "🌟",
    tagline: "見えている未来を語る。問題は、それが正しいと確信しすぎること",
    description: "未来が見える確信を持ち、それを冷静に語ることで人を導く。「こうなる」という予感が外れたことがほとんどない。問題は、その確信が強すぎて「間違っている可能性」を受け入れられないこと。",
    strengths: ["ビジョンを言語化して伝えられる", "冷静な説得力がある", "長期的な方向性を示せる"],
    blindSpots: ["プレゼンで反論されると「この人は見えてない」と内心思ってるのが顔に出てる。周りにはバレてる"],
    safeState: "自分のビジョンを語ったとき、チームの目が変わる瞬間。「見えた？」って確認するまでもなく、みんなが動き出す",
    stressState: "「それ、本当にうまくいくの？」と聞かれるたびに苛立つ。見えてない人に説明するのが、もう疲れた",
    growthKey: "反論されたとき「もう少し教えて」と一回だけ言ってみる。相手の顔が変わる瞬間がある",
    shadowCode: "SVIX",
    shadowTension: "体ごと未知に飛び込んで傷だらけで帰ってくる人を見ると、手が震える。自分は「未来が見える」と言いながら、一歩も動いていない。語ることで動いた気になっている自分に気づくと、吐き気がする",
    dualView: {
      selfView: "見えている未来を伝えるのは、自分にしかできない使命",
      observedView: "あなたのビジョンに反対意見を言った人が、次の会議から来なくなったのに気づいてる？あなたは「見えてない人」と片付けたけど、あの人はただ別の未来が見えていただけ",
    },
    quote: { text: "未来を予測する最善の方法は、未来を創造することだ", author: "ピーター・ドラッカー" },
    motto: "見える未来を現実にせよ",
    midnightThought: "自分が見ている未来は本当に正しいのか。間違っていたら、ついてきた人はどうなる",
    forbiddenPhrase: "それ、あなたの思い込みじゃない？",
    secretDesire: "間違いを認められる強さがほしい。でもそれをしたら、ついてくる人がいなくなる気がする",
    innerContradiction: "未来を見通す力を信じているのに、その力を疑うことが怖い",
    lovePattern: "相手の将来性を見すぎて、今のその人を見逃しがち",
    childhoodScene: "「大きくなったら世界はこうなる」と語って、大人たちに微笑まれた子",
    romanticMatch: {
      code: "SVIO",
      attraction: "言葉ではなく体と感覚で真実を掴む人。自分にない「今ここ」の力に惹かれる",
      dynamic: "預言者が未来を語り、芸術家が今を生きる。二人でいると時間軸が完成する",
      warning: "預言者が「もっと先を見て」と急かすと、芸術家は窒息する",
    },
    coreFear: "自分のビジョンが間違っていて、ついてきた人を裏切ること",
    coreDesire: "見えている未来を現実にして、「あの人が言った通りだった」と証明したい",
  },
  {
    code: "NCEX",
    cognition: "N", emotion: "C", social: "E", execution: "X",
    name: "開拓者",
    englishName: "Pioneer",
    emoji: "🧭",
    tagline: "見えないものを見て、新しい道を示す。冒険は直感が導く",
    description: "「まだ誰もいない場所」に最初に行く人。直感で方向を決めて、冷静にリスクを計算しながら未知に飛び込む。振り返ると誰もついてきていないことが多い。でも後悔はしない。",
    strengths: ["誰も行ったことない場所に最初に行ける", "直感でチャンスを掴める", "冷静に未知のリスクを判断できる"],
    blindSpots: ["旅先で最高のスポット見つけたのに、一緒に行ける人がいない。いつも「あの時一人だったな」って後から思う"],
    safeState: "初めて行く街で、ガイドブックに載ってない場所を見つけた瞬間。「ここだ」という直感が走る",
    stressState: "すごい発見をしたのに、一緒に喜んでくれる人がいない。SNSに上げても反応が薄い。孤独がじわじわ来る",
    growthKey: "次の冒険に誰か一人誘ってみる。「一緒に行かない？」を言うだけでいい",
    shadowCode: "SVIO",
    shadowTension: "一つの場所に根を張って、そこで深く愛されている人を見ると、胸の奥がきしむ。自分が「新しい場所」を求め続けるのは、どこにいても「ここじゃない」と感じてしまう病気なんじゃないか——旅先の夜、その考えが浮かぶと眠れなくなる",
    dualView: {
      selfView: "まだ誰も見ていない景色がある。それを見に行くのが自分の役目",
      observedView: "あなたが見つけた素晴らしい場所の話をしてくれるたび、みんな思ってる。「で、あの時一緒に行こうって誘った人たちは？」って。あなたはいつも一人で行って、一人で帰ってくる",
    },
    quote: { text: "人の行く裏に道あり花の山", author: "千利休" },
    motto: "まだ見ぬ先へ",
    midnightThought: "この先に何があるかわからない。でも戻りたくない。ここまで来たから",
    forbiddenPhrase: "もう十分探したでしょ？そろそろ落ち着いたら？",
    secretDesire: "探索の果てに、「ここが自分の場所だ」と思える場所を見つけたい",
    innerContradiction: "新しい場所を求め続けるのに、見つけてもすぐ次を探してしまう",
    lovePattern: "距離が縮まると急に「次の冒険」に意識が向いて、相手を置いて行ってしまう",
    childhoodScene: "家族旅行で一人だけ違う道に入って迷子になったけど、最高の景色を見つけた子",
    romanticMatch: {
      code: "AVIO",
      attraction: "自分が見つけた可能性を、情熱と分析力で形にしてくれる人。発見が現実になる",
      dynamic: "開拓者が道を見つけ、構築者が橋を架ける。フロンティアに街ができる",
      warning: "構築者の完璧主義に開拓者が窮屈を感じたとき、黙って旅立ってしまう",
    },
    coreFear: "探索の先に何もなかったこと。全てが無意味だったと気づくこと",
    coreDesire: "「ここが自分の場所だ」と思える場所を、旅の果てに見つけたい",
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CATALYSTS (N×V) — 直感×動 🟠 Orange
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    code: "NVIO",
    cognition: "N", emotion: "V", social: "I", execution: "O",
    name: "吟遊詩人",
    englishName: "Bard",
    emoji: "🎻",
    tagline: "内なる嵐を言葉に変える。感情を最も美しい形で結晶させる",
    description: "胸の中に常に嵐がある。その嵐を言葉や作品に変換することが、唯一の呼吸法。完璧な表現が見つかるまで世に出せないから、下書きフォルダは膨大。でもそこにこそ本当の自分がいる。",
    strengths: ["感情を正確に言語化できる稀有な能力", "深い共感力と表現力を持つ", "一人の時間で驚くほど豊かな作品を生む"],
    blindSpots: ["書きかけの詩が50個ある。どれも完璧じゃないから出せない。でも本当は、出すのが怖いだけ"],
    safeState: "深夜、ノートに一行だけ完璧な文章が書けた。誰にも見せないけど、これだけで今日は報われた",
    stressState: "伝えたい感情があるのに、言葉にならない。胸が苦しくて、ベッドから出られない日が続く",
    growthKey: "下書きの中から一つ選んで、一人だけに見せてみる。「まだ途中だけど」でいい",
    shadowCode: "ACEO",
    shadowTension: "感情を排して冷静に人を動かす人を見ると、体が冷える。自分の感情は「創作の源」じゃなくて、ただ感情に振り回されてるだけなんじゃないか。あの人は感情なしで結果を出してる——自分の感受性は才能じゃなくて障害かもしれない、と思う夜がある",
    dualView: {
      selfView: "この感情を言葉にしないと、自分が壊れてしまう",
      observedView: "下書きフォルダに眠ってる作品の数、知ってる？あなたが「まだ完璧じゃない」と言うたびに、世界はあなたの言葉を一つ失ってる。完璧じゃなくても届く言葉があることを、あなただけが信じてない",
    },
    quote: { text: "言葉にできないものを、言葉にする。それが詩だ", author: "谷川俊太郎" },
    motto: "言葉にならない感情を、言葉にする",
    midnightThought: "この胸の中のものを、完璧に表現できる日は来るんだろうか",
    forbiddenPhrase: "そんな繊細じゃ社会でやっていけないよ",
    secretDesire: "自分の作品を通じて、「あなたは一人じゃない」と誰かに伝えたい",
    innerContradiction: "感情を表現したいのに、表現することで感情が変質する気がして怖い",
    lovePattern: "好きな人への感情を作品で表現するけど、直接は何も言えない",
    childhoodScene: "日記に誰にも見せられないことを書き続けていた子。その日記が宝物だった",
    romanticMatch: {
      code: "ACEO",
      attraction: "自分の感情の嵐を、冷静に受け止めてくれる安心感。壊れない人がそばにいる",
      dynamic: "詩人が感じ、軍師が整理する。感情と論理が美しく噛み合う",
      warning: "軍師が「もっと合理的に」と言った瞬間、詩人は心を閉ざす",
    },
    coreFear: "自分の感情を完璧に表現できないまま、消えてしまうこと",
    coreDesire: "この胸の中のものを、いつか完璧な言葉にしたい",
  },
  {
    code: "NVIX",
    cognition: "N", emotion: "V", social: "I", execution: "X",
    name: "巫女",
    englishName: "Oracle",
    emoji: "🌙",
    tagline: "感情と直感で世界を読み替える。言葉なしで全てを感じ取る",
    description: "人の感情を受信するアンテナが常にON。言葉にならないものを感じ取り、相手より先に相手の本音に気づく。その感受性は力でもあるが、自分と他人の感情の境界線が曖昧になる危険と隣り合わせ。",
    strengths: ["言葉にならないものを感じ取れる", "他者の深層心理に触れられる", "独自の世界観で新しい意味を見出す"],
    blindSpots: ["友達の相談に乗った後、自分がぐったり疲れてる。しかも相手は元気になって帰っていく。このパターン、もう何十回目？"],
    safeState: "信頼できる人のそばで、何も話さなくていい時間。ただ一緒にいるだけで、全部わかり合えてる感覚",
    stressState: "友達の悩みを聞いた後、その人の感情が自分の中に残って抜けない。帰り道に泣いてることがある",
    growthKey: "相談に乗る前に「今日は30分だけね」と伝えてみる。境界線は優しさの一部",
    shadowCode: "AVEO",
    shadowTension: "自分の意志で世界を動かしている人を見ると、膝の力が抜ける。自分は「感じ取る力」を誇ってきたけど、それは自分の意志がないことを美しく言い換えてるだけかもしれない。他人の感情を受信し続けて、自分の感情がどれなのかもうわからない",
    dualView: {
      selfView: "言葉にしなくても、わかるものはわかる。それが自分の力",
      observedView: "あなたに相談した人はみんな元気になって帰る。でも帰り道のあなたの顔を、誰も見たことがない。あなたは他人の感情の通り道になってて、自分自身がどこにいるのか見失ってる",
    },
    quote: { text: "他人の痛みを自分のものとして感じよ", author: "ガンジー" },
    motto: "感じることが、知ること",
    midnightThought: "今日誰かのために泣いたけど、あの涙は本当に自分のものだったのかな",
    forbiddenPhrase: "気にしすぎだよ、考えすぎ",
    secretDesire: "自分の感受性を「弱さ」じゃなく「力」として認めてほしい",
    innerContradiction: "全てを感じ取りたいのに、感じすぎると壊れてしまう",
    lovePattern: "相手の感情に合わせすぎて、自分の本当の気持ちがわからなくなる",
    childhoodScene: "友達が泣いていると自分も泣いてしまう子。「優しいね」と言われたけど、自分でも止められなかった",
    romanticMatch: {
      code: "AVEO",
      attraction: "自分が受け止めきれない世界を、力強く切り拓いてくれる。守られている安心感",
      dynamic: "指揮官が世界を動かし、巫女がその魂を守る。最強の補完関係",
      warning: "指揮官が巫女の感受性を「弱さ」と見なした瞬間、関係は壊れる",
    },
    coreFear: "感じすぎて壊れること。自分と他人の境界が消えること",
    coreDesire: "この感受性を「弱さ」ではなく「力」として認めてほしい",
  },
  {
    code: "NVEO",
    cognition: "N", emotion: "V", social: "E", execution: "O",
    name: "外交官",
    englishName: "Diplomat",
    emoji: "🕊️",
    tagline: "みんなの橋になって、自分だけ渡る先がない",
    description: "人の心を直感で読んで、情熱で橋を架ける。「みんなが幸せなら自分も幸せ」が本音だが、自分の幸せが何かを聞かれると黙ってしまう。全員の味方でいようとして、自分だけ味方がいない。",
    strengths: ["人の心を直感で掴める", "情熱で人を動かせる", "理想に向かって戦略的に人を繋げる"],
    blindSpots: ["飲み会のセッティングは完璧なのに、自分だけ深い話をする相手がいない。みんなの橋渡しはできるのに、自分の橋がない"],
    safeState: "みんなの予定を調整して、全員が楽しめるイベントを作り上げた瞬間。自分のことは後でいい",
    stressState: "ずっと人のために動いてきたのに、ふと「自分は誰に頼ればいいの」と思って涙が出る",
    growthKey: "「実はちょっとしんどい」を信頼できる一人に言ってみる。助けを求めるのも強さ",
    shadowCode: "SCIX",
    shadowTension: "一人で平気な人を見ると、心臓を掴まれた気がする。自分が「みんなのために」と走り回るのは、一人になったら自分が空っぽだと気づくのが怖いからじゃないか。誰かの役に立ってないと、存在していい理由がなくなる——その恐怖は絶対に口にできない",
    dualView: {
      selfView: "みんなが幸せなら、自分も幸せ。それが自然じゃない？",
      observedView: "あなたが幹事をやってくれるから助かる。でも「あなた自身は何がしたいの？」って聞くと、一瞬固まるよね。その沈黙の長さに、みんなちょっとドキッとしてる",
    },
    quote: { text: "一人の夢はただの夢。みんなの夢は現実になる", author: "オノ・ヨーコ" },
    motto: "橋を架ける者になれ",
    midnightThought: "あの人のために頑張ったけど、自分は何が欲しかったんだっけ",
    forbiddenPhrase: "あなた、自分のことちゃんと考えてる？",
    secretDesire: "本当は、自分が助けてもらう番がほしい。でも弱みを見せられない",
    innerContradiction: "人を助けたいのに、助ける動機が「自分の価値を証明したい」だったりする",
    lovePattern: "相手を理想化しすぎて、現実の相手が見えなくなる",
    childhoodScene: "友達のケンカを仲裁して、両方から感謝された時の快感が忘れられない子",
    romanticMatch: {
      code: "ACIO",
      attraction: "感情に流されない冷静さに救われる。自分が見失いがちな論理を補ってくれる",
      dynamic: "外交官が人の心を掴み、建築家が仕組みを作る。理想が現実になる",
      warning: "外交官の感情に建築家が「非論理的」と言った瞬間、外交官は深く傷つく",
    },
    coreFear: "みんなのために動いた結果、自分だけが誰にも助けてもらえないこと",
    coreDesire: "自分も誰かに「大丈夫？」と聞いてもらいたい",
  },
  {
    code: "NVEX",
    cognition: "N", emotion: "V", social: "E", execution: "X",
    name: "侵略者",
    englishName: "Invader",
    emoji: "⚡",
    tagline: "予測不能。常識の外から世界を塗り替える",
    description: "全てのスイッチが全開。既存のルールは「誰かが勝手に決めたもの」でしかなく、自分の感情のエネルギーで世界を塗り替えようとする。刺激的だが、巻き込まれた側の感想は「すごいけど怖い」。",
    strengths: ["誰も想像しなかった解を生み出せる", "場の空気を一瞬で変えられる", "恐れを知らない行動力"],
    blindSpots: ["飲み会で盛り上がって「これやろうよ！」って決めたこと、翌日みんな覚えてない。自分だけ本気だったことに気づく"],
    safeState: "仲間と一緒に「これ、やばくない？」って新しいことを始める瞬間。全員の目が光ってる",
    stressState: "感情が制御不能になって、大事な人間関係に爆弾を落とす。後から「やりすぎた」って気づいても遅い",
    growthKey: "壊す前に「これ大事にしてる人いる？」と3秒だけ考えてみる",
    shadowCode: "ACIO",
    shadowTension: "静かに完璧な仕組みを作る建築家を見ると、自分の破壊衝動が怖くなる",
    dualView: {
      selfView: "ルールなんて誰かが勝手に決めたもの。もっと面白い世界がある",
      observedView: "すごいけど怖い。一緒にいると刺激的だけど、振り回される",
    },
    quote: { text: "常識とは、18歳までに集めた偏見のコレクションだ", author: "アインシュタイン" },
    motto: "退屈なら、壊して作り直せ",
    midnightThought: "自分が壊したものの中に、大切なものがあったかもしれない",
    forbiddenPhrase: "もう少し周りのこと考えてくれない？",
    secretDesire: "本当は、自分を丸ごと受け入れてくれる場所がほしい。暴れなくていい場所",
    innerContradiction: "自由を求めて壊し続けるけど、壊した後に残る空虚が怖い",
    lovePattern: "好きな人の日常をかき回してしまう。「あなたといると退屈しない」は褒め言葉",
    childhoodScene: "学芸会で台本を無視してアドリブで演じて、先生は怒ったけど観客は大爆笑だった",
    romanticMatch: {
      code: "ACIO",
      attraction: "自分の嵐を受け止めて、壊れない人。冷静さに安心する",
      dynamic: "侵略者が壊し、建築家が再設計する。二人で世界をアップデートし続ける",
      warning: "建築家の秩序を壊しすぎると、建築家が静かに心を閉ざす",
    },
    coreFear: "壊した後に何も残らないこと。空虚だけが残ること",
    coreDesire: "自分を丸ごと受け入れてくれる場所がほしい。暴れなくていい場所",
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ARTISANS (S×C) — 体感×静 🟢 Emerald
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    code: "SCIO",
    cognition: "S", emotion: "C", social: "I", execution: "O",
    name: "慧眼者",
    englishName: "Discerner",
    emoji: "🔍",
    tagline: "黙って手を動かし、極める。最高傑作は、まだ誰にも見せていない",
    description: "手を動かすことでしか到達できない真実がある、と体で知っている。口数は少ないが、作品を見ればその人の全てがわかる。問題は、完璧なものができても「まだ人に見せるレベルじゃない」と思ってしまうこと。",
    strengths: ["職人的な精度と集中力", "本物と偽物を見分ける眼力", "静かに極め続ける忍耐力"],
    blindSpots: ["すごいもの作ってるのに、SNSに上げられない。「まだ完成してないから」が口癖。永遠に完成しない"],
    safeState: "作業台の前で、黙々と手を動かしている。気づいたら6時間。でも最高の出来",
    stressState: "完成したのに「まだダメ」と感じて、人に見せられない。引き出しの中に眠る未公開作品が増えていく",
    growthKey: "作ったものを今日一つだけ、一人だけに見せてみる。感想を聞くだけでいい",
    shadowCode: "AVEX",
    shadowTension: "大した腕もないのに堂々と発信して評価されている人を見ると、手が止まる。自分のほうが上手いのに、と思ってしまう自分が醜い。でも「いいものを作れば伝わる」が嘘かもしれないと気づいた瞬間、何のために作ってきたのかわからなくなる",
    dualView: {
      selfView: "いいものを作ればわかる人にはわかる。それでいい",
      observedView: "あなたの作品は本当にすごい。でも誰にも見せないまま引き出しに眠らせるのは、「完璧じゃないから」じゃなくて「見せて否定されるのが怖い」から。あなた自身がそれに気づいてないのが一番もったいない",
    },
    quote: { text: "神は細部に宿る", author: "ミース・ファン・デル・ローエ" },
    motto: "技は嘘をつかない",
    midnightThought: "あの作品、もう少しだけ良くできたはずなのに",
    forbiddenPhrase: "もっと自分をアピールしなよ",
    secretDesire: "黙っていても、自分の作品で全てが伝わる世界がほしい",
    innerContradiction: "評価されなくていいと言いながら、見てくれている人がいないと寂しい",
    lovePattern: "気持ちを言葉にしないで、行動で示そうとする。相手に伝わらなくて困る",
    childhoodScene: "折り紙を何時間も折り続けて、完璧な鶴ができた時の満足感",
    romanticMatch: {
      code: "NVEO",
      attraction: "自分が言葉にできない感情を、この人は豊かに表現してくれる",
      dynamic: "慧眼者が黙って作り、外交官が世界に伝える。最高の分業",
      warning: "外交官の社交的な世界に慧眼者がついていけないとき、疲弊する",
    },
    coreFear: "自分の作品が世に出る前に、誰かにもっと上手くやられること",
    coreDesire: "作品だけで全てが伝わる世界がほしい。言葉はいらない",
  },
  {
    code: "SCIX",
    cognition: "S", emotion: "C", social: "I", execution: "X",
    name: "哲学者",
    englishName: "Philosopher",
    emoji: "📚",
    tagline: "五感で世界を観察し、静かに集める。体験が思想になる",
    description: "五感で世界を味わい、そこから独自の哲学を組み立てる。触って、嗅いで、歩いて、考える。急がない。でも「もう少し早く動いてほしい」は一番言われたくない言葉。",
    strengths: ["体験に基づいた深い洞察力", "焦らず物事を見極められる", "地に足のついた独自の世界観を持つ"],
    blindSpots: ["気になるカフェを見つけて、メニューをネットで30分調べて、結局行かない。半年後にその店が閉まってたことを知る"],
    safeState: "新しい料理を作って、じっくり味わっている。この食感に名前をつけたい。今日の体験を噛み締める時間",
    stressState: "「やらなきゃ」と思うのに体が動かない。考えれば考えるほど動けなくなる。自分が嫌になる",
    growthKey: "「あ、いいな」と思った店に、今日中に入ってみる。考えるのは出た後でいい",
    shadowCode: "AVEO",
    shadowTension: "迷わず即決して結果を出す人を見ると、足が重くなる。自分が「じっくり考える」と呼んでいるものは、ただ動くのが怖いだけなんじゃないか。考え続ければ失敗しない——でも何も始まらない。その事実が夜になると喉元まで上がってくる",
    dualView: {
      selfView: "ゆっくり考えないと、本当のことはわからない",
      observedView: "あなたの洞察はいつも深い。でも「もう少し考えさせて」と言ったまま半年経ってることがある。考えてるんじゃなくて、決めるのを先延ばしにしてるだけだって、周りは気づいてる",
    },
    quote: { text: "急がば回れ", author: "日本のことわざ" },
    motto: "体験が真実を教える",
    midnightThought: "今日触れたあの質感に、まだ言語化できていない意味がある気がする",
    forbiddenPhrase: "いつまで考えてるの？さっさと動きなよ",
    secretDesire: "自分のペースで世界を味わい尽くしたい。急かされたくない",
    innerContradiction: "全てを知りたいのに、知れば知るほど答えが遠のく",
    lovePattern: "相手をじっくり観察しすぎて、告白のタイミングを逃す。「もう遅いよ」がお決まり",
    childhoodScene: "道端の花を10分間見つめていて、友達に置いていかれた。でも後悔はなかった",
    romanticMatch: {
      code: "ACEX",
      attraction: "自分が観察して溜めた洞察を、行動力で現実に変えてくれる人",
      dynamic: "哲学者が本質を見抜き、革命家が世界を変える。深さと速さの融合",
      warning: "革命家のスピードに哲学者が焦りを感じると、観察の質が落ちる",
    },
    coreFear: "急かされて、本質を見落としたまま判断してしまうこと",
    coreDesire: "自分のペースで世界を味わい尽くしたい。誰にも急かされずに",
  },
  {
    code: "SCEO",
    cognition: "S", emotion: "C", social: "E", execution: "O",
    name: "参謀",
    englishName: "Advisor",
    emoji: "🏛️",
    tagline: "この人がいなくなると、全部止まる。でも誰もそれに気づいていない",
    description: "派手さはゼロ。でもこの人が一週間休んだら、チームが崩壊することに全員が気づく。現場の空気を読んで、最適な判断を最適なタイミングで下す。組織の「見えない骨格」。",
    strengths: ["安定感のある実務能力", "現場の空気を読んで最適な判断ができる", "誰からも信頼される堅実さ"],
    blindSpots: ["チームが新しいツールを導入しようとすると「今のままでいいのでは」と言ってしまう。みんなが遠慮して反論しないのが余計に怖い"],
    safeState: "チームの業務フローが完璧に回っている。誰も気づかないけど、この安定は自分が作った",
    stressState: "「来月からやり方変わります」と言われて、胃がキリキリする。今のままでうまくいってるのに、なぜ？",
    growthKey: "今月一つだけ「やったことないこと」を試してみる。小さいことでいい",
    shadowCode: "AVIX",
    shadowTension: "ルールを無視して自由に実験する人を見ると、胸が締めつけられる。自分が「守る」と呼んでいるものは、変化が怖いだけかもしれない。本当はもう、この仕組みが最善じゃないと気づいてる。でも壊したら自分の居場所がなくなる",
    dualView: {
      selfView: "誰かがちゃんと回さないと、全部崩れる。それが自分の役目",
      observedView: "あなたが一週間休んだらチームは困る。でもそれ、あなたが誰にもやり方を教えないからでしょ？「自分がいないと回らない」状況を、無意識に作ってるの、気づいてる？",
    },
    quote: { text: "偉大なことは、小さなことの積み重ねである", author: "ファン・ゴッホ" },
    motto: "守ることが、一番の仕事",
    midnightThought: "自分がいなくなっても、この組織はちゃんと回るんだろうか",
    forbiddenPhrase: "あなたがいなくても大丈夫だよ",
    secretDesire: "本当は、もっと自由にやってみたい。でも誰かが守らないと",
    innerContradiction: "安定を守りたいのに、安定した日々に退屈を感じてしまう",
    lovePattern: "相手を支えることに徹して、自分の欲求を後回しにする。尽くしすぎて重い",
    childhoodScene: "クラスの係活動を毎日欠かさずやっていた子。誰も気づかないけど、自分がやらないと困る",
    romanticMatch: {
      code: "AVIX",
      attraction: "自分にない情熱と実験精神に惹かれる。退屈な日常が彩られる",
      dynamic: "参謀が土台を固め、錬金術師が実験する。安定と刺激の最適バランス",
      warning: "錬金術師のカオスが限度を超えると、参謀は疲弊して黙る",
    },
    coreFear: "自分がいなくなっても誰も困らないこと",
    coreDesire: "「あなたがいたから大丈夫だった」と、一度でいいから言われたい",
  },
  {
    code: "SCEX",
    cognition: "S", emotion: "C", social: "E", execution: "X",
    name: "擁護者",
    englishName: "Advocate",
    emoji: "🛡️",
    tagline: "見て見ぬふりができない。拾った声の重さで、自分が沈むとしても",
    description: "声の大きい人が見落とす声を、静かに拾う人。現場を歩き回り、困っている人のそばにいる。ただし自分が壊れかけていても、助けを求める声だけは出せない。",
    strengths: ["現場の本当の声を拾える", "冷静に弱者の味方ができる", "地に足のついた支援ができる"],
    blindSpots: ["後輩のフォローを引き受けすぎて、自分の仕事が終わらない。でも「今日は無理」が言えない。断ったら冷たい人になる気がして"],
    safeState: "困っている人の話を聞いて、具体的に助けられた日。帰り道に「やっぱりこれが自分の仕事だ」と思う",
    stressState: "助けたい人がいるのに、自分の力じゃどうにもならない。家に帰ってからもずっと考えてしまう",
    growthKey: "「今日は無理」を一回だけ言ってみる。断ることも相手への誠実さ",
    shadowCode: "AVIO",
    shadowTension: "自分のために全力を尽くしている人を見ると、涙が出そうになる。「自分のために生きる」という選択肢が、自分にはない。それは優しさじゃなくて、自分に価値がないと思っているからかもしれない——誰かを助けている間だけ、存在していい気がする",
    dualView: {
      selfView: "見落とされている人がいる。それを見て見ぬふりはできない",
      observedView: "あなたがいつも最後に残って片付けてるの、みんな知ってる。でも「大丈夫？」って聞くと「全然平気」って笑うから、もう誰も聞かなくなった。本当は全然平気じゃないのに",
    },
    quote: { text: "世界がぜんたい幸福にならないうちは個人の幸福はあり得ない", author: "宮沢賢治" },
    motto: "声なき声を聴け",
    midnightThought: "今日助けられなかったあの人は、今頃どうしているだろう",
    forbiddenPhrase: "そこまであなたが背負わなくていいでしょ",
    secretDesire: "自分も誰かに守ってもらいたい。でもそれを言ったら、守る側じゃなくなってしまう",
    innerContradiction: "人を守りたいのに、自分を守ることができない",
    lovePattern: "相手のダメなところを受け入れすぎて、ダメなままにさせてしまう",
    childhoodScene: "いじめられている子のそばにいつもいた。特に何もできなかったけど、隣にいた",
    romanticMatch: {
      code: "AVIO",
      attraction: "自分にない圧倒的な推進力。この人と一緒なら、守りたい世界を実現できる",
      dynamic: "構築者が道を作り、擁護者がそこにいる人を守る。社会を変えるコンビ",
      warning: "構築者が効率を優先しすぎると、擁護者は「人が見えてない」と感じる",
    },
    coreFear: "守りたい人を守りきれなかったとき、自分の存在意義がなくなること",
    coreDesire: "自分も誰かに守ってもらいたい。でもそれを認めたら、守る側じゃなくなる",
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // DYNAMOS (S×V) — 体感×動 🟡 Gold
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    code: "SVIO",
    cognition: "S", emotion: "V", social: "I", execution: "O",
    name: "芸術家",
    englishName: "Artist",
    emoji: "🎨",
    tagline: "肉体と精神を鍛え抜く。情熱を体に刻む求道者",
    description: "体に情熱を刻む求道者。練習、鍛錬、反復。限界を超えた先にしか見えない景色があると体で知っている。「十分うまいよ」は褒め言葉じゃない。まだ足りない。いつまでも足りない。",
    strengths: ["身体を使った圧倒的な表現力", "自分を極限まで追い込める意志の強さ", "作品やパフォーマンスに魂を込められる"],
    blindSpots: ["体調悪いのに「あと1セットだけ」を5回繰り返す。で、本番前に故障する。わかってるのにやめられない"],
    safeState: "練習後のシャワーで、今日は昨日より上手くなったと体が教えてくれる。この感覚のために生きてる",
    stressState: "体が限界を訴えてるのに、頭が「まだ足りない」と言う。壊れるまで止められない",
    growthKey: "「休む日」をスケジュールに書き込む。休息も練習の一部",
    shadowCode: "NCEX",
    shadowTension: "軽やかに次の世界へ飛び移る人を見ると、練習場に一人取り残された感覚が襲ってくる。自分が「極める」と呼んでいるものは、新しいことを始める恐怖から逃げてるだけかもしれない。でも今さら別の道なんて、体が知らない",
    dualView: {
      selfView: "体で表現することでしか、伝えられないものがある",
      observedView: "ストイックすぎてついていけない。でも作品を見ると黙る。すごいから",
    },
    quote: { text: "一万回の蹴りを練習した者は恐れるに足らない。一つの蹴りを一万回練習した者を恐れよ", author: "ブルース・リー" },
    motto: "体が語る真実は嘘をつかない",
    midnightThought: "今日の練習は十分だったか。もう一回やるべきだったか",
    forbiddenPhrase: "そこまでやらなくても、十分うまいよ",
    secretDesire: "極めた先に、言葉を超えた何かがあるはず。それを見たい",
    innerContradiction: "完璧を求めて追い込むのに、完璧に近づくほど足りないものが見える",
    lovePattern: "自分の世界に没頭しすぎて、恋人を放置する。「私と仕事どっちが大事？」が来る",
    childhoodScene: "ピアノを何時間も練習して、指が痛くなっても止められなかった子",
    romanticMatch: {
      code: "NCEO",
      attraction: "自分が体で表現するものに、言葉で意味を与えてくれる。作品に物語が生まれる",
      dynamic: "芸術家が創り、預言者が意味を語る。芸術と思想が融合する関係",
      warning: "預言者が未来ばかり語ると、今を生きる芸術家とすれ違う",
    },
    coreFear: "どれだけ鍛えても、本当の自分には届かないこと",
    coreDesire: "極めた先に、言葉を超えた「完璧な一瞬」を体験したい",
  },
  {
    code: "SVIX",
    cognition: "S", emotion: "V", social: "I", execution: "X",
    name: "騎士",
    englishName: "Knight",
    emoji: "🗡️",
    tagline: "体ごと未知に飛び込む。恐れを力に変える冒険者",
    description: "体ごと飛び込むタイプ。計画を立てるより先に足が動く。恐怖は感じる。でも恐怖を感じた瞬間に「行くしかない」と体が決める。帰る場所があることは口にしないが、実はそれが一番大切。",
    strengths: ["恐怖を感じても飛び込める勇気", "体験から学ぶ速度が速い", "逆境に強い回復力"],
    blindSpots: ["海外で知らない路地に入って最高の店を見つけるけど、帰り道がわからなくて3時間さまよう。武勇伝にするけど本当は怖かった"],
    safeState: "初めての場所に立った瞬間の高揚感。体が勝手に動き出す。この感覚が、生きてる証拠",
    stressState: "危ないとわかっているのに止まれない。怪我をしてから「やっぱり無理だった」と認める",
    growthKey: "「やめる」と決めたら格好悪くてもやめる。生きて帰ることが次の冒険への切符",
    shadowCode: "NCEO",
    shadowTension: "飛び込む前に全部見通している人を見ると、体の芯が冷える。自分が「勇気」と呼んでいるものは、考える能力がないだけかもしれない。傷だらけの体を武勇伝にしてるけど、本当は怖かったことを誰にも言えない",
    dualView: {
      selfView: "やってみなきゃわからない。机上の空論より一歩の行動",
      observedView: "あなたの「大丈夫、なんとかなる」を信じて一緒に飛び込んだ人が、怪我をしたこと覚えてる？あなたは次の冒険に行ったけど、あの人はまだ痛みを引きずってる",
    },
    quote: { text: "船は港にいれば安全だが、そのために船が作られたのではない", author: "アルベルト・アインシュタイン" },
    motto: "やるか、やらないか。それだけだ",
    midnightThought: "明日もまた知らない場所に行ける。それだけで十分だ",
    forbiddenPhrase: "ちょっとは計画を立てなよ",
    secretDesire: "冒険の先に、帰る場所がほしい。でもそれを認めると冒険者じゃなくなる気がする",
    innerContradiction: "自由を求めて飛び出すのに、孤独になると帰りたくなる",
    lovePattern: "冒険に恋人を巻き込みたがる。ついてこないと「つまらない人だ」と思ってしまう",
    childhoodScene: "木の上から飛び降りて骨を折ったのに、次の日また登ろうとした子",
    romanticMatch: {
      code: "ACEO",
      attraction: "自分が体で掴んだものを、この人は冷静に戦略に落とし込んでくれる",
      dynamic: "騎士が現場で戦い、軍師が全体を見る。現場と司令塔の最強ペア",
      warning: "軍師が「リスクが高すぎる」と止めると、騎士はフラストレーションが溜まる",
    },
    coreFear: "冒険をやめた瞬間、自分が誰だかわからなくなること",
    coreDesire: "冒険の果てに、帰る場所がほしい。でもそれを口にしたら冒険者じゃなくなる",
  },
  {
    code: "SVEO",
    cognition: "S", emotion: "V", social: "E", execution: "O",
    name: "幹部",
    englishName: "Executive",
    emoji: "👔",
    tagline: "いるだけで空気が変わる。ただし、聞く力だけが足りていない",
    description: "部屋に入った瞬間に空気が変わる。理屈より行動、戦略より直感。「俺についてこい」を体で示す。ただし人の話を最後まで聞く前に動き出すのが、最大の強みであり最大の弱点。",
    strengths: ["圧倒的な存在感と行動力", "現場の空気を一瞬で変えられる", "人を巻き込む天然のカリスマ性"],
    blindSpots: ["「俺についてこい」って走ったら、振り返ると誰もいない。でも「もういいや一人でやるわ」って思ってしまうのが一番の問題"],
    safeState: "チームが全力で動いて、目標を達成した打ち上げ。「あんたがいたから」と言われる瞬間が全て",
    stressState: "思い通りにいかなくて声が大きくなる。後から「怒鳴ってごめん」と言いたいけど、タイミングを逃す",
    growthKey: "今日一つだけ「これお願いしていい？」と人に任せてみる。一人で全部やらない",
    shadowCode: "NCIO",
    shadowTension: "何も言わずに全てを見通している人を見ると、急に自分の声が大きすぎる気がして恥ずかしくなる。怒鳴って人を動かすのは「リーダーシップ」じゃなくて、聞いてもらえない恐怖の裏返しかもしれない。あの静かな人のほうが、よっぽど人がついていってる",
    dualView: {
      selfView: "背中で見せる。口より行動。それがリーダーってもの",
      observedView: "あなたが怒鳴った後の沈黙は、納得じゃなくて恐怖だよ。みんなあなたの前では「はい」と言うけど、廊下で本音を話してる。あなたの強さが、人を正直にさせなくしてる",
    },
    quote: { text: "行動は雄弁に勝る", author: "リンカーン" },
    motto: "背中で語れ",
    midnightThought: "今日、怒鳴ったのはまずかった。でもあの場では仕方なかった...本当に？",
    forbiddenPhrase: "もっと人の意見を聞いたほうがいいよ",
    secretDesire: "本当は、自分も誰かに引っ張ってもらいたい。先頭は疲れる",
    innerContradiction: "強くあり続けたいのに、強さが人を遠ざけてしまう",
    lovePattern: "リードしたがるけど、全部自分が決めてしまい、相手が窮屈に感じる",
    childhoodScene: "放課後の遊びをいつも仕切っていた子。「〇〇くんが言うならやる」と言われていた",
    romanticMatch: {
      code: "NCIO",
      attraction: "自分が見落とす本質を、静かに一言で示してくれる。この人の言葉だけは聞く",
      dynamic: "幹部が動かし、先見者が見通す。暴走を止めてくれる唯一の存在",
      warning: "幹部が先見者の静けさを「やる気がない」と誤解すると関係が壊れる",
    },
    coreFear: "自分の強さが人を遠ざけていること。孤独な王様になること",
    coreDesire: "強くなくても、そばにいてくれる人がほしい",
  },
  {
    code: "SVEX",
    cognition: "S", emotion: "V", social: "E", execution: "X",
    name: "戦略家",
    englishName: "Strategist",
    emoji: "🎯",
    tagline: "型を壊して道を作る。立ち止まることを知らない炎",
    description: "エネルギーの塊。体感と情熱と好奇心が全方位に爆発する。「普通」が一番つまらない。型にはまらない生き方を選ぶが、そのペースについてこれる人は限られる。本人はそれに気づいていない。",
    strengths: ["圧倒的なエネルギーで周りを巻き込める", "型にはまらない自由な発想", "どんな状況でも楽しめるバイタリティ"],
    blindSpots: ["「今日暇？面白い店見つけた！」って誘ったら、相手は先月から予定入れてた約束をキャンセルしてきてくれた。でもそれに気づいてない"],
    safeState: "週末に仲間と無計画な旅に出る。何が起きるかわからないのが最高。全員テンションMAX",
    stressState: "やることがなくてエネルギーが暴走する。退屈が一番のストレスで、無意味な衝突を起こしてしまう",
    growthKey: "誘う前に「今忙しい？」を一言入れる。相手のペースを尊重するだけで関係が変わる",
    shadowCode: "ACIO",
    shadowTension: "静かに一つの仕組みを完璧に磨き上げる人を見ると、急に足元がぐらつく。自分が「全力で生きてる」と信じてきたものは、立ち止まったら空虚に飲まれるのが怖くて走ってるだけかもしれない。夜、一人になると、全力で走ってきた道に何も残ってない気がして眠れない",
    dualView: {
      selfView: "人生は一度きり。全力で味わい尽くさないと損",
      observedView: "あなたと一緒にいると確かに楽しい。でもあなたのペースに合わせるために、周りがどれだけ予定を犠牲にしてるか知ってる？「楽しかった！」の裏で、疲れ果ててる人がいる",
    },
    quote: { text: "今を生きろ。明日は明日の風が吹く", author: "映画『風と共に去りぬ』" },
    motto: "全力で今を生きろ",
    midnightThought: "今日も全力で走った。でも、どこに向かってるのかは考えてない",
    forbiddenPhrase: "もう少し落ち着いたら？",
    secretDesire: "全力で走り続ける理由が「立ち止まると不安だから」じゃないことを祈ってる",
    innerContradiction: "自由に生きたいのに、自由すぎると何をしていいかわからなくなる",
    lovePattern: "デートは常にイベント。普通の日常が苦手で、相手を振り回す",
    childhoodScene: "運動会で全種目に出て、全部全力でやって、夕方には倒れていた子",
    romanticMatch: {
      code: "ACIX",
      attraction: "自分のエネルギーを静かに受け止め、知的な深みを加えてくれる存在",
      dynamic: "戦略家が走り、発明家が意味を見出す。体験が知恵になる関係",
      warning: "戦略家のペースに発明家がついていけず、一人の時間を奪うと距離を置かれる",
    },
    coreFear: "立ち止まった瞬間、自分が空っぽだと気づくこと",
    coreDesire: "全力で走り続ける理由が「不安から」じゃなく「喜びから」であってほしい",
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** コードからアーキタイプを取得 */
export function getArchetypeByCode(code: ArchetypeCode | string): ArchetypeDef | undefined {
  return ARCHETYPE_DEFS.find((a) => a.code === code);
}

/** 4軸コードの組み合わせからアーキタイプコードを生成 */
export function buildArchetypeCode(
  cognition: CognitionCode,
  emotion: EmotionCode,
  social: SocialCode,
  execution: ExecutionCode
): ArchetypeCode {
  return `${cognition}${emotion}${social}${execution}` as ArchetypeCode;
}

/** アーキタイプコードを4軸に分解 */
export function parseArchetypeCode(code: ArchetypeCode | string): {
  cognition: CognitionCode;
  emotion: EmotionCode;
  social: SocialCode;
  execution: ExecutionCode;
  // Legacy aliases
  layer1: CognitionCode;
  layer2: EmotionCode;
  layer3: SocialCode;
} {
  const cognition = code[0] as CognitionCode;
  const emotion = code[1] as EmotionCode;
  const social = code[2] as SocialCode;
  const execution = code[3] as ExecutionCode;
  return {
    cognition,
    emotion,
    social,
    execution,
    layer1: cognition,
    layer2: emotion,
    layer3: social,
  };
}

/** カラーグループを取得 */
export function getColorGroup(code: ArchetypeCode | string): ColorGroup {
  const { cognition, emotion } = parseArchetypeCode(code);
  return COLOR_GROUPS[`${cognition}_${emotion}` as ColorGroupKey];
}

/** 同じ認知軸を持つタイプ群を取得（大分類） */
export function getCognitionFamilyTypes(cognition: CognitionCode): ArchetypeDef[] {
  return ARCHETYPE_DEFS.filter((a) => a.cognition === cognition);
}

/** Legacy alias */
export function getFamilyTypes(layer1: CognitionCode): ArchetypeDef[] {
  return getCognitionFamilyTypes(layer1);
}

/** 同じカラーグループのタイプ群を取得 */
export function getColorGroupTypes(cognition: CognitionCode, emotion: EmotionCode): ArchetypeDef[] {
  return ARCHETYPE_DEFS.filter((a) => a.cognition === cognition && a.emotion === emotion);
}

/** 全アーキタイプコードの一覧 */
export const ARCHETYPE_CODES: ArchetypeCode[] = ARCHETYPE_DEFS.map((a) => a.code);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SNS / Viral Label Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** SNSプロフィール用ラベル — "📐 Architect" */
export function getSnsLabel(def: ArchetypeDef): string {
  return `${def.emoji} ${def.englishName}`;
}

/** もうひとりの自分を含む完全ラベル — "📐 Architect ⇄ ⚡ Invader" */
export function getFullSnsLabel(def: ArchetypeDef): string {
  const anotherSelf = getArchetypeByCode(def.shadowCode);
  if (!anotherSelf) return getSnsLabel(def);
  return `${def.emoji} ${def.englishName} ⇄ ${anotherSelf.emoji} ${anotherSelf.englishName}`;
}

/** もうひとりの自分のラベル — "⇄ ⚡ Invader" */
export function getAnotherSelfLabel(def: ArchetypeDef): string {
  const anotherSelf = getArchetypeByCode(def.shadowCode);
  if (!anotherSelf) return "";
  return `⇄ ${anotherSelf.emoji} ${anotherSelf.englishName}`;
}

/** ハッシュタグ — "#Architect_ACIO" */
export function getHashtag(def: ArchetypeDef): string {
  return `#${def.englishName}_${def.code}`;
}

/** アイデンティティ一行文 — mottoまたは短縮tagline */
export function getIdentityLine(def: ArchetypeDef): string {
  return def.motto ?? def.tagline.slice(0, 20);
}

/** シェアURL — "/type/ACIO" */
export function getTypeShareUrl(def: ArchetypeDef): string {
  return `/type/${def.code}`;
}
