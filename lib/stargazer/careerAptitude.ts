// lib/stargazer/careerAptitude.ts
// 適職マッチングエンジン — 観測データから具体的な職種適性を算出
// 全職種を列挙し、観測軸スコアとの相性を0-100%で表示

import type { TraitAxisKey } from "./traitAxes";
import type { CognitiveAxisKey } from "./cognitiveFitQuestions";

// ── 職種定義 ──

export interface JobRole {
  id: string;
  name: string;
  category: JobCategory;
  description: string;
  /** この仕事で活きる強み（マッチ時に表示） */
  whyGoodFit: string;
  /** この仕事で気をつけること（マッチ時に表示） */
  watchOut: string;
  /** 3年後の成長予測 */
  growthPrediction: string;
  /** 成功するための具体的な行動・思考パターン */
  successActions: string[];
  /** これをやると失敗確率が著しく上がるリスク */
  failureRisks: string[];
  /** 軸ごとの重み: 正=高い方が合う, 負=低い方が合う */
  axisWeights: Partial<Record<TraitAxisKey, number>>;
  /** 認知適性軸の重み: 正=高い方が合う, 負=低い方が合う */
  cfWeights?: Partial<Record<CognitiveAxisKey, number>>;
}

export type JobCategory =
  | "leadership"     // 経営・マネジメント
  | "creative"       // クリエイティブ
  | "analytical"     // 分析・研究
  | "social"         // 対人・コミュニケーション
  | "operational"    // 実務・管理
  | "technical"      // 技術・専門
  | "care"           // ケア・教育
  | "independent"    // 独立・フリーランス
  | "specialist"     // 専門職・士業
  | "digital";       // デジタル・IT

export const CATEGORY_LABELS: Record<JobCategory, { label: string; icon: string }> = {
  leadership: { label: "経営・マネジメント", icon: "👑" },
  creative: { label: "クリエイティブ", icon: "🎨" },
  analytical: { label: "分析・研究", icon: "🔬" },
  social: { label: "対人・コミュニケーション", icon: "🤝" },
  operational: { label: "実務・管理", icon: "📋" },
  technical: { label: "技術・専門", icon: "⚙️" },
  care: { label: "ケア・教育", icon: "🌱" },
  independent: { label: "独立・フリーランス", icon: "🦅" },
  specialist: { label: "専門職・士業", icon: "📜" },
  digital: { label: "デジタル・IT", icon: "💻" },
};

// ── Axis key reference ──
// Available axes:
// introvert_vs_extrovert, individual_vs_social, cautious_vs_bold,
// analytical_vs_intuitive, change_embrace_vs_resist, plan_vs_spontaneous,
// tradition_vs_novelty, independence_vs_harmony, direct_vs_diplomatic,
// stress_isolation_vs_social, function_vs_expression, minimal_vs_maximal,
// perfectionist_vs_pragmatic, quality_vs_quantity, classic_vs_trendy,
// intimacy_pace, reassurance_need, emotional_variability,
// social_initiative, boundary_awareness, relationship_mode_split,
// boundary_respect, consent_maturity, pressure_risk, escalation_risk,
// friend_mode_fit, intent_stability, rejection_response_maturity,
// control_tendency, exclusivity_pressure, long_term_shift_risk,
// public_private_gap, emotional_regulation

// ── 全職種データベース ──

