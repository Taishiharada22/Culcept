/**
 * Graduation Ceremony Engine
 * 関係が美しい結論に達したとき、旅路を祝福するデジタルセレモニーを構築する。
 * 二人の物語・星座の進化・旅の統計・共有カードを生成。
 */

import type { RendezvousCategory, RendezvousCandidate } from "./types";

// ============================================================
// Types
// ============================================================

export type GraduationData = {
  /** 二人の物語 */
  story: GraduationStory;
  /** 関係性の星座 (最終形) */
  constellation: ConstellationSnapshot;
  /** 旅の統計 */
  journeyStats: JourneyStats;
  /** 共有可能なカード画像データ */
  shareCard: ShareCardData;
};

export type GraduationStory = {
  /** 出会いの章 */
  encounterChapter: {
    date: string;
    triggerNarrative: string;
    initialSyncPercent: number;
  };
  /** 成長の章 */
  growthChapter: {
    keyMilestones: { date: string; milestone: string; emoji: string }[];
    seasonsTraversed: { season: string; duration: string }[];
    totalMessages: number;
    sharedActivities: number;
  };
  /** 変化の章 */
  transformationChapter: {
    /** あなたがこの関係で成長した軸 */
    grownAxes: { axis: string; label: string; before: number; after: number }[];
    /** 二人の関係性の進化 */
    relationshipEvolution: string;
  };
  /** 未来の章 */
  futureChapter: {
    blessing: string;
    sharedMemoryCount: number;
  };
};

export type ConstellationSnapshot = {
  /** 最初の星座データ */
  initial: { axes: Record<string, number>; syncPercent: number };
  /** 最終の星座データ */
  final: { axes: Record<string, number>; syncPercent: number };
};

export type JourneyStats = {
  daysConnected: number;
  totalMessages: number;
  totalActivities: number;
  milestoneCount: number;
  syncEvolution: number[];
  seasonCycles: number;
  peakSyncPercent: number;
};

export type ShareCardData = {
  title: string;
  subtitle: string;
  daysConnected: number;
  finalSyncPercent: number;
  gradientColors: [string, string];
  constellationPoints: { x: number; y: number; label: string }[];
};

// ============================================================
// Constants
// ============================================================

const CATEGORY_BLESSINGS: Record<RendezvousCategory, string> = {
  romantic: "二つの心が見つけ合った奇跡を、これからも大切に",
  friendship: "互いの存在が、互いの光であり続けますように",
  cocreation: "共に紡いだ創造の種が、世界に花を咲かせますように",
  community: "この輪がさらに広がり、新しい共鳴を生みますように",
  partner: "人生を共に歩む二人の航路に、穏やかな光がありますように",
};

const CATEGORY_SUBTITLES: Record<RendezvousCategory, string> = {
  romantic: "恋の星が紡いだ物語",
  friendship: "友情の光が照らした道",
  cocreation: "共創の火が灯した世界",
  community: "共鳴の輪が広がった記録",
  partner: "共に歩む道が重なった記録",
};

const CATEGORY_GRADIENTS: Record<RendezvousCategory, [string, string]> = {
  romantic: ["#EC4899", "#F59E0B"],
  friendship: ["#6366F1", "#06B6D4"],
  cocreation: ["#F59E0B", "#EF4444"],
  community: ["#8B5CF6", "#EC4899"],
  partner: ["#D4776B", "#F59E0B"],
};

const AXIS_LABELS: Record<string, string> = {
  conversation_temperature: "会話の温度",
  distance_need: "距離感",
  depth_speed: "深さの速度",
  stability_need: "安定への欲求",
  stimulation_need: "刺激への欲求",
  initiative: "主体性",
  emotional_openness: "感情の開放度",
  conflict_directness: "衝突への直接性",
  social_energy: "社交エネルギー",
  structure_preference: "構造への好み",
};

const SEASON_LABELS: Record<string, string> = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
};

// ============================================================
// Build graduation data from relationship history
// ============================================================

