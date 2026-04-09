// lib/stargazer/questions.ts
// Stargazer 質問定義 — 87問 × 8章構成
// semantic differential 形式（5段階スライダー）
// Ch1-5: 既存35問 (core 15軸 + stage1 一部)
// Ch6: Inner Depth 5問 (attachment_style, locus_of_control, growth_mindset, rumination, shame_vs_guilt)
// Ch7: Relational Texture 6問 (intimacy_pace, reassurance_need, boundary_awareness, relationship_mode_split, fairness_sensitivity, friend_mode_fit)
// Ch8: Boundary Intelligence 5問 (consent_maturity, control_tendency, intent_stability, long_term_shift_risk, rejection_response_maturity)

import type { TraitAxisKey } from "./traitAxes";

export type ChapterKey =
  | "core_foundation"
  | "decision_logic"
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
    key: "core_foundation",
    label: "Core Foundation",
    description: "安定核の観測 — 向き、重心、感情の波、行動スタイルの土台",
    questionCount: 7,
  },
  {
    key: "decision_logic",
    label: "Decision Logic",
    description: "判断様式の観測 — 論理・感情・効率・過程のどこに重心を置くか",
    questionCount: 4,
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
    questionCount: 11,
  },
  {
    key: "inner_depth",
    label: "Inner Depth",
    description: "内なる深層 — 帰属意識、成長信念、感情処理の型",
    questionCount: 15,
  },
  {
    key: "relational_texture",
    label: "Relational Texture",
    description: "関係の質感 — 親密さ、境界線、公平感、居場所",
    questionCount: 16,
  },
  {
    key: "boundary_intelligence",
    label: "Boundary Intelligence",
    description: "境界の知性 — 合意形成、制御欲、一貫性、拒否耐性",
    questionCount: 15,
  },
];