export const JOB_ROLES: JobRole[] = [
  // ── 経営・マネジメント ──
  {
    id: "ceo",
    name: "経営者・社長",
    category: "leadership",
    description: "組織全体のビジョンと方向性を決め、チームを導く",
    whyGoodFit: "大きな視野で判断を下し、周囲を巻き込む力がある",
    watchOut: "細部の管理を他者に任せる仕組みが必要",
    growthPrediction: "意思決定の精度が上がり、直感と分析のバランスが取れるようになる",
    successActions: [
      "毎日15分、情報を遮断して「今週で一番重要なことは何か」を自問する",
      "月1回は現場に出て、顧客と直接話す時間を確保する",
      "判断に迷ったら「3年後にどちらを選んだ自分を尊敬するか」で決める",
    ],
    failureRisks: [
      "全てを自分で判断しようとして、組織がボトルネック化する",
      "数字だけで判断し、現場の感覚を無視する",
      "ビジョンを語るだけで実行の仕組みを作らない",
    ],
    axisWeights: {
      social_initiative: 0.8,
      introvert_vs_extrovert: 0.6,
      cautious_vs_bold: 0.7,
      emotional_regulation: 0.6,
      analytical_vs_intuitive: 0.3,
      direct_vs_diplomatic: 0.4,
      control_tendency: 0.5,
      emotional_variability: 0.2,
    },
    cfWeights: {
      abstract_structuring: 0.7,
      decision_tempo: -0.5,
      cognitive_updating: 0.4,
      exploration_closure: 0.5,
    },
  },
  {
    id: "manager",
    name: "マネージャー・管理職",
    category: "leadership",
    description: "チームの成果を最大化し、メンバーの力を引き出す",
    whyGoodFit: "人の特性を見極め、適切な役割を振れる",
    watchOut: "自分でやった方が早いと思う場面で、任せる練習が必要",
    growthPrediction: "チームビルディングの勘が研ぎ澄まされ、多様なメンバーを活かせるようになる",
    successActions: [
      "1on1で「最近何にモヤモヤしてる？」と聞く——問題は早期に見つかる",
      "メンバーの成功を自分の手柄にせず、本人に帰属させる",
      "「任せた」と言ったら、途中で口を出さない仕組みを作る",
    ],
    failureRisks: [
      "マイクロマネジメントでメンバーの自律性を潰す",
      "全員に好かれようとして、必要な厳しいフィードバックを避ける",
      "プレイヤーとして優秀だった経験から、部下の仕事を奪ってしまう",
    ],
    axisWeights: {
      social_initiative: 0.6,
      direct_vs_diplomatic: 0.3,
      boundary_awareness: 0.5,
      emotional_regulation: 0.5,
      introvert_vs_extrovert: 0.4,
      change_embrace_vs_resist: 0.2,
      control_tendency: 0.4,
      emotional_variability: -0.3,
    },
    cfWeights: {
      social_modeling: 0.6,
      cognitive_updating: 0.4,
      decision_tempo: -0.3,
    },
  },
  {
    id: "project_manager",
    name: "プロジェクトマネージャー",
    category: "leadership",
    description: "複数の関係者を調整し、プロジェクトを成功に導く",
    whyGoodFit: "全体を見渡しながら、細部も見逃さないバランス感覚がある",
    watchOut: "完璧主義が出ると進行が止まる。「十分良い」で進める判断力を",
    growthPrediction: "リスク予測の精度が上がり、問題が起きる前に手を打てるようになる",
    successActions: [
      "週初に「今週の最大リスクは何か」をチームに問いかける",
      "進捗報告より「困っていること」を優先して聞く場を作る",
      "バッファは計画の20%。見積もりは常に1.3倍にする",
    ],
    failureRisks: [
      "計画通りに進めることに固執し、変化に対応できない",
      "ステークホルダーの顔色ばかり見て、チームの負荷を無視する",
      "完璧な計画を作ろうとして、開始が遅れる",
    ],
    axisWeights: {
      analytical_vs_intuitive: -0.3,
      emotional_regulation: 0.6,
      social_initiative: 0.4,
      plan_vs_spontaneous: -0.5,
      direct_vs_diplomatic: 0.2,
      introvert_vs_extrovert: 0.4,
      control_tendency: 0.4,
      emotional_variability: -0.2,
    },
    cfWeights: {
      decomposition: 0.6,
      decision_tempo: 0.4,
      exploration_closure: 0.5,
    },
  },

  // ── クリエイティブ ──
  {
    id: "designer",
    name: "デザイナー",
    category: "creative",
    description: "視覚的な表現で価値を伝え、ユーザー体験を設計する",
    whyGoodFit: "感覚的な美しさと論理的な構造を両立できる",
    watchOut: "こだわりすぎて完成が遅れることがある",
    growthPrediction: "自分のスタイルが確立し、表現の幅が広がる",
    successActions: [
      "「なぜこのデザインか」を言語化する習慣をつける——感覚だけでは人を説得できない",
      "完成度70%で一度見せてフィードバックをもらう。完璧は一人で作らない",
      "月に1回は全く違うジャンルのデザインに触れる（建築、料理、自然）",
    ],
    failureRisks: [
      "自分の美学に固執し、ユーザーの実際のニーズを無視する",
      "トレンドを追いすぎて独自性を失う",
      "手を動かす前に考えすぎて、アウトプットが出ない",
    ],
    axisWeights: {
      analytical_vs_intuitive: 0.5,
      function_vs_expression: 0.6,
      introvert_vs_extrovert: -0.4,
      change_embrace_vs_resist: 0.4,
      perfectionist_vs_pragmatic: -0.3,
      individual_vs_social: -0.4,
      plan_vs_spontaneous: -0.2,
      social_initiative: -0.2,
    },
    cfWeights: {
      abstract_structuring: 0.5,
      exploration_closure: -0.5,
      cognitive_updating: 0.4,
    },
  },
  {
    id: "writer",
    name: "ライター・編集者",
    category: "creative",
    description: "言葉で情報を整理し、読み手に伝わる形にする",
    whyGoodFit: "物事の本質を捉え、わかりやすく言語化できる",
    watchOut: "一人の作業が多いため、孤立しないよう意識的に交流を",
    growthPrediction: "独自の文体と視点が評価され、専門分野での信頼が積み重なる",
    successActions: [
      "「誰に、何を、なぜ」を書き始める前に明確にする",
      "一日の始めに書く時間を確保する——後回しにすると書けなくなる",
      "書いた翌日に読み返す。一晩寝かせると客観的に見える",
    ],
    failureRisks: [
      "完璧な一文を求めて進まない。まず書き切ってから直す",
      "読者を忘れて自己満足の文章になる",
      "孤立が深まり、フィードバックを受ける機会を失う",
    ],
    axisWeights: {
      analytical_vs_intuitive: 0.3,
      introvert_vs_extrovert: -0.4,
      boundary_awareness: 0.4,
      change_embrace_vs_resist: 0.3,
      individual_vs_social: -0.3,
      function_vs_expression: 0.5,
      plan_vs_spontaneous: -0.2,
      social_initiative: -0.3,
    },
    cfWeights: {
      abstract_structuring: 0.5,
      decomposition: 0.4,
      decision_tempo: 0.4,
    },
  },
  {
    id: "content_creator",
    name: "コンテンツクリエイター",
    category: "creative",
    description: "SNSや動画など、人を惹きつけるコンテンツを企画・制作する",
    whyGoodFit: "トレンドを掴み、自分の感性で発信できる",
    watchOut: "反応に一喜一憂しない精神的な基盤が重要",
    growthPrediction: "独自のブランドが確立し、ファンコミュニティが育つ",
    successActions: [
      "数字（再生数・いいね）は月単位で見る。1本ごとに一喜一憂しない",
      "自分が本当に面白いと思うものだけ作る——嘘は視聴者に見抜かれる",
      "週に1本は「実験作」を出す。失敗OKの枠を作る",
    ],
    failureRisks: [
      "バズを追いかけて自分の軸を見失う",
      "コメント欄の否定的意見を全て真に受ける",
      "量産に走って質とオリジナリティが下がる",
    ],
    axisWeights: {
      introvert_vs_extrovert: 0.5,
      change_embrace_vs_resist: 0.6,
      cautious_vs_bold: 0.4,
      social_initiative: 0.5,
      classic_vs_trendy: 0.4,
      function_vs_expression: 0.5,
      emotional_variability: 0.3,
      plan_vs_spontaneous: 0.2,
    },
    cfWeights: {
      cognitive_updating: 0.5,
      exploration_closure: -0.4,
      decision_tempo: -0.5,
    },
  },
  {
    id: "musician_artist",
    name: "アーティスト・音楽家",
    category: "creative",
    description: "芸術作品を通じて感情や世界観を表現する",
    whyGoodFit: "内面の豊かさを形にする力がある",
    watchOut: "経済的な安定とのバランスを意識的に設計する必要がある",
    growthPrediction: "表現の深みが増し、共感してくれる人の輪が広がる",
    successActions: [
      "技術の鍛錬と感性のインプットを毎日の習慣にする",
      "作品を世に出す「締め切り」を自分で設定する",
      "経済面は別の収入源で安定させ、表現を妥協しない環境を作る",
    ],
    failureRisks: [
      "「まだ準備ができていない」と永遠に発表しない",
      "商業的成功だけを追い、自分の表現から離れる",
      "孤独に浸りすぎて、共創や外部刺激を遮断する",
    ],
    axisWeights: {
      emotional_variability: 0.5,
      analytical_vs_intuitive: 0.6,
      introvert_vs_extrovert: -0.5,
      function_vs_expression: 0.7,
      independence_vs_harmony: -0.4,
      plan_vs_spontaneous: 0.3,
      individual_vs_social: -0.4,
      social_initiative: -0.3,
    },
    cfWeights: {
      exploration_closure: -0.6,
      abstract_structuring: 0.4,
      cognitive_updating: -0.3,
    },
  },

  // ── 分析・研究 ──
  {
    id: "researcher",
    name: "研究者・アナリスト",
    category: "analytical",
    description: "データや現象を深く分析し、新しい知見を見つける",
    whyGoodFit: "一つのテーマを粘り強く掘り下げる集中力がある",
    watchOut: "「完璧なデータ」を待ちすぎて行動が遅れることがある",
    growthPrediction: "専門分野で独自の視点が認められ、発言力が増す",
    successActions: [
      "仮説を先に立ててからデータに当たる——仮説なしの分析は迷路",
      "週1回は専門外の人に自分の研究を説明する練習をする",
      "「この発見で誰が助かるか」を常に意識する",
    ],
    failureRisks: [
      "完璧なデータを求めて永遠に分析を続け、結論を出さない",
      "専門に閉じこもり、実社会との接点を失う",
      "自分の仮説に固執し、反証を無視する",
    ],
    axisWeights: {
      analytical_vs_intuitive: -0.7,
      introvert_vs_extrovert: -0.4,
      individual_vs_social: -0.4,
      perfectionist_vs_pragmatic: -0.4,
      quality_vs_quantity: -0.3,
      plan_vs_spontaneous: -0.4,
      function_vs_expression: -0.3,
      emotional_regulation: 0.3,
    },
    cfWeights: {
      abstract_structuring: 0.7,
      decomposition: 0.6,
      decision_tempo: 0.5,
    },
  },
  {
    id: "data_scientist",
    name: "データサイエンティスト",
    category: "analytical",
    description: "大量のデータから意味のあるパターンを見つけ出す",
    whyGoodFit: "論理的思考と直感的なパターン認識の両方を使える",
    watchOut: "技術に没頭しすぎて、ビジネスインパクトの視点を忘れがち",
    growthPrediction: "データから仮説を立てる速度が上がり、意思決定への影響力が増す",
    successActions: [
      "分析結果を「だから何をすべきか」まで翻訳して伝える",
      "モデルの精度よりも、意思決定に使えるかどうかを優先する",
      "ドメイン知識を深める——技術だけでは的外れな分析になる",
    ],
    failureRisks: [
      "モデルの精度に固執し、実用性のない分析に時間を使う",
      "ビジネス側とのコミュニケーションを避け、技術の殻に閉じこもる",
      "「データが全てを語る」と過信し、質的なインサイトを軽視する",
    ],
    axisWeights: {
      analytical_vs_intuitive: -0.6,
      introvert_vs_extrovert: -0.2,
      change_embrace_vs_resist: 0.3,
      plan_vs_spontaneous: -0.3,
      individual_vs_social: -0.3,
      function_vs_expression: -0.4,
      perfectionist_vs_pragmatic: -0.3,
      emotional_regulation: 0.3,
    },
    cfWeights: {
      abstract_structuring: 0.6,
      decomposition: 0.7,
      decision_tempo: 0.4,
    },
  },
  {
    id: "strategist",
    name: "戦略コンサルタント",
    category: "analytical",
    description: "企業の課題を構造化し、解決策を提案する",
    whyGoodFit: "複雑な問題を整理し、本質を見抜く力がある",
    watchOut: "提案だけでなく実行まで見届ける視点が重要",
    growthPrediction: "業界を超えた知見が蓄積し、より大きな課題に取り組めるようになる",
    successActions: [
      "「正しい答え」より「正しい問い」を見つけることに時間を使う",
      "提案書だけでなく、実行の最初の一歩まで一緒に踏む",
      "自分の専門外の視点を取り入れるために、異業種の人と定期的に会う",
    ],
    failureRisks: [
      "知的な美しさに酔って、実行可能性を無視した提案をする",
      "クライアントの組織力学を無視した正論を押し通す",
      "「分析→提案」で終わり、成果を見届けない",
    ],
    axisWeights: {
      analytical_vs_intuitive: -0.5,
      social_initiative: 0.4,
      direct_vs_diplomatic: 0.3,
      emotional_regulation: 0.5,
      cautious_vs_bold: 0.3,
      plan_vs_spontaneous: -0.3,
      introvert_vs_extrovert: 0.3,
      function_vs_expression: -0.3,
    },
    cfWeights: {
      abstract_structuring: 0.7,
      decomposition: 0.5,
      social_modeling: 0.4,
    },
  },

  // ── 対人・コミュニケーション ──
  {
    id: "sales",
    name: "営業",
    category: "social",
    description: "顧客のニーズを理解し、最適な提案で信頼関係を築く",
    whyGoodFit: "相手の気持ちを察しながら、適切なタイミングで提案できる",
    watchOut: "断られることをパーソナルに受け取りすぎないこと",
    growthPrediction: "顧客理解が深まり、長期的な関係構築で安定した成果が出る",
    successActions: [
      "「売る」前に「聞く」——相手の真のニーズを引き出す質問力を磨く",
      "断られた理由を分析し、次の提案に活かすPDCAを回す",
      "既存顧客との関係を深めることに時間の50%を使う",
    ],
    failureRisks: [
      "短期の数字に追われ、顧客の信頼を犠牲にする",
      "断られた時に自分を否定し、行動量が減る悪循環に入る",
      "話しすぎて聞かない——押し売りモードになる",
    ],
    axisWeights: {
      introvert_vs_extrovert: 0.6,
      social_initiative: 0.7,
      boundary_awareness: 0.4,
      rejection_response_maturity: 0.5,
      direct_vs_diplomatic: 0.2,
      cautious_vs_bold: 0.3,
      emotional_regulation: 0.4,
      function_vs_expression: -0.2,
    },
    cfWeights: {
      decision_tempo: -0.5,
      social_modeling: 0.5,
      exploration_closure: 0.4,
    },
  },
  {
    id: "marketing",
    name: "マーケティング",
    category: "social",
    description: "市場を分析し、商品やサービスの魅力を最大化する",
    whyGoodFit: "データと感性の両方で人の心を動かす方法を考えられる",
    watchOut: "アイデアが多すぎて優先順位づけが難しくなることがある",
    growthPrediction: "消費者心理への理解が深まり、直感的に効果的な施策を打てるようになる",
    successActions: [
      "施策は必ず効果測定する——「やった感」で満足しない",
      "ターゲットの生活を24時間想像してみる。机上の分析を超える",
      "月に1回はターゲット層と直接対話する機会を作る",
    ],
    failureRisks: [
      "施策を散発的に打ち、一貫したブランドメッセージを失う",
      "数字ばかり見て、顧客の感情的なインサイトを見逃す",
      "トレンドに飛びつき、自社の強みと合わない施策に資源を投入する",
    ],
    axisWeights: {
      analytical_vs_intuitive: 0.3,
      introvert_vs_extrovert: 0.3,
      change_embrace_vs_resist: 0.4,
      social_initiative: 0.4,
      classic_vs_trendy: 0.3,
      emotional_regulation: 0.3,
      function_vs_expression: 0.2,
      cautious_vs_bold: 0.3,
    },
    cfWeights: {
      cognitive_updating: 0.5,
      social_modeling: 0.4,
      exploration_closure: -0.4,
    },
  },
  {
    id: "hr",
    name: "人事・採用",
    category: "social",
    description: "人材の見極めと組織の人づくりを担う",
    whyGoodFit: "人の特性を見抜き、適切な環境を用意できる",
    watchOut: "全員を幸せにはできない。難しい判断を下す覚悟も必要",
    growthPrediction: "人を見る目が磨かれ、組織全体のパフォーマンスに貢献できるようになる",
    successActions: [
      "採用面接では「何ができるか」より「なぜそれをしたいか」を聞く",
      "組織の課題を経営目線で捉え、人事施策を戦略に紐づける",
      "退職者の声を真摯に聞く——最も正直なフィードバックはそこにある",
    ],
    failureRisks: [
      "全員に好かれようとして、公平さを犠牲にする",
      "制度設計ばかりに注力し、現場の温度感を把握しない",
      "法令遵守の視点を軽視して、大きなリスクを見逃す",
    ],
    axisWeights: {
      boundary_awareness: 0.7,
      direct_vs_diplomatic: -0.3,
      social_initiative: 0.4,
      introvert_vs_extrovert: 0.3,
      emotional_regulation: 0.3,
      analytical_vs_intuitive: -0.2,
      independence_vs_harmony: 0.3,
      emotional_variability: -0.2,
    },
    cfWeights: {
      social_modeling: 0.7,
      cognitive_updating: 0.4,
      exploration_closure: -0.3,
    },
  },
  {
    id: "public_relations",
    name: "広報・PR",
    category: "social",
    description: "組織のメッセージを社会に伝え、ブランドイメージを構築する",
    whyGoodFit: "言葉の力で人の認識を変えることができる",
    watchOut: "ネガティブな反応にも冷静に対処する力が求められる",
    growthPrediction: "メディアリテラシーが高まり、危機対応でも冷静に対処できるようになる",
    successActions: [
      "「伝えたいこと」ではなく「相手が聞きたいこと」から逆算する",
      "危機対応のシナリオを事前に準備しておく。起きてからでは遅い",
      "社内の「面白い人・面白い取り組み」を常にアンテナで拾う",
    ],
    failureRisks: [
      "ネガティブ報道にパニックし、不用意な発言をする",
      "社内と社外のメッセージが乖離し、信頼を失う",
      "メディア対応ばかりに集中し、社内コミュニケーションを軽視する",
    ],
    axisWeights: {
      introvert_vs_extrovert: 0.5,
      direct_vs_diplomatic: -0.4,
      social_initiative: 0.5,
      emotional_regulation: 0.4,
      public_private_gap: -0.3,
      change_embrace_vs_resist: 0.3,
      cautious_vs_bold: 0.2,
      analytical_vs_intuitive: 0.2,
    },
    cfWeights: {
      social_modeling: 0.5,
      cognitive_updating: 0.5,
      decision_tempo: -0.4,
    },
  },

  // ── 実務・管理 ──
  {
    id: "admin",
    name: "事務・総務",
    category: "operational",
    description: "組織の日常業務を正確にこなし、円滑な運営を支える",
    whyGoodFit: "安定した正確さと、地道な作業を続ける忍耐力がある",
    watchOut: "単調さに飽きないよう、小さな改善を自分で見つける習慣を",
    growthPrediction: "業務全体への理解が深まり、組織の効率化に大きく貢献できるようになる",
    successActions: [
      "「これ、もっと楽にできないか」を毎日1つだけ考える",
      "マニュアルを作る側に回る——属人化を減らすことで自分の価値が上がる",
      "他部署との接点を意識的に増やし、組織全体を把握する",
    ],
    failureRisks: [
      "「言われたことだけやる」で止まり、改善提案を出さない",
      "正確さだけに固執し、スピードとのバランスを失う",
      "変化を恐れて新しいツールやプロセスの導入に抵抗する",
    ],
    axisWeights: {
      change_embrace_vs_resist: -0.6,
      analytical_vs_intuitive: -0.3,
      plan_vs_spontaneous: -0.5,
      introvert_vs_extrovert: -0.2,
      perfectionist_vs_pragmatic: -0.3,
      emotional_regulation: 0.3,
      independence_vs_harmony: 0.3,
      function_vs_expression: -0.3,
    },
    cfWeights: {
      decomposition: 0.5,
      decision_tempo: 0.3,
      exploration_closure: 0.5,
    },
  },
  {
    id: "accountant",
    name: "経理・財務",
    category: "operational",
    description: "数字で組織の健全性を把握し、適切な管理を行う",
    whyGoodFit: "正確さへのこだわりと数字への感度が高い",
    watchOut: "数字の向こう側にある「人の行動」にも目を向けること",
    growthPrediction: "経営数字の読み方が深まり、戦略的な財務判断ができるようになる",
    successActions: [
      "数字の「異変」に気づいたら、すぐに原因を深掘りする習慣をつける",
      "経営層に数字を「物語」として伝えるプレゼン力を磨く",
      "業界の税制・会計基準の変更を先回りして把握する",
    ],
    failureRisks: [
      "数字の正確さだけに注力し、経営的な意味を読み取らない",
      "コスト削減ばかり提案し、成長投資の視点を持たない",
      "ルール順守に固執し、事業のスピードを落とすブレーキ役になる",
    ],
    axisWeights: {
      analytical_vs_intuitive: -0.7,
      change_embrace_vs_resist: -0.5,
      perfectionist_vs_pragmatic: -0.5,
      introvert_vs_extrovert: -0.3,
      plan_vs_spontaneous: -0.5,
      emotional_regulation: 0.4,
      function_vs_expression: -0.4,
      quality_vs_quantity: -0.3,
    },
    cfWeights: {
      decomposition: 0.6,
      exploration_closure: 0.6,
      abstract_structuring: 0.4,
    },
  },
  {
    id: "legal",
    name: "法務・コンプライアンス",
    category: "operational",
    description: "法的リスクを管理し、組織を守る",
    whyGoodFit: "論理的に問題を整理し、リスクを事前に察知できる",
    watchOut: "リスク回避だけでなく、事業を前に進める視点も大切",
    growthPrediction: "法的思考力が深まり、経営判断にも影響力を持てるようになる",
    successActions: [
      "「ダメ」だけでなく「こうすればできる」を提案する法務になる",
      "契約交渉では相手のビジネスモデルも理解してから臨む",
      "リスクの大きさと確率を定量的に説明する練習をする",
    ],
    failureRisks: [
      "リスクを指摘するだけで代替案を出さない「NO職人」になる",
      "法的に正しいが事業的には致命的な判断を押し通す",
      "細かいリスクに時間を使い、大きなリスクを見逃す",
    ],
    axisWeights: {
      analytical_vs_intuitive: -0.6,
      cautious_vs_bold: -0.5,
      emotional_regulation: 0.5,
      direct_vs_diplomatic: 0.3,
      plan_vs_spontaneous: -0.4,
      introvert_vs_extrovert: -0.1,
      function_vs_expression: -0.3,
      independence_vs_harmony: -0.3,
    },
    cfWeights: {
      decomposition: 0.6,
      abstract_structuring: 0.5,
      decision_tempo: 0.4,
    },
  },

  // ── 技術・専門 ──
  {
    id: "engineer",
    name: "エンジニア・開発者",
    category: "technical",
    description: "技術で課題を解決し、ものづくりを行う",
    whyGoodFit: "論理的に考え、手を動かして形にする力がある",
    watchOut: "技術にこだわりすぎてユーザー視点を見失わないこと",
    growthPrediction: "技術力が深まると同時に、設計思想や判断力がシニアレベルに達する",
    successActions: [
      "「動くコード」の次に「読みやすいコード」を意識する",
      "ユーザーの行動を月1回は直接観察する。コードの先にいる人を忘れない",
      "新技術は「何が解決できるか」から学ぶ。技術のための技術は避ける",
    ],
    failureRisks: [
      "技術的に美しい解を追い求め、ビジネス価値を後回しにする",
      "一人で抱え込み、助けを求めるのが遅れる",
      "レガシーコードを批判するだけで、改善のアクションを取らない",
    ],
    axisWeights: {
      analytical_vs_intuitive: -0.5,
      introvert_vs_extrovert: -0.3,
      individual_vs_social: -0.3,
      change_embrace_vs_resist: 0.3,
      plan_vs_spontaneous: -0.3,
      function_vs_expression: -0.3,
      perfectionist_vs_pragmatic: -0.3,
      emotional_regulation: 0.3,
    },
    cfWeights: {
      decomposition: 0.7,
      abstract_structuring: 0.4,
      decision_tempo: 0.3,
    },
  },
  {
    id: "product_manager",
    name: "プロダクトマネージャー",
    category: "technical",
    description: "ユーザーの課題と技術・ビジネスを繋ぎ、製品の方向性を決める",
    whyGoodFit: "異なる視点を統合し、優先順位をつける判断力がある",
    watchOut: "すべてを自分で決めようとせず、チームの知恵を引き出すこと",
    growthPrediction: "ユーザー理解と事業理解が深まり、より大きなプロダクトを任されるようになる",
    successActions: [
      "「なぜ作るか」を「何を作るか」の10倍考える",
      "データとユーザーインタビューの両方で意思決定する。片方だけでは不十分",
      "NOと言う力を鍛える——全てを入れたプロダクトは誰のためにもならない",
    ],
    failureRisks: [
      "ステークホルダー全員の要望を入れて、焦点のぼやけた製品になる",
      "自分の直感だけで判断し、データを無視する",
      "チームを巻き込まず、仕様を一人で決めてしまう",
    ],
    axisWeights: {
      social_initiative: 0.4,
      analytical_vs_intuitive: 0.2,
      boundary_awareness: 0.5,
      direct_vs_diplomatic: 0.2,
      emotional_regulation: 0.4,
      change_embrace_vs_resist: 0.3,
      introvert_vs_extrovert: 0.3,
      control_tendency: 0.3,
    },
    cfWeights: {
      abstract_structuring: 0.5,
      decomposition: 0.4,
      cognitive_updating: 0.5,
    },
  },
  {
    id: "craftsperson",
    name: "職人・技術者",
    category: "technical",
    description: "専門技術を極め、品質の高い成果物を生み出す",
    whyGoodFit: "一つのことを突き詰める集中力と忍耐力がある",
    watchOut: "技術の深さだけでなく、伝える力も育てるとさらに評価される",
    growthPrediction: "技術が円熟し、後進の育成や技術継承の役割も担えるようになる",
    successActions: [
      "毎日の作業の中に「昨日より0.1%良くする」ポイントを見つける",
      "技術を言語化して伝える練習をする——暗黙知を形式知にする力",
      "異なる分野の職人と交流し、共通する本質的な考え方を学ぶ",
    ],
    failureRisks: [
      "「自分のやり方」に固執し、新しい技術や手法を拒否する",
      "品質基準が自己満足になり、市場のニーズとずれる",
      "後進に教えることを面倒がり、技術が自分で途絶える",
    ],
    axisWeights: {
      introvert_vs_extrovert: -0.4,
      individual_vs_social: -0.4,
      perfectionist_vs_pragmatic: -0.5,
      quality_vs_quantity: -0.4,
      plan_vs_spontaneous: -0.3,
      function_vs_expression: -0.2,
      change_embrace_vs_resist: -0.3,
      emotional_regulation: 0.3,
    },
    cfWeights: {
      exploration_closure: 0.6,
      decomposition: 0.4,
      cognitive_updating: -0.4,
    },
  },

  // ── ケア・教育 ──
  {
    id: "teacher",
    name: "教師・講師",
    category: "care",
    description: "知識や経験を伝え、人の成長を支える",
    whyGoodFit: "相手の理解度に合わせて伝え方を変えられる",
    watchOut: "一人ひとりに深入りしすぎると疲弊する。適切な距離感を",
    growthPrediction: "教え方が洗練され、より多くの人に影響を与えられるようになる",
    successActions: [
      "「教える」より「考えさせる」問いかけを増やす",
      "生徒の小さな変化に気づく観察力を日々磨く",
      "自分自身も学び続ける——教師が学ぶのをやめた時、教育は止まる",
    ],
    failureRisks: [
      "全員を同じ方法で教えようとし、個人差を無視する",
      "生徒の問題を全て自分で解決しようとして燃え尽きる",
      "知識の伝達だけに終始し、考える力を育てない",
    ],
    axisWeights: {
      boundary_awareness: 0.6,
      introvert_vs_extrovert: 0.3,
      social_initiative: 0.3,
      direct_vs_diplomatic: -0.2,
      emotional_regulation: 0.3,
      independence_vs_harmony: 0.3,
      analytical_vs_intuitive: 0.2,
      plan_vs_spontaneous: -0.2,
    },
    cfWeights: {
      social_modeling: 0.5,
      cognitive_updating: 0.4,
      abstract_structuring: 0.3,
    },
  },
  {
    id: "counselor",
    name: "カウンセラー・相談員",
    category: "care",
    description: "人の悩みに寄り添い、自分で答えを見つけられるよう支援する",
    whyGoodFit: "人の話を深く聴き、共感しながらも冷静でいられる",
    watchOut: "他者の感情を抱え込みすぎないセルフケアが不可欠",
    growthPrediction: "傾聴力が磨かれ、より複雑なケースにも対応できるようになる",
    successActions: [
      "相手の話を「解決しよう」とせず、まず「理解しよう」とする",
      "毎日の終わりにセルフケアの時間を確保する。自分が壊れたら誰も救えない",
      "スーパービジョン（専門家からの指導）を定期的に受ける",
    ],
    failureRisks: [
      "クライアントの問題を自分の問題として抱え込む",
      "「私が救わなければ」という救世主コンプレックスに陥る",
      "自分の価値観を押し付け、相手の自己決定を奪う",
    ],
    axisWeights: {
      boundary_awareness: 0.8,
      introvert_vs_extrovert: -0.2,
      emotional_variability: -0.3,
      emotional_regulation: 0.6,
      direct_vs_diplomatic: -0.3,
      social_initiative: 0.2,
      analytical_vs_intuitive: 0.2,
      independence_vs_harmony: 0.3,
    },
    cfWeights: {
      social_modeling: 0.7,
      cognitive_updating: 0.5,
      exploration_closure: -0.4,
    },
  },
  {
    id: "nurse_care",
    name: "看護・介護",
    category: "care",
    description: "人の身体と心のケアを通じて、生活の質を支える",
    whyGoodFit: "他者のニーズに気づき、行動に移せる",
    watchOut: "自分の体調管理を後回しにしがち。休むことも仕事の一部",
    growthPrediction: "経験の蓄積で判断力が上がり、チームリーダーとしても活躍できるようになる",
    successActions: [
      "小さな異変に気づいたら、「気のせいかも」と流さず記録する",
      "チームでの情報共有を徹底する——一人で判断しない仕組みを作る",
      "「休む」ことを能力として認識する。持続可能でないケアは誰も幸せにしない",
    ],
    failureRisks: [
      "感情的に入り込みすぎてプロフェッショナルな判断ができなくなる",
      "自分の限界を超えて働き、バーンアウトする",
      "ルーティン化して、一人ひとりの患者の変化を見逃す",
    ],
    axisWeights: {
      boundary_awareness: 0.7,
      emotional_regulation: 0.6,
      social_initiative: 0.3,
      emotional_variability: -0.3,
      change_embrace_vs_resist: -0.2,
      introvert_vs_extrovert: 0.2,
      independence_vs_harmony: 0.4,
      plan_vs_spontaneous: -0.2,
    },
    cfWeights: {
      social_modeling: 0.5,
      decision_tempo: -0.4,
      cognitive_updating: 0.3,
    },
  },

  // ── 独立・フリーランス ──
  {
    id: "entrepreneur",
    name: "起業家・スタートアップ",
    category: "independent",
    description: "ゼロから事業を立ち上げ、世の中に新しい価値を生み出す",
    whyGoodFit: "不確実な状況でも前に進む推進力がある",
    watchOut: "すべてを自分で抱え込まず、早めに仲間を見つけること",
    growthPrediction: "失敗と成功の経験が積み重なり、事業センスが磨かれる",
    successActions: [
      "アイデアは1週間以内に最小限の形で市場に出す。完璧を待たない",
      "「誰の、どんな痛みを解決するか」を一文で言えるまで磨く",
      "メンターを3人持つ——業界の先輩、異業種の経営者、投資家",
    ],
    failureRisks: [
      "プロダクトに恋をして、市場のフィードバックを無視する",
      "全てを自分でやろうとして、スケールしない",
      "資金が尽きる前に軌道修正する判断が遅れる",
    ],
    axisWeights: {
      cautious_vs_bold: 0.8,
      social_initiative: 0.5,
      emotional_regulation: 0.5,
      introvert_vs_extrovert: 0.5,
      change_embrace_vs_resist: 0.6,
      plan_vs_spontaneous: 0.3,
      emotional_variability: 0.3,
      independence_vs_harmony: -0.4,
    },
    cfWeights: {
      decision_tempo: -0.6,
      cognitive_updating: 0.6,
      exploration_closure: -0.4,
    },
  },
  {
    id: "freelancer",
    name: "フリーランス・個人事業主",
    category: "independent",
    description: "自分の専門スキルで独立し、自由な働き方を実現する",
    whyGoodFit: "自分のペースで働くことで最大のパフォーマンスを発揮できる",
    watchOut: "孤立しがち。意識的にコミュニティとの接点を持つこと",
    growthPrediction: "専門性が高まり、指名で仕事が来るようになる",
    successActions: [
      "「断る力」を持つ——安売りは長期的に自分を壊す",
      "既存クライアントの満足度を最優先にする。紹介が最良の営業",
      "月の20%は自己投資（学習・ネットワーキング）に使う",
    ],
    failureRisks: [
      "忙しさに追われ、スキルアップの時間を確保できなくなる",
      "一社依存で、その取引先を失うと全収入が消える",
      "自由に憧れて独立したのに、自己管理ができず生産性が落ちる",
    ],
    axisWeights: {
      independence_vs_harmony: -0.5,
      cautious_vs_bold: 0.4,
      change_embrace_vs_resist: 0.3,
      emotional_regulation: 0.4,
      individual_vs_social: -0.3,
      introvert_vs_extrovert: -0.1,
      plan_vs_spontaneous: -0.2,
      function_vs_expression: -0.2,
    },
    cfWeights: {
      decision_tempo: -0.4,
      cognitive_updating: 0.5,
      decomposition: 0.4,
    },
  },
  {
    id: "investor",
    name: "投資家・トレーダー",
    category: "independent",
    description: "市場を分析し、資金運用で価値を生み出す",
    whyGoodFit: "冷静な分析力と、リスクを取る胆力の両方がある",
    watchOut: "感情に振り回されない仕組み作りが成功の鍵",
    growthPrediction: "市場理解が深まり、長期的な視点で安定した判断ができるようになる",
    successActions: [
      "投資ルールを事前に決め、感情で変えない。ルール通りに機械的に動く",
      "損切りの基準を明確にしておく。「戻るかも」は最も危険な言葉",
      "勝因だけでなく敗因を徹底分析する。失敗から学べるかが分かれ目",
    ],
    failureRisks: [
      "感情的に判断し、損失を認められずに塩漬けにする",
      "成功体験で過信し、リスク管理を緩める",
      "他人の情報に振り回され、自分の分析を捨てる",
    ],
    axisWeights: {
      analytical_vs_intuitive: -0.4,
      cautious_vs_bold: 0.6,
      emotional_variability: -0.5,
      emotional_regulation: 0.6,
      introvert_vs_extrovert: -0.2,
      plan_vs_spontaneous: -0.3,
      independence_vs_harmony: -0.3,
      function_vs_expression: -0.3,
    },
    cfWeights: {
      cognitive_updating: 0.6,
      decision_tempo: -0.5,
      abstract_structuring: 0.4,
    },
  },

  // ── 専門職・士業 ──
  {
    id: "doctor",
    name: "医師",
    category: "specialist",
    description: "医学的知識で人の健康と命を守る",
    whyGoodFit: "科学的根拠に基づきながら、人間全体を見る視点がある",
    watchOut: "感情的な距離を保ちつつ、冷たくならないバランスが重要",
    growthPrediction: "経験が蓄積し、直感的な診断力と患者との信頼関係が深まる",
    successActions: [
      "最新の医学知見を常にアップデートする学習習慣を維持する",
      "患者の「言葉にならない訴え」に耳を傾ける",
      "チーム医療を意識し、他職種と積極的に連携する",
    ],
    failureRisks: [
      "権威に頼りすぎて、患者の声を聞かなくなる",
      "過労を当然視し、自分の健康を犠牲にする",
      "専門に閉じこもり、全体像を見失う",
    ],
    axisWeights: {
      analytical_vs_intuitive: -0.6,
      emotional_regulation: 0.7,
      boundary_awareness: 0.6,
      cautious_vs_bold: -0.3,
      social_initiative: 0.3,
      plan_vs_spontaneous: -0.3,
      introvert_vs_extrovert: 0.1,
      emotional_variability: -0.3,
    },
    cfWeights: {
      decomposition: 0.5,
      cognitive_updating: 0.6,
      decision_tempo: 0.3,
    },
  },
  {
    id: "lawyer",
    name: "弁護士",
    category: "specialist",
    description: "法律の知識で人や組織の権利を守り、紛争を解決する",
    whyGoodFit: "論理構成力と交渉力の両方を持っている",
    watchOut: "勝ち負けだけでなく、依頼者の本当の利益を考える視点が重要",
    growthPrediction: "専門分野での信頼が積み重なり、難案件を任される存在になる",
    successActions: [
      "法律論だけでなく、依頼者の「本当に望んでいること」を聞き出す",
      "交渉では相手側の立場も理解した上で戦略を立てる",
      "専門分野を持ちつつ、隣接分野も幅広く押さえる",
    ],
    failureRisks: [
      "勝つことに固執し、依頼者の長期的利益を損なう",
      "法律論に閉じて、感情面のケアを怠る",
      "多忙を理由にクライアントとのコミュニケーションが雑になる",
    ],
    axisWeights: {
      analytical_vs_intuitive: -0.6,
      direct_vs_diplomatic: 0.4,
      emotional_regulation: 0.6,
      cautious_vs_bold: 0.3,
      social_initiative: 0.4,
      introvert_vs_extrovert: 0.2,
      plan_vs_spontaneous: -0.3,
      independence_vs_harmony: -0.3,
    },
    cfWeights: {
      abstract_structuring: 0.5,
      decomposition: 0.6,
      decision_tempo: -0.3,
    },
  },
  {
    id: "tax_accountant",
    name: "税理士・公認会計士",
    category: "specialist",
    description: "税務・会計の専門知識で個人や企業の経営を支援する",
    whyGoodFit: "数字に強く、複雑な制度を理解し整理する力がある",
    watchOut: "専門知識だけでなく、経営者の感情にも寄り添えると信頼が深まる",
    growthPrediction: "経営相談まで踏み込める「右腕型」の専門家に成長する",
    successActions: [
      "税制改正は先回りして学び、クライアントに提案する",
      "数字の裏にある経営課題を読み取り、節税だけでなく事業の相談にも乗る",
      "ITツールを積極活用し、単純作業を自動化して付加価値の高い業務に集中する",
    ],
    failureRisks: [
      "申告代行の「作業者」に留まり、経営アドバイザーに成長しない",
      "制度の変化についていけず、古い知識のまま仕事をする",
      "顧問先を増やしすぎて品質が低下する",
    ],
    axisWeights: {
      analytical_vs_intuitive: -0.7,
      perfectionist_vs_pragmatic: -0.5,
      introvert_vs_extrovert: -0.2,
      boundary_awareness: 0.5,
      emotional_regulation: 0.4,
      plan_vs_spontaneous: -0.4,
      function_vs_expression: -0.3,
      change_embrace_vs_resist: -0.3,
    },
    cfWeights: {
      decomposition: 0.6,
      exploration_closure: 0.5,
      abstract_structuring: 0.4,
    },
  },

  // ── デジタル・IT ──
  {
    id: "ux_designer",
    name: "UXデザイナー",
    category: "digital",
    description: "ユーザーの行動と心理を理解し、使いやすい体験を設計する",
    whyGoodFit: "人の行動を観察し、なぜそうするのかを考える好奇心がある",
    watchOut: "データと共感のバランス。どちらかに偏ると本質を見失う",
    growthPrediction: "ビジネスと技術の両方の言語で話せるデザイナーに成長する",
    successActions: [
      "月に2回はユーザーテストを実施する。推測ではなく観察で判断する",
      "プロトタイプのスピードを上げる——素早く作って素早く検証する",
      "エンジニアリングの基礎を学び、実現可能性を含めた提案をする",
    ],
    failureRisks: [
      "自分の好みを「ユーザーのニーズ」と混同する",
      "リサーチに時間をかけすぎて、形にするのが遅い",
      "見た目の美しさに注力し、ユーザビリティを犠牲にする",
    ],
    axisWeights: {
      analytical_vs_intuitive: 0.3,
      boundary_awareness: 0.6,
      introvert_vs_extrovert: 0.2,
      direct_vs_diplomatic: -0.2,
      change_embrace_vs_resist: 0.4,
      function_vs_expression: 0.3,
      social_initiative: 0.3,
      emotional_regulation: 0.3,
    },
    cfWeights: {
      social_modeling: 0.6,
      exploration_closure: -0.5,
      cognitive_updating: 0.4,
    },
  },
  {
    id: "ai_ml_engineer",
    name: "AI・機械学習エンジニア",
    category: "digital",
    description: "データとアルゴリズムを使って知的なシステムを構築する",
    whyGoodFit: "数学的思考力と実装力を兼ね備え、未知の問題に挑める",
    watchOut: "技術の面白さに没頭し、倫理的な影響を見落とさないよう注意",
    growthPrediction: "AI技術の深い理解と社会実装の経験が、希少なキャリア資産になる",
    successActions: [
      "論文を読むだけでなく、実際にコードを書いて動かす",
      "「AIで何ができるか」ではなく「何を解決すべきか」から考える",
      "バイアスや公平性の問題を常に意識し、倫理的な判断を習慣にする",
    ],
    failureRisks: [
      "最新技術を追うだけで、基礎的な数学やCS理論をおろそかにする",
      "AIの限界を伝えず、過大な期待を持たせる",
      "一人で研究的に作り込み、プロダクションに載せる力が育たない",
    ],
    axisWeights: {
      analytical_vs_intuitive: -0.7,
      introvert_vs_extrovert: -0.3,
      change_embrace_vs_resist: 0.5,
      individual_vs_social: -0.3,
      cautious_vs_bold: 0.3,
      plan_vs_spontaneous: -0.3,
      function_vs_expression: -0.4,
      perfectionist_vs_pragmatic: -0.3,
    },
    cfWeights: {
      abstract_structuring: 0.7,
      decomposition: 0.6,
      decision_tempo: 0.4,
    },
  },
  {
    id: "growth_hacker",
    name: "グロースハッカー",
    category: "digital",
    description: "データ分析とクリエイティブな施策で事業の急成長を実現する",
    whyGoodFit: "分析力と大胆な発想の両方で、成長のレバーを見つけられる",
    watchOut: "短期的な数字に引っ張られ、ブランド毀損する施策を打たないこと",
    growthPrediction: "事業全体を見る力が身につき、経営層へのキャリアパスが開ける",
    successActions: [
      "仮説→実験→学習のサイクルを週単位で回す",
      "小さな施策を100個試して、当たった3個をスケールさせる",
      "数字の改善だけでなく、ユーザー体験との両立を常に意識する",
    ],
    failureRisks: [
      "グロースハックが目的化し、スパム的な手法に走る",
      "短期指標ばかり追って、長期的なブランド価値を毀損する",
      "成功体験を過度に一般化し、異なる文脈で同じ手法を繰り返す",
    ],
    axisWeights: {
      analytical_vs_intuitive: -0.3,
      cautious_vs_bold: 0.6,
      change_embrace_vs_resist: 0.7,
      social_initiative: 0.4,
      plan_vs_spontaneous: 0.3,
      introvert_vs_extrovert: 0.3,
      emotional_regulation: 0.4,
      function_vs_expression: -0.2,
    },
    cfWeights: {
      decision_tempo: -0.5,
      cognitive_updating: 0.6,
      exploration_closure: -0.4,
    },
  },
  {
    id: "community_manager",
    name: "コミュニティマネージャー",
    category: "digital",
    description: "オンライン・オフラインのコミュニティを育て、人と人を繋ぐ",
    whyGoodFit: "人の温度感を読みながら、場の空気を作る力がある",
    watchOut: "コミュニティの成長とメンバーの安全のバランスが常に課題",
    growthPrediction: "信頼ある「場づくり」のスキルが、あらゆる組織で求められる",
    successActions: [
      "「管理する」のではなく「場を育てる」マインドセットで臨む",
      "メンバーの小さな貢献を見逃さず、適切に称える",
      "トラブルの兆候を早期にキャッチするアンテナを張る",
    ],
    failureRisks: [
      "人気者のメンバーばかり優遇し、サイレントマジョリティを無視する",
      "荒らしや問題行動に対処せず、コミュニティの安全性が低下する",
      "規模拡大を急ぎすぎて、コミュニティの文化が薄まる",
    ],
    axisWeights: {
      introvert_vs_extrovert: 0.4,
      boundary_awareness: 0.7,
      social_initiative: 0.5,
      emotional_regulation: 0.5,
      direct_vs_diplomatic: -0.3,
      independence_vs_harmony: 0.4,
      change_embrace_vs_resist: 0.3,
      emotional_variability: -0.2,
    },
    cfWeights: {
      social_modeling: 0.6,
      cognitive_updating: 0.4,
      exploration_closure: -0.3,
    },
  },

  // ── 追加：リーダーシップ系 ──
  {
    id: "commander",
    name: "軍事指揮官・統率者",
    category: "leadership",
    description: "厳格な判断と統率力で組織を動かし、困難な状況を打開する",
    whyGoodFit: "冷静な分析と即座の決断力で、チームを確実にゴールに導ける",
    watchOut: "統率が支配にならないよう、メンバーの自律性も尊重すること",
    growthPrediction: "危機対応力が磨かれ、どんな状況でも頼られるリーダーに成長する",
    successActions: [
      "状況把握→判断→指示のサイクルを秒単位で回す訓練をする",
      "平時にこそチームの信頼関係を築く——有事に初めて信頼は試される",
      "自分の判断ミスを正直に振り返り、次の判断精度を上げる",
    ],
    failureRisks: [
      "統率が恐怖政治になり、メンバーが本音を言えなくなる",
      "全てをコントロールしようとして、組織の柔軟性を失う",
      "感情を押し殺しすぎて、共感力を失う",
    ],
    axisWeights: {
      control_tendency: 0.7,
      social_initiative: 0.7,
      analytical_vs_intuitive: -0.5,
      emotional_regulation: 0.7,
      introvert_vs_extrovert: 0.5,
      direct_vs_diplomatic: 0.5,
      cautious_vs_bold: 0.4,
      emotional_variability: -0.4,
    },
    cfWeights: {
      decision_tempo: -0.7,
      decomposition: 0.5,
      exploration_closure: 0.6,
    },
  },
];

