// lib/origin/v7/aiCompanion.ts
// 動的AIコンパニオン — API呼び出しなし、OriginV7Saveの実データから知的に生成

import type { OriginV7Save, LifePeriod, MemoryChapter } from "./types";
import { deriveFormationChains, type FormationChain } from "./formationReader";
import { deriveBehavioralLaws, type BehavioralLawsResult } from "./behavioralLaws";
import { getPeriodLabel } from "./periods";
import { ATMOSPHERE_CARDS } from "./atmosphereData";

export type CompanionMessage = {
  emoji: string;
  text: string;
  /** メッセージの知的深度 (1=浅い, 3=深い) */
  depth: 1 | 2 | 3;
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ヘルパー
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function getAtmosphereLabel(id: string): string {
  return ATMOSPHERE_CARDS.find((a) => a.id === id)?.label ?? id;
}

/** 最も頻出する雰囲気を特定 */
function dominantAtmosphere(chapters: MemoryChapter[]): { id: string; label: string; count: number } | null {
  if (chapters.length === 0) return null;
  const freq: Record<string, number> = {};
  for (const ch of chapters) {
    const a = ch.mood.atmosphere;
    freq[a] = (freq[a] ?? 0) + 1;
  }
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  if (!sorted[0]) return null;
  return { id: sorted[0][0], label: getAtmosphereLabel(sorted[0][0]), count: sorted[0][1] };
}

/** 探索されていない時期を特定 */
function unexploredPeriods(chapters: MemoryChapter[]): LifePeriod[] {
  const explored = new Set(chapters.map((c) => c.fact.period));
  const allPeriods: LifePeriod[] = [
    "early_childhood", "elementary", "middle_school", "high_school",
    "late_teens", "early_twenties", "mid_twenties", "thirties", "forties_plus",
  ];
  return allPeriods.filter((p) => !explored.has(p));
}

/** 時間的に連続するチャプターのギャップを検出 */
function findTimeGap(chapters: MemoryChapter[]): { before: string; after: string } | null {
  const periodOrder: LifePeriod[] = [
    "early_childhood", "elementary", "middle_school", "high_school",
    "late_teens", "early_twenties", "mid_twenties", "thirties", "forties_plus",
  ];
  const explored = [...new Set(chapters.map((c) => c.fact.period))];
  const indices = explored.map((p) => periodOrder.indexOf(p)).filter((i) => i >= 0).sort((a, b) => a - b);

  for (let i = 0; i < indices.length - 1; i++) {
    if (indices[i + 1] - indices[i] > 1) {
      return {
        before: getPeriodLabel(periodOrder[indices[i]]),
        after: getPeriodLabel(periodOrder[indices[i + 1]]),
      };
    }
  }
  return null;
}

/** 日付シードによる擬似ランダム (0-1) — 1日同じ値 */
function dailySeed(): number {
  const d = new Date();
  const key = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return ((key * 2654435761) >>> 0) / 4294967296;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   チャプター完了時のオブザベーション（動的）
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function generateObservation(save: OriginV7Save): CompanionMessage | null {
  const chapters = save.chapters;
  const n = chapters.length;
  if (n === 0) return null;

  const chains = deriveFormationChains(save);
  const latest = chapters[n - 1];
  const latestPeriod = getPeriodLabel(latest.fact.period);

  // ── 1. クロスピリオドの因果接続を検出（最も知的な発言）
  if (n >= 3 && chains.length > 0) {
    const crossChain = chains.find(
      (c) => c.sourcePeriod !== latest.fact.period && c.confidence >= 0.3,
    );
    if (crossChain) {
      return {
        emoji: "🔮",
        text: `「${getPeriodLabel(crossChain.sourcePeriod)}」と「${latestPeriod}」——時期は違うのに、「${crossChain.remains}」という共通の残留が見えます。これは偶然でしょうか、それとも…`,
        depth: 3,
      };
    }
  }

  // ── 2. 雰囲気の反復パターンを検出
  const domAtmo = dominantAtmosphere(chapters);
  if (domAtmo && domAtmo.count >= 3 && latest.mood.atmosphere === domAtmo.id) {
    return {
      emoji: "🌫️",
      text: `また「${domAtmo.label}」という空気感が選ばれました。${domAtmo.count}つの記憶が同じ雰囲気を持っている。あなたの記憶の底流には、この感覚がずっと流れているのかもしれません。`,
      depth: 3,
    };
  }

  // ── 3. エコーの反復を検出
  if (n >= 2) {
    const latestEchoes = new Set(latest.echoes);
    const echoFreq: Record<string, number> = {};
    for (const ch of chapters.slice(0, -1)) {
      for (const e of ch.echoes) {
        if (latestEchoes.has(e)) {
          echoFreq[e] = (echoFreq[e] ?? 0) + 1;
        }
      }
    }
    const repeatedEcho = Object.entries(echoFreq).sort((a, b) => b[1] - a[1])[0];
    if (repeatedEcho && repeatedEcho[1] >= 2) {
      return {
        emoji: "🌊",
        text: `「${repeatedEcho[0]}」—— このエコーは${repeatedEcho[1] + 1}つの記憶に横断して現れています。表面的には別々の出来事なのに、残るものが同じ。ここにあなたの深層構造があるかもしれません。`,
        depth: 3,
      };
    }
  }

  // ── 4. 同時期の複数チャプター（多面的探索の認識）
  const samePeriodCount = chapters.filter((c) => c.fact.period === latest.fact.period).length;
  if (samePeriodCount >= 2) {
    return {
      emoji: "🔗",
      text: `「${latestPeriod}」を${samePeriodCount}つの角度から見ています。ひとつの時期に複数の記憶を持てるのは、その時期があなたにとって多層的な意味を持っている証拠です。`,
      depth: 2,
    };
  }

  // ── 5. 時間的ギャップの指摘
  const gap = findTimeGap(chapters);
  if (gap && n >= 4) {
    return {
      emoji: "🕳️",
      text: `「${gap.before}」と「${gap.after}」の間に、まだ光の当たっていない時期があります。空白もまた、語りたがっている記憶かもしれません。`,
      depth: 2,
    };
  }

  // ── 6. マイルストーンメッセージ（チャプター内容を参照）
  if ([3, 5, 10, 15, 20].includes(n)) {
    return generateMilestoneMessage(save, n, chains);
  }

  // ── 7. 毎回は出さない（2チャプターに1回程度）
  if (n % 2 === 0) {
    return {
      emoji: "💭",
      text: `${n}つ目の記憶。「${latest.title}」—— このタイトルをつけたこと自体が、あなたの解釈を映しています。`,
      depth: 1,
    };
  }

  return null;
}

/** マイルストーン到達時のメッセージ（動的） */
function generateMilestoneMessage(
  save: OriginV7Save,
  n: number,
  chains: FormationChain[],
): CompanionMessage {
  const unexplored = unexploredPeriods(save.chapters);
  const domAtmo = dominantAtmosphere(save.chapters);

  if (n === 3) {
    const periods = [...new Set(save.chapters.map((c) => getPeriodLabel(c.fact.period)))];
    return {
      emoji: "🌱",
      text: `3つの記憶が集まりました。${periods.join("・")}—— まだ点ですが、線になりかけています。`,
      depth: 1,
    };
  }
  if (n === 5) {
    if (domAtmo) {
      return {
        emoji: "🔮",
        text: `5つの記憶。「${domAtmo.label}」という感覚が${domAtmo.count}回現れています。あなたの記憶には、この空気感が繰り返し刻まれているようです。`,
        depth: 2,
      };
    }
    return { emoji: "🔮", text: "5つの記憶。繰り返すテーマが見えてきました。", depth: 1 };
  }
  if (n === 10) {
    if (chains.length > 0) {
      const c = chains[0];
      return {
        emoji: "🌌",
        text: `10の記憶が織りなす地図。「${c.source}」から「${c.remains}」への因果の線が浮かび上がっています。あなたの形成史に物語が見え始めました。`,
        depth: 3,
      };
    }
    return { emoji: "🌌", text: "10の記憶。あなたの形成史に物語が浮かんでいます。", depth: 2 };
  }
  if (n === 15) {
    if (unexplored.length > 0 && unexplored.length <= 4) {
      const names = unexplored.slice(0, 2).map(getPeriodLabel).join("と");
      return {
        emoji: "✨",
        text: `15の断片。まだ「${names}」には光が当たっていません。そこに何があるのか——あるいは、なぜ避けているのか。それ自体がヒントかもしれません。`,
        depth: 3,
      };
    }
    return { emoji: "✨", text: "15の断片。矛盾が見え始めるのは、深さの証です。", depth: 2 };
  }
  // n === 20
  return {
    emoji: "💎",
    text: `20の記憶。${chains.length}本の因果の線。あなたの形成史は「存在の地図」と呼べる段階に入りました。`,
    depth: 3,
  };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   探索ステップ中のコンテキストコメント（チャプター参照型）
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function generateContextComment(
  step: string,
  save: OriginV7Save,
  selectedValue?: string,
): CompanionMessage | null {
  // 70%でスキップ（前より抑制を強化）
  if (dailySeed() + Math.random() < 1.4) return null;

  const chapters = save.chapters;

  // ── ステップ + 過去データに基づく動的コメント
  if (step === "period_selection" && selectedValue && chapters.length > 0) {
    const samePeriod = chapters.filter((c) => c.fact.period === selectedValue);
    if (samePeriod.length > 0) {
      return {
        emoji: "🔄",
        text: `この時期は以前も探索しましたね。同じ時期を別の角度から見ると、新しい発見があるかもしれません。`,
        depth: 2,
      };
    }
  }

  if (step === "atmosphere" && selectedValue && chapters.length >= 2) {
    const sameAtmo = chapters.filter((c) => c.mood.atmosphere === selectedValue);
    if (sameAtmo.length >= 2) {
      const label = getAtmosphereLabel(selectedValue);
      return {
        emoji: "🌫️",
        text: `「${label}」をまた選びましたね。${sameAtmo.length + 1}回目です。あなたの記憶の多くが、この空気感で覆われているのは偶然ではないかもしれません。`,
        depth: 3,
      };
    }
  }

  if (step === "triggers" && chapters.length >= 3) {
    // 最頻出のトリガーカテゴリを指摘
    const allTriggers = chapters.flatMap((c) => c.fact.triggers);
    const freq: Record<string, number> = {};
    for (const t of allTriggers) freq[t] = (freq[t] ?? 0) + 1;
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 3) {
      return {
        emoji: "🔑",
        text: `あなたのトリガーには「${top[0]}」が繰り返し現れます。記憶を呼び起こすスイッチに一貫性がある——これはあなたの感覚の優先順位を映しています。`,
        depth: 3,
      };
    }
  }

  // ── ステップ固有のフォールバック
  const fallbacks: Record<string, CompanionMessage[]> = {
    period_selection: [
      { emoji: "💭", text: "その時期を選んだこと自体が、今のあなたを映しています。", depth: 1 },
    ],
    atmosphere: [
      { emoji: "🌫️", text: "雰囲気の記憶は、事実の記憶よりも正直なことがあります。", depth: 1 },
    ],
    perspective: [
      { emoji: "🪞", text: "あなたが選んだ視点は、あなたの「見え方のクセ」を教えてくれます。", depth: 1 },
    ],
    comparison: [
      { emoji: "💡", text: "何と比べるかで、あなたが本当に求めているものが見えてきます。", depth: 1 },
    ],
    triggers: [
      { emoji: "⚡", text: "きっかけの裏には、もっと深い理由があるかもしれません。", depth: 1 },
    ],
    ai_recovery: [
      { emoji: "🤔", text: "AIの解釈は完璧ではありません。あなたの感覚の方が正しいです。", depth: 1 },
    ],
    correction: [
      { emoji: "✏️", text: "修正は大歓迎です。あなたの言葉こそが真実です。", depth: 1 },
    ],
  };

  const pool = fallbacks[step];
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   過去チャプター参照コメント（強化版）
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function generateMemoryReference(save: OriginV7Save): CompanionMessage | null {
  const chapters = save.chapters;
  if (chapters.length < 2) return null;

  const latest = chapters[chapters.length - 1];
  const earlier = chapters.slice(0, -1);

  // 1. 矛盾する雰囲気を検出
  const opposite: Record<string, string> = {
    quiet: "hot", hot: "quiet",
    protected: "lonely", lonely: "protected",
    free: "suffocating", suffocating: "free",
    expanding: "heavy", heavy: "expanding",
    warm: "tense", tense: "warm",
  };
  const latestAtmo = latest.mood.atmosphere;
  const oppositeAtmo = opposite[latestAtmo];
  if (oppositeAtmo) {
    const contradicting = earlier.find(
      (c) => c.mood.atmosphere === oppositeAtmo && c.fact.period === latest.fact.period,
    );
    if (contradicting) {
      return {
        emoji: "⚡",
        text: `同じ「${getPeriodLabel(latest.fact.period)}」なのに、「${getAtmosphereLabel(latestAtmo)}」と「${getAtmosphereLabel(oppositeAtmo)}」—— 正反対の空気感。この矛盾こそが、あなたのその時期の複雑さを物語っています。`,
        depth: 3,
      };
    }
  }

  // 2. 同じperiodの別チャプター
  const samePeriod = earlier.find((c) => c.fact.period === latest.fact.period);
  if (samePeriod) {
    return {
      emoji: "🔗",
      text: `以前も「${getPeriodLabel(latest.fact.period)}」について「${samePeriod.title}」として語っていましたね。今回は「${latest.title}」。同じ時期の異なる断面です。`,
      depth: 2,
    };
  }

  // 3. エコーの重複
  const latestEchoes = new Set(latest.echoes);
  for (const ch of earlier) {
    const overlap = ch.echoes.filter((e) => latestEchoes.has(e));
    if (overlap.length > 0) {
      return {
        emoji: "🌊",
        text: `「${overlap[0]}」が「${ch.title}」にも現れていました。時期も出来事も違うのに、残るものが同じ——ここにあなたの通奏低音があります。`,
        depth: 3,
      };
    }
  }

  return null;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   行動法則に基づく深い観察
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function generateBehavioralInsight(save: OriginV7Save): CompanionMessage | null {
  if (save.chapters.length < 5) return null;

  const laws = deriveBehavioralLaws(save);

  // 矛盾の指摘（最も知的なコメント）
  if (laws.contradictions.length > 0) {
    const c = laws.contradictions[0];
    return {
      emoji: "🪞",
      text: `あなたの中に「${c.sideA}」と「${c.sideB}」が同時に存在しているのが見えます。これは矛盾ではなく、あなたという人間の奥行きです。`,
      depth: 3,
    };
  }

  // 反復パターンの指摘
  if (laws.repeatingPatterns.length > 0) {
    const p = laws.repeatingPatterns[0];
    const periods = p.appearances.map((a) => getPeriodLabel(a.period));
    return {
      emoji: "🔄",
      text: `「${p.pattern}」というパターンが${periods.join("・")}に繰り返し現れています。この反復は、あなたが無意識に選んでいる「生きる形」かもしれません。`,
      depth: 3,
    };
  }

  // 判断原理の指摘
  if (laws.decisionPrinciples.length > 0) {
    const d = laws.decisionPrinciples[0];
    return {
      emoji: "🧭",
      text: `あなたの判断の底にある原理のひとつ：「${d.principle}」。これはあなたが意識的に選んだのか、それとも形成されたものか——興味深い問いです。`,
      depth: 3,
    };
  }

  // 崩壊条件の指摘
  if (laws.collapseConditions.length > 0) {
    const c = laws.collapseConditions[0];
    return {
      emoji: "⚠️",
      text: `「${c.trigger}」の時に「${c.mechanism}」となるパターンが見えます。これを知っているだけで、次にその状況が来た時の対処が変わるかもしれません。`,
      depth: 3,
    };
  }

  return null;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ワークスペース訪問時のウェルカムメッセージ（動的挨拶）
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function generateDailyGreeting(save: OriginV7Save): string {
  const streak = save.microQuestionStreak?.currentStreak ?? 0;
  const totalAnswers = (save.microQuestionAnswers ?? []).length;
  const chapters = save.chapters;
  const hour = new Date().getHours();

  const timeGreeting = hour < 12 ? "おはようございます" : hour < 18 ? "こんにちは" : "おつかれさまです";

  // ストリーク言及
  if (streak >= 30) {
    return `${timeGreeting}。${streak}日連続。あなたの観察の習慣は、もはや日常の一部になっていますね。`;
  }
  if (streak >= 14) {
    return `${timeGreeting}。${streak}日目の観察です。続けることで、変化のパターンが見えてきます。`;
  }
  if (streak >= 7) {
    return `${timeGreeting}。1週間以上、毎日向き合っていますね。`;
  }
  if (streak >= 3) {
    return `${timeGreeting}。${streak}日連続です。小さな積み重ねが、深い理解を生みます。`;
  }

  // チャプター内容に基づく動的挨拶
  if (chapters.length > 0) {
    const latest = chapters[chapters.length - 1];
    const daysSinceLastChapter = Math.floor(
      (Date.now() - new Date(latest.createdAt).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysSinceLastChapter === 0) {
      return `${timeGreeting}。さきほどの「${latest.title}」、まだ余韻が残っているかもしれませんね。`;
    }
    if (daysSinceLastChapter <= 2) {
      return `${timeGreeting}。「${latest.title}」の記憶はまだ温かいうちに、次の断片を。`;
    }
    if (daysSinceLastChapter >= 7 && chapters.length >= 3) {
      const gap = findTimeGap(chapters);
      if (gap) {
        return `${timeGreeting}。「${gap.before}」と「${gap.after}」の間、まだ語られていない時期がありますね。`;
      }
    }
  }

  // 総回答数ベース
  if (totalAnswers > 20) {
    return `${timeGreeting}。今日もあなたの記憶に、新しい光を当ててみましょう。`;
  }
  if (totalAnswers > 5) {
    return `${timeGreeting}。今日の問いが、思いがけない発見に繋がるかもしれません。`;
  }

  return `${timeGreeting}。今日の記憶を、ひとつ刻みませんか。`;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   探索パターン分析（ユーザーの行動傾向を読む）
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type ExplorationProfile = {
  /** 最も探索されている時期 */
  focusPeriod: { period: string; label: string; count: number } | null;
  /** 探索されていない時期 */
  blindSpots: string[];
  /** 雰囲気の偏り */
  atmosphereBias: { label: string; ratio: number } | null;
  /** 探索の深さ傾向 */
  depthTendency: "shallow" | "balanced" | "deep";
  /** 観察からの推測 */
  inference: string;
};

export function analyzeExplorationProfile(save: OriginV7Save): ExplorationProfile {
  const chapters = save.chapters;

  // 最頻出時期
  const periodFreq: Record<string, number> = {};
  for (const ch of chapters) {
    periodFreq[ch.fact.period] = (periodFreq[ch.fact.period] ?? 0) + 1;
  }
  const topPeriod = Object.entries(periodFreq).sort((a, b) => b[1] - a[1])[0];
  const focusPeriod = topPeriod
    ? { period: topPeriod[0], label: getPeriodLabel(topPeriod[0]), count: topPeriod[1] }
    : null;

  // 未探索
  const blindSpots = unexploredPeriods(chapters).map(getPeriodLabel);

  // 雰囲気バイアス
  const domAtmo = dominantAtmosphere(chapters);
  const atmosphereBias = domAtmo && chapters.length >= 3
    ? { label: domAtmo.label, ratio: domAtmo.count / chapters.length }
    : null;

  // 深さ傾向（revisitCount, deep exploration の有無）
  const avgRevisit = chapters.length > 0
    ? chapters.reduce((sum, c) => sum + c.revisitCount, 0) / chapters.length
    : 0;
  const hasDeep = chapters.some((c) => c.parentChapterId);
  const depthTendency: ExplorationProfile["depthTendency"] =
    hasDeep || avgRevisit >= 1 ? "deep" : avgRevisit >= 0.3 ? "balanced" : "shallow";

  // 推測文
  let inference = "";
  if (focusPeriod && focusPeriod.count >= 3) {
    inference = `「${focusPeriod.label}」に強い関心がある。この時期に未解決の問いがあるのかもしれない。`;
  } else if (blindSpots.length >= 5 && chapters.length >= 3) {
    inference = `探索範囲が限定的。特定の時期に集中している一方、多くの時期がまだ暗闇の中。`;
  } else if (atmosphereBias && atmosphereBias.ratio >= 0.5) {
    inference = `記憶の${Math.round(atmosphereBias.ratio * 100)}%が「${atmosphereBias.label}」。感覚記憶に強い一貫性がある。`;
  } else if (depthTendency === "deep") {
    inference = `深く掘る傾向がある。表面で満足せず、記憶の裏側まで見ようとしている。`;
  } else {
    inference = `まだ探索の初期段階。量が増えることで、パターンが浮かび上がってきます。`;
  }

  return { focusPeriod, blindSpots, atmosphereBias, depthTendency, inference };
}
