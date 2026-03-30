// ============================================================
// Community Resonance - 1:1を超え、3-5人の創発的ダイナミクスを発見する
// 一人では生まれない何かを、グループの共鳴から生み出す
// ============================================================

import type { MatchingVector, RendezvousCategory } from "./types";

// ---------- Types ----------

export type ResonanceGroup = {
  id: string;
  members: GroupMember[];
  /** グループの創発的ダイナミクス */
  emergentDynamic: EmergentDynamic;
  /** グループ共鳴スコア */
  groupResonanceScore: number; // 0..100
  /** なぜこのグループが特別か */
  narrative: string; // Japanese
  /** グループで推奨されるアクティビティ */
  suggestedActivities: string[];
};

export type GroupMember = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  /** このグループでの役割 */
  role: GroupRole;
  roleLabel: string; // Japanese
  /** グループへの貢献ベクトル */
  contribution: string; // Japanese description
};

export type GroupRole =
  | "catalyst" // 触媒 - 議論を活性化
  | "harmonizer" // 調和者 - バランスを取る
  | "visionary" // 先見者 - 新しい視点を提供
  | "anchor" // 錨 - 安定感を提供
  | "challenger" // 挑戦者 - 常識を疑う
  | "connector"; // 結合子 - メンバー間を繋ぐ

export type EmergentDynamic = {
  type: EmergentType;
  label: string; // Japanese
  description: string; // Japanese 2-3 sentences
  strengthScore: number; // 0..1
};

export type EmergentType =
  | "creative_fusion" // 創造的融合 - 一人では生まれないアイデア
  | "mutual_growth" // 相互成長 - 全員が引き上げられる
  | "deep_exploration" // 深海探索 - 普通では到達しない深さ
  | "joyful_energy" // 喜びのエネルギー - 場が明るくなる
  | "healing_circle" // 癒しの輪 - 安全な場が生まれる
  | "challenge_arena"; // 挑戦の場 - 互いを高める競争

// ---------- Role Metadata ----------

const ROLE_META: Record<GroupRole, { label: string; contributionTemplate: string }> = {
  catalyst: {
    label: "触媒",
    contributionTemplate: "場を動かし、新しい対話の流れを生み出す力",
  },
  harmonizer: {
    label: "調和者",
    contributionTemplate: "異なる意見を包み込み、全体のバランスを保つ力",
  },
  visionary: {
    label: "先見者",
    contributionTemplate: "誰も見ていなかった角度からの視点を提供する力",
  },
  anchor: {
    label: "錨",
    contributionTemplate: "場に安心感と落ち着きを提供する安定した存在",
  },
  challenger: {
    label: "挑戦者",
    contributionTemplate: "当たり前を疑い、全員の思考を一段深くする力",
  },
  connector: {
    label: "結合子",
    contributionTemplate: "メンバー間の見えない糸を紡ぎ、関係を深める力",
  },
};

// ---------- Emergent Dynamic Metadata ----------

const EMERGENT_META: Record<
  EmergentType,
  { label: string; description: string; activitySuggestions: string[] }
