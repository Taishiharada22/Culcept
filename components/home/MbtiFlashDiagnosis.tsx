"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface FlashOption { label: string; value: string; }
interface FlashChoice { axis: "EI" | "SN" | "TF" | "JP"; prompt: string; options: FlashOption[]; }
type Axis = "EI" | "SN" | "TF" | "JP";
interface AxisScore { first: string; second: string; confidence: number; hesitationMs: number; }
interface PersonalityInsight { tag: string; title: string; body: string; accent: string; }

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Base 8 Questions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BASE_QUESTIONS: FlashChoice[] = [
  { axis: "EI", prompt: "疲れたとき、どうする？", options: [
    { label: "友達に連絡して会いに行く", value: "E" },
    { label: "カフェで人の気配を感じながら過ごす", value: "E" },
    { label: "家で一人で好きなことをする", value: "I" },
    { label: "通知を全部切って考え事をする", value: "I" },
  ]},
  { axis: "SN", prompt: "新しいプロジェクトを任された。最初に考えるのは？", options: [
    { label: "成功した前例があるかどうか", value: "S" },
    { label: "まず小さく試して手応えを確かめる", value: "S" },
    { label: "最終的にどこまで行けるかの全体戦略", value: "N" },
    { label: "今の常識を壊す方法がないか考える", value: "N" },
  ]},
  { axis: "TF", prompt: "友達が明らかに間違った判断をしてる。どうする？", options: [
    { label: "はっきり「それ違うよ」と言う", value: "T" },
    { label: "データや根拠を見せて気づかせる", value: "T" },
    { label: "まず気持ちを聞いてから、やんわり伝える", value: "F" },
    { label: "言わない。自分で気づくまで見守る", value: "F" },
  ]},
  { axis: "JP", prompt: "日曜日の朝。予定がない。", options: [
    { label: "前日のうちにやること決めてある", value: "J" },
    { label: "ToDoリスト作ってから動く", value: "J" },
    { label: "とりあえず起きてから考える", value: "P" },
    { label: "気分次第。予定なんていらない", value: "P" },
  ]},
  { axis: "EI", prompt: "大事な話をするなら？", options: [
    { label: "電話かビデオ通話で直接", value: "E" },
    { label: "会って顔を見ながら話す", value: "E" },
    { label: "LINEでじっくり文章にする", value: "I" },
    { label: "一人で整理してから手紙にする", value: "I" },
  ]},
  { axis: "SN", prompt: "つまらない会議中、頭の中では何してる？", options: [
    { label: "話の矛盾や事実の間違いを拾ってる", value: "S" },
    { label: "次にやるべきタスクを頭で整理してる", value: "S" },
    { label: "「この組織ごと変えたほうが早い」と考えてる", value: "N" },
    { label: "全然関係ない未来の構想が勝手に広がってる", value: "N" },
  ]},
  { axis: "TF", prompt: "チームで意見が割れた。どう動く？", options: [
    { label: "論理的に正しい方を主張する", value: "T" },
    { label: "感情を排して事実で判断する", value: "T" },
    { label: "全員が納得できる落としどころを探す", value: "F" },
    { label: "少数派の気持ちを拾いに行く", value: "F" },
  ]},
  { axis: "JP", prompt: "旅行に行くなら？", options: [
    { label: "ホテルも観光地も全部決めてから出発", value: "J" },
    { label: "最低限の計画を立てて、あとは現地で判断", value: "J" },
    { label: "行き先だけ決めて、あとは流れに任せる", value: "P" },
    { label: "そもそも行き先すら当日の気分で決める", value: "P" },
  ]},
];

