// lib/stargazer/circadianEngagement.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Circadian Engagement Architecture（概日リズム連動設計）
//
// 脳科学的根拠:
// 概日リズムは認知機能に直結する（Valdez et al., 2012）。
// - 朝: ドーパミン系が活性化 → 予期（anticipation）に最適
// - 昼: ワーキングメモリがピーク → 短時間の高精度タスクに最適
// - 夕方: DMN（Default Mode Network）が活性化 → 内省に最適
// - 夜: 扁桃体が活性化 → 感情処理＋損失回避に最適
//
// 設計思想:
// 時間帯ごとに**異なる神経回路**を刺激するコンテンツを配信する。
// 同じ「観測リマインダー」でも、朝と夜では脳への入口が違う。
//
// 世界参照:
// - Duolingo: 夜のリマインダー＝損失回避
// - Wordle: 毎日1回＝朝の習慣
// - BeReal: ランダム時間＝予測不可能性
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { TraitAxisKey } from "./traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 時間帯区分 */
export type TimeOfDay = "early_morning" | "morning" | "midday" | "afternoon" | "evening" | "night" | "late_night";

/** 概日エンゲージメントフェーズ */
export type CircadianPhase =
  | "anticipation"    // 🌅 朝: 予期ドーパミン
  | "micro_pulse"     // ☀️ 昼: マイクロ観測（30秒）
  | "reflection"      // 🌆 夕方: 内省ミラー（mPFC + DMN）
  | "loss_aversion"   // 🌙 夜: 損失回避トリガー
  | "deep_processing" // 🌌 深夜: 深層処理（感情統合）
  | "idle";           // 休息時間帯（通知なし）

/** 時間帯最適化されたエンゲージメントアクション */
export interface CircadianAction {
  /** フェーズ */
  phase: CircadianPhase;
  /** 時間帯 */
  timeOfDay: TimeOfDay;
  /** アクションの種類 */
  actionType: CircadianActionType;
  /** 通知タイトル */
  title: string;
  /** 通知本文 */
  body: string;
  /** リンク先 */
  href: string;
  /** タグ（重複防止） */
  tag: string;
  /** 優先度（0-1） */
  priority: number;
  /** 活性化する脳領域/経路 */
  neuralTarget: string;
  /** このアクションの期待効果 */
  expectedEffect: string;
}

export type CircadianActionType =
  | "prophecy_delivery"        // 予言配信
  | "prophecy_verification"    // 予言検証
  | "micro_observation"        // 30秒マイクロ観測
  | "reflection_prompt"        // 内省プロンプト
  | "contradiction_alert"      // 矛盾アラート
  | "vanishing_countdown"      // 消える洞察カウントダウン
  | "streak_urgency"           // ストリーク危機
  | "temporal_comparison"      // 朝と夕方の差分
  | "data_value_reminder"      // 蓄積データの価値リマインダー
  | "curiosity_seed";          // 好奇心の種（明日の伏線）

/** ユーザーの現在の状態（概日エンゲージメント用） */
export interface CircadianUserState {
  /** 今日観測済みか */
  observedToday: boolean;
  /** 現在のストリーク日数 */
  streakDays: number;
  /** 今日の予言があるか */
  hasTodayProphecy: boolean;
  /** 検証待ちの予言があるか */
  hasVerifiableProphecy: boolean;
  /** 消える洞察の残り時間（時間） */
  vanishingInsightHoursLeft: number | null;
  /** 新しい矛盾が検出されているか */
  hasNewContradiction: boolean;
  /** 最も揺らいでいる軸 */
  mostFluctuatingAxis: TraitAxisKey | null;
  /** 朝の観測スコア（夕方の比較用） */
  morningScore: { axisId: TraitAxisKey; score: number } | null;
  /** ユーザーの通常の観測時間帯 */
  preferredTimeOfDay: TimeOfDay | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Time Classification
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 現在の時刻から時間帯を判定 */
export function classifyTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 7) return "early_morning";
  if (hour >= 7 && hour < 11) return "morning";
  if (hour >= 11 && hour < 14) return "midday";
  if (hour >= 14 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  if (hour >= 21 && hour < 24) return "night";
  return "late_night"; // 0-5
}

