/**
 * CoAlter L3: 会話理解 — テーマ・膠着点・Caring Intensity 解析
 *
 * Talk の既存メッセージ取得パターン（fetchRecentTurns）を転用。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ConversationAnalysis,
  ConversationTheme,
  ConversationTurn,
  ExtractedConstraints,
} from "./types";

// ─────────────────────────────────────────────
// テーマ検出パターン
// ─────────────────────────────────────────────

const THEME_PATTERNS: Array<{ theme: ConversationTheme; patterns: RegExp[] }> =
  [
    {
      theme: "movie",
      patterns: [
        /映画|シネマ|上映|ムービー|film|movie/i,
        /Netflix|ネトフリ|アマプラ|Amazon.*Prime|Disney/i,
      ],
    },
    {
      theme: "food",
      patterns: [
        /食べ(る|よう|たい|に行)/,
        /ご飯|ごはん|ランチ|ディナー|夕飯|昼飯|朝ご飯/,
        /(何|なに)(食べ|飲み)/,
        /レストラン|カフェ|居酒屋|ラーメン|寿司|焼肉|イタリアン|フレンチ|中華|和食/,
      ],
    },
    {
      theme: "travel",
      patterns: [
        /旅行|旅|トリップ|trip/i,
        /温泉|ホテル|旅館|宿/,
        /(どこ|何処).*(行き|行こ|行く)/,
        /観光|ドライブ|日帰り/,
      ],
    },
    {
      theme: "schedule",
      patterns: [
        /予定|スケジュール|いつ(にする|会う|空いて)/,
        /日程|日にち|何時/,
        /合わせ|調整/,
      ],
    },
    {
      theme: "gift",
      patterns: [
        /プレゼント|ギフト|贈り物|お土産/,
        /誕生日|バースデー|記念日|anniversary/i,
        /何(あげ|贈|送)/,
      ],
    },
    {
      theme: "activity",
      patterns: [
        /美術館|博物館|展覧会|アート|ギャラリー|個展|企画展/,
        /遊園地|テーマパーク|水族館|動物園|プラネタリウム/,
        /ボウリング|カラオケ|ジム|スポーツ|ヨガ|散歩|ピクニック/,
        /デート|遊び|遊ぼ|遊ぶ/,
        /何(する|しよう|し(たい|たいね))/,
        /週末|休日|休み(の日)?/,
        /イベント|フェス|ライブ|コンサート|舞台|演劇|ミュージカル/,
        /運動|見る系|体験|ワークショップ/,
        /現代アート|西洋|日本画|印象派|浮世絵/,
      ],
    },
  ];

/**
 * 会話テーマを検出する。
 *
 * 重要: 直近メッセージを重み付きで走査する。
 * 会話中に話題が変わることがあるため（映画→美術館など）、
 * 直近5件のメッセージを3倍の重みで評価し、最新のテーマを正しく検出する。
 */
function detectTheme(messages: ConversationTurn[]): ConversationTheme {
  if (messages.length === 0) return "general";

  // 直近5件（最重要）と残りを分離
  const recentCount = Math.min(5, messages.length);
  const recentMessages = messages.slice(-recentCount);
  const olderMessages = messages.slice(0, -recentCount);

  const counts = new Map<ConversationTheme, number>();

  // 直近5件: 重み3倍
  const recentText = recentMessages.map((m) => m.body).join(" ");
  for (const { theme, patterns } of THEME_PATTERNS) {
    let matchCount = 0;
    for (const p of patterns) {
      if (p.test(recentText)) matchCount += 3; // 重み3倍
    }
    if (matchCount > 0) counts.set(theme, (counts.get(theme) ?? 0) + matchCount);
  }

  // 古いメッセージ: 重み1倍
  if (olderMessages.length > 0) {
    const olderText = olderMessages.map((m) => m.body).join(" ");
    for (const { theme, patterns } of THEME_PATTERNS) {
      let matchCount = 0;
      for (const p of patterns) {
        if (p.test(olderText)) matchCount += 1;
      }
      if (matchCount > 0) counts.set(theme, (counts.get(theme) ?? 0) + matchCount);
    }
  }

  if (counts.size === 0) return "general";

  // 最大マッチのテーマを返す
  let best: ConversationTheme = "general";
  let bestCount = 0;
  for (const [theme, count] of counts) {
    if (count > bestCount) {
      best = theme;
      bestCount = count;
    }
  }
  return best;
}

// ─────────────────────────────────────────────
// 膠着点検出
// ─────────────────────────────────────────────

const STALEMATE_INDICATORS = [
  /決(まら|めら)ない/,
  /迷(う|って|い中)/,
  /う[〜ー]ん|んー/,
  /どうする\??/,
  /どうしよう/,
  /わからない|わかんない/,
];

function detectStalemate(messages: ConversationTurn[]): string | null {
  // 直近5件を確認
  const recent = messages.slice(-5);
  const indicators: string[] = [];

  for (const msg of recent) {
    for (const pattern of STALEMATE_INDICATORS) {
      if (pattern.test(msg.body)) {
        indicators.push(msg.body.slice(0, 40));
        break;
      }
    }
  }

  // 2件以上の膠着インジケータ → 膠着と判定
  if (indicators.length >= 2) {
    return `会話が行き詰まっている様子（${indicators.length}回の逡巡パターン検出）`;
  }

  // 同じ話題で3往復以上 → 膠着の可能性
  if (recent.length >= 6) {
    const uniqueSenders = new Set(recent.map((m) => m.senderId));
    if (uniqueSenders.size >= 2) {
      return "同じ話題で複数ラリーしているが結論が出ていない";
    }
  }

  return null;
}