export function buildGraduationData(
  candidate: RendezvousCandidate,
  milestones: { type: string; reachedAt: string }[],
  messageCount: number,
  activityCount: number,
  seasonHistory: { season: string; startedAt: string; endedAt: string | null }[],
  vectorSnapshots: { vector: Record<string, number>; timestamp: string }[],
  category: RendezvousCategory,
): GraduationData {
  const createdAt = candidate.created_at;
  const now = new Date();
  const createdDate = new Date(createdAt);
  const daysConnected = Math.max(
    1,
    Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)),
  );

  // --- Constellation ---
  const initialSnapshot = vectorSnapshots.length > 0 ? vectorSnapshots[0] : null;
  const finalSnapshot =
    vectorSnapshots.length > 1
      ? vectorSnapshots[vectorSnapshots.length - 1]
      : initialSnapshot;

  const initialAxes: Record<string, number> = initialSnapshot?.vector ?? {};
  const finalAxes: Record<string, number> = finalSnapshot?.vector ?? {};

  const initialSyncPercent = Math.round(candidate.overall_score * 100);
  const finalSyncPercent = computeFinalSync(initialAxes, finalAxes, initialSyncPercent);

  const constellation: ConstellationSnapshot = {
    initial: { axes: initialAxes, syncPercent: initialSyncPercent },
    final: { axes: finalAxes, syncPercent: finalSyncPercent },
  };

  // --- Milestones ---
  const keyMilestones = milestones.slice(0, 8).map((m) => ({
    date: m.reachedAt.slice(0, 10),
    milestone: milestoneLabel(m.type),
    emoji: milestoneEmoji(m.type),
  }));

  // --- Seasons ---
  const seasonsTraversed = seasonHistory.map((s) => ({
    season: SEASON_LABELS[s.season] ?? s.season,
    duration: computeSeasonDuration(s.startedAt, s.endedAt),
  }));

  // --- Growth axes ---
  const grownAxes = detectGrownAxes(initialAxes, finalAxes);

  // --- Sync evolution sparkline ---
  const syncEvolution = vectorSnapshots.map((snap) => {
    const avg =
      Object.values(snap.vector).reduce((a, b) => a + b, 0) /
      Math.max(1, Object.values(snap.vector).length);
    return Math.round(avg * 100);
  });
  if (syncEvolution.length === 0) {
    syncEvolution.push(initialSyncPercent);
  }

  const peakSyncPercent = Math.max(...syncEvolution, finalSyncPercent);

  // --- Story ---
  const story: GraduationStory = {
    encounterChapter: {
      date: createdAt.slice(0, 10),
      triggerNarrative: generateTriggerNarrative(category, createdAt),
      initialSyncPercent,
    },
    growthChapter: {
      keyMilestones,
      seasonsTraversed,
      totalMessages: messageCount,
      sharedActivities: activityCount,
    },
    transformationChapter: {
      grownAxes,
      relationshipEvolution: generateEvolutionNarrative(
        category,
        initialSyncPercent,
        finalSyncPercent,
        daysConnected,
      ),
    },
    futureChapter: {
      blessing: CATEGORY_BLESSINGS[category],
      sharedMemoryCount: milestones.length + activityCount,
    },
  };

  // --- Journey stats ---
  const journeyStats: JourneyStats = {
    daysConnected,
    totalMessages: messageCount,
    totalActivities: activityCount,
    milestoneCount: milestones.length,
    syncEvolution,
    seasonCycles: seasonsTraversed.length,
    peakSyncPercent,
  };

  // --- Share card ---
  const shareCard: ShareCardData = {
    title: "二つの星が出会った物語",
    subtitle: CATEGORY_SUBTITLES[category],
    daysConnected,
    finalSyncPercent,
    gradientColors: CATEGORY_GRADIENTS[category],
    constellationPoints: buildConstellationPoints(finalAxes),
  };

  return { story, constellation, journeyStats, shareCard };
}

// ============================================================
// Generate poetic story narration
// ============================================================

export function generateStoryNarration(
  data: GraduationData,
  category: RendezvousCategory,
): string[] {
  const { story, journeyStats } = data;
  const paragraphs: string[] = [];

  // 第一章: 出会い
  paragraphs.push(
    `${story.encounterChapter.date}——${story.encounterChapter.triggerNarrative}` +
      `初めて二つの星が互いの軌道を感知した瞬間、シンクロ率は${story.encounterChapter.initialSyncPercent}%でした。`,
  );

  // 第二章: 成長
  const milestoneText =
    story.growthChapter.keyMilestones.length > 0
      ? story.growthChapter.keyMilestones
          .map((m) => `${m.emoji} ${m.milestone}`)
          .join("、")
      : "静かに、しかし確かに";
  paragraphs.push(
    `${journeyStats.daysConnected}日間の旅路の中で、${milestoneText}——` +
      `${story.growthChapter.totalMessages}通のメッセージと${story.growthChapter.sharedActivities}回の共有体験が、二人の間に刻まれました。`,
  );

  // 季節
  if (story.growthChapter.seasonsTraversed.length > 0) {
    const seasonText = story.growthChapter.seasonsTraversed
      .map((s) => `${s.season}（${s.duration}）`)
      .join("→");
    paragraphs.push(`季節は移ろい、二人は${seasonText}を共に歩みました。`);
  }

  // 第三章: 変化
  if (story.transformationChapter.grownAxes.length > 0) {
    const axesText = story.transformationChapter.grownAxes
      .map(
        (a) =>
          `「${a.label}」が${Math.round(a.before * 100)}%から${Math.round(a.after * 100)}%へ`,
      )
      .join("、");
    paragraphs.push(
      `この関係を通じて、あなたの中で変化が生まれました。${axesText}。` +
        story.transformationChapter.relationshipEvolution,
    );
  }

  // 第四章: 未来
  const categoryClosings: Record<RendezvousCategory, string> = {
    romantic: "二人が紡いだ光は、これからも互いの夜空を照らし続けるでしょう。",
    friendship: "この友情が灯した光は、永遠に消えることはありません。",
    cocreation: "共に生み出したものは、二人を超えて世界に響き続けるでしょう。",
    community: "この共鳴が生んだ波紋は、さらに遠くまで届くでしょう。",
    partner: "共に歩むと決めた道が、二人の人生を温かく照らし続けるでしょう。",
  };

  paragraphs.push(
    `${story.futureChapter.sharedMemoryCount}の共有された記憶を胸に——` +
      categoryClosings[category],
  );

  paragraphs.push(story.futureChapter.blessing);

  return paragraphs;
}

