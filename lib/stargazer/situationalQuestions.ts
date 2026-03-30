// lib/stargazer/situationalQuestions.ts
// 状況ベースの質問エンジン — 抽象的な自己申告ではなく具体的な場面での反応を観測
// 日常会話のように自然に深掘りしていく構造

import type { TraitAxisKey } from "./traitAxes";

// ── 質問テーマ ──
export type ScenarioTheme =
  | "decision_making"      // 決め方
  | "social_dynamics"      // 社交場面
  | "conflict_response"    // 対立・摩擦
  | "intimacy_pattern"     // 距離感
  | "stress_recovery"      // ストレス対処
  | "self_expression"      // 自己表現
  | "change_adaptation"    // 変化への対応
  | "trust_building"       // 信頼の構築
  | "boundary_navigation"  // 境界線の扱い
  | "emotional_processing" // 感情処理

// 文脈（裏側で自動判定）
export type ScenarioContext = "friends" | "romance" | "work" | "family" | "general";

export interface ScenarioOption {
  id: string;
  text: string;
  axisMappings: { key: TraitAxisKey; weight: number }[];
  /** 選択時に深掘り質問が出るか */
  followUpId?: string;
  /** 裏側で検知するコンテキスト文脈 */
  impliedContext?: ScenarioContext;
}

export interface ScenarioQuestion {
  id: string;
  theme: ScenarioTheme;
  /** 状況の設定文（短い物語のような導入） */
  scenario: string;
  /** 問いかけ */
  prompt: string;
  options: ScenarioOption[];
  /** 深掘り質問（前の回答に基づいて表示） */
  followUps?: FollowUpQuestion[];
  /** 観測対象のコンテキスト（裏側で処理。ユーザーには見せない） */
  detectedContexts?: ScenarioContext[];
}

export interface FollowUpQuestion {
  id: string;
  /** どのオプションの後に出すか */
  triggeredBy: string;
  prompt: string;
  options: ScenarioOption[];
}

// ── 質問定義 ──

