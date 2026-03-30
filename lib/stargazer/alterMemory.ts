"use server";

import { runAI } from "@/lib/ai";
import { makeStargazerRunMetadata } from "@/lib/stargazer/studentTrack";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface AlterSessionSummary {
  sessionId: string;
  date: string;
  keyThemes: string[];
  contradictionsDiscovered: string[];
  userAdmissions: string[];
  resistancePoints: string[];
  emotionalArc: string;
  deepestMoment: string;
  followUpHooks: string[];
  rawMessageCount: number;
}

/** A single key revelation extracted from a session */
export interface KeyRevelation {
  sessionId: string;
  date: string;
  /** Exact user quote that was revealing */
  quote: string;
  /** What Alter learned from it */
  insight: string;
  /** Emotional weight 0-1 */
  emotionalWeight: number;
  /** Related trait axis or theme */
  relatedAxis: string;
}

/** A recurring theme detected across sessions */
export interface RecurringTheme {
  theme: string;
  frequency: number;
  firstSeen: string;
  lastSeen: string;
  userAwareness: "aware" | "partially_aware" | "unaware";
}

/** A contradiction detected between different sessions */
export interface CrossSessionContradiction {
  sessionA: string;
  sessionB: string;
  statementsA: string;
  statementsB: string;
  contradiction: string;
  resolved: boolean;
}

/** Emotional arc tracking for a single session */
export interface SessionEmotionalArc {
  sessionId: string;
  date: string;
  dominantEmotion: string;
  modeProgression: string[];
  depth: number;
}

/** Full long-term memory for Alter cross-session intelligence */
export interface AlterLongTermMemory {
  /** Key revelations from past sessions */
  keyRevelations: KeyRevelation[];

  /** Recurring themes across sessions */
  recurringThemes: RecurringTheme[];

  /** Contradictions between sessions */
  crossSessionContradictions: CrossSessionContradiction[];

  /** Emotional patterns across sessions */
  emotionalArc: SessionEmotionalArc[];

  /** Topics the user avoids */
  avoidedTopics: string[];

  /** The deepest insight achieved so far */
  deepestInsight: string | null;

  /** Total session count */
  sessionCount: number;

  /** Trust level 0-1 based on session history */
  trustLevel: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Key Revelation Extraction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Patterns indicating a revealing user statement */
const REVELATION_PATTERNS: Array<{
  pattern: RegExp;
  weight: number;
  axis: string;
}> = [
  { pattern: /実は.*(?:ずっと|本当は|誰にも)/, weight: 0.9, axis: "自己認識" },
  { pattern: /認め(?:る|たく|たい)/, weight: 0.85, axis: "自己受容" },
  { pattern: /怖(?:い|かった|くて)/, weight: 0.8, axis: "恐怖" },
  { pattern: /本当(?:の|は).*自分/, weight: 0.9, axis: "自己認識" },
  { pattern: /(?:分かっ|気づい)(?:た|て).*(?:けど|のに|が)/, weight: 0.75, axis: "気づき" },
  { pattern: /(?:逃げ|避け).*(?:ている|てきた|てた)/, weight: 0.8, axis: "回避" },
  { pattern: /(?:寂し|孤独|一人)/, weight: 0.7, axis: "つながり" },
  { pattern: /(?:誰にも|言え|話せ).*(?:ない|なかった)/, weight: 0.85, axis: "抑圧" },
  { pattern: /(?:嫌い|憎|許せ).*(?:自分|僕|私|俺|あたし)/, weight: 0.9, axis: "自己価値" },
  { pattern: /(?:死にたい|消えたい|いなくなり)/, weight: 1.0, axis: "存在不安" },
  { pattern: /(?:変わ|変え).*(?:たい|たかった|られない)/, weight: 0.7, axis: "変化" },
  { pattern: /(?:依存|甘え|頼).*(?:てしまう|ている|てた)/, weight: 0.75, axis: "依存" },
  { pattern: /(?:完璧|失敗|ミス).*(?:許せ|怖|できない)/, weight: 0.8, axis: "完璧主義" },
  { pattern: /(?:家族|親|母|父).*(?:のせい|だから|のこと)/, weight: 0.85, axis: "家族" },
];

/**
 * Extract the most revealing user quote from a session's messages.
 *
 * Scans user messages for patterns indicating vulnerability, admission,
 * or deep self-awareness. Returns the single most emotionally weighted revelation.
 */
export async function extractKeyRevelation(
  messages: Array<{ role: string; content: string; mode?: string }>,
  sessionId: string = "",
  date: string = new Date().toISOString().slice(0, 10),
): Promise<KeyRevelation | null> {
  const userMessages = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content);