// ============================================================
// Internal helpers
// ============================================================

function computeFinalSync(
  initial: Record<string, number>,
  final: Record<string, number>,
  fallback: number,
): number {
  const keys = Object.keys(final);
  if (keys.length === 0) return fallback;
  const avg = keys.reduce((sum, k) => sum + (final[k] ?? 0), 0) / keys.length;
  return Math.round(avg * 100);
}

function milestoneLabel(type: string): string {
  const labels: Record<string, string> = {
    first_message: "最初のメッセージ",
    first_activity: "初めての共有体験",
    deep_conversation: "深い対話",
    vulnerability_shared: "心を開いた瞬間",
    conflict_resolved: "衝突を乗り越えた",
    milestone_7days: "7日間の継続",
    milestone_30days: "30日間の継続",
    milestone_100days: "100日間の継続",
    sync_peak: "シンクロのピーク",
    growth_detected: "成長が検出された",
  };
  return labels[type] ?? type;
}

function milestoneEmoji(type: string): string {
  const emojis: Record<string, string> = {
    first_message: "\u2728",
    first_activity: "\u{1F91D}",
    deep_conversation: "\u{1F30A}",
    vulnerability_shared: "\u{1F49B}",
    conflict_resolved: "\u{1F308}",
    milestone_7days: "\u{1F319}",
    milestone_30days: "\u2B50",
    milestone_100days: "\u{1F31F}",
    sync_peak: "\u{1F4AB}",
    growth_detected: "\u{1F331}",
  };
  return emojis[type] ?? "\u2728";
}

function computeSeasonDuration(
  startedAt: string,
  endedAt: string | null,
): string {
  const start = new Date(startedAt);
  const end = endedAt ? new Date(endedAt) : new Date();
  const days = Math.max(
    1,
    Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
  );
  if (days < 7) return `${days}日`;
  if (days < 30) return `${Math.floor(days / 7)}週間`;
  return `${Math.floor(days / 30)}ヶ月`;
}

function detectGrownAxes(
  initial: Record<string, number>,
  final: Record<string, number>,
): { axis: string; label: string; before: number; after: number }[] {
  const axes: { axis: string; label: string; before: number; after: number }[] =
    [];
  for (const key of Object.keys(final)) {
    const before = initial[key] ?? 0.5;
    const after = final[key] ?? 0.5;
    const delta = Math.abs(after - before);
    if (delta >= 0.1) {
      axes.push({
        axis: key,
        label: AXIS_LABELS[key] ?? key,
        before,
        after,
      });
    }
  }
  // Sort by largest change
  axes.sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before));
  return axes.slice(0, 5);
}

function generateTriggerNarrative(
  category: RendezvousCategory,
  createdAt: string,
): string {
  const date = new Date(createdAt);
  const month = date.getMonth() + 1;
  const seasonWord =
    month >= 3 && month <= 5
      ? "春の風が運んだ"
      : month >= 6 && month <= 8
        ? "夏の光が導いた"
        : month >= 9 && month <= 11
          ? "秋の静けさが引き寄せた"
          : "冬の星空が繋いだ";

  const categoryNarrative: Record<RendezvousCategory, string> = {
    romantic: `${seasonWord}偶然の出会い。`,
    friendship: `${seasonWord}共鳴の瞬間。`,
    cocreation: `${seasonWord}創造の火花。`,
    community: `${seasonWord}輪の始まり。`,
    partner: `${seasonWord}運命の邂逅。`,
  };
  return categoryNarrative[category];
}

function generateEvolutionNarrative(
  category: RendezvousCategory,
  initialSync: number,
  finalSync: number,
  days: number,
): string {
  const delta = finalSync - initialSync;
  if (delta > 15) {
    return `${days}日の間に、二人の共鳴は大きく深まりました。`;
  }
  if (delta > 5) {
    return `着実に、互いの理解が深まっていきました。`;
  }
  if (delta > -5) {
    return `安定した共鳴を保ちながら、二人は共に歩みました。`;
  }
  return `変化の波を経て、二人は新しい形を見つけました。`;
}

function buildConstellationPoints(
  axes: Record<string, number>,
): { x: number; y: number; label: string }[] {
  const keys = Object.keys(axes);
  if (keys.length === 0) return [];

  const angleStep = (2 * Math.PI) / keys.length;
  return keys.map((key, i) => {
    const angle = angleStep * i - Math.PI / 2;
    const radius = (axes[key] ?? 0.5) * 40 + 10; // 10..50 range
    return {
      x: Math.round(50 + radius * Math.cos(angle)),
      y: Math.round(50 + radius * Math.sin(angle)),
      label: AXIS_LABELS[key] ?? key,
    };
  });
}
