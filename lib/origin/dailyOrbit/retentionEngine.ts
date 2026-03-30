// lib/origin/dailyOrbit/retentionEngine.ts
// 継続の仕組み — 自己解像度 / 発見タイムライン / 糸 / 不意打ち観測 / 不在観測 / 予言対決

import type {
  DailyOrbitStore,
  DailyOrbitEntry,
  SelfResolution,
  OrbitThread,
  SurpriseObservation,
  TurningPoint,
  OrbitLaw,
  TaskNature,
} from "./types";
import { DISCOVERY_MILESTONES } from "./types";
import {
  getDaysUsed,
  getAbsenceDays,
  getRecentEntries,
} from "./store";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// A. Self-Resolution — 自己解像度の計算
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function updateSelfResolution(
  store: DailyOrbitStore,
  today: string,
): SelfResolution {
  const prev = store.selfResolution;
  const daysUsed = getDaysUsed(store);
  const absenceDays = getAbsenceDays(store, today);
  const recent = getRecentEntries(store, today, 7);

  // ── ベーススコア: 使用日数ベース（1日あたり +0.4、最大40） ──
  const baseScore = Math.min(40, daysUsed * 0.4);

  // ── データの豊かさボーナス（最大30） ──
  let richnessScore = 0;
  for (const entry of recent) {
    if (entry.bodyEcho) richnessScore += 0.5;
    if (entry.shadowIntention) richnessScore += 0.8;
    if (entry.temporalDialogue?.response) richnessScore += 0.3;
    if (entry.timeTexture !== null) richnessScore += 0.3;
    if (entry.reflection) richnessScore += 0.5;
    const natured = entry.tasks.filter((t) => t.nature).length;
    const textured = entry.tasks.filter((t) => t.texture).length;
    richnessScore += Math.min(1, natured * 0.2);
    richnessScore += Math.min(1, textured * 0.2);
  }
  richnessScore = Math.min(30, richnessScore);

  // ── 予測精度ボーナス（最大20） ──
  let predictionScore = 0;
  const entriesWithForecast = Object.values(store.entries).filter(
    (e) => e.selfForecast?.actual !== undefined,
  );
  if (entriesWithForecast.length >= 3) {
    let hits = 0;
    for (const e of entriesWithForecast) {
      const diff = Math.abs(
        (e.selfForecast!.actual ?? 0) - e.selfForecast!.predictedCompletion,
      );
      if (diff <= 1) hits++;
    }
    const accuracy = hits / entriesWithForecast.length;
    predictionScore = Math.min(20, accuracy * 20);
  }

  // ── 法則ボーナス（最大10） ──
  const lawScore = Math.min(10, store.orbitLaws.length * 1.5);

  // ── 不在ペナルティ ──
  const absencePenalty = Math.min(15, absenceDays * 1.5);

  const rawScore = baseScore + richnessScore + predictionScore + lawScore - absencePenalty;
  const score = Math.max(0, Math.min(100, Math.round(rawScore * 10) / 10));

  // 履歴を更新（直近30日）
  const history = [...prev.history, { date: today, score }].slice(-30);

  return { score, updatedAt: new Date().toISOString(), history };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// B. Prediction Duel — 予言対決
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type PredictionDuelResult = {
  userPrediction: number;
  systemPrediction: number;
  actual: number;
  userAccuracy: number; // 0-100%
  systemAccuracy: number; // 0-100%
  winner: "user" | "system" | "tie";
};

export function evaluatePredictionDuel(
  entry: DailyOrbitEntry,
): PredictionDuelResult | null {
  if (
    entry.userPrediction === null ||
    !entry.selfForecast ||
    entry.selfForecast.actual === undefined
  ) {
    return null;
  }

  const actual = entry.selfForecast.actual;
  const total = entry.selfForecast.totalTasks;
  if (total === 0) return null;

  const userDiff = Math.abs(entry.userPrediction - actual);
  const sysDiff = Math.abs(entry.selfForecast.predictedCompletion - actual);

  const userAccuracy = Math.max(0, 100 - (userDiff / total) * 100);
  const systemAccuracy = Math.max(0, 100 - (sysDiff / total) * 100);

  const winner =
    userDiff < sysDiff ? "user" : userDiff > sysDiff ? "system" : "tie";

  return {
    userPrediction: entry.userPrediction,
    systemPrediction: entry.selfForecast.predictedCompletion,
    actual,
    userAccuracy: Math.round(userAccuracy),
    systemAccuracy: Math.round(systemAccuracy),
    winner,
  };
}

/** 累計の予言対決スコア */
export function getOverallPredictionScore(
  store: DailyOrbitStore,
): { userWins: number; systemWins: number; ties: number; userAvgAccuracy: number; systemAvgAccuracy: number } | null {
  const results: PredictionDuelResult[] = [];
  for (const entry of Object.values(store.entries)) {
    const r = evaluatePredictionDuel(entry);
    if (r) results.push(r);
  }
  if (results.length < 3) return null;

  return {
    userWins: results.filter((r) => r.winner === "user").length,
    systemWins: results.filter((r) => r.winner === "system").length,
    ties: results.filter((r) => r.winner === "tie").length,
    userAvgAccuracy: Math.round(
      results.reduce((s, r) => s + r.userAccuracy, 0) / results.length,
    ),
    systemAvgAccuracy: Math.round(
      results.reduce((s, r) => s + r.systemAccuracy, 0) / results.length,
    ),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// C. Thread Detection — 糸の検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function detectThreads(
  store: DailyOrbitStore,
  today: string,
): OrbitThread[] {
  const entries = getRecentEntries(store, today, 30);
  if (entries.length < 7) return store.threads;

  const threads: OrbitThread[] = [...store.threads];
  const now = new Date().toISOString();

  // ── 1. 義務比率の推移 ──
  const weeklyObligation = computeWeeklyNatureRatio(entries, "obligation");
  if (weeklyObligation.length >= 2) {
    const trend = weeklyObligation[0] - weeklyObligation[weeklyObligation.length - 1];
    if (Math.abs(trend) > 0.15) {
      const direction = trend > 0 ? "増加" : "減少";
      upsertThreadInList(threads, {
        id: "obligation_trend",
        title: "義務との関係",
        description: `義務タスクの比率が${direction}傾向（${Math.round(weeklyObligation[weeklyObligation.length - 1] * 100)}% → ${Math.round(weeklyObligation[0] * 100)}%）`,
        startDate: entries[entries.length - 1].date,
        lastUpdated: now,
        status: "active",
        dataPoints: weeklyObligation.map((v, i) => ({
          date: entries[Math.min(i * 7, entries.length - 1)]?.date ?? today,
          summary: `${Math.round(v * 100)}%`,
        })),
      });
    }
  }

  // ── 2. 朝と夜の乖離 ──
  const temporalResponses = entries
    .filter((e) => e.temporalDialogue?.response)
    .map((e) => e.temporalDialogue!.response!);
  if (temporalResponses.length >= 5) {
    const followRate =
      temporalResponses.filter((r) => r === "lets_go").length /
      temporalResponses.length;
    if (followRate < 0.5) {
      upsertThreadInList(threads, {
        id: "morning_night_gap",
        title: "朝と夜の乖離",
        description: `昨日の自分に従う率${Math.round(followRate * 100)}%。朝のあなたと夜のあなたは別の人間のように動いている`,
        startDate: entries[entries.length - 1].date,
        lastUpdated: now,
        status: "active",
        dataPoints: [],
      });
    }
  }

  // ── 3. 隠れた本心の反復テーマ ──
  const shadows = entries
    .filter((e) => e.shadowIntention?.text)
    .map((e) => ({ date: e.date, text: e.shadowIntention!.text }));
  if (shadows.length >= 3) {
    // 類似テキストをグループ化（簡易: 共通キーワードで判定）
    const keywords = extractRepeatingKeywords(shadows.map((s) => s.text));
    for (const kw of keywords) {
      const related = shadows.filter((s) => s.text.includes(kw));
      if (related.length >= 2) {
        upsertThreadInList(threads, {
          id: `shadow_${kw}`,
          title: `隠れた本心:「${kw}」`,
          description: `「${kw}」に関する思いが${related.length}回影に現れている`,
          startDate: related[related.length - 1].date,
          lastUpdated: now,
          status: "active",
          dataPoints: related.map((r) => ({ date: r.date, summary: r.text })),
        });
      }
    }
  }

  // ── 4. 身体パターンの推移 ──
  const bodyHeavyDays = entries.filter(
    (e) => e.bodyEcho?.head === "heavy" || e.bodyEcho?.limbs === "heavy",
  );
  const bodyLightDays = entries.filter(
    (e) => e.bodyEcho?.head === "light" || e.bodyEcho?.limbs === "light",
  );
  if (bodyHeavyDays.length + bodyLightDays.length >= 7) {
    const heavyRatio = bodyHeavyDays.length / (bodyHeavyDays.length + bodyLightDays.length);
    upsertThreadInList(threads, {
      id: "body_trend",
      title: "身体の推移",
      description:
        heavyRatio > 0.6
          ? `身体が重い日が${Math.round(heavyRatio * 100)}%。何かが身体に現れている`
          : `身体が軽い日が増えている。何かが変わり始めているかもしれない`,
      startDate: entries[entries.length - 1].date,
      lastUpdated: now,
      status: "active",
      dataPoints: [],
    });
  }

  return threads;
}

function computeWeeklyNatureRatio(
  entries: DailyOrbitEntry[],
  nature: TaskNature,
): number[] {
  const weeks: number[] = [];
  for (let i = 0; i < entries.length; i += 7) {
    const week = entries.slice(i, i + 7);
    const total = week.reduce((s, e) => s + e.tasks.length, 0);
    const matched = week.reduce(
      (s, e) => s + e.tasks.filter((t) => t.nature === nature).length,
      0,
    );
    if (total > 0) weeks.push(matched / total);
  }
  return weeks;
}

function upsertThreadInList(threads: OrbitThread[], thread: OrbitThread) {
  const idx = threads.findIndex((t) => t.id === thread.id);
  if (idx >= 0) {
    threads[idx] = thread;
  } else {
    threads.push(thread);
  }
}

function extractRepeatingKeywords(texts: string[]): string[] {
  const wordCounts: Record<string, number> = {};
  for (const text of texts) {
    // 2文字以上の単語を抽出
    const words = text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]{2,}/g) ?? [];
    const seen = new Set<string>();
    for (const w of words) {
      if (!seen.has(w)) {
        wordCounts[w] = (wordCounts[w] ?? 0) + 1;
        seen.add(w);
      }
    }
  }
  return Object.entries(wordCounts)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word]) => word);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// D. Surprise Observations — 不意打ち観測の生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function generateSurpriseObservation(
  store: DailyOrbitStore,
  today: string,
): SurpriseObservation | null {
  const daysUsed = getDaysUsed(store);
  if (daysUsed < 5) return null;

  // 3-5日に1回だけ表示（日付シードで決定）
  const seed = today.split("-").reduce((a, n) => a + parseInt(n, 10), 0);
  if (seed % 4 !== 0) return null; // 約25%の確率

  // 今日すでに生成済みなら返さない
  if (store.surpriseObservations.some((o) => o.date === today)) return null;

  const entries = getRecentEntries(store, today, 30);
  const now = new Date().toISOString();

  // ── パターン1: 点と点を繋ぐ ──
  const dotConnection = tryDotConnection(entries);
  if (dotConnection) {
    return {
      id: `surprise_${today}`,
      date: today,
      text: dotConnection,
      type: "dot_connection",
    };
  }

  // ── パターン2: システムの困惑 ──
  const confusion = trySystemConfusion(entries);
  if (confusion) {
    return {
      id: `surprise_${today}`,
      date: today,
      text: confusion,
      type: "system_confusion",
    };
  }

  return null;
}

