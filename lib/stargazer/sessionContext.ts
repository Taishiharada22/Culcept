import "server-only";

// ---------------------------------------------------------------------------
// Session Context — 3-layer context accumulator for Alter conversations
//
// Layer a: Session Explicit Facts  — user explicitly stated
// Layer b: Session Inferred Hypotheses — inferred from messages
// Layer c: Cross-session Memory — handled by existing system (not here)
// ---------------------------------------------------------------------------

// ---- Types ----------------------------------------------------------------

export type FactType = "explicit" | "inferred";

export type FactCategory =
  | "goal"
  | "experience"
  | "situation"
  | "need"
  | "preference"
  | "relationship"
  | "identity"
  | "emotion"
  | "value"
  | "health"
  | "work_style"
  | "self_assessment"
  | "decision_style"
  | "tool_usage"
  | "social_style";

export interface SessionFact {
  type: FactType;
  category: FactCategory;
  content: string;
  source_turn: number;
}

export type DrillDownType = "example_request" | "reframe" | "narrowing";

export interface DrillDown {
  type: DrillDownType;
  parentFact: SessionFact;
  constraint: string;
}

// ---- Pattern Definitions --------------------------------------------------

interface PatternDef {
  category: FactCategory;
  type: FactType;
  patterns: RegExp[];
  contentTemplate: (match: RegExpMatchArray, raw: string) => string;
}

