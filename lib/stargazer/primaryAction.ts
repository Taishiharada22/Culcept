// lib/stargazer/primaryAction.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Single Primary Action Engine（一択アクション設計）
//
// 脳科学的根拠:
// Hick's Law — 選択肢が増えると決定時間が対数的に増加。
// Duolingoが「1本道」で成功しているのは決定疲れを排除しているから。
//
// 設計思想:
// ユーザーの状態から「今、最もやるべき1つのアクション」を返す。
// 優先度: 損失回避 > 好奇心ギャップ > ルーチン > 探索
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { getTimeOfDayDetail } from "@/lib/shared/timeOfDay";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ActionUrgency = "critical" | "high" | "medium" | "normal" | "low";

export interface PrimaryAction {
  /** 表示テキスト */
  label: string;
  /** サブラベル（補足説明） */
  sublabel: string;
  /** 遷移先 */
  href: string;
  /** 緊急度 */
  urgency: ActionUrgency;
  /** アイコン */
  icon: string;
  /** アクションの種類（Analytics用） */
  actionType: string;
  /** カウントダウン表示（ある場合） */
  countdown?: { hoursLeft: number; label: string };
  /** 神経科学的フック */
  neuroHook:
    | "loss_aversion"       // 損失回避（扁桃体）
    | "curiosity_gap"       // 好奇心ギャップ（ACC）
    | "habit_loop"          // 習慣ループ（基底核）
    | "novelty_seeking"     // 新奇性追求（ドーパミン）
    | "social_reward"       // 社会的報酬（オキシトシン）
    | "self_reference"      // 自己参照（mPFC）
    | "prediction_error";   // 予測誤差（ドーパミン）
}

export interface UserState {
  /** 観測関連 */
  observationCount: number;
  confidence: number;
  phase: "new" | "observing" | "unlocked";
  streakDays: number;
  streakAtRisk: boolean;
  streakHoursRemaining: number;

  /** 日次コンテンツ */
  hasVanishingInsight: boolean;
  vanishingInsightHoursLeft: number;
  hasTodayProphecy: boolean;
  prophecyVerifiable: boolean;
  hasNewContradiction: boolean;
  contradictionCount: number;

  /** Identity */
  identityCompletionPct: number;
  incompleteIdentityItems: string[];

  /** Rendezvous */
  hasNewMatch: boolean;
  hasUnreadMessage: boolean;

