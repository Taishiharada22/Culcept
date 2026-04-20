/**
 * CoAlter Phase 1.5.4.6: Topic Scope
 *
 * 目的: 「来週木曜日のランチ」と言っても会話の古い話題（例: 四国旅行）が
 *       引っ張られるバグを根絶する。
 *
 * 方針 (CEO 承認 / 2026-04-17):
 *   (iii) ハイブリッド
 *     - 起動直前メッセージ（または invoke userMessage）を 仮 anchor として採用
 *     - Anchor + 前後 3〜5 件 = primary scope（現在の話題）
 *     - それ以前 = background only（背景情報。現在 scope を上書きしない）
 *     - 軽量 LLM で anchor の scope を抽出（theme / timeRef / placeRef / confidence）
 *       LLM 失敗時は regex フォールバック
 *     - 後から UI で anchor を更新できる（Phase 1.5.7+）
 *
 * このモジュールは副作用を持たない純粋関数の集まりにし、
 * LLM 呼び出しのみ async boundary を切る。
 */

import type {
  ConversationTheme,
  ConversationTurn,
  TopicAnchor,
  TopicAnchorSource,
  TopicScope,
} from "./types";

// ─────────────────────────────────────────────
// 1. テーマ検出（regex 軽量版。anchor テキスト1本に対する判定）
// ─────────────────────────────────────────────

const ANCHOR_THEME_PATTERNS: Array<{ theme: ConversationTheme; re: RegExp }> = [
  {
    theme: "food",
    re: /(ランチ|ディナー|朝ご飯|夕飯|昼飯|ご飯|ごはん|食べ(る|たい|に|よう)|(何|なに)(食べ|飲み)|レストラン|カフェ|居酒屋|ラーメン|寿司|焼肉|イタリアン|フレンチ|中華|和食|お茶)/,
  },
  {
    theme: "movie",
    re: /(映画|シネマ|上映|ムービー|Netflix|ネトフリ|アマプラ|Disney)/i,
  },
  {
    theme: "travel",
    re: /(旅行|旅(に行|する|先)|トリップ|温泉|ホテル|旅館|宿|観光|モデルコース|日帰り旅)/,
  },
  {
    theme: "schedule",
    re: /(予定|スケジュール|日程|いつ(にする|会う|空いて)|合わせ(る|たい|よう)|調整)/,
  },
  {
    theme: "gift",
    re: /(プレゼント|ギフト|贈り物|誕生日|バースデー|記念日|何(あげ|贈))/,
  },
  {
    theme: "activity",
    re: /(美術館|博物館|展覧会|ギャラリー|遊園地|テーマパーク|水族館|動物園|カラオケ|ジム|散歩|ピクニック|イベント|フェス|ライブ|コンサート|舞台|演劇)/,
  },
];

function detectThemeFromText(text: string): {
  theme: ConversationTheme;
  confidence: number;
} {
  const hits: Array<{ theme: ConversationTheme; weight: number }> = [];
  for (const { theme, re } of ANCHOR_THEME_PATTERNS) {
    if (re.test(text)) hits.push({ theme, weight: 1 });
  }
  if (hits.length === 0) return { theme: "general", confidence: 0.3 };
  if (hits.length === 1) return { theme: hits[0].theme, confidence: 0.75 };

  // 複数ヒット: food + schedule（「来週木曜のランチ」）は food を優先、
  // schedule は時期の手がかりとして扱うため theme からは下げる
  const byPriority: ConversationTheme[] = [
    "food",
    "movie",
    "travel",
    "activity",
    "gift",
    "schedule",
    "general",
  ];
  for (const t of byPriority) {
    if (hits.find((h) => h.theme === t)) {
      return { theme: t, confidence: 0.65 };
    }
  }
  return { theme: hits[0].theme, confidence: 0.5 };
}

// ─────────────────────────────────────────────
// 2. 時期 / 場所の手がかり抽出（regex）
// ─────────────────────────────────────────────