> = {
  creative_fusion: {
    label: "創造的融合",
    description:
      "このグループでは、一人では思いつかないアイデアが自然と生まれます。異なる視点が衝突し、融合することで、まったく新しいものが創造される場です。",
    activitySuggestions: [
      "テーマを決めず自由に対話する時間を作る",
      "全員で一つの作品やプロジェクトに取り組む",
      "「もし〜だったら」ゲームで想像力を広げる",
    ],
  },
  mutual_growth: {
    label: "相互成長",
    description:
      "全員が互いを引き上げる稀有な関係性。一人の成長が全体の成長を促し、グループ全体が螺旋的に進化していくダイナミクスです。",
    activitySuggestions: [
      "各自の挑戦を共有し、互いにフィードバックする",
      "月に一度、成長と変化を振り返る場を設ける",
      "互いの強みを活かしたスキル交換をする",
    ],
  },
  deep_exploration: {
    label: "深海探索",
    description:
      "このグループには、普通の会話では到達しない深さに潜る力があります。安全な場の中で、人生の根本的な問いに向き合うことができる貴重な関係です。",
    activitySuggestions: [
      "深い問いについてじっくり対話する時間を作る",
      "各自の人生の転機を共有する",
      "沈黙を恐れず、考える時間を大切にする",
    ],
  },
  joyful_energy: {
    label: "喜びのエネルギー",
    description:
      "このグループが集まると、場のエネルギーが自然と高まります。笑いと活力が生まれ、全員が元気になれる化学反応が起きる関係です。",
    activitySuggestions: [
      "一緒に新しい体験をする（料理、スポーツなど）",
      "定期的に集まるリズムを作る",
      "互いの「推し」や情熱を紹介し合う",
    ],
  },
  healing_circle: {
    label: "癒しの輪",
    description:
      "このグループには、自然と安全な空間が生まれます。防衛を下ろし、弱さを見せることができる。互いの存在自体が癒しになる関係性です。",
    activitySuggestions: [
      "ゆるやかに集まり、近況を分かち合う",
      "互いの「今の状態」を大切にする場を設ける",
      "自然の中で一緒に過ごす時間を作る",
    ],
  },
  challenge_arena: {
    label: "挑戦の場",
    description:
      "健全な競争と刺激が生まれるグループ。互いの高い基準が全員を引き上げ、妥協を許さない成長の場が自然と形成されます。",
    activitySuggestions: [
      "互いに目標を宣言し、進捗を共有する",
      "建設的な批評を交換する場を作る",
      "共通の挑戦（読書、学習など）に取り組む",
    ],
  },
};

// ---------- Vector utility ----------

const VECTOR_KEYS: (keyof MatchingVector)[] = [
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

function vectorToArray(v: MatchingVector): number[] {
  return VECTOR_KEYS.map((k) => v[k]);
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, x) => sum + x, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length <= 1) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

// ---------- Group Resonance Score ----------

/**
 * グループ共鳴スコアを計算する。
 * diversity (多様性) × harmony (調和性) のバランスで評価。
 *
 * - Diversity: 各軸におけるメンバー間の標準偏差の平均（広がりが欲しい）
 * - Harmony: 全軸において全メンバーが極端に偏っていないこと（重なりが欲しい）
 */
