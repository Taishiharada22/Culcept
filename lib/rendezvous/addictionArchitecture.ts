// ============================================================
// Addiction Architecture — 中毒設計
// Variable reward timing, streaks, time constraints
// 「やめられない」仕組みを設計する
// ============================================================

// ---------- Types ----------

export type StreakTier = "none" | "bronze" | "silver" | "gold" | "platinum";

export type StreakBonus = {
  days: number;
  tier: StreakTier;
  label: string;
  perks: string[];
};

export type DailyMysteryType =
  | "new_encounter"
  | "insight_unlock"
  | "sync_invitation"
  | "phantom_boost"
  | "mirror_update"
  | "catalyst_reveal";

export type DailyMystery = {
  type: DailyMysteryType;
  hint: string;
  availableAt: string;
  revealed: boolean;
};

export type TimeGateType = "daily_encounter" | "weekly_mirror" | "sync_cooldown";

export type TimeGate = {
  type: TimeGateType;
  opensAt: string;
  label: string;
  description: string;
};

export type EngagementLoop = {
  /** 今日のストリーク日数 */
  streakDays: number;
  /** ストリークボーナス */
  streakBonus: StreakBonus;
  /** 次の「開封」までのカウントダウン (seconds, null if available now) */
  nextRevealIn: number | null;
  /** 今日の変動報酬 */
  dailyMystery: DailyMystery;
  /** エンゲージメントスコア (0..100) */
  engagementScore: number;
  /** 呼び戻しメッセージ */
  pullbackMessage: string | null;
};

// ---------- Constants ----------

const STREAK_TIERS: { minDays: number; tier: StreakTier; label: string; perks: string[] }[] = [
  {
    minDays: 30,
    tier: "platinum",
    label: "共鳴の悟り",
    perks: [
      "全機能アンロック",
      "週次ミラーアップデート",
      "カタリストリビール優先",
      "深層パターン分析",
    ],
  },
  {
    minDays: 14,
    tier: "gold",
    label: "共鳴の深化",
    perks: [
      "無意識パターン解放",
      "カタリストリビール",
      "ファントムシグナル強化",
    ],
  },
  {
    minDays: 7,
    tier: "silver",
    label: "共鳴の流れ",
    perks: [
      "ファントムシグナル優先",
      "シンク招待権",
      "追加インサイト表示",
    ],
  },
  {
    minDays: 3,
    tier: "bronze",
    label: "共鳴の芽生え",
    perks: [
      "追加インサイト1件表示",
    ],
  },
  {
    minDays: 0,
    tier: "none",
    label: "",
    perks: [],
  },
];

const MYSTERY_TYPES: DailyMysteryType[] = [
  "new_encounter",
  "insight_unlock",
  "sync_invitation",
  "phantom_boost",
  "mirror_update",
  "catalyst_reveal",
];

const MYSTERY_HINTS: Record<DailyMysteryType, string[]> = {
  new_encounter: [
    "今日、新しい出会いの扉が開くかもしれません",
    "まだ見ぬ誰かが、あなたを待っています",
    "新しい共鳴が、準備されています",
  ],
  insight_unlock: [
    "あなたの関係性に、新しい発見が隠されています",
    "今日、あなた自身について何か知るかもしれません",
    "インサイトの鍵が、もうすぐ見つかります",
  ],
  sync_invitation: [
    "誰かと同期する機会が近づいています",
    "今日は、特別なシンクロの日かもしれません",
    "共鳴する相手との接点が、生まれようとしています",
  ],
  phantom_boost: [
    "ファントムの力が、今日は特別に強まっています",
    "見えない共鳴が、今日はより鮮明に届きます",
    "気配の解像度が、今日は上がっています",
  ],
  mirror_update: [
    "あなたの鏡が、新しい姿を映し始めました",
    "関係性の鏡に、新しい光が差しています",
    "自己理解の新しい層が、見えてきそうです",
  ],
  catalyst_reveal: [
    "今日、触媒となる何かが明かされます",
    "変化のきっかけが、近づいています",
    "あなたの成長を加速する何かが、準備されています",
  ],
};