// ── マッチング計算 ──

export interface CareerMatch {
  job: JobRole;
  score: number; // 0-100
  /** マッチした主要な理由（軸名ベース） */
  primaryReasons: string[];
  /** 不一致の主な理由（軸名ベース） */
  mismatchReasons: string[];
}

/**
 * 観測軸スコア + 認知適性スコアから全職種のマッチ度を計算
 *
 * スコアリング方式:
 * - 性格軸 (axisWeights) と認知軸 (cfWeights) の両方を統合
 * - 認知軸は性格軸の25%の重みで加算（観測数が少ないため控えめ）
 * - 各軸の適合度を計算（一致 = +, 不一致 = -）
 * - 差が明確に出るよう、不一致にはペナルティを強くかける
 */
export function computeCareerMatches(
  axisScores: Partial<Record<TraitAxisKey, number>>,
  cfScores?: Partial<Record<CognitiveAxisKey, number>> | null,
): CareerMatch[] {
  const scoredKeys = Object.keys(axisScores) as TraitAxisKey[];
  if (scoredKeys.length < 3) return [];

  const CF_BLEND = 0.25; // 認知軸の寄与率（性格軸に対して25%）

  const rawMatches = JOB_ROLES.map((job) => {
    let matchSum = 0;
    let mismatchSum = 0;
    let weightSum = 0;
    const reasons: { axis: string; contribution: number }[] = [];

    // ── 性格軸のスコアリング ──
    for (const [axis, weight] of Object.entries(job.axisWeights) as [TraitAxisKey, number][]) {
      const val = axisScores[axis];
      if (val === undefined) continue;

      const absWeight = Math.abs(weight);
      const alignment = val * weight;

      if (alignment > 0) {
        matchSum += alignment * absWeight;
      } else {
        mismatchSum += Math.abs(alignment) * absWeight * 1.5;
      }

      weightSum += absWeight;
      reasons.push({ axis, contribution: alignment * absWeight });
    }

    // ── 認知適性軸のスコアリング ──
    if (cfScores && job.cfWeights) {
      for (const [axis, weight] of Object.entries(job.cfWeights) as [CognitiveAxisKey, number][]) {
        const val = cfScores[axis];
        if (val === undefined) continue;

        const absWeight = Math.abs(weight) * CF_BLEND;
        const alignment = val * weight;

        if (alignment > 0) {
          matchSum += alignment * absWeight;
        } else {
          mismatchSum += Math.abs(alignment) * absWeight * 1.5;
        }

        weightSum += absWeight;
        reasons.push({ axis: `cf:${axis}`, contribution: alignment * absWeight });
      }
    }

    if (weightSum === 0) {
      return { job, rawScore: 0.5, reasons };
    }

    const netScore = (matchSum - mismatchSum) / weightSum;
    const centered = (netScore + 1) / 2;
    const spread = Math.pow(centered, 1.3);
    const finalScore = Math.round(15 + spread * 80);

    return { job, rawScore: finalScore, reasons };
  });

  return rawMatches
    .map((m) => {
      m.reasons.sort((a, b) => b.contribution - a.contribution);
      return {
        job: m.job,
        score: m.rawScore,
        primaryReasons: m.reasons
          .filter((r) => r.contribution > 0)
          .slice(0, 3)
          .map((r) => r.axis),
        mismatchReasons: m.reasons
          .filter((r) => r.contribution < -0.05)
          .slice(-2)
          .map((r) => r.axis),
      };
    })
    .sort((a, b) => b.score - a.score);
}

