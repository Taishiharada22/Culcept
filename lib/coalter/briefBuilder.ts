/**
 * CoAlter Layer 0: Brief Builder
 *
 * 会話 → ConversationBrief（意図の構造化）
 *
 * 設計:
 *  - LLM: 意図の読み取りが本職（theme / area / mood / rankingAxesPreset の選択）
 *  - Parser fallback: LLM 失敗 / タイムアウト時でも最低限のブリーフを返す
 *  - primaryUnresolvedQuestion: 「この一点が決まれば動く」単一質問（配列禁止）
 *  - rankingAxes: closed-set preset のみ（自由生成禁止）
 *  - fieldConfidence: parser 由来フィールドは低 confidence → Layer 2 hard filter が緩まる
 *
 * CEO方針: 「品質は絶対に落としません」
 * → parser_fallback でもテーマ/エリア/時間帯の抽出は既存 conversationParser 相当の精度。
 */

import "server-only";

import { runAI } from "@/lib/ai";
import type {
  AgreedConstraint,
  BriefMood,
  ConversationAnalysis,
  ConversationBrief,
  ConversationTheme,
  ConversationTurn,
  PrimaryUnresolvedQuestion,
  RankingAxesPreset,
  RankingAxesSelection,
  RankingRole,
} from "./types";
import type { SlotKey } from "./slots";

// ─────────────────────────────────────────────
// Closed-vocabulary 定義
// ─────────────────────────────────────────────

const MOOD_VOCAB: BriefMood[] = [
  "重すぎない",
  "会話が続く",
  "静か",
  "盛り上がる",
  "癒し",
  "刺激",
  "ノスタルジア",
  "軽め",
  "非日常",
  "安心",
];

const PRESET_ROLES: Record<RankingAxesPreset, RankingRole[]> = {
  balance_focus: ["balance", "aFocus", "bFocus"],
  safety_adventure_discovery: ["safety", "adventure", "discovery"],
  calm_stimulating_nostalgic: ["calm", "stimulating", "nostalgic"],
};

// ─────────────────────────────────────────────
// Brief 用 JSON schema（LLM requireJson）
// ─────────────────────────────────────────────

const BRIEF_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    theme: {
      type: "string",
      enum: ["movie", "food", "travel", "date", "schedule", "gift", "general"],
    },
    area: { type: ["string", "null"] },
    approximateTime: {
      type: "object",
      properties: {
        date: { type: ["string", "null"] },
        timeSlot: {
          type: ["string", "null"],
          enum: ["morning", "afternoon", "evening", "night", null],
        },
        preferredStartHour: { type: ["integer", "null"] },
      },
      required: ["date", "timeSlot", "preferredStartHour"],
    },
    mood: {
      type: "array",
      items: { type: "string", enum: MOOD_VOCAB as unknown as string[] },
    },
    rankingAxes: {
      type: "object",
      properties: {
        preset: {
          type: "string",
          enum: [
            "balance_focus",
            "safety_adventure_discovery",
            "calm_stimulating_nostalgic",
          ],
        },
        rationale: { type: "string" },
      },
      required: ["preset", "rationale"],
    },
    primaryUnresolvedQuestion: {
      type: ["object", "null"],
      properties: {
        key: { type: "string" },
        question: { type: "string" },
        slot: {
          type: "string",
          enum: ["what", "where", "when", "who", "why", "how"],
        },
      },
      required: ["key", "question", "slot"],
    },
    confidence: { type: "number" },
  },
  required: [
    "theme",
    "area",
    "approximateTime",
    "mood",
    "rankingAxes",
    "primaryUnresolvedQuestion",
    "confidence",
  ],
};

// ─────────────────────────────────────────────
// プロンプト
// ─────────────────────────────────────────────

const SYSTEM_PROMPT = `あなたは2人の会話を読み取り、共同意思決定の「今回決めたいこと」を構造化するアナリストです。

# ルール
1. 今話している話題（最新 5 件を最重要視）から theme を決める。過去の話題に引きずられない。
2. area（場所）/ date / timeSlot は会話に明示されているものだけ拾う。推測で埋めない。
3. mood は必ず以下の closed vocabulary から 0〜3 個選ぶ。語を勝手に発明しない:
   ${MOOD_VOCAB.join(" / ")}
4. rankingAxes.preset は以下から 1 つだけ:
   - balance_focus: 折り合い重視（二人の好みが割れているが大差はない）
   - safety_adventure_discovery: 新規性 vs 安全を軸にしたい時（「冒険してみたい」「確実に外したくない」の綱引き）
   - calm_stimulating_nostalgic: 気分・体験のムードで決めたい時（「今日は癒しモード」等）
5. primaryUnresolvedQuestion は「この一点が決まれば前に進む」単一質問。
   決めるのに十分な情報が揃っていれば null を返す。複数質問を並べない。
6. confidence は 0.0〜1.0。情報が薄ければ正直に下げる（0.3 等）。

# 出力
JSON のみ。自然文禁止。`;