/** 時間帯から概日フェーズを決定 */
export function getCircadianPhase(timeOfDay: TimeOfDay): CircadianPhase {
  switch (timeOfDay) {
    case "early_morning":
    case "morning":
      return "anticipation";
    case "midday":
      return "micro_pulse";
    case "afternoon":
      return "idle"; // 午後は休息（通知疲れ防止）
    case "evening":
      return "reflection";
    case "night":
      return "loss_aversion";
    case "late_night":
      return "deep_processing";
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Phase-Specific Action Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 🌅 朝: ANTICIPATION HOOK（予期ドーパミン）
 *
 * 脳科学: ドーパミンは報酬そのものではなく「報酬の予測」に発火する。
 * 朝に予言を配信することで、終日「予測検証モード」が起動する。
 * これにより、日常の出来事がすべて「観測データ」に変わる。
 */
function generateAnticipationActions(
  state: CircadianUserState,
  dayOfWeek: number,
): CircadianAction[] {
  const actions: CircadianAction[] = [];

  // 今日の予言配信
  if (state.hasTodayProphecy && !state.observedToday) {
    actions.push({
      phase: "anticipation",
      timeOfDay: "morning",
      actionType: "prophecy_delivery",
      title: "今日の予言が届いています",
      body: "今日一日、この予言が当たるか観察してみてください",
      href: "/stargazer/prophecy",
      tag: "circadian-morning-prophecy",
      priority: 0.9,
      neuralTarget: "ドーパミン予測系（VTA→NAcc）",
      expectedEffect: "終日の予測検証モード起動。日常行動が全て観測データに変換される",
    });
  }

  // 昨日の予言の検証リマインダー（予測誤差の回収）
  if (state.hasVerifiableProphecy) {
    actions.push({
      phase: "anticipation",
      timeOfDay: "morning",
      actionType: "prophecy_verification",
      title: "昨日の予言、当たりましたか？",
      body: "検証することで予測精度が上がります",
      href: "/stargazer/prophecy?verify=yesterday",
      tag: "circadian-morning-verify",
      priority: 0.7,
      neuralTarget: "ACC（前帯状皮質）予測誤差検出",
      expectedEffect: "予測誤差の回収 → ドーパミン発火 → 次の予言への期待",
    });
  }

  // 月曜朝だけの特別フック（週の始まりの内省）
  if (dayOfWeek === 1) {
    actions.push({
      phase: "anticipation",
      timeOfDay: "morning",
      actionType: "curiosity_seed",
      title: "新しい週が始まる",
      body: "先週のあなたと今週のあなた、何が変わると思いますか？",
      href: "/stargazer",
      tag: "circadian-monday-seed",
      priority: 0.6,
      neuralTarget: "mPFC（内側前頭前皮質）自己参照処理",
      expectedEffect: "週単位の自己変化認識。時間軸での自己鏡効果",
    });
  }

  return actions;
}

/**
 * ☀️ 昼: MICRO-OBSERVATION（30秒マイクロ観測）
 *
 * 脳科学: 昼間はワーキングメモリがピーク。
 * 短い高精度質問（最も揺らいでいる軸の1問）で
 * 小さな予測誤差 → 小さなドーパミンスパイクを生む。
 * 「全く考えていなかった瞬間に自分を問われる」驚き。
 */
function generateMicroPulseActions(
  state: CircadianUserState,
): CircadianAction[] {
  const actions: CircadianAction[] = [];

  // 最も揺らいでいる軸への1問マイクロ観測
  if (!state.observedToday && state.mostFluctuatingAxis) {
    actions.push({
      phase: "micro_pulse",
      timeOfDay: "midday",
      actionType: "micro_observation",
      title: "30秒だけ、自分に聞いてみる",
      body: "今この瞬間のあなたを、1問だけ",
      href: `/stargazer?micro=true&axis=${state.mostFluctuatingAxis}`,
      tag: "circadian-midday-micro",
      priority: 0.75,
      neuralTarget: "前頭前皮質（PFC）ワーキングメモリ",
      expectedEffect: "日常の中断による自己参照処理の短期活性化。BeReal的な「今の自分」の捕捉",
    });
  }

  // 新しい矛盾のアラート（好奇心ギャップの活用）
  if (state.hasNewContradiction) {
    actions.push({
      phase: "micro_pulse",
      timeOfDay: "midday",
      actionType: "contradiction_alert",
      title: "あなたの中に新しい矛盾が見つかった",
      body: "朝と違う自分がいる？",
      href: "/stargazer/blind-spot",
      tag: "circadian-midday-contradiction",
      priority: 0.85,
      neuralTarget: "ACC（前帯状皮質）矛盾検出",
      expectedEffect: "認知的不協和の喚起 → 解消欲求 → 再観測動機",
    });
  }

  return actions;
}

/**
 * 🌆 夕方: REFLECTION MIRROR（内省mPFC + DMN活性化）
 *
 * 脳科学: 夕方はDMN（Default Mode Network）が最も活性化する時間帯。
 * DMNは「自己参照処理」と「エピソード記憶の統合」を担う。
 * この時間帯に内省を促すことで、最も深い自己発見が起きる。
 *
 * 追加設計: 朝の観測と夕方の観測を比較する「日内変動検出」
 * 「朝はこう答えたのに、夕方はこう変わった」→ 最強の矛盾発見装置
 */
function generateReflectionActions(
  state: CircadianUserState,
): CircadianAction[] {
  const actions: CircadianAction[] = [];

  // 予言の検証（夕方が最も効果的）
  if (state.hasVerifiableProphecy) {
    actions.push({
      phase: "reflection",
      timeOfDay: "evening",
      actionType: "prophecy_verification",
      title: "今朝の予言を振り返る",
      body: "一日を通して、予言はどう作用しましたか？",
      href: "/stargazer/prophecy?verify=today",
      tag: "circadian-evening-verify",
      priority: 0.85,
      neuralTarget: "DMN（デフォルトモードネットワーク）+ mPFC",
      expectedEffect: "一日の経験をメタ認知で統合。予測誤差の意識化",
    });
  }

  // 日内変動の検出（朝の回答と夕方の回答の差分）
  if (state.morningScore) {
    actions.push({
      phase: "reflection",
      timeOfDay: "evening",
      actionType: "temporal_comparison",
      title: "朝のあなたと今のあなた",
      body: "同じ質問に、今もう一度答えてみませんか？",
      href: `/stargazer?temporal_compare=true&axis=${state.morningScore.axisId}`,
      tag: "circadian-evening-temporal",
      priority: 0.8,
      neuralTarget: "mPFC 時間的自己参照 + ACC 矛盾検出",
      expectedEffect: "日内変動の自覚 → 「自分は一日の中でも変わる」という発見",
    });
  }

  // 夕方のルーチン観測（最も深い内省が可能な時間帯）
  if (!state.observedToday) {
    actions.push({
      phase: "reflection",
      timeOfDay: "evening",
      actionType: "reflection_prompt",
      title: "今日一日を、観測する",
      body: "DMNが最も活性化する時間。今が一番深く自分を見つめられる",
      href: "/stargazer",
      tag: "circadian-evening-observe",
      priority: 0.7,
      neuralTarget: "DMN全体（mPFC + PCC + TPJ）",
      expectedEffect: "一日の出来事のメタ認知的統合。最深の自己参照処理",
    });
  }

  return actions;
}

/**
 * 🌙 夜: LOSS AVERSION TRIGGER（損失回避）
 *
 * 脳科学: 損失回避は利得の2倍の動機づけ（Kahneman & Tversky, 1979）。
 * 夜は扁桃体が活性化し、感情的な処理が強まる。
 * この時間帯に「消えるもの」「途切れるもの」を提示することで、
 * 最も強い行動喚起が可能。
 */
function generateLossAversionActions(
  state: CircadianUserState,
): CircadianAction[] {
  const actions: CircadianAction[] = [];

  // 消える洞察のカウントダウン（最強の損失回避トリガー）
  if (
    state.vanishingInsightHoursLeft !== null &&
    state.vanishingInsightHoursLeft < 6
  ) {
    const hoursLeft = Math.max(1, Math.round(state.vanishingInsightHoursLeft));
    actions.push({
      phase: "loss_aversion",
      timeOfDay: "night",
      actionType: "vanishing_countdown",
      title: `あと${hoursLeft}時間で消える洞察がある`,
      body: "一度消えたら、二度と同じ洞察は現れない",
      href: "/stargazer/insights",
      tag: "circadian-night-vanishing",
      priority: 0.95, // 最高優先度
      neuralTarget: "扁桃体 + 島皮質（損失回避回路）",
      expectedEffect: "損失回避バイアスによる即時行動。FOMO（Fear of Missing Out）の活用",
    });
  }

  // ストリーク危機（最後の砦）
  if (!state.observedToday && state.streakDays >= 3) {
    actions.push({
      phase: "loss_aversion",
      timeOfDay: "night",
      actionType: "streak_urgency",
      title: `${state.streakDays}日連続が途切れようとしている`,
      body: "この期間で蓄積したデータの価値、覚えていますか？",
      href: "/stargazer",
      tag: "circadian-night-streak",
      priority: 0.9,
      neuralTarget: "扁桃体（損失恐怖）+ 側坐核（蓄積報酬の記憶）",
      expectedEffect: "サンクコスト + 損失回避の二重効果。ストリークを「データの価値」として表現",
    });
  }

  // 蓄積データの価値リマインダー（IKEA効果の強化）
  if (!state.observedToday && state.streakDays >= 7) {
    actions.push({
      phase: "loss_aversion",
      timeOfDay: "night",
      actionType: "data_value_reminder",
      title: "あなたが築いた地図",
      body: `${state.streakDays}日分の観測データ。途切れると、次にこのパターンが見えるのはまた${state.streakDays}日後`,
      href: "/stargazer",
      tag: "circadian-night-data-value",
      priority: 0.75,
      neuralTarget: "VMPFC（価値判断）+ IKEA効果（自己投資バイアス）",
      expectedEffect: "ストリークを「日数」ではなく「蓄積データの不可逆的価値」として認知させる",
    });
  }

  // 明日への好奇心の種（翌朝のフックを仕込む）
  if (state.observedToday) {
    actions.push({
      phase: "loss_aversion",
      timeOfDay: "night",
      actionType: "curiosity_seed",
      title: "明日、あなたの予測精度が更新される",
      body: "今日の観測で、何が見えるようになったか？明日の朝、確認してみてください",
      href: "/stargazer",
      tag: "circadian-night-seed",
      priority: 0.5,
      neuralTarget: "好奇心ギャップ（情報ギャップ理論: Loewenstein, 1994）",
      expectedEffect: "翌朝の復帰動機を事前に仕込む。ツァイガルニク効果（未完了タスクの記憶残存）",
    });
  }

  return actions;
}

/**
 * 🌌 深夜: DEEP PROCESSING（深層処理）
 *
 * 脳科学: 深夜は社会的刺激が最小化され、
 * 内省が最も深いレベルに到達できる。
 * ただし通知は控えめに — 自然に開いた人にだけ価値を提供。
 */
function generateDeepProcessingActions(
  state: CircadianUserState,
): CircadianAction[] {
  // 深夜は通知を送らない（自然にアプリを開いた場合のみ）
  // → これはアプリ内表示専用アクション
  return [];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 4. Main Entry Point
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 現在の時間帯とユーザー状態に基づいて、
 * 最適なエンゲージメントアクションを生成する
 */
export function generateCircadianActions(
  hour: number,
  dayOfWeek: number,
  userState: CircadianUserState,
): CircadianAction[] {
  const timeOfDay = classifyTimeOfDay(hour);
  const phase = getCircadianPhase(timeOfDay);

  let actions: CircadianAction[] = [];

  switch (phase) {
    case "anticipation":
      actions = generateAnticipationActions(userState, dayOfWeek);
      break;
    case "micro_pulse":
      actions = generateMicroPulseActions(userState);
      break;
    case "reflection":
      actions = generateReflectionActions(userState);
      break;
    case "loss_aversion":
      actions = generateLossAversionActions(userState);
      break;
    case "deep_processing":
      actions = generateDeepProcessingActions(userState);
      break;
    case "idle":
      // 午後は通知を控える（通知疲れ防止）
      break;
  }

  // 優先度でソートし、最大2アクションに絞る（過剰通知防止）
  return actions.sort((a, b) => b.priority - a.priority).slice(0, 2);
}

/**
 * 概日フェーズに応じたアプリ内UI表示の推奨設定
 * AneurasyncHomeのセクション表示順やハイライトに使用
 */
export function getCircadianUIHints(hour: number): {
  primarySection: string;
  accentColor: string;
  atmosphereHint: string;
  backgroundIntensity: number;
} {
  const timeOfDay = classifyTimeOfDay(hour);

  switch (timeOfDay) {
    case "early_morning":
      return {
        primarySection: "prophecy",
        accentColor: "from-amber-400/30 to-orange-500/20",
        atmosphereHint: "黎明の静けさ。今日の予言が待っている",
        backgroundIntensity: 0.3,
      };
    case "morning":
      return {
        primarySection: "observation",
        accentColor: "from-yellow-400/20 to-amber-500/15",
        atmosphereHint: "朝の光。今日の自分を観測する時間",
        backgroundIntensity: 0.4,
      };
    case "midday":
      return {
        primarySection: "micro_observation",
        accentColor: "from-blue-400/15 to-cyan-400/10",
        atmosphereHint: "正午の覚醒。30秒だけ、自分に問う",
        backgroundIntensity: 0.5,
      };
    case "afternoon":
      return {
        primarySection: "exploration",
        accentColor: "from-teal-400/15 to-emerald-400/10",
        atmosphereHint: "午後の静寂。新しい領域を探索する余裕",
        backgroundIntensity: 0.4,
      };
    case "evening":
      return {
        primarySection: "reflection",
        accentColor: "from-purple-500/20 to-indigo-500/15",
        atmosphereHint: "夕暮れの内省。今日一日を振り返る",
        backgroundIntensity: 0.6,
      };
    case "night":
      return {
        primarySection: "vanishing_insight",
        accentColor: "from-red-500/15 to-pink-500/10",
        atmosphereHint: "夜の深淵。消える前に、見る",
        backgroundIntensity: 0.8,
      };
    case "late_night":
      return {
        primarySection: "deep_exploration",
        accentColor: "from-violet-600/20 to-purple-700/15",
        atmosphereHint: "深夜の静寂。最も深い自分と向き合える時間",
        backgroundIntensity: 0.9,
      };
  }
}
