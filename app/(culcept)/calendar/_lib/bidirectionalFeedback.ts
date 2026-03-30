/**
 * 双方向フィードバックエンジン
 *
 * 提案→着用→満足度の一方通行を超え、
 * ・提案拒否（別のコーデを選んだ）の暗黙ネガティブフィードバック
 * ・インサイトへの同意/不同意マイクロフィードバック
 * ・A/B比較選択による好み次元の高速学習
 * を統合的に捉え、学習速度を2倍にする。
 */

import type { WardrobeItem } from "@/app/my-style/_lib/types";

/* ── ストレージキー ── */
const REJECTION_KEY = "culcept_calendar_rejections_v1";
const INSIGHT_FB_KEY = "culcept_calendar_insight_fb_v1";
const AB_CHOICE_KEY = "culcept_calendar_ab_choices_v1";

/* ── 1. 提案拒否トラッキング ── */
export interface ProposalRejection {
  date: string;
  proposedItemIds: string[];         // 提案されたが着なかったアイテム
  chosenItemIds: string[];           // 代わりに着たアイテム
  weatherIcon?: string;
  events: string[];                  // event_type[]
  timestamp: number;
}

export function recordRejection(rejection: ProposalRejection): void {
  const history = loadRejections();
  history.push(rejection);
  // 直近120日分のみ保持
  const cutoff = Date.now() - 120 * 24 * 60 * 60 * 1000;
  const trimmed = history.filter(r => r.timestamp > cutoff);
  try {
    localStorage.setItem(REJECTION_KEY, JSON.stringify(trimmed));
  } catch { /* storage full */ }
}

