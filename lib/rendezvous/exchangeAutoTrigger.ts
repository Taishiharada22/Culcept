import "server-only";

import { createExchange } from "./exchangeProtocol";
import type { ExchangePayload } from "./exchangeProtocol";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { detectSafetyTopics } from "./counselor/safetyLayer";
import { detectTemperatureGap } from "./temperatureGapDetector";
import { buildContagionProfile } from "./emotionalContagion";

// ============================================================
// Exchange Auto-Trigger
//
// フィードバック提出時にExchangeを自動生成する。
// Phase Gate は createExchange 内でチェックされるため、
// Phase 4+ のペアでのみ実際に Exchange が作成される。
//
// 設計根拠（Part 1 §3.4）:
//   Exchange は手動ではなく、行動観測に基づいて
//   Counselor が自動生成するもの。ユーザーが直接操作しない。
// ============================================================

/**
 * フィードバック（sentiment）から Exchange を自動生成する。
 * Phase Gate は createExchange 内でチェックされるため、
 * Phase 4 未満のペアでは何もしない（例外をキャッチして無視）。
 */
export async function tryAutoCreateExchange(params: {
  candidateId: string;
  userId: string;
  sentiment: "positive" | "neutral" | "negative";
  candidate: {
    id: string;
    user_a: string;
    user_b: string;
  };
}): Promise<void> {
  const { candidateId, userId, sentiment, candidate } = params;

  // 相手ユーザーを特定
  const toUserId = candidate.user_a === userId
    ? candidate.user_b
    : candidate.user_a;

  // sentiment → 温度感スコアに変換
  const temperatureScore = sentimentToTemperature(sentiment);

  // Safety Layer + Topic extraction + Emotional Contagion: 直近メッセージを取得して分析
  let hasAnxietySignal = sentiment === "negative";
  let topicCategories: string[] = [];
  let contagionTemperature: number | null = null;
  let contagionFlow: string | null = null;
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentMsgs } = await supabaseAdmin
      .from("rendezvous_messages")
      .select("body, sender_id, created_at")
      .eq("candidate_id", candidateId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(50);

    const msgData = recentMsgs ?? [];
    const bodies = msgData.map((m) => m.body ?? "").filter(Boolean);
    if (bodies.length > 0) {
      // Safety check（discussion以上のみ反映 — mention は無視）
      const safetyResult = detectSafetyTopics(bodies.join(" "));
      if (safetyResult.detected && safetyResult.severity !== "mention") {
        hasAnxietySignal = true;
      }
      // Topic extraction
      topicCategories = extractTopicCategories(bodies);
    }

    // 感情共鳴分析 → temperatureScore の補正
    if (msgData.length >= 10) {
      // ascending 順に変換（contagionProfile は時系列順を期待）
      const chronological = [...msgData].reverse().map((m) => ({
        text: m.body ?? "",
        sender_id: m.sender_id,
        created_at: m.created_at,
      }));
      const profile = buildContagionProfile(chronological, userId);
      if (profile.contagionEvents.length > 0) {
        contagionTemperature = Math.round(profile.currentTemperature * 10);
        contagionFlow = profile.dominantFlow;
      }
    }
  } catch {
    // fail-open: メッセージ取得失敗時はデフォルト値を使用
  }

  // 双方温度差検出 → compatibilityNote に反映
  let compatibilityNote: string | null = null;
  try {
    const gapResult = await detectTemperatureGap({
      candidateId,
      userAId: candidate.user_a,
      userBId: candidate.user_b,
    });
    if (gapResult.gapDetected && gapResult.severity !== "mild") {
      compatibilityNote = gapResult.counselorNote;
    }
  } catch {
    // fail-open
  }

  // sentiment 単体よりも感情共鳴の温度を加味して精度向上
  //
  // ⚠️ 暫定ウェイト（設計根拠は仮置き）:
  //   sentiment (自己報告) : contagion (行動観測) = 60 : 40
  //
  //   根拠: 自己報告は意図的バイアスがあるが、本人の主観も無視できない。
  //   行動観測は客観性が高いが、キーワード検出精度に依存するため過信は危険。
  //   → 自己報告をやや優先しつつ、行動データで補正する。
  //
  //   将来の監査ポイント:
  //   - ズレが大きいペアで、どちら側がより正確だったかを実地データで検証
  //   - sentiment=positive + contagionTemp<3 のケースで結果がどうなるか追跡
  //   - 必要に応じてウェイトを調整、またはズレ自体を別シグナルとして扱う
  let finalTemperature = temperatureScore;
  if (contagionTemperature !== null) {
    finalTemperature = Math.round(temperatureScore * 0.6 + contagionTemperature * 0.4);
    finalTemperature = Math.max(1, Math.min(10, finalTemperature));
  }

  // 感情の流れが独立的な場合は compatibilityNote に追記
  if (contagionFlow === "independent" && !compatibilityNote) {
    compatibilityNote =
      "感情的な連動が弱い状態です。会話の中で相手の感情に反応するやり取りを増やすと、関係が深まる可能性があります。";
  }

  const payload: ExchangePayload = {
    temperatureScore: finalTemperature,
    topicCategories,
    hasAnxietySignal,
    nextRecommendedAction: sentimentToRecommendation(sentiment),
    compatibilityNote,
  };

  try {
    await createExchange({
      candidateId,
      fromUserId: userId,
      toUserId,
      payload,
    });
  } catch (err) {
    // Phase Gate 不足やその他のエラーは無視（Phase 4未満では正常）
    const message = err instanceof Error ? err.message : "";
    if (message.includes("Phase 4+")) {
      // Phase Gate 不足: 正常な動作。ログ不要。
      return;
    }
    throw err; // 予期しないエラーのみ再throw
  }
}

