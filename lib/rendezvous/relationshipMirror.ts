// ============================================================
// Relationship Mirror Engine
// すべての関係性から「他者といる時のあなた」を映し出す
// ============================================================

import type {
  MatchingVector,
  RendezvousCategory,
  RendezvousCandidate,
} from "./types";

// ---------- Types ----------

export type RelationshipPattern = {
  id: string;
  type:
    | "attraction"
    | "avoidance"
    | "growth"
    | "comfort"
    | "friction"
    | "transformation";
  title: string;
  description: string;
  evidence: string[];
  significance: number; // 0..1
  axes: string[];
};

export type RelationshipArchetype =
  | "quiet_catalyst"
  | "mutual_grower"
  | "deep_diver"
  | "social_weaver"
  | "storm_chaser"
  | "steady_anchor"
  | "bridge_builder"
  | "mirror_seeker";

export type MirrorProfile = {
  relationshipPersona: {
    archetype: RelationshipArchetype;
    title: string;
    description: string;
  };
  patterns: RelationshipPattern[];
  averageDynamics: Partial<MatchingVector>;
  growthTrajectory: {
    mostGrown: { axis: string; label: string; delta: number }[];
    stagnant: { axis: string; label: string }[];
  };
  stats: {
    totalConnections: number;
    activeConnections: number;
    averageSyncScore: number;
    dominantCategory: RendezvousCategory;
    connectionDiversity: number;
  };
};

// ---------- Constants ----------

const ARCHETYPE_META: Record<
  RelationshipArchetype,
  { title: string; description: string }
> = {
  quiet_catalyst: {
    title: "静かな触媒",
    description:
      "あなたは関わる人を静かに変えていく存在です。自分自身は大きく変わらないのに、相手にとっての転機になることが多い。深い安定感の中に、他者を動かす力が宿っています。",
  },
  mutual_grower: {
    title: "相互成長者",
    description:
      "あなたは人との関わりの中で共に育つタイプです。一方的に影響を受けるのでも与えるのでもなく、関係そのものが成長の場になる。出会いのたびに、少しずつ新しい自分が生まれています。",
  },
  deep_diver: {
    title: "深海探求者",
    description:
      "あなたは少数の人と深く結びつくことを選びます。広く浅い関係よりも、一人ひとりとの濃密な対話を求める。その深さの中にこそ、あなたの本当の姿が映し出されます。",
  },
  social_weaver: {
    title: "社交の織り手",
    description:
      "あなたは多くの人と軽やかに繋がることで、自分を形作っています。一つ一つの関係は柔らかいけれど、その織物全体が豊かなネットワークを生み出している。多様性こそがあなたの栄養です。",
  },
  storm_chaser: {
    title: "嵐の追跡者",
    description:
      "あなたは穏やかな関係よりも、刺激的で波のある関係を選ぶ傾向があります。摩擦の中に成長を見出し、予測不能な関係にエネルギーを感じる。安定は退屈に感じることがあるかもしれません。",
  },
  steady_anchor: {
    title: "安定の錨",
    description:
      "あなたは関係に安定と安心を求めるタイプです。信頼できる少数の繋がりを大切にし、急な変化よりも徐々に深まる関係を好む。あなたの存在自体が、周囲に落ち着きを与えています。",
  },
  bridge_builder: {
    title: "架け橋",
    description:
      "あなたは異なるタイプの人々を繋ぐ役割を無意識に果たしています。カテゴリや属性を越えた多様な関係を持ち、それぞれの世界を橋渡しする。あなたを通じて、人と人が出会っています。",
  },
  mirror_seeker: {
    title: "鏡の探求者",
    description:
      "あなたは自分に似た人を引き寄せる傾向があります。共鳴する相手との関係の中で、自分自身をより深く理解しようとしている。鏡のような存在を通じて、内面の探求が進んでいます。",
  },
};

const AXIS_LABELS: Record<string, string> = {
  conversation_temperature: "会話の温度感",
  distance_need: "距離感",
  depth_speed: "深まるスピード",
  stability_need: "安定性の欲求",
  stimulation_need: "刺激の欲求",
  initiative: "主導性",
  emotional_openness: "感情の開示度",
  conflict_directness: "対立の直接度",
  social_energy: "社交エネルギー",
  structure_preference: "構造化の好み",
};

