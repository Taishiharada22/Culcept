/**
 * Human Proof Layer - 人間性の証明
 *
 * AIコンパニオンには決して再現できない、人間同士の接続を検出し祝福する。
 * 予測不能な同期、美しい矛盾、沈黙の意味、自発的な脆さ ── これらは人間だけの贈り物。
 */

import type { MatchingVector } from "./types";

// ============================================================
// Types
// ============================================================

export type HumanMomentType =
  | "unpredictable_sync"
  | "beautiful_contradiction"
  | "meaningful_silence"
  | "spontaneous_vulnerability"
  | "mutual_growth"
  | "creative_misunderstanding"
  | "rhythm_resonance"
  | "surprise_recognition";

export type HumanMomentRarity = "common" | "uncommon" | "rare" | "legendary";

export type HumanMoment = {
  id: string;
  type: HumanMomentType;
  title: string;
  description: string;
  evidence: string;
  rarity: HumanMomentRarity;
  detectedAt: string;
  candidateId: string;
};

export type SilenceProfile = {
  averageGapHours: number;
  longestGapHours: number;
  gapsThatLedToDeeper: number;
  silenceScore: number;
};

/** Minimal message shape expected by the detection engine */
export type HumanProofMessage = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

/** Sync experience result (minimal shape) */
export type SyncResultInput = {
  questionId: string;
  myAnswer: string | null;
  theirAnswer: string | null;
  resonanceType?: string | null;
};

/** Activity record (minimal shape) */
export type ActivityInput = {
  type: string;
  userId: string;
  payload?: Record<string, unknown>;
  createdAt: string;
};

/** Vector snapshot over time */
export type VectorSnapshotInput = {
  userId: string;
  vector: Partial<MatchingVector>;
  recordedAt: string;
};

// ============================================================
// Internal helpers
// ============================================================

const VULNERABILITY_KEYWORDS = [
  "不安",
  "怖い",
  "本当は",
  "正直",
  "初めて言う",
  "弱い",
  "泣いた",
  "辛い",
  "寂しい",
  "助けて",
  "誰にも",
  "打ち明ける",
  "言えなかった",
  "恥ずかしい",
  "自信がない",
  "ごめん",
  "許して",
];

