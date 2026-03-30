// lib/origin/v7/formationDigest.ts
// 形成史ダイジェスト — ユーザーの探索データを物語的に要約

import type { OriginV7Save, LifePeriod } from "./types";
import { deriveFormationChains, type FormationChain } from "./formationReader";
import { deriveBehavioralLaws } from "./behavioralLaws";
import { analyzeExplorationProfile } from "./aiCompanion";
import { getPeriodLabel } from "./periods";
import { ATMOSPHERE_CARDS } from "./atmosphereData";

export type DigestCard = {
  id: string;
  emoji: string;
  title: string;
  body: string;
  /** カードの種別 */
  type: "stat" | "pattern" | "insight" | "question" | "summary";
  /** アクセントカラー (CSS) */
  accent: string;
};

export type FormationDigest = {
  /** ダイジェストカード群（順序がストーリー順） */
  cards: DigestCard[];
  /** ダイジェスト生成に必要な最低チャプター数を満たしているか */
  isReady: boolean;
};

function getAtmosphereLabel(id: string): string {
  return ATMOSPHERE_CARDS.find((a) => a.id === id)?.label ?? id;
}

/**
 * OriginV7Saveから形成史ダイジェストを生成
 * 最低5チャプターで生成開始、チャプター数に応じてカードが増える
 */
export function generateFormationDigest(save: OriginV7Save): FormationDigest {
  const chapters = save.chapters;
  if (chapters.length < 5) {
    return { cards: [], isReady: false };
  }

  const cards: DigestCard[] = [];
  const chains = deriveFormationChains(save);
  const laws = deriveBehavioralLaws(save);
  const profile = analyzeExplorationProfile(save);

  // ── 1. オープニング: 数字のインパクト
  const uniquePeriods = [...new Set(chapters.map((c) => c.fact.period))];
  const totalEchoes = [...new Set(chapters.flatMap((c) => c.echoes))];
  cards.push({
    id: "opening",
    emoji: "📊",
    title: "あなたの形成史",
    body: `${chapters.length}の記憶、${uniquePeriods.length}の時代、${totalEchoes.length}のエコー。`,
    type: "stat",
    accent: "#F59E0B",
  });

  // ── 2. 最も深く探索された時期
  if (profile.focusPeriod && profile.focusPeriod.count >= 2) {
    cards.push({
      id: "focus_period",
      emoji: "🔍",
      title: "最も多くを語った時期",
      body: `「${profile.focusPeriod.label}」に${profile.focusPeriod.count}つの記憶が集中しています。この時期はあなたにとって、特別な意味を持っているようです。`,
      type: "pattern",
      accent: "#8B5CF6",
    });
  }

  // ── 3. 雰囲気の通奏低音
  if (profile.atmosphereBias && profile.atmosphereBias.ratio >= 0.3) {
    const pct = Math.round(profile.atmosphereBias.ratio * 100);
    cards.push({
      id: "atmosphere_bias",
      emoji: "🌫️",
      title: "記憶の底流",
      body: `あなたの記憶の${pct}%は「${profile.atmosphereBias.label}」という空気感で覆われています。これはあなたの記憶を通る、ひとつの通奏低音です。`,
      type: "insight",
      accent: "#6366F1",
    });
  }

  // ── 4. エコーの反復（3回以上現れるエコー）
  const echoFreq: Record<string, number> = {};
  for (const ch of chapters) {
    for (const e of ch.echoes) {
      echoFreq[e] = (echoFreq[e] ?? 0) + 1;
    }
  }
  const topEchoes = Object.entries(echoFreq)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1]);
  if (topEchoes.length > 0) {
    const echoList = topEchoes.slice(0, 3).map(([e, c]) => `「${e}」(${c}回)`).join("、");
    cards.push({
      id: "recurring_echoes",
      emoji: "🌊",
      title: "繰り返し残るもの",
      body: `${echoList}。時代も出来事も違うのに、あなたの中に残り続けるもの。`,
      type: "pattern",
      accent: "#0EA5E9",
    });
  }

  // ── 5. 因果の線（Formation Chains）
  if (chains.length > 0) {
    const strongest = chains.sort((a, b) => b.confidence - a.confidence)[0];
    cards.push({
      id: "causal_chain",
      emoji: "🔮",
      title: "因果の線",
      body: `「${strongest.source}」から「${strongest.remains}」へ。${getPeriodLabel(strongest.sourcePeriod)}の経験が、今のあなたに残しているもの。`,
      type: "insight",
      accent: "#7C3AED",
    });
  }

  // ── 6. 矛盾の発見
  if (laws.contradictions.length > 0) {
    const c = laws.contradictions[0];
    cards.push({
      id: "contradiction",
      emoji: "⚡",
      title: "あなたの中の矛盾",
      body: `「${c.sideA}」と「${c.sideB}」。一見矛盾する二つの面が、あなたの中に同居しています。これは弱さではなく、人間としての奥行きです。`,
      type: "insight",
      accent: "#EC4899",
    });
  }

  // ── 7. 判断原理
  if (laws.decisionPrinciples.length > 0 && chapters.length >= 8) {
    const d = laws.decisionPrinciples[0];
    cards.push({
      id: "decision_principle",
      emoji: "🧭",
      title: "あなたの判断原理",
      body: `「${d.principle}」—— これがあなたの行動の底にある、ひとつの羅針盤のようです。`,
      type: "insight",
      accent: "#059669",
    });
  }

  // ── 8. 空白の問い
  if (profile.blindSpots.length > 0 && profile.blindSpots.length <= 5) {
    const spots = profile.blindSpots.slice(0, 3).join("、");
    cards.push({
      id: "blind_spots",
      emoji: "🕳️",
      title: "まだ語られていない時期",
      body: `${spots}。この空白は何を意味しているのか——忘れたのか、避けているのか、それともまだ準備ができていないのか。`,
      type: "question",
      accent: "#64748B",
    });
  }

  // ── 9. 探索の深さ
  cards.push({
    id: "depth_summary",
    emoji: profile.depthTendency === "deep" ? "💎" : profile.depthTendency === "balanced" ? "🔸" : "🌱",
    title: "探索のスタイル",
    body: profile.depthTendency === "deep"
      ? "あなたは表面で満足しない探索者です。記憶の裏側まで見ようとする姿勢が、深い自己理解を生んでいます。"
      : profile.depthTendency === "balanced"
        ? "広さと深さのバランスが取れた探索です。さらに特定の時期を深掘りすると、新たな発見があるかもしれません。"
        : "まだ広く浅い探索の段階です。興味のある時期をひとつ選んで深く掘ってみると、形成の糸口が見えてきます。",
    type: "summary",
    accent: "#F59E0B",
  });

  // ── 10. クロージング（10+チャプター時のみ）
  if (chapters.length >= 10) {
    const firstPeriod = getPeriodLabel(chapters[0].fact.period);
    const latestPeriod = getPeriodLabel(chapters[chapters.length - 1].fact.period);
    cards.push({
      id: "closing",
      emoji: "✨",
      title: "あなたの形成史は、続いている",
      body: `「${firstPeriod}」から始まり「${latestPeriod}」まで。${chapters.length}の断片が織りなすこの地図は、まだ完成していません。次の記憶が、新しい線を引きます。`,
      type: "summary",
      accent: "#6366F1",
    });
  }

  return { cards, isReady: true };
}