function buildUserPrompt(turns: ConversationTurn[]): string {
  const window = turns.slice(-20);
  const dialog = window
    .map((t) => `[${t.senderId.slice(0, 6)}] ${t.body}`)
    .join("\n");
  return `# 直近の会話
${dialog}

上記から ConversationBrief を構造化して返してください。`;
}

// ─────────────────────────────────────────────
// Parser fallback
// ─────────────────────────────────────────────

function mapTimeSlot(
  raw: string | null,
): "morning" | "afternoon" | "evening" | "night" | null {
  if (!raw) return null;
  if (/朝|午前|モーニング/.test(raw)) return "morning";
  if (/昼|午後|ランチ/.test(raw)) return "afternoon";
  if (/夕方|夕|イブニング/.test(raw)) return "evening";
  if (/夜|ディナー|レイトショー/.test(raw)) return "night";
  // 時刻直接指定
  const hm = raw.match(/(\d{1,2})時/);
  if (hm) {
    const h = Number(hm[1]);
    if (h >= 5 && h < 11) return "morning";
    if (h >= 11 && h < 17) return "afternoon";
    if (h >= 17 && h < 20) return "evening";
    if (h >= 20 || h < 5) return "night";
  }
  return null;
}

/**
 * explicit hour を authoritative source として brief.approximateTime を整形する。
 *
 * - timeSlot は hour 由来の mapTimeSlot で上書き（LLM 誤判定を矯正）
 * - preferredStartHour が欠けていれば補完
 * - hour が range 外 (mapTimeSlot が null) のケースでは元の brief を返す
 *   （反証: hour が数字として抽出されたが意味不明なら override しない）
 */
function rectifyBriefTimeByHour(
  brief: ConversationBrief,
  hour: number,
): ConversationBrief {
  const derivedSlot = mapTimeSlot(`${hour}時`);
  if (!derivedSlot) return brief;
  const at = brief.approximateTime;
  // no-op 最適化: 既に hour も timeSlot も整合している場合は同じ参照を返す
  if (
    at.timeSlot === derivedSlot &&
    at.preferredStartHour === hour
  ) {
    return brief;
  }
  return {
    ...brief,
    approximateTime: {
      date: at.date,
      timeSlot: derivedSlot,
      preferredStartHour: at.preferredStartHour ?? hour,
    },
  };
}

function extractPreferredStartHour(text: string): number | null {
  const m = text.match(/(\d{1,2})時/);
  if (!m) return null;
  const h = Number(m[1]);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : null;
}

function buildParserFallback(
  turns: ConversationTurn[],
  analysis: ConversationAnalysis | undefined,
): ConversationBrief {
  const joined = turns.map((t) => t.body).join(" ");
  const constraints = analysis?.extractedConstraints;

  const theme: ConversationBrief["theme"] = mapThemeToBrief(
    analysis?.theme ?? "general",
  );
  const area = constraints?.location ?? null;
  const date = constraints?.date ?? null;
  const timeSlot = mapTimeSlot(constraints?.timeSlot ?? null);
  const preferredStartHour = extractPreferredStartHour(joined);

  const mood = inferMoodFromText(joined);

  // fallback preset は「折り合い」を無難に置く
  const preset: RankingAxesPreset = "balance_focus";

  // fallback では primary question を生成しない（Layer 2 / clarify に任せる）
  const primaryUnresolvedQuestion: PrimaryUnresolvedQuestion | null =
    theme !== "general" && !area
      ? {
          key: "area",
          question: "エリアはどのあたりを考えてる？",
          slot: "where" as SlotKey,
        }
      : null;

  return {
    theme,
    area,
    approximateTime: {
      date,
      timeSlot,
      preferredStartHour,
    },
    mood,
    hardConstraints: analysis?.agreedConstraints ?? [],
    rankingAxes: {
      preset,
      roles: PRESET_ROLES[preset],
      rationale: "情報が限定的だったため折り合い軸で暫定選定",
    },
    primaryUnresolvedQuestion,
    confidence: 0.35,
    fieldConfidence: {
      theme: theme === "general" ? 0.3 : 0.55,
      area: area ? 0.5 : 0.2,
      approximateTime: date || timeSlot ? 0.5 : 0.2,
    },
    source: "parser_fallback",
  };
}