// ── 軸ラベル取得（表示用） ──

const AXIS_DISPLAY_LABELS: Partial<Record<TraitAxisKey, string>> = {
  introvert_vs_extrovert: "内向 ⇔ 外向",
  individual_vs_social: "個人 ⇔ 集団",
  analytical_vs_intuitive: "論理 ⇔ 直感",
  cautious_vs_bold: "慎重さ ⇔ 大胆さ",
  change_embrace_vs_resist: "変化への姿勢",
  plan_vs_spontaneous: "計画 ⇔ 即興",
  tradition_vs_novelty: "伝統 ⇔ 新しさ",
  independence_vs_harmony: "自立 ⇔ 協調",
  direct_vs_diplomatic: "直接的 ⇔ 配慮的",
  social_initiative: "社交的な主導力",
  boundary_awareness: "境界の認識力",
  emotional_variability: "感情の振れ幅",
  emotional_regulation: "感情のコントロール力",
  stress_isolation_vs_social: "ストレス対処の方向",
  function_vs_expression: "実用 ⇔ 表現",
  perfectionist_vs_pragmatic: "完璧主義 ⇔ 実用主義",
  quality_vs_quantity: "質 ⇔ 量",
  classic_vs_trendy: "定番派 ⇔ 流行派",
  reassurance_need: "安心を求める力",
  rejection_response_maturity: "断られた時の対応力",
  public_private_gap: "表と裏のギャップ",
};

