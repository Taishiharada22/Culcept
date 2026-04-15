/**
 * Proactive Suggestions Engine — 性格ベースのプラン提案
 *
 * CEO要件:
 * 「ユーザーからの情報だけではなく、その中にプランの提案もできるようにするのが本質」
 * 「この人はこういうタイプだから、こことここの間にこれを混ぜたほうがいい」
 * 「前回はこうだったから、このくらいの時間で設定する」
 *
 * 設計原則:
 * - personalizeHints に proactive suggestion を 0-1 件追加
 * - 軸スコアの絶対値が閾値未満なら提案しない（データ不足で的外れ防止）
 * - 同じ提案タイプは連続回避（localStorage throttle）
 * - 提案は「理由 + アドバイス」の形式（Alter の人格で語る）
 */

import type { MorningPlan, PlanItem, PersonalityContext } from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 定数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 軸スコアがこれ以上（絶対値）なら提案候補に入れる */
const AXIS_THRESHOLD = 0.3;

/** 同じ提案タイプの再表示間隔（日） */
const TYPE_COOLDOWN_DAYS = 3;

const THROTTLE_KEY = "alter_morning_proactive_v1";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 提案タイプ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type SuggestionType =
  | "introvert_buffer"   // 内向型: ミーティング前後に一人の時間
  | "extrovert_social"   // 外向型: 一人作業が多い日に誰かと話す時間
  | "perfectionist_pace" // 完璧主義: タスク多すぎ注意
  | "spontaneous_flex"   // 即興型: 余白を設ける
  | "morning_energy"     // 朝型: 重要タスクを午前に
  | "evening_energy"     // 夜型: 朝は軽めに
  | "cautious_margin"    // 慎重型: 移動時間の余裕
  | "recovery_day";      // 曜日パターン: 調子が落ちやすい曜日