function mapThemeToBrief(t: ConversationTheme): ConversationBrief["theme"] {
  // ConversationTheme と ConversationBrief["theme"] の差分を吸収
  switch (t) {
    case "movie":
    case "food":
    case "travel":
    case "schedule":
    case "gift":
    case "general":
      return t;
    case "activity":
      // activity は brief では date / general で扱う
      return "date";
    default:
      return "general";
  }
}

function inferMoodFromText(text: string): BriefMood[] {
  const mood = new Set<BriefMood>();
  if (/癒し|まったり|落ち着/.test(text)) mood.add("癒し");
  if (/静か/.test(text)) mood.add("静か");
  if (/盛り上が|ワイワイ|賑やか/.test(text)) mood.add("盛り上がる");
  if (/刺激|エキサイ/.test(text)) mood.add("刺激");
  if (/軽め|気軽|ライト/.test(text)) mood.add("軽め");
  if (/重くな|疲れた|しんどい/.test(text)) mood.add("重すぎない");
  if (/懐かし|昔/.test(text)) mood.add("ノスタルジア");
  if (/非日常|特別/.test(text)) mood.add("非日常");
  if (/安心|確実|外した?く(ない|なくない)/.test(text)) mood.add("安心");
  if (/話|しゃべ|会話/.test(text)) mood.add("会話が続く");
  return Array.from(mood).slice(0, 3);
}

// ─────────────────────────────────────────────
// LLM 出力の正規化
// ─────────────────────────────────────────────

function normalizeLlmBrief(
  raw: Record<string, unknown>,
  hardConstraints: AgreedConstraint[],
): ConversationBrief | null {
  const theme = coerceTheme(raw.theme);
  if (!theme) return null;

  const area = typeof raw.area === "string" && raw.area.trim() ? raw.area.trim() : null;

  const at = (raw.approximateTime as Record<string, unknown> | undefined) ?? {};
  const date = typeof at.date === "string" && at.date.trim() ? at.date.trim() : null;
  const timeSlot = coerceTimeSlot(at.timeSlot);
  const preferredStartHour =
    typeof at.preferredStartHour === "number" &&
    at.preferredStartHour >= 0 &&
    at.preferredStartHour <= 23
      ? Math.floor(at.preferredStartHour)
      : null;

  const moodArr = Array.isArray(raw.mood) ? raw.mood : [];
  const mood: BriefMood[] = moodArr
    .map((m) => (typeof m === "string" && (MOOD_VOCAB as string[]).includes(m) ? (m as BriefMood) : null))
    .filter((m): m is BriefMood => m !== null)
    .slice(0, 4);

  const axesObj = raw.rankingAxes as Record<string, unknown> | undefined;
  const preset = coercePreset(axesObj?.preset);
  if (!preset) return null;
  const rationale =
    typeof axesObj?.rationale === "string" && axesObj.rationale.trim()
      ? axesObj.rationale.trim()
      : "折り合いと各自の好みのバランスを見て選定";

  const puq = normalizePrimaryQuestion(raw.primaryUnresolvedQuestion);

  const confidence =
    typeof raw.confidence === "number"
      ? Math.max(0, Math.min(1, raw.confidence))
      : 0.6;

  return {
    theme,
    area,
    approximateTime: { date, timeSlot, preferredStartHour },
    mood,
    hardConstraints,
    rankingAxes: {
      preset,
      roles: PRESET_ROLES[preset],
      rationale,
    },
    primaryUnresolvedQuestion: puq,
    confidence,
    fieldConfidence: {
      theme: confidence >= 0.6 ? 0.85 : 0.6,
      area: area ? 0.75 : 0.25,
      approximateTime: date || timeSlot ? 0.7 : 0.3,
    },
    source: "llm",
  };
}

function coerceTheme(v: unknown): ConversationBrief["theme"] | null {
  const vs = typeof v === "string" ? v : "";
  const allowed: ConversationBrief["theme"][] = [
    "movie",
    "food",
    "travel",
    "date",
    "schedule",
    "gift",
    "general",
  ];
  return (allowed as string[]).includes(vs) ? (vs as ConversationBrief["theme"]) : null;
}

function coerceTimeSlot(
  v: unknown,
): "morning" | "afternoon" | "evening" | "night" | null {
  if (v === null || v === undefined) return null;
  const vs = typeof v === "string" ? v : "";
  return (["morning", "afternoon", "evening", "night"] as const).includes(
    vs as "morning",
  )
    ? (vs as "morning" | "afternoon" | "evening" | "night")
    : null;
}