// ─────────────────────────────────────────────
// Caring Intensity 推定
// ─────────────────────────────────────────────

/**
 * ユーザーの関心強度を推定（0.0〜1.0）。
 *
 * シグナル:
 * - メッセージの長さ（長い = 関心が高い）
 * - 具体的な候補の提示（「○○はどう？」= 関心高い）
 * - 修飾語の強さ（「絶対」「めっちゃ」= 関心高い）
 * - 「何でもいい」系（関心低い）
 */
function estimateCaringIntensity(
  messages: ConversationTurn[],
  userId: string,
): number {
  const userMsgs = messages.filter((m) => m.senderId === userId);
  if (userMsgs.length === 0) return 0.5; // デフォルト中間

  let score = 0.5;
  const combined = userMsgs.map((m) => m.body).join(" ");

  // メッセージの平均長（長い = 関心高い）
  const avgLength =
    userMsgs.reduce((sum, m) => sum + m.body.length, 0) / userMsgs.length;
  if (avgLength > 30) score += 0.1;
  if (avgLength > 60) score += 0.1;
  if (avgLength < 10) score -= 0.1;

  // 具体的な候補の提示
  if (/はどう|はどうかな|とかは|ってのは/.test(combined)) score += 0.15;

  // 強い修飾語
  if (/絶対|めっちゃ|超|すごく|マジで|ガチで/.test(combined)) score += 0.1;

  // 無関心シグナル
  if (/何でもいい|なんでもいい|どっちでも|任せる|お任せ/.test(combined))
    score -= 0.2;

  // 0-1にクランプ
  return Math.max(0, Math.min(1, score));
}

// ─────────────────────────────────────────────
// 制約抽出
// ─────────────────────────────────────────────

function extractConstraints(
  messages: ConversationTurn[],
): ExtractedConstraints {
  const combined = messages.map((m) => m.body).join(" ");

  // 日付
  const dateMatch = combined.match(
    /(\d{1,2}月\d{1,2}日|今日|明日|明後日|今週末|来週|来週末|土曜|日曜|月曜|火曜|水曜|木曜|金曜)/,
  );

  // 場所
  const locationMatch = combined.match(
    /(渋谷|新宿|池袋|銀座|六本木|表参道|原宿|吉祥寺|横浜|大阪|京都|名古屋|福岡|札幌|神戸|近く(で|の)|この辺|駅前)/,
  );

  // 予算
  const budgetMatch = combined.match(
    /(安(い|め|く)|高(い|め|く)|\d{3,5}円|千円|万円|リーズナブル|コスパ)/,
  );

  // 時間帯
  const timeMatch = combined.match(
    /(朝|昼|夕方|夜|午前|午後|\d{1,2}時|ランチ|ディナー|レイトショー)/,
  );

  // その他の明示的希望
  const preferences: string[] = [];
  if (/静か|落ち着/i.test(combined)) preferences.push("静かな雰囲気");
  if (/賑やか|ワイワイ|活気/.test(combined)) preferences.push("賑やかな雰囲気");
  if (/個室/.test(combined)) preferences.push("個室希望");
  if (/テラス|屋外|外/.test(combined)) preferences.push("屋外・テラス");
  if (/新しい|新規|初めて/.test(combined)) preferences.push("新しいところ");
  if (/いつもの|定番|安心/.test(combined)) preferences.push("定番・安心感");
  // アクティビティ系のジャンル希望
  if (/現代アート|現代美術/.test(combined)) preferences.push("現代アート");
  if (/西洋|西洋美術|印象派/.test(combined)) preferences.push("西洋美術");
  if (/日本画|浮世絵|和/.test(combined)) preferences.push("日本画・和の美術");
  if (/体験|ワークショップ/.test(combined)) preferences.push("体験型");
  if (/写真|フォトジェニック|映え/.test(combined)) preferences.push("写真映え");

  return {
    date: dateMatch?.[1] ?? null,
    location: locationMatch?.[1] ?? null,
    budget: budgetMatch?.[1] ?? null,
    timeSlot: timeMatch?.[1] ?? null,
    preferences,
  };
}

// ─────────────────────────────────────────────
// メインAPI
// ─────────────────────────────────────────────

/**
 * 直近の会話メッセージを取得する。
 */
export async function fetchRecentMessages(
  supabase: SupabaseClient,
  threadId: string,
  limit: number = 20,
): Promise<ConversationTurn[]> {
  const { data: messages } = await supabase
    .from("talk_messages")
    .select("sender_id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!messages) return [];

  return (messages as Array<{ sender_id: string; body: string; created_at: string }>)
    .reverse() // 時系列順に
    .map((m) => ({
      senderId: m.sender_id,
      body: m.body,
      createdAt: m.created_at,
    }));
}

/**
 * 会話を分析し、CoAlterに必要なコンテキストを生成する。
 */
export function analyzeConversation(
  messages: ConversationTurn[],
  userAId: string,
  userBId: string,
): ConversationAnalysis {
  return {
    theme: detectTheme(messages),
    stalemate: detectStalemate(messages),
    recentMessages: messages,
    caringIntensityA: estimateCaringIntensity(messages, userAId),
    caringIntensityB: estimateCaringIntensity(messages, userBId),
    extractedConstraints: extractConstraints(messages),
  };
}
