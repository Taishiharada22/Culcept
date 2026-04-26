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
import { extractEmotionTags } from "./emotion/extract";
import type { EmotionTag } from "./emotion/types";

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
  //
  // 2026-04-21 S3 修正: whitelist を主要ターミナル + 広域エリア駅まで拡張。
  //   旧 whitelist（15 エリア）では 新橋 / 東京 / 品川 / 上野 等の主要駅が
  //   取りこぼされ、"新橋で朝7時に..." が location=null となり
  //   webConnector.food query が generic に退化していた。
  //
  // 反証して採用しなかった案:
  //   - 汎用 `(\S{2,6})駅` パターン: 「次の駅」「終着駅」等を誤マッチする
  //     False positive の影響が localPart→ query 直結なので採用しない
  //   - 県庁所在地を全件カバー: 現時点で扱う会話ドメイン（Tokyo+主要都市圏）を
  //     超えるため YAGNI、必要になったら追加
  //
  // 優先順位: 長い表記 → 短い表記（部分一致衝突を避ける）
  //   例: 新宿三丁目 > 新宿、中目黒 > 目黒、高田馬場 > 馬場
  const locationMatch = combined.match(
    /(新宿三丁目|高田馬場|自由が丘|三軒茶屋|下北沢|中目黒|代官山|阿佐ヶ谷|高円寺|御茶ノ水|中野坂上|代々木上原|二子玉川|武蔵小杉|たまプラーザ|みなとみらい|渋谷|新宿|池袋|銀座|六本木|表参道|原宿|吉祥寺|横浜|大阪|京都|名古屋|福岡|札幌|神戸|新橋|東京|品川|上野|秋葉原|浜松町|有楽町|田町|恵比寿|目黒|五反田|大崎|赤坂|麻布|青山|汐留|虎ノ門|日比谷|丸の内|築地|神田|神保町|巣鴨|早稲田|飯田橋|四ツ谷|市ヶ谷|水道橋|後楽園|荻窪|中野|三鷹|立川|町田|大井町|神泉|神楽坂|蒲田|北千住|錦糸町|押上|浅草|上野毛|成城|三宿|広尾|白金|南青山|西麻布|六本木ヒルズ|代々木|新大久保|梅田|難波|心斎橋|天王寺|烏丸|河原町|祇園|三宮|栄|天神|博多|近く(で|の)|この辺|駅前)/,
  );

  // 予算
  const budgetMatch = combined.match(
    /(安(い|め|く)|高(い|め|く)|\d{3,5}円|千円|万円|リーズナブル|コスパ)/,
  );

  // 時間帯
  //
  // 2026-04-21 S1 朝誤認修正:
  //   旧: 1 つの regex alternation で leftmost-first match
  //        → 「朝から、11時にラーメン食べたい」で "朝" が先に hit し
  //          briefBuilder.mapTimeSlot("朝") → "morning" 判定。
  //          narrationBuilder.formatWhenFromBrief が 11時ランチを「朝」と表記。
  //   新: 具体的な clock hour (\d{1,2}時) を抽象語より優先。
  //        hour が取れれば mapTimeSlot が 11 → afternoon を返す（既存ロジックで正しい）。
  //        hour 無しで抽象語のみの場合は従来通り。
  const hourMatch = combined.match(/\d{1,2}時/);
  const slotMatch = combined.match(
    /(朝|昼|夕方|夜|午前|午後|ランチ|ディナー|レイトショー)/,
  );
  const timeSlotRaw = hourMatch ? hourMatch[0] : (slotMatch?.[1] ?? null);

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
    timeSlot: timeSlotRaw,
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
 * [B / U1a — 2026-04-20] META 発話フィルタ（狭い）
 *
 *   CoAlter 宛のメタ発話・露骨な罵倒語のみを除去する。感情語一般・関係性語は
 *   対象外（relationship signal を落とさない）。
 *
 *   広げないこと:
 *     - 「悲しい」「嬉しい」「腹立つ」等の感情語
 *     - 「すれ違い」「誤解」等の関係性語
 *   ここを広げると本来の会話理解まで失われる（CEO 方針 2026-04-20）。
 */
export const META_TALK_PATTERNS: readonly RegExp[] = [
  /coalter/i,
  /使えね/,
  /使えない/,
  /クソ/,
  /ゴミ/,
];