const EXPLICIT_PATTERNS: PatternDef[] = [
  // Goals
  {
    category: "goal",
    type: "explicit",
    patterns: [
      /起業(したい|を目指|しようと|する|考えて)/,
      /独立(したい|を目指|しようと|する|考えて)/,
      /転職(したい|を目指|しようと|する|考えて)/,
      /就職(したい|を目指|しようと|する|考えて)/,
      /留学(したい|を目指|しようと|する|考えて)/,
      /フリーランス(になりたい|を目指|しようと|になる|考えて)/,
      /(〜|～)?.*?(やりたい|なりたい|目指して|していきたい)/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Experience
  {
    category: "experience",
    type: "explicit",
    patterns: [
      /(開発|エンジニア|プログラミング|コーディング)(した|してる|してた|やってた|やってる|の経験|経験あり)/,
      /(営業|セールス)(した|してる|してた|やってた|やってる|の経験|経験あり)/,
      /(デザイン|UI|UX)(した|してる|してた|やってた|やってる|の経験|経験あり)/,
      /(マーケティング|広告|PR)(した|してる|してた|やってた|やってる|の経験|経験あり)/,
      /(教師|教員|先生|講師)(した|してる|してた|やってた|やってる|の経験|経験あり|をして)/,
      /(アプリ|サービス|プロダクト).*?(作った|開発した|リリースした|出した)/,
      /(\d+年|半年|数年).*?(やって|働いて|経験)/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Situation
  {
    category: "situation",
    type: "explicit",
    patterns: [
      /(1人|一人|ひとり)で(やって|開発|仕事|活動|進めて)/,
      /チームで(やって|開発|仕事|活動|進めて)/,
      /会社(に|で)(勤めて|働いて|所属)/,
      /フリーランス(で|として)(やって|働いて|活動)/,
      /学生(です|だ|やって|をして)/,
      /(大学|高校|専門学校|大学院)(に|で|を)(通って|在学|卒業)/,
      /(無職|休職|育休|産休|ニート)(です|だ|中|して)/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Need
  {
    category: "need",
    type: "explicit",
    patterns: [
      /(人|仲間|メンバー|パートナー|エンジニア|デザイナー)が(必要|欲しい|いない|足りない)/,
      /(助け|サポート|アドバイス)が(必要|欲しい|ほしい)/,
      /(資金|お金|投資|融資)が(必要|欲しい|ほしい|足りない)/,
      /(相談|話)を?(したい|聞いてほしい|聞いて欲しい)/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Preference
  {
    category: "preference",
    type: "explicit",
    patterns: [
      /(.{1,12})[がは](好き|大好き|すき)/,
      /(.{1,12})[がは](嫌い|きらい|苦手|にがて)/,
      /(.{1,12})[がは](得意|とくい|上手|うまい)/,
      /(.{1,12})[がは](苦手|にがて|下手|へた|できない)/,
      /(.{1,12})に(興味|関心)(がある|ある|持って)/,
      /(.{1,12})(?:の話題|の分野|のこと).*(?:好き|気にな|興味)/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Relationship
  {
    category: "relationship",
    type: "explicit",
    patterns: [
      /(彼女|彼氏|恋人|パートナー|妻|夫|奥さん|旦那)(が|と|は|に|の)/,
      /(友人|友達|親友|知り合い)(が|と|は|に|の)/,
      /(上司|部下|同僚|先輩|後輩)(が|と|は|に|の)/,
      /(親|母|父|兄|姉|弟|妹|家族)(が|と|は|に|の)/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Identity
  {
    category: "identity",
    type: "explicit",
    patterns: [
      /MBTI.*?(INTJ|INTP|ENTJ|ENTP|INFJ|INFP|ENFJ|ENFP|ISTJ|ISFJ|ESTJ|ESFJ|ISTP|ISFP|ESTP|ESFP)/i,
      /(INTJ|INTP|ENTJ|ENTP|INFJ|INFP|ENFJ|ENFP|ISTJ|ISFJ|ESTJ|ESFJ|ISTP|ISFP|ESTP|ESFP)(です|だ|なんだ|タイプ)/i,
      /(\d{1,2})(歳|才)(です|だ|の|で)/,
      /(男|女|男性|女性|ノンバイナリー)(です|だ|の|で)/,
      /(エンジニア|デザイナー|営業|マーケター|経営者|学生|教師|医者|看護師|公務員)(です|だ|の|で|をして)/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Health — 体調・休息・睡眠・疲労
  {
    category: "health",
    type: "explicit",
    patterns: [
      /(体調|調子).*?(悪い|良くない|崩して|崩した|いまいち|微妙)/,
      /(休息|休み|睡眠).*?(取れてない|足りない|足りてない|不足|少ない|できてない)/,
      /(疲れ|疲労|過労).*?(たまって|溜まって|抜けない|限界|ひどい|やばい)/,
      /(睡眠|寝|眠).*?(足りない|足りてない|不足|浅い|できてない|取れてない)/,
      /(頭痛|肩こり|腰痛|胃|お腹).*?(痛い|つらい|調子悪い)/,
      /(運動|ジム|散歩|筋トレ).*?(してない|できてない|さぼって|行けてない)/,
      /(食事|ご飯|食生活).*?(乱れ|偏って|適当|食べてない)/,
      /(?:体調面|健康面).*?(?:気になって|心配|不安)/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Work style — 仕事の仕方・没頭パターン
  {
    category: "work_style",
    type: "explicit",
    patterns: [
      /(仕事|作業).*?(忙しい|忙し|多忙|追われ)/,
      /(残業|夜更かし|徹夜).*?(して|してた|多い|続いて)/,
      /(没頭|夢中|集中).*?(しすぎ|し過ぎ|しちゃう|してしまう|なると|すると)/,
      /周り.*?見え(なくなる|ない|なくなって)/,
      /現実.*?見(れなくなる|えなくなる|失って)/,
      /(休息|休み).*?後回し/,
      /(ワークライフバランス|生活リズム).*?(崩れ|乱れ|悪い)/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Self-assessment — 自己認識・性格の自己申告
  {
    category: "self_assessment",
    type: "explicit",
    patterns: [
      // "私は〜なタイプ/性格/人間" 形
      /(?:私|俺|僕|自分)(?:は|って|が).{1,20}?(?:タイプ|性格|人間|方|ほう)(?:だ|です|かも|なん)/,
      // "〜屋/型/派" 形 (面倒くさがり屋, 慎重派, 行動型)
      /.{2,12}?(?:屋|型|派)(?:だ|です|かも|だと思う|なん|で|。|$)/,
      // hedging 自己評価 "結構/かなり/わりと〜かも/だと思う"
      /(?:結構|かなり|わりと|めっちゃ|割と|ちょっと).{1,15}?(?:かも|だと思う|なんだ|だよ|なの|だな|ところがある)/,
      // "〜なところがある/〜な面がある" 形
      /.{2,15}?(?:な|い)(?:ところがある|面がある|一面がある|傾向がある|癖がある|くせがある)/,
      // "〜するタイプ/しないタイプ" 形
      /.{2,15}?(?:する|しない|できる|できない|な|い)タイプ/,
      // "〜な性格" 形 (無鉄砲な性格, 慎重な性格)
      /.{2,10}?な性格/,
      // "〜だと思ってる/自覚してる" 形
      /.{2,15}?(?:だと思ってる|だと自覚|と自覚|という自覚|な自覚)/,
      // "〜がち/〜しがち" 形 (後回しにしがち, 考えすぎがち)
      /.{2,12}?(?:がち|しがち|になりがち)(?:だ|です|で|。|$)/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Decision style — 判断・行動パターン
  {
    category: "decision_style",
    type: "explicit",
    patterns: [
      // 計画性 (計画を立てない, 予定を立てずに)
      /(?:計画|予定|スケジュール|段取り).{0,6}?(?:立て[なず]|しない|苦手|なし|なく|せずに|持たず)/,
      // 直感型 (直感で動く, ひらめきを信じる, 感覚を大事に)
      /(?:直感|ひらめき|感覚|勘|インスピレーション).{0,8}?(?:で動く|に従う|を信じ|大事|重視|任せ|頼る|に頼って)/,
      // 突進型 (突き進む, 飛び込む, とにかくやってみる)
      /(?:突き進|飛び込|やってみ|走り出|行動し|動い|まず動|とりあえず).{0,6}?(?:む|る|た|ちゃう|てから|ている|てしまう)/,
      // 振り返り型 (冷静になってから, 後から考える)
      /(?:冷静|落ち着|振り返|考え直|反省|立ち止ま).{0,8}?(?:する|になる|てから|った後|る方|りする|って)/,
      // リスク態度 (リスクは取るべき, 挑戦するのが好き)
      /(?:リスク|挑戦|チャレンジ|冒険).{0,8}?(?:取る|する|好き|大事|必要|恐れない|怖くない|いとわない)/,
      // "〜してから〜する" 形の行動順序
      /(?:考え|調べ|確認し|準備し|計画し)てから(?:動く|行動|実行|始める)/,
      /(?:動い|やっ|始め)てから(?:考える|振り返る|調整する|修正する)/,
      // 決断スタイル (即断即決, 迷わない, 悩む前に)
      /(?:即断即決|迷わ[なず]|悩む前に|すぐ決める|パッと決める|サクッと決める)/,
      // "正しいと思ったら〜/思ったことは〜" 形
      /(?:正しい|いける|これだ|ピンと).{0,6}?(?:と思った[らこ]|と感じた[らこ]|って思った[らこ]|ときは).{0,12}?(?:進む|やる|動く|突き進む|そのまま|止まらない)/,
      // "これだ！/ピンときた" 形の直感表現
      /(?:これだ|ピンと来|ビビッと|直感的).{0,8}?(?:ひらめき|感覚|瞬間|って[思感]|とき|来[たる])/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Goal — broader intention patterns (supplement to existing goal patterns)
  {
    category: "goal",
    type: "explicit",
    patterns: [
      // "〜を目指したい/するつもり/しようと思って" 形
      /.{2,15}?(?:を目指し|するつもり|しようと思って|したいと思って|を考えて|を実現|を達成)/,
      // "〜の共存/〜の実現/〜の世界" 形 (AIと人間の共存)
      /.{2,12}?(?:の共存|の実現|の世界|の未来|の社会).*?(?:を目指|したい|作りたい|つくりたい|を考えて)/,
      // "将来は〜/いつかは〜" 形
      /(?:将来|いつか|ゆくゆく|最終的に)(?:は|には).{2,20}?(?:たい|つもり|予定|目標|考えて)/,
      // "夢は〜/目標は〜/野望は〜" 形
      /(?:夢|目標|野望|志|ビジョン)(?:は|が|として).{2,20}/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Tool usage — 使用ツール・手段
  {
    category: "tool_usage",
    type: "explicit",
    patterns: [
      // AI ツール (ChatGPT, Claude, AI等)
      /(?:ChatGPT|chatgpt|GPT|Claude|claude|Copilot|copilot|Gemini|gemini|AI|ＡＩ).{0,8}?(?:使[っうい]|話[すし]|活用|利用|頼[っる]|に聞[くい]|と(?:話|相談|議論))/i,
      // 記録ツール (ノート, 日記, メモ)
      /(?:ノート|日記|メモ|手帳|Notion|notion|スプレッドシート|Evernote).{0,8}?(?:使[っうい]|書[くい]|つけ|付けて|記録|取って|管理)/i,
      // 思考ツール (マインドマップ, ホワイトボード等)
      /(?:マインドマップ|ホワイトボード|付箋|ふせん|図|フレームワーク).{0,8}?(?:使[っうい]|書[くい]|描[くい]|活用)/,
      // アプリ/サービス名言及
      /(?:Slack|slack|Discord|discord|LINE|Twitter|X|YouTube|Spotify).{0,8}?(?:使[っうい]|見[てる]|聴[いく]|やって)/i,
    ],
    contentTemplate: (m) => m[0],
  },
  // Social style — 対人スタイル
  {
    category: "social_style",
    type: "explicit",
    patterns: [
      // 一人好き (一人が好き, ひとりで集中, 一人の時間)
      /(?:一人|ひとり|1人|独り).{0,6}?(?:が好き|が得意|が楽|で集中|の時間|が落ち着|でいたい|の方が)/,
      // 他人の目 (人の評価が気になる, 周りの目は気にしない)
      /(?:人|周り|他人|みんな|世間).{0,4}?(?:の意見|の評価|の目|にどう思).{0,6}?(?:気に[なす]|関係ない|どうでもいい|大事|重視|怖い)/,
      // 人付き合い (人付き合いが苦手, コミュニケーションが得意)
      /(?:人付き合い|コミュニケーション|人間関係|社交|対人).{0,4}?(?:が苦手|が得意|好き|嫌い|面倒|大事|下手|上手)/,
      // リーダーシップ (引っ張る, まとめる, サポートする方)
      /(?:引っ張|まとめ|リード|サポート|支え|フォロー|ついていく).{0,4}?(?:る方|るタイプ|る側|が好き|が得意|たい)/,
      // 傾聴/話す (聞く方が好き, 話すのが得意)
      /(?:聞く|話す|しゃべる|黙って).{0,4}?(?:方が|のが)(?:好き|得意|多い|楽|苦手)/,
    ],
    contentTemplate: (m) => m[0],
  },
];

const INFERRED_PATTERNS: PatternDef[] = [
  // Emotion (inferred from tone)
  {
    category: "emotion",
    type: "inferred",
    patterns: [
      /(つらい|辛い|しんどい|きつい|疲れた|疲れて)/,
      /(嬉しい|うれしい|楽しい|たのしい|ワクワク|わくわく)/,
      /(不安|心配|怖い|こわい|焦って|焦り)/,
      /(迷って|悩んで|どうしたら|どうすれば)/,
      /(イライラ|怒り|ムカつく|腹が立つ)/,
      /(寂しい|さみしい|孤独|ひとりぼっち)/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Value (inferred from expressions)
  {
    category: "value",
    type: "inferred",
    patterns: [
      /(大事|大切|重要)なの(は|が)/,
      /(自由|安定|成長|挑戦|貢献|創造).*?(したい|が好き|を求めて|重視)/,
      /(お金|年収|給料).*?(より|よりも|じゃなくて)/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Situation — conversational topic capture (broader)
  {
    category: "situation",
    type: "inferred",
    patterns: [
      /(?:今日|最近|さっき|昨日|この前)(.{3,20}?)(?:した|してきた|だった|あった|行った|会った)/,
      /(.{2,15}?)(?:に行って|に行った|を見て|を見た|を読んで|を読んだ)/,
      /(.{2,15}?)(?:と話して|と会って|と遊んで|と飲んで)/,
    ],
    contentTemplate: (_m, raw) => {
      // Capture the entire matched phrase for context
      const t = raw.slice(0, 40).replace(/\s+/g, "");
      return t;
    },
  },
  // Experience — broader activity sharing
  {
    category: "experience",
    type: "inferred",
    patterns: [
      /(.{2,15}?)(?:を始めた|始めて|やり始めた)/,
      /(.{2,15}?)(?:にハマって|ハマった|続けて)/,
      /(.{2,15}?)(?:辞めた|やめた|離れた)/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Health — inferred from conversational cues
  {
    category: "health",
    type: "inferred",
    patterns: [
      /(?:体調|調子).*?(?:かな|気になる|面)/,
      /(?:休息|休み).*?(?:取れて|できて|ない)/,
      /(?:疲れ|だるい|しんどい|きつい).*?(?:感じ|気味|ぎみ)/,
      /(?:寝不足|寝れない|眠れない|不眠)/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Work/Life pattern — inferred
  {
    category: "work_style",
    type: "inferred",
    patterns: [
      /夢中.*?(?:なる|になって|になると)/,
      /努力.*?(?:充実|好き|やめられない)/,
      /(?:負担|無理).*?(?:大きい|でかい|続いて)/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Self-assessment — inferred from casual self-description
  {
    category: "self_assessment",
    type: "inferred",
    patterns: [
      // "〜かもしれない/〜かも" — 自己認識のヘッジ
      /(?:私|俺|僕|自分).{1,15}?(?:かもしれない|かも$|かも。|かもな)/,
      // "〜するほう/しないほう" — 傾向の自己認識
      /.{2,10}?(?:する|しない|い|く)(?:ほう|方)(?:だ|です|かな|だと思う)/,
      // "基本的に〜/普段は〜" — 日常パターンの自己申告
      /(?:基本的に|普段は|いつもは|だいたい|たいてい).{2,20}?(?:する|してる|しちゃう|な方|だと思う|かな)/,
      // "〜なんだよね/〜なんですよね" — 自然な自己開示
      /.{3,15}?(?:なんだよね|なんですよね|んだよな|んですよ|んだけど)$/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Decision style — inferred from behavioral description
  {
    category: "decision_style",
    type: "inferred",
    patterns: [
      // 情報の繋がり (シナプスみたいに, 結びつく, つながる)
      /(?:情報|アイデア|考え|知識|経験).{0,8}?(?:つなが|結びつ|くっつ|組み合わ|シナプス|ひらめ)/,
      // "〜してから〜" の思考順序パターン
      /(?:まず|最初に|先に).{2,10}?(?:してから|した後|して、それから)/,
      // "〜の方が大事/優先" 形
      /.{2,10}?(?:の方が|のほうが)(?:大事|大切|重要|優先|先)/,
      // "本質/核心/根本" への志向
      /(?:本質|核心|根本|本当のこと|真理).{0,8}?(?:っぽい|を感じ|に近い|大事|好き|見たい|知りたい|追い)/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Tool usage — inferred from casual mention
  {
    category: "tool_usage",
    type: "inferred",
    patterns: [
      // "〜で調べた/〜で見つけた" 形
      /(?:ネット|Google|google|検索|YouTube|youtube|SNS).{0,6}?(?:で調べ|で見つけ|で見[てた]|で知[っった])/i,
      // 読書/学習 (本を読んで, 勉強して)
      /(?:本|書籍|論文|記事|ブログ).{0,4}?(?:読[んむ]|見て|参考に)/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Social style — inferred from conversational cues
  {
    category: "social_style",
    type: "inferred",
    patterns: [
      // 協調/対立 (合わせる, ぶつかる)
      /(?:人|相手|周り)に.{0,6}?(?:合わせ|ぶつか|譲[っら]|従[っう]|反発)/,
      // 内向/外向のサイン
      /(?:大勢|パーティ|飲み会|集まり).{0,6}?(?:苦手|疲れ|得意|好き|楽しい|億劫|面倒)/,
      // 信頼/警戒 (すぐ信じる, 警戒する, 疑う)
      /(?:人|相手|他人)を?.{0,4}?(?:すぐ信じ|信用し|警戒|疑[っう]|信頼)/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Value — broader inferred value patterns
  {
    category: "value",
    type: "inferred",
    patterns: [
      // "〜べきだと思ってる" 形 (リスクは取るべき)
      /.{2,12}?(?:べきだと思|べきだって思|すべきだ|した方がいい)(?:って|と|ってる|う)/,
      // "〜が一番/〜が最も" 形
      /.{2,10}?(?:が一番|が最も|が何より|が最優先)(?:大事|大切|重要|必要)/,
    ],
    contentTemplate: (m) => m[0],
  },
];

// ---- Drill-down patterns --------------------------------------------------

interface DrillDownPattern {
  type: DrillDownType;
  patterns: RegExp[];
  constraintExtractor: (match: RegExpMatchArray) => string;
}

const DRILLDOWN_PATTERNS: DrillDownPattern[] = [
  {
    type: "example_request",
    patterns: [
      /(有名人|芸能人|著名人|歴史上の人物|キャラクター)で(言うと|例えると|言えば)/,
      /例えば(誰|どんな人|どういう)/,
      /具体的に(は|言うと|教えて)/,
    ],
    constraintExtractor: (m) => m[0],
  },
  {
    type: "narrowing",
    patterns: [
      /(日本人|アメリカ人|海外|国内|東京|関西|アジア)だと/,
      /(男性|女性|男|女)だと/,
      /(\d{2}代)だと/,
      /(IT|医療|教育|金融|飲食).*?(だと|では|の場合)/,
    ],
    constraintExtractor: (m) => m[0],
  },
  {
    type: "reframe",
    patterns: [
      /(MBTI|エニアグラム|ストレングスファインダー|16Personalities|BigFive)で(言うと|言えば|分析すると)/,
      /(心理学|科学|データ|統計)的に(は|言うと|見ると)/,
      /(ビジネス|キャリア|恋愛|人間関係)の(観点|視点|面)で/,
    ],
    constraintExtractor: (m) => m[0],
  },
];

// ---- Extraction -----------------------------------------------------------

function normalizeContent(
  category: FactCategory,
  raw: string,
): string {
  // Light normalization — keep it close to original but clean up
  const trimmed = raw.replace(/\s+/g, "").trim();
  if (trimmed.length > 40) return trimmed.slice(0, 40) + "…";
  return trimmed;
}

export function extractSessionFacts(
  message: string,
  turnIndex: number = 0,
): SessionFact[] {
  const facts: SessionFact[] = [];
  const seen = new Set<string>();

  const allPatterns = [...EXPLICIT_PATTERNS, ...INFERRED_PATTERNS];

  for (const def of allPatterns) {
    for (const pattern of def.patterns) {
      const match = message.match(pattern);
      if (!match) continue;

      const rawContent = def.contentTemplate(match, message);
      const content = normalizeContent(def.category, rawContent);
      const key = `${def.category}:${content}`;

      if (seen.has(key)) continue;
      seen.add(key);

      facts.push({
        type: def.type,
        category: def.category,
        content,
        source_turn: turnIndex,
      });
    }
  }

  return facts;
}

// ---- Drill-down detection -------------------------------------------------

export function detectDrillDown(
  message: string,
  previousFacts: SessionFact[],
): DrillDown | null {
  if (previousFacts.length === 0) return null;

  for (const dd of DRILLDOWN_PATTERNS) {
    for (const pattern of dd.patterns) {
      const match = message.match(pattern);
      if (!match) continue;

      // Link to the most recent fact as parent
      const parentFact = previousFacts[previousFacts.length - 1];
      return {
        type: dd.type,
        parentFact,
        constraint: dd.constraintExtractor(match),
      };
    }
  }

  return null;
}

// ---- Accumulator ----------------------------------------------------------

export class SessionFactAccumulator {
  private facts: SessionFact[] = [];

  addTurn(message: string, turnIndex: number): void {
    const newFacts = extractSessionFacts(message, turnIndex);
    for (const fact of newFacts) {
      // Deduplicate by category + content
      const isDuplicate = this.facts.some(
        (f) => f.category === fact.category && f.content === fact.content,
      );
      if (!isDuplicate) {
        this.facts.push(fact);
      }
    }
  }

  getAllFacts(): SessionFact[] {
    return [...this.facts];
  }

  getExplicitFacts(): SessionFact[] {
    return this.facts.filter((f) => f.type === "explicit");
  }

  getInferredFacts(): SessionFact[] {
    return this.facts.filter((f) => f.type === "inferred");
  }

  buildPromptInjection(): string {
    const explicit = this.getExplicitFacts();
    const inferred = this.getInferredFacts();

    if (explicit.length === 0 && inferred.length === 0) return "";

    const lines: string[] = [];

    if (explicit.length > 0) {
      lines.push("# この会話で本人が明言した事実（常時参照可）");
      for (const f of explicit) {
        lines.push(`- ${f.content}`);
      }
    }

    if (inferred.length > 0) {
      if (lines.length > 0) lines.push("");
      lines.push("# この会話から推測される仮説（確定ではない）");
      for (const f of inferred) {
        lines.push(`- ${f.content}（推測）`);
      }
    }

    return lines.join("\n");
  }
}
