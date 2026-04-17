/**
 * CoAlter L3: 会話理解 — テーマ・膠着点・Caring Intensity 解析
 *
 * Talk の既存メッセージ取得パターン（fetchRecentTurns）を転用。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AgreedConstraint,
  AgreedConstraintKind,
  AgreedConstraintStrength,
  ConversationAnalysis,
  ConversationTheme,
  ConversationTurn,
  ExtractedConstraints,
  TopicAnchor,
} from "./types";
import { scopeMessages } from "./topicScope";

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
// Phase 1.5.4.5: Agreed Constraints 抽出
// ─────────────────────────────────────────────

/**
 * 会話から「二人の合意制約」を抽出する。
 *
 * 設計原則:
 *  - preferences との違い: preferences は片方の希望。agreedConstraints は「共有認識」
 *  - hard/soft を最初から分離（validator で参照される）
 *  - sourceText（元発話）を保持（誤抽出監査のため）
 *  - 構造の安定性を優先（精度は後で LLM ブーストで上げる）
 *
 * Phase 1.5.4.5 では regex 抽出のみ。Phase 1.6 で軽量 LLM 抽出に置き換える想定。
 */
function extractAgreedConstraints(
  messages: ConversationTurn[],
): AgreedConstraint[] {
  const result: AgreedConstraint[] = [];
  const seen = new Set<string>(); // normalizedValue 重複防止

  for (const msg of messages) {
    const body = msg.body;

    // ── exclusion (hard): 否定・除外 ──
    // 「併設じゃない」「チェーンは避けて」「○○以外で」
    const exclusionPatterns: Array<{
      re: RegExp;
      normalize: (m: RegExpMatchArray) => string;
    }> = [
      // 「併設(じゃなく|ではなく|ではない)」特化（映画 × 食事でよくある）— 汎用より先
      {
        re: /(併設|一緒|同じ場所)(じゃなく|ではなく|ではない|を避け|は別)/,
        normalize: () => "exclude:attached_venue",
      },
      // 「X じゃなく(て|別で)」「X ではなく」
      {
        re: /(.{1,20})(じゃなく(て|別で|別の)|ではなく|ではなくて)/,
        normalize: (m) => `exclude:${m[1].trim()}`,
      },
      // 「X 以外(で|の)」
      {
        re: /(.{1,15})以外(で|の)/,
        normalize: (m) => `exclude:${m[1].trim()}`,
      },
      // 「X 避けて」「X は避け(たい|る)」
      {
        re: /(.{1,20})(は)?避け(て|たい|る)/,
        normalize: (m) => `exclude:${m[1].trim()}`,
      },
      // 「X はなし」「X は無し」
      {
        re: /(.{1,15})(は)?(なし|無し)/,
        normalize: (m) => `exclude:${m[1].trim()}`,
      },
    ];
    for (const { re, normalize } of exclusionPatterns) {
      const m = body.match(re);
      if (m) {
        const normalized = normalize(m);
        if (!seen.has(normalized)) {
          seen.add(normalized);
          result.push({
            kind: "exclusion",
            normalizedValue: normalized,
            sourceText: m[0],
            confidence: 0.75,
            strength: "hard",
            agreedBy: msg.senderId,
          });
        }
      }
    }

    // ── budget (hard/soft): 予算 ──
    // 「5000円前後」「3000-5000円」「1人5000円」「予算 5000」
    const budgetPatterns: Array<{
      re: RegExp;
      normalize: (m: RegExpMatchArray) => string;
      strength: AgreedConstraintStrength;
      confidence: number;
    }> = [
      // per_person を最優先（「1人5000円くらい」は budget_around より特化した情報）
      {
        re: /(1\s*人|ひとり)\s*(\d{3,5})\s*円/,
        normalize: (m) => `budget_per_person:${m[2]}`,
        strength: "hard",
        confidence: 0.85,
      },
      {
        re: /(\d{3,5})\s*円\s*前後/,
        normalize: (m) => `budget_around:${m[1]}`,
        strength: "hard",
        confidence: 0.9,
      },
      {
        re: /(\d{3,5})\s*[-〜~]\s*(\d{3,5})\s*円/,
        normalize: (m) => `budget_range:${m[1]}-${m[2]}`,
        strength: "hard",
        confidence: 0.9,
      },
      {
        re: /(\d{3,5})\s*円\s*(以下|まで|以内)/,
        normalize: (m) => `budget_max:${m[1]}`,
        strength: "hard",
        confidence: 0.9,
      },
      {
        re: /(\d{3,5})\s*円\s*(くらい|程度|ぐらい)/,
        normalize: (m) => `budget_around:${m[1]}`,
        strength: "soft",
        confidence: 0.7,
      },
    ];
    for (const { re, normalize, strength, confidence } of budgetPatterns) {
      const m = body.match(re);
      if (m) {
        const normalized = normalize(m);
        if (!seen.has(normalized)) {
          seen.add(normalized);
          result.push({
            kind: "budget",
            normalizedValue: normalized,
            sourceText: m[0],
            confidence,
            strength,
            agreedBy: msg.senderId,
          });
        }
      }
    }

    // ── style (hard): 具体ジャンル・形式の合意 ──
    // 「フレンチでいこう」「ラーメンにしよう」「ランチは和食」
    const stylePatterns: Array<{
      re: RegExp;
      value: string;
      strength: AgreedConstraintStrength;
      confidence: number;
    }> = [
      // 「A か B にしよう」「A または B」のような OR 合意
      {
        re: /(フレンチ|イタリアン|中華|和食|ラーメン|寿司|焼肉|カフェ|居酒屋)\s*か\s*(フレンチ|イタリアン|中華|和食|ラーメン|寿司|焼肉|カフェ|居酒屋)/,
        value: "", // 動的に計算
        strength: "hard",
        confidence: 0.8,
      },
    ];
    // OR ジャンル合意の検出
    for (const { re, strength, confidence } of stylePatterns) {
      const m = body.match(re);
      if (m) {
        const normalized = `style_or:${m[1]}|${m[2]}`;
        if (!seen.has(normalized)) {
          seen.add(normalized);
          result.push({
            kind: "style",
            normalizedValue: normalized,
            sourceText: m[0],
            confidence,
            strength,
            agreedBy: msg.senderId,
          });
        }
      }
    }
    // 単一ジャンルの明示（「フレンチにしようか」「ラーメンで」）
    const singleStyleRe =
      /(フレンチ|イタリアン|中華|和食|ラーメン|寿司|焼肉|カフェ|居酒屋|カジュアル|高級|個室|テラス)(で|に(しよう|する|して))/;
    const singleStyleMatch = body.match(singleStyleRe);
    if (singleStyleMatch) {
      const normalized = `style:${singleStyleMatch[1]}`;
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push({
          kind: "style",
          normalizedValue: normalized,
          sourceText: singleStyleMatch[0],
          confidence: 0.7,
          strength: "soft",
          agreedBy: msg.senderId,
        });
      }
    }

    // ── preference (soft): 雰囲気・体験志向 ──
    const preferencePatterns: Array<{ re: RegExp; value: string }> = [
      { re: /ガヤガヤ|賑やか|ワイワイ|活気/, value: "lively" },
      { re: /落ち着(いた|ける)|静か/, value: "calm" },
      { re: /2\s*人で?楽しめ|二人で楽しめ/, value: "two_person_friendly" },
      { re: /写真映え|フォトジェニック/, value: "photogenic" },
      { re: /テラス|屋外/, value: "outdoor" },
      { re: /個室/, value: "private_room" },
    ];
    for (const { re, value } of preferencePatterns) {
      const m = body.match(re);
      if (m) {
        const normalized = `pref:${value}`;
        if (!seen.has(normalized)) {
          seen.add(normalized);
          result.push({
            kind: "preference",
            normalizedValue: normalized,
            sourceText: m[0],
            confidence: 0.7,
            strength: "soft",
            agreedBy: msg.senderId,
          });
        }
      }
    }

    // ── companions (hard): 同席者・人数 ──
    const companionsPatterns: Array<{ re: RegExp; value: string }> = [
      { re: /2\s*人で?|二人で?/, value: "two_people" },
      { re: /家族(で|も|と)/, value: "with_family" },
      { re: /友達(も|と|と一緒)/, value: "with_friends" },
    ];
    for (const { re, value } of companionsPatterns) {
      const m = body.match(re);
      if (m) {
        const normalized = `companions:${value}`;
        if (!seen.has(normalized)) {
          seen.add(normalized);
          result.push({
            kind: "companions",
            normalizedValue: normalized,
            sourceText: m[0],
            confidence: 0.85,
            strength: "hard",
            agreedBy: msg.senderId,
          });
        }
      }
    }
  }

  // 合意の検出強化: 相手が肯定した制約は confidence+0.1、agreedBy=null に更新
  // （「フレンチでどう？」→「それで行こう」のような2ターン合意）
  // Phase 1.5.4.5 では簡易実装。将来 LLM で精緻化。
  return result;
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
    .select("id, sender_id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!messages) return [];

  return (messages as Array<{ id: string; sender_id: string; body: string; created_at: string }>)
    .reverse() // 時系列順に
    .map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      body: m.body,
      createdAt: m.created_at,
    }));
}