interface ProactiveSuggestion {
  type: SuggestionType;
  hint: string;
  priority: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Throttle
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ProactiveThrottle {
  lastShown: Record<string, string>; // type → YYYY-MM-DD
}

function loadThrottle(): ProactiveThrottle {
  if (typeof globalThis.localStorage === "undefined") return { lastShown: {} };
  try {
    const raw = localStorage.getItem(THROTTLE_KEY);
    return raw ? JSON.parse(raw) : { lastShown: {} };
  } catch {
    return { lastShown: {} };
  }
}

function saveThrottle(throttle: ProactiveThrottle): void {
  if (typeof globalThis.localStorage === "undefined") return;
  try {
    localStorage.setItem(THROTTLE_KEY, JSON.stringify(throttle));
  } catch { /* storage full */ }
}

function isOnCooldown(type: SuggestionType, throttle: ProactiveThrottle): boolean {
  const lastDate = throttle.lastShown[type];
  if (!lastDate) return false;
  const daysSince = Math.floor(
    (Date.now() - new Date(lastDate).getTime()) / (24 * 60 * 60 * 1000),
  );
  return daysSince < TYPE_COOLDOWN_DAYS;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// プラン分析ヘルパー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function countSocialItems(items: PlanItem[]): number {
  return items.filter(
    (i) => i.withWhom || /ミーティング|打ち?合わ?せ|面談|会議|人と|誰か/.test(i.text),
  ).length;
}

function countSoloWorkItems(items: PlanItem[]): number {
  return items.filter(
    (i) =>
      !i.withWhom &&
      /仕事|作業|勉強|資料|開発|読書|コーディング/.test(i.text) &&
      !/ミーティング|打ち?合わ?せ/.test(i.text),
  ).length;
}

function totalDurationMin(items: PlanItem[]): number {
  return items.reduce((sum, i) => sum + (i.durationMin || 0), 0);
}

function hasMorningHeavyTask(items: PlanItem[]): boolean {
  return items.some(
    (i) =>
      i.startTime &&
      i.startTime < "12:00" &&
      i.durationMin >= 60 &&
      /仕事|作業|開発|資料|ミーティング/.test(i.text),
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 候補生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateCandidates(
  plan: MorningPlan,
  ctx: PersonalityContext,
): ProactiveSuggestion[] {
  const candidates: ProactiveSuggestion[] = [];
  const items = plan.items.filter((i) => i.kind !== "travel");
  const socialCount = countSocialItems(items);
  const soloCount = countSoloWorkItems(items);
  const totalMin = totalDurationMin(items);

  // ── 内向型 + ミーティング複数 → バッファ提案 ──
  const ie = ctx.introvert_vs_extrovert ?? 0;
  if (ie < -AXIS_THRESHOLD && socialCount >= 2) {
    candidates.push({
      type: "introvert_buffer",
      hint: "人と会う予定が続くね。間に少し一人の時間を入れておくと、後半もペース保てるよ",
      priority: 85,
    });
  }

  // ── 外向型 + ソロ作業のみ → 誰かとの接点提案 ──
  if (ie > AXIS_THRESHOLD && socialCount === 0 && soloCount >= 2) {
    candidates.push({
      type: "extrovert_social",
      hint: "今日は一人作業が多いね。ランチか休憩で誰かと少し話す時間があると、エネルギー回復しやすいタイプだよ",
      priority: 70,
    });
  }

  // ── 完璧主義 + タスク過多 → ペーシング提案 ──
  const pp = ctx.perfectionist_vs_pragmatic ?? 0;
  if (pp < -AXIS_THRESHOLD && items.length >= 6) {
    candidates.push({
      type: "perfectionist_pace",
      hint: "やりたいこと多いね。全部こなそうとすると疲れやすいタイプだから、「今日はこの3つ」って決めるのもありだよ",
      priority: 80,
    });
  }

  // ── 即興型 + 隙間なし → 余白提案 ──
  const ps = ctx.plan_vs_spontaneous ?? 0;
  if (ps > AXIS_THRESHOLD && totalMin > 360 && items.length >= 4) {
    candidates.push({
      type: "spontaneous_flex",
      hint: "スケジュールがぎっちりだね。即興で動ける余白を少し残しておくと、いい発見があるタイプだよ",
      priority: 75,
    });
  }

  // ── 朝型 + 午前に重要タスクなし → 午前活用提案 ──
  const er = ctx.energy_rhythm ?? 0;
  if (er < -AXIS_THRESHOLD && !hasMorningHeavyTask(items) && items.length >= 3) {
    candidates.push({
      type: "morning_energy",
      hint: "午前中がいちばん集中できるタイプだから、大事なタスクを朝に持ってくるといいよ",
      priority: 65,
    });
  }

  // ── 夜型 + 朝に重いタスクあり → 朝は軽め提案 ──
  if (er > AXIS_THRESHOLD && hasMorningHeavyTask(items)) {
    candidates.push({
      type: "evening_energy",
      hint: "朝に重めのタスクが入ってるけど、エンジンかかるのが午後からのタイプだから、朝は軽めにして午後に集中するのもありだよ",
      priority: 65,
    });
  }

  // ── 慎重型 + 移動あり → 時間余裕提案 ──
  const cb = ctx.cautious_vs_bold ?? 0;
  const travelItems = plan.items.filter((i) => i.kind === "travel");
  if (cb < -AXIS_THRESHOLD && travelItems.length >= 2) {
    candidates.push({
      type: "cautious_margin",
      hint: "移動が何回かあるね。余裕を持たせた時間で組んでおくから、焦らず動けるよ",
      priority: 60,
    });
  }

  return candidates;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メイン API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * プランと性格コンテキストに基づき、0-1 件のプロアクティブ提案を生成する。
 *
 * - 軸スコアが閾値未満（データ不足）なら候補に入れない
 * - 同タイプは3日間クールダウン
 * - 優先度の最も高い1件を返す
 *
 * 返り値の hint を personalizeHints に追加して表示する。
 */
export function generateProactiveSuggestion(
  plan: MorningPlan,
  personalityContext?: PersonalityContext,
): string | null {
  if (!personalityContext) return null;

  // 最低限のデータがあるか（全軸 0 = 未観測 ならスキップ）
  const values = Object.values(personalityContext).filter(
    (v): v is number => typeof v === "number" && Math.abs(v) >= AXIS_THRESHOLD,
  );
  if (values.length === 0) return null;

  const candidates = generateCandidates(plan, personalityContext);
  if (candidates.length === 0) return null;

  // スロットル適用
  const throttle = loadThrottle();
  const available = candidates.filter((c) => !isOnCooldown(c.type, throttle));
  if (available.length === 0) return null;

  // 優先度順 → 最上位を選択
  available.sort((a, b) => b.priority - a.priority);
  const selected = available[0];

  // スロットル記録
  const today = new Date().toISOString().split("T")[0];
  saveThrottle({
    lastShown: { ...throttle.lastShown, [selected.type]: today },
  });

  return selected.hint;
}