export const SCENARIO_QUESTIONS: ScenarioQuestion[] = [
  // ═══════════════════════════════════════════
  // 1. 決め方の場面
  // ═══════════════════════════════════════════
  {
    id: "sc_01",
    theme: "decision_making",
    scenario: "友達4人で週末の予定を決めようとしている。全員バラバラな意見を出している。",
    prompt: "あなたはどう動きますか？",
    detectedContexts: ["friends"],
    options: [
      {
        id: "sc_01_a",
        text: "全員の意見を聞いて、折衷案を出す",
        axisMappings: [
          { key: "independence_vs_harmony", weight: 0.5 },
          { key: "social_initiative", weight: 0.3 },
          { key: "analytical_vs_intuitive", weight: -0.2 },
        ],
        followUpId: "sc_01_fu1",
      },
      {
        id: "sc_01_b",
        text: "自分の意見はあるけど、流れに任せる",
        axisMappings: [
          { key: "independence_vs_harmony", weight: 0.3 },
          { key: "social_initiative", weight: -0.3 },
          { key: "direct_vs_diplomatic", weight: 0.3 },
        ],
        followUpId: "sc_01_fu2",
      },
      {
        id: "sc_01_c",
        text: "「これがいい」と強く推す",
        axisMappings: [
          { key: "independence_vs_harmony", weight: -0.4 },
          { key: "direct_vs_diplomatic", weight: -0.5 },
          { key: "cautious_vs_bold", weight: 0.4 },
          { key: "social_initiative", weight: 0.4 },
        ],
      },
      {
        id: "sc_01_d",
        text: "正直、何でもいい。みんなが楽しければ",
        axisMappings: [
          { key: "independence_vs_harmony", weight: 0.6 },
          { key: "individual_vs_social", weight: 0.3 },
          { key: "control_tendency", weight: -0.3 },
        ],
      },
    ],
    followUps: [
      {
        id: "sc_01_fu1",
        triggeredBy: "sc_01_a",
        prompt: "折衷案を出したのに、誰かが「それは嫌」と言ったら？",
        options: [
          {
            id: "sc_01_fu1_a",
            text: "もう一回調整する。粘り強くまとめたい",
            axisMappings: [
              { key: "perfectionist_vs_pragmatic", weight: -0.3 },
              { key: "emotional_regulation", weight: 0.3 },
              { key: "pressure_risk", weight: 0.1 },
            ],
          },
          {
            id: "sc_01_fu1_b",
            text: "少し疲れるけど、別の案を考える",
            axisMappings: [
              { key: "emotional_variability", weight: 0.2 },
              { key: "reassurance_need", weight: 0.2 },
            ],
          },
          {
            id: "sc_01_fu1_c",
            text: "「じゃあ他に案ある？」と相手に返す",
            axisMappings: [
              { key: "direct_vs_diplomatic", weight: -0.3 },
              { key: "boundary_awareness", weight: 0.3 },
            ],
          },
        ],
      },
      {
        id: "sc_01_fu2",
        triggeredBy: "sc_01_b",
        prompt: "でも結果的に、自分があまり行きたくない場所に決まりそう。どうする？",
        options: [
          {
            id: "sc_01_fu2_a",
            text: "我慢して合わせる。楽しめるところを見つける",
            axisMappings: [
              { key: "independence_vs_harmony", weight: 0.5 },
              { key: "public_private_gap", weight: 0.3 },
            ],
          },
          {
            id: "sc_01_fu2_b",
            text: "やっぱり正直に言う",
            axisMappings: [
              { key: "direct_vs_diplomatic", weight: -0.4 },
              { key: "boundary_awareness", weight: 0.3 },
            ],
          },
          {
            id: "sc_01_fu2_c",
            text: "黙って参加しないかも",
            axisMappings: [
              { key: "stress_isolation_vs_social", weight: -0.4 },
              { key: "social_initiative", weight: -0.3 },
            ],
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 2. 新しい出会いの場面
  // ═══════════════════════════════════════════
  {
    id: "sc_02",
    theme: "social_dynamics",
    scenario: "知り合いの紹介で、初めて会う人と2人でカフェにいる。相手は感じが良さそうだけど、まだよく分からない。",
    prompt: "最初の30分、あなたはどんな感じになりますか？",
    detectedContexts: ["general"],
    options: [
      {
        id: "sc_02_a",
        text: "こちらから色々質問して、相手を知りたい",
        axisMappings: [
          { key: "social_initiative", weight: 0.5 },
          { key: "introvert_vs_extrovert", weight: 0.3 },
          { key: "analytical_vs_intuitive", weight: -0.2 },
        ],
        followUpId: "sc_02_fu1",
      },
      {
        id: "sc_02_b",
        text: "相手の話を聞いて、リアクションを返す感じ",
        axisMappings: [
          { key: "introvert_vs_extrovert", weight: -0.2 },
          { key: "independence_vs_harmony", weight: 0.3 },
          { key: "direct_vs_diplomatic", weight: 0.2 },
        ],
      },
      {
        id: "sc_02_c",
        text: "沈黙になったら少し焦る。何か話さないと、と思う",
        axisMappings: [
          { key: "reassurance_need", weight: 0.4 },
          { key: "social_initiative", weight: 0.2 },
          { key: "emotional_variability", weight: 0.2 },
        ],
        followUpId: "sc_02_fu2",
      },
      {
        id: "sc_02_d",
        text: "自然体でいる。沈黙も気にならない",
        axisMappings: [
          { key: "emotional_regulation", weight: 0.4 },
          { key: "introvert_vs_extrovert", weight: -0.2 },
          { key: "reassurance_need", weight: -0.4 },
        ],
      },
    ],
    followUps: [
      {
        id: "sc_02_fu1",
        triggeredBy: "sc_02_a",
        prompt: "相手がかなり内向的で、あまり話を広げてくれない。どうなる？",
        options: [
          {
            id: "sc_02_fu1_a",
            text: "もっと違う角度から聞いてみる",
            axisMappings: [
              { key: "social_initiative", weight: 0.4 },
              { key: "pressure_risk", weight: 0.2 },
            ],
          },
          {
            id: "sc_02_fu1_b",
            text: "「この人とは合わないのかな」と思い始める",
            axisMappings: [
              { key: "analytical_vs_intuitive", weight: 0.3 },
              { key: "intimacy_pace", weight: -0.2 },
            ],
          },
          {
            id: "sc_02_fu1_c",
            text: "ペースを落として、ゆっくり話す",
            axisMappings: [
              { key: "boundary_awareness", weight: 0.4 },
              { key: "consent_maturity", weight: 0.3 },
            ],
          },
        ],
      },
      {
        id: "sc_02_fu2",
        triggeredBy: "sc_02_c",
        prompt: "焦って出した話題が微妙にスベった。あなたの心の中は？",
        options: [
          {
            id: "sc_02_fu2_a",
            text: "しばらく引きずる。帰ってからも思い出す",
            axisMappings: [
              { key: "emotional_regulation", weight: -0.4 },
              { key: "reassurance_need", weight: 0.4 },
            ],
          },
          {
            id: "sc_02_fu2_b",
            text: "その場では気にするけど、すぐ忘れる",
            axisMappings: [
              { key: "emotional_regulation", weight: 0.3 },
              { key: "emotional_variability", weight: 0.2 },
            ],
          },
          {
            id: "sc_02_fu2_c",
            text: "笑いに変えて乗り切る",
            axisMappings: [
              { key: "cautious_vs_bold", weight: 0.3 },
              { key: "introvert_vs_extrovert", weight: 0.3 },
            ],
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 3. メッセージのやりとり
  // ═══════════════════════════════════════════
  {
    id: "sc_03",
    theme: "intimacy_pattern",
    scenario: "気になっている人にメッセージを送った。既読になったのに、3時間返信がない。",
    prompt: "あなたの頭の中では何が起きてる？",
    detectedContexts: ["romance"],
    options: [
      {
        id: "sc_03_a",
        text: "忙しいんだろうな、と思ってそのまま",
        axisMappings: [
          { key: "reassurance_need", weight: -0.5 },
          { key: "emotional_regulation", weight: 0.4 },
          { key: "control_tendency", weight: -0.2 },
        ],
      },
      {
        id: "sc_03_b",
        text: "「何か変なこと言ったかな」と少し気になる",
        axisMappings: [
          { key: "reassurance_need", weight: 0.4 },
          { key: "emotional_variability", weight: 0.3 },
          { key: "public_private_gap", weight: 0.2 },
        ],
        followUpId: "sc_03_fu1",
      },
      {
        id: "sc_03_c",
        text: "気にはなるけど、追いLINEは絶対しない",
        axisMappings: [
          { key: "boundary_awareness", weight: 0.4 },
          { key: "reassurance_need", weight: 0.2 },
          { key: "pressure_risk", weight: -0.3 },
        ],
      },
      {
        id: "sc_03_d",
        text: "別の話題でもう一通送ってみるかも",
        axisMappings: [
          { key: "social_initiative", weight: 0.4 },
          { key: "pressure_risk", weight: 0.2 },
          { key: "cautious_vs_bold", weight: 0.3 },
        ],
        followUpId: "sc_03_fu2",
      },
    ],
    followUps: [
      {
        id: "sc_03_fu1",
        triggeredBy: "sc_03_b",
        prompt: "同じ相手が、友達だったらどう？同じくらい気になる？",
        options: [
          {
            id: "sc_03_fu1_a",
            text: "友達なら全然気にならない",
            axisMappings: [
              { key: "relationship_mode_split", weight: 0.5 },
              { key: "emotional_variability", weight: 0.3 },
            ],
            impliedContext: "friends",
          },
          {
            id: "sc_03_fu1_b",
            text: "友達でも少しは気になるかも",
            axisMappings: [
              { key: "reassurance_need", weight: 0.3 },
              { key: "relationship_mode_split", weight: -0.2 },
            ],
          },
          {
            id: "sc_03_fu1_c",
            text: "相手によるかな",
            axisMappings: [
              { key: "relationship_mode_split", weight: 0.3 },
              { key: "quality_vs_quantity", weight: -0.2 },
            ],
          },
        ],
      },
      {
        id: "sc_03_fu2",
        triggeredBy: "sc_03_d",
        prompt: "送った後、相手がさらに既読スルーだった。次はどうする？",
        options: [
          {
            id: "sc_03_fu2_a",
            text: "もう待つ。自分からは送らない",
            axisMappings: [
              { key: "rejection_response_maturity", weight: 0.4 },
              { key: "boundary_awareness", weight: 0.3 },
            ],
          },
          {
            id: "sc_03_fu2_b",
            text: "「嫌われたかな」と落ち込む",
            axisMappings: [
              { key: "emotional_regulation", weight: -0.3 },
              { key: "reassurance_need", weight: 0.5 },
            ],
          },
          {
            id: "sc_03_fu2_c",
            text: "「まあいいか」と切り替える",
            axisMappings: [
              { key: "emotional_regulation", weight: 0.4 },
              { key: "rejection_response_maturity", weight: 0.4 },
            ],
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 4. 仕事での摩擦
  // ═══════════════════════════════════════════
  {
    id: "sc_04",
    theme: "conflict_response",
    scenario: "チームプロジェクトで、あなたの提案が却下された。代わりに採用されたのは、あなたより経験の浅い人の案。",
    prompt: "正直、どう感じる？",
    detectedContexts: ["work"],
    options: [
      {
        id: "sc_04_a",
        text: "悔しいけど、良い案なら受け入れる",
        axisMappings: [
          { key: "emotional_regulation", weight: 0.4 },
          { key: "independence_vs_harmony", weight: 0.3 },
          { key: "rejection_response_maturity", weight: 0.4 },
        ],
      },
      {
        id: "sc_04_b",
        text: "理由を聞きたい。納得できれば大丈夫",
        axisMappings: [
          { key: "analytical_vs_intuitive", weight: -0.4 },
          { key: "direct_vs_diplomatic", weight: -0.3 },
          { key: "rejection_response_maturity", weight: 0.2 },
        ],
        followUpId: "sc_04_fu1",
      },
      {
        id: "sc_04_c",
        text: "モチベーションが一時的に下がる",
        axisMappings: [
          { key: "emotional_variability", weight: 0.4 },
          { key: "reassurance_need", weight: 0.3 },
          { key: "emotional_regulation", weight: -0.2 },
        ],
      },
      {
        id: "sc_04_d",
        text: "次はもっと良い提案をしようと燃える",
        axisMappings: [
          { key: "change_embrace_vs_resist", weight: -0.3 },
          { key: "cautious_vs_bold", weight: 0.3 },
          { key: "perfectionist_vs_pragmatic", weight: -0.3 },
        ],
      },
    ],
    followUps: [
      {
        id: "sc_04_fu1",
        triggeredBy: "sc_04_b",
        prompt: "理由を聞いたら「直感で選んだ」と言われた。どうなる？",
        options: [
          {
            id: "sc_04_fu1_a",
            text: "「それは理由じゃない」と内心思う",
            axisMappings: [
              { key: "analytical_vs_intuitive", weight: -0.5 },
              { key: "public_private_gap", weight: 0.3 },
            ],
          },
          {
            id: "sc_04_fu1_b",
            text: "まあ仕方ない、と流す",
            axisMappings: [
              { key: "independence_vs_harmony", weight: 0.3 },
              { key: "emotional_regulation", weight: 0.3 },
            ],
          },
          {
            id: "sc_04_fu1_c",
            text: "食い下がって議論したい",
            axisMappings: [
              { key: "direct_vs_diplomatic", weight: -0.5 },
              { key: "control_tendency", weight: 0.3 },
              { key: "pressure_risk", weight: 0.2 },
            ],
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 5. ストレス回復の場面
  // ═══════════════════════════════════════════
  {
    id: "sc_05",
    theme: "stress_recovery",
    scenario: "仕事と人間関係の両方でストレスが溜まって、限界に近い金曜日の夜。",
    prompt: "あなたは何をする？",
    detectedContexts: ["general"],
    options: [
      {
        id: "sc_05_a",
        text: "一人で何もしない。静かに充電する",
        axisMappings: [
          { key: "stress_isolation_vs_social", weight: -0.6 },
          { key: "introvert_vs_extrovert", weight: -0.4 },
        ],
        followUpId: "sc_05_fu1",
      },
      {
        id: "sc_05_b",
        text: "信頼できる人に電話して話を聞いてもらう",
        axisMappings: [
          { key: "stress_isolation_vs_social", weight: 0.5 },
          { key: "individual_vs_social", weight: 0.3 },
          { key: "quality_vs_quantity", weight: -0.2 },
        ],
      },
      {
        id: "sc_05_c",
        text: "とりあえず外に出る。人がいる場所で気を紛らわす",
        axisMappings: [
          { key: "stress_isolation_vs_social", weight: 0.4 },
          { key: "introvert_vs_extrovert", weight: 0.4 },
          { key: "plan_vs_spontaneous", weight: 0.3 },
        ],
      },
      {
        id: "sc_05_d",
        text: "趣味や好きなことに没頭する",
        axisMappings: [
          { key: "stress_isolation_vs_social", weight: -0.2 },
          { key: "function_vs_expression", weight: 0.3 },
          { key: "emotional_regulation", weight: 0.3 },
        ],
      },
    ],
    followUps: [
      {
        id: "sc_05_fu1",
        triggeredBy: "sc_05_a",
        prompt: "一人の時間で回復するまでに、どれくらいかかる？",
        options: [
          {
            id: "sc_05_fu1_a",
            text: "一晩寝れば大丈夫",
            axisMappings: [
              { key: "emotional_regulation", weight: 0.5 },
              { key: "emotional_variability", weight: -0.3 },
            ],
          },
          {
            id: "sc_05_fu1_b",
            text: "週末まるごと必要",
            axisMappings: [
              { key: "emotional_variability", weight: 0.2 },
              { key: "introvert_vs_extrovert", weight: -0.3 },
            ],
          },
          {
            id: "sc_05_fu1_c",
            text: "正直、なかなか回復しない時もある",
            axisMappings: [
              { key: "emotional_regulation", weight: -0.4 },
              { key: "emotional_variability", weight: 0.4 },
            ],
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 6. 信頼構築の場面
  // ═══════════════════════════════════════════
  {
    id: "sc_06",
    theme: "trust_building",
    scenario: "最近よく話す人がいる。まだ知り合って2ヶ月くらい。その人が突然、かなり深い悩みを打ち明けてきた。",
    prompt: "あなたはどう感じる？",
    detectedContexts: ["friends", "romance"],
    options: [
      {
        id: "sc_06_a",
        text: "嬉しい。信頼されている証拠だと思う",
        axisMappings: [
          { key: "intimacy_pace", weight: 0.3 },
          { key: "individual_vs_social", weight: 0.3 },
          { key: "reassurance_need", weight: 0.1 },
        ],
      },
      {
        id: "sc_06_b",
        text: "少し驚く。まだそこまでの関係じゃないと思ってた",
        axisMappings: [
          { key: "intimacy_pace", weight: -0.4 },
          { key: "boundary_awareness", weight: 0.4 },
          { key: "cautious_vs_bold", weight: -0.3 },
        ],
        followUpId: "sc_06_fu1",
      },
      {
        id: "sc_06_c",
        text: "真剣に聞いて、できることがあればしたい",
        axisMappings: [
          { key: "individual_vs_social", weight: 0.3 },
          { key: "independence_vs_harmony", weight: 0.3 },
          { key: "boundary_awareness", weight: 0.1 },
        ],
      },
      {
        id: "sc_06_d",
        text: "少し重く感じるかもしれない",
        axisMappings: [
          { key: "emotional_regulation", weight: -0.1 },
          { key: "boundary_awareness", weight: 0.3 },
          { key: "stress_isolation_vs_social", weight: -0.2 },
        ],
      },
    ],
    followUps: [
      {
        id: "sc_06_fu1",
        triggeredBy: "sc_06_b",
        prompt: "でもその人は、あなたにだけ話してくれたみたい。気持ちは変わる？",
        options: [
          {
            id: "sc_06_fu1_a",
            text: "それなら、ちゃんと受け止めたい",
            axisMappings: [
              { key: "consent_maturity", weight: 0.3 },
              { key: "boundary_awareness", weight: 0.2 },
            ],
          },
          {
            id: "sc_06_fu1_b",
            text: "余計にプレッシャーを感じる",
            axisMappings: [
              { key: "reassurance_need", weight: 0.3 },
              { key: "emotional_variability", weight: 0.2 },
              { key: "boundary_awareness", weight: 0.3 },
            ],
          },
          {
            id: "sc_06_fu1_c",
            text: "嬉しいけど、距離感は保ちたい",
            axisMappings: [
              { key: "boundary_awareness", weight: 0.5 },
              { key: "intimacy_pace", weight: -0.3 },
            ],
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 7. 変化への対応
  // ═══════════════════════════════════════════
  {
    id: "sc_07",
    theme: "change_adaptation",
    scenario: "長く通っていたお気に入りの場所（カフェ、ジム、美容院など）が閉店することになった。",
    prompt: "最初に浮かぶ気持ちは？",
    detectedContexts: ["general"],
    options: [
      {
        id: "sc_07_a",
        text: "残念だけど、新しい場所を探す楽しみもある",
        axisMappings: [
          { key: "change_embrace_vs_resist", weight: -0.5 },
          { key: "tradition_vs_novelty", weight: 0.3 },
        ],
      },
      {
        id: "sc_07_b",
        text: "けっこうショック。居心地よかったから",
        axisMappings: [
          { key: "change_embrace_vs_resist", weight: 0.4 },
          { key: "emotional_variability", weight: 0.2 },
        ],
      },
      {
        id: "sc_07_c",
        text: "仕方ない。すぐ次を探す",
        axisMappings: [
          { key: "plan_vs_spontaneous", weight: -0.2 },
          { key: "emotional_regulation", weight: 0.4 },
          { key: "perfectionist_vs_pragmatic", weight: 0.3 },
        ],
      },
      {
        id: "sc_07_d",
        text: "しばらく代わりが見つからなくて困る",
        axisMappings: [
          { key: "change_embrace_vs_resist", weight: 0.5 },
          { key: "quality_vs_quantity", weight: -0.3 },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 8. 恋愛×友情の境界
  // ═══════════════════════════════════════════
  {
    id: "sc_08",
    theme: "boundary_navigation",
    scenario: "仲の良い異性の友達がいる。最近、周りから「あの二人、付き合ってるの？」と聞かれるようになった。",
    prompt: "あなたの本音は？",
    detectedContexts: ["friends", "romance"],
    options: [
      {
        id: "sc_08_a",
        text: "友達は友達。そういう目で見たことない",
        axisMappings: [
          { key: "friend_mode_fit", weight: 0.5 },
          { key: "boundary_awareness", weight: 0.4 },
          { key: "relationship_mode_split", weight: -0.2 },
        ],
      },
      {
        id: "sc_08_b",
        text: "正直、少し意識し始めてるかも",
        axisMappings: [
          { key: "friend_mode_fit", weight: -0.2 },
          { key: "escalation_risk", weight: 0.2 },
          { key: "emotional_variability", weight: 0.3 },
        ],
        followUpId: "sc_08_fu1",
      },
      {
        id: "sc_08_c",
        text: "周りに言われると少し気まずい",
        axisMappings: [
          { key: "public_private_gap", weight: 0.3 },
          { key: "reassurance_need", weight: 0.2 },
          { key: "boundary_awareness", weight: 0.2 },
        ],
      },
      {
        id: "sc_08_d",
        text: "気にしない。放っておけばいい",
        axisMappings: [
          { key: "independence_vs_harmony", weight: -0.4 },
          { key: "emotional_regulation", weight: 0.3 },
          { key: "friend_mode_fit", weight: 0.3 },
        ],
      },
    ],
    followUps: [
      {
        id: "sc_08_fu1",
        triggeredBy: "sc_08_b",
        prompt: "もしその人が「付き合いたい」と言ってきたら？",
        options: [
          {
            id: "sc_08_fu1_a",
            text: "嬉しいけど、友達関係を壊すのが怖い",
            axisMappings: [
              { key: "cautious_vs_bold", weight: -0.4 },
              { key: "change_embrace_vs_resist", weight: 0.3 },
              { key: "long_term_shift_risk", weight: 0.2 },
            ],
          },
          {
            id: "sc_08_fu1_b",
            text: "迷わず受ける",
            axisMappings: [
              { key: "cautious_vs_bold", weight: 0.5 },
              { key: "plan_vs_spontaneous", weight: 0.3 },
            ],
          },
          {
            id: "sc_08_fu1_c",
            text: "少し時間がほしい。考えたい",
            axisMappings: [
              { key: "analytical_vs_intuitive", weight: -0.3 },
              { key: "cautious_vs_bold", weight: -0.3 },
              { key: "consent_maturity", weight: 0.3 },
            ],
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 9. 自己表現の場面
  // ═══════════════════════════════════════════
  {
    id: "sc_09",
    theme: "self_expression",
    scenario: "SNSで、自分がすごく共感する投稿を見つけた。でもちょっと賛否両論になりそうな内容。",
    prompt: "あなたはどうする？",
    detectedContexts: ["general"],
    options: [
      {
        id: "sc_09_a",
        text: "迷わずリポストする。自分の意見は隠さない",
        axisMappings: [
          { key: "direct_vs_diplomatic", weight: -0.5 },
          { key: "function_vs_expression", weight: 0.4 },
          { key: "cautious_vs_bold", weight: 0.4 },
        ],
      },
      {
        id: "sc_09_b",
        text: "共感はするけど、人目が気になってシェアしない",
        axisMappings: [
          { key: "public_private_gap", weight: 0.4 },
          { key: "direct_vs_diplomatic", weight: 0.3 },
          { key: "cautious_vs_bold", weight: -0.3 },
        ],
      },
      {
        id: "sc_09_c",
        text: "自分なりの言葉を添えてシェアする",
        axisMappings: [
          { key: "function_vs_expression", weight: 0.4 },
          { key: "analytical_vs_intuitive", weight: -0.2 },
          { key: "independence_vs_harmony", weight: -0.2 },
        ],
      },
      {
        id: "sc_09_d",
        text: "いいねだけして、静かに共感",
        axisMappings: [
          { key: "introvert_vs_extrovert", weight: -0.3 },
          { key: "minimal_vs_maximal", weight: -0.3 },
          { key: "public_private_gap", weight: 0.2 },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 10. 長期関係の変化
  // ═══════════════════════════════════════════
  {
    id: "sc_10",
    theme: "intimacy_pattern",
    scenario: "付き合って1年の恋人（または親友）がいる。最近、前ほど頻繁にメッセージが来なくなった。",
    prompt: "あなたはまず何を思う？",
    detectedContexts: ["romance", "friends"],
    options: [
      {
        id: "sc_10_a",
        text: "関係が安定した証拠だと思う",
        axisMappings: [
          { key: "reassurance_need", weight: -0.4 },
          { key: "emotional_regulation", weight: 0.4 },
          { key: "long_term_shift_risk", weight: -0.3 },
        ],
      },
      {
        id: "sc_10_b",
        text: "気持ちが冷めてきてるのかな、と不安になる",
        axisMappings: [
          { key: "reassurance_need", weight: 0.5 },
          { key: "emotional_variability", weight: 0.3 },
          { key: "exclusivity_pressure", weight: 0.2 },
        ],
        followUpId: "sc_10_fu1",
      },
      {
        id: "sc_10_c",
        text: "自分もそうかも。お互い変わったんだと思う",
        axisMappings: [
          { key: "long_term_shift_risk", weight: 0.2 },
          { key: "change_embrace_vs_resist", weight: -0.2 },
          { key: "analytical_vs_intuitive", weight: -0.2 },
        ],
      },
      {
        id: "sc_10_d",
        text: "率直に聞いてみる。「最近どう？」って",
        axisMappings: [
          { key: "direct_vs_diplomatic", weight: -0.3 },
          { key: "social_initiative", weight: 0.3 },
          { key: "consent_maturity", weight: 0.3 },
        ],
      },
    ],
    followUps: [
      {
        id: "sc_10_fu1",
        triggeredBy: "sc_10_b",
        prompt: "不安になったとき、その気持ちを相手に伝える？",
        options: [
          {
            id: "sc_10_fu1_a",
            text: "伝えたいけど、重いと思われそうで言えない",
            axisMappings: [
              { key: "public_private_gap", weight: 0.4 },
              { key: "direct_vs_diplomatic", weight: 0.3 },
              { key: "reassurance_need", weight: 0.3 },
            ],
          },
          {
            id: "sc_10_fu1_b",
            text: "素直に「寂しい」と言える",
            axisMappings: [
              { key: "direct_vs_diplomatic", weight: -0.4 },
              { key: "public_private_gap", weight: -0.3 },
              { key: "emotional_regulation", weight: 0.2 },
            ],
          },
          {
            id: "sc_10_fu1_c",
            text: "言わないけど、態度に出てしまうかも",
            axisMappings: [
              { key: "public_private_gap", weight: 0.3 },
              { key: "emotional_regulation", weight: -0.3 },
              { key: "pressure_risk", weight: 0.2 },
            ],
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 11. 感情の処理 — 感情をどう扱うか
  // ═══════════════════════════════════════════
  {
    id: "sc_11",
    theme: "emotional_processing",
    scenario: "大切な人と言い合いになった。相手は怒って部屋を出て行った。一人になった直後。",
    prompt: "あなたの心の中で最初に起きることは？",
    detectedContexts: ["romance", "family"],
    options: [
      {
        id: "sc_11_a",
        text: "冷静に何が問題だったか考え始める",
        axisMappings: [
          { key: "analytical_vs_intuitive", weight: -0.4 },
          { key: "emotional_regulation", weight: 0.4 },
          { key: "stress_isolation_vs_social", weight: -0.2 },
        ],
        followUpId: "sc_11_fu1",
      },
      {
        id: "sc_11_b",
        text: "後悔の波が押し寄せる。「あんなこと言わなければ」",
        axisMappings: [
          { key: "emotional_variability", weight: 0.4 },
          { key: "reassurance_need", weight: 0.3 },
          { key: "emotional_regulation", weight: -0.3 },
        ],
      },
      {
        id: "sc_11_c",
        text: "怒りが残ってる。自分は間違ってないと思う",
        axisMappings: [
          { key: "independence_vs_harmony", weight: -0.4 },
          { key: "direct_vs_diplomatic", weight: -0.3 },
          { key: "escalation_risk", weight: 0.2 },
        ],
      },
      {
        id: "sc_11_d",
        text: "涙が出てくる。感情が溢れてどうしようもない",
        axisMappings: [
          { key: "emotional_variability", weight: 0.5 },
          { key: "emotional_regulation", weight: -0.4 },
          { key: "reassurance_need", weight: 0.3 },
        ],
        followUpId: "sc_11_fu2",
      },
    ],
    followUps: [
      {
        id: "sc_11_fu1",
        triggeredBy: "sc_11_a",
        prompt: "分析して「自分が悪かった」と思った。それを相手にどう伝える？",
        options: [
          {
            id: "sc_11_fu1_a",
            text: "すぐにLINEで謝る",
            axisMappings: [
              { key: "social_initiative", weight: 0.4 },
              { key: "direct_vs_diplomatic", weight: -0.2 },
            ],
          },
          {
            id: "sc_11_fu1_b",
            text: "少し時間を置いてから、対面で伝える",
            axisMappings: [
              { key: "cautious_vs_bold", weight: -0.3 },
              { key: "quality_vs_quantity", weight: -0.2 },
            ],
          },
          {
            id: "sc_11_fu1_c",
            text: "言葉にするのが苦手。態度で示そうとする",
            axisMappings: [
              { key: "public_private_gap", weight: 0.3 },
              { key: "function_vs_expression", weight: -0.2 },
            ],
          },
        ],
      },
      {
        id: "sc_11_fu2",
        triggeredBy: "sc_11_d",
        prompt: "泣いた後、どうやって立ち直る？",
        options: [
          {
            id: "sc_11_fu2_a",
            text: "泣くだけ泣いたら、意外とスッキリする",
            axisMappings: [
              { key: "emotional_regulation", weight: 0.2 },
              { key: "emotional_variability", weight: 0.3 },
            ],
          },
          {
            id: "sc_11_fu2_b",
            text: "誰かに電話して話を聞いてもらう",
            axisMappings: [
              { key: "stress_isolation_vs_social", weight: 0.4 },
              { key: "individual_vs_social", weight: 0.3 },
            ],
          },
          {
            id: "sc_11_fu2_c",
            text: "なかなか回復しない。数日引きずる",
            axisMappings: [
              { key: "emotional_regulation", weight: -0.4 },
              { key: "long_term_shift_risk", weight: 0.2 },
            ],
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 12. 人を助ける場面 — 共感と境界
  // ═══════════════════════════════════════════
  {
    id: "sc_12",
    theme: "boundary_navigation",
    scenario: "友達が精神的に辛い状態で、毎日のようにあなたに相談してくる。もう2週間続いている。",
    prompt: "正直、今どう感じてる？",
    detectedContexts: ["friends"],
    options: [
      {
        id: "sc_12_a",
        text: "力になりたい。自分ができる限り支えたい",
        axisMappings: [
          { key: "independence_vs_harmony", weight: 0.4 },
          { key: "individual_vs_social", weight: 0.3 },
          { key: "boundary_awareness", weight: -0.2 },
        ],
      },
      {
        id: "sc_12_b",
        text: "心配だけど、正直自分もしんどくなってきた",
        axisMappings: [
          { key: "emotional_variability", weight: 0.3 },
          { key: "boundary_awareness", weight: 0.2 },
          { key: "stress_isolation_vs_social", weight: -0.2 },
        ],
        followUpId: "sc_12_fu1",
      },
      {
        id: "sc_12_c",
        text: "専門家に相談することを勧めたい",
        axisMappings: [
          { key: "analytical_vs_intuitive", weight: -0.3 },
          { key: "boundary_awareness", weight: 0.4 },
          { key: "consent_maturity", weight: 0.3 },
        ],
      },
      {
        id: "sc_12_d",
        text: "少し距離を置きたいけど、それを言うのが怖い",
        axisMappings: [
          { key: "public_private_gap", weight: 0.3 },
          { key: "direct_vs_diplomatic", weight: 0.3 },
          { key: "reassurance_need", weight: 0.2 },
        ],
      },
    ],
    followUps: [
      {
        id: "sc_12_fu1",
        triggeredBy: "sc_12_b",
        prompt: "しんどいことを相手に伝える？",
        options: [
          {
            id: "sc_12_fu1_a",
            text: "素直に「自分も限界」と言える",
            axisMappings: [
              { key: "direct_vs_diplomatic", weight: -0.4 },
              { key: "boundary_awareness", weight: 0.4 },
            ],
          },
          {
            id: "sc_12_fu1_b",
            text: "言えない。相手を傷つけそうで",
            axisMappings: [
              { key: "public_private_gap", weight: 0.4 },
              { key: "independence_vs_harmony", weight: 0.3 },
            ],
          },
          {
            id: "sc_12_fu1_c",
            text: "返信の頻度をそっと減らす",
            axisMappings: [
              { key: "direct_vs_diplomatic", weight: 0.3 },
              { key: "boundary_awareness", weight: 0.2 },
              { key: "pressure_risk", weight: -0.2 },
            ],
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 13. 自分の秘密を共有する場面
  // ═══════════════════════════════════════════
  {
    id: "sc_13",
    theme: "trust_building",
    scenario: "心を許せる人が一人いる。その人に、今まで誰にも話したことがない本音を打ち明けようか迷っている。",
    prompt: "あなたはどうする？",
    detectedContexts: ["friends", "romance"],
    options: [
      {
        id: "sc_13_a",
        text: "話す。この人になら大丈夫だと思える",
        axisMappings: [
          { key: "intimacy_pace", weight: 0.4 },
          { key: "consent_maturity", weight: 0.3 },
          { key: "public_private_gap", weight: -0.3 },
        ],
      },
      {
        id: "sc_13_b",
        text: "話したい気持ちはあるけど、タイミングを待つ",
        axisMappings: [
          { key: "cautious_vs_bold", weight: -0.3 },
          { key: "analytical_vs_intuitive", weight: -0.2 },
          { key: "plan_vs_spontaneous", weight: -0.2 },
        ],
      },
      {
        id: "sc_13_c",
        text: "やめておく。知られたくないことは墓場まで",
        axisMappings: [
          { key: "public_private_gap", weight: 0.5 },
          { key: "boundary_awareness", weight: 0.3 },
          { key: "intimacy_pace", weight: -0.3 },
        ],
      },
      {
        id: "sc_13_d",
        text: "少しだけ話す。全部は言わない",
        axisMappings: [
          { key: "boundary_awareness", weight: 0.3 },
          { key: "relationship_mode_split", weight: 0.2 },
          { key: "direct_vs_diplomatic", weight: 0.2 },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 14. グループ内での自分の立ち位置
  // ═══════════════════════════════════════════
  {
    id: "sc_14",
    theme: "social_dynamics",
    scenario: "5人のグループで遊びに行った。帰り道、2人ずつのペアに分かれて歩いている。あなたは一人余った。",
    prompt: "その瞬間、あなたはどう感じる？",
    detectedContexts: ["friends"],
    options: [
      {
        id: "sc_14_a",
        text: "別に気にしない。一人で歩くのも好き",
        axisMappings: [
          { key: "introvert_vs_extrovert", weight: -0.3 },
          { key: "independence_vs_harmony", weight: -0.3 },
          { key: "reassurance_need", weight: -0.4 },
        ],
      },
      {
        id: "sc_14_b",
        text: "少し寂しい。でも表には出さない",
        axisMappings: [
          { key: "public_private_gap", weight: 0.4 },
          { key: "reassurance_need", weight: 0.3 },
          { key: "emotional_regulation", weight: 0.2 },
        ],
      },
      {
        id: "sc_14_c",
        text: "自分からどちらかのペアに入る",
        axisMappings: [
          { key: "social_initiative", weight: 0.5 },
          { key: "introvert_vs_extrovert", weight: 0.3 },
          { key: "cautious_vs_bold", weight: 0.2 },
        ],
      },
      {
        id: "sc_14_d",
        text: "地味にショック。「自分って端っこなのかな」と思う",
        axisMappings: [
          { key: "reassurance_need", weight: 0.5 },
          { key: "emotional_variability", weight: 0.3 },
          { key: "individual_vs_social", weight: 0.2 },
        ],
        followUpId: "sc_14_fu1",
      },
    ],
    followUps: [
      {
        id: "sc_14_fu1",
        triggeredBy: "sc_14_d",
        prompt: "帰宅後、そのことをまだ考えてる？",
        options: [
          {
            id: "sc_14_fu1_a",
            text: "考えてる。自分の立ち位置を再確認したくなる",
            axisMappings: [
              { key: "emotional_regulation", weight: -0.3 },
              { key: "reassurance_need", weight: 0.4 },
            ],
          },
          {
            id: "sc_14_fu1_b",
            text: "忘れた。大したことじゃなかった",
            axisMappings: [
              { key: "emotional_regulation", weight: 0.3 },
              { key: "emotional_variability", weight: -0.2 },
            ],
          },
          {
            id: "sc_14_fu1_c",
            text: "少し距離を置こうかなと思い始める",
            axisMappings: [
              { key: "stress_isolation_vs_social", weight: -0.3 },
              { key: "boundary_awareness", weight: 0.2 },
            ],
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 15. 嫉妬・比較の場面
  // ═══════════════════════════════════════════
  {
    id: "sc_15",
    theme: "emotional_processing",
    scenario: "SNSで友達が大きな成功（昇進、結婚、旅行など）を報告している。あなたは最近うまくいっていない。",
    prompt: "画面を見ている時、胸の中にあるのは？",
    detectedContexts: ["general"],
    options: [
      {
        id: "sc_15_a",
        text: "素直にすごいなと思う。おめでとうと伝えたい",
        axisMappings: [
          { key: "emotional_regulation", weight: 0.4 },
          { key: "independence_vs_harmony", weight: 0.2 },
          { key: "control_tendency", weight: -0.2 },
        ],
      },
      {
        id: "sc_15_b",
        text: "おめでとうと思いつつ、比較して少し落ち込む",
        axisMappings: [
          { key: "emotional_variability", weight: 0.3 },
          { key: "reassurance_need", weight: 0.3 },
          { key: "public_private_gap", weight: 0.2 },
        ],
        followUpId: "sc_15_fu1",
      },
      {
        id: "sc_15_c",
        text: "見なかったことにする。SNSを閉じる",
        axisMappings: [
          { key: "stress_isolation_vs_social", weight: -0.3 },
          { key: "boundary_awareness", weight: 0.3 },
          { key: "emotional_regulation", weight: 0.1 },
        ],
      },
      {
        id: "sc_15_d",
        text: "自分もがんばろうと奮起する",
        axisMappings: [
          { key: "cautious_vs_bold", weight: 0.3 },
          { key: "change_embrace_vs_resist", weight: -0.2 },
          { key: "independence_vs_harmony", weight: -0.2 },
        ],
      },
    ],
    followUps: [
      {
        id: "sc_15_fu1",
        triggeredBy: "sc_15_b",
        prompt: "その落ち込みを誰かに話す？",
        options: [
          {
            id: "sc_15_fu1_a",
            text: "恥ずかしくて言えない。嫉妬してるみたいで",
            axisMappings: [
              { key: "public_private_gap", weight: 0.4 },
              { key: "emotional_regulation", weight: -0.2 },
            ],
          },
          {
            id: "sc_15_fu1_b",
            text: "親しい人には「ちょっと凹んだ」と言える",
            axisMappings: [
              { key: "direct_vs_diplomatic", weight: -0.2 },
              { key: "public_private_gap", weight: -0.3 },
            ],
          },
          {
            id: "sc_15_fu1_c",
            text: "日記やメモに書いて整理する",
            axisMappings: [
              { key: "stress_isolation_vs_social", weight: -0.3 },
              { key: "analytical_vs_intuitive", weight: -0.2 },
            ],
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 16-20. 関係性シナリオ（日次観測に混入 → cross-reference用）
  // ═══════════════════════════════════════════
  {
    id: "sc_16",
    theme: "intimacy_pattern",
    scenario: "友人が約束をすっぽかした。連絡もなく1時間待った。",
    prompt: "あなたはまず何を感じる？",
    detectedContexts: ["friends"],
    options: [
      {
        id: "sc_16_a",
        text: "心配。何かあったのかもと思う",
        axisMappings: [
          { key: "analytical_vs_intuitive", weight: 0.2 },
          { key: "reassurance_need", weight: 0.2 },
          { key: "independence_vs_harmony", weight: 0.3 },
        ],
      },
      {
        id: "sc_16_b",
        text: "イラっとする。時間を無駄にされたと感じる",
        axisMappings: [
          { key: "boundary_awareness", weight: 0.3 },
          { key: "direct_vs_diplomatic", weight: -0.3 },
          { key: "emotional_regulation", weight: -0.2 },
        ],
      },
      {
        id: "sc_16_c",
        text: "仕方ないかなと受け流す。怒ってもしょうがない",
        axisMappings: [
          { key: "emotional_regulation", weight: 0.4 },
          { key: "independence_vs_harmony", weight: 0.2 },
          { key: "rejection_response_maturity", weight: 0.3 },
        ],
      },
      {
        id: "sc_16_d",
        text: "次から誘わなくなるかも。静かに距離を置く",
        axisMappings: [
          { key: "stress_isolation_vs_social", weight: -0.3 },
          { key: "boundary_awareness", weight: 0.3 },
          { key: "long_term_shift_risk", weight: 0.2 },
        ],
      },
    ],
    followUps: [
      {
        id: "sc_16_fu1",
        triggeredBy: "sc_16_b",
        prompt: "その怒り、相手に伝える？",
        options: [
          {
            id: "sc_16_fu1_a",
            text: "冷静に伝える。「次は連絡ほしい」と",
            axisMappings: [
              { key: "direct_vs_diplomatic", weight: -0.3 },
              { key: "consent_maturity", weight: 0.3 },
            ],
          },
          {
            id: "sc_16_fu1_b",
            text: "言わないけど態度に出てしまう",
            axisMappings: [
              { key: "public_private_gap", weight: 0.3 },
              { key: "emotional_regulation", weight: -0.2 },
            ],
          },
          {
            id: "sc_16_fu1_c",
            text: "別の友達に愚痴る",
            axisMappings: [
              { key: "stress_isolation_vs_social", weight: 0.3 },
              { key: "individual_vs_social", weight: 0.2 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "sc_17",
    theme: "intimacy_pattern",
    scenario: "パートナーや親しい人が落ち込んでいる。原因は聞いていない。",
    prompt: "あなたはどう接する？",
    detectedContexts: ["romance", "family"],
    options: [
      {
        id: "sc_17_a",
        text: "「どうしたの？」とすぐ聞く",
        axisMappings: [
          { key: "social_initiative", weight: 0.3 },
          { key: "direct_vs_diplomatic", weight: -0.2 },
          { key: "intimacy_pace", weight: 0.2 },
        ],
      },
      {
        id: "sc_17_b",
        text: "そっとそばにいる。聞かれるまで待つ",
        axisMappings: [
          { key: "boundary_awareness", weight: 0.3 },
          { key: "emotional_regulation", weight: 0.3 },
          { key: "analytical_vs_intuitive", weight: 0.2 },
        ],
      },
      {
        id: "sc_17_c",
        text: "何か食べ物とか飲み物を持っていく。行動で示す",
        axisMappings: [
          { key: "analytical_vs_intuitive", weight: -0.2 },
          { key: "social_initiative", weight: 0.2 },
          { key: "consent_maturity", weight: 0.2 },
        ],
      },
      {
        id: "sc_17_d",
        text: "自分もなんとなく気分が沈む。引きずられやすい",
        axisMappings: [
          { key: "emotional_variability", weight: 0.4 },
          { key: "independence_vs_harmony", weight: 0.3 },
          { key: "boundary_awareness", weight: -0.2 },
        ],
      },
    ],
  },
  {
    id: "sc_18",
    theme: "conflict_response",
    scenario: "仲の良い友人グループで、二人の仲が険悪になり始めた。",
    prompt: "あなたはどうする？",
    detectedContexts: ["friends"],
    options: [
      {
        id: "sc_18_a",
        text: "間に入って仲裁する。放っておけない",
        axisMappings: [
          { key: "social_initiative", weight: 0.4 },
          { key: "independence_vs_harmony", weight: 0.4 },
          { key: "consent_maturity", weight: 0.2 },
        ],
      },
      {
        id: "sc_18_b",
        text: "両方の話を個別に聞く。でも裁かない",
        axisMappings: [
          { key: "boundary_awareness", weight: 0.3 },
          { key: "analytical_vs_intuitive", weight: 0.2 },
          { key: "direct_vs_diplomatic", weight: 0.2 },
        ],
      },
      {
        id: "sc_18_c",
        text: "触れない。当事者同士の問題だと思う",
        axisMappings: [
          { key: "boundary_awareness", weight: 0.4 },
          { key: "independence_vs_harmony", weight: -0.3 },
          { key: "stress_isolation_vs_social", weight: -0.2 },
        ],
      },
      {
        id: "sc_18_d",
        text: "居心地が悪い。自分もグループから離れたくなる",
        axisMappings: [
          { key: "emotional_variability", weight: 0.3 },
          { key: "stress_isolation_vs_social", weight: -0.3 },
          { key: "escalation_risk", weight: -0.1 },
        ],
      },
    ],
  },
  {
    id: "sc_19",
    theme: "trust_building",
    scenario: "職場で信頼していた同僚が、あなたの意見を会議で否定した。",
    prompt: "会議の後、あなたはどうする？",
    detectedContexts: ["work"],
    options: [
      {
        id: "sc_19_a",
        text: "直接聞きに行く。「さっきのどういう意味？」と",
        axisMappings: [
          { key: "direct_vs_diplomatic", weight: -0.4 },
          { key: "social_initiative", weight: 0.3 },
          { key: "rejection_response_maturity", weight: 0.3 },
        ],
      },
      {
        id: "sc_19_b",
        text: "仕事上の意見の違いだと割り切る",
        axisMappings: [
          { key: "emotional_regulation", weight: 0.4 },
          { key: "relationship_mode_split", weight: 0.3 },
          { key: "consent_maturity", weight: 0.2 },
        ],
      },
      {
        id: "sc_19_c",
        text: "ショックを受ける。信頼が揺らぐ",
        axisMappings: [
          { key: "reassurance_need", weight: 0.3 },
          { key: "emotional_variability", weight: 0.3 },
          { key: "long_term_shift_risk", weight: 0.2 },
        ],
      },
      {
        id: "sc_19_d",
        text: "次の会議で自分の意見をもっと強く出そうと思う",
        axisMappings: [
          { key: "cautious_vs_bold", weight: 0.3 },
          { key: "social_initiative", weight: 0.3 },
          { key: "independence_vs_harmony", weight: -0.2 },
        ],
      },
    ],
  },
  {
    id: "sc_20",
    theme: "boundary_navigation",
    scenario: "久しぶりに会った知人が、突然深い悩みを打ち明けてきた。",
    prompt: "あなたはどう感じる？",
    detectedContexts: ["general"],
    options: [
      {
        id: "sc_20_a",
        text: "嬉しい。頼ってもらえたと感じる",
        axisMappings: [
          { key: "intimacy_pace", weight: 0.3 },
          { key: "social_initiative", weight: 0.2 },
          { key: "consent_maturity", weight: 0.2 },
        ],
      },
      {
        id: "sc_20_b",
        text: "ちゃんと聞くけど、なぜ自分に？と少し不思議",
        axisMappings: [
          { key: "boundary_awareness", weight: 0.3 },
          { key: "analytical_vs_intuitive", weight: -0.2 },
        ],
      },
      {
        id: "sc_20_c",
        text: "戸惑う。久しぶりなのに重い話で困る",
        axisMappings: [
          { key: "boundary_awareness", weight: 0.4 },
          { key: "intimacy_pace", weight: -0.3 },
          { key: "emotional_regulation", weight: -0.1 },
        ],
      },
      {
        id: "sc_20_d",
        text: "自分も何か返したくなる。お互いの距離が縮まる感じがする",
        axisMappings: [
          { key: "intimacy_pace", weight: 0.4 },
          { key: "independence_vs_harmony", weight: 0.2 },
          { key: "friend_mode_fit", weight: 0.2 },
        ],
      },
    ],
  },
];

// ── ユーティリティ ──

/** 日付ベースのシードで今日の質問セットを選択（3問 + followUp最大3問） */
export function getDailyScenarios(
  dateStr: string,
  answeredIds: string[] = [],
  count = 3
): ScenarioQuestion[] {
  // 未回答の質問をフィルタ
  const unanswered = SCENARIO_QUESTIONS.filter(
    (q) => !answeredIds.includes(q.id)
  );

  if (unanswered.length === 0) {
    // 全部回答済みなら全体から選ぶ（2周目）
    return selectByDateSeed(SCENARIO_QUESTIONS, dateStr, count);
  }

  return selectByDateSeed(unanswered, dateStr, count);
}

function selectByDateSeed(
  questions: ScenarioQuestion[],
  dateStr: string,
  count: number
): ScenarioQuestion[] {
  const seed = hashString(dateStr);
  const shuffled = [...questions].sort((a, b) => {
    const ha = hashString(a.id + dateStr) % 10000;
    const hb = hashString(b.id + dateStr) % 10000;
    return ha - hb;
  });
  return shuffled.slice(0, count);
}

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    hash = (hash << 5) - hash + c;
    hash |= 0;
  }
  return Math.abs(hash);
}

/** テーマの日本語ラベル */
export const THEME_LABELS: Record<ScenarioTheme, string> = {
  decision_making: "決断のしかた",
  social_dynamics: "人との距離",
  conflict_response: "摩擦への反応",
  intimacy_pattern: "親密さのパターン",
  stress_recovery: "ストレスの扱い方",
  self_expression: "自己表現",
  change_adaptation: "変化への対応",
  trust_building: "信頼の築き方",
  boundary_navigation: "境界線の感覚",
  emotional_processing: "感情の処理",
};