function sentimentToTemperature(
  sentiment: "positive" | "neutral" | "negative",
): number {
  switch (sentiment) {
    case "positive": return 8;
    case "neutral": return 5;
    case "negative": return 2;
  }
}

function sentimentToRecommendation(
  sentiment: "positive" | "neutral" | "negative",
): string | null {
  switch (sentiment) {
    case "positive":
      return "関係性が温まっています。次のステップを検討しましょう。";
    case "neutral":
      return "もう少し時間をかけて相手を知る段階です。";
    case "negative":
      return null;
  }
}

// ── 話題カテゴリ抽出 ──

type TopicCategory = {
  id: string;
  label: string;
  patterns: RegExp[];
};

const TOPIC_CATEGORIES: TopicCategory[] = [
  { id: "values", label: "価値観", patterns: [/大切|大事|価値|信念|理想|人生観|哲学/] },
  { id: "career", label: "仕事・キャリア", patterns: [/仕事|キャリア|転職|会社|職場|上司|同僚|残業/] },
  { id: "lifestyle", label: "ライフスタイル", patterns: [/趣味|休日|旅行|料理|運動|読書|映画|音楽|ゲーム/] },
  { id: "family", label: "家族・育ち", patterns: [/家族|両親|親|兄弟|姉妹|実家|育ち|子供|子ども/] },
  { id: "future", label: "将来設計", patterns: [/将来|未来|夢|目標|計画|いつか|何年後/] },
  { id: "emotions", label: "感情・内面", patterns: [/不安|嬉しい|悲しい|怒り|寂しい|楽しい|辛い|心配/] },
  { id: "daily", label: "日常・雑談", patterns: [/ご飯|天気|今日|昨日|明日|おはよう|おやすみ|疲れた/] },
  { id: "relationship", label: "関係性", patterns: [/好き|気になる|相性|距離感|ペース|連絡|既読/] },
];

/**
 * メッセージ本文群から話題カテゴリを抽出する。
 * 出現頻度の高い上位3カテゴリを返す。
 */
function extractTopicCategories(bodies: string[]): string[] {
  const allText = bodies.join(" ");
  const counts: Record<string, number> = {};

  for (const cat of TOPIC_CATEGORIES) {
    let matchCount = 0;
    for (const pattern of cat.patterns) {
      const matches = allText.match(new RegExp(pattern.source, "g"));
      if (matches) matchCount += matches.length;
    }
    if (matchCount > 0) {
      counts[cat.id] = matchCount;
    }
  }

  // 出現頻度順にソートし、上位3カテゴリを返す
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);
}