export function computeGroupResonance(
  members: { vector: MatchingVector }[],
): number {
  if (members.length < 3) return 0;

  const arrays = members.map((m) => vectorToArray(m.vector));

  // Diversity: 各軸の標準偏差の平均
  let diversitySum = 0;
  for (let axisIdx = 0; axisIdx < VECTOR_KEYS.length; axisIdx++) {
    const axisValues = arrays.map((a) => a[axisIdx]);
    diversitySum += stdDev(axisValues);
  }
  const diversityScore = diversitySum / VECTOR_KEYS.length;
  // Normalize: stdDev of [0,1] range max is ~0.5
  const normalizedDiversity = Math.min(diversityScore / 0.35, 1);

  // Harmony: 全軸において極端な対立がないか確認
  // 各軸の range (max - min) が 0.8 以上ならペナルティ
  let harmonyPenalties = 0;
  for (let axisIdx = 0; axisIdx < VECTOR_KEYS.length; axisIdx++) {
    const axisValues = arrays.map((a) => a[axisIdx]);
    const range = Math.max(...axisValues) - Math.min(...axisValues);
    if (range > 0.8) harmonyPenalties++;
  }
  const harmonyScore = 1 - harmonyPenalties / VECTOR_KEYS.length;

  // 最終スコア: diversity と harmony の幾何平均
  const raw = Math.sqrt(normalizedDiversity * harmonyScore) * 100;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

// ---------- Role Assignment ----------

/**
 * グループ内での役割をベクトルに基づいて割り当てる。
 * 各メンバーの相対的な位置関係から最適な役割を決定する。
 */
export function assignGroupRoles(
  members: { userId: string; vector: MatchingVector }[],
): Map<string, GroupRole> {
  const roles = new Map<string, GroupRole>();
  if (members.length === 0) return roles;

  const arrays = members.map((m) => ({
    userId: m.userId,
    arr: vectorToArray(m.vector),
    vector: m.vector,
  }));

  // 重心を計算
  const centroid = new Array(VECTOR_KEYS.length).fill(0);
  for (const { arr } of arrays) {
    for (let i = 0; i < arr.length; i++) {
      centroid[i] += arr[i] / arrays.length;
    }
  }

  // 各メンバーの特徴量を計算
  type MemberFeature = {
    userId: string;
    stimulation: number;
    emotional_openness: number;
    initiative: number;
    stability: number;
    distFromCentroid: number;
    avgDistToOthers: number;
  };

  const features: MemberFeature[] = arrays.map(({ userId, arr, vector }) => {
    const distFromCentroid = euclideanDistance(arr, centroid);
    const avgDistToOthers =
      arrays
        .filter((o) => o.userId !== userId)
        .reduce((sum, o) => sum + euclideanDistance(arr, o.arr), 0) /
      Math.max(1, arrays.length - 1);

    return {
      userId,
      stimulation: vector.stimulation_need,
      emotional_openness: vector.emotional_openness,
      initiative: vector.initiative,
      stability: vector.stability_need,
      distFromCentroid,
      avgDistToOthers,
    };
  });

  // 各役割候補をスコアリングし、貪欲法で割り当て
  const assignedRoles = new Set<GroupRole>();
  const assignedUsers = new Set<string>();

  type Candidate = { userId: string; role: GroupRole; score: number };
  const allCandidates: Candidate[] = [];

  for (const f of features) {
    allCandidates.push({ userId: f.userId, role: "challenger", score: f.stimulation });
    allCandidates.push({ userId: f.userId, role: "harmonizer", score: f.emotional_openness });
    allCandidates.push({ userId: f.userId, role: "catalyst", score: f.initiative });
    allCandidates.push({ userId: f.userId, role: "anchor", score: f.stability });
    allCandidates.push({ userId: f.userId, role: "visionary", score: f.distFromCentroid });
    // connector: 他のメンバーとの平均距離が最小 = 最も中心に近い
    allCandidates.push({
      userId: f.userId,
      role: "connector",
      score: 1 / (1 + f.avgDistToOthers), // 距離が小さいほどスコア高
    });
  }

  // スコア降順でソート
  allCandidates.sort((a, b) => b.score - a.score);

  // 貪欲割り当て: 各ユーザーに最大1つ、各ロールは最大1つ
  for (const c of allCandidates) {
    if (assignedUsers.has(c.userId) || assignedRoles.has(c.role)) continue;
    roles.set(c.userId, c.role);
    assignedUsers.add(c.userId);
    assignedRoles.add(c.role);
    if (assignedUsers.size === members.length) break;
  }

  // 割り当てられなかったメンバーにはフォールバック
  const fallbackRoles: GroupRole[] = [
    "connector",
    "harmonizer",
    "catalyst",
    "anchor",
    "visionary",
    "challenger",
  ];
  for (const m of members) {
    if (!roles.has(m.userId)) {
      const available = fallbackRoles.find((r) => !assignedRoles.has(r));
      roles.set(m.userId, available ?? "connector");
      if (available) assignedRoles.add(available);
    }
  }

  return roles;
}

// ---------- Detect Emergent Dynamic ----------

/**
 * グループの創発的ダイナミクスを検出する。
 * メンバーのベクトル分布と役割構成から、最も強い創発パターンを推定する。
 */
export function detectEmergentDynamic(
  members: { vector: MatchingVector; role: GroupRole }[],
): EmergentDynamic {
  if (members.length === 0) {
    return {
      type: "mutual_growth",
      label: EMERGENT_META.mutual_growth.label,
      description: EMERGENT_META.mutual_growth.description,
      strengthScore: 0,
    };
  }

  const vectors = members.map((m) => m.vector);
  const roleSet = new Set(members.map((m) => m.role));

  // 各タイプのスコアを計算
  const scores: { type: EmergentType; score: number }[] = [];

  // creative_fusion: 高い多様性 + visionary + catalyst がいる
  {
    const diversityMean = mean(
      VECTOR_KEYS.map((k) => stdDev(vectors.map((v) => v[k]))),
    );
    const hasVisionary = roleSet.has("visionary");
    const hasCatalyst = roleSet.has("catalyst");
    scores.push({
      type: "creative_fusion",
      score:
        diversityMean * 2 +
        (hasVisionary ? 0.3 : 0) +
        (hasCatalyst ? 0.2 : 0),
    });
  }

  // mutual_growth: バランスの取れた多様性 + 高い emotional_openness 平均
  {
    const avgOpenness = mean(vectors.map((v) => v.emotional_openness));
    const avgDepth = mean(vectors.map((v) => v.depth_speed));
    scores.push({
      type: "mutual_growth",
      score: avgOpenness * 0.4 + avgDepth * 0.4 + 0.2,
    });
  }

  // deep_exploration: 高い depth_speed + emotional_openness + anchor がいる
  {
    const avgDepth = mean(vectors.map((v) => v.depth_speed));
    const avgOpenness = mean(vectors.map((v) => v.emotional_openness));
    const hasAnchor = roleSet.has("anchor");
    scores.push({
      type: "deep_exploration",
      score:
        avgDepth * 0.5 + avgOpenness * 0.3 + (hasAnchor ? 0.2 : 0),
    });
  }

  // joyful_energy: 高い social_energy + stimulation_need + conversation_temperature
  {
    const avgSocial = mean(vectors.map((v) => v.social_energy));
    const avgStim = mean(vectors.map((v) => v.stimulation_need));
    const avgConvo = mean(vectors.map((v) => v.conversation_temperature));
    scores.push({
      type: "joyful_energy",
      score: avgSocial * 0.4 + avgStim * 0.3 + avgConvo * 0.3,
    });
  }

  // healing_circle: 高い stability_need + emotional_openness + harmonizer がいる
  {
    const avgStability = mean(vectors.map((v) => v.stability_need));
    const avgOpenness = mean(vectors.map((v) => v.emotional_openness));
    const hasHarmonizer = roleSet.has("harmonizer");
    scores.push({
      type: "healing_circle",
      score:
        avgStability * 0.4 + avgOpenness * 0.4 + (hasHarmonizer ? 0.2 : 0),
    });
  }

  // challenge_arena: 高い stimulation_need + conflict_directness + challenger がいる
  {
    const avgStim = mean(vectors.map((v) => v.stimulation_need));
    const avgConflict = mean(vectors.map((v) => v.conflict_directness));
    const hasChallenger = roleSet.has("challenger");
    scores.push({
      type: "challenge_arena",
      score:
        avgStim * 0.4 + avgConflict * 0.4 + (hasChallenger ? 0.2 : 0),
    });
  }

  // 最高スコアのタイプを選択
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  const meta = EMERGENT_META[best.type];

  return {
    type: best.type,
    label: meta.label,
    description: meta.description,
    strengthScore: Math.min(1, best.score),
  };
}

// ---------- Find Resonance Groups ----------

type ConnectionInput = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  vector: MatchingVector;
  category: RendezvousCategory;
};