  if (userMessages.length === 0) return null;

  let best: { quote: string; weight: number; axis: string } | null = null;

  for (const msg of userMessages) {
    for (const { pattern, weight, axis } of REVELATION_PATTERNS) {
      if (pattern.test(msg)) {
        // Longer messages with revelatory patterns are more meaningful
        const lengthBonus = Math.min(msg.length / 200, 0.1);
        const totalWeight = weight + lengthBonus;
        if (!best || totalWeight > best.weight) {
          best = { quote: msg.slice(0, 200), weight: totalWeight, axis };
        }
      }
    }
  }

  if (!best) {
    // Fallback: longest emotional message as weak revelation
    const longest = userMessages.reduce((a, b) => (a.length > b.length ? a : b), "");
    if (longest.length > 30) {
      return {
        sessionId,
        date,
        quote: longest.slice(0, 200),
        insight: "対話中の最も長い発言。深い内省の兆候",
        emotionalWeight: 0.3,
        relatedAxis: "一般",
      };
    }
    return null;
  }

  // Generate insight from the revelation pattern
  const insightMap: Record<string, string> = {
    自己認識: "本当の自分と向き合おうとする瞬間。自己像の再構築が始まっている",
    自己受容: "自分の一部を認める準備が見える。受容への第一歩",
    恐怖: "恐怖を言語化できている。恐れの正体が見え始めている",
    気づき: "知っているのに認められない状態。認知と受容のギャップ",
    回避: "回避パターンを自覚している。しかし行動は変わっていない可能性",
    つながり: "孤独の訴え。つながりへの渇望と自己防衛の葛藤",
    抑圧: "言えなかったことを言い始めている。抑圧の氷解が進行中",
    自己価値: "自己否定の深層。存在証明への渇望の裏返し",
    存在不安: "最も深い苦痛の表出。安全の確認と寄り添いが必要",
    変化: "変化への願望と恐怖の共存。現状維持と成長の間の引き裂き",
    依存: "依存パターンの自覚。自立と甘えの間の核心的葛藤",
    完璧主義: "完璧主義の苦しみを表出。失敗への恐怖が行動を制限",
    家族: "家族の影響への言及。原初的な傷に触れている可能性",
  };

