// lib/stargazer/relationalImpactAnalyzer.ts
// 関係性インパクト分析 — あなたが他者にどう影響を与えるかを予測する
// 心理学的根拠: Sullivan（対人関係論）、Satir（コミュニケーションスタンス）、
// Gottman（関係性の4騎士）、Bowlby（愛着スタイル）

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";

// ── Types ──

export interface RelationalImpact {
  /** インパクトの名前 */
  name: string;
  /** 関係性の種類 */
  context: "romantic" | "friendship" | "work" | "family" | "general";
  contextLabel: string;
  /** あなたが相手に与える影響 */
  positiveImpact: string;
  /** 注意すべき影響 */
  riskImpact: string;
  /** 相手がどう感じるか */
  otherPerspective: string;
  /** 関係を深めるヒント */
  deepeningHint: string;
}

export interface CommunicationPattern {
  /** Satir のコミュニケーションスタンス */
  satirStance: "placater" | "blamer" | "computer" | "distractor" | "congruent";
  stanceLabel: string;
  stanceDescription: string;
  /** ストレス下でのスタンス変化 */
  stressShift: string;
}

export interface RelationalImpactResult {
  /** 各関係性での影響 */
  impacts: RelationalImpact[];
  /** コミュニケーションパターン */
  communication: CommunicationPattern;
  /** 全体サマリー */
  summary: string;
  /** 相手が最初に感じるあなたの印象 */
  firstImpression: string;
  /** 長期的に相手が気づく本当のあなた */
  deepImpression: string;
  /** Gottman の4騎士のうち、あなたが陥りやすいもの */
  gottmanRisk: {
    horseman: string;
    description: string;
    antidote: string;
  } | null;
}

// ── Analysis ──

function inferSatirStance(
  axisScores: Partial<Record<TraitAxisKey, number>>,
): CommunicationPattern {
  const harmony = axisScores.independence_vs_harmony ?? 0;
  const direct = axisScores.direct_vs_diplomatic ?? 0;
  const analytical = axisScores.analytical_vs_intuitive ?? 0;
  const bold = axisScores.cautious_vs_bold ?? 0;
  const regulation = axisScores.emotional_regulation ?? 0;

  // Placater: 相手に合わせる（調和重視 + 配慮重視）
  if (harmony > 0.3 && direct > 0.3) {
    return {
      satirStance: "placater",
      stanceLabel: "なだめ型",
      stanceDescription: "相手の気持ちを最優先にする。「あなたが正しい」を無意識に選ぶ。これは優しさだが、自分の意見を飲み込むことでもある。",
      stressShift: "ストレス下ではさらに相手に合わせようとし、自分を見失う。「本当はどう思ってる？」と聞かれると困る。",
    };
  }

  // Blamer: 攻撃的（独立重視 + 率直 + 大胆）
  if (harmony < -0.3 && direct < -0.3 && bold > 0.2) {
    return {
      satirStance: "blamer",
      stanceLabel: "非難型",
      stanceDescription: "正しさを主張する。問題の原因を外に求める。これは自分を守るための戦略だが、相手を追い詰めてしまうこともある。",
      stressShift: "ストレス下では批判がさらに鋭くなる。「なぜそうしたの？」が増える。本当は不安を感じている。",
    };
  }

  // Computer: 理性的（分析重視 + 感情安定）
  if (analytical < -0.3 && regulation > 0.3) {
    return {
      satirStance: "computer",
      stanceLabel: "超理性型",
      stanceDescription: "感情を排除して論理で対応する。冷静で理性的だが、相手に「冷たい」と感じさせることがある。感情がないのではなく、感情を見せないだけ。",
      stressShift: "ストレス下ではさらにデータと論理に逃げ込む。「感情は非合理」と切り捨てることで、関係が冷えていく。",
    };
  }

  // Distractor: 話をそらす（即興的 + 感情変動大）
  if ((axisScores.plan_vs_spontaneous ?? 0) > 0.3 && (axisScores.emotional_variability ?? 0) > 0.3) {
    return {
      satirStance: "distractor",
      stanceLabel: "注意そらし型",
      stanceDescription: "緊張が高まるとユーモアや話題転換で場を和ませる。場の空気を軽くする力があるが、重要な問題を先送りにしてしまうこともある。",
      stressShift: "ストレス下ではさらに逃避傾向が強まる。問題を直視することが苦手になり、表面的な解決を選びがち。",
    };
  }

  // Congruent: 一致型（バランスが取れている）
  return {
    satirStance: "congruent",
    stanceLabel: "一致型",
    stanceDescription: "自分の感情と言葉と行動が一致している。嘘のないコミュニケーションができる。これは最も健全なスタンスだが、常に維持するにはエネルギーがいる。",
    stressShift: "ストレス下では他の4つのスタンスのいずれかに傾くことがある。自分のストレスサインに気づくことが一致性を保つ鍵。",
  };
}