function generateId(): string {
  return `hm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function hoursBetween(a: string, b: string): number {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60);
}

function averageLength(messages: HumanProofMessage[]): number {
  if (messages.length === 0) return 0;
  return messages.reduce((sum, m) => sum + m.content.length, 0) / messages.length;
}

function extractKeywords(text: string): Set<string> {
  // Simple keyword extraction: split on whitespace/punctuation, keep tokens >= 2 chars
  return new Set(
    text
      .replace(/[、。！？\s,.!?]+/g, " ")
      .split(" ")
      .map((w) => w.trim())
      .filter((w) => w.length >= 2),
  );
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ============================================================
// Poetic titles & descriptions by type
// ============================================================

type MomentMeta = { title: string; description: string };

function pickMomentMeta(type: HumanMomentType, evidence: string): MomentMeta {
  switch (type) {
    case "unpredictable_sync":
      return {
        title: "偶然の共鳴",
        description: `予測できない瞬間に、同じ言葉が生まれた。これは計算では作れない奇跡。`,
      };
    case "beautiful_contradiction":
      return {
        title: "美しい矛盾",
        description: `言葉と行動のあいだにある揺れ。それは、この関係が生きている証拠。`,
      };
    case "meaningful_silence":
      return {
        title: "沈黙のあとの深さ",
        description: `長い静寂のあとに生まれた言葉は、いつもより重い。沈黙も会話の一部。`,
      };
    case "spontaneous_vulnerability":
      return {
        title: "不意の素直さ",
        description: `ふいに現れた本音。守りを下ろした瞬間、本当のつながりが始まる。`,
      };
    case "mutual_growth":
      return {
        title: "同時変容",
        description: `二人が同じ方向に変わっていた。言葉にしなくても、影響し合っている証。`,
      };
    case "creative_misunderstanding":
      return {
        title: "創造的な誤解",
        description: `すれ違いが、新しい理解への扉を開いた。完璧な理解よりも深い何かが生まれた。`,
      };
    case "rhythm_resonance":
      return {
        title: "呼吸の同期",
        description: `返信のリズムが自然に揃ってきた。意識しなくても、二人の時間が合い始めている。`,
      };
    case "surprise_recognition":
      return {
        title: "記憶の贈り物",
        description: `ずっと前に話したことを覚えていた。注意を向けるということは、最も人間的な愛の形。`,
      };
  }
}

// ============================================================
// Detection: unpredictable_sync
// ============================================================

function detectUnpredictableSync(
  candidateId: string,
  syncResults: SyncResultInput[],
): HumanMoment[] {
  const moments: HumanMoment[] = [];

  for (const result of syncResults) {
    if (!result.myAnswer || !result.theirAnswer) continue;

    // Free-text match: check if answers share significant overlap
    const myLower = result.myAnswer.toLowerCase().trim();
    const theirLower = result.theirAnswer.toLowerCase().trim();

    const isFreeTextMatch =
      myLower === theirLower ||
      (myLower.length > 5 && theirLower.includes(myLower)) ||
      (theirLower.length > 5 && myLower.includes(theirLower));

    if (isFreeTextMatch) {
      const meta = pickMomentMeta("unpredictable_sync", result.myAnswer);
      moments.push({
        id: generateId(),
        type: "unpredictable_sync",
        title: meta.title,
        description: meta.description,
        evidence: `同期体験「${result.questionId}」で同じ回答`,
        rarity: "rare",
        detectedAt: new Date().toISOString(),
        candidateId,
      });
    }
  }

  return moments;
}

// ============================================================
// Detection: beautiful_contradiction
// ============================================================

function detectBeautifulContradiction(
  candidateId: string,
  messages: HumanProofMessage[],
  vectorSnapshots: VectorSnapshotInput[],
  myUserId: string,
): HumanMoment[] {
  const moments: HumanMoment[] = [];

  // Get my latest vector snapshot
  const mySnapshots = vectorSnapshots
    .filter((s) => s.userId === myUserId)
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());

  if (mySnapshots.length === 0) return moments;
  const latestVector = mySnapshots[0].vector;

  // Check: says they need distance (distance_need > 0.7) but messages frequently
  if (latestVector.distance_need !== undefined && latestVector.distance_need > 0.7) {
    const myMessages = messages.filter((m) => m.sender_id === myUserId);
    if (myMessages.length >= 10) {
      // Calculate average messages per day
      const sorted = [...myMessages].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      const span = hoursBetween(sorted[0].created_at, sorted[sorted.length - 1].created_at);
      const daysSpan = Math.max(span / 24, 1);
      const msgsPerDay = myMessages.length / daysSpan;

      if (msgsPerDay >= 3) {
        const meta = pickMomentMeta("beautiful_contradiction", "distance_need");
        moments.push({
          id: generateId(),
          type: "beautiful_contradiction",
          title: meta.title,
          description: meta.description,
          evidence: `距離を求める傾向があるのに、1日平均${msgsPerDay.toFixed(1)}通のメッセージ`,
          rarity: "uncommon",
          detectedAt: new Date().toISOString(),
          candidateId,
        });
      }
    }
  }

  // Check: low emotional_openness but sends long emotional messages
  if (latestVector.emotional_openness !== undefined && latestVector.emotional_openness < 0.3) {
    const myMessages = messages.filter((m) => m.sender_id === myUserId);
    const avgLen = averageLength(myMessages);
    const emotionalLong = myMessages.filter(
      (m) =>
        m.content.length > avgLen * 1.5 &&
        VULNERABILITY_KEYWORDS.some((kw) => m.content.includes(kw)),
    );
    if (emotionalLong.length >= 2) {
      const meta = pickMomentMeta("beautiful_contradiction", "emotional_openness");
      moments.push({
        id: generateId(),
        type: "beautiful_contradiction",
        title: meta.title,
        description: meta.description,
        evidence: `感情表現が控えめな傾向なのに、${emotionalLong.length}回の感情的なメッセージ`,
        rarity: "uncommon",
        detectedAt: new Date().toISOString(),
        candidateId,
      });
    }
  }

  return moments;
}

// ============================================================
// Detection: meaningful_silence
// ============================================================

function detectMeaningfulSilence(
  candidateId: string,
  messages: HumanProofMessage[],
  myUserId: string,
): HumanMoment[] {
  const moments: HumanMoment[] = [];
  if (messages.length < 5) return moments;

  const sorted = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const avgLen = averageLength(sorted);

  for (let i = 1; i < sorted.length; i++) {
    const gap = hoursBetween(sorted[i - 1].created_at, sorted[i].created_at);
    const msgLen = sorted[i].content.length;

    // Gap > 24h followed by message > 2x average length
    if (gap > 24 && msgLen > avgLen * 2) {
      const meta = pickMomentMeta("meaningful_silence", `${Math.round(gap)}h`);
      moments.push({
        id: generateId(),
        type: "meaningful_silence",
        title: meta.title,
        description: meta.description,
        evidence: `${Math.round(gap)}時間の沈黙の後、通常の${(msgLen / avgLen).toFixed(1)}倍の長さのメッセージ`,
        rarity: "common",
        detectedAt: sorted[i].created_at,
        candidateId,
      });
    }
  }

  // Keep at most 3 meaningful silences (most recent)
  return moments.slice(-3);
}

// ============================================================
// Detection: spontaneous_vulnerability
// ============================================================

function detectSpontaneousVulnerability(
  candidateId: string,
  messages: HumanProofMessage[],
): HumanMoment[] {
  const moments: HumanMoment[] = [];
  if (messages.length < 3) return moments;

  const avgLen = averageLength(messages);

  for (const msg of messages) {
    const hasKeyword = VULNERABILITY_KEYWORDS.some((kw) => msg.content.includes(kw));
    const isLonger = msg.content.length > avgLen * 1.3;

    if (hasKeyword && isLonger) {
      // Find which keyword matched for evidence
      const matched = VULNERABILITY_KEYWORDS.find((kw) => msg.content.includes(kw)) ?? "";
      const meta = pickMomentMeta("spontaneous_vulnerability", matched);
      moments.push({
        id: generateId(),
        type: "spontaneous_vulnerability",
        title: meta.title,
        description: meta.description,
        evidence: `「${matched}」を含む、通常より長いメッセージ`,
        rarity: "uncommon",
        detectedAt: msg.created_at,
        candidateId,
      });
    }
  }

  // Keep at most 3
  return moments.slice(-3);
}

// ============================================================
// Detection: mutual_growth
// ============================================================

function detectMutualGrowth(
  candidateId: string,
  vectorSnapshots: VectorSnapshotInput[],
  myUserId: string,
): HumanMoment[] {
  const moments: HumanMoment[] = [];

  // Need at least 2 snapshots per user
  const byUser = new Map<string, VectorSnapshotInput[]>();
  for (const snap of vectorSnapshots) {
    const arr = byUser.get(snap.userId) ?? [];
    arr.push(snap);
    byUser.set(snap.userId, arr);
  }

  if (byUser.size < 2) return moments;

  const users = Array.from(byUser.keys());
  const userASnaps = (byUser.get(users[0]) ?? []).sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
  );
  const userBSnaps = (byUser.get(users[1]) ?? []).sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
  );

  if (userASnaps.length < 2 || userBSnaps.length < 2) return moments;

  // Compare latest two snapshots for each user
  const aOld = userASnaps[userASnaps.length - 2].vector;
  const aNew = userASnaps[userASnaps.length - 1].vector;
  const bOld = userBSnaps[userBSnaps.length - 2].vector;
  const bNew = userBSnaps[userBSnaps.length - 1].vector;

  // Check how many axes shifted in the same direction
  const axes: (keyof MatchingVector)[] = [
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

  let sameDirectionCount = 0;
  const shiftedAxes: string[] = [];

  for (const axis of axes) {
    const aDelta = (aNew[axis] ?? 0) - (aOld[axis] ?? 0);
    const bDelta = (bNew[axis] ?? 0) - (bOld[axis] ?? 0);

    // Both shifted in same direction with meaningful magnitude
    if (Math.abs(aDelta) > 0.05 && Math.abs(bDelta) > 0.05 && Math.sign(aDelta) === Math.sign(bDelta)) {
      sameDirectionCount++;
      shiftedAxes.push(axis);
    }
  }

  if (sameDirectionCount >= 2) {
    const meta = pickMomentMeta("mutual_growth", shiftedAxes.join(","));
    moments.push({
      id: generateId(),
      type: "mutual_growth",
      title: meta.title,
      description: meta.description,
      evidence: `${sameDirectionCount}つの軸で同じ方向に変化（${shiftedAxes.slice(0, 2).join("、")}）`,
      rarity: "rare",
      detectedAt: new Date().toISOString(),
      candidateId,
    });
  }

  return moments;
}

// ============================================================
// Detection: rhythm_resonance
// ============================================================

function detectRhythmResonance(
  candidateId: string,
  messages: HumanProofMessage[],
): HumanMoment[] {
  const moments: HumanMoment[] = [];
  if (messages.length < 20) return moments;

  const sorted = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  // Compute reply times (time from previous message by other person to this message)
  const replyTimes: { time: number; index: number }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].sender_id !== sorted[i - 1].sender_id) {
      const gap = hoursBetween(sorted[i - 1].created_at, sorted[i].created_at);
      replyTimes.push({ time: gap, index: i });
    }
  }

  if (replyTimes.length < 10) return moments;

  // Split into first half and second half
  const mid = Math.floor(replyTimes.length / 2);
  const firstHalf = replyTimes.slice(0, mid).map((r) => r.time);
  const secondHalf = replyTimes.slice(mid).map((r) => r.time);

  const firstStd = stdDev(firstHalf);
  const secondStd = stdDev(secondHalf);

  // Standard deviation decreased by > 30% = rhythm syncing
  if (firstStd > 0 && secondStd < firstStd * 0.7) {
    const meta = pickMomentMeta("rhythm_resonance", "reply_sync");
    moments.push({
      id: generateId(),
      type: "rhythm_resonance",
      title: meta.title,
      description: meta.description,
      evidence: `返信リズムのばらつきが${Math.round((1 - secondStd / firstStd) * 100)}%減少`,
      rarity: "uncommon",
      detectedAt: new Date().toISOString(),
      candidateId,
    });
  }

  return moments;
}

// ============================================================
// Detection: surprise_recognition
// ============================================================

function detectSurpriseRecognition(
  candidateId: string,
  messages: HumanProofMessage[],
): HumanMoment[] {
  const moments: HumanMoment[] = [];
  if (messages.length < 10) return moments;

  const sorted = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  // For each message, check if it references keywords from messages >=5 messages ago by the other person
  for (let i = 7; i < sorted.length; i++) {
    const current = sorted[i];
    const currentKeywords = extractKeywords(current.content);

    // Look at messages from the other person, at least 5 messages before
    for (let j = 0; j <= i - 5; j++) {
      const old = sorted[j];
      if (old.sender_id === current.sender_id) continue;

      const oldKeywords = extractKeywords(old.content);

      // Count shared keywords (non-trivial)
      let shared = 0;
      const sharedWords: string[] = [];
      for (const kw of currentKeywords) {
        if (oldKeywords.has(kw) && kw.length >= 3) {
          shared++;
          sharedWords.push(kw);
        }
      }

      if (shared >= 2) {
        const meta = pickMomentMeta("surprise_recognition", sharedWords.join(","));
        moments.push({
          id: generateId(),
          type: "surprise_recognition",
          title: meta.title,
          description: meta.description,
          evidence: `${i - j}メッセージ前の話題「${sharedWords.slice(0, 2).join("、")}」を覚えていた`,
          rarity: "common",
          detectedAt: current.created_at,
          candidateId,
        });
        // Only detect once per current message
        break;
      }
    }
  }

  // Keep at most 3
  return moments.slice(-3);
}

// ============================================================
// Main detection function
// ============================================================

export function detectHumanMoments(
  candidateId: string,
  messages: HumanProofMessage[],
  syncResults: SyncResultInput[],
  _activities: ActivityInput[],
  vectorSnapshots: VectorSnapshotInput[],
  myUserId?: string,
): HumanMoment[] {
  const uid = myUserId ?? (messages.length > 0 ? messages[0].sender_id : "");

  const all: HumanMoment[] = [
    ...detectUnpredictableSync(candidateId, syncResults),
    ...detectBeautifulContradiction(candidateId, messages, vectorSnapshots, uid),
    ...detectMeaningfulSilence(candidateId, messages, uid),
    ...detectSpontaneousVulnerability(candidateId, messages),
    ...detectMutualGrowth(candidateId, vectorSnapshots, uid),
    ...detectRhythmResonance(candidateId, messages),
    ...detectSurpriseRecognition(candidateId, messages),
  ];

  // Sort by detectedAt descending
  all.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());

  return all;
}

// ============================================================
// Silence profile analysis
// ============================================================

export function analyzeSilenceProfile(
  messages: HumanProofMessage[],
  myUserId: string,
): SilenceProfile {
  if (messages.length < 3) {
    return { averageGapHours: 0, longestGapHours: 0, gapsThatLedToDeeper: 0, silenceScore: 0 };
  }

  const sorted = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(hoursBetween(sorted[i - 1].created_at, sorted[i].created_at));
  }

  const averageGapHours = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const longestGapHours = Math.max(...gaps);

  // Count gaps that led to deeper messages
  const avgLen = averageLength(sorted);
  let gapsThatLedToDeeper = 0;

  for (let i = 1; i < sorted.length; i++) {
    const gap = hoursBetween(sorted[i - 1].created_at, sorted[i].created_at);
    if (gap > averageGapHours * 1.5 && sorted[i].content.length > avgLen * 1.5) {
      gapsThatLedToDeeper++;
    }
  }

  // Silence score: how meaningful are the silences in this relationship?
  // Higher = silences tend to lead to deeper conversation
  const totalSignificantGaps = gaps.filter((g) => g > averageGapHours * 1.5).length;
  const silenceScore =
    totalSignificantGaps > 0
      ? Math.min(1, gapsThatLedToDeeper / totalSignificantGaps)
      : 0;

  return {
    averageGapHours: Math.round(averageGapHours * 10) / 10,
    longestGapHours: Math.round(longestGapHours * 10) / 10,
    gapsThatLedToDeeper,
    silenceScore: Math.round(silenceScore * 100) / 100,
  };
}

// ============================================================
// Human proof score
// ============================================================

const RARITY_WEIGHT: Record<HumanMomentRarity, number> = {
  common: 5,
  uncommon: 12,
  rare: 25,
  legendary: 50,
};

export function computeHumanProofScore(moments: HumanMoment[]): number {
  if (moments.length === 0) return 0;

  let raw = 0;
  for (const m of moments) {
    raw += RARITY_WEIGHT[m.rarity];
  }

  // Diversity bonus: unique types get a 1.2x multiplier
  const uniqueTypes = new Set(moments.map((m) => m.type)).size;
  const diversityMultiplier = 1 + uniqueTypes * 0.05;

  const score = Math.min(100, Math.round(raw * diversityMultiplier));
  return score;
}

// ============================================================
// Narrative generation
// ============================================================

const NARRATIVE_TEMPLATES: { minScore: number; templates: string[] }[] = [
  {
    minScore: 80,
    templates: [
      "この関係には、AIには決して生まれない予測不能な温かさがある。",
      "言葉の裏にある沈黙も、矛盾も、すべてが人間同士だからこそ生まれる宝物。",
      "計算では辿り着けない場所に、二人はすでに立っている。",
    ],
  },
  {
    minScore: 50,
    templates: [
      "沈黙の後に生まれる言葉の重さ。これは、人間同士だけの贈り物。",
      "完璧じゃないからこそ美しい。この関係は確かに生きている。",
      "予測を超えた瞬間が、少しずつ積み重なっている。",
    ],
  },
  {
    minScore: 20,
    templates: [
      "まだ小さな芽だけど、人間同士にしか生まれない何かが育ち始めている。",
      "会話の中に、計算では作れない温もりの兆しがある。",
    ],
  },
  {
    minScore: 0,
    templates: [
      "人間の証はこれから。会話を続ければ、必ず予測不能な瞬間が訪れる。",
      "すべての関係は、最初の一歩から始まる。",
    ],
  },
];

export function generateHumanProofNarrative(moments: HumanMoment[]): string {
  const score = computeHumanProofScore(moments);

  for (const tier of NARRATIVE_TEMPLATES) {
    if (score >= tier.minScore) {
      // Deterministic pick based on moment count
      const idx = moments.length % tier.templates.length;
      return tier.templates[idx];
    }
  }

  return NARRATIVE_TEMPLATES[NARRATIVE_TEMPLATES.length - 1].templates[0];
}
