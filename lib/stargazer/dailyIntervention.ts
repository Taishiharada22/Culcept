// lib/stargazer/dailyIntervention.ts
// Daily Intervention Engine — 1日を通じた介入設計
//
// 朝・昼・夕・夜の4フェーズで、ユーザーの状態に応じた
// パーソナライズされた介入メッセージを生成する。
//
// 設計原則:
// - 汎用文禁止: すべてのメッセージは軸スコアと状態に基づく
// - 押しつけない: 提案は「〜かもしれません」のトーン
// - 状態変化を追跡: 各フェーズが次のフェーズへのインプットになる

import type { TraitAxisKey } from "./traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type InterventionPhase = "morning" | "noon" | "evening" | "night";

export interface DailyState {
  userId: string;
  date: string;
  /** エネルギー推定値 -1 to 1 */
  estimatedEnergy: number;
  /** 社交バッテリー 0-1 */
  estimatedSocialBattery: number;
  /** 認知負荷 0-1 */
  estimatedCognitiveLoad: number;
  /** ストレス推定 0-1 */
  estimatedStress: number;
  /** 今日のズレやすさ 0-5 */
  vulnerabilityScore: number;
  /** ズレやすさの要因 */
  vulnerabilityFactors: string[];
  /** フェーズ別介入 */
  phases: Partial<Record<InterventionPhase, PhaseIntervention>>;
}

export interface PhaseIntervention {
  phase: InterventionPhase;
  /** メイン表示テキスト（日本語） */
  message: string;
  /** 状態更新 */
  stateUpdate?: Partial<
    Pick<DailyState, "estimatedEnergy" | "estimatedSocialBattery" | "estimatedCognitiveLoad" | "estimatedStress">
  >;
  /** 提案リスト */
  suggestions?: string[];
  /** 注意事項 */
  warnings?: string[];
  /** Self vs Oracle を促すか */
  selfVsOraclePrompt?: boolean;
  /** Decision Engine を促すか */
  decisionSupport?: boolean;
}

export interface YesterdayState {
  energyLevel?: number;
  socialBattery?: number;
  stressLevel?: number;
  cognitiveLoad?: number;
  /** 昨夜の就寝推定時刻（hour, 0-23） */
  estimatedSleepHour?: number;
  /** 後悔した判断があったか */
  hadRegret?: boolean;
  /** 社交イベントがあったか */
  hadSocialEvent?: boolean;
}