function inferGottmanRisk(
  axisScores: Partial<Record<TraitAxisKey, number>>,
): RelationalImpactResult["gottmanRisk"] {
  const direct = axisScores.direct_vs_diplomatic ?? 0;
  const independence = axisScores.independence_vs_harmony ?? 0;
  const regulation = axisScores.emotional_regulation ?? 0;
  const introvert = axisScores.introvert_vs_extrovert ?? 0;

  // Criticism: 率直 + 独立 → 批判になりやすい
  if (direct < -0.3 && independence < -0.2) {
    return {
      horseman: "批判（Criticism）",
      description: "相手の行動ではなく人格を攻撃してしまうパターン。「あなたはいつもこうだ」「なぜそんなことするの」というフレーズが出やすい。",
      antidote: "行動について話し、人格は切り離す。「あなたはいつも遅い」→「今日遅れたのは困った」に変換する。",
    };
  }

  // Contempt: 独立 + 感情安定 → 見下しになりやすい
  if (independence < -0.3 && regulation > 0.4) {
    return {
      horseman: "侮蔑（Contempt）",
      description: "無意識に相手を下に見てしまうパターン。冷静さが「冷たさ」に、独立が「見下し」に変わることがある。",
      antidote: "相手の良いところを意識的に言語化する習慣をつける。感謝を日常的に伝える。",
    };
  }

  // Stonewalling: 内向 + 感情調整低 → 壁を作りやすい
  if (introvert < -0.3 && regulation < -0.2) {
    return {
      horseman: "壁（Stonewalling）",
      description: "感情が溢れると遮断してしまうパターン。黙り込む、部屋を出る、返事をしなくなる。自分を守るための防御だが、相手にとっては「拒絶」に感じられる。",
      antidote: "「今すぐは話せない。20分後に続きを話そう」と伝える。遮断ではなく、一時停止。",
    };
  }

  // Defensiveness: 調和 + 配慮 → 防御的になりやすい
  if ((axisScores.independence_vs_harmony ?? 0) > 0.3 && (axisScores.direct_vs_diplomatic ?? 0) > 0.3) {
    return {
      horseman: "防御（Defensiveness）",
      description: "指摘を受けるとすぐに言い訳をしてしまうパターン。「でも」「だって」が口癖になりやすい。自分を守りたい気持ちが先に出る。",
      antidote: "指摘の中に一つだけでも「確かに」と受け止められるポイントを見つける。全て受け入れる必要はない、一つだけ。",
    };
  }

  return null;
}