export function filterMetaTalk(
  messages: ConversationTurn[],
): ConversationTurn[] {
  return messages.filter(
    (m) => !META_TALK_PATTERNS.some((p) => p.test(m.body)),
  );
}

/**
 * 直近の会話メッセージを取得する。
 *
 * U1a: META 発話は retrieval / 分析に使わない。conversationParser の入口で剥がす。
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

  const turns = (messages as Array<{ id: string; sender_id: string; body: string; created_at: string }>)
    .reverse() // 時系列順に
    .map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      body: m.body,
      createdAt: m.created_at,
    }));

  return filterMetaTalk(turns);
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

// ─────────────────────────────────────────────
// Bug-1 §4.3 高レベル wrapper: emotion tag に speaker を載せる
// ─────────────────────────────────────────────

/**
 * recentMessages window 内で EmotionTag を集約し、speaker を senderId から
 * "user_a" / "user_b" / "both" / "unknown" に書き換える。
 *
 * 集約規則:
 *   - dedupe key = `${tag}:${source_lexeme}`
 *   - 同 user の同 lexeme 重複 → 1 entry のまま
 *   - 異 user (user_a + user_b) の同 lexeme → "both"
 *   - unknown 後に named speaker → named に昇格（情報損失を避ける）
 *   - named 後に unknown → named を維持
 *   - both は変更しない
 *
 * 範囲:
 *   - messages 引数（= recentMessages = analysis window）のみを参照する。
 *   - 過去全履歴は拾わない（Bug-1 §4.3 / CEO Q4 β 寄り方針）。
 *
 * 失敗独立条文 (§2.3):
 *   - extractEmotionTags の失敗で全体を壊さない（per-turn try/catch + skip）。
 *   - 不正入力 (null / undefined / 非配列) には [] を返す。
 *   - 副作用ゼロ・純関数。
 */