const TIEBREAKER_QUESTIONS: Record<Axis, FlashChoice> = {
  EI: { axis: "EI", prompt: "正直なところ、人付き合い全般は……", options: [
    { label: "楽しい。エネルギーをもらえる", value: "E" },
    { label: "好きだけど、長いと疲れる", value: "E" },
    { label: "必要だと思うけど、本音は面倒", value: "I" },
    { label: "できれば最小限にしたい", value: "I" },
  ]},
  SN: { axis: "SN", prompt: "あなたが一番ワクワクするのは？", options: [
    { label: "うまくいった成功体験を再現するとき", value: "S" },
    { label: "細部まで完璧に仕上がったとき", value: "S" },
    { label: "まだ誰もやっていない道を見つけたとき", value: "N" },
    { label: "頭の中の理想が現実になり始めたとき", value: "N" },
  ]},
  TF: { axis: "TF", prompt: "大切な人と意見がぶつかったとき、最終的にどうなる？", options: [
    { label: "自分が正しいと思ったら譲れない", value: "T" },
    { label: "感情抜きで、事実ベースで話したい", value: "T" },
    { label: "相手が傷つくくらいなら自分が折れる", value: "F" },
    { label: "お互いの気持ちを大事にしたい", value: "F" },
  ]},
  JP: { axis: "JP", prompt: "「自由に使っていい1日」があったら？", options: [
    { label: "やりたいことリストを消化する", value: "J" },
    { label: "せっかくだから効率よく過ごしたい", value: "J" },
    { label: "何もしないをする。それが最高", value: "P" },
    { label: "行き当たりばったりで過ごす", value: "P" },
  ]},
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function computeAxisScores(aa: Record<string, string[]>, at_: Record<string, number[]>): Record<Axis, AxisScore> {
  const defs: { axis: Axis; first: string; second: string }[] = [
    { axis: "EI", first: "E", second: "I" }, { axis: "SN", first: "S", second: "N" },
    { axis: "TF", first: "T", second: "F" }, { axis: "JP", first: "J", second: "P" },
  ];
  const r = {} as Record<Axis, AxisScore>;
  for (const { axis, first, second } of defs) {
    const v = aa[axis] || [], t = at_[axis] || [];
    const cF = v.filter((x) => x === first).length, cS = v.filter((x) => x === second).length;
    r[axis] = { first, second, confidence: Math.abs(cF - cS) / (cF + cS || 1), hesitationMs: t.length ? t.reduce((a, b) => a + b, 0) / t.length : 2000 };
  }
  return r;
}
function resolveAxis(aa: Record<string, string[]>, axis: Axis, a: string, b: string): string {
  const v = aa[axis] || [];
  return v.filter((x) => x === a).length >= v.filter((x) => x === b).length ? a : b;
}
function resolveType(aa: Record<string, string[]>): string {
  return resolveAxis(aa, "EI", "E", "I") + resolveAxis(aa, "SN", "S", "N") + resolveAxis(aa, "TF", "T", "F") + resolveAxis(aa, "JP", "J", "P");
}
function findContradictedAxes(s: Record<Axis, AxisScore>): Axis[] {
  return (["EI", "SN", "TF", "JP"] as Axis[]).filter((a) => s[a].confidence === 0);
}
const MBTI_NICKNAMES: Record<string, string> = {
  INTJ: "戦略家", INTP: "論理学者", ENTJ: "指揮官", ENTP: "討論者",
  INFJ: "提唱者", INFP: "仲介者", ENFJ: "主人公", ENFP: "広報運動家",
  ISTJ: "管理者", ISFJ: "擁護者", ESTJ: "幹部", ESFJ: "領事官",
  ISTP: "巨匠", ISFP: "冒険家", ESTP: "起業家", ESFP: "エンターテイナー",
};

function generateInsights(aa: Record<string, string[]>): PersonalityInsight[] {
  const ei = resolveAxis(aa, "EI", "E", "I"), sn = resolveAxis(aa, "SN", "S", "N");
  const tf = resolveAxis(aa, "TF", "T", "F"), jp = resolveAxis(aa, "JP", "J", "P");
  const ins: PersonalityInsight[] = [];
  const omote: Record<string, string> = {
    EN: "周りからは「エネルギッシュで発想力のある人」って見られてる。場を動かす力があるから、自然とみんなの中心にいるでしょ。でもね、その役割に疲れてる日もあるはず。",
    ES: "「頼りになる、行動力のある人」。それが周りから見た君。実際に動けるし、口だけじゃない。だから人が集まってくる。でも、本当は誰かに頼りたい日もあるんじゃない？",
    IN: "静かだけど、考えてることのスケールがデカい。周りは君のことを「独特な世界観を持ってる人」って思ってる。実際、頭の中は常にフル回転してるでしょ。ただ、それを言語化できないもどかしさ、あるよね。",
    IS: "「穏やかで、ちゃんとしてる人」。それが周りの印象。でも君の中には、もっと激しい感情とか、言えてないこととか、たくさんあるはず。表に出さないだけで。",
  };
  ins.push({ tag: "表の顔", title: "周りから、こう見えてる", body: omote[ei + sn] || omote["IN"], accent: "#A78BFA" });
  const hidden: Record<string, string> = {
    NT: "論理的に考えるのが得意なぶん、感情の扱いに困ってるでしょ。泣きたいときに泣けない。怒りたいときに「でも合理的じゃない」ってブレーキかけちゃう。感情を無視してるんじゃなくて、向き合い方がわからないだけ。",
    NF: "人のことはすごくよく見えるのに、自分のことになると途端にわからなくなるでしょ。「自分は何がしたいの？」って、定期的に迷子になってない？ 人を助けることで、本当は自分を助けようとしてる。",
    ST: "「変化が怖い」って認めるのが嫌なんでしょ。安定が好きなだけって自分に言い聞かせてるけど、本当は新しいことに飛び込む勇気が出ないだけかもしれない。でもね、気づいてるなら大丈夫。",
    SF: "人のことを優先しすぎて、自分が空っぽになってることに気づいてない。「疲れた」って言ったら周りが心配するから言えない。でもね、君が倒れたら、君が支えてる人たちも倒れるよ。",
  };
  ins.push({ tag: "隠してること", title: "たぶん、言えてないこと", body: hidden[sn + tf] || hidden["NF"], accent: "#EC4899" });
  const rel: Record<string, string> = {
    EF: "人が好きで、人に尽くせる。でもそのぶん、関係に依存しやすい。相手の機嫌で自分の気分が決まっちゃうこと、ない？ 「嫌われたかも」って思った瞬間、全部ダメになる感覚。それ、君の優しさの裏返し。",
    ET: "人と一緒にいるのは好きだけど、深い関係になると急にめんどくさくなるでしょ。表面的には社交的なのに、本当に心を開いてる相手は片手で足りるくらい。……それで富しくなることもあるんじゃない？",
    IF: "一対一の深い関係を大切にするタイプ。でも「わかってもらえない」って感じる瞬間が多すぎて、最初から期待しないようにしてる。心の壁、自分で思ってるより分厚いよ。",
    IT: "人間関係にエネルギー使うのがしんどいんでしょ。一人でいるほうが楽。でもたまに、ふと富しくなる。「理解してくれる人がほしい」って思うけど、自分から歩み寄るのは苦手。",
  };
  ins.push({ tag: "人間関係のクセ", title: "人との距離の取り方", body: rel[ei + tf] || rel["IF"], accent: "#818CF8" });
  const fear: Record<string, string> = {
    EJ: "コントロールを失うこと。計画が崩れること。予想外の展開に弱い自分を、誰にも見せたくない。強くいなきゃって思いすぎてない？",
    IJ: "変化すること。今の自分が壊れること。安全な場所から出たら、もう戻れないんじゃないかって。でもね、変わっても君は君のままだよ。",
    EP: "一つに決めること。選んだ瞬間、他の可能性が消える。だから決められない。でも「選ばない」ことも、一つの選択だって気づいてる？",
    IP: "自分の居場所がないこと。どこにも属せない感覚。自由でいたいのに、孤独は怖い。その矛盾、ずっと抱えてるでしょ。",
  };
  ins.push({ tag: "一番怖いこと", title: "実は、これが怖い", body: fear[ei + jp] || fear["IP"], accent: "#F43F5E" });
  return ins;
}

function getHesitationCommentary(scores: Record<Axis, AxisScore>): string | null {
  const axes: Axis[] = ["EI", "SN", "TF", "JP"];
  let maxAxis: Axis = "EI", maxMs = 0, minMs = Infinity, lowestConfAxis: Axis = "EI", lowestConf = 1;
  for (const a of axes) {
    if (scores[a].hesitationMs > maxMs) { maxMs = scores[a].hesitationMs; maxAxis = a; }
    if (scores[a].hesitationMs < minMs) { minMs = scores[a].hesitationMs; }
    if (scores[a].confidence < lowestConf) { lowestConf = scores[a].confidence; lowestConfAxis = a; }
  }
  if (lowestConf === 0) {
    const c: Record<Axis, string> = {
      EI: "人との距離感の質問で、答えが完全に割れてたね。人といたいけど一人でもいたい——両方の自分がいるんだと思う。",
      SN: "ものの見方の質問で真逆のこと答えてたよ。現実的な自分と、理想を追う自分。どっちも本当の君。",
      TF: "判断の仕方の質問で迷ったでしょ。頭では正しいってわかってるのに、気持ちが邪魔する。その葛藤、日常的にあるはず。",
      JP: "生き方の質問で答えが割れた。自由でいたいのに、ちゃんとしなきゃって思ってる。その板挙み、地味に疲れるよね。",
    };
    return c[lowestConfAxis];
  }
  if (maxMs > 4000 && maxMs > minMs * 2) {
    const c: Record<Axis, string> = {
      EI: "人との距離感の質問で、めっちゃ迷ってたね。自分でもどっちかわからないんだと思う。",
      SN: "考え方の質問でかなり時間かかってた。現実と理想の間で、いつも揺れてるでしょ。",
      TF: "判断の仕方の質問で迷ってたね。頭と心、いつもケンカしてない？",
      JP: "生き方の質問で時間かかってた。本当は自由でいたいのに、ちゃんとしなきゃって思ってない？",
    };
    return c[maxAxis];
  }
  if (maxMs < 1500) return "全部即答だったね。迷いがない。……でも「迷わない」のは、もう答えを決めてるからじゃない？";
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type Phase = "intro" | "choosing" | "tiebreaker" | "analyzing" | "revealing" | "mbti" | "pivot";

export default function MbtiFlashDiagnosis() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [currentQ, setCurrentQ] = useState(0);
  const [tbAxes, setTbAxes] = useState<Axis[]>([]);
  const [tbIdx, setTbIdx] = useState(0);
  const [insightIdx, setInsightIdx] = useState(0);
  const [insights, setInsights] = useState<PersonalityInsight[]>([]);
  const [mbtiCode, setMbtiCode] = useState("");
  const [hesComment, setHesComment] = useState<string | null>(null);
  const t0 = useRef(Date.now());
  const aa = useRef<Record<string, string[]>>({ EI: [], SN: [], TF: [], JP: [] });
  const axTimes = useRef<Record<string, number[]>>({ EI: [], SN: [], TF: [], JP: [] });
  const totalQ = 8 + tbAxes.length;

  const start = useCallback(() => {
    setPhase("choosing"); setCurrentQ(0); setInsightIdx(0); setInsights([]); setMbtiCode(""); setHesComment(null); setTbAxes([]); setTbIdx(0);
    aa.current = { EI: [], SN: [], TF: [], JP: [] }; axTimes.current = { EI: [], SN: [], TF: [], JP: [] }; t0.current = Date.now();
  }, []);

  const finalize = useCallback(() => {
    setPhase("analyzing");
    const scores = computeAxisScores(aa.current, axTimes.current);
    setMbtiCode(resolveType(aa.current)); setInsights(generateInsights(aa.current)); setHesComment(getHesitationCommentary(scores));
    setTimeout(() => { setPhase("revealing"); setInsightIdx(0); }, 2200);
  }, []);

  const pick = useCallback((v: string, axis: string) => {
    aa.current[axis].push(v); axTimes.current[axis].push(Date.now() - t0.current); t0.current = Date.now();
    if (currentQ < 7) setCurrentQ((c) => c + 1);
    else {
      const s = computeAxisScores(aa.current, axTimes.current), ct = findContradictedAxes(s);
      if (ct.length > 0) { setTbAxes(ct); setTbIdx(0); setPhase("tiebreaker"); } else finalize();
    }
  }, [currentQ, finalize]);

  const pickTb = useCallback((v: string, axis: string) => {
    aa.current[axis].push(v); axTimes.current[axis].push(Date.now() - t0.current); t0.current = Date.now();
    if (tbIdx < tbAxes.length - 1) setTbIdx((i) => i + 1); else finalize();
  }, [tbIdx, tbAxes, finalize]);

  const q = phase === "choosing" ? BASE_QUESTIONS[currentQ] : null;
  const tbQ = phase === "tiebreaker" ? TIEBREAKER_QUESTIONS[tbAxes[tbIdx]] : null;
  const ci = insights[insightIdx];
  const prog = phase === "tiebreaker" ? 8 + tbIdx : currentQ;

  return (
    <section style={{ padding: "60px 24px 80px", display: "flex", flexDirection: "column", alignItems: "center",
      background: "radial-gradient(ellipse at 50% 30%, rgba(88,28,135,0.12), transparent 60%), linear-gradient(180deg, #0a0618, #100c28, #08061a)" }}>
      <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
        <AnimatePresence mode="wait">

          {phase === "intro" && (
            <motion.div key="intro" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <p style={{ fontSize: 11, letterSpacing: 3, color: "rgba(139,92,246,0.5)", marginBottom: 16 }}>1分でわかる</p>
              <h3 style={{ fontSize: "clamp(20px, 5.5vw, 28px)", fontWeight: 900, lineHeight: 1.5, marginBottom: 16 }}>
                8つ選ぶだけで、<br /><span style={{ background: "linear-gradient(135deg, #A78BFA, #EC4899)", backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent" }}>あなたのこと、言い当てる</span>
              </h3>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", lineHeight: 1.8, marginBottom: 28 }}>考えないで。直感で。<br />一番近いやつを選んで。</p>
              <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }} onClick={start}
                style={{ padding: "16px 40px", borderRadius: 28, background: "linear-gradient(135deg, #8B5CF6, #6366F1)", border: "none", color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: "0 8px 32px rgba(99,102,241,0.3)" }}>
                やってみる
              </motion.button>
            </motion.div>
          )}

          {phase === "choosing" && q && (
            <motion.div key={`q-${currentQ}`} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.3 }}>
              <QUI c={prog} t={totalQ} p={q.prompt} opts={q.options} onPick={(v) => pick(v, q.axis)} />
            </motion.div>
          )}

          {phase === "tiebreaker" && tbQ && (
            <motion.div key={`tb-${tbIdx}`} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.3 }}>
              <p style={{ fontSize: 12, color: "rgba(236,72,153,0.6)", marginBottom: 12, fontWeight: 600 }}>ちょっと迷ってるところがあるね。もう1問だけ。</p>
              <QUI c={prog} t={totalQ} p={tbQ.prompt} opts={tbQ.options} onPick={(v) => pickTb(v, tbQ.axis)} />
            </motion.div>
          )}

          {phase === "analyzing" && (
            <motion.div key="anal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ padding: "60px 0" }}>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                style={{ width: 48, height: 48, borderRadius: "50%", border: "2px solid rgba(139,92,246,0.15)", borderTop: "2px solid #A78BFA", margin: "0 auto 24px" }} />
              <motion.p animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity }}
                style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>あなたの選び方を読んでる...</motion.p>
            </motion.div>
          )}

          {phase === "revealing" && ci && (
            <motion.div key="rev" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, letterSpacing: 3, color: "rgba(236,72,153,0.6)", marginBottom: 12 }}>READING</p>
                <p style={{ fontSize: "clamp(18px, 5vw, 24px)", fontWeight: 800, color: "rgba(255,255,255,0.9)", lineHeight: 1.6 }}>あなたって、こういう人。</p>
              </div>
              {hesComment && insightIdx === 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                  style={{ padding: "14px 18px", borderRadius: 14, background: "rgba(236,72,153,0.06)", border: "1px solid rgba(236,72,153,0.12)", marginBottom: 16, textAlign: "left" }}>
                  <p style={{ fontSize: 13, color: "rgba(236,72,153,0.75)", lineHeight: 1.8, fontStyle: "italic" }}>{hesComment}</p>
                </motion.div>
              )}
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 20 }}>
                {insights.map((_, i) => (
                  <div key={i} style={{ width: i === insightIdx ? 24 : 8, height: 8, borderRadius: 4,
                    background: i < insightIdx ? "rgba(167,139,250,0.5)" : i === insightIdx ? ci.accent : "rgba(255,255,255,0.08)", transition: "all 0.4s" }} />
                ))}
              </div>
              <AnimatePresence mode="wait">
                <motion.div key={insightIdx} initial={{ opacity: 0, y: 30, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -30, scale: 0.95 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  style={{ padding: "28px 24px", borderRadius: 24, background: `linear-gradient(145deg, ${ci.accent}12, ${ci.accent}04)`, border: `1px solid ${ci.accent}25`,
                    textAlign: "left", minHeight: 200, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: `radial-gradient(circle, ${ci.accent}15, transparent 70%)`, filter: "blur(30px)" }} />
                  <p style={{ fontSize: 11, letterSpacing: 3, marginBottom: 10, color: ci.accent, opacity: 0.7, fontWeight: 600, position: "relative", zIndex: 1 }}>{ci.tag}</p>
                  <p style={{ fontSize: 18, fontWeight: 800, color: "rgba(255,255,255,0.92)", marginBottom: 14, lineHeight: 1.5, position: "relative", zIndex: 1 }}>{ci.title}</p>
                  <p style={{ fontSize: 15, color: "rgba(255,255,255,0.7)", lineHeight: 2, position: "relative", zIndex: 1 }}>{ci.body}</p>
                </motion.div>
              </AnimatePresence>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} style={{ marginTop: 20 }}>
                {insightIdx < insights.length - 1 ? (
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} onClick={() => setInsightIdx((i) => i + 1)}
                    style={{ width: "100%", padding: "16px 20px", borderRadius: 18, background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)",
                      color: "rgba(167,139,250,0.85)", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                    {insightIdx === 0 ? "……まだ見えてるよ" : insightIdx === 1 ? "……もうひとつ" : "……最後に、これだけ"}
                  </motion.button>
                ) : (
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} onClick={() => setPhase("mbti")}
                    style={{ width: "100%", padding: "16px 20px", borderRadius: 18, background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)",
                      color: "rgba(167,139,250,0.85)", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                    ……ちなみに
                  </motion.button>
                )}
              </motion.div>
            </motion.div>
          )}

          {phase === "mbti" && (
            <motion.div key="mbti" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, duration: 0.7 }}
                style={{ padding: "40px 28px", borderRadius: 28, background: "linear-gradient(145deg, rgba(139,92,246,0.12), rgba(99,102,241,0.06))", border: "1px solid rgba(139,92,246,0.25)",
                  textAlign: "center", marginBottom: 24, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: -40, left: "50%", transform: "translateX(-50%)", width: 200, height: 200, borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(139,92,246,0.15), transparent 70%)", filter: "blur(40px)" }} />
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", letterSpacing: 3, marginBottom: 20, position: "relative" }}>MBTIでいうと</p>
                <p style={{ fontSize: "clamp(40px, 10vw, 56px)", fontWeight: 900, letterSpacing: 6, background: "linear-gradient(135deg, #A78BFA, #818CF8, #EC4899)",
                  backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent", marginBottom: 12, position: "relative" }}>{mbtiCode}</p>
                <p style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: 16, position: "relative" }}>{MBTI_NICKNAMES[mbtiCode] || "?"}</p>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", lineHeight: 1.8, position: "relative" }}>って感じが見えるよ。</p>
              </motion.div>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} onClick={() => setPhase("pivot")}
                style={{ width: "100%", padding: "16px 20px", borderRadius: 18, background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)",
                  color: "rgba(167,139,250,0.85)", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                ……でもこれ、たった8問でわかること
              </motion.button>
            </motion.div>
          )}

          {phase === "pivot" && (
            <motion.div key="pivot" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                style={{ padding: "32px 24px", borderRadius: 24, background: "linear-gradient(145deg, rgba(139,92,246,0.1), rgba(99,102,241,0.06))", border: "1px solid rgba(139,92,246,0.2)",
                  textAlign: "left", marginBottom: 24 }}>
                <p style={{ fontSize: 16, color: "rgba(255,255,255,0.85)", lineHeight: 2, fontWeight: 500, marginBottom: 12 }}>たった8問で、ここまで見えた。</p>
                <div style={{ height: 1, background: "rgba(139,92,246,0.15)", margin: "12px 0 16px" }} />
                <p style={{ fontSize: 15, color: "rgba(255,255,255,0.65)", lineHeight: 2 }}>
                  Aneurasyncなら、あなたに本当に合う仕事も、恋愛パターンも、自分でも気づいてない思考のクセも、全部見えてくる。
                </p>
                <p style={{ fontSize: 15, color: "rgba(255,255,255,0.65)", lineHeight: 2, marginTop: 8 }}>MBTIの16個の箱じゃ足りない。<br />君は、もっと複雑で、もっと面白い人間。</p>
                <p style={{ fontSize: 15, color: "rgba(167,139,250,0.9)", lineHeight: 2, marginTop: 12, fontWeight: 600 }}>じゃあ、本気で潜ったら？</p>
              </motion.div>
              <Link href="/stargazer">
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                  style={{ padding: "18px 48px", borderRadius: 30, background: "linear-gradient(135deg, #8B5CF6, #6366F1)", border: "none", color: "white", fontSize: 17, fontWeight: 800,
                    cursor: "pointer", boxShadow: "0 8px 40px rgba(99,102,241,0.3)", letterSpacing: "0.5px" }}>
                  もっと深く知りたい →
                </motion.button>
              </Link>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 12, lineHeight: 1.7 }}>3分後、自分の知らなかった自分に出会う。</p>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </section>
  );
}

function QUI({ c, t, p, opts, onPick }: { c: number; t: number; p: string; opts: FlashOption[]; onPick: (v: string) => void }) {
  return (<>
    <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 24 }}>
      {Array.from({ length: t }).map((_, i) => (
        <div key={i} style={{ width: i === c ? 24 : 6, height: 6, borderRadius: 3,
          background: i < c ? "#A78BFA" : i === c ? "rgba(167,139,250,0.8)" : "rgba(255,255,255,0.1)", transition: "all 0.3s" }} />
      ))}
    </div>
    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginBottom: 8 }}>{c + 1} / {t}</p>
    <p style={{ fontSize: 15, color: "rgba(255,255,255,0.7)", marginBottom: 20, fontWeight: 600 }}>{p}</p>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {opts.map((o, i) => (
        <motion.button key={i} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }} onClick={() => onPick(o.value)}
          style={{ padding: "20px 14px", borderRadius: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: 500, cursor: "pointer", lineHeight: 1.5, textAlign: "left" }}>
          {o.label}
        </motion.button>
      ))}
    </div>
  </>);
}
