// lib/stargazer/questions.ts
// Stargazer 質問定義 — 51問 × 8章構成
// semantic differential 形式（5段階スライダー）
// Ch1-5: 既存35問 (core 15軸 + stage1 一部)
// Ch6: Inner Depth 5問 (attachment_style, locus_of_control, growth_mindset, rumination, shame_vs_guilt)
// Ch7: Relational Texture 6問 (intimacy_pace, reassurance_need, boundary_awareness, relationship_mode_split, fairness_sensitivity, friend_mode_fit)
// Ch8: Boundary Intelligence 5問 (consent_maturity, control_tendency, intent_stability, long_term_shift_risk, rejection_response_maturity)

import type { TraitAxisKey } from "./traitAxes";

export type ChapterKey =
  | "core_signal"
  | "relational_distance"
  | "context_faces"
  | "motion_tension"
  | "aesthetic_expression"
  | "inner_depth"
  | "relational_texture"
  | "boundary_intelligence";

export interface QuestionAxis {
  key: TraitAxisKey;
  weight: number;
  /** true の場合、回答スコアを反転して適用 */
  invert?: boolean;
}

export interface QuestionDefinition {
  id: string;
  chapter: ChapterKey;
  prompt: string;
  /** 左端ラベル（prompt の ←→ の左） */
  leftLabel: string;
  /** 右端ラベル（prompt の ←→ の右） */
  rightLabel: string;
  /** 明確な質問文（SemanticDifferentialCard で displayQuestionText として表示） */
  questionText?: string;
  scale: 5 | 7;
  axes: QuestionAxis[];
  note?: string;
}

export interface ChapterInfo {
  key: ChapterKey;
  label: string;
  description: string;
  questionCount: number;
}

export const CHAPTERS: ChapterInfo[] = [
  {
    key: "core_signal",
    label: "Core Signal",
    description: "安定核の観測 — 向き、判断、重心、反応速度の土台",
    questionCount: 7,
  },
  {
    key: "relational_distance",
    label: "Relational Distance",
    description: "他者との距離感 — 関わり方、関係性の組み方",
    questionCount: 7,
  },
  {
    key: "context_faces",
    label: "Context Faces",
    description: "文脈ごとの顔 — 仕事・親密・緊張・安心時の違い",
    questionCount: 7,
  },
  {
    key: "motion_tension",
    label: "Motion & Tension",
    description: "動き方と張り — スピード感、柔らかさ、圧",
    questionCount: 5,
  },
  {
    key: "aesthetic_expression",
    label: "Aesthetic & Expression",
    description: "表現欲と美意識 — 情報量耐性、形式感、新しさ",
    questionCount: 9,
  },
  {
    key: "inner_depth",
    label: "Inner Depth",
    description: "内なる深層 — 帰属意識、成長信念、感情処理の型",
    questionCount: 5,
  },
  {
    key: "relational_texture",
    label: "Relational Texture",
    description: "関係の質感 — 親密さ、境界線、公平感、居場所",
    questionCount: 6,
  },
  {
    key: "boundary_intelligence",
    label: "Boundary Intelligence",
    description: "境界の知性 — 合意形成、制御欲、一貫性、拒否耐性",
    questionCount: 5,
  },
];