/** 全51問の定義（8章構成: 既存35問 + 新規16問） */
export const QUESTIONS: QuestionDefinition[] = [
  // ── Chapter 1: Core Signal (7問) ──
  {
    id: "q01",
    chapter: "core_foundation",
    prompt: "一人で深める ←→ 人と交わりながら広げる",
    leftLabel: "一人で深める",
    rightLabel: "人と交わりながら広げる",
    questionText: "好きなことに没頭するなら、一人で集中したい方ですか？ 誰かと一緒の方が楽しめますか？",
    scale: 5,
    axes: [
      { key: "introvert_vs_extrovert", weight: 0.6 },
      { key: "individual_vs_social", weight: 0.8 },
    ],
  },
  {
    id: "q02",
    chapter: "core_foundation",
    prompt: "慎重に見極める ←→ まず飛び込んで動く",
    leftLabel: "慎重に見極める",
    rightLabel: "まず飛び込んで動く",
    questionText: "知らないジャンルのイベントに誘われたとき、まず調べてから決めますか？ とりあえず行ってみますか？",
    scale: 5,
    axes: [{ key: "cautious_vs_bold", weight: 1.0 }],
  },
  {
    id: "q03",
    chapter: "core_foundation",
    prompt: "構造や筋道から理解する ←→ 直感や空気から掴む",
    leftLabel: "構造や筋道から理解する",
    rightLabel: "直感や空気から掴む",
    questionText: "映画や本の感想を人に伝えるとき、筋道を立てて説明する方ですか？ 「なんかよかった」と感覚で伝える方ですか？",
    scale: 5,
    axes: [{ key: "analytical_vs_intuitive", weight: 1.0 }],
  },
  {
    id: "q04",
    chapter: "core_foundation",
    prompt: "変化は慎重に扱いたい ←→ 変化はむしろ歓迎したい",
    leftLabel: "変化は慎重に扱いたい",
    rightLabel: "変化はむしろ歓迎したい",
    questionText: "引っ越しや転職のような大きな変化が近づいたとき、不安が先に来ますか？ ワクワクが先に来ますか？",
    scale: 5,
    axes: [{ key: "change_embrace_vs_resist", weight: 1.0, invert: true }],
    note: "左に寄るほど +1（resist）、右に寄るほど -1（embrace）として正規化",
  },
  {
    id: "q05",
    chapter: "core_foundation",
    prompt: "全体像を組んでから進む ←→ 進みながら形にしていく",
    leftLabel: "全体像を組んでから進む",
    rightLabel: "進みながら形にしていく",
    questionText: "旅行の計画を立てるとき、事前にスケジュールを決めたい方ですか？ 現地の流れに任せたい方ですか？",
    scale: 5,
    axes: [
      { key: "plan_vs_spontaneous", weight: 1.0 },
      { key: "perfectionist_vs_pragmatic", weight: 0.4 },
    ],
  },
  {
    id: "q25",
    chapter: "core_foundation",
    prompt: "気分の波は小さい ←→ 気分の波は大きい",
    leftLabel: "気分の波は小さい",
    rightLabel: "気分の波は大きい",
    questionText: "朝は元気だったのに午後には落ち込む——そんな気分の波は、日常的にありますか？ めったにありませんか？",
    scale: 5,
    axes: [
      { key: "emotional_variability", weight: 0.9 },
      { key: "emotional_regulation", weight: 0.3, invert: true },
    ],
  },
  {
    id: "q26",
    chapter: "core_foundation",
    prompt: "困った時は自力で解決 ←→ 困った時はすぐ相談",
    leftLabel: "困った時は自力で解決",
    rightLabel: "困った時はすぐ相談",
    questionText: "壁にぶつかったとき、まず自分で調べて解決しようとする方ですか？ すぐ誰かに聞く方ですか？",
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
    questionText: "意見が食い違ったとき、自分の考えを通す方ですか？ 相手に合わせて調和を取る方ですか？",
    scale: 5,
    axes: [{ key: "independence_vs_harmony", weight: 1.0 }],
  },
  {
    id: "q07",
    chapter: "relational_distance",
    prompt: "言葉は率直な方が誠実 ←→ 言い方の調整も誠実さの一部",
    leftLabel: "言葉は率直な方が誠実",
    rightLabel: "言い方の調整も誠実さの一部",
    questionText: "大事なことを伝えるとき、ストレートに言う方ですか？ 言い方を選んでから伝える方ですか？",
    scale: 5,
    axes: [{ key: "direct_vs_diplomatic", weight: 1.0 }],
  },
  {
    id: "q08",
    chapter: "relational_distance",
    prompt: "関係はゆっくり深まる方が自然 ←→ 早く熱を持つ方が自然",
    leftLabel: "関係はゆっくり深まる方が自然",
    rightLabel: "早く熱を持つ方が自然",
    questionText: "新しく出会った人と、関係が深まるペースは遅い方ですか？ 早い方ですか？",
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
    questionText: "ストレスを感じたとき、一人で静かに整理したいですか？ 誰かに話して解消したいですか？",
    scale: 5,
    axes: [{ key: "stress_isolation_vs_social", weight: 1.0 }],
  },
  {
    id: "q10",
    chapter: "relational_distance",
    prompt: "関係性では役割を分けたい ←→ 一緒に混ざりながら作りたい",
    leftLabel: "関係性では役割を分けたい",
    rightLabel: "一緒に混ざりながら作りたい",
    questionText: "チームで何かを作るとき、担当を明確に分ける方が好きですか？ 混ざりながら進める方が好きですか？",
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
    questionText: "知らない人が多い場に入ったとき、自分から話しかけますか？ まず周りを観察しますか？",
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
    questionText: "仕事のアウトプットで、丁寧さを優先しますか？ スピードを優先しますか？",
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
    questionText: "場の雰囲気によって、自分の振る舞いは変わりますか？ どこでもあまり変わりませんか？",
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
    questionText: "プレッシャーのかかる場面で、口数が減りますか？ むしろ普段より饒舌になりますか？",
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
    questionText: "親しい友達の前と職場の人の前で、自分の話し方や態度は変わりますか？ あまり変わりませんか？",
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
    questionText: "締め切りが迫ってきたとき、集中力が上がりますか？ 不安で手が止まりやすいですか？",
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
    questionText: "仲の良い人と意見がぶつかったとき、その場で話し合いますか？ 少し時間を置きますか？",
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
    questionText: "何かを表現するとき、余分を削ぎ落とすのが好きですか？ 情報や熱量を盛り込むのが好きですか？",
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
    questionText: "何かを選ぶとき、機能や実用性が先に来ますか？ デザインや雰囲気が先に来ますか？",
    scale: 5,
    axes: [{ key: "function_vs_expression", weight: 1.0 }],
  },
  {
    id: "q17",
    chapter: "motion_tension",
    prompt: "完成度を高めてから出したい ←→ まず出して動かしながら整えたい",
    leftLabel: "完成度を高めてから出したい",
    rightLabel: "まず出して動かしながら整えたい",
    questionText: "メッセージの文面を、何度も直してから送りますか？ パッと書いてすぐ送りますか？",
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
    questionText: "買い物をするとき、レビューや比較を徹底的に調べますか？ 直感で「これ」と決めますか？",
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
    questionText: "疲れた週末に回復するなら、一人の静かな時間ですか？ 友達と会って笑う時間ですか？",
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
    questionText: "買い物や趣味で、実績のある定番に手が伸びますか？ まだ見ぬ新しいものに惹かれますか？",
    scale: 5,
    axes: [{ key: "tradition_vs_novelty", weight: 1.0 }],
  },
  {
    id: "q19",
    chapter: "aesthetic_expression",
    prompt: "少数精鋭で深く選びたい ←→ たくさん試して広く掴みたい",
    leftLabel: "少数精鋭で深く選びたい",
    rightLabel: "たくさん試して広く掴みたい",
    questionText: "何かを集めるとき、少数を厳選して使い込む方ですか？ 幅広くたくさん試す方ですか？",
    scale: 5,
    axes: [{ key: "quality_vs_quantity", weight: 1.0 }],
  },
  {
    id: "q20",
    chapter: "aesthetic_expression",
    prompt: "時代を超えるものが好き ←→ 今の空気をまとったものが好き",
    leftLabel: "時代を超えるものが好き",
    rightLabel: "今の空気をまとったものが好き",
    questionText: "時代を超えて残るものに惹かれますか？ 今の空気をまとったものに惹かれますか？",
    scale: 5,
    axes: [{ key: "classic_vs_trendy", weight: 1.0 }],
  },
  {
    id: "q21",
    chapter: "aesthetic_expression",
    prompt: "洗練された抑制に惹かれる ←→ 強い表現や華やかさに惹かれる",
    leftLabel: "洗練された抑制に惹かれる",
    rightLabel: "強い表現や華やかさに惹かれる",
    questionText: "美しいと感じるのは、引き算の洗練ですか？ 足し算の華やかさですか？",
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
    questionText: "物事に白黒つけたい方ですか？ 曖昧な余白も大事にしたい方ですか？",
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
    questionText: "憧れるのは、信念を貫き通す人ですか？ 常に変わり続ける人ですか？",
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
    questionText: "企画やイベントで、リーダーを任されたら自然にできますか？ 裏方で支える方が力を発揮しますか？",
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
    questionText: "まわりの騒音や部屋の散らかりは、集中力や気分に影響しますか？ あまり気にならない方ですか？",
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
    questionText: "毎朝同じカフェで同じメニューを頼む——そういう習慣は心地よいですか？ 毎回新しい店を開拓したいですか？",
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
      "大切な人とすれ違いを感じたとき、一人で考えたくなりますか？ 相手に直接確かめたくなりますか？",
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
      "思うような結果が出なかったとき、「自分の準備不足だった」と感じますか？ 「環境やタイミングだった」と感じますか？",
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
      "苦手なことに取り組むとき、「練習すればできる」と思えますか？ 「向き不向きには逆らえない」と感じますか？",
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
      "「余計なこと言ったかも」と気づいたとき、寝る前にまだ気になっていますか？ すぐ「まあいいか」と流せますか？",
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
      "大きなミスをしたとき、「自分がダメだ」と落ち込みますか？ 「あの部分が足りなかった」と切り分けて振り返れますか？",
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
      "気が合いそうな人に出会ったとき、自分のことを話すペースはゆっくりですか？ わりとすぐ深い話もしますか？",
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
      "大切な人からしばらく連絡がないとき、「大丈夫だろう」と待てますか？ つい確認したくなりますか？",
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
      "仲の良い友達が急に「今から会えない？」と言ってきたとき、予定を変えてでも応じますか？ 自分の時間を守りますか？",
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
      "友達・恋人・仕事仲間のそれぞれと接するとき、自分は一貫していますか？ 関係の種類でまるで違う自分が出ますか？",
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
      "チームで成果が出たとき、自分だけ褒められると申し訳なく感じますか？ 逆に貢献が見過ごされると気になりますか？",
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
      "友人グループの中で、自分の居場所が揺らぐ感覚はありますか？ どこでも自然と馴染めますか？",
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
      "友達と旅行の計画を立てるとき、「これでいいよね」と流れで決めますか？ 「ここ行きたい？」とひとつずつ確認しますか？",
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
      "自分が直接関わらない部分があるとき、「任せよう」と思えますか？ つい「どうなってる？」と気になりますか？",
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
      "先に入れた約束の後に、もっと魅力的な誘いが来たとき、予定を変えますか？ 最初の約束を優先しますか？",
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
      "長い付き合いの関係で、時間が経つほど心地よくなりますか？ 慣れてくると変化がほしくなりますか？",
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
      "誘いを断られたとき、「嫌われたかも」と心に残りますか？ 「タイミングが合わなかっただけ」と切り替えられますか？",
    scale: 5,
    axes: [
      { key: "rejection_response_maturity", weight: 1.0 },
      { key: "exclusivity_pressure", weight: 0.2, invert: true },
    ],
    note: "拒否を成熟に受容できるほど排他的圧力は低い傾向",
  },

  // ── P2-2: 1問軸 追加質問（各軸+2問、計32問）──
  // 優先順: safety軸 → relational軸 → aesthetic軸 → その他

  // --- consent_maturity +2 ---
  {
    id: "q56",
    chapter: "boundary_intelligence",
    prompt: "相手の反応を気にせず提案する ←→ 相手の表情を見てから切り出す",
    leftLabel: "気にせず提案",
    rightLabel: "表情を見てから",
    questionText:
      "飲み会の二次会を提案するとき、場の空気を読まず「行こう！」と言えますか？ 相手の様子を見てから切り出しますか？",
    scale: 5,
    axes: [
      { key: "consent_maturity", weight: 0.8 },
      { key: "social_initiative", weight: 0.3 },
    ],
  },
  {
    id: "q57",
    chapter: "boundary_intelligence",
    prompt: "断られたら即引く ←→ もう一回だけ聞いてみる",
    leftLabel: "即引く",
    rightLabel: "もう一回聞く",
    questionText:
      "何かを頼んで「ちょっと…」と言われたとき、すぐ引きますか？ 理由を聞いたり別の案を出したりしますか？",
    scale: 5,
    axes: [
      { key: "consent_maturity", weight: 0.8, invert: true },
      { key: "control_tendency", weight: 0.2 },
    ],
    note: "押しの強さ→合意成熟度の逆指標",
  },

  // --- control_tendency +2 ---
  {
    id: "q58",
    chapter: "boundary_intelligence",
    prompt: "結果が出れば過程は問わない ←→ 過程も自分の目が届いていてほしい",
    leftLabel: "結果が出ればOK",
    rightLabel: "過程も見ていたい",
    questionText:
      "チームで何かを進めるとき、結果が出れば途中経過は気にしませんか？ 途中も把握していないと落ち着きませんか？",
    scale: 5,
    axes: [
      { key: "control_tendency", weight: 1.0 },
      { key: "efficiency_vs_process", weight: 0.2, invert: true },
    ],
  },
  {
    id: "q59",
    chapter: "boundary_intelligence",
    prompt: "相手のやり方を尊重する ←→ 自分のやり方に合わせてほしい",
    leftLabel: "相手のやり方を尊重",
    rightLabel: "自分流に合わせてほしい",
    questionText:
      "一緒に料理をするとき、相手の切り方が気になっても黙っていますか？ つい「こうした方がいいよ」と言いますか？",
    scale: 5,
    axes: [
      { key: "control_tendency", weight: 0.8 },
      { key: "direct_vs_diplomatic", weight: 0.2 },
    ],
  },

  // --- intent_stability +2 ---
  {
    id: "q60",
    chapter: "boundary_intelligence",
    prompt: "気分で予定を変える ←→ 決めた通りにやる",
    leftLabel: "気分で変える",
    rightLabel: "決めた通りに",
    questionText:
      "週末の計画を立てたのに当日やる気が出ないとき、別のことをしますか？ それでも予定通り動きますか？",
    scale: 5,
    axes: [
      { key: "intent_stability", weight: 1.0 },
      { key: "plan_vs_spontaneous", weight: 0.3 },
    ],
  },
  {
    id: "q61",
    chapter: "boundary_intelligence",
    prompt: "目標を柔軟に修正する ←→ 最初の目標を変えない",
    leftLabel: "柔軟に修正",
    rightLabel: "最初を貫く",
    questionText:
      "年初に立てた目標が難しいとわかったとき、目標を下方修正しますか？ 何とか達成しようとしますか？",
    scale: 5,
    axes: [{ key: "intent_stability", weight: 1.0 }],
  },

  // --- long_term_shift_risk +2 ---
  {
    id: "q62",
    chapter: "boundary_intelligence",
    prompt: "同じ相手と深まるのが好き ←→ 新しい出会いの方がワクワクする",
    leftLabel: "深まるのが好き",
    rightLabel: "新しい出会いが好き",
    questionText:
      "5年来の友人との食事と、初対面の人が集まる場と、どちらにワクワクしますか？",
    scale: 5,
    axes: [
      { key: "long_term_shift_risk", weight: 1.0 },
      { key: "social_initiative", weight: 0.2 },
    ],
  },
  {
    id: "q63",
    chapter: "boundary_intelligence",
    prompt: "マンネリも心地よい ←→ マンネリは耐えられない",
    leftLabel: "心地よい安定",
    rightLabel: "変化がほしい",
    questionText:
      "パートナーや親友とのいつもの過ごし方に、安心を感じますか？ もっと新しいことがしたくなりますか？",
    scale: 5,
    axes: [
      { key: "long_term_shift_risk", weight: 0.8 },
      { key: "change_embrace_vs_resist", weight: 0.2 },
    ],
  },

  // --- rejection_response_maturity +2 ---
  {
    id: "q64",
    chapter: "boundary_intelligence",
    prompt: "批判を成長材料にできる ←→ 批判は自分への否定に感じる",
    leftLabel: "成長材料にできる",
    rightLabel: "自分への否定に感じる",
    questionText:
      "上司や先生に厳しく指摘されたとき、「次に活かそう」と思えますか？ 「自分を否定された」と感じますか？",
    scale: 5,
    axes: [
      { key: "rejection_response_maturity", weight: 0.8 },
      { key: "shame_vs_guilt", weight: 0.3 },
    ],
  },
  {
    id: "q65",
    chapter: "boundary_intelligence",
    prompt: "失恋や別れを引きずらない ←→ 長く影響が残る",
    leftLabel: "切り替えが早い",
    rightLabel: "長く残る",
    questionText:
      "親しい人との関係が終わったとき、どれくらいで日常に戻れますか？ 長く引きずる方ですか？",
    scale: 5,
    axes: [
      { key: "rejection_response_maturity", weight: 0.8, invert: true },
      { key: "rumination_tendency", weight: 0.3 },
    ],
  },

  // --- reassurance_need +2 ---
  {
    id: "q66",
    chapter: "relational_texture",
    prompt: "既読スルーが気にならない ←→ 既読スルーが気になる",
    leftLabel: "気にならない",
    rightLabel: "気になる",
    questionText:
      "大切な人にメッセージを送って既読がついたまま返事がないとき、気になりますか？ 「そのうち来るだろう」と待てますか？",
    scale: 5,
    axes: [
      { key: "reassurance_need", weight: 1.0 },
      { key: "attachment_style", weight: 0.2 },
    ],
  },
  {
    id: "q67",
    chapter: "relational_texture",
    prompt: "褒められなくても平気 ←→ 認められると安心する",
    leftLabel: "自分で評価できる",
    rightLabel: "認められて安心する",
    questionText:
      "頑張った成果を誰にも気づかれなかったとき、自分で満足できますか？ 誰かに認めてもらいたくなりますか？",
    scale: 5,
    axes: [
      { key: "reassurance_need", weight: 0.8 },
      { key: "locus_of_control", weight: 0.2, invert: true },
    ],
  },

  // --- boundary_awareness +2 ---
  {
    id: "q68",
    chapter: "relational_texture",
    prompt: "頼まれると断れない ←→ 自分の限界を伝えられる",
    leftLabel: "断れない",
    rightLabel: "限界を伝えられる",
    questionText:
      "忙しいのに友人から頼み事をされたとき、無理しても引き受けますか？ 正直に「今は難しい」と言えますか？",
    scale: 5,
    axes: [
      { key: "boundary_awareness", weight: 1.0 },
      { key: "independence_vs_harmony", weight: 0.2 },
    ],
  },
  {
    id: "q69",
    chapter: "relational_texture",
    prompt: "プライベートに踏み込まれても平気 ←→ 立ち入られると不快",
    leftLabel: "平気",
    rightLabel: "不快に感じる",
    questionText:
      "初対面の人に年収や恋愛事情を聞かれたとき、普通に答えますか？ 「踏み込みすぎ」と感じますか？",
    scale: 5,
    axes: [
      { key: "boundary_awareness", weight: 0.8 },
      { key: "intimacy_pace", weight: 0.2, invert: true },
    ],
  },

  // --- relationship_mode_split +2 ---
  {
    id: "q70",
    chapter: "relational_texture",
    prompt: "恋人の前でも友達の前と同じ ←→ 恋人の前だけ別人になる",
    leftLabel: "基本同じ",
    rightLabel: "全然違う自分が出る",
    questionText:
      "友達グループの中にパートナーがいるとき、普段通りでいられますか？ パートナーの前だけ違う自分が出ますか？",
    scale: 5,
    axes: [
      { key: "relationship_mode_split", weight: 1.0 },
      { key: "public_private_gap", weight: 0.3 },
    ],
  },
  {
    id: "q71",
    chapter: "relational_texture",
    prompt: "上司と部下で態度が変わらない ←→ 立場で接し方が大きく変わる",
    leftLabel: "態度は一貫",
    rightLabel: "立場で大きく変わる",
    questionText:
      "上司と後輩のそれぞれと接するとき、言葉遣いや態度はどれくらい変わりますか？ ほぼ同じですか？",
    scale: 5,
    axes: [
      { key: "relationship_mode_split", weight: 0.8 },
      { key: "direct_vs_diplomatic", weight: 0.2 },
    ],
  },

  // --- fairness_sensitivity +2 ---
  {
    id: "q72",
    chapter: "relational_texture",
    prompt: "割り勘のずれが気にならない ←→ きっちり分けたい",
    leftLabel: "ざっくりでいい",
    rightLabel: "きっちり分けたい",
    questionText:
      "友達との食事で自分だけ多く払った気がするとき、気にしますか？ 「まあいいか」と流せますか？",
    scale: 5,
    axes: [{ key: "fairness_sensitivity", weight: 0.8 }],
  },
  {
    id: "q73",
    chapter: "relational_texture",
    prompt: "チームの手柄は皆のもの ←→ 個人の貢献は正当に評価されるべき",
    leftLabel: "みんなの成果",
    rightLabel: "個人の貢献を認めてほしい",
    questionText:
      "チームの成果が上司から褒められたとき、「みんなの力だ」と思えますか？ 「自分の貢献もちゃんと見てほしい」と思いますか？",
    scale: 5,
    axes: [
      { key: "fairness_sensitivity", weight: 0.8 },
      { key: "reassurance_need", weight: 0.2 },
    ],
  },

  // --- friend_mode_fit +2 ---
  {
    id: "q74",
    chapter: "relational_texture",
    prompt: "大人数の集まりが好き ←→ 少人数が落ち着く",
    leftLabel: "大人数が楽しい",
    rightLabel: "少人数が落ち着く",
    questionText:
      "休日を過ごすなら、大勢のパーティと2-3人での食事、どちらに居心地を感じますか？",
    scale: 5,
    axes: [
      { key: "friend_mode_fit", weight: 0.8 },
      { key: "introvert_vs_extrovert", weight: 0.3 },
    ],
  },
  {
    id: "q75",
    chapter: "relational_texture",
    prompt: "新しいグループにすぐ馴染める ←→ 慣れるまで時間がかかる",
    leftLabel: "すぐ馴染む",
    rightLabel: "時間がかかる",
    questionText:
      "知り合いがほとんどいない集まりに参加したとき、すぐ打ち解けますか？ 端の方にいる時間が長いですか？",
    scale: 5,
    axes: [
      { key: "friend_mode_fit", weight: 0.8 },
      { key: "social_initiative", weight: 0.3 },
    ],
  },

  // --- attachment_style +2 ---
  {
    id: "q76",
    chapter: "inner_depth",
    prompt: "甘えるのが自然 ←→ 甘えるのが苦手",
    leftLabel: "自然に甘えられる",
    rightLabel: "甘えるのが苦手",
    questionText:
      "体調が悪いとき、パートナーや友達に素直に「助けて」と言えますか？ 一人で何とかしようとしますか？",
    scale: 5,
    axes: [
      { key: "attachment_style", weight: 0.8, invert: true },
      { key: "reassurance_need", weight: 0.2, invert: true },
    ],
    note: "右=回避傾向。invert: 甘えられる→不安型寄り, 甘えられない→回避型寄り",
  },
  {
    id: "q77",
    chapter: "inner_depth",
    prompt: "離れていても信頼できる ←→ 近くにいないと不安",
    leftLabel: "離れていても安心",
    rightLabel: "近くにいないと不安",
    questionText:
      "パートナーが長期出張に行くとき、「頑張ってね」と送り出せますか？ 離れていることが不安になりますか？",
    scale: 5,
    axes: [
      { key: "attachment_style", weight: 1.0 },
      { key: "reassurance_need", weight: 0.3 },
    ],
  },

  // --- locus_of_control +2 ---
  {
    id: "q78",
    chapter: "inner_depth",
    prompt: "運や縁を信じる ←→ 結果は行動で決まる",
    leftLabel: "運や縁の力が大きい",
    rightLabel: "行動で切り拓ける",
    questionText:
      "人生のターニングポイントを振り返ったとき、「運が良かった」と感じますか？ 「自分の選択の結果だ」と感じますか？",
    scale: 5,
    axes: [{ key: "locus_of_control", weight: 1.0 }],
  },
  {
    id: "q79",
    chapter: "inner_depth",
    prompt: "失敗は自分の責任 ←→ 仕方がない面もある",
    leftLabel: "自分の責任",
    rightLabel: "環境の影響もある",
    questionText:
      "プロジェクトがうまくいかなかったとき、「もっとやれたはず」と思いますか？ 「状況的に厳しかった」と思いますか？",
    scale: 5,
    axes: [
      { key: "locus_of_control", weight: 0.8, invert: true },
      { key: "rumination_tendency", weight: 0.2 },
    ],
  },

  // --- growth_mindset +2 ---
  {
    id: "q80",
    chapter: "inner_depth",
    prompt: "年齢に関係なく変われる ←→ ある程度の年齢で性格は固まる",
    leftLabel: "いつでも変われる",
    rightLabel: "性格は固まる",
    questionText:
      "40歳を過ぎても、人の性格や能力は大きく変われると思いますか？ ある程度の年齢で固まると思いますか？",
    scale: 5,
    axes: [{ key: "growth_mindset", weight: 1.0 }],
  },
  {
    id: "q81",
    chapter: "inner_depth",
    prompt: "才能より努力が勝つ ←→ 努力では越えられない壁がある",
    leftLabel: "努力で越えられる",
    rightLabel: "才能の壁がある",
    questionText:
      "自分より才能がある人を見たとき、「努力で追いつける」と思えますか？ 「生まれ持ったものには敵わない」と感じますか？",
    scale: 5,
    axes: [
      { key: "growth_mindset", weight: 0.8 },
      { key: "locus_of_control", weight: 0.2, invert: true },
    ],
  },

  // --- rumination_tendency +2 ---
  {
    id: "q82",
    chapter: "inner_depth",
    prompt: "過去の失言をふと思い出す ←→ 前のことはあまり振り返らない",
    leftLabel: "ふと思い出す",
    rightLabel: "振り返らない",
    questionText:
      "何年も前の恥ずかしい出来事がふと頭をよぎることがありますか？ 過去のことはほとんど思い出しませんか？",
    scale: 5,
    axes: [
      { key: "rumination_tendency", weight: 1.0 },
      { key: "shame_vs_guilt", weight: 0.2 },
    ],
  },
  {
    id: "q83",
    chapter: "inner_depth",
    prompt: "選んだ後に「あっちが良かったかも」と思う ←→ 選んだら振り返らない",
    leftLabel: "後から迷う",
    rightLabel: "選んだら前を向く",
    questionText:
      "レストランで注文した後、隣の人のメニューを見て「そっちにすればよかった」と思いますか？ 選んだものに満足できますか？",
    scale: 5,
    axes: [
      { key: "rumination_tendency", weight: 0.8 },
      { key: "cautious_vs_bold", weight: 0.2, invert: true },
    ],
  },

  // --- shame_vs_guilt +2 ---
  {
    id: "q84",
    chapter: "inner_depth",
    prompt: "失敗で「自分はダメな人間だ」と思う ←→ 「あの判断がまずかった」と思う",
    leftLabel: "自分がダメだと感じる",
    rightLabel: "判断のミスと切り分ける",
    questionText:
      "約束を忘れてしまったとき、「自分は信頼できない人間だ」と落ち込みますか？ 「次から気をつけよう」と対策を考えますか？",
    scale: 5,
    axes: [{ key: "shame_vs_guilt", weight: 1.0 }],
  },
  {
    id: "q85",
    chapter: "inner_depth",
    prompt: "恥ずかしい場面を避ける ←→ 恥をかいても挑戦する",
    leftLabel: "恥を避ける",
    rightLabel: "恥をかいても挑戦",
    questionText:
      "人前で発表する機会があったとき、失敗が怖くて避けたくなりますか？ 恥をかいてもやってみたいと思いますか？",
    scale: 5,
    axes: [
      { key: "shame_vs_guilt", weight: 0.8 },
      { key: "cautious_vs_bold", weight: 0.3, invert: true },
    ],
  },

  // --- classic_vs_trendy +2 ---
  {
    id: "q86",
    chapter: "aesthetic_expression",
    prompt: "定番を選ぶ ←→ 今っぽいものを選ぶ",
    leftLabel: "定番・王道",
    rightLabel: "今っぽさ・旬",
    questionText:
      "カフェで注文するとき、いつもの定番メニューを頼みますか？ 季節限定や新メニューを試しますか？",
    scale: 5,
    axes: [
      { key: "classic_vs_trendy", weight: 1.0 },
      { key: "tradition_vs_novelty", weight: 0.3 },
    ],
  },
  {
    id: "q87",
    chapter: "aesthetic_expression",
    prompt: "長く使えるものを選ぶ ←→ 今の気分に合うものを選ぶ",
    leftLabel: "長く使えるもの",
    rightLabel: "今の気分に合うもの",
    questionText:
      "服を買うとき、5年後も着られるベーシックなものを選びますか？ 今の気分にぴったりなものを選びますか？",
    scale: 5,
    axes: [
      { key: "classic_vs_trendy", weight: 0.8 },
      { key: "quality_vs_quantity", weight: 0.2 },
    ],
  },

  // ── P2-2 追加ここまで（q56-q87 = 32問）──

  // ── Decision Logic: 判断様式 (4問) ──
  {
    id: "q52",
    chapter: "decision_logic",
    prompt: "論理で判断する ←→ 感情・直感で判断する",
    leftLabel: "論理で判断する",
    rightLabel: "感情・直感で判断する",
    questionText:
      "大きな決断をするとき、データや根拠を重視しますか？ 自分の直感や気持ちを信じますか？",
    scale: 5,
    axes: [
      { key: "rational_vs_emotional_decision", weight: 1.0 },
      { key: "analytical_vs_intuitive", weight: 0.3 },
    ],
  },
  {
    id: "q53",
    chapter: "decision_logic",
    prompt: "最短距離を選ぶ ←→ 過程を大事にする",
    leftLabel: "最短距離を選ぶ",
    rightLabel: "過程を大事にする",
    questionText:
      "目標に向かうとき、最短ルートで結果を出したいですか？ 遠回りでもプロセスを楽しみたいですか？",
    scale: 5,
    axes: [
      { key: "efficiency_vs_process", weight: 1.0 },
      { key: "perfectionist_vs_pragmatic", weight: 0.2 },
    ],
  },
  {
    id: "q54",
    chapter: "decision_logic",
    prompt: "理屈で納得する ←��� 気持ちで動く",
    leftLabel: "理屈で納得する",
    rightLabel: "気持ちで動く",
    questionText:
      "誰かに説得されるとき、筋の通った説明で納得しますか？ 相手の熱意や共感で心が動きますか？",
    scale: 5,
    axes: [
      { key: "rational_vs_emotional_decision", weight: 0.8 },
      { key: "direct_vs_diplomatic", weight: 0.2 },
    ],
  },
  {
    id: "q55",
    chapter: "decision_logic",
    prompt: "効率を最優先する ←→ 体験を重視する",
    leftLabel: "効率を最優先する",
    rightLabel: "体験を重視する",
    questionText:
      "旅行のとき、効率よく名所を回りたいですか？ 予定を決めず気の向くまま過ごしたいですか？",
    scale: 5,
    axes: [
      { key: "efficiency_vs_process", weight: 0.8 },
      { key: "plan_vs_spontaneous", weight: 0.3 },
    ],
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