function collectEmotionTagsForAnalysis(
  messages: ConversationTurn[],
  userAId: string,
  userBId: string,
): EmotionTag[] {
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const map = new Map<string, EmotionTag>();

  for (const turn of messages) {
    if (turn === null || typeof turn !== "object") continue;

    let tagsFromText: EmotionTag[];
    try {
      tagsFromText = extractEmotionTags((turn as ConversationTurn).body);
    } catch {
      continue;
    }
    if (!Array.isArray(tagsFromText) || tagsFromText.length === 0) continue;

    const senderId = (turn as ConversationTurn).senderId;
    let speaker: EmotionTag["speaker"];
    if (senderId === userAId) speaker = "user_a";
    else if (senderId === userBId) speaker = "user_b";
    else speaker = "unknown";

    for (const t of tagsFromText) {
      if (!t || typeof t !== "object") continue;
      const key = `${t.tag}:${t.source_lexeme}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...t, speaker });
        continue;
      }
      if (existing.speaker === "both") continue;
      if (existing.speaker === speaker) continue;
      // unknown を named に昇格
      if (existing.speaker === "unknown") {
        map.set(key, { ...existing, speaker });
        continue;
      }
      // 新規が unknown、既存が named → 既存維持
      if (speaker === "unknown") continue;
      // user_a vs user_b → both
      map.set(key, { ...existing, speaker: "both" });
    }
  }

  return Array.from(map.values());
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
  // anchor が時間表現を持つ場合は優先（anchor の timeRef は
  // 「来週木曜日」のように既存 regex の「来週」だけより具体的なことが多い）
  if (topicAnchor?.detectedScope.timeRef) {
    const t = topicAnchor.detectedScope.timeRef;
    const isDateLike = /(月曜|火曜|水曜|木曜|金曜|土曜|日曜|今日|明日|明後日|今週末|来週|来週末|週末|休み|休日|\d{1,2}月\d{1,2}日)/.test(t);
    const isTimeSlotLike = /(朝|昼|夕方|夜|午前|午後|ランチ|ディナー)/.test(t);
    if (isDateLike) {
      // anchor の方が長い（より具体）、または既存が未設定なら上書き
      if (!constraints.date || t.length > constraints.date.length) {
        constraints.date = t;
      }
    }
    if (isTimeSlotLike && !constraints.timeSlot) {
      // anchor に時間帯が含まれる場合（「木曜のランチ」→ 時間帯=ランチ も拾う）
      const timeSlotMatch = t.match(/(朝|昼|夕方|夜|午前|午後|ランチ|ディナー)/);
      if (timeSlotMatch) constraints.timeSlot = timeSlotMatch[0];
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
    // Phase 3B Layer 1: emotion tag を analysis に載せる（narration 用、retrieval gate 非依存）
    emotionTags: collectEmotionTagsForAnalysis(messages, userAId, userBId),
  };
}

// テスト用の内部 export
export const __internal = {
  extractAgreedConstraints,
  detectTheme,
  extractConstraints,
  estimateCaringIntensity,
  collectEmotionTagsForAnalysis,
};

// ═════════════════════════════════════════════════════════════════════
// Phase 2: 信号検出器（2026-04-19 v0.3）
//
// 参照: docs/coalter-phase2-3mode-design.md §1.1、§1.6
//
// CEO 実装固定条件（フェーズ 6.B 条件 2）:
//  - **検出に徹する**。提案生成・翻訳・解決策を持ち込まない。
//  - 返すのは ContradictionSignal / StallSignal のみ。
//  - misread はここで扱わない（intentTranslation の戻り値を読むだけの責務は別所）。
// ═════════════════════════════════════════════════════════════════════

import type {
  AxisKey,
  ContradictionSignal,
  MisreadSignal,
  StallSignal,
} from "./types";

/** 希望表明パターン（「〜したい」「〜がいい」「〜行こう」） */
const PREFERENCE_PATTERNS: RegExp[] = [
  /(したい|に行きたい|が(いい|食べたい|見たい)|行こう|にしよう|がよさそう)/,
  /(の方が|の方がいい|の方が好き)/,
];

/** 否定 / 回避表明パターン（「〜は嫌」「〜は避けたい」「〜はちょっと」「無理」） */
const NEGATION_PATTERNS: RegExp[] = [
  /(は(嫌|やだ|無理|きつい|厳しい|ちょっと|パス|しんどい))/,
  /(避けた|やめた|違う|合わない|気分じゃない)/,
];

/** 決着 / 合意パターン（「いいね」「それで」「決まり」） */
const RESOLUTION_PATTERNS: RegExp[] = [
  /(いいね|それで(いこう|いいよ)|決(まり|めよう)|了解|OK|賛成|そうしよう)/i,
];

/**
 * 軸推定キーワード（contradiction の axes 推定用）。
 * 軽量に既存 AxisKey にマッピングする。決定性重視。
 */
const AXIS_KEYWORDS: Array<{ axis: AxisKey; patterns: RegExp[] }> = [
  { axis: "quietness", patterns: [/静か|賑やか|うるさい|騒が/] },
  { axis: "atmosphere", patterns: [/雰囲気|落ち着|おしゃれ|カジュアル/] },
  { axis: "price", patterns: [/高い|安い|予算|値段|円|コスパ/] },
  { axis: "access", patterns: [/遠い|近(い|く|場|い|所)|駅|アクセス|徒歩/] },
  { axis: "novelty", patterns: [/新しい|初|いつも|定番/] },
  { axis: "tone", patterns: [/重い|軽い|明るい|暗い|シリアス|コメディ/] },
  { axis: "runtime", patterns: [/長い|短い|\d+\s?分|時間/] },
  { axis: "activity", patterns: [/アクティブ|動|体験/] },
  { axis: "relaxation", patterns: [/のんびり|ゆっくり|休|まったり/] },
  { axis: "flexibility", patterns: [/ゆるい|固い|急|変更/] },
  { axis: "effort", patterns: [/面倒|楽|手軽|準備/] },
];

function matchAny(patterns: RegExp[], text: string): boolean {
  return patterns.some((p) => p.test(text));
}

function detectAxes(text: string): AxisKey[] {
  const axes: AxisKey[] = [];
  for (const { axis, patterns } of AXIS_KEYWORDS) {
    if (matchAny(patterns, text)) axes.push(axis);
  }
  return axes;
}

/**
 * 対立検出器。
 *
 * 契約:
 *  - **検出のみ**。解決案を持たない。
 *  - 一方の希望表明と他方の否定 / 回避表明が同じ軸領域で並ぶときに検出。
 *  - 返す軸は AxisKey のサブセット（空配列もあり得る）。
 *  - stanceA / stanceB は根拠となった発話の原文をそのまま返す（要約・翻訳しない）。
 *
 * @param turns 直近 N ターン（Talk のメッセージ）
 * @param userAId A 側の senderId
 * @param userBId B 側の senderId
 */
export function detectContradiction(
  turns: ConversationTurn[],
  userAId: string,
  userBId: string,
): ContradictionSignal {
  if (turns.length === 0) {
    return { detected: false, axes: [], stanceA: null, stanceB: null };
  }

  // 直近のターンを優先して走査（最後から）
  const reversed = [...turns].reverse();

  let aPreference: { text: string; axes: AxisKey[] } | null = null;
  let aNegation: { text: string; axes: AxisKey[] } | null = null;
  let bPreference: { text: string; axes: AxisKey[] } | null = null;
  let bNegation: { text: string; axes: AxisKey[] } | null = null;

  for (const turn of reversed) {
    const body = turn.body ?? "";
    const isA = turn.senderId === userAId;
    const isB = turn.senderId === userBId;
    if (!isA && !isB) continue;

    const hasPref = matchAny(PREFERENCE_PATTERNS, body);
    const hasNeg = matchAny(NEGATION_PATTERNS, body);
    const axes = detectAxes(body);
    if (axes.length === 0) continue;

    if (isA) {
      if (hasPref && !aPreference) aPreference = { text: body, axes };
      if (hasNeg && !aNegation) aNegation = { text: body, axes };
    } else {
      if (hasPref && !bPreference) bPreference = { text: body, axes };
      if (hasNeg && !bNegation) bNegation = { text: body, axes };
    }
  }

  // A が希望 & B が否定（同軸）/ または B が希望 & A が否定（同軸）
  type Pair = { aText: string; bText: string; axes: AxisKey[] };
  const candidates: Pair[] = [];

  if (aPreference && bNegation) {
    const shared = aPreference.axes.filter((ax) => bNegation!.axes.includes(ax));
    if (shared.length > 0) {
      candidates.push({ aText: aPreference.text, bText: bNegation.text, axes: shared });
    }
  }
  if (bPreference && aNegation) {
    const shared = bPreference.axes.filter((ax) => aNegation!.axes.includes(ax));
    if (shared.length > 0) {
      candidates.push({ aText: aNegation.text, bText: bPreference.text, axes: shared });
    }
  }

  if (candidates.length === 0) {
    return { detected: false, axes: [], stanceA: null, stanceB: null };
  }

  const first = candidates[0]!;
  return {
    detected: true,
    axes: first.axes,
    stanceA: first.aText,
    stanceB: first.bText,
  };
}

/**
 * 膠着検出器。
 *
 * 契約:
 *  - **検出のみ**。次の一手を作らない。
 *  - 同一テーマが N ターン以上続き、かつ直近 N ターン内に決着語が無い場合に detected=true。
 *  - consecutiveTurns はそのテーマの連続ターン数（最大値）を返す。
 *
 * @param turns 直近ターン列
 * @param minTurns 何ターン以上で膠着と見なすか（デフォルト 3）
 */
export function detectStall(
  turns: ConversationTurn[],
  minTurns = 3,
): StallSignal {
  if (turns.length < minTurns) {
    return { detected: false, consecutiveTurns: turns.length };
  }

  // 決着語が直近 minTurns 以内に 1 つでも出ていれば膠着ではない
  const recent = turns.slice(-minTurns);
  const hasResolution = recent.some((t) => matchAny(RESOLUTION_PATTERNS, t.body ?? ""));
  if (hasResolution) {
    return { detected: false, consecutiveTurns: recent.length };
  }

  // 直近 N ターンに非自明な発話が連続しているか（空/短文以外）
  //   decisive な合意語は上で除外済み。
  //   意思決定話題の継続を厳密に判定するのは Phase 2 スコープ外。
  //   ここでは「短文のみの連続」= 実質停止として膠着扱い。
  const nonTrivialCount = recent.filter((t) => (t.body ?? "").trim().length >= 2).length;
  const detected = nonTrivialCount >= minTurns;

  return {
    detected,
    consecutiveTurns: detected ? nonTrivialCount : recent.length,
  };
}

// ═════════════════════════════════════════════════════════════════════
// Misread detector (Phase A — CoAlter-local 実装)
//
// 背景: CEO 2026-04-19 採用案 A 承認。
//   本来の北極星は `lib/talk/intentTranslation/intentReconstruction.ts`
//   の結果を DB 永続化 → CoAlter が読むだけで MisreadSignal を組むこと
//   (types.ts MisreadSignal L1303-1306 コメント参照)。
//   Phase B でそこに差し替えるが、Phase 2 凍結下で preview 母数を作るために
//   Phase A として CoAlter-local な regex 検出器を入れる。
//
// 実装制約 (CEO 承認条件):
//   1. 純関数・局所実装 (conversationParser.ts に閉じる)
//   2. intentTranslation を direct import しない
//   3. confidence は保守的:
//      - 明示的困惑語 (strong): 0.8
//      - 連続質問 (medium):   0.7
//      - topic drift (soft):   0.6
//   4. 最も強いシグナルを選び、multiple signals は加点しない (過検知回避)
//
// 返り値: MisreadSignal { confidence, direction, anchorMessageId }
//   - direction: 誤読された側 = 困惑を示した側。
//     A が困惑 (「え?」) → direction="b_to_a" (B の発話が A に誤読された)
//     B が困惑         → direction="a_to_b"
//   - anchorMessageId: 困惑を示した直前の相手メッセージの id (あれば)
// ═════════════════════════════════════════════════════════════════════

/** 明示的困惑語 (strong): 会話の表面に出た「分からない」表明 */
const CONFUSION_MARKERS: RegExp[] = [
  /(^|[\s、。!?])え[?？!！]{1,}/,                // 「え?」「え!」「え??」
  /(^|[\s、。])(ん|えっ|えー|えぇ)[?？]+/,         // 「ん?」「えっ?」「えー?」
  /どういう(こと|意味)/,                           // 「どういうこと」「どういう意味」
  /(意味|話|それ)が?(分|わか)(ら|り|ん)ない/,      // 「意味わかんない」「話が分からない」
  /何の(話|こと)/,                                 // 「何の話」「何のこと」
  /(分|わか)らない(けど|んだけど)/,                 // 「わからないんだけど」
  /[?？]{3,}/,                                     // 「???」「？？？」
  /(ちょっと|よく)(分|わか)(ら|んな)/,              // 「よく分からない」「ちょっとわかんない」
];

/** 疑問文末尾パターン (連続質問検出用) */
const QUESTION_ENDING: RegExp =
  /([?？]|の[?？]?$|って[?？]?$|(どう|なに|なん|誰|どれ|どこ|いつ|なぜ|どの)[^。]*[?？]?$)/;

/** 混乱語・極短文で疑問だけ返すケース (「は?」「ん?」のような短問) */
const SHORT_CONFUSION: RegExp = /^(は|え|ん|へ|はぁ|えっ|ええ|うん)[?？！]+$/;

/**
 * 1 turn が疑問文かどうかの軽量判定。
 * - 末尾に「?」「？」がある
 * - 疑問詞 + 末尾「?」相当
 * - 短い混乱語 (「は?」など)
 */
function isQuestion(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed) return false;
  if (SHORT_CONFUSION.test(trimmed)) return true;
  return QUESTION_ENDING.test(trimmed);
}

/**
 * 2 発話間の「軸の噛み合い」を見る軽量判定。
 * 両方が軸検出にヒットするが、共通軸が無い場合に true (drift).
 * どちらか片方でも軸が空なら drift 判定はしない (過検知防止)。
 */
function detectTopicDriftBetween(prev: string, curr: string): boolean {
  const prevAxes = detectAxes(prev);
  const currAxes = detectAxes(curr);
  if (prevAxes.length === 0 || currAxes.length === 0) return false;
  const shared = prevAxes.filter((ax) => currAxes.includes(ax));
  return shared.length === 0;
}

/** 空の MisreadSignal (「誤読なし」) */
const MISREAD_EMPTY: MisreadSignal = {
  confidence: 0,
  direction: null,
  anchorMessageId: null,
};

/**
 * 誤読検出器 (CoAlter-local Phase A 実装)。
 *
 * 契約:
 *  - **検出のみ**。提案生成・翻訳・復元はしない。
 *  - **純関数**。DB / LLM / UI を触らない。
 *  - 返すのは MisreadSignal のみ。
 *  - 複数シグナルが重なっても加点しない (最も強いシグナルの confidence を採用)。
 *
 * 走査範囲: 直近 4 ターン (ambiguity は近傍にしか出ない前提)。
 * 足切り: 2 ターン未満なら MISREAD_EMPTY を返す。
 *
 * @param turns 直近ターン列 (時系列昇順)
 * @param userAId A 側の senderId
 * @param userBId B 側の senderId
 */
export function detectMisread(
  turns: ConversationTurn[],
  userAId: string,
  userBId: string,
): MisreadSignal {
  if (turns.length < 2) return MISREAD_EMPTY;

  const recent = turns.slice(-4);

  // ── Signal 1: 明示的困惑語 (confidence 0.8) ──
  // 最新ターンから遡り、最初に見つけた confusion marker を採用。
  for (let i = recent.length - 1; i >= 0; i--) {
    const turn = recent[i]!;
    const body = (turn.body ?? "").trim();
    if (!body) continue;
    const isA = turn.senderId === userAId;
    const isB = turn.senderId === userBId;
    if (!isA && !isB) continue;

    const hasMarker = CONFUSION_MARKERS.some((p) => p.test(body));
    if (!hasMarker) continue;

    // 直前の相手発話を anchor として採用 (あれば)
    let anchorMessageId: string | null = null;
    for (let j = i - 1; j >= 0; j--) {
      const prev = recent[j]!;
      if (prev.senderId === turn.senderId) continue;
      if (prev.senderId !== userAId && prev.senderId !== userBId) continue;
      anchorMessageId = prev.id ?? null;
      break;
    }

    return {
      confidence: 0.8,
      direction: isA ? "b_to_a" : "a_to_b",
      anchorMessageId,
    };
  }

  // ── Signal 2: 連続質問 (confidence 0.7) ──
  // 同じ話者から 2 ターン連続で疑問文 (間に相手の発話が挟まっていてもよい:
  // 相手の応答が「噛み合わず」再度問い直している状態)。
  // 厳密には「A の質問 → B の非回答 → A の再質問」パターンを拾う。
  for (let i = recent.length - 1; i >= 2; i--) {
    const turn = recent[i]!;
    if (!turn.senderId) continue;
    const isA = turn.senderId === userAId;
    const isB = turn.senderId === userBId;
    if (!isA && !isB) continue;
    if (!isQuestion(turn.body ?? "")) continue;

    // 同じ話者の直前疑問を探す
    for (let j = i - 1; j >= 0; j--) {
      const earlier = recent[j]!;
      if (earlier.senderId !== turn.senderId) continue;
      if (!isQuestion(earlier.body ?? "")) break;

      // 見つかった: 同じ話者から 2 連続疑問
      const anchorTurn = recent[i - 1]; // 直前 (相手 or 自分の) メッセージ
      return {
        confidence: 0.7,
        direction: isA ? "b_to_a" : "a_to_b",
        anchorMessageId: anchorTurn?.id ?? null,
      };
    }
  }

  // ── Signal 3: topic drift (confidence 0.6) ──
  // 直近 2 ターン (A の発話 → B の発話、または逆) で軸が全く噛み合わない。
  // 片方が軸無しの場合は判定しない (雑談・挨拶の誤爆防止)。
  if (recent.length >= 2) {
    const last = recent[recent.length - 1]!;
    const prev = recent[recent.length - 2]!;
    const lastIsA = last.senderId === userAId;
    const lastIsB = last.senderId === userBId;
    const prevIsA = prev.senderId === userAId;
    const prevIsB = prev.senderId === userBId;

    // 別話者 かつ 両方が A/B の発話のみ
    const differentSpeakers =
      (lastIsA && prevIsB) || (lastIsB && prevIsA);
    if (differentSpeakers) {
      if (detectTopicDriftBetween(prev.body ?? "", last.body ?? "")) {
        return {
          confidence: 0.6,
          direction: lastIsA ? "b_to_a" : "a_to_b",
          anchorMessageId: prev.id ?? null,
        };
      }
    }
  }

  return MISREAD_EMPTY;
}

export const __phase2Internal = {
  PREFERENCE_PATTERNS,
  NEGATION_PATTERNS,
  RESOLUTION_PATTERNS,
  AXIS_KEYWORDS,
  CONFUSION_MARKERS,
  QUESTION_ENDING,
  SHORT_CONFUSION,
  detectAxes,
  isQuestion,
  detectTopicDriftBetween,
};
