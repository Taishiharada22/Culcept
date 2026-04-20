/**
 * Episodic Recall — Phase 1: 「思い出せるAlter」
 *
 * ユーザーが過去の会話に言及した時、関連するセッションを想起して
 * Alter プロンプトに注入する。
 *
 * 設計書: docs/alter-episodic-recall-phase1-design.md
 * CEO承認: 2026-04-16
 *
 * フロー:
 *   detectEpisodicRecallSignal → findRelevantSessions → buildRecallBlock
 *
 * 原則:
 *   - UIは1本（新画面なし）
 *   - 想起は条件付き（シグナル検出時のみ）
 *   - まずは要約想起（全文復元は目指さない）
 *   - 捏造禁止。思い出せない時は正直に曖昧さを出す
 */

"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { AlterSessionSummary } from "./alterMemory";

// ─── Constants ──────────────────────────────────────────────────────────

/** Stage 2（具体想起）の制約定数 */
const RECALL_LIMITS = {
  maxCoreTurns: 6,           // 3往復まで
  maxMessageChars: 150,      // 1メッセージ150文字で切り詰め
  maxQuoteSessions: 1,       // 生ログ引用は1セッションのみ
} as const;

// ─── Types ──────────────────────────────────────────────────────────────

export type RecallSignalType = "temporal" | "topic_ref" | "continuation";
export type TimeHint = "yesterday" | "day_before" | "last_week" | "recent" | "unspecified";

export interface RecallSignal {
  detected: boolean;
  type: RecallSignalType;
  timeHint: TimeHint;
  topicHint: string | null;
  personHint: string | null;
  /** 具体想起が必要か（「何て言った？」系） */
  needsSpecificQuote: boolean;
}

export interface SessionMatch {
  sessionId: string;
  date: string;
  keyThemes: string[];
  emotionalArc: string;
  deepestMoment: string;
  followUpHooks: string[];
  rawMessageCount: number;
  relevanceScore: number;
}

export interface CoreExchange {
  role: "user" | "alter";
  message: string;
  turnNumber: number;
}

export interface RecallResult {
  signal: RecallSignal;
  matches: SessionMatch[];
  coreExchanges: CoreExchange[];
  promptBlock: string;
  mode: "summary" | "specific" | "not_found";
}

// ─── Signal Detection ───────────────────────────────────────────────────

/**
 * エピソード想起シグナルの検出。
 *
 * Phase 1: regex only（LLMコール0、~1ms）
 * 将来: utteranceIntent パラメータで utterance reading 結果を差し込み可能
 */
export async function detectEpisodicRecallSignal(
  message: string,
  /** 将来拡張: utterance reading の intent を受け取る口 */
  _utteranceIntent?: string,
): Promise<RecallSignal> {
  // 優先順位: topic_ref > continuation > temporal
  // topic_ref/continuation はより具体的なシグナルなので先に検出する
  // 「何話したっけ昨日」→ topic_ref (何話した) であり temporal (昨日) ではない
  const PATTERNS: [RecallSignalType, RegExp][] = [
    ["topic_ref", /あの(話|件|こと)|あの.{1,8}?(の話|の件|のこと)|その(話|件|こと|続き)|その.{1,8}?(の話|の件|のこと)|何(話した|の話|て言った)|なんて(言|返)|覚えて(る|いる|ない)|思い出/],
    ["continuation", /続き(は|を|から|だけど)|途中だった|あれ(から|って|どう)|どうなった/],
    ["temporal", /一昨日|おととい|昨日|前回|この前|さっき|先週|先月|前に.{0,10}?(?:話|言|聞)|以前|あの(時|とき)/],
  ];

  // 具体想起トリガー（Stage 2 が必要なケース）
  const SPECIFIC_QUOTE_PATTERNS = /何て言(った|ってた)|なんて(言|返)|俺(は|が).*言(った|ってた)|Alter.*言(った|返)/;

  for (const [type, pattern] of PATTERNS) {
    if (pattern.test(message)) {
      return {
        detected: true,
        type,
        timeHint: extractTimeHint(message),
        topicHint: extractTopicHint(message),
        personHint: extractPersonHint(message),
        needsSpecificQuote: SPECIFIC_QUOTE_PATTERNS.test(message),
      };
    }
  }

  return {
    detected: false,
    type: "temporal",
    timeHint: "unspecified",
    topicHint: null,
    personHint: null,
    needsSpecificQuote: false,
  };
}