function tryDotConnection(entries: DailyOrbitEntry[]): string | null {
  // 隠れた本心 × タスクの不在を検出
  const shadowEntries = entries.filter((e) => e.shadowIntention?.text);
  if (shadowEntries.length < 2) return null;

  // 影に出てくるテーマがタスクに一度も出てこないパターン
  const shadowTexts = shadowEntries.map((e) => e.shadowIntention!.text);
  const taskTexts = entries.flatMap((e) => e.tasks.map((t) => t.text));
  const allTaskText = taskTexts.join(" ");

  for (const shadow of shadowTexts) {
    const keywords = shadow.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]{2,}/g) ?? [];
    for (const kw of keywords) {
      if (kw.length >= 2 && !allTaskText.includes(kw)) {
        return `隠れた本心に「${kw}」が現れたけど、タスクには一度も登場していない。意識はそこに向いているのに、行動はとどいていない`;
      }
    }
  }

  // 身体の状態 × 感情の矛盾を検出
  const contradictions = entries.filter(
    (e) =>
      e.bodyEcho?.chest === "tight" &&
      e.dayState?.emotion === "calm",
  );
  if (contradictions.length >= 2) {
    return `「穏やか」と感じている日に、胸は「詰まる」と言っている。言語化できていない緊張があるのかもしれない`;
  }

  return null;
}

