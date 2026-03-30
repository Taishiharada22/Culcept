// lib/genome/narrativeEngine.ts
// アーキタイプ + ジャーニー統計 + 次元データからパーソナルナラティブを生成
// AIではなくテンプレートベース — 瞬時に、決定論的に

import type { GenomeCardData } from "./cardTypes";

export interface PersonalNarrative {
  /** メインストーリー: 1-2文のパーソナルな物語 */
  story: string;
  /** 最も際立つ特徴のヒーローステートメント */
  heroTrait: { label: string; description: string } | null;
  /** 時間的変化のナラティブ */
  temporalInsight: string | null;
  /** 希少性メッセージ */
  rarityMessage: string | null;
}

type RadarAxes = NonNullable<NonNullable<GenomeCardData["cardBack"]>["radarAxes"]>;

/**
 * GenomeCardData からパーソナルナラティブを生成
 */
export function generateNarrative(card: GenomeCardData): PersonalNarrative {
  const js = card.journeyStats;
  const radar = card.cardBack?.radarAxes;
  const archetype = card.archetypeLabel;

  return {
    story: buildStory(card),
    heroTrait: radar ? buildHeroTrait(radar) : null,
    temporalInsight: buildTemporalInsight(js),
    rarityMessage: buildRarityMessage(archetype, js),
  };
}

// ── メインストーリー ──
function buildStory(card: GenomeCardData): string {
  const js = card.journeyStats;
  const archetype = card.archetypeLabel;
  const radar = card.cardBack?.radarAxes;

  if (!js || js.totalObservations === 0) {
    return "ここに、あなたの物語が刻まれていく。最初の一歩は、自分に正直になること。";
  }

  // レーダーからの人間的な洞察
  const radarInsight = radar ? getRadarInsight(radar) : null;

  // 観測深度に応じてストーリーのトーンを変える
  if (js.totalObservations >= 50) {
    // 深い観測者
    return archetype && archetype !== "プロフィール観測中"
      ? `${js.totalObservations}回、自分と向き合った。その結果わかったのは「${archetype}」という名前ではなく、${radarInsight ?? "自分が思っていたより複雑な人間だということ"}。`
      : `${js.totalObservations}回の問いを経て、ようやく見えてきた——${radarInsight ?? "自分という人間の輪郭"}。`;
  }

  if (js.totalObservations >= 15) {
    return archetype && archetype !== "プロフィール観測中"
      ? `「${archetype}」——その名前を聞いたとき、少しだけ心当たりがあったはず。${radarInsight ?? ""}`.trim()
      : `${js.totalObservations}回の観測が、あなたの輪郭を描き始めている。${radarInsight ?? ""}`.trim();
  }

  // 初期段階
  return archetype && archetype !== "プロフィール観測中"
    ? `まだ序章。でも「${archetype}」という手がかりは、もう掴んでいる。`
    : "まだ輪郭はぼやけている。でも、毎回の観測が少しずつピントを合わせていく。";
}

function getRadarInsight(radar: RadarAxes): string | null {
  const axes: { key: keyof RadarAxes; high: string; low: string; tension: string }[] = [
    { key: "analytical", high: "頭で理解しないと安心できない", low: "理屈より先に身体が動く", tension: "考えすぎて動けなくなることがある" },
    { key: "cautious", high: "石橋を叩いて渡る慎重さ", low: "崖から飛び降りてから考える大胆さ", tension: "慎重なのに、大事なときに限って衝動的になる" },
    { key: "social", high: "人がいないと充電できない", low: "ひとりの時間がないと壊れる", tension: "人が好きなのに、人に疲れる" },
    { key: "expressive", high: "自分の世界観を形にしたい欲", low: "飾らない本質だけを残したい欲", tension: "表現したいのに、表現することへの照れがある" },
    { key: "independent", high: "自分の道を行く覚悟", low: "みんなと一緒にいたい本音", tension: "自由を求めるくせに、孤独が怖い" },
  ];

  const sorted = axes
    .map((a) => ({ ...a, extremity: Math.abs(radar[a.key] - 50), score: radar[a.key] }))
    .sort((a, b) => b.extremity - a.extremity);

  const top = sorted[0];
  if (top.extremity < 12) return null;

  // 最も強い特徴が両極端の場合、「矛盾」を指摘する（これが一番刺さる）
  const second = sorted[1];
  if (top.extremity > 20 && second.extremity > 15) {
    const topDesc = top.score > 50 ? top.high : top.low;
    const secondDesc = second.score > 50 ? second.high : second.low;
    return `${topDesc}と${secondDesc}が同居している`;
  }

  // 単一の強い特徴
  return top.score > 50 ? top.high : top.low;
}

