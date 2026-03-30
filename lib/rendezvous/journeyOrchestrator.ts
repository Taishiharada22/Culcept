// =============================================================================
// Journey Orchestrator — Rendezvous 関係性ジャーニーの中枢エンジン
// =============================================================================
// 14+ の Rendezvous 機能を関係性の成熟度に基づいてシーケンス制御する

// ---------- Types ----------

export type JourneyStage =
  | "spark" // マッチ直後、0-2 メッセージ
  | "kindling" // 初期会話、3-15 メッセージ
  | "flame" // アクティブ、16-50 メッセージ、定期連絡
  | "glow" // 深い繋がり、50+ メッセージ、マイルストーン達成
  | "ember" // 成熟/冷却、頻度は減るが深い
  | "constellation"; // 長期的、完全にマッピングされた関係

export type JourneyAction = {
  id: string;
  featureKey: string;
  label: string;
  description: string;
  icon: string;
  priority: number; // 0-1
  unlockReason: string;
  isNew: boolean;
  estimatedMinutes?: number;
  requiresBothUsers: boolean;
};

export type JourneyState = {
  candidateId: string;
  stage: JourneyStage;
  stageLabel: string;
  stageDescription: string;
  stageProgress: number; // 0-1
  availableActions: JourneyAction[];
  nextMilestone: { label: string; progress: number } | null;
  unlockedFeatures: string[];
  lockedFeatures: { key: string; unlockHint: string }[];
};

// ---------- Stage metadata ----------

const STAGE_META: Record<
  JourneyStage,
  { label: string; description: string }
> = {
  spark: {
    label: "スパーク",
    description: "出会いの瞬間。最初の印象が生まれている。",
  },
  kindling: {
    label: "キンドリング",
    description: "会話が芽吹き始めた。お互いを探っている段階。",
  },
  flame: {
    label: "フレイム",
    description: "活発なやり取り。関係が熱を帯びている。",
  },
  glow: {
    label: "グロウ",
    description: "深い繋がり。信頼と理解が育っている。",
  },
  ember: {
    label: "エンバー",
    description: "成熟した関係。静かだが深い絆がある。",
  },
  constellation: {
    label: "コンステレーション",
    description: "星座のように完成された関係。すべてが開かれている。",
  },
};

// ---------- Feature definitions ----------

type FeatureDef = {
  key: string;
  label: string;
  description: string;
  icon: string;
  estimatedMinutes?: number;
  requiresBothUsers: boolean;
  stages: JourneyStage[];
  /** Sub-condition: gentle only in flame, all in glow+ etc. */
  condition?: (ctx: FeatureContext) => boolean;
};

type FeatureContext = {
  stage: JourneyStage;
  messageCount: number;
  milestonesCount: number;
  completedActivities: string[];
};