/**
 * ユーザーの接続プールから最適な3-5人のグループを発見する。
 *
 * アルゴリズム:
 * 1. ユーザーの相互接続を起点にする
 * 2. 各ペアに対し、第3のメンバーを追加してグループ共鳴を計算
 * 3. 共鳴スコアが最も高いグループを選択
 * 4. さらにメンバーを追加して共鳴が上がるなら拡張
 */
export function findResonanceGroups(
  userId: string,
  connections: ConnectionInput[],
  maxGroups: number,
): ResonanceGroup[] {
  if (connections.length < 2) return [];

  const groups: ResonanceGroup[] = [];
  const usedInGroup = new Set<string>();

  // 全ペアの組み合わせを試す
  for (let i = 0; i < connections.length && groups.length < maxGroups; i++) {
    for (let j = i + 1; j < connections.length && groups.length < maxGroups; j++) {
      const pair = [connections[i], connections[j]];

      // 第3メンバー候補を探す
      let bestTriple: ConnectionInput[] | null = null;
      let bestTripleScore = 0;

      for (let k = 0; k < connections.length; k++) {
        if (k === i || k === j) continue;
        // 既にグループに使われたメンバーは避ける（多様性のため）
        if (usedInGroup.has(connections[k].userId)) continue;

        const tripleMembers = [...pair, connections[k]];
        const score = computeGroupResonance(tripleMembers);

        if (score > bestTripleScore) {
          bestTripleScore = score;
          bestTriple = tripleMembers;
        }
      }

      if (!bestTriple || bestTripleScore < 30) continue;

      // 4人目、5人目を追加して共鳴が上がるか試す
      let currentMembers = bestTriple;
      let currentScore = bestTripleScore;

      for (let expand = 0; expand < 2; expand++) {
        let bestAddition: ConnectionInput | null = null;
        let bestExpandedScore = currentScore;
        const currentIds = new Set(currentMembers.map((m) => m.userId));

        for (const c of connections) {
          if (currentIds.has(c.userId) || usedInGroup.has(c.userId)) continue;

          const expanded = [...currentMembers, c];
          const expandedScore = computeGroupResonance(expanded);

          if (expandedScore > bestExpandedScore) {
            bestExpandedScore = expandedScore;
            bestAddition = c;
          }
        }

        if (bestAddition && bestExpandedScore > currentScore) {
          currentMembers = [...currentMembers, bestAddition];
          currentScore = bestExpandedScore;
        } else {
          break;
        }
      }

      // 十分なスコアがあればグループとして採用
      if (currentScore >= 30) {
        const group = buildResonanceGroup(
          `rg-${groups.length + 1}`,
          currentMembers,
          currentScore,
        );
        groups.push(group);

        // 使用済みに登録
        for (const m of currentMembers) {
          usedInGroup.add(m.userId);
        }
      }
    }
  }

  // スコア順にソート
  groups.sort((a, b) => b.groupResonanceScore - a.groupResonanceScore);
  return groups.slice(0, maxGroups);
}