const TIME_REF_PATTERNS: RegExp[] = [
  // 来週 + 曜日
  /(来週|今週|再来週)?(\s*)(月曜|火曜|水曜|木曜|金曜|土曜|日曜)(日)?/,
  // 日付
  /(\d{1,2}月\d{1,2}日)/,
  // 相対日
  /(今日|明日|明後日|今週末|来週末|週末|休み(の日)?|休日)/,
  // 時間帯
  /(朝|昼|夕方|夜|午前|午後|ランチ(タイム)?|ディナー|夜ご飯|夕飯)/,
];

function extractTimeRef(text: string): string | null {
  for (const re of TIME_REF_PATTERNS) {
    const m = text.match(re);
    if (m) return m[0].trim();
  }
  return null;
}

/**
 * 場所の手がかり抽出。
 *
 * 固有名詞ベース（既知のエリア名に寄せる）。
 * anchor テキストに書いていない「徳島」等の場所を勝手に補わないことが重要。
 */
const PLACE_REF_PATTERNS: RegExp[] = [
  // 23区系
  /(渋谷|新宿|池袋|銀座|六本木|表参道|原宿|恵比寿|代官山|中目黒|目黒|下北沢|高円寺|吉祥寺|三軒茶屋|自由が丘|品川|東京駅|丸の内|日本橋|秋葉原|浅草|上野|北千住)/,
  // 横浜系
  /(横浜|みなとみらい|関内|桜木町|鎌倉|逗子|江ノ島)/,
  // 関西系
  /(大阪|梅田|難波|京都|三宮|神戸|奈良)/,
  // 主要都市
  /(名古屋|福岡|博多|札幌|仙台|広島)/,
  // 四国・地方（CEO 四国バグの再現テスト用に明示）
  /(四国|徳島|高松|松山|高知|愛媛|香川|徳島県|高知県|香川県|愛媛県)/,
  // 近接表現
  /(近く(で|の)|この辺|駅前|駅周辺)/,
];

function extractPlaceRef(text: string): string | null {
  for (const re of PLACE_REF_PATTERNS) {
    const m = text.match(re);
    if (m) return m[0].trim();
  }
  return null;
}

// ─────────────────────────────────────────────
// 3. anchor 構築
// ─────────────────────────────────────────────

/**
 * 起動時の手がかりから TopicAnchor を構築する（LLM 不要の同期版）。
 *
 * 優先順:
 *   1. userMessage が非空かつ topical（少なくとも 4 文字以上）→ それを anchor
 *   2. 最新 talk_messages の最終メッセージ → それを anchor
 *   3. どちらも無ければ null
 *
 * scope は regex で即時抽出。LLM 版は buildAnchorWithLLM() で拡張可能。
 */
export function buildTopicAnchor(
  recentMessages: ConversationTurn[],
  userMessage: string | null,
): TopicAnchor | null {
  // 1. userMessage 優先
  if (userMessage && userMessage.trim().length >= 4) {
    const text = userMessage.trim();
    return {
      messageId: null,
      text,
      detectedScope: extractScopeRegex(text),
      confidence: 0.8,
      source: "user_message",
    };
  }

  // 2. 最新 talk_messages
  if (recentMessages.length > 0) {
    const last = recentMessages[recentMessages.length - 1];
    const text = last.body.trim();
    if (text.length === 0) return null;
    const scope = extractScopeRegex(text);
    // 最終メッセージが「うーん」「どうしよう」等の逡巡表現だけの場合は
    // confidence を下げる（UI で anchor 変更を促す）
    const isLowSignal = /^(う[〜ー]ん|んー|どうしよう|わからない|わかんない|それで|この話|さっきの)$/.test(
      text,
    );
    return {
      messageId: last.id ?? null,
      text,
      detectedScope: scope,
      confidence: isLowSignal ? 0.35 : scope.confidence,
      source: "last_talk_message",
    };
  }

  return null;
}

/**
 * anchor テキストから scope を regex 抽出。
 */
export function extractScopeRegex(text: string): TopicScope {
  const { theme, confidence: themeConf } = detectThemeFromText(text);
  const timeRef = extractTimeRef(text);
  const placeRef = extractPlaceRef(text);

  // 合成 confidence: theme の確からしさをベースに、time/place が取れていれば加点
  let confidence = themeConf;
  if (timeRef) confidence += 0.1;
  if (placeRef) confidence += 0.1;
  if (text.length >= 10) confidence += 0.05;
  confidence = Math.min(1, confidence);

  return { theme, timeRef, placeRef, confidence };
}