export interface ChallengeResult {
  /** Oracle の予測が当たったか */
  oracleWasRight: boolean;
  /** 自分の予測が当たったか */
  selfWasRight: boolean;
  /** 気づきのメモ */
  insight?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 社交バッテリーに影響する軸（将来の高精度推定で使用予定） */
const _SOCIAL_BATTERY_AXES: TraitAxisKey[] = [
  "introvert_vs_extrovert",
  "individual_vs_social",
  "social_initiative",
  "stress_isolation_vs_social",
];

/** ストレス耐性に影響する軸（将来の高精度推定で使用予定） */
const _STRESS_AXES: TraitAxisKey[] = [
  "emotional_regulation",
  "emotional_variability",
  "rumination_tendency",
  "locus_of_control",
];

/** 認知負荷に影響する軸（将来の高精度推定で使用予定） */
const _COGNITIVE_AXES: TraitAxisKey[] = [
  "analytical_vs_intuitive",
  "perfectionist_vs_pragmatic",
  "abstract_structuring",
  "decomposition",
  "cognitive_updating",
];

// 将来のリファレンス用にエクスポート
export { _SOCIAL_BATTERY_AXES, _STRESS_AXES, _COGNITIVE_AXES };

/** デフォルトの社交バッテリー（内向/外向で変わる） */
function defaultSocialBattery(axisScores: Record<string, number>): number {
  const ie = axisScores["introvert_vs_extrovert"] ?? 0;
  // 外向的な人はバッテリー初期値が高い
  return clamp(0.6 + ie * 0.2, 0.3, 0.9);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// State Estimation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 軸スコア + 時間帯 + 昨日の状態 から今日の状態を推定。
 */
export function estimateDailyState(
  userId: string,
  date: string,
  axisScores: Record<string, number>,
  timeOfDay: InterventionPhase,
  yesterdayState?: YesterdayState,
): DailyState {
  // ── エネルギー推定 ──
  let energy = 0.3; // デフォルト: やや元気
  if (yesterdayState) {
    // 昨日のエネルギー残存 (減衰率 0.3)
    energy = (yesterdayState.energyLevel ?? 0) * 0.3;
    // 睡眠時間による回復（23時前就寝 → +0.3, 深夜2時以降 → -0.2）
    if (yesterdayState.estimatedSleepHour !== undefined) {
      const h = yesterdayState.estimatedSleepHour;
      if (h <= 23) energy += 0.3;
      else if (h >= 26) energy -= 0.2; // 26 = 翌2時
      else energy += 0.1;
    } else {
      energy += 0.15; // 不明なら少し回復
    }
    // 昨日の社交イベントで内向的人は消耗
    if (yesterdayState.hadSocialEvent) {
      const ie = axisScores["introvert_vs_extrovert"] ?? 0;
      if (ie < -0.2) energy -= 0.15;
    }
  }

  // 時間帯による調整
  const timeAdjust: Record<InterventionPhase, number> = {
    morning: 0.1,
    noon: 0,
    evening: -0.1,
    night: -0.2,
  };
  energy += timeAdjust[timeOfDay];
  energy = clamp(energy, -1, 1);

  // ── 社交バッテリー ──
  let socialBattery = yesterdayState?.socialBattery
    ? yesterdayState.socialBattery * 0.5 + defaultSocialBattery(axisScores) * 0.5
    : defaultSocialBattery(axisScores);
  // 時間帯の自然減衰
  if (timeOfDay === "evening") socialBattery *= 0.85;
  if (timeOfDay === "night") socialBattery *= 0.7;
  socialBattery = clamp(socialBattery, 0, 1);

  // ── 認知負荷 ──
  let cognitiveLoad = yesterdayState?.cognitiveLoad
    ? yesterdayState.cognitiveLoad * 0.2 // 一晩で80%回復
    : 0.2;
  // 完璧主義傾向が高い人はデフォルト負荷が高め
  const perfScore = axisScores["perfectionist_vs_pragmatic"] ?? 0;
  if (perfScore < -0.3) cognitiveLoad += 0.1;
  if (timeOfDay === "noon") cognitiveLoad += 0.15;
  if (timeOfDay === "evening") cognitiveLoad += 0.25;
  cognitiveLoad = clamp(cognitiveLoad, 0, 1);

  // ── ストレス ──
  let stress = yesterdayState?.stressLevel
    ? yesterdayState.stressLevel * 0.4 // 一晩で60%回復
    : 0.2;
  if (yesterdayState?.hadRegret) stress += 0.15;
  // 反芻傾向が高い人はストレス残存
  const ruminationScore = axisScores["rumination_tendency"] ?? 0;
  if (ruminationScore > 0.3) stress += 0.1;
  stress = clamp(stress, 0, 1);

  // ── ズレやすさスコア (0-5) ──
  const { score: vulnerabilityScore, factors: vulnerabilityFactors } =
    computeVulnerability(axisScores, energy, socialBattery, cognitiveLoad, stress);

  return {
    userId,
    date,
    estimatedEnergy: roundTo(energy, 2),
    estimatedSocialBattery: roundTo(socialBattery, 2),
    estimatedCognitiveLoad: roundTo(cognitiveLoad, 2),
    estimatedStress: roundTo(stress, 2),
    vulnerabilityScore,
    vulnerabilityFactors,
    phases: {},
  };
}

function computeVulnerability(
  axisScores: Record<string, number>,
  energy: number,
  socialBattery: number,
  cognitiveLoad: number,
  stress: number,
): { score: number; factors: string[] } {
  let score = 0;
  const factors: string[] = [];

  // 低エネルギー
  if (energy < -0.3) {
    score += 1;
    factors.push("エネルギーが低い状態です");
  }

  // 低社交バッテリー
  if (socialBattery < 0.3) {
    score += 1;
    factors.push("社交バッテリーが少なめです");
  }

  // 高認知負荷
  if (cognitiveLoad > 0.7) {
    score += 1;
    factors.push("頭の中がいっぱいになりやすい状態です");
  }

  // 高ストレス
  if (stress > 0.6) {
    score += 1;
    factors.push("ストレスが蓄積しています");
  }

  // 矛盾軸が多い人は状態の揺れが大きい
  const emotionalVar = axisScores["emotional_variability"] ?? 0;
  if (emotionalVar > 0.4) {
    score += 0.5;
    factors.push("感情の波が大きくなりやすい時期です");
  }

  // 反芻傾向
  const rumination = axisScores["rumination_tendency"] ?? 0;
  if (rumination > 0.3 && stress > 0.4) {
    score += 0.5;
    factors.push("考え込みやすいコンディションです");
  }

  return {
    score: Math.min(Math.round(score * 10) / 10, 5),
    factors,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase Interventions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 朝の介入。
 * 今日の状態推定 + ズレやすさスコア + Self vs Oracle チャレンジ促進。
 */
export function generateMorningIntervention(
  userId: string,
  axisScores: Record<string, number>,
  currentState: DailyState,
  yesterdayState?: YesterdayState,
): PhaseIntervention {
  const { estimatedEnergy, estimatedSocialBattery, estimatedStress, vulnerabilityScore, vulnerabilityFactors } =
    currentState;

  const parts: string[] = [];

  // エネルギー状態に応じた冒頭
  if (estimatedEnergy > 0.3) {
    parts.push("今日はエネルギーが充実しています。");
  } else if (estimatedEnergy > -0.2) {
    parts.push("今日は平均的なコンディションで始まりそうです。");
  } else {
    parts.push("今日は少し低めのスタートです。無理せず進みましょう。");
  }

  // ズレやすさの伝達
  if (vulnerabilityScore >= 3) {
    parts.push(
      `ズレやすさ指数は ${vulnerabilityScore}/5。${vulnerabilityFactors[0] ?? "普段と違う判断をしやすい日"}です。大きな判断は午前中に済ませるのが吉です。`,
    );
  } else if (vulnerabilityScore >= 1.5) {
    parts.push(
      `ズレやすさ指数は ${vulnerabilityScore}/5。少し気をつけたいポイントがあります。`,
    );
  }

  // 昨日からの引き継ぎ
  if (yesterdayState?.hadRegret) {
    parts.push(
      "昨日の判断で少しモヤモヤが残っているかもしれません。今日はそのパターンを意識してみましょう。",
    );
  }

  // 提案
  const suggestions: string[] = [];

  // 内向的 + 低バッテリー → ソロ活動推奨
  const ie = axisScores["introvert_vs_extrovert"] ?? 0;
  if (ie < -0.3 && estimatedSocialBattery < 0.4) {
    suggestions.push(
      "午前中は一人の時間を確保できると、午後のパフォーマンスが上がります",
    );
  }

  // 計画的 → タスクリスト推奨
  const planScore = axisScores["plan_vs_spontaneous"] ?? 0;
  if (planScore < -0.3) {
    suggestions.push(
      "今日やることを3つだけ書き出しておくと、頭がスッキリします",
    );
  }

  // ストレス高 → リセット提案
  if (estimatedStress > 0.5) {
    const stressIso = axisScores["stress_isolation_vs_social"] ?? 0;
    if (stressIso < 0) {
      suggestions.push("朝のうちに5分だけ一人の静かな時間をとってみてください");
    } else {
      suggestions.push("信頼できる人に今日の気分を一言共有してみると、楽になるかもしれません");
    }
  }

  return {
    phase: "morning",
    message: parts.join(""),
    suggestions: suggestions.length > 0 ? suggestions : undefined,
    selfVsOraclePrompt: vulnerabilityScore < 4, // 状態が極端に悪い時は促さない
    decisionSupport: false,
    stateUpdate: {
      estimatedEnergy: currentState.estimatedEnergy,
      estimatedSocialBattery: currentState.estimatedSocialBattery,
      estimatedCognitiveLoad: currentState.estimatedCognitiveLoad,
      estimatedStress: currentState.estimatedStress,
    },
  };
}

/**
 * 昼の介入。
 * 午前の活動反映 + 午後のバッファ提案 + 崩れ予兆チェック。
 */
export function generateNoonIntervention(
  userId: string,
  axisScores: Record<string, number>,
  currentState: DailyState,
  morningState: PhaseIntervention,
): PhaseIntervention {
  const { estimatedEnergy, estimatedSocialBattery, estimatedCognitiveLoad, estimatedStress } =
    currentState;

  const parts: string[] = [];

  // 午前からの変化を検出
  const morningEnergy = morningState.stateUpdate?.estimatedEnergy ?? 0;
  const energyDelta = estimatedEnergy - morningEnergy;

  if (energyDelta < -0.3) {
    parts.push("午前中でかなりエネルギーを使いました。午後は少しペースを落としましょう。");
  } else if (energyDelta > 0.1) {
    parts.push("午前中にいい流れができています。この調子を活かしましょう。");
  } else {
    parts.push("ここまで安定したペースで過ごせています。");
  }

  const suggestions: string[] = [];
  const warnings: string[] = [];

  // 認知負荷の累積チェック
  if (estimatedCognitiveLoad > 0.65) {
    warnings.push(
      "頭が少し重くなってきているかもしれません。15分の休憩で認知負荷をリセットできます",
    );
  }

  // 午後の社交場面へのバッファ提案
  if (estimatedSocialBattery < 0.4) {
    const ie = axisScores["introvert_vs_extrovert"] ?? 0;
    if (ie < -0.2) {
      suggestions.push(
        "午後に人と会う予定があるなら、その前に10分の一人時間を挟むとバッテリーが持ちます",
      );
    }
  }

  // 崩れ予兆: ストレス + 低エネルギー
  if (estimatedStress > 0.6 && estimatedEnergy < -0.1) {
    warnings.push(
      "ストレスとエネルギーのバランスが崩れかけています。今の自分の状態を一度観察してみてください",
    );
  }

  // 完璧主義者への声がけ
  const perfScore = axisScores["perfectionist_vs_pragmatic"] ?? 0;
  if (perfScore < -0.4 && estimatedCognitiveLoad > 0.5) {
    suggestions.push("「80点で十分」を今日の午後のテーマにしてみませんか");
  }

  // 状態更新（午後の減衰を反映）
  const updatedState = {
    estimatedEnergy: roundTo(estimatedEnergy - 0.05, 2),
    estimatedSocialBattery: roundTo(estimatedSocialBattery * 0.9, 2),
    estimatedCognitiveLoad: roundTo(Math.min(estimatedCognitiveLoad + 0.1, 1), 2),
    estimatedStress: roundTo(estimatedStress, 2),
  };

  return {
    phase: "noon",
    message: parts.join(""),
    suggestions: suggestions.length > 0 ? suggestions : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
    stateUpdate: updatedState,
    selfVsOraclePrompt: false,
    decisionSupport: estimatedCognitiveLoad < 0.7, // 負荷が高すぎる時は判断支援を促さない
  };
}

/**
 * 夕方の介入。
 * 小判断支援（Decision Engine連携）+ 残りバッテリーに基づく推奨。
 */
export function generateEveningIntervention(
  userId: string,
  axisScores: Record<string, number>,
  currentState: DailyState,
  pendingDecisions?: string[],
): PhaseIntervention {
  const { estimatedEnergy, estimatedSocialBattery, estimatedStress, estimatedCognitiveLoad } =
    currentState;

  const parts: string[] = [];

  // 1日の消耗度に応じた冒頭
  if (estimatedEnergy < -0.3) {
    parts.push("今日はよく頑張りました。残りの時間は自分のために使いましょう。");
  } else if (estimatedEnergy > 0.1) {
    parts.push("まだ余力があります。今日のうちにやっておきたいことがあれば、今が好タイミングです。");
  } else {
    parts.push("1日の終わりが近づいています。残りのエネルギーを上手に配分しましょう。");
  }

  const suggestions: string[] = [];
  const warnings: string[] = [];

  // 未決定の判断がある場合
  const hasDecisions = pendingDecisions && pendingDecisions.length > 0;
  if (hasDecisions) {
    if (estimatedCognitiveLoad < 0.7 && estimatedStress < 0.6) {
      parts.push(
        `保留中の判断が ${pendingDecisions!.length} 件あります。今の状態なら判断できそうです。`,
      );
    } else {
      parts.push(
        "保留中の判断がありますが、今日は無理に決めなくてもよいかもしれません。",
      );
    }
  }

  // 社交バッテリー残量に基づく推奨
  if (estimatedSocialBattery < 0.25) {
    suggestions.push(
      "社交バッテリーがかなり少なくなっています。夜は一人の時間を優先しましょう",
    );
  }

  // ストレス蓄積の警告
  if (estimatedStress > 0.7) {
    const stressIso = axisScores["stress_isolation_vs_social"] ?? 0;
    if (stressIso < 0) {
      suggestions.push("今夜はデジタルから離れて、自分だけの時間をつくってみてください");
    } else {
      suggestions.push("誰かに今日のことを少し話してみると、明日が楽になるかもしれません");
    }
  }

  // 衝動的判断の警告
  if (estimatedEnergy < -0.2 && estimatedStress > 0.5) {
    warnings.push(
      "疲れとストレスが重なっている状態での大きな判断は、後悔につながりやすいです",
    );
  }

  return {
    phase: "evening",
    message: parts.join(""),
    suggestions: suggestions.length > 0 ? suggestions : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
    decisionSupport: hasDecisions && estimatedCognitiveLoad < 0.7,
    selfVsOraclePrompt: false,
    stateUpdate: {
      estimatedEnergy: roundTo(estimatedEnergy - 0.1, 2),
      estimatedSocialBattery: roundTo(estimatedSocialBattery * 0.8, 2),
      estimatedCognitiveLoad: roundTo(estimatedCognitiveLoad, 2),
      estimatedStress: roundTo(estimatedStress, 2),
    },
  };
}

/**
 * 夜の介入。
 * Self vs Oracle 答え合わせ + 後悔ポイント学習 + 明日への引き継ぎ。
 */
export function generateNightIntervention(
  userId: string,
  axisScores: Record<string, number>,
  challengeResult?: ChallengeResult,
  currentState?: DailyState,
): PhaseIntervention {
  const parts: string[] = [];
  const suggestions: string[] = [];

  // Self vs Oracle の結果
  if (challengeResult) {
    if (challengeResult.oracleWasRight && !challengeResult.selfWasRight) {
      parts.push(
        "今日の予測は Oracle が的中しました。あなたのパターンは思っているより一貫しているのかもしれません。",
      );
    } else if (!challengeResult.oracleWasRight && challengeResult.selfWasRight) {
      parts.push(
        "今日は自分の予測が正解でした。Oracle が見逃した「あなたの変化」が起きたのかもしれません。これは興味深いデータです。",
      );
    } else if (challengeResult.oracleWasRight && challengeResult.selfWasRight) {
      parts.push(
        "自分の予測も Oracle の予測も正解でした。自己理解がしっかりしている証拠です。",
      );
    } else {
      parts.push(
        "今日は予測がどちらも外れました。予想外の自分が現れた日です。こういう日の記録が、最も価値のある観測データになります。",
      );
    }

    if (challengeResult.insight) {
      parts.push(`今日の気づき: 「${challengeResult.insight}」`);
    }
  } else {
    // チャレンジなしの場合
    parts.push("1日お疲れさまでした。");
  }

  // 状態に基づくクロージング
  if (currentState) {
    if (currentState.estimatedStress > 0.6) {
      suggestions.push(
        "ストレスが残っています。眠る前に3回深呼吸するだけで、翌日の回復度が変わります",
      );
    }

    if (currentState.estimatedEnergy < -0.4) {
      suggestions.push("今日はしっかり眠ることが明日への最大の投資です");
    }

    // 反芻傾向がある人への声がけ
    const rumination = axisScores["rumination_tendency"] ?? 0;
    if (rumination > 0.3 && currentState.estimatedStress > 0.4) {
      suggestions.push(
        "頭の中のループが始まったら、「今日はもう十分考えた」と自分に言ってあげてください",
      );
    }
  }

  // 明日への引き継ぎメモ
  suggestions.push(
    "明日の朝、今日の自分がどう感じていたかを思い出せるよう、一言だけメモしておくのもよいかもしれません",
  );

  return {
    phase: "night",
    message: parts.join(""),
    suggestions: suggestions.length > 0 ? suggestions : undefined,
    selfVsOraclePrompt: false,
    decisionSupport: false,
    stateUpdate: currentState
      ? {
          estimatedEnergy: currentState.estimatedEnergy,
          estimatedSocialBattery: currentState.estimatedSocialBattery,
          estimatedStress: currentState.estimatedStress,
          estimatedCognitiveLoad: currentState.estimatedCognitiveLoad,
        }
      : undefined,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Convenience: Generate for any phase
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface GenerateInterventionParams {
  userId: string;
  date: string;
  phase: InterventionPhase;
  axisScores: Record<string, number>;
  yesterdayState?: YesterdayState;
  morningIntervention?: PhaseIntervention;
  pendingDecisions?: string[];
  challengeResult?: ChallengeResult;
}

/**
 * フェーズに応じた介入を一括生成するコンビニエンス関数。
 */
export function generateIntervention(
  params: GenerateInterventionParams,
): { state: DailyState; intervention: PhaseIntervention } {
  const {
    userId,
    date,
    phase,
    axisScores,
    yesterdayState,
    morningIntervention,
    pendingDecisions,
    challengeResult,
  } = params;

  const state = estimateDailyState(userId, date, axisScores, phase, yesterdayState);

  let intervention: PhaseIntervention;

  switch (phase) {
    case "morning":
      intervention = generateMorningIntervention(
        userId,
        axisScores,
        state,
        yesterdayState,
      );
      break;
    case "noon":
      intervention = generateNoonIntervention(
        userId,
        axisScores,
        state,
        morningIntervention ?? { phase: "morning", message: "" },
      );
      break;
    case "evening":
      intervention = generateEveningIntervention(
        userId,
        axisScores,
        state,
        pendingDecisions,
      );
      break;
    case "night":
      intervention = generateNightIntervention(
        userId,
        axisScores,
        challengeResult,
        state,
      );
      break;
  }

  state.phases[phase] = intervention;

  return { state, intervention };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function roundTo(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