// ---------- Build group from members ----------

function buildResonanceGroup(
  id: string,
  connections: ConnectionInput[],
  resonanceScore: number,
): ResonanceGroup {
  // 役割を割り当て
  const roleMap = assignGroupRoles(
    connections.map((c) => ({ userId: c.userId, vector: c.vector })),
  );

  // 創発ダイナミクスを検出
  const membersWithRoles = connections.map((c) => ({
    vector: c.vector,
    role: roleMap.get(c.userId) ?? ("connector" as GroupRole),
  }));
  const emergentDynamic = detectEmergentDynamic(membersWithRoles);

  // メンバー情報を構築
  const groupMembers: GroupMember[] = connections.map((c) => {
    const role = roleMap.get(c.userId) ?? "connector";
    const meta = ROLE_META[role];
    return {
      userId: c.userId,
      displayName: c.displayName,
      avatarUrl: c.avatarUrl,
      role,
      roleLabel: meta.label,
      contribution: meta.contributionTemplate,
    };
  });

  // ナラティブ生成
  const narrative = generateGroupNarrative(groupMembers, emergentDynamic);

  // アクティビティ提案
  const meta = EMERGENT_META[emergentDynamic.type];
  const suggestedActivities = meta.activitySuggestions;

  return {
    id,
    members: groupMembers,
    emergentDynamic,
    groupResonanceScore: resonanceScore,
    narrative,
    suggestedActivities,
  };
}

// ---------- Narrative generation ----------

function generateGroupNarrative(
  members: GroupMember[],
  dynamic: EmergentDynamic,
): string {
  const roleLabels = members.map((m) => m.roleLabel);
  const uniqueRoles = [...new Set(roleLabels)];

  const size = members.length;
  const sizeLabel = size === 3 ? "3人" : size === 4 ? "4人" : "5人";

  return (
    `${sizeLabel}のメンバーが${uniqueRoles.join("・")}の役割で組み合わさることで、` +
    `「${dynamic.label}」という創発的なダイナミクスが生まれます。` +
    `${dynamic.description.split("。")[0]}。` +
    `このグループでしか生まれない化学反応を大切にしてください。`
  );
}