export function getAxisDisplayLabel(axis: TraitAxisKey): string {
  return AXIS_DISPLAY_LABELS[axis] ?? axis.replace(/_/g, " ");
}

// ═══════════════════════════════════════════════════════════════════
// 仕事適性レイヤー — ユーザーの実職業 × Stargazer 軸スコアの照合
//
// 目的: 断定ではなく「相性を見る」。
// 主役: 役割適性 / 働き方適性 / 環境相性
// 補助: 職業方向群（ランキングではなく方向の示唆）
// ═══════════════════════════════════════════════════════════════════

/** 役割タイプ */
export type WorkRoleType =
  | "front"       // フロント型（対外折衝・プレゼン）
  | "back"        // バック型（分析・基盤構築）
  | "solo"        // 個人完結型
  | "coordinator" // チーム調整型
  | "deep"        // 深掘り専門型
  | "kaizen";     // 改善運用型

/** 働き方スタイル */
export type WorkStyleFit = {
  stabilityPreference: number;  // -1=変化志向, 1=安定志向
  autonomyNeed: number;         // -1=指示適応, 1=高裁量
  evaluationClarity: number;    // -1=曖昧OK, 1=明確な評価軸必要
  interpersonalDensity: number; // -1=低密度, 1=高密度
  creativeFreedom: number;      // -1=ルーチン, 1=創造的自由
};

