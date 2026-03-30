// lib/ui/primaryActionEngine.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Single Primary Action Engine（一択アクション設計）
//
// Axis 4: 情報設計/IA の核心。
//
// 脳科学的根拠:
// Hick's Law — 選択肢が増えると決定時間が対数的に増加。
// Duolingoの「次のレッスン」1つだけが見える設計が成功しているのは、
// 決定疲れを完全に排除しているから。
//
// 設計思想:
// ホーム画面の最上部に**1つのプライマリアクション**を表示。
// ユーザーの現在の状態に基づいて、最も価値の高いアクションを自動選択。
// 残りのセクションはスクロールで下に。
//
// 優先度ヒエラルキー:
// 1. 緊急性（損失回避バイアス）: 消える洞察、ストリーク危機
// 2. 好奇心ギャップ: 新しい矛盾、検証可能な予言
// 3. ルーティン: 時間帯に最適な行動
// 4. 探索: 新しい領域の発見
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import {
  classifyTimeOfDay,
  getCircadianPhase,
  type TimeOfDay,
} from "@/lib/stargazer/circadianEngagement";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 緊急度レベル */
export type UrgencyLevel = "critical" | "high" | "medium" | "normal" | "low";

/** プライマリアクション */
export interface PrimaryAction {
  /** アクションID */
  id: string;
  /** 表示ラベル（短い、行動を促す） */
  label: string;
  /** サブラベル（補足情報） */
  subLabel: string | null;
  /** リンク先 */
  href: string;
  /** 緊急度 */
  urgency: UrgencyLevel;
  /** アイコン/絵文字 */
  icon: string;
  /** アクセント色（CSS） */
  accentColor: string;
  /** なぜこのアクションが選ばれたか */
  reason: string;
  /** 推定所要時間（秒） */
  estimatedDuration: number;
  /** 脈動アニメーションをつけるか */
  pulse: boolean;
  /** カウントダウン表示（残り時間） */
  countdown: { hoursLeft: number; label: string } | null;
}

/** ユーザー状態の入力 */
export interface PrimaryActionContext {
  // ─── 緊急系 ───
  /** 消える洞察の残り時間（時間）。nullなら無し */
  vanishingInsightHoursLeft: number | null;
  /** ストリーク日数 */
  streakDays: number;
  /** 今日観測済みか */
  observedToday: boolean;
  /** ストリーク危機（残り時間が少ない） */
  streakHoursLeft: number | null;

  // ─── 好奇心系 ───
  /** 新しい矛盾が検出されたか */
  hasNewContradiction: boolean;
  /** 検証可能な予言があるか */
  hasVerifiableProphecy: boolean;
  /** 新しいマッチ候補があるか */
  hasNewMatchCandidate: boolean;
  /** Alterからのメッセージがあるか */
  hasAlterMessage: boolean;

  // ─── ルーティン系 ───
  /** 現在の時間（0-23） */
  hour: number;
  /** 曜日（0=日） */
  dayOfWeek: number;
  /** 今日の予言があるか */
  hasTodayProphecy: boolean;