function generateRelationalImpacts(
  axisScores: Partial<Record<TraitAxisKey, number>>,
): RelationalImpact[] {
  const impacts: RelationalImpact[] = [];
  const direct = axisScores.direct_vs_diplomatic ?? 0;
  const harmony = axisScores.independence_vs_harmony ?? 0;
  const bold = axisScores.cautious_vs_bold ?? 0;
  const regulation = axisScores.emotional_regulation ?? 0;
  const introvert = axisScores.introvert_vs_extrovert ?? 0;
  const reassurance = axisScores.reassurance_need ?? 0;
  const intimacy = axisScores.intimacy_pace ?? 0;
  const socialInit = axisScores.social_initiative ?? 0;

  // Romantic
  if (intimacy !== undefined || reassurance !== undefined) {
    impacts.push({
      name: "恋愛での影響",
      context: "romantic",
      contextLabel: "恋愛",
      positiveImpact: intimacy > 0.2
        ? "距離を縮めるのが上手い。相手に「受け入れられている」と感じさせる力がある。"
        : intimacy < -0.2
          ? "相手のペースを尊重できる。安全な距離感で、信頼をゆっくり築ける。"
          : "自然体でいられる関係を作れる。無理に距離を操作しない安心感がある。",
      riskImpact: reassurance > 0.3
        ? "確認が多くなると、相手に「信頼されていない」と感じさせてしまうことがある。"
        : intimacy > 0.3
          ? "距離を縮めすぎて、相手が圧迫感を感じることがある。"
          : "距離を保ちすぎて、相手が「興味がないのでは」と不安になることがある。",
      otherPerspective: regulation > 0.3
        ? "冷静で安定した人だと思われている。でも「何を考えているか分からない」と感じられることもある。"
        : "感情が豊かで、一緒にいると楽しい人だと思われている。でも感情の波に疲れる時もある。",
      deepeningHint: "あなたの内面を少しずつ、安全なペースで見せていく。完璧な自分ではなく、リアルな自分を。",
    });
  }

  // Friendship
  impacts.push({
    name: "友人関係での影響",
    context: "friendship",
    contextLabel: "友人",
    positiveImpact: socialInit > 0.2
      ? "場を盛り上げ、人を巻き込む力がある。あなたがいると空気が動く。"
      : introvert < -0.2
        ? "深い対話ができる相手として信頼される。表面的な付き合いより、本質的な繋がりを作れる。"
        : "バランスの取れた存在感で、どんなグループにも自然に溶け込める。",
    riskImpact: harmony > 0.3
      ? "周りに合わせすぎて「何を考えているか分からない」と思われることがある。"
      : harmony < -0.3
        ? "独立心が強すぎて「付き合いが悪い」と思われることがある。"
        : "特定の友人と深くなりすぎて、他の友人関係が疎かになることがある。",
    otherPerspective: direct < -0.2
      ? "「はっきり言ってくれる人」として頼られるが、「キツい」と感じる人もいる。"
      : "「優しい人」として慕われるが、本音を知りたい人にはもどかしさを感じさせる。",
    deepeningHint: "友人の数より質を意識する。少人数でも「この人には本音を言える」という関係を持つことが、あなたの精神的基盤になる。",
  });

  // Work
  impacts.push({
    name: "仕事での影響",
    context: "work",
    contextLabel: "仕事",
    positiveImpact: bold > 0.3
      ? "大胆な意思決定で組織を前に進める力がある。リスクを取れることが信頼に繋がる。"
      : (axisScores.analytical_vs_intuitive ?? 0) < -0.3
        ? "論理的な分析力で、チームに安心感と方向性を与えている。"
        : "バランスの取れた判断力で、どんな局面でも安定したパフォーマンスを発揮する。",
    riskImpact: (axisScores.perfectionist_vs_pragmatic ?? 0) < -0.3
      ? "完璧主義が周囲にプレッシャーを与えることがある。あなたの基準が他の人には高すぎることがある。"
      : bold > 0.3
        ? "大胆すぎる判断が周囲の不安を生むことがある。「もう少し慎重に」と思われていることも。"
        : "特に目立った問題はないが、「もっと自分を出してもいいのに」と周囲は感じている。",
    otherPerspective: regulation > 0.3
      ? "「頼れる人」として見られている。でも「もっと人間味を見せてほしい」と思われていることもある。"
      : "「情熱的な人」として見られている。エネルギーが伝染する一方で、温度差が生じることもある。",
    deepeningHint: "仕事の関係でも、時には個人的な感情や考えを少し見せる。プロフェッショナルさと人間性は両立できる。",
  });

  return impacts;
}

/**
 * 軸スコアから関係性インパクトを分析する
 */
export function analyzeRelationalImpact(
  axisScores: Partial<Record<TraitAxisKey, number>>,
): RelationalImpactResult | null {
  const entries = Object.entries(axisScores) as [TraitAxisKey, number][];
  if (entries.length < 5) return null;

  const communication = inferSatirStance(axisScores);
  const gottmanRisk = inferGottmanRisk(axisScores);
  const impacts = generateRelationalImpacts(axisScores);

  // First impression vs deep impression
  const introvert = axisScores.introvert_vs_extrovert ?? 0;
  const direct = axisScores.direct_vs_diplomatic ?? 0;
  const publicPrivate = axisScores.public_private_gap ?? 0;

  const firstImpression = introvert > 0.3
    ? "明るく社交的。エネルギーがあり、話しやすい人。"
    : introvert < -0.3
      ? "静かで落ち着いている。控えめだが、存在感がある。"
      : direct < -0.2
        ? "率直で正直。最初から本音で話してくれる人。"
        : direct > 0.2
          ? "丁寧で配慮がある。安心して話せる雰囲気を持っている。"
          : "バランスが取れていて、自然体。特別な圧もなく、居心地がいい。";

  const deepImpression = publicPrivate > 0.3
    ? "最初の印象と、深く知った後の印象が違う。「こんな一面があったんだ」と驚かれる。表と裏のギャップ自体が魅力になっている。"
    : "最初の印象がそのまま本質に近い。「思った通りの人だった」と言われる。一貫性が信頼につながっている。";

  const summary = `あなたのコミュニケーションスタイルは「${communication.stanceLabel}」。${communication.stanceDescription.split("。")[0]}。関係性の中で、あなたは相手に安心感と同時にチャレンジも与えている。`;

  return {
    impacts,
    communication,
    summary,
    firstImpression,
    deepImpression,
    gottmanRisk,
  };
}