const FEATURE_DEFS: FeatureDef[] = [
  // spark
  {
    key: "encounter_theatre",
    label: "出会いの劇場",
    description: "マッチの背景にあるストーリーを体験する",
    icon: "\u{1F3AD}",
    estimatedMinutes: 3,
    requiresBothUsers: false,
    stages: ["spark", "kindling", "flame", "glow", "ember", "constellation"],
  },
  {
    key: "instant_chemistry",
    label: "インスタント・ケミストリー",
    description: "最初の直感的な相性を可視化する",
    icon: "\u{26A1}",
    estimatedMinutes: 2,
    requiresBothUsers: false,
    stages: ["spark", "kindling", "flame", "glow", "ember", "constellation"],
  },
  // kindling
  {
    key: "contextual_prompt",
    label: "文脈プロンプト",
    description: "今の関係に最適な会話のきっかけを提案する",
    icon: "\u{1F4AC}",
    estimatedMinutes: 1,
    requiresBothUsers: false,
    stages: ["kindling", "flame", "glow", "ember", "constellation"],
  },
  {
    key: "phantom_presence",
    label: "ファントム・プレゼンス",
    description: "相手の存在を微かに感じる体験",
    icon: "\u{1F47B}",
    estimatedMinutes: 1,
    requiresBothUsers: false,
    stages: ["kindling", "flame", "glow", "ember", "constellation"],
  },
  {
    key: "sync_experience",
    label: "シンク体験",
    description: "同期的な体験を通じて繋がりを深める",
    icon: "\u{1F300}",
    estimatedMinutes: 5,
    requiresBothUsers: true,
    stages: ["kindling", "flame", "glow", "ember", "constellation"],
    condition: (ctx) => {
      // kindling: first sync only
      if (ctx.stage === "kindling") {
        return !ctx.completedActivities.includes("sync_experience");
      }
      return true;
    },
  },
  // flame
  {
    key: "voice_resonance",
    label: "ボイス・レゾナンス",
    description: "声で繋がる。声のトーンから相性を読み取る",
    icon: "\u{1F3A4}",
    estimatedMinutes: 5,
    requiresBothUsers: true,
    stages: ["flame", "glow", "ember", "constellation"],
  },
  {
    key: "tension_prompt",
    label: "テンション・プロンプト",
    description: "関係の緊張を建設的に扱うきっかけ",
    icon: "\u{1F525}",
    estimatedMinutes: 3,
    requiresBothUsers: false,
    stages: ["flame", "glow", "ember", "constellation"],
    condition: (ctx) => {
      // flame: gentle only
      if (ctx.stage === "flame") return ctx.messageCount >= 20;
      return true;
    },
  },
  {
    key: "growth_catalyst_view",
    label: "成長カタリスト",
    description: "お互いの成長を促すインサイトを発見する",
    icon: "\u{1F331}",
    estimatedMinutes: 4,
    requiresBothUsers: false,
    stages: ["flame", "glow", "ember", "constellation"],
  },
  {
    key: "addiction_streak",
    label: "アディクション・ストリーク",
    description: "連続コミュニケーションの記録を楽しむ",
    icon: "\u{1F4A5}",
    estimatedMinutes: 1,
    requiresBothUsers: false,
    stages: ["flame", "glow", "ember", "constellation"],
  },
  // glow
  {
    key: "community_resonance",
    label: "コミュニティ共鳴",
    description: "共有するコミュニティを通じた繋がりを探る",
    icon: "\u{1F310}",
    estimatedMinutes: 5,
    requiresBothUsers: false,
    stages: ["glow", "ember", "constellation"],
  },
  {
    key: "absence_design",
    label: "不在のデザイン",
    description: "距離がもたらす気づきを体験する",
    icon: "\u{1F319}",
    estimatedMinutes: 2,
    requiresBothUsers: false,
    stages: ["glow", "ember", "constellation"],
  },
  // ember
  {
    key: "relationship_mirror",
    label: "関係性ミラー",
    description: "関係の全体像を鏡のように映し出す",
    icon: "\u{1FA9E}",
    estimatedMinutes: 5,
    requiresBothUsers: false,
    stages: ["ember", "constellation"],
  },
  {
    key: "unconscious_patterns",
    label: "無意識パターン",
    description: "関係における無意識の行動パターンを発見する",
    icon: "\u{1F9E0}",
    estimatedMinutes: 5,
    requiresBothUsers: false,
    stages: ["ember", "constellation"],
  },
  {
    key: "graduation_option",
    label: "卒業オプション",
    description: "関係の次の段階について考える",
    icon: "\u{1F393}",
    estimatedMinutes: 3,
    requiresBothUsers: false,
    stages: ["ember", "constellation"],
  },
  // constellation
  {
    key: "temporal_matching",
    label: "テンポラル・マッチング",
    description: "時間軸を超えた相性の深さを探る",
    icon: "\u{231B}",
    estimatedMinutes: 5,
    requiresBothUsers: true,
    stages: ["constellation"],
  },
  {
    key: "full_vulnerability",
    label: "フル・ヴァルネラビリティ",
    description: "完全な開示の中で最も深い繋がりを体験する",
    icon: "\u{1F49C}",
    estimatedMinutes: 10,
    requiresBothUsers: true,
    stages: ["constellation"],
  },
];

// ---------- Stage detection ----------

export function detectJourneyStage(
  messageCount: number,
  daysSinceFirst: number,
  milestonesCount: number,
  lastMessageDaysAgo: number,
): JourneyStage {
  // constellation: deep long-term relationship
  if (milestonesCount >= 5 && daysSinceFirst > 30) {
    return "constellation";
  }

  // ember: cooling or mature low-frequency
  if (
    lastMessageDaysAgo > 7 ||
    (daysSinceFirst > 60 && messageCount / Math.max(daysSinceFirst, 1) < 0.5)
  ) {
    return "ember";
  }

  // glow: deep connection
  if (milestonesCount >= 3 && messageCount >= 50) {
    return "glow";
  }

  // flame: active engagement
  if (messageCount >= 16 && messageCount < 50 && lastMessageDaysAgo < 3) {
    // Also catch 50+ messages that don't meet glow criteria
    return "flame";
  }
  if (messageCount >= 50 && lastMessageDaysAgo < 3 && milestonesCount < 3) {
    return "flame";
  }

  // kindling: early conversation
  if (messageCount >= 3 && messageCount < 16 && daysSinceFirst < 14) {
    return "kindling";
  }
  // If 3-15 messages but daysSinceFirst >= 14, still kindling (slow start)
  if (messageCount >= 3 && messageCount < 16) {
    return "kindling";
  }

  // spark: just matched
  return "spark";
}

