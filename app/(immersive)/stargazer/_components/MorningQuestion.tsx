// app/stargazer/_components/MorningQuestion.tsx
// 朝の一問 — Wordle式の1日1問・深層心理質問
"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { safeSetItem } from "@/lib/stargazer/localStorageHelper";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface MorningQuestionOption {
  label: string;
  value: string;
  insight: string;
}

interface MorningQuestionDef {
  id: string;
  day: number;
  prompt: string;
  category: string;
  options: MorningQuestionOption[];
}

interface MorningQuestionProps {
  onAnswer?: (questionId: string, answer: string, responseTimeMs: number) => void;
  totalObservations?: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 31 Morning Questions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MORNING_QUESTIONS: MorningQuestionDef[] = [
  // Days 1-5: Self-awareness
  {
    id: "mq_1", day: 1, prompt: "今日、最も避けたいことは何？", category: "avoidance",
    options: [
      { label: "人に会うこと", value: "social_avoidance", insight: "今日のあなたは内側に向かっている" },
      { label: "決断すること", value: "decision_avoidance", insight: "判断のエネルギーが低い日" },
      { label: "自分と向き合うこと", value: "self_avoidance", insight: "何かを見ないようにしている" },
      { label: "特にない", value: "none", insight: "今日は比較的安定している——本当に？" },
    ],
  },
  {
    id: "mq_2", day: 2, prompt: "今の気持ちを色で表すと？", category: "emotion",
    options: [
      { label: "青——静かで透明", value: "blue", insight: "内省モードに入っている。深い思考が可能な日" },
      { label: "赤——熱くて激しい", value: "red", insight: "感情のエネルギーが高い。衝動に注意" },
      { label: "灰——曇ってぼんやり", value: "gray", insight: "感情が鈍麻している。何かを遮断しているかもしれない" },
      { label: "金——穏やかで満ちている", value: "gold", insight: "充足感がある。この状態の原因を観察する価値がある" },
    ],
  },
  {
    id: "mq_3", day: 3, prompt: "昨日の自分に一言だけ伝えるとしたら？", category: "reflection",
    options: [
      { label: "よくやった", value: "praise", insight: "自分を認める余裕がある" },
      { label: "もっとできたはず", value: "regret", insight: "高い基準を自分に課している" },
      { label: "何も言わない", value: "silence", insight: "昨日をまだ消化しきれていない" },
      { label: "大丈夫だよ", value: "comfort", insight: "昨日の自分を労わりたい気持ち" },
    ],
  },
  {
    id: "mq_4", day: 4, prompt: "今、一番欲しいものは何？", category: "desire",
    options: [
      { label: "時間", value: "time", insight: "追われている感覚がある。自由への渇望" },
      { label: "承認", value: "approval", insight: "誰かに認めてほしい——その「誰か」が重要" },
      { label: "静けさ", value: "silence", insight: "外部の刺激を遮断したい。過負荷のサイン" },
      { label: "刺激", value: "stimulation", insight: "退屈が敵になっている。変化を求めている" },
    ],
  },
  {
    id: "mq_5", day: 5, prompt: "今朝、最初に感じた感情は？", category: "fear",
    options: [
      { label: "不安", value: "anxiety", insight: "まだ起きていないことを先取りしている" },
      { label: "期待", value: "anticipation", insight: "何かに向かうエネルギーがある" },
      { label: "無感覚", value: "numbness", insight: "感情のスイッチがまだ入っていない——それ自体がデータ" },
      { label: "安堵", value: "relief", insight: "昨日何かから解放された。その「何か」を探る価値がある" },
    ],
  },
  // Days 6-10: Relationship patterns
  {
    id: "mq_6", day: 6, prompt: "今、真っ先に顔が浮かぶ人は？", category: "relationship",
    options: [
      { label: "家族", value: "family", insight: "安全基地への意識が強い日" },
      { label: "友人", value: "friend", insight: "対等な繋がりを求めている" },
      { label: "気になる人", value: "crush", insight: "誰かへの意識が心の容量を占めている" },
      { label: "誰も浮かばない", value: "no_one", insight: "今は自分自身との関係が優先されている" },
    ],
  },
  {
    id: "mq_7", day: 7, prompt: "人との距離、今日はどうしたい？", category: "relationship",
    options: [
      { label: "もっと近づきたい", value: "closer", insight: "孤独感がある。繋がりへの欲求" },
      { label: "少し離れたい", value: "distance", insight: "境界線を引きたい。自己保護モード" },
      { label: "今のままでいい", value: "maintain", insight: "関係性のバランスが取れている" },
      { label: "わからない", value: "unsure", insight: "人との距離感に迷いがある。揺れている" },
    ],
  },
  {
    id: "mq_8", day: 8, prompt: "最近、誰かに頼りすぎていると感じる？", category: "relationship",
    options: [
      { label: "はい、自覚がある", value: "aware_dependent", insight: "依存を認識できる強さがある" },
      { label: "逆に、頼られすぎている", value: "depended_on", insight: "与える側に固定されている可能性" },
      { label: "いいえ、自立している", value: "independent", insight: "本当に？孤立と自立は紙一重" },
      { label: "考えたことがない", value: "unaware", insight: "無意識の依存パターンが隠れている可能性" },
    ],
  },
  {
    id: "mq_9", day: 9, prompt: "「これ以上は踏み込まないで」と思う瞬間、最近あった？", category: "relationship",
    options: [
      { label: "ある。頻繁に", value: "frequent", insight: "境界線が頻繁に脅かされている。防衛が過剰かも" },
      { label: "一度だけ", value: "once", insight: "特定の出来事が引っかかっている" },
      { label: "ない", value: "none", insight: "安全な環境にいるか、鈍感になっているか" },
      { label: "自分が踏み込みすぎた", value: "self_violation", insight: "他者の境界を越えた自覚がある。それは成長の種" },
    ],
  },
  {
    id: "mq_10", day: 10, prompt: "今、最も信頼している人に秘密にしていることはある？", category: "relationship",
    options: [
      { label: "ある", value: "has_secret", insight: "信頼の中にも守りたい領域がある。それは健全な距離" },
      { label: "ないと思う", value: "no_secret", insight: "完全な開示は本当に可能か。見落としがあるかも" },
      { label: "秘密というより、言えないこと", value: "unspeakable", insight: "言語化できない感情が溜まっている" },
      { label: "信頼している人がいない", value: "no_trust", insight: "孤独の深層。信頼の土台を再構築する時期かもしれない" },
    ],
  },
  // Days 11-15: Decision & identity
  {
    id: "mq_11", day: 11, prompt: "最近、一番迷った選択は何だった？", category: "decision",
    options: [
      { label: "人間関係に関すること", value: "relational", insight: "対人関係の判断基準が揺れている" },
      { label: "仕事・キャリアのこと", value: "career", insight: "将来の方向性に不確実性を感じている" },
      { label: "些細な日常のこと", value: "trivial", insight: "小さな迷いに大きな内的葛藤が圧縮されている" },
      { label: "迷ったことがない", value: "no_hesitation", insight: "判断力が高いか、考えることを避けているか" },
    ],
  },
  {
    id: "mq_12", day: 12, prompt: "「自分らしい」と感じるのはどんな時？", category: "identity",
    options: [
      { label: "一人でいる時", value: "alone", insight: "社会的仮面を外した時の自分が本体" },
      { label: "誰かと話している時", value: "social", insight: "対話の中で自分を確認するタイプ" },
      { label: "何かに没頭している時", value: "flow", insight: "行為の中にアイデンティティがある" },
      { label: "わからない", value: "unknown", insight: "自分らしさの定義が揺れている——それは変化の前兆" },
    ],
  },
  {
    id: "mq_13", day: 13, prompt: "最近の自分、変わったと思う？", category: "identity",
    options: [
      { label: "良い方向に変わった", value: "positive_change", insight: "成長を実感している。何がきっかけだったか覚えておく価値がある" },
      { label: "悪い方向に変わった", value: "negative_change", insight: "後退感がある。でもそれは本当に後退か？" },
      { label: "変わっていない", value: "no_change", insight: "停滞か安定か。自分ではどちらだと感じる？" },
      { label: "変わったけど、良いか悪いか分からない", value: "ambiguous", insight: "変化の意味はまだ確定していない。それが正直な認識" },
    ],
  },
  {
    id: "mq_14", day: 14, prompt: "自分の中の矛盾、一つ挙げるなら？", category: "identity",
    options: [
      { label: "自由が欲しいのに安定も手放せない", value: "freedom_stability", insight: "この矛盾は人間の根本的な二重性。あなたの中でどちらが勝つ傾向？" },
      { label: "他人を気にしないと言いつつ気にする", value: "approval_independence", insight: "社会的動物としての本能。完全な独立は幻想かもしれない" },
      { label: "変わりたいのに変わる行動を取らない", value: "change_inertia", insight: "変化への恐怖は現状維持より強い。その恐怖の正体は？" },
      { label: "矛盾なんてない", value: "no_contradiction", insight: "本当に？矛盾が見えないなら、まだ自分を深く見ていないかもしれない" },
    ],
  },
  {
    id: "mq_15", day: 15, prompt: "他人から見た自分と、本当の自分、どのくらい違う？", category: "identity",
    options: [
      { label: "かなり違う", value: "very_different", insight: "社会的ペルソナが強い。演じ続ける疲労が蓄積していないか" },
      { label: "少し違う", value: "slightly_different", insight: "適度な使い分けができている。境界線の管理は健全" },
      { label: "ほぼ同じ", value: "same", insight: "透明性が高いか、自分の内面を見落としているか" },
      { label: "わからない", value: "unknown", insight: "他者の目に映る自分を認識していない。鏡が必要" },
    ],
  },
  // Days 16-20: Depth probes
  {
    id: "mq_16", day: 16, prompt: "最近ついた嘘で、一番小さいものは？", category: "depth",
    options: [
      { label: "「大丈夫」と言った", value: "im_fine", insight: "最も普遍的な嘘。この「大丈夫」の裏に何がある？" },
      { label: "「忙しい」と断った", value: "busy_excuse", insight: "本当の理由を隠す盾として「忙しさ」を使う" },
      { label: "「気にしてない」と言った", value: "dont_care", insight: "気にしていることを認めるのが怖い" },
      { label: "嘘はついていない", value: "no_lie", insight: "本当に？無意識の嘘は嘘と認識されない" },
    ],
  },
  {
    id: "mq_17", day: 17, prompt: "今、無意識にやっていた癖は？", category: "depth",
    options: [
      { label: "体のどこかを触っていた", value: "self_touch", insight: "自己安撫行動。微細なストレスのサイン" },
      { label: "何かを繰り返し確認していた", value: "checking", insight: "不確実性への対処パターン" },
      { label: "ぼーっとしていた", value: "zoning_out", insight: "意識が現在から離脱していた。何から逃げている？" },
      { label: "特に気づかない", value: "unaware", insight: "無意識の行動を意識できていない。観察力を上げる余地がある" },
    ],
  },
  {
    id: "mq_18", day: 18, prompt: "繰り返してしまうパターン、何？", category: "depth",
    options: [
      { label: "先延ばし", value: "procrastination", insight: "完璧主義か恐怖か。先延ばしの裏にある感情を掘る" },
      { label: "他人に合わせすぎる", value: "people_pleasing", insight: "自分の欲求を後回しにする癖。起源はいつ？" },
      { label: "衝動的な行動", value: "impulsive", insight: "理性のブレーキが外れる条件がある。そのトリガーは？" },
      { label: "自分を責める", value: "self_blame", insight: "内なる批判者が強い。その声は誰に似ている？" },
    ],
  },
  {
    id: "mq_19", day: 19, prompt: "自分の「盲点」だと思うことは？", category: "depth",
    options: [
      { label: "他人の感情に鈍感", value: "emotionally_blind", insight: "共感の回路が特定の場面で閉じる" },
      { label: "自分を過大評価している", value: "overestimate", insight: "自己認識と現実のギャップ。謙虚さの欠如か自信か" },
      { label: "自分を過小評価している", value: "underestimate", insight: "実力以下の自己評価。その原因は何だろう" },
      { label: "盲点がわからない", value: "meta_blind", insight: "盲点の盲点——最も正直な答えかもしれない" },
    ],
  },
  {
    id: "mq_20", day: 20, prompt: "誰にも言っていない本音、一つだけ言えるとしたら？", category: "depth",
    options: [
      { label: "本当は疲れている", value: "exhausted", insight: "持続不可能なペースで走っている自覚" },
      { label: "本当は不安でいっぱい", value: "anxious", insight: "表面的な平静の下に渦がある" },
      { label: "本当はもっと評価されたい", value: "want_recognition", insight: "承認欲求を隠している。それは恥ではない" },
      { label: "言えない", value: "cant_say", insight: "この場でさえ言えない本音がある。それが最も深い層" },
    ],
  },
  // Days 21-25: Desire & fear
  {
    id: "mq_21", day: 21, prompt: "今、一番手に入れたいものは？", category: "desire",
    options: [
      { label: "心の平穏", value: "peace", insight: "今の内面は波立っている。何が波を立てている？" },
      { label: "新しい経験", value: "novelty", insight: "現状に物足りなさを感じている。成長への渇望" },
      { label: "大切な人との時間", value: "connection", insight: "孤独感の裏にある接続欲求" },
      { label: "お金・物質的なもの", value: "material", insight: "物質的欲求の裏には安全欲求がある。何に対する安全か" },
    ],
  },
  {
    id: "mq_22", day: 22, prompt: "手放せないけど手放すべきもの、何？", category: "desire",
    options: [
      { label: "過去の出来事への執着", value: "past", insight: "過去が現在を侵食している。手放す＝忘れるではない" },
      { label: "他人からの評価への依存", value: "others_opinion", insight: "自己評価が他者に委ねられている" },
      { label: "完璧でありたい欲求", value: "perfectionism", insight: "完璧主義は保護服。脱ぐのが怖い理由は？" },
      { label: "何もない", value: "nothing", insight: "本当に何もないなら、相当自由。でも本当か" },
    ],
  },
  {
    id: "mq_23", day: 23, prompt: "自分のどこを変えたい？", category: "desire",
    options: [
      { label: "優柔不断なところ", value: "indecisive", insight: "多角的に考えられる長所の裏面。バランスの問題" },
      { label: "感情を出せないところ", value: "emotionally_closed", insight: "感情の抑圧は安全戦略だった。今も必要？" },
      { label: "行動力のなさ", value: "inaction", insight: "行動しない理由の方が重要。恐怖か、方向性か" },
      { label: "変えたくない", value: "no_change", insight: "自己受容か、変化への恐怖か。どちらだろう" },
    ],
  },
  {
    id: "mq_24", day: 24, prompt: "最も恐れていることは何？", category: "fear",
    options: [
      { label: "孤独になること", value: "loneliness", insight: "繋がりへの根源的な欲求。孤独の定義は人それぞれ" },
      { label: "失敗すること", value: "failure", insight: "失敗の定義が鍵。何をもって失敗とする？" },
      { label: "本当の自分がバレること", value: "exposure", insight: "隠している自分がいる。その自分はそんなに悪い？" },
      { label: "何も残せないこと", value: "insignificance", insight: "存在意義への問い。これは最も人間的な恐怖" },
    ],
  },
  {
    id: "mq_25", day: 25, prompt: "最近見た夢で覚えているものは？", category: "desire",
    options: [
      { label: "追いかけられる・逃げる夢", value: "chase", insight: "現実で何かから逃避している可能性" },
      { label: "誰かと一緒にいる夢", value: "together", insight: "繋がりへの願望が夢に出ている" },
      { label: "不思議な場所にいる夢", value: "strange_place", insight: "未知の自分を探索している。内面が動いている" },
      { label: "覚えていない", value: "no_dream", insight: "夢を忘れるのは脳の防衛。何を隠している？" },
    ],
  },
  // Days 26-31: Integration
  {
    id: "mq_26", day: 26, prompt: "昨日と今日で、自分の何が変わった？", category: "integration",
    options: [
      { label: "気分が違う", value: "mood_shift", insight: "一晩で気分が変わる——その振れ幅が性格の可動域" },
      { label: "考え方が変わった", value: "thought_shift", insight: "思考の更新が起きている。何がきっかけ？" },
      { label: "体調が違う", value: "physical_shift", insight: "身体の状態は心理に直結する。その逆もまた" },
      { label: "何も変わっていない", value: "no_change", insight: "本当に変化ゼロ？微細な差異を見逃しているかも" },
    ],
  },
  {
    id: "mq_27", day: 27, prompt: "今月、一番の発見は？", category: "integration",
    options: [
      { label: "自分の意外な一面", value: "self_discovery", insight: "新しい自分に出会えた月。その一面を育てる？隠す？" },
      { label: "他者への新しい理解", value: "other_understanding", insight: "他者理解は自己理解の鏡。何を投影していた？" },
      { label: "まだ何も発見がない", value: "no_discovery", insight: "発見がないのは、見方を変えていないから。レンズを変えよう" },
      { label: "発見はあるが言語化できない", value: "inexpressible", insight: "言葉にならない発見は、最も深い層の気づき" },
    ],
  },
  {
    id: "mq_28", day: 28, prompt: "未来の自分は、今の自分をどう見ると思う？", category: "integration",
    options: [
      { label: "「頑張ってたな」と思う", value: "effort", insight: "今の努力を未来が認めてくれると信じている" },
      { label: "「もったいない時間の使い方」と思う", value: "wasted", insight: "今の時間の使い方に不満がある" },
      { label: "「あの時が転機だった」と思う", value: "turning_point", insight: "今が重要な分岐点だという直感がある" },
      { label: "想像できない", value: "unimaginable", insight: "未来の自分が見えない——不確実性の中にいる" },
    ],
  },
  {
    id: "mq_29", day: 29, prompt: "今、感謝していることを一つ挙げるなら？", category: "integration",
    options: [
      { label: "健康であること", value: "health", insight: "基盤を大切にしている。失ってから気づく前に気づけている" },
      { label: "特定の人の存在", value: "person", insight: "その人がいなくなったら？ その恐怖も一緒に観る" },
      { label: "今の環境", value: "environment", insight: "環境への感謝は、自分の状況をメタに見れている証拠" },
      { label: "すぐに浮かばない", value: "nothing", insight: "感謝が浮かばない時期は、何かを見失っている。でも、それも一時的" },
    ],
  },
  {
    id: "mq_30", day: 30, prompt: "自分自身に問いたい質問は何？", category: "integration",
    options: [
      { label: "「本当にこれでいいのか？」", value: "is_this_ok", insight: "現状への疑問。この不安は変化へのエネルギーになる" },
      { label: "「何がしたいのか？」", value: "what_do_i_want", insight: "欲望の不明瞭さ。方向感覚を取り戻す必要がある" },
      { label: "「なぜこうなった？」", value: "how_did_i_get_here", insight: "過去の選択の棚卸し。因果関係を見つめる時" },
      { label: "「質問が思いつかない」", value: "no_question", insight: "問いを立てられない時は、まだ準備ができていない。それも大丈夫" },
    ],
  },
  {
    id: "mq_31", day: 31, prompt: "今月の自分を一文で表すと？", category: "integration",
    options: [
      { label: "揺れながら進んだ月", value: "wavering_progress", insight: "揺れることは弱さではない。振り子は揺れて初めて時を刻む" },
      { label: "立ち止まった月", value: "standstill", insight: "立ち止まることは停滞ではない。根を張る時間だったかもしれない" },
      { label: "何かが変わり始めた月", value: "beginning_change", insight: "変化の種は蒔かれた。来月、何が芽吹くか" },
      { label: "よくわからなかった月", value: "unclear", insight: "わからないことを認められるのは、誠実さの証拠" },
    ],
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function dateSeed(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function getDateKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getTodaysQuestion(): MorningQuestionDef {
  const now = new Date();
  const dayOfMonth = now.getDate(); // 1-31
  // Use day of month directly (mod 31 for safety)
  const idx = (dayOfMonth - 1) % MORNING_QUESTIONS.length;
  return MORNING_QUESTIONS[idx];
}

function getStorageKey(): string {
  return `sg_morning_${getDateKey()}`;
}

interface StoredAnswer {
  questionId: string;
  answer: string;
  insight: string;
  answeredAt: number;
  responseTimeMs: number;
}

function getStoredAnswer(): StoredAnswer | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(getStorageKey());
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeAnswer(answer: StoredAnswer): void {
  safeSetItem(getStorageKey(), JSON.stringify(answer));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function MorningQuestion({
  onAnswer,
  totalObservations = 0,
}: MorningQuestionProps) {
  // Synchronously initialize from localStorage to avoid flash of unanswered state
  const [initialData] = useState(() => {
    const q = getTodaysQuestion();
    const existing = getStoredAnswer();
    return { question: q, existing };
  });

  const [state, setState] = useState<"loading" | "unanswered" | "revealing" | "answered">(
    initialData.existing ? "answered" : "unanswered"
  );
  const [question] = useState<MorningQuestionDef>(initialData.question);
  const [selectedOption, setSelectedOption] = useState<MorningQuestionOption | null>(
    initialData.existing
      ? initialData.question.options.find((o) => o.value === initialData.existing!.answer) || null
      : null
  );
  const [storedAnswer, setStoredAnswer] = useState<StoredAnswer | null>(initialData.existing);
  const [typedInsight, setTypedInsight] = useState("");
  const startTimeRef = useRef<number>(Date.now());

  // SSR hydration guard: re-check localStorage on client mount
  useEffect(() => {
    const existing = getStoredAnswer();
    if (existing && state === "unanswered") {
      const opt = question.options.find((o) => o.value === existing.answer) || null;
      setSelectedOption(opt);
      setStoredAnswer(existing);
      setState("answered");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Typewriter effect for insight
  useEffect(() => {
    if (state !== "revealing" || !selectedOption) return;
    const text = selectedOption.insight;
    let i = 0;
    setTypedInsight("");
    const interval = setInterval(() => {
      i++;
      setTypedInsight(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setTimeout(() => setState("answered"), 800);
      }
    }, 40);
    return () => clearInterval(interval);
  }, [state, selectedOption]);

  const handleSelect = (option: MorningQuestionOption) => {
    if (state !== "unanswered" || !question) return;
    const responseTimeMs = Date.now() - startTimeRef.current;
    setSelectedOption(option);

    const answer: StoredAnswer = {
      questionId: question.id,
      answer: option.value,
      insight: option.insight,
      answeredAt: Date.now(),
      responseTimeMs,
    };
    storeAnswer(answer);
    setStoredAnswer(answer);
    onAnswer?.(question.id, option.value, responseTimeMs);
    setState("revealing");
  };

  if (!question) return null;

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {/* ── Unanswered ── */}
        {state === "unanswered" && (
          <motion.div
            key="unanswered"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22 }}
            className="rounded-2xl overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(190,170,110,0.25)",
            }}
          >
            {/* Header */}
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: "rgba(190,170,110,0.8)" }}
                />
                <span
                  className="text-[10px] font-medium tracking-wider uppercase"
                  style={{ color: "rgba(190,170,110,0.9)" }}
                >
                  朝の一問
                </span>
              </div>
              <h3
                className="font-bold leading-snug"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "0.95rem",
                  color: "rgba(24,30,48,0.95)",
                }}
              >
                {question.prompt}
              </h3>
            </div>

            {/* Options */}
            <div className="px-4 pb-4 space-y-1.5">
              {question.options.map((opt, i) => (
                <motion.button
                  key={opt.value}
                  aria-label={`${opt.label}を選択する`}
                  onClick={() => handleSelect(opt)}
                  className="w-full text-left px-3 py-2.5 rounded-xl transition-colors"
                  style={{
                    background: "rgba(255,255,255,0.5)",
                    backdropFilter: "blur(12px)",
                    border: "1px solid rgba(255,255,255,0.6)",
                    minHeight: "36px",
                  }}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 + 0.2, duration: 0.18 }}
                  whileHover={{
                    background: "rgba(190,170,110,0.12)",
                    borderColor: "rgba(190,170,110,0.4)",
                    scale: 1.01,
                  }}
                  whileTap={{ scale: 0.97 }}
                >
                  <span className="text-xs font-semibold text-slate-800">
                    {opt.label}
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Revealing ── */}
        {state === "revealing" && selectedOption && (
          <motion.div
            key="revealing"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="rounded-2xl overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(190,170,110,0.35)",
            }}
          >
            <div className="px-4 py-4">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ background: "rgba(190,170,110,0.8)" }}
                />
                <span
                  className="text-[10px] font-medium"
                  style={{ color: "rgba(190,170,110,0.9)" }}
                >
                  解析中...
                </span>
              </div>