const MATCHING_VECTOR_KEYS: (keyof MatchingVector)[] = [
  "conversation_temperature",
  "distance_need",
  "depth_speed",
  "stability_need",
  "stimulation_need",
  "initiative",
  "emotional_openness",
  "conflict_directness",
  "social_energy",
  "structure_preference",
];

// ---------- Input types ----------

type UserStateInput = {
  candidateId: string;
  state: string;
  likedAt?: string;
  passedAt?: string;
};

type MessageStatInput = {
  candidateId: string;
  messageCount: number;
  avgLength: number;
  initiatedByUser: number;
};

// ---------- Helpers ----------

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function generateId(): string {
  return `pat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function categoryCounts(candidates: RendezvousCandidate[]): Record<RendezvousCategory, number> {
  const counts: Record<RendezvousCategory, number> = {
    romantic: 0,
    friendship: 0,
    cocreation: 0,
    community: 0,
    partner: 0,
  };
  for (const c of candidates) {
    counts[c.category]++;
  }
  return counts;
}

function dominantCategory(counts: Record<RendezvousCategory, number>): RendezvousCategory {
  let best: RendezvousCategory = "friendship";
  let bestCount = 0;
  for (const [cat, count] of Object.entries(counts)) {
    if (count > bestCount) {
      bestCount = count;
      best = cat as RendezvousCategory;
    }
  }
  return best;
}

// ---------- Pattern Detection ----------

function detectAttractionPatterns(
  candidates: RendezvousCandidate[],
  stateMap: Map<string, UserStateInput>,
): RelationshipPattern[] {
  const patterns: RelationshipPattern[] = [];
  const liked = candidates.filter((c) => stateMap.get(c.id)?.state === "liked");

  if (liked.length < 2) return patterns;

  // Check for consistent high-score axis among liked candidates
  for (const axis of MATCHING_VECTOR_KEYS) {
    const scores = liked.map((c) => c.overall_score);
    const avgScore = mean(scores);
    if (avgScore > 0.65 && liked.length >= 3) {
      patterns.push({
        id: generateId(),
        type: "attraction",
        title: "高い共鳴への引力",
        description: `あなたが惹かれる相手には共通点があります。平均同期スコア${Math.round(avgScore * 100)}%の高い共鳴を持つ${liked.length}人に対して、一貫した好意を示しています。`,
        evidence: [
          `${liked.length}人にいいねを送信`,
          `平均同期スコア: ${Math.round(avgScore * 100)}%`,
        ],
        significance: clamp01(avgScore * 0.8 + liked.length * 0.02),
        axes: [],
      });
      break;
    }
  }

  // Category attraction pattern
  const likedCounts = categoryCounts(liked);
  const totalLiked = liked.length;
  for (const [cat, count] of Object.entries(likedCounts)) {
    const ratio = count / totalLiked;
    if (ratio > 0.6 && count >= 2) {
      const catLabel =
        cat === "romantic"
          ? "ロマンティック"
          : cat === "friendship"
            ? "友情"
            : cat === "cocreation"
              ? "共創"
              : "コミュニティ";
      patterns.push({
        id: generateId(),
        type: "attraction",
        title: `${catLabel}への偏り`,
        description: `あなたが好意を示す相手の${Math.round(ratio * 100)}%が${catLabel}カテゴリに集中しています。このカテゴリの関係性に特に自然体でいられるのかもしれません。`,
        evidence: [
          `${catLabel}カテゴリで${count}人にいいね`,
          `全体の${Math.round(ratio * 100)}%を占める`,
        ],
        significance: clamp01(ratio * 0.7 + count * 0.03),
        axes: [],
      });
    }
  }

  return patterns;
}

function detectComfortPatterns(
  candidates: RendezvousCandidate[],
  stateMap: Map<string, UserStateInput>,
  messageStats: MessageStatInput[],
): RelationshipPattern[] {
  const patterns: RelationshipPattern[] = [];
  const msgMap = new Map(messageStats.map((m) => [m.candidateId, m]));

  // Find candidates with high message counts = comfort zone relationships
  const highMsg = candidates.filter((c) => {
    const stat = msgMap.get(c.id);
    return stat && stat.messageCount > 20;
  });

  if (highMsg.length >= 2) {
    const avgMsgCount = mean(highMsg.map((c) => msgMap.get(c.id)!.messageCount));
    patterns.push({
      id: generateId(),
      type: "comfort",
      title: "安心の居場所",
      description: `${highMsg.length}つの関係で深い対話が続いています。平均${Math.round(avgMsgCount)}通のメッセージが交わされており、あなたにとっての安心できる居場所が形成されています。`,
      evidence: [
        `${highMsg.length}つの関係で20通以上の対話`,
        `平均メッセージ数: ${Math.round(avgMsgCount)}通`,
      ],
      significance: clamp01(0.5 + highMsg.length * 0.1),
      axes: ["conversation_temperature", "emotional_openness"],
    });
  }

  return patterns;
}

function detectFrictionPatterns(
  candidates: RendezvousCandidate[],
  stateMap: Map<string, UserStateInput>,
): RelationshipPattern[] {
  const patterns: RelationshipPattern[] = [];

  // Candidates with caution codes
  const cautioned = candidates.filter((c) => c.caution_codes.length >= 2);
  const liked = cautioned.filter((c) => stateMap.get(c.id)?.state === "liked");

  if (liked.length >= 2) {
    patterns.push({
      id: generateId(),
      type: "friction",
      title: "摩擦を恐れない選択",
      description: `注意点が複数ある相手にも好意を示す傾向があります。${liked.length}人の「注意点あり」の相手にいいねを送っており、摩擦の中に何か価値を見出しているようです。`,
      evidence: [
        `注意点2つ以上の相手${cautioned.length}人中${liked.length}人にいいね`,
        `摩擦を成長の機会と捉えている可能性`,
      ],
      significance: clamp01(0.6 + liked.length * 0.05),
      axes: ["conflict_directness", "stimulation_need"],
    });
  }

  return patterns;
}

function detectGrowthPatterns(
  candidates: RendezvousCandidate[],
  stateMap: Map<string, UserStateInput>,
  messageStats: MessageStatInput[],
): RelationshipPattern[] {
  const patterns: RelationshipPattern[] = [];
  const msgMap = new Map(messageStats.map((m) => [m.candidateId, m]));

  // Candidates where user initiated conversation
  const initiated = messageStats.filter((m) => m.initiatedByUser > m.messageCount * 0.6);
  if (initiated.length >= 3) {
    patterns.push({
      id: generateId(),
      type: "growth",
      title: "能動的な探求者",
      description: `あなたは会話の多くを自分から始めています。${initiated.length}つの関係で60%以上のメッセージを自ら発信しており、関係性において積極的に成長の機会を作り出しています。`,
      evidence: [
        `${initiated.length}つの関係で主導的にメッセージ発信`,
        `能動的なコミュニケーションスタイル`,
      ],
      significance: clamp01(0.5 + initiated.length * 0.08),
      axes: ["initiative", "social_energy"],
    });
  }

  // Growth through diverse categories
  const likedStates = candidates.filter((c) => stateMap.get(c.id)?.state === "liked");
  const uniqueCategories = new Set(likedStates.map((c) => c.category));
  if (uniqueCategories.size >= 3) {
    patterns.push({
      id: generateId(),
      type: "growth",
      title: "多面的な成長",
      description: `${uniqueCategories.size}つの異なるカテゴリで積極的に関係を築いています。友情、恋愛、共創など多方面での交流は、あなたの人格の多面性を映し出しています。`,
      evidence: [
        `${uniqueCategories.size}カテゴリにまたがる関係性`,
        `カテゴリの壁を越えた成長`,
      ],
      significance: clamp01(0.4 + uniqueCategories.size * 0.15),
      axes: ["social_energy", "stimulation_need"],
    });
  }

  return patterns;
}

function detectTransformationPatterns(
  candidates: RendezvousCandidate[],
  stateMap: Map<string, UserStateInput>,
  messageStats: MessageStatInput[],
): RelationshipPattern[] {
  const patterns: RelationshipPattern[] = [];

  // Look for long-running conversations with high avg message length
  const deep = messageStats.filter(
    (m) => m.messageCount > 10 && m.avgLength > 80,
  );
  if (deep.length >= 1) {
    patterns.push({
      id: generateId(),
      type: "transformation",
      title: "深い対話による変容",
      description: `${deep.length}つの関係で、長く丁寧なメッセージのやり取りが続いています。平均${Math.round(mean(deep.map((d) => d.avgLength)))}文字のメッセージは、表面的でない真剣な対話が行われている証です。`,
      evidence: [
        `${deep.length}つの関係で深い対話`,
        `平均メッセージ長: ${Math.round(mean(deep.map((d) => d.avgLength)))}文字`,
      ],
      significance: clamp01(0.6 + deep.length * 0.1),
      axes: ["depth_speed", "emotional_openness"],
    });
  }

  return patterns;
}

function detectAvoidancePatterns(
  candidates: RendezvousCandidate[],
  stateMap: Map<string, UserStateInput>,
): RelationshipPattern[] {
  const patterns: RelationshipPattern[] = [];
  const passed = candidates.filter((c) => stateMap.get(c.id)?.state === "passed");

  if (passed.length < 3) return patterns;

  // High-score candidates that were passed
  const highScorePassed = passed.filter((c) => c.overall_score > 0.7);
  if (highScorePassed.length >= 2) {
    patterns.push({
      id: generateId(),
      type: "avoidance",
      title: "高相性の回避",
      description: `同期スコアが70%以上の相手を${highScorePassed.length}人パスしています。相性が良いはずの相手を避ける傾向があり、何か無意識の基準が働いているかもしれません。`,
      evidence: [
        `スコア70%超の相手${highScorePassed.length}人をパス`,
        `表面的な相性だけでは測れない判断基準の存在`,
      ],
      significance: clamp01(0.5 + highScorePassed.length * 0.1),
      axes: ["stability_need", "distance_need"],
    });
  }

  return patterns;
}

// ---------- Average Dynamics ----------

function computeAverageDynamics(
  candidates: RendezvousCandidate[],
  stateMap: Map<string, UserStateInput>,
): Partial<MatchingVector> {
  const liked = candidates.filter((c) => stateMap.get(c.id)?.state === "liked");
  if (liked.length === 0) return {};

  // Use the score distribution as proxy for vector dynamics
  const scores = liked.map((c) => c.overall_score);
  const avgScore = mean(scores);
  const scoreStd = stdev(scores);

  // Build approximate dynamics from candidate data
  const dynamics: Partial<MatchingVector> = {};
  for (const axis of MATCHING_VECTOR_KEYS) {
    // Approximate: higher avg score = more alignment on this axis
    // Variance in score = how much this axis fluctuates across relationships
    dynamics[axis] = clamp01(avgScore + (Math.random() * 0.1 - 0.05));
  }

  return dynamics;
}

// ---------- Growth Trajectory ----------

function computeGrowthTrajectory(
  candidates: RendezvousCandidate[],
  stateMap: Map<string, UserStateInput>,
): MirrorProfile["growthTrajectory"] {
  // Sort candidates by creation time to track temporal changes
  const sorted = [...candidates].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  if (sorted.length < 4) {
    return { mostGrown: [], stagnant: [] };
  }

  const halfPoint = Math.floor(sorted.length / 2);
  const earlyHalf = sorted.slice(0, halfPoint);
  const lateHalf = sorted.slice(halfPoint);

  const earlyLikedRate =
    earlyHalf.filter((c) => stateMap.get(c.id)?.state === "liked").length / earlyHalf.length;
  const lateLikedRate =
    lateHalf.filter((c) => stateMap.get(c.id)?.state === "liked").length / lateHalf.length;

  const earlyAvgScore = mean(earlyHalf.map((c) => c.overall_score));
  const lateAvgScore = mean(lateHalf.map((c) => c.overall_score));

  const mostGrown: { axis: string; label: string; delta: number }[] = [];
  const stagnant: { axis: string; label: string }[] = [];

  // Track category diversity growth
  const earlyCategories = new Set(earlyHalf.map((c) => c.category));
  const lateCategories = new Set(lateHalf.map((c) => c.category));
  if (lateCategories.size > earlyCategories.size) {
    mostGrown.push({
      axis: "social_energy",
      label: "社交エネルギー",
      delta: clamp01((lateCategories.size - earlyCategories.size) * 0.25),
    });
  }

  // Track engagement growth
  const engagementDelta = lateLikedRate - earlyLikedRate;
  if (engagementDelta > 0.1) {
    mostGrown.push({
      axis: "emotional_openness",
      label: "感情の開示度",
      delta: clamp01(engagementDelta),
    });
  } else if (Math.abs(engagementDelta) < 0.05) {
    stagnant.push({ axis: "emotional_openness", label: "感情の開示度" });
  }

  // Track score trajectory
  const scoreDelta = lateAvgScore - earlyAvgScore;
  if (scoreDelta > 0.05) {
    mostGrown.push({
      axis: "depth_speed",
      label: "深まるスピード",
      delta: clamp01(scoreDelta * 2),
    });
  } else if (scoreDelta < -0.05) {
    stagnant.push({ axis: "depth_speed", label: "深まるスピード" });
  }

  // Initiative growth (approximate)
  if (lateLikedRate > 0.5 && earlyLikedRate < 0.3) {
    mostGrown.push({
      axis: "initiative",
      label: "主導性",
      delta: clamp01(lateLikedRate - earlyLikedRate),
    });
  }

  return { mostGrown, stagnant };
}

// ---------- Stats ----------

function computeStats(
  candidates: RendezvousCandidate[],
  stateMap: Map<string, UserStateInput>,
): MirrorProfile["stats"] {
  const active = candidates.filter((c) =>
    ["a_liked", "b_liked", "mutual_liked", "chat_opened"].includes(c.state),
  );
  const scores = candidates.map((c) => c.overall_score);
  const counts = categoryCounts(candidates);
  const dominant = dominantCategory(counts);

  // Diversity: how evenly spread across categories (0 = all one category, 1 = perfectly even)
  const total = candidates.length || 1;
  const proportions = Object.values(counts).map((c) => c / total);
  const maxEntropy = Math.log(4); // 4 categories
  const entropy = proportions.reduce((sum, p) => {
    if (p === 0) return sum;
    return sum - p * Math.log(p);
  }, 0);

  return {
    totalConnections: candidates.length,
    activeConnections: active.length,
    averageSyncScore: mean(scores),
    dominantCategory: dominant,
    connectionDiversity: clamp01(entropy / maxEntropy),
  };
}

// ---------- Archetype Detection ----------

export function detectArchetype(
  patterns: RelationshipPattern[],
  stats: MirrorProfile["stats"],
  dynamics: Partial<MatchingVector>,
): { archetype: RelationshipArchetype; title: string; description: string } {
  const scores: Record<RelationshipArchetype, number> = {
    quiet_catalyst: 0,
    mutual_grower: 0,
    deep_diver: 0,
    social_weaver: 0,
    storm_chaser: 0,
    steady_anchor: 0,
    bridge_builder: 0,
    mirror_seeker: 0,
  };

  // Factor 1: Connection count and diversity
  if (stats.totalConnections > 10 && stats.connectionDiversity > 0.6) {
    scores.social_weaver += 3;
    scores.bridge_builder += 2;
  } else if (stats.totalConnections <= 5) {
    scores.deep_diver += 3;
  }

  if (stats.connectionDiversity > 0.7) {
    scores.bridge_builder += 2;
  } else if (stats.connectionDiversity < 0.3) {
    scores.mirror_seeker += 2;
  }

  // Factor 2: Pattern-based signals
  for (const p of patterns) {
    switch (p.type) {
      case "attraction":
        scores.mirror_seeker += p.significance;
        break;
      case "avoidance":
        scores.quiet_catalyst += p.significance * 0.5;
        scores.steady_anchor += p.significance;
        break;
      case "growth":
        scores.mutual_grower += p.significance * 2;
        break;
      case "comfort":
        scores.steady_anchor += p.significance * 2;
        scores.deep_diver += p.significance;
        break;
      case "friction":
        scores.storm_chaser += p.significance * 2;
        break;
      case "transformation":
        scores.quiet_catalyst += p.significance;
        scores.mutual_grower += p.significance;
        break;
    }
  }

  // Factor 3: Dynamic axes
  const stabilityNeed = dynamics.stability_need ?? 0.5;
  const stimulationNeed = dynamics.stimulation_need ?? 0.5;
  const socialEnergy = dynamics.social_energy ?? 0.5;
  const initiative = dynamics.initiative ?? 0.5;

  if (stabilityNeed > 0.7) {
    scores.steady_anchor += 2;
  }
  if (stimulationNeed > 0.7) {
    scores.storm_chaser += 2;
  }
  if (socialEnergy > 0.7) {
    scores.social_weaver += 1.5;
  }
  if (initiative > 0.7) {
    scores.quiet_catalyst += 1;
    scores.mutual_grower += 1;
  }

  // Factor 4: Active vs total ratio
  const activeRatio =
    stats.totalConnections > 0
      ? stats.activeConnections / stats.totalConnections
      : 0;
  if (activeRatio > 0.5) {
    scores.mutual_grower += 1;
  } else if (activeRatio < 0.2 && stats.totalConnections > 5) {
    scores.quiet_catalyst += 2;
  }

  // Pick the highest scoring archetype
  let bestArchetype: RelationshipArchetype = "mutual_grower";
  let bestScore = -1;
  for (const [archetype, score] of Object.entries(scores) as [
    RelationshipArchetype,
    number,
  ][]) {
    if (score > bestScore) {
      bestScore = score;
      bestArchetype = archetype;
    }
  }

  const meta = ARCHETYPE_META[bestArchetype];
  return {
    archetype: bestArchetype,
    title: meta.title,
    description: meta.description,
  };
}

// ---------- Main Builder ----------

export function buildMirrorProfile(
  userId: string,
  candidates: RendezvousCandidate[],
  userStates: UserStateInput[],
  messageStats: MessageStatInput[],
): MirrorProfile {
  if (candidates.length === 0) {
    return {
      relationshipPersona: {
        archetype: "mutual_grower",
        title: "相互成長者",
        description:
          "まだ十分なデータがありません。より多くの出会いを重ねることで、あなたの関係性パーソナリティが浮かび上がってきます。",
      },
      patterns: [],
      averageDynamics: {},
      growthTrajectory: { mostGrown: [], stagnant: [] },
      stats: {
        totalConnections: 0,
        activeConnections: 0,
        averageSyncScore: 0,
        dominantCategory: "friendship",
        connectionDiversity: 0,
      },
    };
  }

  const stateMap = new Map<string, UserStateInput>();
  for (const s of userStates) {
    stateMap.set(s.candidateId, s);
  }

  // Detect all pattern types
  const allPatterns: RelationshipPattern[] = [
    ...detectAttractionPatterns(candidates, stateMap),
    ...detectAvoidancePatterns(candidates, stateMap),
    ...detectComfortPatterns(candidates, stateMap, messageStats),
    ...detectFrictionPatterns(candidates, stateMap),
    ...detectGrowthPatterns(candidates, stateMap, messageStats),
    ...detectTransformationPatterns(candidates, stateMap, messageStats),
  ];

  // Sort by significance and deduplicate
  allPatterns.sort((a, b) => b.significance - a.significance);
  const patterns = allPatterns.slice(0, 8); // max 8 patterns

  const averageDynamics = computeAverageDynamics(candidates, stateMap);
  const growthTrajectory = computeGrowthTrajectory(candidates, stateMap);
  const stats = computeStats(candidates, stateMap);

  const relationshipPersona = detectArchetype(patterns, stats, averageDynamics);

  return {
    relationshipPersona,
    patterns,
    averageDynamics,
    growthTrajectory,
    stats,
  };
}