/** 全51問の定義（8章構成: 既存35問 + 新規16問） */
export const QUESTIONS: QuestionDefinition[] = [
  // ── Chapter 1: Core Signal (7問) ──
  {
    id: "q01",
    chapter: "core_signal",
    prompt: "一人で深める ←→ 人と交わりながら広げる",
    leftLabel: "一人で深める",
    rightLabel: "人と交わりながら広げる",
    questionText: "休日に好きなことに没頭するとき、一人きりで集中したいですか？それとも誰かと一緒の方が楽しめますか？",
    scale: 5,
    axes: [
      { key: "introvert_vs_extrovert", weight: 0.6 },
      { key: "individual_vs_social", weight: 0.8 },
    ],
  },
  {
    id: "q02",
    chapter: "core_signal",
    prompt: "慎重に見極める ←→ まず飛び込んで動く",
    leftLabel: "慎重に見極める",
    rightLabel: "まず飛び込んで動く",
    questionText: "やったことのないジャンルのイベントに誘われたとき、まず調べてから決めますか？とりあえず行ってみますか？",
    scale: 5,
    axes: [{ key: "cautious_vs_bold", weight: 1.0 }],
  },
  {
    id: "q03",
    chapter: "core_signal",
    prompt: "構造や筋道から理解する ←→ 直感や空気から掴む",
    leftLabel: "構造や筋道から理解する",
    rightLabel: "直感や空気から掴む",
    questionText: "映画や本の感想を人に伝えるとき、筋道立てて説明しますか？それとも「なんかよかった」と感覚で伝えますか？",
    scale: 5,
    axes: [{ key: "analytical_vs_intuitive", weight: 1.0 }],
  },
  {
    id: "q04",
    chapter: "core_signal",
    prompt: "変化は慎重に扱いたい ←→ 変化はむしろ歓迎したい",
    leftLabel: "変化は慎重に扱いたい",
    rightLabel: "変化はむしろ歓迎したい",
    questionText: "引っ越しや転職のような大きな環境変化が訪れたとき、不安が先に立ちますか？ワクワクが先に立ちますか？",
    scale: 5,
    axes: [{ key: "change_embrace_vs_resist", weight: 1.0, invert: true }],
    note: "左に寄るほど +1（resist）、右に寄るほど -1（embrace）として正規化",
  },
  {
    id: "q05",
    chapter: "core_signal",
    prompt: "全体像を組んでから進む ←→ 進みながら形にしていく",
    leftLabel: "全体像を組んでから進む",
    rightLabel: "進みながら形にしていく",
    questionText: "旅行の計画を立てるとき、事前にスケジュールを組みますか？現地でその場の流れに任せますか？",
    scale: 5,
    axes: [
      { key: "plan_vs_spontaneous", weight: 1.0 },
      { key: "perfectionist_vs_pragmatic", weight: 0.4 },
    ],
  },
  {
    id: "q25",
    chapter: "core_signal",
    prompt: "気分の波は小さい ←→ 気分の波は大きい",
    leftLabel: "気分の波は小さい",
    rightLabel: "気分の波は大きい",
    questionText: "朝は元気だったのに午後には落ち込む、というような気分の波は、あなたにとって日常的ですか？めったにありませんか？",
    scale: 5,
    axes: [
      { key: "emotional_variability", weight: 0.9 },
      { key: "emotional_regulation", weight: 0.3, invert: true },
    ],
  },
  {
    id: "q26",
    chapter: "core_signal",
    prompt: "困った時は自力で解決 ←→ 困った時はすぐ相談",
    leftLabel: "困った時は自力で解決",
    rightLabel: "困った時はすぐ相談",
    questionText: "仕事や勉強で壁にぶつかったとき、まず自分で調べて解決しようとしますか？すぐ誰かに聞きますか？",
    scale: 5,
    axes: [
      { key: "stress_isolation_vs_social", weight: 0.6 },
      { key: "independence_vs_harmony", weight: 0.4 },
      { key: "individual_vs_social", weight: 0.3 },
    ],
  },

  // ── Chapter 2: Relational Distance ──
  {
    id: "q06",
    chapter: "relational_distance",
    prompt: "自分の軸を先に保つ ←→ 相手との調和を先に見る",
    leftLabel: "自分の軸を先に保つ",
    rightLabel: "相手との調和を先に見る",
    questionText: "人間関係で意見が食い違ったとき、自分の考えを優先しますか？相手との調和を優先しますか？",
    scale: 5,
    axes: [{ key: "independence_vs_harmony", weight: 1.0 }],
  },
  {
    id: "q07",
    chapter: "relational_distance",
    prompt: "言葉は率直な方が誠実 ←→ 言い方の調整も誠実さの一部",
    leftLabel: "言葉は率直な方が誠実",
    rightLabel: "言い方の調整も誠実さの一部",
    questionText: "大事なことを伝えるとき、ストレートに言う方ですか？言い方を工夫する方ですか？",
    scale: 5,
    axes: [{ key: "direct_vs_diplomatic", weight: 1.0 }],
  },
  {
    id: "q08",
    chapter: "relational_distance",
    prompt: "関係はゆっくり深まる方が自然 ←→ 早く熱を持つ方が自然",
    leftLabel: "関係はゆっくり深まる方が自然",
    rightLabel: "早く熱を持つ方が自然",
    questionText: "新しい人と出会ったとき、関係が深まるスピードは遅い方ですか？早い方ですか？",
    scale: 5,
    axes: [
      { key: "cautious_vs_bold", weight: 0.3 },
      { key: "introvert_vs_extrovert", weight: 0.4 },
      { key: "individual_vs_social", weight: 0.3 },
    ],
  },
  {
    id: "q09",
    chapter: "relational_distance",
    prompt: "ストレス時は一人で整理したい ←→ 人と話して回復したい",
    leftLabel: "ストレス時は一人で整理したい",
    rightLabel: "人と話して回復したい",
    questionText: "ストレスを感じたとき、一人で静かに整理しますか？誰かに話して解消しますか？",
    scale: 5,
    axes: [{ key: "stress_isolation_vs_social", weight: 1.0 }],
  },
  {
    id: "q10",
    chapter: "relational_distance",
    prompt: "関係性では役割を分けたい ←→ 一緒に混ざりながら作りたい",
    leftLabel: "関係性では役割を分けたい",
    rightLabel: "一緒に混ざりながら作りたい",
    questionText: "チームで何かを作るとき、各自の担当を明確に分ける方が好きですか？一緒に混ざりながら進める方が好きですか？",
    scale: 5,
    axes: [
      { key: "independence_vs_harmony", weight: 0.5 },
      { key: "individual_vs_social", weight: 0.4 },
      { key: "direct_vs_diplomatic", weight: 0.2 },
    ],
  },
  {
    id: "q27",
    chapter: "relational_distance",
    prompt: "自分から声をかける ←→ 声をかけられるのを待つ",
    leftLabel: "自分から声をかける",
    rightLabel: "声をかけられるのを待つ",
    questionText: "カフェや待合室で隣の人が気になったとき、自分から話しかけることはありますか？相手からのきっかけを待ちますか？",
    scale: 5,
    axes: [
      { key: "social_initiative", weight: 0.9 },
      { key: "introvert_vs_extrovert", weight: 0.3 },
    ],
  },
  {
    id: "q28",
    chapter: "relational_distance",
    prompt: "感情はその場で表に出す ←→ 感情は内側で処理してから出す",
    leftLabel: "感情はその場で表に出す",
    rightLabel: "感情は内側で処理してから出す",
    questionText: "嬉しいことや悔しいことがあったとき、その場ですぐ表情や言葉に出ますか？一旦飲み込んで整理してから出しますか？",
    scale: 5,
    axes: [
      { key: "emotional_regulation", weight: 0.8, invert: true },
      { key: "direct_vs_diplomatic", weight: 0.3 },
    ],
  },

  // ── Chapter 3: Context Faces ──
  {
    id: "q11",
    chapter: "context_faces",
    prompt: "初対面では様子を見る ←→ 初対面でも場を開ける",
    leftLabel: "初対面では様子を見る",
    rightLabel: "初対面でも場を開ける",
    questionText: "知らない人が多い場に入ったとき、自分から話しかける方ですか？まず観察する方ですか？",
    scale: 5,
    axes: [
      { key: "introvert_vs_extrovert", weight: 0.6 },
      { key: "cautious_vs_bold", weight: 0.4 },
      { key: "individual_vs_social", weight: 0.3 },
    ],
  },
  {
    id: "q12",
    chapter: "context_faces",
    prompt: "仕事では精度を優先する ←→ 仕事では勢いと前進を優先する",
    leftLabel: "仕事では精度を優先する",
    rightLabel: "仕事では勢いと前進を優先する",
    questionText: "仕事のアウトプットで、精度と速度のどちらを重視しますか？",
    scale: 5,
    axes: [
      { key: "analytical_vs_intuitive", weight: 0.3 },
      { key: "perfectionist_vs_pragmatic", weight: 0.7 },
      { key: "quality_vs_quantity", weight: 0.3 },
    ],
  },
  {
    id: "q13",
    chapter: "context_faces",
    prompt: "安心した場でほどける ←→ どの場でも比較的一定",
    leftLabel: "安心した場でほどける",
    rightLabel: "どの場でも比較的一定",
    questionText: "場の雰囲気によって、自分の振る舞いは大きく変わりますか？どこでもあまり変わりませんか？",
    scale: 5,
    axes: [
      { key: "stress_isolation_vs_social", weight: 0.3 },
      { key: "introvert_vs_extrovert", weight: 0.2 },
      { key: "independence_vs_harmony", weight: 0.2 },
    ],
    note: "結果表示では Context Face の分岐に使う",
  },
  {
    id: "q14",
    chapter: "context_faces",
    prompt: "緊張すると硬く静かになる ←→ 緊張するとむしろ前に出る",
    leftLabel: "緊張すると硬く静かになる",
    rightLabel: "緊張するとむしろ前に出る",
    questionText: "プレゼンや面接のようなプレッシャーのかかる場面で、口数が減りますか？むしろ普段より饒舌になりますか？",
    scale: 5,
    axes: [
      { key: "cautious_vs_bold", weight: 0.5 },
      { key: "introvert_vs_extrovert", weight: 0.4 },
      { key: "stress_isolation_vs_social", weight: 0.4 },
    ],
  },
  {
    id: "q29",
    chapter: "context_faces",
    prompt: "親しい人と仕事相手で振る舞いが変わる ←→ 誰に対しても同じ自分",
    leftLabel: "親しい人と仕事相手で振る舞いが変わる",
    rightLabel: "誰に対しても同じ自分",
    questionText: "親しい友達の前と職場の人の前で、話し方や態度は大きく変わりますか？あまり変わりませんか？",
    scale: 5,
    axes: [
      { key: "public_private_gap", weight: 0.9 },
      { key: "independence_vs_harmony", weight: 0.2 },
    ],
  },
  {
    id: "q30",
    chapter: "context_faces",
    prompt: "締め切りで集中力アップ ←→ 締め切りで不安が先行",
    leftLabel: "締め切りで集中力アップ",
    rightLabel: "締め切りで不安が先行",
    questionText: "提出や納品の締め切りが迫ってきたとき、集中力が上がってパフォーマンスが出ますか？不安で手が止まりがちですか？",
    scale: 5,
    axes: [
      { key: "emotional_regulation", weight: 0.6 },
      { key: "cautious_vs_bold", weight: 0.3, invert: true },
    ],
  },
  {
    id: "q31",
    chapter: "context_faces",
    prompt: "意見の対立はすぐ話し合う ←→ 意見の対立は時間を置く",
    leftLabel: "意見の対立はすぐ話し合う",
    rightLabel: "意見の対立は時間を置く",
    questionText: "仲の良い人と意見が衝突したとき、その場で解決しようとしますか？お互い冷静になる時間を置きますか？",
    scale: 5,
    axes: [
      { key: "direct_vs_diplomatic", weight: 0.5 },
      { key: "emotional_regulation", weight: 0.4 },
      { key: "independence_vs_harmony", weight: 0.2, invert: true },
    ],
  },

  // ── Chapter 4: Motion & Tension ──
  {
    id: "q15",
    chapter: "motion_tension",
    prompt: "無駄を削ぎたい ←→ 情報や熱量を乗せたい",
    leftLabel: "無駄を削ぎたい",
    rightLabel: "情報や熱量を乗せたい",
    questionText: "表現するとき、余分を削ぎ落とすのが好きですか？情報や熱量を盛り込むのが好きですか？",
    scale: 5,
    axes: [
      { key: "minimal_vs_maximal", weight: 0.8 },
      { key: "function_vs_expression", weight: 0.4 },
    ],
  },
  {
    id: "q16",
    chapter: "motion_tension",
    prompt: "実用や機能が先に立つ ←→ 表現や空気感が先に立つ",
    leftLabel: "実用や機能が先に立つ",
    rightLabel: "表現や空気感が先に立つ",
    questionText: "何かを選ぶとき、機能や実用性が先ですか？デザインや雰囲気が先ですか？",
    scale: 5,
    axes: [{ key: "function_vs_expression", weight: 1.0 }],
  },
  {
    id: "q17",
    chapter: "motion_tension",
    prompt: "完成度を高めてから出したい ←→ まず出して動かしながら整えたい",
    leftLabel: "完成度を高めてから出したい",
    rightLabel: "まず出して動かしながら整えたい",
    questionText: "SNSの投稿やメールの文面を、何度も推敲してから送りますか？パッと書いてすぐ送りますか？",
    scale: 5,
    axes: [
      { key: "perfectionist_vs_pragmatic", weight: 1.0 },
      { key: "plan_vs_spontaneous", weight: 0.3 },
    ],
  },
  {
    id: "q32",
    chapter: "motion_tension",
    prompt: "大量の情報を整理してから動く ←→ 直感でピックアップして動く",
    leftLabel: "大量の情報を整理してから動く",
    rightLabel: "直感でピックアップして動く",
    questionText: "ネットで買い物をするとき、レビューや比較記事を徹底的に調べますか？直感で「これ」と決めますか？",
    scale: 5,
    axes: [
      { key: "analytical_vs_intuitive", weight: 0.7 },
      { key: "quality_vs_quantity", weight: 0.3 },
    ],
  },
  {
    id: "q33",
    chapter: "motion_tension",
    prompt: "エネルギー回復は一人の時間 ←→ エネルギー回復は人との時間",
    leftLabel: "エネルギー回復は一人の時間",
    rightLabel: "エネルギー回復は人との時間",
    questionText: "疲れた週末の回復に、一人で過ごす静かな時間が必要ですか？友達と会って笑う方が回復しますか？",
    scale: 5,
    axes: [
      { key: "introvert_vs_extrovert", weight: 0.7 },
      { key: "stress_isolation_vs_social", weight: 0.5 },
    ],
  },

  // ── Chapter 5: Aesthetic & Expression ──
  {
    id: "q18",
    chapter: "aesthetic_expression",
    prompt: "確かな定番に惹かれる ←→ 新しいものに惹かれる",
    leftLabel: "確かな定番に惹かれる",
    rightLabel: "新しいものに惹かれる",
    questionText: "買い物や趣味で、実績のある定番を選びますか？まだ見ぬ新しいものに惹かれますか？",
    scale: 5,
    axes: [{ key: "tradition_vs_novelty", weight: 1.0 }],
  },
  {
    id: "q19",
    chapter: "aesthetic_expression",
    prompt: "少数精鋭で深く選びたい ←→ たくさん試して広く掴みたい",
    leftLabel: "少数精鋭で深く選びたい",
    rightLabel: "たくさん試して広く掴みたい",
    questionText: "何かを集めるとき、厳選して少数を深く使い込みますか？幅広くたくさん試しますか？",
    scale: 5,
    axes: [{ key: "quality_vs_quantity", weight: 1.0 }],
  },
  {
    id: "q20",
    chapter: "aesthetic_expression",
    prompt: "時代を超えるものが好き ←→ 今の空気をまとったものが好き",
    leftLabel: "時代を超えるものが好き",
    rightLabel: "今の空気をまとったものが好き",
    questionText: "ファッションやインテリアで、時代を超える普遍的なものが好きですか？今の空気を感じるものが好きですか？",
    scale: 5,
    axes: [{ key: "classic_vs_trendy", weight: 1.0 }],
  },
  {
    id: "q21",
    chapter: "aesthetic_expression",
    prompt: "洗練された抑制に惹かれる ←→ 強い表現や華やかさに惹かれる",
    leftLabel: "洗練された抑制に惹かれる",
    rightLabel: "強い表現や華やかさに惹かれる",
    questionText: "美しいと感じるのは、引き算の洗練ですか？それとも足し算の華やかさですか？",
    scale: 5,
    axes: [
      { key: "minimal_vs_maximal", weight: 0.5 },
      { key: "function_vs_expression", weight: 0.5 },
    ],
  },
  {
    id: "q22",
    chapter: "aesthetic_expression",
    prompt: "結論は明確である方が落ち着く ←→ 余白や曖昧さにも価値を感じる",
    leftLabel: "結論は明確である方が落ち着く",
    rightLabel: "余白や曖昧さにも価値を感じる",
    questionText: "物事に白黒つけたい方ですか？それとも曖昧な余白に価値を感じる方ですか？",
    scale: 5,
    axes: [
      { key: "analytical_vs_intuitive", weight: 0.3 },
      { key: "perfectionist_vs_pragmatic", weight: -0.2 },
      { key: "function_vs_expression", weight: 0.2 },
    ],
  },
  {
    id: "q23",
    chapter: "aesthetic_expression",
    prompt: "変えない強さに惹かれる ←→ 変わり続ける強さに惹かれる",
    leftLabel: "変えない強さに惹かれる",
    rightLabel: "変わり続ける強さに惹かれる",
    questionText: "憧れるのは、信念を貫き通す人ですか？それとも常に変わり続ける人ですか？",
    scale: 5,
    axes: [
      { key: "change_embrace_vs_resist", weight: -0.7 },
      { key: "tradition_vs_novelty", weight: 0.4 },
    ],
  },
  {
    id: "q24",
    chapter: "aesthetic_expression",
    prompt: "中心で照らす役割が自然 ←→ 少し離れた位置から導く役割が自然",
    leftLabel: "中心で照らす役割が自然",
    rightLabel: "少し離れた位置から導く役割が自然",
    questionText: "文化祭や社内イベントで、企画のリーダーを任されたら自然にできますか？裏方で支える方が力を発揮しますか？",
    scale: 5,
    axes: [
      { key: "introvert_vs_extrovert", weight: 0.3 },
      { key: "individual_vs_social", weight: 0.4 },
      { key: "direct_vs_diplomatic", weight: -0.1 },
      { key: "independence_vs_harmony", weight: 0.1 },
    ],
    note: "太陽 / 北極星 / 一等星 などの差分補助に使う",
  },
  {
    id: "q34",
    chapter: "aesthetic_expression",
    prompt: "環境の影響を受けやすい ←→ 環境に左右されにくい",
    leftLabel: "環境の影響を受けやすい",
    rightLabel: "環境に左右されにくい",
    questionText: "カフェの騒音や部屋の散らかり具合は、あなたの集中力や気分に大きく影響しますか？気にならない方ですか？",
    scale: 5,
    axes: [
      { key: "minimal_vs_maximal", weight: 0.4 },
      { key: "emotional_variability", weight: 0.3 },
      { key: "function_vs_expression", weight: 0.3 },
    ],
  },
  {
    id: "q35",
    chapter: "aesthetic_expression",
    prompt: "ルーティンに安心する ←→ 毎日違う刺激が欲しい",
    leftLabel: "ルーティンに安心する",
    rightLabel: "毎日違う刺激が欲しい",
    questionText: "毎朝同じカフェで同じメニューを頼むような習慣は心地よいですか？毎回新しい店を開拓したいですか？",
    scale: 5,
    axes: [
      { key: "tradition_vs_novelty", weight: 0.7 },
      { key: "change_embrace_vs_resist", weight: 0.4, invert: true },
    ],
  },

  // ── Chapter 6: Inner Depth (内なる深層) ── 5問
  // 対象軸: attachment_style, locus_of_control, growth_mindset, rumination_tendency, shame_vs_guilt
  {
    id: "q36",
    chapter: "inner_depth",
    prompt: "距離を取って整理したい ←→ もっと近づいて確かめたい",
    leftLabel: "距離を取って整理したい",
    rightLabel: "もっと近づいて確かめたい",
    questionText:
      "大切な人と少しすれ違いを感じたとき、一人の時間を取って考えたくなりますか？相手に直接確かめたくなりますか？",
    scale: 5,
    axes: [
      { key: "attachment_style", weight: 1.0 },
      { key: "intimacy_pace", weight: 0.3 },
    ],
  },
  {
    id: "q37",
    chapter: "inner_depth",
    prompt: "結果の原因は自分にある ←→ 結果は状況に左右される",
    leftLabel: "自分の行動次第",
    rightLabel: "環境やタイミング次第",
    questionText:
      "テストや仕事で思うような結果が出なかったとき、「自分の準備が足りなかった」と感じますか？「環境やタイミングの問題だった」と感じますか？",
    scale: 5,
    axes: [{ key: "locus_of_control", weight: 1.0 }],
  },
  {
    id: "q38",
    chapter: "inner_depth",
    prompt: "能力は努力で大きく変わる ←→ 持って生まれたものが大きい",
    leftLabel: "努力で変われる",
    rightLabel: "生まれつきが大きい",
    questionText:
      "苦手な分野に取り組むとき、「練習すればできるようになる」と信じますか？「向き不向きには逆らえない」と感じますか？",
    scale: 5,
    axes: [{ key: "growth_mindset", weight: 1.0 }],
  },
  {
    id: "q39",
    chapter: "inner_depth",
    prompt: "嫌なことはすぐ切り替えられる ←→ 長く頭に残る",
    leftLabel: "すぐ切り替える",
    rightLabel: "長く考え続ける",
    questionText:
      "友人との会話で「余計なこと言ったかも」と気づいたとき、寝る前にまだ気になっていますか？すぐ「まあいいか」と流せますか？",
    scale: 5,
    axes: [
      { key: "rumination_tendency", weight: 1.0 },
      { key: "emotional_regulation", weight: 0.3, invert: true },
    ],
  },
  {
    id: "q40",
    chapter: "inner_depth",
    prompt: "失敗すると自分全体がダメだと感じる ←→ 行動を切り分けて振り返れる",
    leftLabel: "自分がダメだと感じる",
    rightLabel: "行動を切り分けて反省できる",
    questionText:
      "人前で大きなミスをしたとき、「自分はダメな人間だ」と落ち込みますか？「あの準備が足りなかった」と具体的に振り返れますか？",
    scale: 5,
    axes: [{ key: "shame_vs_guilt", weight: 1.0 }],
  },

  // ── Chapter 7: Relational Texture (関係の質感) ── 6問
  // 対象軸: intimacy_pace, reassurance_need, boundary_awareness, relationship_mode_split,
  //         fairness_sensitivity, friend_mode_fit
  // 副次: social_initiative, boundary_respect, public_private_gap
  {
    id: "q41",
    chapter: "relational_texture",
    prompt: "自分を開くのはゆっくり ←→ 自分を開くのは早い",
    leftLabel: "少しずつ打ち明ける",
    rightLabel: "初日から深い話もできる",
    questionText:
      "気が合いそうな人と出会ったとき、自分のことを話すペースはゆっくりですか？わりとすぐ深い話もできますか？",
    scale: 5,
    axes: [
      { key: "intimacy_pace", weight: 1.0 },
      { key: "social_initiative", weight: 0.3 },
    ],
    note: "q08（関係深化スピード）は core 軸へ分散。こちらは intimacy_pace に集中",
  },
  {
    id: "q42",
    chapter: "relational_texture",
    prompt: "確認しなくても安心できる ←→ 確かめて安心したい",
    leftLabel: "確認しなくても平気",
    rightLabel: "確かめたくなる",
    questionText:
      "恋人や親友からしばらく連絡がないとき、「大丈夫だろう」と待てますか？つい「元気？」と確認したくなりますか？",
    scale: 5,
    axes: [
      { key: "reassurance_need", weight: 1.0 },
      { key: "attachment_style", weight: 0.3 },
    ],
  },
  {
    id: "q43",
    chapter: "relational_texture",
    prompt: "人との境界は柔軟でいい ←→ 人との境界は明確にしたい",
    leftLabel: "柔軟に混ざる",
    rightLabel: "線引きをはっきりさせる",
    questionText:
      "仲の良い友達が急に「今から会えない？」と頼んできたとき、予定を変えてでも応じますか？自分の時間との線引きをしますか？",
    scale: 5,
    axes: [
      { key: "boundary_awareness", weight: 1.0 },
      { key: "boundary_respect", weight: 0.5 },
    ],
  },
  {
    id: "q44",
    chapter: "relational_texture",
    prompt: "誰に対しても同じ自分 ←→ 関係の種類で出る自分が違う",
    leftLabel: "基本的に一貫している",
    rightLabel: "相手によって全然違う自分が出る",
    questionText:
      "友達・恋人・仕事仲間のそれぞれと接するとき、自分のキャラクターは一貫していますか？関係の種類でまるで別人になりますか？",
    scale: 5,
    axes: [
      { key: "relationship_mode_split", weight: 1.0 },
      { key: "public_private_gap", weight: 0.3 },
    ],
    note: "q29（表裏ギャップ）は「隠す」側面。こちらは関係種別でのモード切替",
  },
  {
    id: "q45",
    chapter: "relational_texture",
    prompt: "もらいすぎが気になる ←→ 不当な扱いが許せない",
    leftLabel: "自分だけ得すると申し訳ない",
    rightLabel: "貢献が無視されると許せない",
    questionText:
      "チームで成果が出たとき、自分だけ褒められると「他の人に申し訳ない」と感じますか？逆に貢献が無視されると「おかしい」と感じますか？",
    scale: 5,
    axes: [{ key: "fairness_sensitivity", weight: 1.0 }],
  },
  {
    id: "q46",
    chapter: "relational_texture",
    prompt: "友達関係で居場所が不安定 ←→ 安定した居場所がある",
    leftLabel: "揺らぎやすい",
    rightLabel: "安定して居場所がある",
    questionText:
      "友人グループの中で、自分のポジションが揺らぐ感覚はありますか？どんなグループでも自然と居場所がありますか？",
    scale: 5,
    axes: [
      { key: "friend_mode_fit", weight: 1.0 },
      { key: "social_initiative", weight: 0.2 },
    ],
  },

  // ── Chapter 8: Boundary Intelligence (境界の知性) ── 5問
  // 対象軸: consent_maturity, control_tendency, intent_stability,
  //         long_term_shift_risk, rejection_response_maturity
  // 副次: pressure_risk, escalation_risk, exclusivity_pressure
  {
    id: "q47",
    chapter: "boundary_intelligence",
    prompt: "空気で察して進める ←→ 明確に確認してから進める",
    leftLabel: "空気を読んで進む",
    rightLabel: "一つ一つ確認する",
    questionText:
      "友達と旅行の計画を立てるとき、「これでいいよね」と流れで決めますか？「ここ行きたい？」と一つ一つ確認しますか？",
    scale: 5,
    axes: [
      { key: "consent_maturity", weight: 1.0 },
      { key: "pressure_risk", weight: 0.3, invert: true },
    ],
    note: "consent_maturity が高い（明確な合意重視）ほど pressure_risk は低い傾向",
  },
  {
    id: "q48",
    chapter: "boundary_intelligence",
    prompt: "人に任せて見守れる ←→ 自分が把握していたい",
    leftLabel: "任せて見守る",
    rightLabel: "把握していたい",
    questionText:
      "チームで自分が直接関わらない部分があるとき、「任せよう」と思えますか？「どうなっている？」と気になりますか？",
    scale: 5,
    axes: [
      { key: "control_tendency", weight: 1.0 },
      { key: "escalation_risk", weight: 0.2 },
    ],
  },
  {
    id: "q49",
    chapter: "boundary_intelligence",
    prompt: "状況に応じて柔軟に変える ←→ 決めたことは守り通す",
    leftLabel: "柔軟に調整する",
    rightLabel: "一貫して守る",
    questionText:
      "来週の約束をした後にもっと魅力的な誘いが入ったとき、予定を変更しますか？最初の約束を優先しますか？",
    scale: 5,
    axes: [{ key: "intent_stability", weight: 1.0 }],
  },
  {
    id: "q50",
    chapter: "boundary_intelligence",
    prompt: "長い関係ほど安定する ←→ 長くなると変化が欲しくなる",
    leftLabel: "年月と共に安定する",
    rightLabel: "慣れると新鮮さを求める",
    questionText:
      "長い付き合いの友人や恋人との関係で、時間が経つほど心地よくなりますか？マンネリ感や変化への渇望が出てきやすいですか？",
    scale: 5,
    axes: [{ key: "long_term_shift_risk", weight: 1.0 }],
  },
  {
    id: "q51",
    chapter: "boundary_intelligence",
    prompt: "断られると引きずる ←→ 断られても切り替えられる",
    leftLabel: "傷ついて引きずる",
    rightLabel: "受け止めて切り替える",
    questionText:
      "誘いを断られたとき、「嫌われたのかも」と心に残りますか？「タイミングが合わなかっただけ」と受け止められますか？",
    scale: 5,
    axes: [
      { key: "rejection_response_maturity", weight: 1.0 },
      { key: "exclusivity_pressure", weight: 0.2, invert: true },
    ],
    note: "拒否を成熟に受容できるほど排他的圧力は低い傾向",
  },
];

/** チャプターで質問をフィルタ */
export function getQuestionsByChapter(
  chapter: ChapterKey
): QuestionDefinition[] {
  return QUESTIONS.filter((q) => q.chapter === chapter);
}

/** チャプター情報を取得 */
export function getChapterInfo(chapter: ChapterKey): ChapterInfo | undefined {
  return CHAPTERS.find((c) => c.key === chapter);
}