              {/* Selected answer */}
              <div
                className="px-3 py-1 rounded-lg mb-3 inline-block"
                style={{
                  background: "rgba(190,170,110,0.1)",
                  border: "1px solid rgba(190,170,110,0.3)",
                }}
              >
                <span className="text-xs font-medium text-slate-700">
                  {selectedOption.label}
                </span>
              </div>

              {/* Typewriter insight */}
              <p className="text-sm font-medium text-slate-800 leading-relaxed min-h-[2.5rem]">
                {typedInsight}
                <motion.span
                  className="inline-block w-[2px] h-4 ml-0.5 align-middle rounded-full"
                  style={{ background: "rgba(190,170,110,0.8)" }}
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity }}
                />
              </p>
            </div>
          </motion.div>
        )}

        {/* ── Answered ── */}
        {state === "answered" && selectedOption && (
          <motion.div
            key="answered"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="rounded-2xl overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.06)",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(190,170,110,0.2)",
            }}
          >
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: "rgba(190,170,110,0.6)" }}
                  />
                  <span className="text-[10px] font-medium text-slate-400">
                    回答済み
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 truncate max-w-[60%]">
                  {question.prompt}
                </span>
              </div>

              <div className="flex items-center gap-2 mb-2">
                <div
                  className="px-2 py-1 rounded-lg text-[11px] font-medium"
                  style={{
                    background: "rgba(190,170,110,0.1)",
                    color: "rgba(140,120,60,1)",
                    border: "1px solid rgba(190,170,110,0.2)",
                  }}
                >
                  {selectedOption.label}
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                {selectedOption.insight}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Export for use in vanishingInsightGenerator
export { MORNING_QUESTIONS, getStoredAnswer as getMorningAnswer, getDateKey };
export type { StoredAnswer as MorningAnswerData, MorningQuestionDef };