function trySystemConfusion(entries: DailyOrbitEntry[]): string | null {
  // 曜日別の完了率で異常値を検出
  const dayRates: Record<number, { completed: number; total: number }> = {};
  for (const entry of entries) {
    if (entry.tasks.length === 0) continue;
    const dow = new Date(entry.date).getDay();
    if (!dayRates[dow]) dayRates[dow] = { completed: 0, total: 0 };
    dayRates[dow].completed += entry.tasks.filter((t) => t.completed).length;
    dayRates[dow].total += entry.tasks.length;
  }

  const dayNames = ["日曜", "月曜", "火曜", "水曜", "木曜", "金曜", "土曜"];
  const rates = Object.entries(dayRates)
    .filter(([, v]) => v.total >= 3)
    .map(([dow, v]) => ({ dow: Number(dow), rate: v.completed / v.total }));

  if (rates.length < 3) return null;

  const avgRate = rates.reduce((s, r) => s + r.rate, 0) / rates.length;
  const outlier = rates.find((r) => Math.abs(r.rate - avgRate) > 0.25);

  if (!outlier) return null;

  const direction = outlier.rate > avgRate ? "急に上がる" : "急に下がる";
  return `あなたのパターンに1つだけ説明できないものがある。${dayNames[outlier.dow]}だけ完了率が${direction}。理由がわからない。心当たりは？`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// D'. Absence Observation — 不在の観測
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function getAbsenceMessage(
  store: DailyOrbitStore,
  today: string,
): string | null {
  const absence = getAbsenceDays(store, today);
  if (absence <= 0) return null;

  const prevScore = store.selfResolution.score;

  if (absence === 1) {
    return "昨日は軌道の外にいた。どんな日に軌道を外れるか、それ自体があなたのパターン";
  }
  if (absence <= 3) {
    return `${absence}日間の不在。予測精度が少し下がった。でもこの不在自体がデータ`;
  }
  if (absence <= 7) {
    return `${absence}日ぶりの帰還。不在の間もあなたは生きていた。戻ってきた理由を聞いてもいい？`;
  }
  return `${absence}日ぶり。長い不在だった。自己解像度は${Math.round(prevScore)}%まで下がっている — でもここから取り戻せる`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// E. Discovery Timeline — 発見のタイムライン
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function checkDiscoveryMilestones(
  store: DailyOrbitStore,
  today: string,
): { newlyUnlocked: number[]; nextMilestone: { day: number; label: string; daysLeft: number } | null } {
  const daysUsed = getDaysUsed(store);
  const milestones = [1, 3, 5, 7, 10, 14, 21, 30, 60, 90];
  const newlyUnlocked: number[] = [];

  for (const day of milestones) {
    if (daysUsed >= day && !store.discoveryUnlocked[day]) {
      newlyUnlocked.push(day);
    }
  }

  // 次のマイルストーン
  const nextDay = milestones.find(
    (d) => daysUsed < d,
  );

  const nextMilestone = nextDay
    ? {
        day: nextDay,
        label: DISCOVERY_MILESTONES.find((m) => m.day === nextDay)?.label ?? "",
        daysLeft: nextDay - daysUsed,
      }
    : null;

  return { newlyUnlocked, nextMilestone };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// F. Turning Point Detection — 分岐点の自動検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function detectTurningPoints(
  store: DailyOrbitStore,
  today: string,
  entry: DailyOrbitEntry,
): TurningPoint[] {
  const points: TurningPoint[] = [];
  const now = new Date().toISOString();

  // ── 初めて義務タスクを流した日 ──
  const hasPastRelease = Object.values(store.entries).some(
    (e) => e.date !== today && e.tasks.some((t) => !t.completed && t.nature === "obligation"),
  );
  // 今日流した（漂流タスクで release した）場合は DriftAction で検出するため、
  // ここでは「初めて全未完了で義務がある日」を検出
  if (!hasPastRelease) {
    const releasedObligation = entry.tasks.some(
      (t) => !t.completed && t.nature === "obligation",
    );
    // これは夜の時点でチェックされる
  }

  // ── 自己予測がシステムを超えた日 ──
  if (entry.userPrediction !== null && entry.selfForecast?.actual !== undefined) {
    const userDiff = Math.abs(entry.userPrediction - entry.selfForecast.actual);
    const sysDiff = Math.abs(
      entry.selfForecast.predictedCompletion - entry.selfForecast.actual,
    );
    if (userDiff < sysDiff) {
      // 過去に一度も超えたことがないか確認
      const pastWins = Object.values(store.entries).filter((e) => {
        if (e.date === today || e.userPrediction === null || !e.selfForecast?.actual)
          return false;
        const ud = Math.abs(e.userPrediction - e.selfForecast.actual);
        const sd = Math.abs(e.selfForecast.predictedCompletion - e.selfForecast.actual);
        return ud < sd;
      });
      if (pastWins.length === 0) {
        points.push({
          id: `tp_pred_${today}`,
          date: today,
          title: "自己予測がシステムを初めて上回った日",
          description:
            "自己理解度が一段階深まった瞬間",
          category: "prediction_surpassed",
        });
      }
    }
  }

  // ── 隠れた本心が消えた日 ──
  const recentShadows = getRecentEntries(store, today, 14)
    .filter((e) => e.shadowIntention?.text)
    .map((e) => e.shadowIntention!.text);
  const olderShadows = getRecentEntries(store, today, 30)
    .slice(14)
    .filter((e) => e.shadowIntention?.text)
    .map((e) => e.shadowIntention!.text);

  // 以前あったキーワードが最近消えた
  for (const oldShadow of olderShadows) {
    const keywords =
      oldShadow.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]{2,}/g) ?? [];
    for (const kw of keywords) {
      const wasFrequent =
        olderShadows.filter((s) => s.includes(kw)).length >= 2;
      const isGone = !recentShadows.some((s) => s.includes(kw));
      if (wasFrequent && isGone) {
        points.push({
          id: `tp_shadow_${kw}_${today}`,
          date: today,
          title: `隠れた本心から「${kw}」が消えた日`,
          description: `以前は繰り返し現れていた言葉が消えた。解決したのか、封じたのか`,
          category: "shadow_resolved",
        });
        break; // 1つ見つかれば十分
      }
    }
  }

  // ── 不在からの帰還 ──
  const absence = getAbsenceDays(store, today);
  if (absence >= 3) {
    points.push({
      id: `tp_return_${today}`,
      date: today,
      title: `${absence}日間の不在からの帰還`,
      description: "軌道の外にいた期間。そこにもあなたの法則がある",
      category: "absence_return",
    });
  }

  return points;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// G. Law Promotion — 人生の法則への昇格
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function checkLawPromotions(
  store: DailyOrbitStore,
  today: string,
): OrbitLaw[] {
  const currentMonth = today.slice(0, 7); // YYYY-MM
  const promoted: OrbitLaw[] = [];

  for (const law of store.orbitLaws) {
    if (law.promotedAt) continue; // 既に昇格済み
    const streak = law.streak ?? 1;
    if (streak >= 3) {
      promoted.push({
        ...law,
        promotedAt: currentMonth,
        streak,
      });
    }
  }

  return promoted;
}