// ─────────────────────────────────────────────
// 条件充足度スコア
// ─────────────────────────────────────────────

/**
 * テーマごとに「推薦に必要な条件がどれだけ揃っているか」を0.0〜1.0で返す。
 *
 * 条件充足度が高い → CoAlterが自動提案する根拠。
 * 話題転換ではなく、トピック内の情報が揃ったタイミングで出す。
 */
function computeConstraintScore(
  theme: ConversationTheme,
  constraints: ExtractedConstraints,
  messages: ConversationTurn[],
): number {
  // テーマ別の必要条件と重み
  const requirements: Record<ConversationTheme, Array<{ check: () => boolean; weight: number }>> = {
    food: [
      { check: () => constraints.location !== null, weight: 0.25 },      // エリア
      { check: () => constraints.budget !== null, weight: 0.15 },        // 予算
      { check: () => constraints.timeSlot !== null, weight: 0.15 },      // 時間帯
      { check: () => constraints.preferences.length > 0, weight: 0.25 }, // 雰囲気・ジャンル
      { check: () => messages.length >= 4, weight: 0.2 },                // 会話量
    ],
    movie: [
      { check: () => constraints.date !== null, weight: 0.2 },           // いつ
      { check: () => constraints.location !== null, weight: 0.15 },      // エリア
      { check: () => constraints.preferences.length > 0, weight: 0.3 },  // ジャンル希望
      { check: () => messages.length >= 3, weight: 0.2 },                // 会話量
      { check: () => constraints.timeSlot !== null, weight: 0.15 },      // 時間帯
    ],
    travel: [
      { check: () => constraints.date !== null, weight: 0.25 },
      { check: () => constraints.location !== null, weight: 0.2 },
      { check: () => constraints.budget !== null, weight: 0.2 },
      { check: () => constraints.preferences.length > 0, weight: 0.2 },
      { check: () => messages.length >= 4, weight: 0.15 },
    ],
    activity: [
      { check: () => constraints.location !== null, weight: 0.2 },
      { check: () => constraints.date !== null, weight: 0.2 },
      { check: () => constraints.preferences.length > 0, weight: 0.3 },
      { check: () => messages.length >= 3, weight: 0.15 },
      { check: () => constraints.timeSlot !== null, weight: 0.15 },
    ],
    schedule: [
      { check: () => constraints.date !== null, weight: 0.4 },
      { check: () => constraints.timeSlot !== null, weight: 0.3 },
      { check: () => messages.length >= 3, weight: 0.3 },
    ],
    gift: [
      { check: () => constraints.budget !== null, weight: 0.25 },
      { check: () => constraints.preferences.length > 0, weight: 0.35 },
      { check: () => messages.length >= 3, weight: 0.2 },
      { check: () => constraints.date !== null, weight: 0.2 },
    ],
    general: [
      { check: () => messages.length >= 4, weight: 1.0 },
    ],
  };

  const reqs = requirements[theme] ?? requirements.general;
  let score = 0;
  for (const req of reqs) {
    if (req.check()) score += req.weight;
  }
  return Math.min(1, score);
}