/** 苦しくなりやすい条件 */
export type StrainCondition = {
  id: string;
  label: string;
  severity: number; // 0-1
};

/** 仕事適性レポート — 主役は役割・働き方・環境。職業群は補助情報 */
export interface CareerFitReport {
  // ═══ 主役: 役割・働き方・環境 ═══
  /** 向いている役割タイプ（上位2つ） */
  fittingRoles: { type: WorkRoleType; label: string; reason: string }[];
  /** 向いている働き方（5軸の連続値） */
  workStyleFit: WorkStyleFit;
  /** 苦しくなりやすい条件（上位4つ） */
  strainConditions: StrainCondition[];

  // ═══ 補助: 職業方向群（ランキングではなく方向の示唆） ═══
  /** 相性の高い方向群（有力候補。順位ではなく「この方向は合いやすい」程度） */
  affinityCluster: CareerMatch[];
  /** 現時点で負荷が高そうな方向群 */
  strainCluster: CareerMatch[];

  // ═══ 現職との差分比較（主軸ではなく参考情報） ═══
  /** ユーザーの現職（A baseline） */
  currentJob: JobRole | null;
  /** 現職との相性スコア (0-100)。差分比較用であり適性判定ではない */
  currentJobFitScore: number | null;
  /** 現職と適性のギャップ分析テキスト */
  gapAnalysis: string | null;
}

