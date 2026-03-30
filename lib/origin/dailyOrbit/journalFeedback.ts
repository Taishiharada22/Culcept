/**
 * Journal → Profile 接続フィードバック
 * Journal 保存後に、蓄積価値を感じる1-2行の返答を生成。
 * 毎回は出さない。適切なタイミングで返す。
 */

import type { DailyOrbitStore } from "./types";
import { generateWeatherReflection } from "./weatherLoop";

export type JournalFeedback = {
  text: string;
  type: "emotion_trend" | "streak" | "law_connection" | "texture_trend" | "milestone" | "weather_reflection";
};

const FEEDBACK_COOLDOWN_KEY = "origin_journal_feedback_v1";

/**
 * 最後にフィードバックを表示してからの日数をチェック。
 * 連続表示を避けるため、最低2日空ける。
 */
function canShowFeedback(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = localStorage.getItem(FEEDBACK_COOLDOWN_KEY);
    if (!last) return true;
    const diff = Date.now() - parseInt(last, 10);
    return diff > 2 * 24 * 3600 * 1000; // 2日以上
  } catch { return true; }
}

function markFeedbackShown(): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(FEEDBACK_COOLDOWN_KEY, String(Date.now())); } catch {}
}

/**
 * Journal 保存後のフィードバックを生成。
 * null = 今回は出さない（頻度制御 or データ不足）
 */
export function generateJournalFeedback(
  store: DailyOrbitStore,
  today: string,
  emotionTags: string[],
  journalEntryCount: number,
  journalStreak: number,
): JournalFeedback | null {
  if (!canShowFeedback()) return null;

  const candidates: JournalFeedback[] = [];

  // ── 感情タグのリピート傾向 ──
  if (emotionTags.length > 0) {
    // 今月の全エントリからタグを集計（API側で取得済みの場合）
    // ここではstoreからjournal感情タグを直接取れないので、
    // 渡された情報を使う
    // 実装: 呼び出し元がemotion_tags の月間カウントを渡す想定
  }

  // ── 連続記録マイルストーン ──
  if (journalStreak === 3) {
    candidates.push({
      text: "3日連続で記録しています。リズムができてきました",
      type: "streak",
    });
  } else if (journalStreak === 7) {
    candidates.push({
      text: "1週間連続で書いています。振り返る力が育っています",
      type: "streak",
    });
  } else if (journalStreak === 14) {
    candidates.push({
      text: "2週間の記録。あなたのプロフィールがかなり鮮明になってきました",
      type: "streak",
    });
  } else if (journalStreak === 30) {
    candidates.push({
      text: "30日間の記録達成。これは立派な自分の記録です",
      type: "milestone",
    });
  }

  // ── エントリ数マイルストーン ──
  if (journalEntryCount === 10) {
    candidates.push({
      text: "10回目の記録。ここまでの積み重ねが、法則の候補になります",
      type: "milestone",
    });
  } else if (journalEntryCount === 30) {
    candidates.push({
      text: "30回目の記録。月間レポートの精度が上がりました",
      type: "milestone",
    });
  }

  // ── テクスチャ傾向への接続 ──
  const recentEntries = Object.values(store.entries)
    .filter((e) => e.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 7);

  let satisfyingCount = 0;
  let totalTextures = 0;
  for (const e of recentEntries) {
    for (const t of e.tasks) {
      if (t.texture) {
        totalTextures++;
        if (t.texture === "satisfying") satisfyingCount++;
      }
    }
  }
  if (totalTextures >= 5 && satisfyingCount / totalTextures >= 0.6) {
    candidates.push({
      text: "最近「すっきり」で終われるタスクが増えています。良い流れです",
      type: "texture_trend",
    });
  }

  // ── 法則候補への接続 ──
  const dayCount = store.firstUsedAt
    ? Math.floor((Date.now() - new Date(store.firstUsedAt).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 0;
  if (dayCount >= 10 && dayCount <= 14) {
    candidates.push({
      text: "今日の記録は、来週の法則候補に加わりました",
      type: "law_connection",
    });
  }

  // ── Weather 振り返り（朝の天気 vs 実際の結果）──
  const reflection = generateWeatherReflection(store, today);
  if (reflection) {
    candidates.push({
      text: reflection.narrative,
      type: "weather_reflection",
    });
  }

  if (candidates.length === 0) return null;

  // ランダムに1つ選択（マイルストーンは優先）
  const milestones = candidates.filter((c) => c.type === "milestone" || c.type === "streak");
  const chosen = milestones.length > 0
    ? milestones[0]
    : candidates[Math.floor(Math.random() * candidates.length)];

  markFeedbackShown();
  return chosen;
}

/**
 * 感情タグの月間リピート傾向を返す。
 * Journal の emotion_tags 配列群から算出。
 */
export function generateEmotionTrend(
  allEmotionTags: string[][],
  currentTags: string[],
): string | null {
  if (currentTags.length === 0 || allEmotionTags.length < 3) return null;

  const counts: Record<string, number> = {};
  for (const tags of allEmotionTags) {
    for (const tag of tags) {
      counts[tag] = (counts[tag] ?? 0) + 1;
    }
  }

  // 今回のタグの中で、最もリピートされているものを見つける
  let bestTag: string | null = null;
  let bestCount = 0;
  for (const tag of currentTags) {
    const count = (counts[tag] ?? 0) + 1; // +1 for current
    if (count >= 3 && count > bestCount) {
      bestCount = count;
      bestTag = tag;
    }
  }

  if (!bestTag) return null;
  return `「${bestTag}」が今月${bestCount}回目。今月の基調になりつつあります`;
}