// ─────────────────────────────────────────────
// 4. メッセージの scope 分割
// ─────────────────────────────────────────────

export interface ScopedMessages {
  /** 現在 scope。regex/解析の主対象 */
  primary: ConversationTurn[];
  /** 背景。テーマ決定・制約抽出には使わない（reasoning への文脈提供のみ） */
  background: ConversationTurn[];
}

/**
 * 起動直前メッセージ（anchor.messageId に一致）を中心に、
 * 前後 `windowSize` 件を primary scope として抽出する。
 *
 * anchor.messageId が無い（= invoke userMessage が anchor）場合は、
 * メッセージ列の末尾 windowSize 件を primary とする。
 *
 * さらに place 不一致チェック:
 *   anchor.detectedScope.placeRef が null の場合、
 *   primary 内に place ref が現れないメッセージは background に降格しない
 *   （place ref が未指定な anchor は「どこでも良い」か「場所の話をしていない」）。
 *   逆に anchor.placeRef が存在する場合、別の placeRef を含むメッセージは
 *   primary から除外する（「四国」→「ランチ」のケース）。
 */
export function scopeMessages(
  messages: ConversationTurn[],
  anchor: TopicAnchor | null,
  options: { windowSize?: number } = {},
): ScopedMessages {
  const windowSize = options.windowSize ?? 5;

  if (messages.length === 0) return { primary: [], background: [] };
  if (!anchor) return { primary: messages, background: [] };

  // 1) anchor を基点にウィンドウを切る
  let anchorIdx = -1;
  if (anchor.messageId) {
    anchorIdx = messages.findIndex((m) => m.id === anchor.messageId);
  }
  // anchor が userMessage 由来 or id が見つからない → 末尾を anchor 位置とみなす
  if (anchorIdx < 0) anchorIdx = messages.length - 1;

  const start = Math.max(0, anchorIdx - windowSize);
  const end = Math.min(messages.length, anchorIdx + 1); // anchor 自身まで（未来は無い）
  const windowSlice = messages.slice(start, end);
  const olderSlice = messages.slice(0, start);

  // 2) place 不一致フィルタ: anchor に場所が指定されている場合、
  //    異なる明示的場所を含む window 内メッセージは background に降格
  const anchorPlace = anchor.detectedScope.placeRef;
  const primary: ConversationTurn[] = [];
  const demoted: ConversationTurn[] = [];

  for (const m of windowSlice) {
    if (!anchorPlace) {
      primary.push(m);
      continue;
    }
    const mPlace = extractPlaceRef(m.body);
    if (!mPlace) {
      primary.push(m);
      continue;
    }
    // 同じ地域（部分一致）なら primary 維持
    if (mPlace === anchorPlace || mPlace.includes(anchorPlace) || anchorPlace.includes(mPlace)) {
      primary.push(m);
    } else {
      demoted.push(m);
    }
  }

  return {
    primary,
    background: [...olderSlice, ...demoted],
  };
}

// ─────────────────────────────────────────────
// 5. 軽量 LLM による scope 抽出（オプション / 失敗時は regex フォールバック）
// ─────────────────────────────────────────────

/**
 * anchor テキストから軽量 LLM で scope を抽出。
 *
 * - 失敗・タイムアウト時は regex フォールバック
 * - デフォルトは OFF（env フラグで明示的に有効化するまで regex のみ）
 *
 * Phase 1.5.4.6 の MVP では使わない（regex で十分に四国バグを防げるため）。
 * Phase 1.5.7+ で enable する。
 */
export async function extractScopeWithLLM(
  text: string,
  options?: { timeoutMs?: number },
): Promise<TopicScope> {
  // MVP: 常に regex にフォールバック。将来 runAI({ model: haiku, ... }) を挿入。
  void options;
  return extractScopeRegex(text);
}

// ─────────────────────────────────────────────
// 6. 公開テスト用 internal
// ─────────────────────────────────────────────

export const __internal = {
  detectThemeFromText,
  extractTimeRef,
  extractPlaceRef,
};

export type { TopicAnchorSource };
