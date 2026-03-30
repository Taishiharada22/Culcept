// ============================================================
// Unconscious Patterns Engine
// ユーザーが自覚していない行動パターンを検出する
// ============================================================

import type {
  MatchingVector,
  RendezvousCandidate,
  RendezvousCategory,
} from "./types";

// ---------- Types ----------

export type UnconsciousPatternType =
  | "attraction_avoidance"
  | "repetition_compulsion"
  | "projection_pattern"
  | "comfort_zone_lock"
  | "approach_retreat_cycle"
  | "idealization_gap"
  | "hidden_priority"
  | "growth_resistance"
  | "safety_seeking"
  | "novelty_addiction";

export type PatternEvidence = {
  description: string;
  dataPoint: string;
};

export type UnconsciousPattern = {
  id: string;
  type: UnconsciousPatternType;
  title: string;
  insight: string;
  evidence: PatternEvidence[];
  significance: number; // 0..1
  tensionLevel: "gentle" | "moderate" | "confronting";
};

// ---------- Input Types ----------

type UserStateInput = {
  candidateId: string;
  state: string;
  likedAt?: string;
  passedAt?: string;
};

type ViewLogInput = {
  candidateId: string;
  viewDurationMs: number;
  viewCount: number;
  category: RendezvousCategory;
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

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function generateId(): string {
  return `ucp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- Individual Pattern Detectors ----------

/**
 * attraction_avoidance: 長時間プロフィールを見るが、パスする割合が高い
 */
function detectAttractionAvoidance(
  candidates: RendezvousCandidate[],
  stateMap: Map<string, UserStateInput>,
  viewLogs: ViewLogInput[],
): UnconsciousPattern | null {
  const viewMap = new Map(viewLogs.map((v) => [v.candidateId, v]));
  const avgViewDuration = mean(viewLogs.map((v) => v.viewDurationMs));

  if (avgViewDuration === 0 || viewLogs.length < 5) return null;

  // Find candidates with above-average view time that were passed
  const longViewedPassed: { candidate: RendezvousCandidate; viewLog: ViewLogInput }[] = [];

  for (const c of candidates) {
    const view = viewMap.get(c.id);
    const state = stateMap.get(c.id);
    if (
      view &&
      state &&
      view.viewDurationMs > avgViewDuration * 1.5 &&
      state.state === "passed"
    ) {
      longViewedPassed.push({ candidate: c, viewLog: view });
    }
  }

  // Check if there's a pattern by category
  const categoryCounts: Partial<Record<RendezvousCategory, number>> = {};
  for (const { candidate } of longViewedPassed) {
    categoryCounts[candidate.category] =
      (categoryCounts[candidate.category] || 0) + 1;
  }

  for (const [cat, count] of Object.entries(categoryCounts)) {
    const totalInCat = candidates.filter((c) => c.category === cat).length;
    const passRate = totalInCat > 0 ? count / totalInCat : 0;

    if (count >= 3 && passRate > 0.8) {
      const catLabel =
        cat === "romantic"
          ? "ロマンティック"
          : cat === "friendship"
            ? "友情"
            : cat === "cocreation"
              ? "共創"
              : "コミュニティ";

      return {
        id: generateId(),
        type: "attraction_avoidance",
        title: "惹かれているのに、手を伸ばさない",
        insight: `${catLabel}カテゴリのプロフィールを平均の1.5倍以上じっくり見ているにもかかわらず、${Math.round(passRate * 100)}%をパスしています。心のどこかで惹かれているのに、何かがブレーキをかけているのかもしれません。`,
        evidence: [
          {
            description: "長時間閲覧後のパス",
            dataPoint: `${count}回中${count}回、${catLabel}のプロフィールを長く見るが結局パス`,
          },
          {
            description: "カテゴリ内パス率",
            dataPoint: `${catLabel}カテゴリのパス率: ${Math.round(passRate * 100)}%`,
          },
        ],
        significance: clamp01(0.6 + count * 0.05),
        tensionLevel: "moderate",
      };
    }
  }

  // General attraction avoidance (not category-specific)
  if (longViewedPassed.length >= 4) {
    const passedTotal = candidates.filter(
      (c) => stateMap.get(c.id)?.state === "passed",
    ).length;
    const longViewPassRate = longViewedPassed.length / (passedTotal || 1);

    return {
      id: generateId(),
      type: "attraction_avoidance",
      title: "気になるのに、近づけない",
      insight: `じっくりプロフィールを見た相手ほどパスする傾向があります。${longViewedPassed.length}人の相手に対して強い関心を示しながらも、最終的に距離を取っています。惹かれることへの無意識の抵抗かもしれません。`,
      evidence: [
        {
          description: "閲覧時間とパスの相関",
          dataPoint: `平均の1.5倍以上見た相手の${longViewedPassed.length}人をパス`,
        },
        {
          description: "関心と行動の乖離",
          dataPoint: `長時間閲覧→パスのパターンが繰り返し発生`,
        },
      ],
      significance: clamp01(0.5 + longViewedPassed.length * 0.06),
      tensionLevel: "confronting",
    };
  }

  return null;
}

/**
 * repetition_compulsion: 同じ軸の極端な値を持つ相手に繰り返し惹かれる
 */
function detectRepetitionCompulsion(
  candidates: RendezvousCandidate[],
  stateMap: Map<string, UserStateInput>,
): UnconsciousPattern | null {
  const liked = candidates.filter(
    (c) => stateMap.get(c.id)?.state === "liked",
  );
  if (liked.length < 3) return null;

  // Check if liked candidates cluster in same category repeatedly
  const catCounts: Partial<Record<RendezvousCategory, number>> = {};
  for (const c of liked) {
    catCounts[c.category] = (catCounts[c.category] || 0) + 1;
  }

  // Check for score clustering (many liked candidates with similar scores)
  const scores = liked.map((c) => c.overall_score);
  const avgScore = mean(scores);
  const tightCluster = scores.filter(
    (s) => Math.abs(s - avgScore) < 0.1,
  ).length;
  const clusterRatio = tightCluster / liked.length;

  // Check reason code repetition
  const reasonFreq: Record<string, number> = {};
  for (const c of liked) {
    for (const code of c.reason_codes) {
      reasonFreq[code] = (reasonFreq[code] || 0) + 1;
    }
  }
  const mostFrequentReason = Object.entries(reasonFreq).sort(
    (a, b) => b[1] - a[1],
  )[0];

  if (
    clusterRatio > 0.7 &&
    liked.length >= 4 &&
    mostFrequentReason &&
    mostFrequentReason[1] >= 3
  ) {
    return {
      id: generateId(),
      type: "repetition_compulsion",
      title: "同じ相手を、何度も選んでいる",
      insight: `あなたがいいねを送る相手には驚くほど共通点があります。${liked.length}人中${tightCluster}人が同じスコア帯に集中し、同じ共鳴ポイントが繰り返し現れています。無意識に同じタイプを選び続けているのかもしれません。`,
      evidence: [
        {
          description: "スコア帯の集中",
          dataPoint: `${liked.length}人中${tightCluster}人がスコア±10%の範囲に集中`,
        },
        {
          description: "繰り返される共鳴ポイント",
          dataPoint: `「${mostFrequentReason[0]}」が${mostFrequentReason[1]}回繰り返し出現`,
        },
      ],
      significance: clamp01(0.6 + clusterRatio * 0.3),
      tensionLevel: "moderate",
    };
  }

  return null;
}

/**
 * comfort_zone_lock: すべてのいいね相手が自分のベクトル近傍に限定
 */
function detectComfortZoneLock(
  candidates: RendezvousCandidate[],
  stateMap: Map<string, UserStateInput>,
): UnconsciousPattern | null {
  const liked = candidates.filter(
    (c) => stateMap.get(c.id)?.state === "liked",
  );
  if (liked.length < 4) return null;

  // Use overall_score as proxy: if all liked candidates have very similar scores,
  // the user is staying in their comfort zone
  const scores = liked.map((c) => c.overall_score);
  const avgScore = mean(scores);
  const allWithinNarrowBand = scores.every(
    (s) => Math.abs(s - avgScore) < 0.15,
  );

  // Also check category uniformity
  const categories = new Set(liked.map((c) => c.category));

  if (allWithinNarrowBand && categories.size <= 1 && liked.length >= 4) {
    return {
      id: generateId(),
      type: "comfort_zone_lock",
      title: "安全圏から出られない",
      insight: `あなたがいいねを送る相手は全員、非常に似た特徴を持っています。1つのカテゴリ内で、スコア±15%の狭い範囲にすべてが収まっています。心地よさは大切ですが、その外にも可能性があるかもしれません。`,
      evidence: [
        {
          description: "スコアの均一性",
          dataPoint: `全${liked.length}人がスコア${Math.round((avgScore - 0.15) * 100)}%〜${Math.round((avgScore + 0.15) * 100)}%の範囲`,
        },
        {
          description: "カテゴリの単一性",
          dataPoint: `すべて同一カテゴリ内の選択`,
        },
      ],
      significance: clamp01(0.7 + liked.length * 0.03),
      tensionLevel: "gentle",
    };
  }

  return null;
}

/**
 * approach_retreat_cycle: いいね→チャット→沈黙→いいね→チャット→沈黙の繰り返し
 */
function detectApproachRetreatCycle(
  candidates: RendezvousCandidate[],
  stateMap: Map<string, UserStateInput>,
  messageStats: MessageStatInput[],
): UnconsciousPattern | null {
  const msgMap = new Map(messageStats.map((m) => [m.candidateId, m]));

  // Find candidates that were liked, had some messages, then went silent
  const approachedThenSilent: string[] = [];

  for (const c of candidates) {
    const state = stateMap.get(c.id);
    const msg = msgMap.get(c.id);

    if (!state || !msg) continue;

    // Liked candidate with chat that died (few messages, user stopped initiating)
    if (
      state.state === "liked" &&
      msg.messageCount >= 3 &&
      msg.messageCount <= 15 &&
      msg.initiatedByUser > 0 &&
      (c.state === "chat_opened" || c.state === "mutual_liked")
    ) {
      approachedThenSilent.push(c.id);
    }
  }

  if (approachedThenSilent.length >= 3) {
    return {
      id: generateId(),
      type: "approach_retreat_cycle",
      title: "近づいては、離れていく",
      insight: `${approachedThenSilent.length}つの関係で、同じパターンが繰り返されています。いいねを送り、会話を始め、ある程度進んだところで沈黙する。近づきたい気持ちと、距離を置きたい気持ちが交互に現れているようです。`,
      evidence: [
        {
          description: "接近→撤退のサイクル",
          dataPoint: `${approachedThenSilent.length}つの関係でいいね→会話開始→沈黙のパターン`,
        },
        {
          description: "一定の深さでの停止",
          dataPoint: `会話は3〜15通で途絶える傾向`,
        },
      ],
      significance: clamp01(0.6 + approachedThenSilent.length * 0.08),
      tensionLevel: "confronting",
    };
  }

  return null;
}

/**
 * idealization_gap: 好みの表明と実際の行動に乖離がある
 * ここではカテゴリの好み宣言と実際のいいね分布の差をみる
 */
function detectIdealizationGap(
  candidates: RendezvousCandidate[],
  stateMap: Map<string, UserStateInput>,
): UnconsciousPattern | null {
  const liked = candidates.filter(
    (c) => stateMap.get(c.id)?.state === "liked",
  );
  if (liked.length < 3) return null;

  // Compare high-score vs low-score liked candidates
  const highScore = liked.filter((c) => c.overall_score > 0.7);
  const lowScore = liked.filter((c) => c.overall_score <= 0.5);

  // If user likes low-score candidates more than high-score ones, there's a gap
  if (lowScore.length > highScore.length && lowScore.length >= 2) {
    return {
      id: generateId(),
      type: "idealization_gap",
      title: "理想と現実のすれ違い",
      insight: `相性スコアが高い相手よりも、低い相手にいいねを送る傾向があります。スコア50%以下の相手に${lowScore.length}回、70%以上の相手には${highScore.length}回。表面的な「合う/合わない」とは違う、言語化されていない基準があなたを動かしています。`,
      evidence: [
        {
          description: "スコアと行動の逆転",
          dataPoint: `低スコア(≤50%)へのいいね: ${lowScore.length}回 > 高スコア(>70%): ${highScore.length}回`,
        },
        {
          description: "隠れた判断基準の存在",
          dataPoint: `アルゴリズムが予測する好みと実際の選択が乖離`,
        },
      ],
      significance: clamp01(0.5 + (lowScore.length - highScore.length) * 0.1),
      tensionLevel: "moderate",
    };
  }

  return null;
}

/**
 * hidden_priority: 行動データが明かす無意識の優先事項
 */
function detectHiddenPriority(
  candidates: RendezvousCandidate[],
  stateMap: Map<string, UserStateInput>,
  viewLogs: ViewLogInput[],
): UnconsciousPattern | null {
  if (viewLogs.length < 5) return null;

  const viewMap = new Map(viewLogs.map((v) => [v.candidateId, v]));

  // Check if view duration is highest for a specific category
  const durationByCategory: Partial<Record<RendezvousCategory, number[]>> = {};
  for (const v of viewLogs) {
    if (!durationByCategory[v.category]) {
      durationByCategory[v.category] = [];
    }
    durationByCategory[v.category]!.push(v.viewDurationMs);
  }

  const avgByCategory: { category: RendezvousCategory; avg: number }[] = [];
  for (const [cat, durations] of Object.entries(durationByCategory)) {
    avgByCategory.push({
      category: cat as RendezvousCategory,
      avg: mean(durations),
    });
  }

  avgByCategory.sort((a, b) => b.avg - a.avg);

  if (
    avgByCategory.length >= 2 &&
    avgByCategory[0].avg > avgByCategory[1].avg * 1.8
  ) {
    const topCat = avgByCategory[0].category;
    const catLabel =
      topCat === "romantic"
        ? "ロマンティック"
        : topCat === "friendship"
          ? "友情"
          : topCat === "cocreation"
            ? "共創"
            : "コミュニティ";

    // Check if this is different from the category they actually like most
    const likedByCat: Partial<Record<RendezvousCategory, number>> = {};
    for (const c of candidates) {
      if (stateMap.get(c.id)?.state === "liked") {
        likedByCat[c.category] = (likedByCat[c.category] || 0) + 1;
      }
    }
    const likedEntries = Object.entries(likedByCat).sort(
      (a, b) => b[1] - a[1],
    );
    const topLikedCat = likedEntries[0]?.[0];

    if (topLikedCat && topLikedCat !== topCat) {
      return {
        id: generateId(),
        type: "hidden_priority",
        title: "本当に気になっているのは、別のもの",
        insight: `いいねは${topLikedCat === "romantic" ? "ロマンティック" : topLikedCat === "friendship" ? "友情" : topLikedCat === "cocreation" ? "共創" : "コミュニティ"}に集中していますが、最も長くプロフィールを見ているのは${catLabel}カテゴリです。行動が示す本当の関心は、あなたが自覚しているものとは違うかもしれません。`,
        evidence: [
          {
            description: "閲覧時間の偏り",
            dataPoint: `${catLabel}の平均閲覧時間は他カテゴリの1.8倍以上`,
          },
          {
            description: "いいねとの乖離",
            dataPoint: `いいねは別カテゴリに集中しているが、目は${catLabel}を追っている`,
          },
        ],
        significance: clamp01(0.65),
        tensionLevel: "moderate",
      };
    }
  }

  return null;
}

/**
 * growth_resistance: 成長を促す相手を避ける
 */
function detectGrowthResistance(
  candidates: RendezvousCandidate[],
  stateMap: Map<string, UserStateInput>,
): UnconsciousPattern | null {
  // Candidates with complementary_roles reason (growth potential) that were passed
  const complementaryPassed = candidates.filter((c) => {
    const state = stateMap.get(c.id);
    return (
      state?.state === "passed" &&
      c.reason_codes.includes("complementary_roles") &&
      c.overall_score > 0.6
    );
  });

  if (complementaryPassed.length >= 3) {
    return {
      id: generateId(),
      type: "growth_resistance",
      title: "成長の機会から目を背ける",
      insight: `「補完的な関係になれる」と判定された相手を${complementaryPassed.length}人パスしています。相性スコアも60%以上あるのに、自分と異なるタイプの相手を避ける傾向があります。変化を恐れているのかもしれません。`,
      evidence: [
        {
          description: "補完的相手のパス",
          dataPoint: `「補完的な役割」タグ付きの相手${complementaryPassed.length}人をパス`,
        },
        {
          description: "高スコアの拒否",
          dataPoint: `いずれもスコア60%以上の相手`,
        },
      ],
      significance: clamp01(0.55 + complementaryPassed.length * 0.07),
      tensionLevel: "gentle",
    };
  }

  return null;
}

/**
 * safety_seeking: 常に安全な選択をする
 */
function detectSafetySeeking(
  candidates: RendezvousCandidate[],
  stateMap: Map<string, UserStateInput>,
): UnconsciousPattern | null {
  const liked = candidates.filter(
    (c) => stateMap.get(c.id)?.state === "liked",
  );
  if (liked.length < 4) return null;

  // All liked candidates have no caution codes and moderate scores
  const allSafe = liked.every(
    (c) => c.caution_codes.length === 0 && c.overall_score >= 0.5 && c.overall_score <= 0.8,
  );

  // None of the liked candidates have high scores (adventurous choices)
  const noneExceptional = liked.every((c) => c.overall_score < 0.85);

  if (allSafe && noneExceptional && liked.length >= 5) {
    return {
      id: generateId(),
      type: "safety_seeking",
      title: "安全地帯の中だけで選んでいる",
      insight: `あなたがいいねを送る相手は全員、注意点がゼロで中程度のスコアを持つ「安全な」選択肢です。リスクを避けることは賢明ですが、最も深い繋がりは時に予想外の場所で生まれます。`,
      evidence: [
        {
          description: "注意点ゼロの選択",
          dataPoint: `いいねした${liked.length}人全員の注意点がゼロ`,
        },
        {
          description: "中程度スコアへの偏り",
          dataPoint: `全員がスコア50%〜80%の安全圏内`,
        },
      ],
      significance: clamp01(0.45 + liked.length * 0.04),
      tensionLevel: "gentle",
    };
  }

  return null;
}

/**
 * novelty_addiction: 新しい相手ばかり追い、関係を深められない
 */
function detectNoveltyAddiction(
  candidates: RendezvousCandidate[],
  stateMap: Map<string, UserStateInput>,
  messageStats: MessageStatInput[],
): UnconsciousPattern | null {
  const liked = candidates.filter(
    (c) => stateMap.get(c.id)?.state === "liked",
  );
  if (liked.length < 5) return null;

  const msgMap = new Map(messageStats.map((m) => [m.candidateId, m]));

  // Many likes but very few sustained conversations
  const withMessages = liked.filter((c) => {
    const msg = msgMap.get(c.id);
    return msg && msg.messageCount > 10;
  });

  const sustainedRatio = withMessages.length / liked.length;

  if (sustainedRatio < 0.2 && liked.length >= 6) {
    return {
      id: generateId(),
      type: "novelty_addiction",
      title: "新しさの甘い罠",
      insight: `${liked.length}人にいいねを送りながら、10通以上の会話に発展したのは${withMessages.length}人だけです。新しい出会いの刺激を求める一方で、一つの関係を深めることが難しくなっている可能性があります。`,
      evidence: [
        {
          description: "高いいいね率と低い継続率",
          dataPoint: `いいね${liked.length}人中、継続的会話は${withMessages.length}人のみ(${Math.round(sustainedRatio * 100)}%)`,
        },
        {
          description: "初期の興奮と持続の困難",
          dataPoint: `多くの関係が初期段階で停滞`,
        },
      ],
      significance: clamp01(0.6 + (1 - sustainedRatio) * 0.3),
      tensionLevel: "moderate",
    };
  }

  return null;
}

/**
 * projection_pattern: 自分自身を相手に投影している
 * 自分のスコアパターンに非常に近い相手だけを選ぶ場合
 */
function detectProjectionPattern(
  candidates: RendezvousCandidate[],
  stateMap: Map<string, UserStateInput>,
): UnconsciousPattern | null {
  const liked = candidates.filter(
    (c) => stateMap.get(c.id)?.state === "liked",
  );
  if (liked.length < 3) return null;

  // Check if a_to_b_score and b_to_a_score are very similar for liked candidates
  // This would mean they like people who mirror them
  const symmetricCount = liked.filter(
    (c) => Math.abs(c.a_to_b_score - c.b_to_a_score) < 0.08,
  ).length;
  const symmetricRatio = symmetricCount / liked.length;

  if (symmetricRatio > 0.7 && liked.length >= 4) {
    return {
      id: generateId(),
      type: "projection_pattern",
      title: "鏡の中の自分を探している",
      insight: `あなたが惹かれる相手は、驚くほど対称的な関係性を示しています。${liked.length}人中${symmetricCount}人で、あなたから相手へのスコアと相手からあなたへのスコアがほぼ同一です。相手の中に自分自身を見ているのかもしれません。`,
      evidence: [
        {
          description: "スコアの対称性",
          dataPoint: `${symmetricCount}/${liked.length}人で双方向スコアの差が8%未満`,
        },
        {
          description: "自己投影の可能性",
          dataPoint: `自分と似た反応をする相手を無意識に選択`,
        },
      ],
      significance: clamp01(0.5 + symmetricRatio * 0.3),
      tensionLevel: "gentle",
    };
  }

  return null;
}

// ---------- Main Detector ----------

export function detectUnconsciousPatterns(
  userId: string,
  candidates: RendezvousCandidate[],
  userStates: UserStateInput[],
  viewLogs: ViewLogInput[],
  messageStats: MessageStatInput[],
): UnconsciousPattern[] {
  if (candidates.length < 3) return [];

  const stateMap = new Map<string, UserStateInput>();
  for (const s of userStates) {
    stateMap.set(s.candidateId, s);
  }

  const detected: (UnconsciousPattern | null)[] = [
    detectAttractionAvoidance(candidates, stateMap, viewLogs),
    detectRepetitionCompulsion(candidates, stateMap),
    detectComfortZoneLock(candidates, stateMap),
    detectApproachRetreatCycle(candidates, stateMap, messageStats),
    detectIdealizationGap(candidates, stateMap),
    detectHiddenPriority(candidates, stateMap, viewLogs),
    detectGrowthResistance(candidates, stateMap),
    detectSafetySeeking(candidates, stateMap),
    detectNoveltyAddiction(candidates, stateMap, messageStats),
    detectProjectionPattern(candidates, stateMap),
  ];

  const patterns = detected.filter((p): p is UnconsciousPattern => p !== null);

  // Sort by significance, return max 5
  patterns.sort((a, b) => b.significance - a.significance);
  return patterns.slice(0, 5);
}