/**
 * 会話を分析し、CoAlterに必要なコンテキストを生成する。
 *
 * Phase 1.5.4.6: topicAnchor が渡された場合は primary scope のみを
 * theme / constraints / agreedConstraints の判定対象にする。
 * background scope は recentMessages への残留のみで、分析の軸にしない。
 *
 * 例: anchor = "来週木曜日のランチ" / 古いメッセージに「四国旅行」が含まれていても、
 *     primary scope に四国が入らないため、extractConstraints は四国を拾わない。
 */
export function analyzeConversation(
  messages: ConversationTurn[],
  userAId: string,
  userBId: string,
  options: { topicAnchor?: TopicAnchor } = {},
): ConversationAnalysis {
  const { topicAnchor } = options;

  // anchor があれば scope を切り分け、無ければ従来どおり全部 primary
  const { primary, background } = topicAnchor
    ? scopeMessages(messages, topicAnchor, { windowSize: 5 })
    : { primary: messages, background: [] };

  // anchor が theme を強く検出している場合はそれを優先。
  // primary の regex 検出と一致しなければ anchor 側を信じる（CEO「来週木曜ランチ → food」方針）。
  const primaryTheme = detectTheme(primary.length > 0 ? primary : messages);
  const theme: ConversationTheme =
    topicAnchor &&
    topicAnchor.detectedScope.theme !== "general" &&
    topicAnchor.detectedScope.confidence >= 0.6
      ? topicAnchor.detectedScope.theme
      : primaryTheme;

  // 制約抽出は primary のみで。ただし空なら全体にフォールバック。
  const constraintBase = primary.length > 0 ? primary : messages;
  const constraints = extractConstraints(constraintBase);

  // anchor に明示的な placeRef があり、かつ extractConstraints が拾えていなければ
  // anchor の placeRef を location として採用（「徳島」等が誤混入するのを上書きで防ぐ）
  if (topicAnchor?.detectedScope.placeRef && !constraints.location) {
    constraints.location = topicAnchor.detectedScope.placeRef;
  }
  // anchor が時間表現を持つ場合も同様
  if (topicAnchor?.detectedScope.timeRef && !constraints.date) {
    // date か timeSlot か判断: 曜日・日付系は date、時間帯は timeSlot
    const t = topicAnchor.detectedScope.timeRef;
    if (/(月曜|火曜|水曜|木曜|金曜|土曜|日曜|今日|明日|明後日|今週末|来週|来週末|週末|休み|休日|\d{1,2}月\d{1,2}日)/.test(t)) {
      constraints.date = t;
    } else if (!constraints.timeSlot) {
      constraints.timeSlot = t;
    }
  }

  return {
    theme,
    stalemate: detectStalemate(messages), // stalemate は全履歴から見る（膠着は古いメッセージも含めて判定すべき）
    recentMessages: messages,
    caringIntensityA: estimateCaringIntensity(constraintBase, userAId),
    caringIntensityB: estimateCaringIntensity(constraintBase, userBId),
    extractedConstraints: constraints,
    constraintScore: computeConstraintScore(theme, constraints, constraintBase),
    agreedConstraints: extractAgreedConstraints(constraintBase),
    topicAnchor,
    primaryScopeCount: primary.length,
    backgroundScopeCount: background.length,
  };
}

// テスト用の内部 export
export const __internal = {
  extractAgreedConstraints,
  detectTheme,
  extractConstraints,
  estimateCaringIntensity,
};