  return {
    sessionId,
    date,
    quote: best.quote,
    insight: insightMap[best.axis] ?? "重要な自己開示の瞬間",
    emotionalWeight: Math.min(best.weight, 1.0),
    relatedAxis: best.axis,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Recurring Theme Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Awareness patterns that indicate user knows about a theme */
const AWARENESS_PATTERNS = {
  aware: /分かっ(?:ている|てる)|知っ(?:ている|てる)|自覚|意識して/,
  partially_aware: /もしかして|かもしれない|気がする|なんとなく/,
};

/**
 * Detect recurring themes across multiple session summaries.
 *
 * Analyzes keyThemes from all sessions, counting frequency and tracking
 * first/last appearance. Also estimates user awareness level.
 */
export async function detectRecurringThemes(
  sessions: AlterSessionSummary[],
): Promise<RecurringTheme[]> {
  if (sessions.length < 2) return [];

  // Count theme occurrences across sessions
  const themeMap = new Map<
    string,
    { count: number; firstDate: string; lastDate: string; allText: string }
  >();

  for (const session of sessions) {
    for (const theme of session.keyThemes) {
      const normalized = theme.trim();
      if (!normalized) continue;

      const existing = themeMap.get(normalized);
      if (existing) {
        existing.count++;
        if (session.date < existing.firstDate) existing.firstDate = session.date;
        if (session.date > existing.lastDate) existing.lastDate = session.date;
        existing.allText += " " + session.userAdmissions.join(" ") + " " + session.deepestMoment;
      } else {
        themeMap.set(normalized, {
          count: 1,
          firstDate: session.date,
          lastDate: session.date,
          allText: session.userAdmissions.join(" ") + " " + session.deepestMoment,
        });
      }
    }

    // Also check for keyword overlap between sessions
    // Group similar themes by shared keywords
  }

  // Also detect implicit recurring themes from userAdmissions + resistancePoints
  const allAdmissions = sessions.flatMap((s) => s.userAdmissions);
  const allResistance = sessions.flatMap((s) => s.resistancePoints);
  const allText = [...allAdmissions, ...allResistance].join(" ");

  // Check known theme categories
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    const hits = keywords.filter((kw) => allText.includes(kw)).length;
    if (hits >= 2) {
      const existing = themeMap.get(theme);
      if (existing) {
        existing.count = Math.max(existing.count, hits);
      } else {
        const dates = sessions.map((s) => s.date).sort();
        themeMap.set(theme, {
          count: hits,
          firstDate: dates[0] ?? "",
          lastDate: dates[dates.length - 1] ?? "",
          allText,
        });
      }
    }
  }

  // Convert to RecurringTheme array, filtering for frequency >= 2
  const themes: RecurringTheme[] = [];
  themeMap.forEach((data, theme) => {
    if (data.count < 2) return;

    // Estimate user awareness
    let awareness: "aware" | "partially_aware" | "unaware" = "unaware";
    if (AWARENESS_PATTERNS.aware.test(data.allText)) {
      awareness = "aware";
    } else if (AWARENESS_PATTERNS.partially_aware.test(data.allText)) {
      awareness = "partially_aware";
    }

    themes.push({
      theme,
      frequency: data.count,
      firstSeen: data.firstDate,
      lastSeen: data.lastDate,
      userAwareness: awareness,
    });
  });

  // Sort by frequency descending
  themes.sort((a, b) => b.frequency - a.frequency);
  return themes.slice(0, 10);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cross-Session Contradiction Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Semantic opposition pairs for contradiction detection */
const OPPOSITION_PAIRS: Array<{ a: RegExp; b: RegExp; label: string }> = [
  { a: /自由.*(?:大事|大切|重要|求め)/, b: /安全|安定|安心|リスク.*避/, label: "自由 vs 安全" },
  { a: /一人.*(?:好き|楽|平気)/, b: /寂し|孤独|一人.*(?:嫌|怖|辛)/, label: "孤独の許容 vs 恐怖" },
  { a: /評価.*(?:気にし|どうでも|関係)ない/, b: /認め.*(?:たい|欲し|ほしい)|評価.*(?:欲し|ほしい)/, label: "評価への無関心 vs 承認欲求" },
  { a: /強.*(?:なりたい|でいたい|ある)/, b: /弱.*(?:見せ|泣|甘え|頼)/, label: "強さの追求 vs 弱さの欲求" },
  { a: /変わ.*(?:たい|りたい|なきゃ)/, b: /変わ.*(?:たくない|れない|怖)/, label: "変化への渇望 vs 恐怖" },
  { a: /人.*(?:好き|信じ|信頼)/, b: /人.*(?:嫌い|信じ.*ない|怖|裏切)/, label: "他者への信頼 vs 不信" },
  { a: /完璧.*(?:求め|目指|でなければ)/, b: /(?:不完全|適当|いい加減).*(?:でいい|でもいい|許)/, label: "完璧主義 vs 受容" },
  { a: /(?:助け|頼).*(?:たくない|必要ない|一人で)/, b: /(?:助けて|頼り|支え).*(?:たい|ほしい|欲し)/, label: "自立 vs 依存" },
];

/**
 * Find contradictions across multiple session summaries.
 *
 * Compares userAdmissions, deepestMoment, and keyThemes between sessions
 * to find statements that semantically oppose each other.
 */
export async function findCrossSessionContradictions(
  sessions: AlterSessionSummary[],
): Promise<CrossSessionContradiction[]> {
  if (sessions.length < 2) return [];

  const contradictions: CrossSessionContradiction[] = [];

  // Build text corpus per session
  const sessionTexts = sessions.map((s) => ({
    id: s.sessionId,
    date: s.date,
    text: [
      ...s.userAdmissions,
      s.deepestMoment,
      ...s.keyThemes,
      ...s.resistancePoints,
    ].join(" "),
    admissions: s.userAdmissions,
  }));

  // Compare each pair of sessions
  for (let i = 0; i < sessionTexts.length; i++) {
    for (let j = i + 1; j < sessionTexts.length; j++) {
      const a = sessionTexts[i]!;
      const b = sessionTexts[j]!;

      for (const pair of OPPOSITION_PAIRS) {
        const aMatchesFirst = pair.a.test(a.text) && pair.b.test(b.text);
        const bMatchesFirst = pair.b.test(a.text) && pair.a.test(b.text);

        if (aMatchesFirst || bMatchesFirst) {
          // Find the specific statements
          const stmtA = a.admissions.find(
            (adm) => (aMatchesFirst ? pair.a : pair.b).test(adm),
          ) ?? a.text.slice(0, 100);
          const stmtB = b.admissions.find(
            (adm) => (aMatchesFirst ? pair.b : pair.a).test(adm),
          ) ?? b.text.slice(0, 100);

          contradictions.push({
            sessionA: `${a.id} (${a.date})`,
            sessionB: `${b.id} (${b.date})`,
            statementsA: stmtA.slice(0, 200),
            statementsB: stmtB.slice(0, 200),
            contradiction: pair.label,
            resolved: false,
          });
        }
      }
    }
  }

  // Deduplicate by contradiction label
  const seen = new Set<string>();
  return contradictions.filter((c) => {
    if (seen.has(c.contradiction)) return false;
    seen.add(c.contradiction);
    return true;
  }).slice(0, 5);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Avoided Topic Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** All possible topic categories for avoidance detection */
const ALL_TOPIC_CATEGORIES = [
  "仕事のストレス", "人間関係", "自己認識", "感情の抑圧",
  "将来への不安", "恋愛と親密さ", "家族", "完璧主義",
  "自己価値", "変化への恐れ",
];

/**
 * Detect topics the user has never mentioned across all sessions.
 * Topics that are absent across 3+ sessions are considered "avoided".
 */
function detectAvoidedTopics(sessions: AlterSessionSummary[]): string[] {
  if (sessions.length < 3) return [];

  const allText = sessions
    .flatMap((s) => [...s.keyThemes, ...s.userAdmissions, s.deepestMoment, ...s.resistancePoints])
    .join(" ");

  const avoided: string[] = [];
  for (const category of ALL_TOPIC_CATEGORIES) {
    const keywords = THEME_KEYWORDS[category];
    if (!keywords) continue;
    const mentioned = keywords.some((kw) => allText.includes(kw));
    if (!mentioned) {
      avoided.push(category);
    }
  }

  return avoided;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Emotional Arc Tracking
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Emotion label map for arc detection */
const EMOTION_LABELS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /defensive/, label: "防衛" },
  { pattern: /curious/, label: "好奇" },
  { pattern: /vulnerable/, label: "脆弱" },
  { pattern: /raw/, label: "生の感情" },
  { pattern: /insight/, label: "気づき" },
  { pattern: /stable/, label: "安定" },
];

/**
 * Extract emotional arc data from session summaries.
 */
function extractEmotionalArcs(sessions: AlterSessionSummary[]): SessionEmotionalArc[] {
  return sessions.map((s) => {
    // Parse emotional arc string (format: "label1 -> label2 -> label3")
    const arcParts = s.emotionalArc.split(/\s*(?:→|->)\s*/);

    // Determine dominant emotion (last in progression, or most intense)
    const dominantEmotion = arcParts[arcParts.length - 1] ?? "stable";

    // Estimate depth from rawMessageCount and emotional progression
    const progressionDepth = arcParts.length;
    const hasVulnerable = arcParts.some((p) => /vulnerable|raw|insight/.test(p));
    const depth = Math.min(
      10,
      progressionDepth + (hasVulnerable ? 3 : 0) + Math.floor(s.rawMessageCount / 5),
    );

    // Translate arc labels to Japanese
    const modeProgression = arcParts.map((part) => {
      for (const { pattern, label } of EMOTION_LABELS) {
        if (pattern.test(part)) return label;
      }
      return part;
    });

    return {
      sessionId: s.sessionId,
      date: s.date,
      dominantEmotion,
      modeProgression,
      depth,
    };
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Trust Level Calculation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Calculate trust level (0-1) based on session history.
 *
 * Factors:
 * - Number of sessions (more sessions = more trust)
 * - Depth of revelations (deeper = more trust built)
 * - Presence of admissions (user opened up = trust exists)
 * - Emotional progression reached vulnerable/raw states
 */
function calculateTrustLevel(sessions: AlterSessionSummary[]): number {
  if (sessions.length === 0) return 0;

  // Base trust from session count (caps at 0.4 with 10+ sessions)
  const sessionFactor = Math.min(sessions.length / 10, 0.4);

  // Admission factor: how many sessions had user admissions
  const sessionsWithAdmissions = sessions.filter(
    (s) => s.userAdmissions.length > 0,
  ).length;
  const admissionFactor = Math.min(sessionsWithAdmissions / sessions.length, 1) * 0.3;

  // Depth factor: did conversations reach vulnerable/raw/insight stages
  const deepSessions = sessions.filter((s) =>
    /vulnerable|raw|insight/.test(s.emotionalArc),
  ).length;
  const depthFactor = Math.min(deepSessions / Math.max(sessions.length, 1), 1) * 0.3;

  return Math.min(sessionFactor + admissionFactor + depthFactor, 1.0);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Build Memory Context (Main Aggregator)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Build comprehensive long-term memory from past sessions.
 *
 * Aggregates all session summaries into a structured memory object
 * that enables Alter to reference past conversations, detect patterns,
 * and build continuity across sessions.
 *
 * @param userId - User ID
 * @param limit - Max sessions to load (default 20)
 * @returns AlterLongTermMemory with all cross-session intelligence
 */
export async function buildMemoryContext(
  userId: string,
  limit: number = 20,
): Promise<AlterLongTermMemory> {
  const sessions = await loadAlterSessionSummaries(userId, limit);

  if (sessions.length === 0) {
    return {
      keyRevelations: [],
      recurringThemes: [],
      crossSessionContradictions: [],
      emotionalArc: [],
      avoidedTopics: [],
      deepestInsight: null,
      sessionCount: 0,
      trustLevel: 0,
    };
  }

  // Extract key revelations from summaries (using deepestMoment as proxy)
  const keyRevelations: KeyRevelation[] = sessions
    .filter((s) => s.deepestMoment && s.deepestMoment.length > 10)
    .map((s) => ({
      sessionId: s.sessionId,
      date: s.date,
      quote: s.deepestMoment.slice(0, 200),
      insight: s.userAdmissions[0] ?? "深い交流の瞬間",
      emotionalWeight: /vulnerable|raw|insight/.test(s.emotionalArc) ? 0.8 : 0.5,
      relatedAxis: s.keyThemes[0] ?? "一般",
    }))
    .slice(0, 10);

  const recurringThemes = await detectRecurringThemes(sessions);
  const crossSessionContradictions = await findCrossSessionContradictions(sessions);
  const emotionalArc = extractEmotionalArcs(sessions);
  const avoidedTopics = detectAvoidedTopics(sessions);
  const trustLevel = calculateTrustLevel(sessions);

  // Find deepest insight: the highest-weight revelation or deepest moment
  const deepestInsight = keyRevelations.length > 0
    ? keyRevelations.reduce((a, b) =>
        a.emotionalWeight > b.emotionalWeight ? a : b,
      ).quote
    : null;

  return {
    keyRevelations,
    recurringThemes,
    crossSessionContradictions,
    emotionalArc,
    avoidedTopics,
    deepestInsight,
    sessionCount: sessions.length,
    trustLevel,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Summarize Alter Session (AI + Template Fallback)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Summarize an Alter conversation session using AI
 */
export async function summarizeAlterSession(
  messages: Array<{ role: string; content: string; mode?: string }>,
  userId: string,
): Promise<AlterSessionSummary | null> {
  if (messages.length < 4) return null; // Too short to summarize

  const conversation = messages
    .map(
      (m) =>
        `${m.role === "user" ? "ユーザー" : "シャドウ"}${m.mode ? ` [${m.mode}]` : ""}: ${m.content}`,
    )
    .join("\n");

  const systemPrompt =
    "あなたは対話分析エンジンです。シャドウ（もうひとりの自分）とユーザーの対話を分析し、構造化された要約を生成します。JSONで回答してください。";

  const prompt = `以下のシャドウ対話を分析してください。

${conversation.slice(0, 3000)}

以下のJSON形式で要約:
{
  "keyThemes": ["テーマ1", "テーマ2", ...],           // 最大5つの主要テーマ
  "contradictionsDiscovered": ["矛盾1", ...],          // 対話で発覚した矛盾
  "userAdmissions": ["認めたこと1", ...],               // ユーザーが認めたこと
  "resistancePoints": ["抵抗したこと1", ...],           // ユーザーが抵抗・否定した点
  "emotionalArc": "対話の感情的な流れの説明",
  "deepestMoment": "最も深い交流の瞬間",
  "followUpHooks": ["次回掘り下げるべきトピック1", ...]  // 次回の対話への伏線
}`;

  try {
    const result = await runAI({
      taskType: "stargazer_alter_session_summary",
      metadata: { ...makeStargazerRunMetadata({ feature: "alter_memory" }), messageCount: messages.length },
      prompt,
      systemPrompt,
      requireJson: true,
      temperature: 0.3,
      maxOutputTokens: 500,
      userId,
    });

    if (result.success && result.structured) {
      const j = result.structured as Record<string, unknown>;
      return {
        sessionId: "", // filled by caller
        date: new Date().toISOString().slice(0, 10),
        keyThemes: toStringArray(j.keyThemes, 5),
        contradictionsDiscovered: toStringArray(j.contradictionsDiscovered, 5),
        userAdmissions: toStringArray(j.userAdmissions, 5),
        resistancePoints: toStringArray(j.resistancePoints, 5),
        emotionalArc: String(j.emotionalArc ?? "").slice(0, 300),
        deepestMoment: String(j.deepestMoment ?? "").slice(0, 300),
        followUpHooks: toStringArray(j.followUpHooks, 5),
        rawMessageCount: messages.length,
      };
    }
  } catch (e) {
    console.warn("[alterMemory] Summarization failed, using template fallback:", e);
  }

  // Template-based fallback: extract themes via keyword matching
  return extractSummaryByTemplate(messages);
}

function toStringArray(val: unknown, max: number): string[] {
  if (!Array.isArray(val)) return [];
  return val.slice(0, max).map((v) => String(v).slice(0, 200));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Template-based fallback summarizer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Keyword categories for theme extraction */
const THEME_KEYWORDS: Record<string, string[]> = {
  仕事のストレス: ["仕事", "職場", "上司", "同僚", "残業", "転職", "キャリア"],
  人間関係: ["友達", "友人", "関係", "距離感", "信頼", "裏切り", "孤独"],
  自己認識: ["自分", "本当", "性格", "素の", "演じ", "仮面", "本音"],
  感情の抑圧: ["我慢", "抑え", "感情", "泣", "怒り", "悲し", "辛"],
  将来への不安: ["将来", "未来", "不安", "恐怖", "怖い", "心配", "迷"],
  恋愛と親密さ: ["恋", "愛", "好き", "パートナー", "距離", "甘え", "依存"],
  家族: ["家族", "親", "母", "父", "兄弟", "姉妹", "育ち"],
  完璧主義: ["完璧", "失敗", "間違", "ミス", "基準", "妥協", "プレッシャー"],
  自己価値: ["価値", "存在", "認め", "褒め", "評価", "承認", "必要"],
  変化への恐れ: ["変わ", "変化", "慣れ", "安定", "コンフォート", "挑戦", "リスク"],
};

/** Emotional arc keywords */
const EMOTION_MARKERS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /違う|そうじゃない|でも|いや/, label: "defensive" },
  { pattern: /確かに|そうかも|言われてみ/, label: "curious" },
  { pattern: /実は|本当は|認め|分かっ/, label: "vulnerable" },
  { pattern: /怖い|不安|辛い|苦し/, label: "raw" },
  { pattern: /なるほど|そういうこと|見えてき/, label: "insight" },
];

/**
 * Template-based fallback when AI summarization fails.
 * Extracts themes, emotional arc, admissions, and resistance from message content
 * using keyword matching.
 */
function extractSummaryByTemplate(
  messages: Array<{ role: string; content: string; mode?: string }>,
): AlterSessionSummary {
  const userMessages = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content);
  const allUserText = userMessages.join(" ");

  // Extract themes by keyword matching
  const themeScores: Array<{ theme: string; score: number }> = [];
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    const score = keywords.reduce(
      (acc, kw) => acc + (allUserText.includes(kw) ? 1 : 0),
      0,
    );
    if (score > 0) themeScores.push({ theme, score });
  }
  themeScores.sort((a, b) => b.score - a.score);
  const keyThemes = themeScores.slice(0, 5).map((t) => t.theme);

  // Detect emotional arc by scanning user messages in order
  const arcLabels: string[] = [];
  for (const msg of userMessages) {
    for (const marker of EMOTION_MARKERS) {
      if (marker.pattern.test(msg) && !arcLabels.includes(marker.label)) {
        arcLabels.push(marker.label);
      }
    }
  }
  const emotionalArc =
    arcLabels.length > 0 ? arcLabels.join(" → ") : "stable";

  // Detect admissions: user messages containing acknowledgment patterns
  const admissionPatterns = /実は|認め|確かに|そうかも|本当は|分かった|気づい/;
  const admissions = userMessages
    .filter((m) => admissionPatterns.test(m))
    .map((m) => m.slice(0, 100))
    .slice(0, 3);

  // Detect resistance: user messages with pushback patterns
  const resistancePatterns =
    /違う|そうじゃない|でも|いや|そんなことない|関係ない|知らない/;
  const resistancePoints = userMessages
    .filter((m) => resistancePatterns.test(m))
    .map((m) => m.slice(0, 100))
    .slice(0, 3);

  // Find the deepest moment: longest user message (heuristic for emotional depth)
  const deepest = userMessages.reduce(
    (a, b) => (a.length > b.length ? a : b),
    "",
  );

  return {
    sessionId: "",
    date: new Date().toISOString().slice(0, 10),
    keyThemes: keyThemes.length > 0 ? keyThemes : ["一般的な対話"],
    contradictionsDiscovered: [],
    userAdmissions: admissions,
    resistancePoints,
    emotionalArc,
    deepestMoment: deepest.slice(0, 200),
    followUpHooks:
      keyThemes.length > 0 ? [keyThemes[0] + "についてさらに深掘り"] : [],
    rawMessageCount: messages.length,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Build Memory Context String (Legacy, for system prompt)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Build memory context string for Alter system prompt
 * Returns formatted text of past session summaries
 */
export async function buildAlterMemoryContext(
  userId: string,
  limit: number = 10,
): Promise<string> {
  const { data: summaries } = await supabaseAdmin
    .from("stargazer_alter_session_summaries")
    .select("*")
    .eq("user_id", userId)
    .order("summary_date", { ascending: false })
    .limit(limit);

  if (!summaries || summaries.length === 0) return "";

  const lines = summaries.map((s: Record<string, unknown>) => {
    const parts: string[] = [`[${s.summary_date}]`];
    const keyThemes = s.key_themes as string[] | null;
    const userAdmissions = s.user_admissions as string[] | null;
    const resistancePoints = s.resistance_points as string[] | null;
    const deepestMoment = s.deepest_moment as string | null;
    const followUpHooks = s.follow_up_hooks as string[] | null;

    if (keyThemes && keyThemes.length > 0)
      parts.push(`テーマ: ${keyThemes.join("、")}`);
    if (userAdmissions && userAdmissions.length > 0)
      parts.push(`認めたこと: ${userAdmissions.join("、")}`);
    if (resistancePoints && resistancePoints.length > 0)
      parts.push(`抵抗した点: ${resistancePoints.join("、")}`);
    if (deepestMoment) parts.push(`最も深い瞬間: ${deepestMoment}`);
    if (followUpHooks && followUpHooks.length > 0)
      parts.push(`次回への伏線: ${followUpHooks.join("、")}`);
    return parts.join("\n  ");
  });

  return `## 過去のセッション記録（${summaries.length}件）\n${lines.join("\n\n")}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cross-Session Contradiction Detection (Single Message)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Detect contradictions between current message and past session summaries
 */
export async function detectCrossSessionContradiction(
  currentMessage: string,
  summaries: AlterSessionSummary[],
): Promise<string | null> {
  if (summaries.length === 0 || !currentMessage.trim()) return null;

  // Simple keyword matching for contradiction detection
  // Look for topics in past admissions/themes that appear in current message
  const currentWords = new Set(
    currentMessage
      .split(/[\s、。！？「」]+/)
      .filter((w) => w.length >= 2),
  );

  for (const summary of summaries) {
    // Check if current message touches topics from past sessions
    for (const admission of summary.userAdmissions) {
      const admissionWords = admission
        .split(/[\s、。]+/)
        .filter((w) => w.length >= 2);
      const overlap = admissionWords.filter((w) => currentWords.has(w));
      if (overlap.length >= 2) {
        return `${summary.date}のセッションで、君は「${admission}」と認めていた。今の発言はそれと関係がありそうだ。`;
      }
    }

    // Check resistance points
    for (const resistance of summary.resistancePoints) {
      const resistanceWords = resistance
        .split(/[\s、。]+/)
        .filter((w) => w.length >= 2);
      const overlap = resistanceWords.filter((w) => currentWords.has(w));
      if (overlap.length >= 2) {
        return `以前、「${resistance}」という話題に抵抗していたね。今日はそこに触れてきた。何か変わったのかな。`;
      }
    }
  }

  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Load / Save
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Load raw summaries from DB as AlterSessionSummary array (for contradiction detection)
 */
export async function loadAlterSessionSummaries(
  userId: string,
  limit: number = 10,
): Promise<AlterSessionSummary[]> {
  const { data: rows } = await supabaseAdmin
    .from("stargazer_alter_session_summaries")
    .select("*")
    .eq("user_id", userId)
    .order("summary_date", { ascending: false })
    .limit(limit);

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

/**
 * Save a session summary to the database
 */
export async function saveAlterSessionSummary(
  userId: string,
  summary: AlterSessionSummary,
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("stargazer_alter_session_summaries")
    .upsert(
      {
        user_id: userId,
        session_id: summary.sessionId,
        summary_date: summary.date,
        key_themes: summary.keyThemes,
        contradictions_discovered: summary.contradictionsDiscovered,
        user_admissions: summary.userAdmissions,
        resistance_points: summary.resistancePoints,
        emotional_arc: summary.emotionalArc,
        deepest_moment: summary.deepestMoment,
        follow_up_hooks: summary.followUpHooks,
        raw_message_count: summary.rawMessageCount,
      },
      { onConflict: "user_id,session_id" },
    );

  if (error) {
    console.error("[alterMemory] Save failed:", error);
    return false;
  }
  return true;
}