export function loadRejections(): ProposalRejection[] {
  try {
    const raw = localStorage.getItem(REJECTION_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/**
 * アイテムの暗黙拒否率を算出
 * 提案回数のうち何回拒否されたか
 */
export interface ImplicitRejectionScore {
  itemId: string;
  proposedCount: number;
  rejectedCount: number;
  rejectionRate: number;            // 0-1
  recentTrend: "improving" | "worsening" | "stable";
}

export function computeImplicitRejections(rejections: ProposalRejection[]): Map<string, ImplicitRejectionScore> {
  const itemStats = new Map<string, { proposed: number; rejected: number; recentRejected: number; recentProposed: number }>();
  const now = Date.now();
  const recentCutoff = now - 30 * 24 * 60 * 60 * 1000;

  for (const r of rejections) {
    const isRecent = r.timestamp > recentCutoff;
    for (const id of r.proposedItemIds) {
      const s = itemStats.get(id) ?? { proposed: 0, rejected: 0, recentRejected: 0, recentProposed: 0 };
      s.proposed++;
      if (isRecent) s.recentProposed++;
      // 拒否 = 提案されたが chosenItemIds に含まれない
      if (!r.chosenItemIds.includes(id)) {
        s.rejected++;
        if (isRecent) s.recentRejected++;
      }
      itemStats.set(id, s);
    }
  }

  const result = new Map<string, ImplicitRejectionScore>();
  for (const [itemId, s] of itemStats) {
    if (s.proposed < 2) continue; // データ不足
    const rate = s.rejected / s.proposed;
    const recentRate = s.recentProposed > 0 ? s.recentRejected / s.recentProposed : rate;
    const trend: "improving" | "worsening" | "stable" =
      recentRate < rate - 0.15 ? "improving" :
      recentRate > rate + 0.15 ? "worsening" : "stable";
    result.set(itemId, { itemId, proposedCount: s.proposed, rejectedCount: s.rejected, rejectionRate: rate, recentTrend: trend });
  }
  return result;
}

/**
 * 拒否パターンから条件別のネガティブシグナルを検出
 * 例: 「雨の日にスニーカーが何度も拒否されている」
 */
export interface ConditionRejectionPattern {
  condition: string;           // e.g. "rain", "meeting", "date"
  rejectedItemIds: string[];   // この条件で繰り返し拒否されるアイテム
  count: number;
}

export function detectConditionRejectionPatterns(rejections: ProposalRejection[]): ConditionRejectionPattern[] {
  // condition → itemId → rejectedCount
  const condMap = new Map<string, Map<string, number>>();

  for (const r of rejections) {
    const conditions: string[] = [];
    if (r.weatherIcon) conditions.push(r.weatherIcon);
    conditions.push(...r.events);

    for (const cond of conditions) {
      if (!condMap.has(cond)) condMap.set(cond, new Map());
      const itemMap = condMap.get(cond)!;
      for (const id of r.proposedItemIds) {
        if (!r.chosenItemIds.includes(id)) {
          itemMap.set(id, (itemMap.get(id) ?? 0) + 1);
        }
      }
    }
  }

  const patterns: ConditionRejectionPattern[] = [];
  for (const [condition, itemMap] of condMap) {
    const frequent = [...itemMap.entries()].filter(([, count]) => count >= 2);
    if (frequent.length > 0) {
      patterns.push({
        condition,
        rejectedItemIds: frequent.map(([id]) => id),
        count: frequent.reduce((sum, [, c]) => sum + c, 0),
      });
    }
  }
  return patterns.sort((a, b) => b.count - a.count);
}

/**
 * 拒否データからスコアリング補正値を算出
 * rejectionRate >= 0.6 & count >= 3 → -15点
 * rejectionRate >= 0.4 → -8点
 * trend === "worsening" → 追加 -5点
 */
export function rejectionScoreAdjustment(
  rejections: ProposalRejection[],
  itemId: string,
): number {
  const scores = computeImplicitRejections(rejections);
  const s = scores.get(itemId);
  if (!s || s.proposedCount < 2) return 0;
  let adj = 0;
  if (s.rejectionRate >= 0.6 && s.proposedCount >= 3) adj -= 15;
  else if (s.rejectionRate >= 0.4) adj -= 8;
  if (s.recentTrend === "worsening") adj -= 5;
  return adj;
}

/* ── 2. インサイト同意/不同意 マイクロフィードバック ── */
export interface InsightFeedback {
  date: string;
  insightType: string;           // InsightType
  insightText: string;
  reaction: "agree" | "disagree";
  timestamp: number;
}

export function recordInsightFeedback(fb: InsightFeedback): void {
  const history = loadInsightFeedbacks();
  history.push(fb);
  const cutoff = Date.now() - 120 * 24 * 60 * 60 * 1000;
  const trimmed = history.filter(f => f.timestamp > cutoff);
  try {
    localStorage.setItem(INSIGHT_FB_KEY, JSON.stringify(trimmed));
  } catch { /* storage full */ }
}

export function loadInsightFeedbacks(): InsightFeedback[] {
  try {
    const raw = localStorage.getItem(INSIGHT_FB_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/**
 * インサイトタイプ別の同意率を算出
 * 不同意が多いインサイトタイプは優先度を下げる
 */
export interface InsightTypeAccuracy {
  type: string;
  agreeCount: number;
  disagreeCount: number;
  accuracy: number;              // 0-1
}

export function computeInsightAccuracy(): Map<string, InsightTypeAccuracy> {
  const fbs = loadInsightFeedbacks();
  const typeStats = new Map<string, { agree: number; disagree: number }>();

  for (const fb of fbs) {
    const s = typeStats.get(fb.insightType) ?? { agree: 0, disagree: 0 };
    if (fb.reaction === "agree") s.agree++;
    else s.disagree++;
    typeStats.set(fb.insightType, s);
  }

  const result = new Map<string, InsightTypeAccuracy>();
  for (const [type, s] of typeStats) {
    const total = s.agree + s.disagree;
    if (total < 2) continue;
    result.set(type, {
      type,
      agreeCount: s.agree,
      disagreeCount: s.disagree,
      accuracy: s.agree / total,
    });
  }
  return result;
}

/**
 * インサイト優先度調整: accuracy < 0.4 → 優先度を-50、accuracy > 0.7 → +20
 */
export function insightPriorityAdjustment(insightType: string): number {
  const acc = computeInsightAccuracy().get(insightType);
  if (!acc) return 0;
  if (acc.accuracy < 0.4 && (acc.agreeCount + acc.disagreeCount) >= 3) return -50;
  if (acc.accuracy > 0.7) return 20;
  return 0;
}

/* ── 3. A/B比較選択 ── */
export interface ABChoice {
  date: string;
  chosenProposalId: string;
  rejectedProposalId: string;
  chosenItems: string[];             // item IDs
  rejectedItems: string[];           // item IDs
  // 選択から推論される好み次元
  inferredPreferences: ABPreference[];
  timestamp: number;
}

export interface ABPreference {
  dimension: "formality" | "warmth" | "color" | "silhouette" | "material";
  preferred: string;                 // e.g. "casual", "dark", "slim"
  over: string;                      // e.g. "dress", "light", "oversized"
  strength: number;                  // 0-1
}

export function recordABChoice(choice: ABChoice): void {
  const history = loadABChoices();
  history.push(choice);
  const cutoff = Date.now() - 120 * 24 * 60 * 60 * 1000;
  const trimmed = history.filter(c => c.timestamp > cutoff);
  try {
    localStorage.setItem(AB_CHOICE_KEY, JSON.stringify(trimmed));
  } catch { /* storage full */ }
}

export function loadABChoices(): ABChoice[] {
  try {
    const raw = localStorage.getItem(AB_CHOICE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/**
 * 2つの提案アイテムセットを比較して、好み次元の差分を推論
 */
export function inferPreferencesFromComparison(
  chosenItems: WardrobeItem[],
  rejectedItems: WardrobeItem[],
): ABPreference[] {
  const prefs: ABPreference[] = [];

  // フォーマリティ比較
  const fOrder: Record<string, number> = { casual: 0, smart: 1, dress: 2 };
  const chosenF = avgVal(chosenItems.map(i => fOrder[i.formality ?? "casual"] ?? 0));
  const rejectedF = avgVal(rejectedItems.map(i => fOrder[i.formality ?? "casual"] ?? 0));
  if (Math.abs(chosenF - rejectedF) >= 0.3) {
    prefs.push({
      dimension: "formality",
      preferred: chosenF > rejectedF ? "formal" : "casual",
      over: chosenF > rejectedF ? "casual" : "formal",
      strength: Math.min(1, Math.abs(chosenF - rejectedF)),
    });
  }

  // シルエット比較
  const sOrder: Record<string, number> = { tight: 0, slim: 0.25, regular: 0.5, relaxed: 0.75, oversized: 1 };
  const chosenS = avgVal(chosenItems.map(i => sOrder[i.silhouette ?? "regular"] ?? 0.5));
  const rejectedS = avgVal(rejectedItems.map(i => sOrder[i.silhouette ?? "regular"] ?? 0.5));
  if (Math.abs(chosenS - rejectedS) >= 0.2) {
    prefs.push({
      dimension: "silhouette",
      preferred: chosenS > rejectedS ? "loose" : "fitted",
      over: chosenS > rejectedS ? "fitted" : "loose",
      strength: Math.min(1, Math.abs(chosenS - rejectedS) * 2),
    });
  }

  return prefs;
}

/**
 * A/B選択履歴から次元別の好みスコアを集計
 * → scoreCandidate で使用
 */
export interface DimensionPreference {
  dimension: string;
  preferredDirection: string;  // e.g. "casual", "loose"
  strength: number;            // 0-1, 累積確信度
  dataPoints: number;
}

export function aggregateABPreferences(): DimensionPreference[] {
  const choices = loadABChoices();
  const dimMap = new Map<string, { directions: Map<string, number>; total: number }>();

  for (const choice of choices) {
    for (const pref of choice.inferredPreferences) {
      if (!dimMap.has(pref.dimension)) {
        dimMap.set(pref.dimension, { directions: new Map(), total: 0 });
      }
      const d = dimMap.get(pref.dimension)!;
      d.directions.set(pref.preferred, (d.directions.get(pref.preferred) ?? 0) + pref.strength);
      d.total++;
    }
  }

  const result: DimensionPreference[] = [];
  for (const [dimension, d] of dimMap) {
    if (d.total < 2) continue;
    let bestDir = "";
    let bestScore = 0;
    for (const [dir, score] of d.directions) {
      if (score > bestScore) { bestDir = dir; bestScore = score; }
    }
    result.push({
      dimension,
      preferredDirection: bestDir,
      strength: Math.min(1, bestScore / d.total),
      dataPoints: d.total,
    });
  }
  return result;
}

/**
 * A/B好みに基づくスコア補正
 * フォーマリティ好みがcasualなのにdressアイテム → -8
 * フォーマリティ好みがcasualでcasualアイテム → +5
 */
export function abPreferenceBoost(item: WardrobeItem): number {
  const prefs = aggregateABPreferences();
  let boost = 0;

  for (const pref of prefs) {
    if (pref.dataPoints < 3) continue;

    if (pref.dimension === "formality") {
      const fOrder: Record<string, number> = { casual: 0, smart: 1, dress: 2 };
      const itemF = fOrder[item.formality ?? "casual"] ?? 0;
      if (pref.preferredDirection === "casual" && itemF <= 0) boost += Math.round(pref.strength * 5);
      else if (pref.preferredDirection === "formal" && itemF >= 2) boost += Math.round(pref.strength * 5);
      else if (pref.preferredDirection === "casual" && itemF >= 2) boost -= Math.round(pref.strength * 8);
      else if (pref.preferredDirection === "formal" && itemF <= 0) boost -= Math.round(pref.strength * 8);
    }

    if (pref.dimension === "silhouette") {
      const sOrder: Record<string, number> = { tight: 0, slim: 0.25, regular: 0.5, relaxed: 0.75, oversized: 1 };
      const itemS = sOrder[item.silhouette ?? "regular"] ?? 0.5;
      if (pref.preferredDirection === "loose" && itemS >= 0.6) boost += Math.round(pref.strength * 4);
      else if (pref.preferredDirection === "fitted" && itemS <= 0.3) boost += Math.round(pref.strength * 4);
    }
  }

  return boost;
}

/* ── 統合: フィードバック学習の総合サマリ ── */
export interface FeedbackSummary {
  rejectionCount: number;
  insightFeedbackCount: number;
  abChoiceCount: number;
  totalDataPoints: number;
  topRejectedItems: Array<{ itemId: string; rate: number }>;
  insightAccuracy: Map<string, InsightTypeAccuracy>;
  dimensionPreferences: DimensionPreference[];
}

export function buildFeedbackSummary(): FeedbackSummary {
  const rejections = loadRejections();
  const insightFbs = loadInsightFeedbacks();
  const abChoices = loadABChoices();

  const rejScores = computeImplicitRejections(rejections);
  const topRejected = [...rejScores.values()]
    .filter(s => s.proposedCount >= 3 && s.rejectionRate >= 0.5)
    .sort((a, b) => b.rejectionRate - a.rejectionRate)
    .slice(0, 5)
    .map(s => ({ itemId: s.itemId, rate: s.rejectionRate }));

  return {
    rejectionCount: rejections.length,
    insightFeedbackCount: insightFbs.length,
    abChoiceCount: abChoices.length,
    totalDataPoints: rejections.length + insightFbs.length + abChoices.length,
    topRejectedItems: topRejected,
    insightAccuracy: computeInsightAccuracy(),
    dimensionPreferences: aggregateABPreferences(),
  };
}

/* ── ヘルパー ── */
function avgVal(nums: number[]): number {
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0.5;
}