// ── Time hint extraction ──

function extractTimeHint(message: string): TimeHint {
  // 一昨日 を 昨日 より先に検査（「一昨日」が「昨日」の部分一致で負けるのを防ぐ）
  if (/一昨日|おととい/.test(message)) return "day_before";
  if (/昨日/.test(message)) return "yesterday";
  if (/先週/.test(message)) return "last_week";
  if (/さっき|この前|前回/.test(message)) return "recent";
  return "unspecified";
}

// ── Topic hint extraction ──

function extractTopicHint(message: string): string | null {
  // 「あの仕事の話」→「仕事」、「転職の件」→「転職」
  const topicPatterns = [
    /(?:あの|その|例の)(.{1,8}?)(?:の話|の件|のこと|について)/,
    /(.{2,8}?)(?:の話|の件)(?:なんだけど|だけど|って|は)/,
  ];
  for (const p of topicPatterns) {
    const m = message.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

// ── Person hint extraction ──

function extractPersonHint(message: string): string | null {
  // 「田中さんの話」「彼女の件」等
  const personPatterns = [
    /([一-龥ァ-ヶ]{1,4})(さん|くん|ちゃん|氏|先生|先輩|後輩|部長|課長|社長)(?:の|と|が|は|に)/,
    /(彼|彼女|あいつ|あの人|あの子|相手|パートナー|上司|部下|同僚|友達|親|母|父|兄|姉|弟|妹)(?:の|と|が|は|に|って)/,
  ];
  for (const p of personPatterns) {
    const m = message.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

// ─── Session Search ─────────────────────────────────────────────────────

/**
 * 想起シグナルに基づいて関連セッションを検索する。
 *
 * Strategy:
 *   1. 時間フィルタ（前日カレンダー優先 + 36h fallback）
 *   2. 重み付きランキング（日付 > 人物 > テーマ > follow_up_hooks）
 *   3. 上位3件を返す
 */
export async function findRelevantSessions(
  userId: string,
  signal: RecallSignal,
  userTZ: string = "Asia/Tokyo",
): Promise<SessionMatch[]> {
  // ── 1. 時間フィルタ構築 ──
  // Q2 確定: 前日カレンダー優先 + 36h fallback
  const now = new Date();
  const userToday = toCalendarDate(now, userTZ);

  let dateRange = computeDateRange(signal.timeHint, userToday);

  // 2. primary 検索
  let sessions = await querySessionSummaries(userId, dateRange);

  // 3. fallback: 「昨日」でヒットしなければ直近36時間に拡張
  if (sessions.length === 0 && signal.timeHint === "yesterday") {
    const fallbackStart = new Date(now.getTime() - 36 * 60 * 60 * 1000);
    sessions = await querySessionSummaries(userId, {
      gte: toCalendarDate(fallbackStart, userTZ),
      lte: userToday,
    });
  }

  // unspecified で結果なし → 直近30日に拡張
  if (sessions.length === 0 && signal.timeHint === "unspecified") {
    sessions = await querySessionSummaries(userId, {
      gte: addDays(userToday, -30),
      lte: userToday,
    });
  }

  // ── 4. 重み付きランキング ──
  return rankAndSelect(sessions, signal, 3);
}

function computeDateRange(
  timeHint: TimeHint,
  userToday: string,
): { gte: string; lte: string } {
  switch (timeHint) {
    case "yesterday":
      return { gte: addDays(userToday, -1), lte: addDays(userToday, -1) };
    case "day_before":
      return { gte: addDays(userToday, -2), lte: addDays(userToday, -2) };
    case "last_week":
      return { gte: addDays(userToday, -7), lte: addDays(userToday, -1) };
    case "recent":
      return { gte: addDays(userToday, -3), lte: userToday };
    case "unspecified":
      return { gte: addDays(userToday, -14), lte: userToday };
  }
}

async function querySessionSummaries(
  userId: string,
  range: { gte: string; lte: string },
): Promise<AlterSessionSummary[]> {
  const { data: rows } = await supabaseAdmin
    .from("stargazer_alter_session_summaries")
    .select("*")
    .eq("user_id", userId)
    .gte("summary_date", range.gte)
    .lte("summary_date", range.lte)
    .order("summary_date", { ascending: false })
    .limit(10);

  if (!rows || rows.length === 0) return [];

  return rows.map((r: Record<string, unknown>) => ({
    sessionId: String(r.session_id ?? ""),
    date: String(r.summary_date ?? ""),
    keyThemes: (r.key_themes as string[]) ?? [],
    contradictionsDiscovered: (r.contradictions_discovered as string[]) ?? [],
    userAdmissions: (r.user_admissions as string[]) ?? [],
    resistancePoints: (r.resistance_points as string[]) ?? [],
    emotionalArc: String(r.emotional_arc ?? ""),
    deepestMoment: String(r.deepest_moment ?? ""),
    followUpHooks: (r.follow_up_hooks as string[]) ?? [],
    rawMessageCount: Number(r.raw_message_count ?? 0),
  }));
}

function rankAndSelect(
  sessions: AlterSessionSummary[],
  signal: RecallSignal,
  maxResults: number,
): SessionMatch[] {
  const scored = sessions.map((s) => {
    let score = 0;

    // (a) 日付一致 — 基本スコア（全セッションに最低限）
    score += 0.3;

    // (b) テーマ一致
    if (signal.topicHint) {
      const themeMatch = s.keyThemes.some((t) =>
        t.includes(signal.topicHint!) || signal.topicHint!.includes(t),
      );
      if (themeMatch) score += 0.8;
    }

    // (c) follow_up_hooks 一致
    if (signal.topicHint) {
      const hookMatch = s.followUpHooks.some((h) =>
        h.includes(signal.topicHint!) || signal.topicHint!.includes(h),
      );
      if (hookMatch) score += 0.6;
    }

    // (d) 人物名一致（強シグナル）
    if (signal.personHint) {
      const allText = [
        ...s.keyThemes,
        ...s.userAdmissions,
        s.deepestMoment,
        ...s.followUpHooks,
      ].join(" ");
      if (allText.includes(signal.personHint)) score += 0.9;
    }

    // (e) メッセージ数が多い = より実質的な会話
    if (s.rawMessageCount >= 6) score += 0.1;

    return {
      sessionId: s.sessionId,
      date: s.date,
      keyThemes: s.keyThemes,
      emotionalArc: s.emotionalArc,
      deepestMoment: s.deepestMoment,
      followUpHooks: s.followUpHooks,
      rawMessageCount: s.rawMessageCount,
      relevanceScore: score,
    } satisfies SessionMatch;
  });

  return scored
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, maxResults);
}

// ─── Core Exchange Loading (Stage 2) ────────────────────────────────────

/**
 * 具体想起: 生ログから核心メッセージを引用。
 * Q3 確定: サマリで足りない時だけ実行。
 */
export async function loadCoreExchanges(
  userId: string,
  sessionId: string,
): Promise<CoreExchange[]> {
  const { data } = await supabaseAdmin
    .from("stargazer_alter_dialogues")
    .select("role, message, turn_number")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .order("turn_number", { ascending: false })
    .limit(RECALL_LIMITS.maxCoreTurns);

  if (!data || data.length === 0) return [];

  return data
    .reverse()
    .map((d: Record<string, unknown>) => ({
      role: String(d.role ?? "user") as "user" | "alter",
      message: String(d.message ?? "").slice(0, RECALL_LIMITS.maxMessageChars),
      turnNumber: Number(d.turn_number ?? 0),
    }));
}

// ─── Prompt Block Builder ───────────────────────────────────────────────

/**
 * 想起結果からプロンプト注入ブロックを構築。
 *
 * 3パターン:
 *   - summary: 要約想起（テーマ・結論・残論点）
 *   - specific: 具体想起（サマリ + 生ログ引用）
 *   - not_found: 該当なし（捏造禁止ガイダンス）
 */
export async function buildRecallBlock(
  matches: SessionMatch[],
  coreExchanges: CoreExchange[],
): Promise<{ block: string; mode: "summary" | "specific" | "not_found" }> {
  // ── 該当なし ──
  if (matches.length === 0) {
    return {
      mode: "not_found",
      block: [
        "## 過去の会話の記憶",
        "",
        "ユーザーが過去の会話に言及しているが、該当する記録が見つからなかった。",
        "以下の原則に従って応答すること:",
        '- 「思い出せない」と正直に伝えてよい。人間の記憶も完璧ではない。',
        '- 「いつ頃？」「どんな話だったっけ？」と聞き返してよい。',
        "- 捏造は絶対にしない。曖昧な記憶を確定的に語らない。",
        '- テーマだけ分かる場合は「確か〜の話だったよね」まで。詳細は推測しない。',
      ].join("\n"),
    };
  }

  // ── 要約想起 or 具体想起 ──
  const mode = coreExchanges.length > 0 ? "specific" : "summary";

  const lines: string[] = [
    "## 過去の会話の記憶",
    "",
    "以下はユーザーとの過去の会話から想起された内容。",
    '自然に語ること。「データベースで確認した」とは絶対に言わない。',
    '「あの時」「前に話した時」のように、自分の記憶として語る。',
    '確信がない場合は「確か…だったよね？」と聞き返してよい。',
    "テーマは覚えていても言い回しまでは曖昧、というのが自然。",
    "",
  ];

  for (const m of matches) {
    lines.push(`### ${m.date} の会話`);
    lines.push(`- テーマ: ${m.keyThemes.join("、")}`);
    if (m.emotionalArc) lines.push(`- 流れ: ${m.emotionalArc}`);
    if (m.deepestMoment) lines.push(`- 核心: ${m.deepestMoment}`);
    if (m.followUpHooks.length > 0) {
      lines.push(`- 次にやろうと言ってたこと: ${m.followUpHooks.join("、")}`);
    }
    lines.push("");
  }

  // 具体想起: 生ログ引用（3往復上限、150文字切り詰め済み）
  if (coreExchanges.length > 0) {
    lines.push("### 具体的なやりとり（参考）");
    lines.push("※ 以下は参考。一字一句の正確な再現ではなく、大意を自分の言葉で語ること。");
    for (const ex of coreExchanges) {
      const speaker = ex.role === "user" ? "ユーザー" : "Alter";
      lines.push(`${speaker}: ${ex.message}`);
    }
    lines.push("");
  }

  return { block: lines.join("\n"), mode };
}

// ─── Orchestrator ───────────────────────────────────────────────────────

/**
 * エピソード想起の統合エントリポイント。
 *
 * route.ts から呼ばれる。シグナル検出 → 検索 → ブロック構築を一括実行。
 * シグナル未検出時は即座に null を返す（コスト0）。
 */
export async function runEpisodicRecall(
  message: string,
  userId: string,
  userTZ?: string,
): Promise<RecallResult | null> {
  // 1. シグナル検出
  const signal = await detectEpisodicRecallSignal(message);
  if (!signal.detected) return null;

  console.info(
    `[episodic-recall] Signal detected: type=${signal.type}, time=${signal.timeHint}, ` +
    `topic=${signal.topicHint ?? "none"}, person=${signal.personHint ?? "none"}, ` +
    `needsQuote=${signal.needsSpecificQuote}`,
  );

  // 2. セッション検索（Stage 1: 要約想起）
  const matches = await findRelevantSessions(userId, signal, userTZ);

  // 3. 具体想起（Stage 2: 条件付き）
  // Q3 確定: サマリで足りない時だけ。needsSpecificQuote かつ候補あり の場合のみ
  let coreExchanges: CoreExchange[] = [];
  if (signal.needsSpecificQuote && matches.length > 0) {
    coreExchanges = await loadCoreExchanges(userId, matches[0].sessionId);
    console.info(
      `[episodic-recall] Stage 2 loaded: ${coreExchanges.length} turns from session ${matches[0].sessionId}`,
    );
  }

  // 4. プロンプトブロック構築
  const { block, mode } = await buildRecallBlock(matches, coreExchanges);

  console.info(
    `[episodic-recall] Result: mode=${mode}, matches=${matches.length}, ` +
    `coreExchanges=${coreExchanges.length}, blockLen=${block.length}`,
  );

  return { signal, matches, coreExchanges, promptBlock: block, mode };
}

// ─── Date Utilities ─────────────────────────────────────────────────────

/** Date をユーザーTZのカレンダー日付文字列に変換 */
function toCalendarDate(date: Date, tz: string): string {
  // Intl.DateTimeFormat でTZ変換
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const y = parts.find((p) => p.type === "year")?.value ?? "2026";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

/** カレンダー日付文字列に日数を加算 */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