// ── ヒーロートレイト ──
function buildHeroTrait(radar: RadarAxes): { label: string; description: string } | null {
  const traits: { key: keyof RadarAxes; label: string; highDesc: string; lowDesc: string }[] = [
    { key: "analytical", label: "分析力", highDesc: "物事を構造的に捉え、本質を見抜く力がある", lowDesc: "直感と感性で瞬時に判断できる力がある" },
    { key: "cautious", label: "慎重さ", highDesc: "リスクを見極め、確実な道を選ぶ力がある", lowDesc: "迷わず飛び込む行動力がある" },
    { key: "social", label: "社交性", highDesc: "人の中で輝き、繋がりから力を得る", lowDesc: "深い集中力で、ひとりの時間を価値に変える" },
    { key: "expressive", label: "表現力", highDesc: "自分の世界観を形にし、人を惹きつける", lowDesc: "余計なものを削ぎ落とし、本質だけを残す" },
    { key: "independent", label: "自律性", highDesc: "自分の信念に基づいて道を切り拓く", lowDesc: "チームの力を最大化できる調和力がある" },
  ];

  // 最も極端な特徴を見つける
  let maxExtremity = 0;
  let heroIdx = 0;
  traits.forEach((t, i) => {
    const ext = Math.abs(radar[t.key] - 50);
    if (ext > maxExtremity) { maxExtremity = ext; heroIdx = i; }
  });

  if (maxExtremity < 10) return null;

  const hero = traits[heroIdx];
  const isHigh = radar[hero.key] > 50;

  return {
    label: isHigh ? hero.label : `${hero.label}の裏側`,
    description: isHigh ? hero.highDesc : hero.lowDesc,
  };
}

// ── 時間的変化 ──
function buildTemporalInsight(
  js: GenomeCardData["journeyStats"],
): string | null {
  if (!js || js.totalObservations < 5) return null;

  if (js.stability >= 80) {
    return "何度聞いても答えが変わらない。それは頑固なのではなく、あなたがもう自分を知っているということ。";
  }
  if (js.stability >= 60) {
    return "核心は固まってきた。でもまだ揺れている部分がある——そこに、あなたの「次の自分」がいる。";
  }
  if (js.stability >= 40) {
    return "まだ変わり続けている。それは弱さじゃない。自分に正直でいるから揺れるんだと思う。";
  }
  return "毎回、違う自分が出てくる。でもそれこそが、あなたが一言では説明できない人間だという証拠。";
}

// ── 希少性 ──
function buildRarityMessage(
  archetype: string | null,
  js: GenomeCardData["journeyStats"],
): string | null {
  if (!archetype || archetype === "プロフィール観測中") return null;

  // 27タイプ均等分布を仮定: 各タイプ約3.7%
  // カードレベルとの組み合わせで希少性を演出
  const level = js?.cardLevel ?? 1;

  if (level >= 4) {
    return `27タイプ中「${archetype}」× Lv.4到達者は極めて希少`;
  }
  if (level >= 3) {
    return `27タイプのうち「${archetype}」の深層到達者`;
  }
  return `27タイプのうちのひとつ「${archetype}」`;
}