const ROLE_LABELS: Record<WorkRoleType, string> = {
  front: "フロント型（対外折衝・プレゼン）",
  back: "バック型（分析・基盤構築）",
  solo: "個人完結型",
  coordinator: "チーム調整型",
  deep: "深掘り専門型",
  kaizen: "改善運用型",
};

/**
 * ユーザーの実職業と Stargazer 軸スコアを照合し、仕事適性レポートを生成。
 *
 * @param occupationId - profiles.occupation（A baseline で収集した job role ID）
 * @param axisScores - Stargazer の性格軸スコア
 * @param cfScores - 認知適性軸スコア（任意）
 */
export function computeCareerFitReport(
  occupationId: string | null,
  axisScores: Partial<Record<TraitAxisKey, number>>,
  cfScores?: Partial<Record<CognitiveAxisKey, number>> | null,
): CareerFitReport {
  const allMatches = computeCareerMatches(axisScores, cfScores);

  // 現職の照合
  const currentJob = occupationId
    ? JOB_ROLES.find(j => j.id === occupationId) ?? null
    : null;
  const currentJobMatch = currentJob
    ? allMatches.find(m => m.job.id === currentJob.id) ?? null
    : null;

  // 役割タイプ推定（軸スコアから）
  const roleScores: { type: WorkRoleType; score: number; reason: string }[] = [
    {
      type: "front",
      score: (axisScores.introvert_vs_extrovert ?? 0) * 0.4
        + (axisScores.social_initiative ?? 0) * 0.4
        + (axisScores.direct_vs_diplomatic ?? 0) * 0.2,
      reason: "対人積極性と外向性が高い",
    },
    {
      type: "back",
      score: -(axisScores.introvert_vs_extrovert ?? 0) * 0.3
        + (axisScores.analytical_vs_intuitive ?? 0) * -0.4
        + (axisScores.perfectionist_vs_pragmatic ?? 0) * -0.3,
      reason: "分析力と正確さへのこだわりが強い",
    },
    {
      type: "solo",
      score: (axisScores.independence_vs_harmony ?? 0) * 0.5
        + -(axisScores.individual_vs_social ?? 0) * 0.3
        + (axisScores.plan_vs_spontaneous ?? 0) * -0.2,
      reason: "自律性が高く、自分のペースで力を発揮する",
    },
    {
      type: "coordinator",
      score: (axisScores.direct_vs_diplomatic ?? 0) * -0.3
        + (axisScores.emotional_regulation ?? 0) * 0.3
        + (axisScores.boundary_awareness ?? 0) * 0.4,
      reason: "調整力と共感のバランスが取れている",
    },
    {
      type: "deep",
      score: (axisScores.quality_vs_quantity ?? 0) * -0.4
        + (axisScores.perfectionist_vs_pragmatic ?? 0) * -0.3
        + -(axisScores.introvert_vs_extrovert ?? 0) * 0.3,
      reason: "一つのことに没頭する集中力がある",
    },
    {
      type: "kaizen",
      score: (axisScores.plan_vs_spontaneous ?? 0) * -0.4
        + (axisScores.change_embrace_vs_resist ?? 0) * -0.3
        + (axisScores.perfectionist_vs_pragmatic ?? 0) * -0.3,
      reason: "安定的に改善を積み重ねる粘り強さがある",
    },
  ];
  roleScores.sort((a, b) => b.score - a.score);

  // 働き方スタイル
  const workStyleFit: WorkStyleFit = {
    stabilityPreference: -(axisScores.change_embrace_vs_resist ?? 0),
    autonomyNeed: (axisScores.independence_vs_harmony ?? 0) * 0.6
      + (axisScores.plan_vs_spontaneous ?? 0) * 0.4,
    evaluationClarity: -(axisScores.cautious_vs_bold ?? 0) * 0.5
      + (axisScores.perfectionist_vs_pragmatic ?? 0) * -0.5,
    interpersonalDensity: (axisScores.introvert_vs_extrovert ?? 0) * 0.6
      + (axisScores.social_initiative ?? 0) * 0.4,
    creativeFreedom: (axisScores.tradition_vs_novelty ?? 0) * 0.5
      + (axisScores.function_vs_expression ?? 0) * 0.5,
  };

  // 苦しくなりやすい条件
  const strainConditions: StrainCondition[] = [];
  const ax = axisScores;

  if ((ax.introvert_vs_extrovert ?? 0) < -0.3) {
    strainConditions.push({
      id: "high_interpersonal",
      label: "人間関係の密度が高すぎる環境",
      severity: Math.abs(ax.introvert_vs_extrovert ?? 0),
    });
  }
  if ((ax.change_embrace_vs_resist ?? 0) < -0.3) {
    strainConditions.push({
      id: "rapid_change",
      label: "変化が激しすぎる環境",
      severity: Math.abs(ax.change_embrace_vs_resist ?? 0),
    });
  }
  if ((ax.change_embrace_vs_resist ?? 0) > 0.4 && (ax.plan_vs_spontaneous ?? 0) > 0.3) {
    strainConditions.push({
      id: "monotony",
      label: "変化がなく単調すぎる環境",
      severity: ((ax.change_embrace_vs_resist ?? 0) + (ax.plan_vs_spontaneous ?? 0)) / 2,
    });
  }
  if ((ax.cautious_vs_bold ?? 0) < -0.3) {
    strainConditions.push({
      id: "snap_decisions",
      label: "即断即決を求められすぎる環境",
      severity: Math.abs(ax.cautious_vs_bold ?? 0),
    });
  }
  if ((ax.emotional_regulation ?? 0) < -0.2 && (ax.reassurance_need ?? 0) > 0.2) {
    strainConditions.push({
      id: "emotional_labor",
      label: "感情労働が重すぎる環境",
      severity: (Math.abs(ax.emotional_regulation ?? 0) + (ax.reassurance_need ?? 0)) / 2,
    });
  }
  if ((ax.independence_vs_harmony ?? 0) > 0.4) {
    strainConditions.push({
      id: "micromanagement",
      label: "裁量が少なく細かく管理される環境",
      severity: ax.independence_vs_harmony ?? 0,
    });
  }

  strainConditions.sort((a, b) => b.severity - a.severity);

  // ギャップ分析
  let gapAnalysis: string | null = null;
  if (currentJob && currentJobMatch) {
    if (currentJobMatch.score < 40) {
      gapAnalysis = `現在の${currentJob.name}は、あなたの特性との相性が控えめです（${currentJobMatch.score}%）。${currentJob.watchOut}に注意しつつ、${roleScores[0].reason}を活かせる役割を探すと楽になるかもしれません。`;
    } else if (currentJobMatch.score >= 70) {
      gapAnalysis = `${currentJob.name}はあなたの特性と高い相性があります（${currentJobMatch.score}%）。${currentJob.whyGoodFit}。さらに伸ばすなら、${currentJob.growthPrediction}。`;
    } else {
      gapAnalysis = `${currentJob.name}との相性は中程度です（${currentJobMatch.score}%）。${roleScores[0].reason}を活かせる場面を増やすと、自然に力を発揮しやすくなります。`;
    }
  }

  return {
    // 主役: 役割・働き方・環境
    fittingRoles: roleScores.slice(0, 2).map(r => ({
      type: r.type,
      label: ROLE_LABELS[r.type],
      reason: r.reason,
    })),
    workStyleFit,
    strainConditions: strainConditions.slice(0, 4),

    // 補助: 職業方向群（ランキングではなく方向の示唆）
    affinityCluster: allMatches.slice(0, 5),
    strainCluster: allMatches.slice(-3).reverse(),

    // 現職との差分比較（参考情報）
    currentJob,
    currentJobFitScore: currentJobMatch?.score ?? null,
    gapAnalysis,
  };
}