  // ─── 探索系 ───
  /** 観測レベル（0-4） */
  observationLevel: number;
  /** 最も揺らいでいる軸 */
  mostFluctuatingAxis: TraitAxisKey | null;
  /** Identity要素で最も未充填のもの */
  lowestIdentityElement: string | null;
  /** 総観測回数 */
  totalObservations: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Action Candidates
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ActionCandidate {
  action: PrimaryAction;
  score: number; // 高いほど優先
}

/**
 * 全候補アクションを生成し、スコア順でソート
 */
function generateCandidates(ctx: PrimaryActionContext): ActionCandidate[] {
  const candidates: ActionCandidate[] = [];
  const timeOfDay = classifyTimeOfDay(ctx.hour);
  const phase = getCircadianPhase(timeOfDay);

  // ━━━ 1. 緊急性（損失回避バイアス）━━━

  // 消える洞察（最高緊急度）
  if (ctx.vanishingInsightHoursLeft !== null && ctx.vanishingInsightHoursLeft < 6) {
    const hoursLeft = Math.max(0.5, ctx.vanishingInsightHoursLeft);
    // 残り時間が少ないほどスコアが高い
    const urgencyBoost = (6 - hoursLeft) / 6;
    candidates.push({
      score: 100 + urgencyBoost * 20,
      action: {
        id: "vanishing_insight",
        label: "消える前に見る",
        subLabel: `あと${Math.ceil(hoursLeft)}時間で消える洞察`,
        href: "/stargazer/insights",
        urgency: hoursLeft < 2 ? "critical" : "high",
        icon: "⏳",
        accentColor: "from-red-500/20 to-orange-500/15",
        reason: "24時間限定の洞察が消えようとしている",
        estimatedDuration: 60,
        pulse: hoursLeft < 3,
        countdown: { hoursLeft, label: `残り${Math.ceil(hoursLeft)}時間` },
      },
    });
  }

  // ストリーク危機
  if (!ctx.observedToday && ctx.streakDays >= 3 && ctx.streakHoursLeft !== null && ctx.streakHoursLeft < 6) {
    candidates.push({
      score: 90 + (6 - ctx.streakHoursLeft) / 6 * 15,
      action: {
        id: "streak_crisis",
        label: `${ctx.streakDays}日連続を守る`,
        subLabel: `あと${Math.ceil(ctx.streakHoursLeft)}時間`,
        href: "/stargazer",
        urgency: ctx.streakHoursLeft < 2 ? "critical" : "high",
        icon: "🔥",
        accentColor: "from-orange-500/20 to-amber-500/15",
        reason: `${ctx.streakDays}日分の観測データが途切れる`,
        estimatedDuration: 180,
        pulse: ctx.streakHoursLeft < 3,
        countdown: { hoursLeft: ctx.streakHoursLeft, label: `残り${Math.ceil(ctx.streakHoursLeft)}時間` },
      },
    });
  }

  // ━━━ 2. 好奇心ギャップ（情報ギャップ理論）━━━

  // 新しい矛盾
  if (ctx.hasNewContradiction) {
    candidates.push({
      score: 75,
      action: {
        id: "new_contradiction",
        label: "新しい矛盾が見つかった",
        subLabel: "あなたの中の未知の領域",
        href: "/stargazer/blind-spot",
        urgency: "medium",
        icon: "🔮",
        accentColor: "from-purple-500/20 to-indigo-500/15",
        reason: "矛盾の発見は自己理解の深化の証拠",
        estimatedDuration: 120,
        pulse: false,
        countdown: null,
      },
    });
  }

  // 検証可能な予言
  if (ctx.hasVerifiableProphecy) {
    candidates.push({
      score: 70,
      action: {
        id: "verify_prophecy",
        label: "昨日の予言を検証する",
        subLabel: "予測精度が更新される",
        href: "/stargazer/prophecy?verify=yesterday",
        urgency: "medium",
        icon: "🎯",
        accentColor: "from-indigo-500/20 to-blue-500/15",
        reason: "予言の検証がモデルの精度を上げる",
        estimatedDuration: 60,
        pulse: false,
        countdown: null,
      },
    });
  }

  // 新しいマッチ候補
  if (ctx.hasNewMatchCandidate) {
    candidates.push({
      score: 65,
      action: {
        id: "new_match",
        label: "軌道が交差した人がいる",
        subLabel: null,
        href: "/rendezvous",
        urgency: "medium",
        icon: "✨",
        accentColor: "from-pink-500/20 to-rose-500/15",
        reason: "分身同士が接触した結果",
        estimatedDuration: 120,
        pulse: false,
        countdown: null,
      },
    });
  }

  // Alterからのメッセージ
  if (ctx.hasAlterMessage) {
    candidates.push({
      score: 60,
      action: {
        id: "alter_message",
        label: "もうひとりの自分から",
        subLabel: "影が何かを伝えようとしている",
        href: "/stargazer/alter",
        urgency: "medium",
        icon: "🌑",
        accentColor: "from-slate-500/20 to-gray-500/15",
        reason: "Alterが新しい視点を提供している",
        estimatedDuration: 180,
        pulse: false,
        countdown: null,
      },
    });
  }

  // ━━━ 3. ルーティン（時間帯に最適な行動）━━━

  if (!ctx.observedToday) {
    // 朝: 予言確認 + 観測開始
    if (phase === "anticipation" && ctx.hasTodayProphecy) {
      candidates.push({
        score: 55,
        action: {
          id: "morning_prophecy",
          label: "今日の予言を確認する",
          subLabel: "一日を予測検証モードで過ごす",
          href: "/stargazer/prophecy",
          urgency: "normal",
          icon: "🌅",
          accentColor: "from-amber-400/20 to-orange-400/15",
          reason: "朝は予期ドーパミンが最も効果的な時間帯",
          estimatedDuration: 60,
          pulse: false,
          countdown: null,
        },
      });
    }

    // 昼: マイクロ観測
    if (phase === "micro_pulse") {
      candidates.push({
        score: 50,
        action: {
          id: "micro_observation",
          label: "30秒だけ、自分に聞く",
          subLabel: "最も揺らいでいる軸の1問",
          href: ctx.mostFluctuatingAxis
            ? `/stargazer?micro=true&axis=${ctx.mostFluctuatingAxis}`
            : "/stargazer",
          urgency: "normal",
          icon: "☀️",
          accentColor: "from-cyan-400/20 to-blue-400/15",
          reason: "昼間のワーキングメモリがピークの時間帯",
          estimatedDuration: 30,
          pulse: false,
          countdown: null,
        },
      });
    }

    // 夕方: 内省
    if (phase === "reflection") {
      candidates.push({
        score: 50,
        action: {
          id: "evening_reflection",
          label: "今日一日を、観測する",
          subLabel: "内省が最も深くなる時間帯",
          href: "/stargazer",
          urgency: "normal",
          icon: "🌆",
          accentColor: "from-purple-400/20 to-indigo-400/15",
          reason: "夕方はDMNが最も活性化する",
          estimatedDuration: 300,
          pulse: false,
          countdown: null,
        },
      });
    }

    // 汎用: 今日の観測
    candidates.push({
      score: 40,
      action: {
        id: "daily_observation",
        label: "今日の観測",
        subLabel: ctx.streakDays > 0 ? `${ctx.streakDays + 1}日目` : "最初の一歩",
        href: "/stargazer",
        urgency: "normal",
        icon: "🔭",
        accentColor: "from-indigo-400/20 to-purple-400/15",
        reason: "毎日の観測が全てのエンジンの燃料",
        estimatedDuration: 300,
        pulse: false,
        countdown: null,
      },
    });
  }

  // ━━━ 4. 探索（新しい領域の発見）━━━

  // 観測済みの場合: 未充填のIdentity要素を探索
  if (ctx.observedToday && ctx.lowestIdentityElement) {
    candidates.push({
      score: 35,
      action: {
        id: "explore_identity",
        label: "未知の自分を見つける",
        subLabel: `${ctx.lowestIdentityElement}の観測を深める`,
        href: "/stargazer/unseen-map",
        urgency: "low",
        icon: "🗺️",
        accentColor: "from-teal-400/20 to-emerald-400/15",
        reason: "Identity Mapの空白を埋める",
        estimatedDuration: 180,
        pulse: false,
        countdown: null,
      },
    });
  }

  // 新規ユーザー: 最初の観測を強く促す
  if (ctx.totalObservations === 0) {
    candidates.push({
      score: 95, // 新規ユーザーは最優先
      action: {
        id: "first_observation",
        label: "最初の観測を始める",
        subLabel: "3つの問いで、あなたのプロフィールが見え始める",
        href: "/stargazer",
        urgency: "high",
        icon: "🌟",
        accentColor: "from-amber-400/25 to-purple-400/15",
        reason: "最初の観測が全ての始まり",
        estimatedDuration: 120,
        pulse: true,
        countdown: null,
      },
    });
  }

  return candidates;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Main Entry Point
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 現在の状態に基づいて最適なプライマリアクションを選択
 *
 * 使い方（AneurasyncHome内で）:
 * ```tsx
 * const primaryAction = getPrimaryAction(context);
 *
 * // Hero直下に1つだけ表示:
 * <PrimaryActionCard action={primaryAction} />
 * ```
 */
export function getPrimaryAction(ctx: PrimaryActionContext): PrimaryAction {
  const candidates = generateCandidates(ctx);

  // スコア順でソートし、最高スコアのアクションを返す
  candidates.sort((a, b) => b.score - a.score);

  return candidates[0]?.action ?? {
    id: "default",
    label: "今日の自分を見つめる",
    subLabel: null,
    href: "/stargazer",
    urgency: "normal" as UrgencyLevel,
    icon: "🔭",
    accentColor: "from-indigo-400/20 to-purple-400/15",
    reason: "デフォルトアクション",
    estimatedDuration: 300,
    pulse: false,
    countdown: null,
  };
}

/**
 * セカンダリアクション（プライマリの次に重要なもの）
 * ホーム画面のスクロール下部に小さく表示
 */
export function getSecondaryActions(
  ctx: PrimaryActionContext,
  limit: number = 2,
): PrimaryAction[] {
  const candidates = generateCandidates(ctx);
  candidates.sort((a, b) => b.score - a.score);

  // 1位を除いた2位以降
  return candidates.slice(1, 1 + limit).map((c) => c.action);
}