function coercePreset(v: unknown): RankingAxesPreset | null {
  const vs = typeof v === "string" ? v : "";
  return (
    ["balance_focus", "safety_adventure_discovery", "calm_stimulating_nostalgic"] as const
  ).includes(vs as RankingAxesPreset)
    ? (vs as RankingAxesPreset)
    : null;
}

function normalizePrimaryQuestion(
  v: unknown,
): PrimaryUnresolvedQuestion | null {
  if (!v || typeof v !== "object") return null;
  const obj = v as Record<string, unknown>;
  const key = typeof obj.key === "string" ? obj.key : null;
  const question = typeof obj.question === "string" ? obj.question : null;
  const slotRaw = typeof obj.slot === "string" ? obj.slot : null;
  const allowedSlots: SlotKey[] = ["what", "where", "when", "who", "why", "how"];
  if (!key || !question || !slotRaw) return null;
  if (!(allowedSlots as string[]).includes(slotRaw)) return null;
  return { key, question, slot: slotRaw as SlotKey };
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export interface BuildBriefInput {
  turns: ConversationTurn[];
  /** conversationParser で既に走らせた解析（hardConstraints / theme 推定の素材） */
  analysis?: ConversationAnalysis;
  /** LLM タイムアウト（ms）。指定なければ 3500 */
  timeoutMs?: number;
  userId?: string;
  sessionId?: string;
}

export interface BuildBriefResult {
  brief: ConversationBrief;
  /** LLM が成功したか（observability） */
  llmSuccess: boolean;
  latencyMs: number;
}

/**
 * Layer 0: 会話から ConversationBrief を作る。
 *
 * - LLM 成功 → source="llm"
 * - LLM 失敗 → source="parser_fallback"（既存 analysis を活用した最低限のブリーフ）
 *
 * 例外は外に投げない。必ず何かしらの ConversationBrief を返す。
 */
export async function buildConversationBrief(
  input: BuildBriefInput,
): Promise<BuildBriefResult> {
  const started = Date.now();
  const { turns, analysis, timeoutMs = 3500, userId, sessionId } = input;

  // 会話が空なら即 fallback
  if (turns.length === 0) {
    return {
      brief: buildParserFallback(turns, analysis),
      llmSuccess: false,
      latencyMs: Date.now() - started,
    };
  }

  const hardConstraints = analysis?.agreedConstraints ?? [];

  try {
    const result = await runAI({
      taskType: "coalter_brief",
      systemPrompt: SYSTEM_PROMPT,
      prompt: buildUserPrompt(turns),
      jsonSchema: BRIEF_SCHEMA,
      requireJson: true,
      temperature: 0.2,
      maxOutputTokens: 700,
      timeoutMs,
      userId,
      sessionId,
    });

    const raw = result.structured as Record<string, unknown> | null;
    if (!raw) {
      return {
        brief: buildParserFallback(turns, analysis),
        llmSuccess: false,
        latencyMs: Date.now() - started,
      };
    }
    const normalized = normalizeLlmBrief(raw, hardConstraints);
    if (!normalized) {
      return {
        brief: buildParserFallback(turns, analysis),
        llmSuccess: false,
        latencyMs: Date.now() - started,
      };
    }
    // 2026-04-21 S1 朝誤認修正（post-LLM override）:
    //   ユーザーが explicit な時刻（例: "11時"）を言っているのに LLM が
    //   "morning" と誤判定するケース（"お昼一緒に食べない？" と "11時" が
    //   同居して LLM が朝と判断）を、explicit hour を authoritative に
    //   置き換えることで修正する。
    //   反証: hour と LLM の timeSlot が整合していれば override は noop。
    //   hour を authoritative にする理由は、LLM の qualitative 判断は
    //   user の quantitative 明示より精度が劣るため。
    const joined = turns.map((t) => t.body).join(" ");
    const explicitHour = extractPreferredStartHour(joined);
    const rectified =
      explicitHour !== null
        ? rectifyBriefTimeByHour(normalized, explicitHour)
        : normalized;
    return {
      brief: rectified,
      llmSuccess: true,
      latencyMs: Date.now() - started,
    };
  } catch {
    return {
      brief: buildParserFallback(turns, analysis),
      llmSuccess: false,
      latencyMs: Date.now() - started,
    };
  }
}

// テスト用 export
export const __internal = {
  buildParserFallback,
  normalizeLlmBrief,
  inferMoodFromText,
  mapTimeSlot,
  extractPreferredStartHour,
  rectifyBriefTimeByHour,
  PRESET_ROLES,
  MOOD_VOCAB,
};