// ---------- Stage progress ----------

function computeStageProgress(
  stage: JourneyStage,
  messageCount: number,
  daysSinceFirst: number,
  milestonesCount: number,
): number {
  switch (stage) {
    case "spark":
      return Math.min(messageCount / 3, 0.99);
    case "kindling":
      return Math.min((messageCount - 3) / 13, 0.99);
    case "flame":
      return Math.min((messageCount - 16) / 34, 0.99);
    case "glow": {
      const msgProg = Math.min((messageCount - 50) / 50, 0.5);
      const mileProg = Math.min((milestonesCount - 3) / 2, 0.5);
      return Math.min(msgProg + mileProg, 0.99);
    }
    case "ember":
      return Math.min(daysSinceFirst / 90, 0.99);
    case "constellation":
      return Math.min(milestonesCount / 10, 0.99);
  }
}

// ---------- Next milestone ----------

function computeNextMilestone(
  stage: JourneyStage,
  messageCount: number,
  milestonesCount: number,
): { label: string; progress: number } | null {
  switch (stage) {
    case "spark":
      return {
        label: "最初の会話を3回交わす",
        progress: Math.min(messageCount / 3, 1),
      };
    case "kindling":
      return {
        label: "16回目のメッセージに到達する",
        progress: Math.min(messageCount / 16, 1),
      };
    case "flame":
      return {
        label: "50回のメッセージ + 3つのマイルストーン",
        progress: Math.min(
          (messageCount / 50 + milestonesCount / 3) / 2,
          1,
        ),
      };
    case "glow":
      return {
        label: "5つのマイルストーンを達成する",
        progress: Math.min(milestonesCount / 5, 1),
      };
    case "ember":
      return {
        label: "関係の全体像を完成させる",
        progress: Math.min(milestonesCount / 7, 1),
      };
    case "constellation":
      return null; // Final stage
  }
}

// ---------- Journey state computation ----------

export type SeasonData = {
  currentSeason?: string;
  seasonPhaseCount?: number;
};

export function computeJourneyState(
  candidateId: string,
  stage: JourneyStage,
  messageCount: number,
  milestones: { type: string; reachedAt: string }[],
  completedActivities: string[],
  seasonData: SeasonData | null,
): JourneyState {
  const meta = STAGE_META[stage];
  const milestonesCount = milestones.length;

  const featureCtx: FeatureContext = {
    stage,
    messageCount,
    milestonesCount,
    completedActivities,
  };

  // Determine unlocked and locked features
  const stageOrder: JourneyStage[] = [
    "spark",
    "kindling",
    "flame",
    "glow",
    "ember",
    "constellation",
  ];
  const currentStageIdx = stageOrder.indexOf(stage);

  const unlockedFeatures: string[] = [];
  const lockedFeatures: { key: string; unlockHint: string }[] = [];
  const availableActions: JourneyAction[] = [];

  for (const def of FEATURE_DEFS) {
    // Check if any of the feature's stages have been reached
    const featureMinStageIdx = Math.min(
      ...def.stages.map((s) => stageOrder.indexOf(s)),
    );

    if (featureMinStageIdx > currentStageIdx) {
      // Feature is locked: not at the right stage yet
      const requiredStage = stageOrder[featureMinStageIdx];
      lockedFeatures.push({
        key: def.key,
        unlockHint: `${STAGE_META[requiredStage].label}ステージに到達すると解放されます`,
      });
      continue;
    }

    // Check if current stage is in the feature's allowed stages
    if (!def.stages.includes(stage)) {
      continue;
    }

    // Check sub-condition
    if (def.condition && !def.condition(featureCtx)) {
      continue;
    }

    unlockedFeatures.push(def.key);

    const isNew = !completedActivities.includes(def.key);
    const unlockReason = buildUnlockReason(def.key, stage, messageCount);

    availableActions.push({
      id: `${candidateId}_${def.key}`,
      featureKey: def.key,
      label: def.label,
      description: def.description,
      icon: def.icon,
      priority: computeActionPriority(def, isNew, stage, completedActivities),
      unlockReason,
      isNew,
      estimatedMinutes: def.estimatedMinutes,
      requiresBothUsers: def.requiresBothUsers,
    });
  }

  // Sort by priority descending
  availableActions.sort((a, b) => b.priority - a.priority);

  const daysSinceFirst = milestones.length > 0
    ? Math.floor(
        (Date.now() - new Date(milestones[0].reachedAt).getTime()) /
          (24 * 60 * 60 * 1000),
      )
    : 0;

  return {
    candidateId,
    stage,
    stageLabel: meta.label,
    stageDescription: meta.description,
    stageProgress: computeStageProgress(
      stage,
      messageCount,
      daysSinceFirst,
      milestonesCount,
    ),
    availableActions,
    nextMilestone: computeNextMilestone(stage, messageCount, milestonesCount),
    unlockedFeatures,
    lockedFeatures,
  };
}