  /** 時間帯 */
  timeOfDay: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Primary Action Selection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ユーザーの現在状態から最適な1つのアクションを選定
 *
 * 優先度（神経科学的根拠に基づく）:
 * 1. 損失回避（消える洞察、ストリーク危機） — 扁桃体が最も強く反応
 * 2. 好奇心ギャップ（新矛盾、予言検証） — ACCの興奮
 * 3. 社会的報酬（新しいマッチ） — オキシトシン経路
 * 4. 習慣ループ（朝の観測） — 基底核の自動化
 * 5. 新奇性追求（未知の領域） — ドーパミンの探索報酬
 */
export function getPrimaryAction(state: UserState): PrimaryAction {
  // ── 0. 完全新規ユーザー（観測ゼロ） ──
  if (state.phase === "new" && state.observationCount === 0) {
    return {
      label: "あなたの深層観測を始める",
      sublabel: "3つの問いから、あなたの内面が見え始める",
      href: "/stargazer",
      urgency: "normal",
      icon: "✦",
      actionType: "first_observation",
      neuroHook: "curiosity_gap",
    };
  }

  // ── 1. 損失回避系（最高優先度） ──

  // 消える洞察が3時間以内に消滅
  if (state.hasVanishingInsight && state.vanishingInsightHoursLeft <= 3) {
    return {
      label: "消える前に見る",
      sublabel: "あなただけの洞察が消えかけています",
      href: "/stargazer",
      urgency: "critical",
      icon: "⏳",
      actionType: "vanishing_insight_urgent",
      countdown: {
        hoursLeft: state.vanishingInsightHoursLeft,
        label: `残り${Math.max(1, Math.floor(state.vanishingInsightHoursLeft))}時間`,
      },
      neuroHook: "loss_aversion",
    };
  }

  // ストリーク危機（3日以上続いているストリークが途切れそう）
  if (state.streakAtRisk && state.streakDays >= 3) {
    return {
      label: `${state.streakDays}日連続を守る`,
      sublabel: `あと${Math.max(1, Math.floor(state.streakHoursRemaining))}時間で途切れます`,
      href: "/stargazer",
      urgency: "high",
      icon: "🔥",
      actionType: "streak_at_risk",
      countdown: {
        hoursLeft: state.streakHoursRemaining,
        label: `残り${Math.max(1, Math.floor(state.streakHoursRemaining))}時間`,
      },
      neuroHook: "loss_aversion",
    };
  }

  // ── 2. 好奇心ギャップ系 ──

  // 新しい矛盾が検出された
  if (state.hasNewContradiction) {
    return {
      label: "新しい矛盾が見つかった",
      sublabel: "あなたの中の相反する2つの自分が浮かび上がった",
      href: "/stargazer",
      urgency: "medium",
      icon: "⚡",
      actionType: "new_contradiction",
      neuroHook: "curiosity_gap",
    };
  }

  // 昨日の予言を検証できる
  if (state.prophecyVerifiable) {
    return {
      label: "昨日の予言を検証する",
      sublabel: "分身の予測は当たったか？ 外れた瞬間が最も深い発見",
      href: "/stargazer",
      urgency: "medium",
      icon: "🔮",
      actionType: "verify_prophecy",
      neuroHook: "prediction_error",
    };
  }

  // ── 3. 社会的報酬系 ──

  // 新しいマッチが見つかった
  if (state.hasNewMatch) {
    return {
      label: "分身が新しい軌道を見つけた",
      sublabel: "あなたの分身同士が交差した相手がいます",
      href: "/rendezvous",
      urgency: "medium",
      icon: "∞",
      actionType: "new_match",
      neuroHook: "social_reward",
    };
  }

  // 未読メッセージ
  if (state.hasUnreadMessage) {
    return {
      label: "新しいメッセージが届いた",
      sublabel: "つながりの相手からの言葉",
      href: "/rendezvous",
      urgency: "medium",
      icon: "💬",
      actionType: "unread_message",
      neuroHook: "social_reward",
    };
  }

  // ── 4. 消える洞察（まだ余裕がある場合） ──
  if (state.hasVanishingInsight && state.vanishingInsightHoursLeft <= 12) {
    return {
      label: "今日だけの洞察を見る",
      sublabel: `あと${Math.floor(state.vanishingInsightHoursLeft)}時間で消えます`,
      href: "/stargazer",
      urgency: "normal",
      icon: "✨",
      actionType: "vanishing_insight",
      countdown: {
        hoursLeft: state.vanishingInsightHoursLeft,
        label: `残り${Math.floor(state.vanishingInsightHoursLeft)}時間`,
      },
      neuroHook: "loss_aversion",
    };
  }

  // ── 5. 習慣ループ系（時間帯依存） ──
  const tod = state.timeOfDay || getTimeOfDayDetail();

  if (tod === "morning" || tod === "late_night") {
    return {
      label: "今日の観測",
      sublabel: state.hasTodayProphecy
        ? "今日の予言が届いています — 検証してみませんか"
        : "今日の自分を観測する",
      href: "/stargazer",
      urgency: "normal",
      icon: "🌅",
      actionType: "morning_observation",
      neuroHook: "habit_loop",
    };
  }

  if (tod === "evening" || tod === "late_afternoon") {
    return {
      label: "今日の振り返り",
      sublabel: "朝と夕方で答えが変わる — それが揺らぎの証拠",
      href: "/stargazer",
      urgency: "normal",
      icon: "🌆",
      actionType: "evening_reflection",
      neuroHook: "self_reference",
    };
  }

  // ── 6. 新奇性追求（デフォルト） ──

  // Identity充足が低い場合
  if (state.identityCompletionPct < 60 && state.incompleteIdentityItems.length > 0) {
    const nextItem = state.incompleteIdentityItems[0];
    const itemHrefs: Record<string, string> = {
      origin: "/origin",
      genome: "/genome-card",
      style: "/style-profile",
      phenotype: "/phenotype",
      presence: "/presence-profile",
    };
    return {
      label: "未知の自分を見つける",
      sublabel: `${nextItem}の入力で、新しい側面が見える`,
      href: itemHrefs[nextItem] ?? "/stargazer",
      urgency: "low",
      icon: "🔭",
      actionType: "explore_identity",
      neuroHook: "novelty_seeking",
    };
  }

  // 最終フォールバック
  return {
    label: "今日の観測",
    sublabel: "自分を知る旅を続ける",
    href: "/stargazer",
    urgency: "normal",
    icon: "✦",
    actionType: "default_observation",
    neuroHook: "habit_loop",
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Action Style Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 緊急度に基づくビジュアルスタイル */
export function getActionStyle(urgency: ActionUrgency): {
  gradient: string;
  borderColor: string;
  shadowColor: string;
  textColor: string;
  pulseAnimation: boolean;
} {
  switch (urgency) {
    case "critical":
      return {
        gradient: "linear-gradient(135deg, #7f1d1d 0%, #991b1b 40%, #dc2626 100%)",
        borderColor: "rgba(239,68,68,0.4)",
        shadowColor: "rgba(239,68,68,0.3)",
        textColor: "#fecaca",
        pulseAnimation: true,
      };
    case "high":
      return {
        gradient: "linear-gradient(135deg, #78350f 0%, #92400e 40%, #d97706 100%)",
        borderColor: "rgba(245,158,11,0.35)",
        shadowColor: "rgba(245,158,11,0.25)",
        textColor: "#fef3c7",
        pulseAnimation: true,
      };
    case "medium":
      return {
        gradient: "linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4f46e5 100%)",
        borderColor: "rgba(99,102,241,0.3)",
        shadowColor: "rgba(99,102,241,0.2)",
        textColor: "#c7d2fe",
        pulseAnimation: false,
      };
    case "normal":
      return {
        gradient: "linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4338ca 100%)",
        borderColor: "rgba(129,140,248,0.25)",
        shadowColor: "rgba(99,102,241,0.15)",
        textColor: "#a5b4fc",
        pulseAnimation: false,
      };
    case "low":
    default:
      return {
        gradient: "linear-gradient(135deg, #1a1a2e 0%, #1e1b4b 40%, #312e81 100%)",
        borderColor: "rgba(139,92,246,0.2)",
        shadowColor: "rgba(139,92,246,0.1)",
        textColor: "#c4b5fd",
        pulseAnimation: false,
      };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 4. Post-Observation Follow-Up Actions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PostObservationAction {
  id: string;
  label: string;
  sublabel: string;
  icon: string;
  href: string;
  /** ハイライト表示するか（最も重要な1つ） */
  highlight?: boolean;
}

/**
 * 観測完了直後に表示するフォローアップアクション（2-3個）
 * ツァイガルニク効果: 「まだやれることがある」と感じさせて離脱を防ぐ
 */
export function getPostObservationActions(state: {
  totalObservations: number;
  prophecyVerifiable: boolean;
  hasVanishingInsight: boolean;
  vanishingInsightHoursLeft: number;
  hasNewContradiction: boolean;
  streakDays: number;
}): PostObservationAction[] {
  const actions: PostObservationAction[] = [];

  // 予言検証（予測誤差 → ドーパミン）
  if (state.prophecyVerifiable) {
    actions.push({
      id: "verify_prophecy",
      label: "予言の答え合わせ",
      sublabel: "分身の予測は当たった？",
      icon: "🔮",
      href: "/stargazer",
      highlight: true,
    });
  }

  // 消えるインサイト（損失回避）
  if (state.hasVanishingInsight && state.vanishingInsightHoursLeft > 0) {
    actions.push({
      id: "vanishing_insight",
      label: "消えるインサイトを見る",
      sublabel: `残り${Math.max(1, Math.floor(state.vanishingInsightHoursLeft))}時間`,
      icon: "✨",
      href: "/stargazer",
      highlight: !state.prophecyVerifiable,
    });
  }

  // 矛盾発見（好奇心ギャップ）
  if (state.hasNewContradiction) {
    actions.push({
      id: "new_contradiction",
      label: "矛盾を深掘りする",
      sublabel: "あなたの中の相反する2つの自分",
      icon: "⚡",
      href: "/stargazer",
    });
  }

  // 結果を見る（常に表示、fallback）
  if (actions.length < 2) {
    actions.push({
      id: "view_starmap",
      label: "観測マップを見る",
      sublabel: "あなたの全体像が更新された",
      icon: "🗺️",
      href: "/stargazer",
    });
  }

  // ハイライトが未設定なら先頭をハイライト
  if (!actions.some((a) => a.highlight) && actions.length > 0) {
    actions[0].highlight = true;
  }

  return actions.slice(0, 3);
}