const PULLBACK_MESSAGES: { minDays: number; message: string }[] = [
  { minDays: 7, message: "あなたがいない間も、あなたの物語は動いています" },
  { minDays: 5, message: "あなたの関係性の鏡が、新しい姿を映し始めました" },
  { minDays: 3, message: "誰かが、あなたとの共鳴を感じています" },
  { minDays: 2, message: "あなたの星座に、新しい光が見えています" },
];

/** Premium mystery types (appear less frequently, feel more special) */
const PREMIUM_MYSTERY_TYPES: Set<DailyMysteryType> = new Set([
  "catalyst_reveal",
  "mirror_update",
  "sync_invitation",
]);

// ---------- Helpers ----------

/**
 * Deterministic hash for seeded randomness
 */
function seededHash(seed: string): number {
  let h = 0x9e3779b9;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 0x5bd1e995);
    h ^= h >>> 15;
  }
  return Math.abs(h);
}

/**
 * Get today's date string (YYYY-MM-DD) in local time
 */
function todayDateStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Compute consecutive streak days from a sorted list of login date strings.
 * Dates should be ISO format (YYYY-MM-DD), most recent first not required — we sort internally.
 */
function computeConsecutiveDays(loginDates: string[]): number {
  if (loginDates.length === 0) return 0;

  // Deduplicate and sort descending
  const unique = [...new Set(loginDates)].sort().reverse();
  const today = todayDateStr();

  // Must include today (or yesterday if checking before midnight)
  const mostRecent = unique[0];
  const diffFromToday = daysBetween(mostRecent, today);
  if (diffFromToday > 1) return 0; // streak broken

  let streak = 1;
  for (let i = 1; i < unique.length; i++) {
    const diff = daysBetween(unique[i], unique[i - 1]);
    if (diff === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 86_400_000;
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round(Math.abs(db.getTime() - da.getTime()) / msPerDay);
}

function getTierForDays(days: number): typeof STREAK_TIERS[number] {
  for (const tier of STREAK_TIERS) {
    if (days >= tier.minDays) return tier;
  }
  return STREAK_TIERS[STREAK_TIERS.length - 1];
}

// ---------- Main API ----------

/**
 * Compute streak from login dates
 */
export function computeStreak(loginDates: string[]): { days: number; tier: StreakTier } {
  const days = computeConsecutiveDays(loginDates);
  const tierInfo = getTierForDays(days);
  return { days, tier: tierInfo.tier };
}

/**
 * Generate daily mystery (one per day, seeded by date + userId)
 * Variable reward: mystery type is unpredictable but deterministic for same user+date
 */
export function generateDailyMystery(
  userId: string,
  date: string,
  connectionCount: number,
): DailyMystery {
  const seed = seededHash(`${userId}-${date}-mystery`);

  // Determine type: premium types appear ~25% of the time
  const isPremiumDay = seed % 4 === 0;
  let type: DailyMysteryType;

  if (isPremiumDay) {
    const premiumArr = MYSTERY_TYPES.filter((t) => PREMIUM_MYSTERY_TYPES.has(t));
    type = premiumArr[seed % premiumArr.length];
  } else {
    const regularArr = MYSTERY_TYPES.filter((t) => !PREMIUM_MYSTERY_TYPES.has(t));
    type = regularArr[seed % regularArr.length];
  }

  // Adjust type based on connection count
  if (connectionCount === 0 && type === "sync_invitation") {
    type = "new_encounter";
  }

  // Pick hint
  const hints = MYSTERY_HINTS[type];
  const hintSeed = seededHash(`${userId}-${date}-hint`);
  const hint = hints[hintSeed % hints.length];

  // Available time: random hour between 9-20, seeded
  const availableHour = 9 + (seed % 12);
  const availableMinute = (seededHash(`${userId}-${date}-min`) % 4) * 15;
  const availableAt = `${date}T${String(availableHour).padStart(2, "0")}:${String(availableMinute).padStart(2, "0")}:00`;

  return {
    type,
    hint,
    availableAt,
    revealed: false,
  };
}

/**
 * Compute time gates for the user
 */
export function computeTimeGates(
  lastEncounterDeliveredAt: string | null,
  lastMirrorUpdateAt: string | null,
  lastSyncCompletedAt: string | null,
): TimeGate[] {
  const gates: TimeGate[] = [];
  const now = Date.now();

  // Daily encounter: next one available 20 hours after last delivery
  if (lastEncounterDeliveredAt) {
    const nextEncounter = new Date(lastEncounterDeliveredAt).getTime() + 20 * 3600_000;
    if (nextEncounter > now) {
      gates.push({
        type: "daily_encounter",
        opensAt: new Date(nextEncounter).toISOString(),
        label: "次の出会い",
        description: "新しい出会いの準備中です",
      });
    }
  }

  // Weekly mirror: available 7 days after last update
  if (lastMirrorUpdateAt) {
    const nextMirror = new Date(lastMirrorUpdateAt).getTime() + 7 * 86_400_000;
    if (nextMirror > now) {
      gates.push({
        type: "weekly_mirror",
        opensAt: new Date(nextMirror).toISOString(),
        label: "関係性ミラー更新",
        description: "あなたの鏡が新しい姿を映す準備をしています",
      });
    }
  }

  // Sync cooldown: 4 hours after last sync
  if (lastSyncCompletedAt) {
    const nextSync = new Date(lastSyncCompletedAt).getTime() + 4 * 3600_000;
    if (nextSync > now) {
      gates.push({
        type: "sync_cooldown",
        opensAt: new Date(nextSync).toISOString(),
        label: "シンクセッション",
        description: "次のシンクまで少しお待ちください",
      });
    }
  }

  return gates;
}

/**
 * Generate pullback message for inactive users
 */
export function generatePullbackMessage(
  daysSinceLastLogin: number,
  _streakDays: number,
  _pendingCount: number,
): string | null {
  if (daysSinceLastLogin <= 1) return null;

  for (const { minDays, message } of PULLBACK_MESSAGES) {
    if (daysSinceLastLogin >= minDays) return message;
  }
  return null;
}

/**
 * Compute full engagement loop state for a user
 */
export function computeEngagementLoop(
  userId: string,
  lastLoginDates: string[],
  actionsToday: number,
  pendingEncounters: number,
  hasPendingSync: boolean,
): EngagementLoop {
  const today = todayDateStr();
  const { days: streakDays, tier } = computeStreak(lastLoginDates);
  const tierInfo = getTierForDays(streakDays);

  const streakBonus: StreakBonus = {
    days: streakDays,
    tier,
    label: tierInfo.label,
    perks: tierInfo.perks,
  };

  // Generate daily mystery
  const dailyMystery = generateDailyMystery(userId, today, pendingEncounters);

  // Compute nextRevealIn
  const mysteryAvailableAt = new Date(dailyMystery.availableAt).getTime();
  const now = Date.now();
  const nextRevealIn =
    dailyMystery.revealed || mysteryAvailableAt <= now
      ? null
      : Math.ceil((mysteryAvailableAt - now) / 1000);

  // Engagement score: composite of streak, actions, pending items
  const streakComponent = Math.min(streakDays * 3, 30); // max 30
  const actionComponent = Math.min(actionsToday * 5, 30); // max 30
  const pendingComponent = Math.min(pendingEncounters * 10, 20); // max 20
  const syncComponent = hasPendingSync ? 20 : 0; // 20 if pending
  const engagementScore = Math.min(
    100,
    streakComponent + actionComponent + pendingComponent + syncComponent,
  );

  // Pullback message
  const daysSinceLastLogin =
    lastLoginDates.length > 0
      ? daysBetween([...lastLoginDates].sort().reverse()[0], today)
      : 999;
  const pullbackMessage = generatePullbackMessage(
    daysSinceLastLogin,
    streakDays,
    pendingEncounters,
  );

  return {
    streakDays,
    streakBonus,
    nextRevealIn,
    dailyMystery,
    engagementScore,
    pullbackMessage,
  };
}