// ---------- Unlock reason generation ----------

function buildUnlockReason(
  featureKey: string,
  stage: JourneyStage,
  messageCount: number,
): string {
  const reasons: Record<string, string> = {
    encounter_theatre: "マッチが成立した。出会いの物語を体験できる。",
    instant_chemistry: "最初の直感的な相性が見える段階に入った。",
    contextual_prompt: `会話が${messageCount}回に達した。文脈に合ったきっかけを提案できる。`,
    phantom_presence: "会話が始まった。相手の気配を感じる準備ができている。",
    sync_experience:
      stage === "kindling"
        ? "初めてのシンク体験ができる段階に入った。"
        : "より深いシンク体験が解放された。",
    voice_resonance: `会話が${messageCount}回を超えた。声で繋がる準備ができている。`,
    tension_prompt:
      stage === "flame"
        ? "関係が活発になった。穏やかなテンションプロンプトが利用可能。"
        : "すべてのレベルのテンションプロンプトが解放された。",
    growth_catalyst_view: "十分な会話データがある。成長のきっかけが見つかる。",
    addiction_streak: "定期的なやり取りが始まった。連続記録を楽しもう。",
    community_resonance:
      "深い繋がりが育っている。共有するコミュニティを探れる。",
    absence_design: "関係が深まった。距離の価値を体験できる。",
    relationship_mirror: "成熟した関係。全体像を映し出す準備ができた。",
    unconscious_patterns: "長い関係の中で無意識のパターンが見えてきた。",
    graduation_option: "関係が成熟した。次の段階について考える時が来た。",
    temporal_matching:
      "星座の段階に到達した。時間を超えた相性を探れる。",
    full_vulnerability:
      "最も深い関係性の段階。完全な開示の中で繋がれる。",
  };

  return reasons[featureKey] ?? "新しい体験が利用可能になった。";
}

// ---------- Action priority computation ----------

function computeActionPriority(
  def: FeatureDef,
  isNew: boolean,
  stage: JourneyStage,
  completedActivities: string[],
): number {
  let priority = 0.5;

  // New unlocks get boosted
  if (isNew) {
    priority += 0.25;
  }

  // Features matching exactly the current stage get a slight boost
  const stageOrder: JourneyStage[] = [
    "spark",
    "kindling",
    "flame",
    "glow",
    "ember",
    "constellation",
  ];
  const featureMinStageIdx = Math.min(
    ...def.stages.map((s) => stageOrder.indexOf(s)),
  );
  const currentStageIdx = stageOrder.indexOf(stage);
  if (featureMinStageIdx === currentStageIdx) {
    priority += 0.1;
  }

  // Features requiring both users get a slight boost (more engaging)
  if (def.requiresBothUsers) {
    priority += 0.05;
  }

  // Time-sensitive features (sync, voice) get boosted during typical active hours
  const hour = new Date().getHours();
  const isActiveHours = hour >= 9 && hour <= 23;
  if (
    isActiveHours &&
    (def.key === "sync_experience" || def.key === "voice_resonance")
  ) {
    priority += 0.1;
  }

  // Diversity: if the last completed activity is the same, reduce priority
  if (completedActivities.length > 0) {
    const lastCompleted = completedActivities[completedActivities.length - 1];
    if (lastCompleted === def.key) {
      priority -= 0.3;
    }
  }

  return Math.max(0, Math.min(1, priority));
}

// ---------- Next recommended action ----------

export function getNextRecommendedAction(
  state: JourneyState,
): JourneyAction | null {
  if (state.availableActions.length === 0) return null;
  // Already sorted by priority descending
  return state.availableActions[0];
}
