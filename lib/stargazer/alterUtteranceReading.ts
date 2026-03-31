/**
 * Alter Utterance Reading — Gemini一次読解モジュール
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 運用原則: Gemini outputs are proposals, not truth.
 * Geminiに"読む"ことを任せるが、"その人にとって何を意味するか"
 * を決める主権はAneurasyncに残す。
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 設計原則（CEO承認 2026-03-31）:
 * 1. Geminiは「意味を確定する役」ではなく「候補を出す役」
 * 2. Geminiのconfidenceは保存判断の根拠にしない（候補の優先順にのみ使用）
 * 3. 既存のAneurasync反証を通らないものは理解資産に書き込まない
 * 4. 読解失敗時は既存パイプラインがそのまま動く（graceful degradation）
 * 5. 保存や表示はAneurasyncの検証後だけ
 *
 * Phase A（本番利用）: emotional_temperature, relational_context
 * Phase A（並走評価）: surface_intent → disagreement log で既存ルールと比較、プロンプト注入しない
 * Phase B（shadow）: implied_meanings, unspoken_candidates → ログのみ、長めに shadow
 * Phase C（将来）: implied_meanings を反証入力、unspoken_candidates を補助信号
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Geminiの自己申告確度。保存判断には使わず、候補の優先順にのみ使用 */
export type ReadingConfidence = "certain" | "likely" | "possible" | "faint";

/** 含意候補（Phase B: shadow log only） */
export interface ImpliedMeaning {
  content: string;
  confidence: ReadingConfidence;
  basis: string;
}

/** 言外の候補（Phase B: shadow log only） */
export interface UnspokenCandidate {
  content: string;
  confidence: ReadingConfidence;
  basis: string;
}

/** 対人文脈の読解（Phase A: 本番利用） */
export interface RelationalContextReading {
  target_mentioned: boolean;
  target_role: string | null;
  interaction_type: string | null;
}

/** Phase 0 読解結果の全体型 */
export interface UtteranceReading {
  // Phase A: 本番利用
  surface_intent: string;
  emotional_temperature: number; // 0.0-1.0
  energy_direction: "seeking" | "retreating" | "ambivalent" | "neutral";
  relational_context: RelationalContextReading | null;
  notable_expressions: string[];

  // Phase B: shadow log only（理解資産化しない）
  implied_meanings: ImpliedMeaning[];
  unspoken_candidates: UnspokenCandidate[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// JSON Schema（Gemini structured output用）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const UTTERANCE_READING_SCHEMA = {
  type: "object",
  properties: {
    surface_intent: {
      type: "string",
      description: "ユーザーの表面的な意図を1文で要約",
    },
    emotional_temperature: {
      type: "number",
      description: "感情的な温度 0.0（冷静）〜 1.0（強い感情）",
    },
    energy_direction: {
      type: "string",
      enum: ["seeking", "retreating", "ambivalent", "neutral"],
      description: "エネルギーの方向: seeking=前進したい, retreating=引きたい, ambivalent=迷い, neutral=平坦",
    },
    relational_context: {
      type: ["object", "null"],
      properties: {
        target_mentioned: { type: "boolean" },
        target_role: { type: ["string", "null"] },
        interaction_type: { type: ["string", "null"] },
      },
      required: ["target_mentioned"],
    },
    notable_expressions: {
      type: "array",
      items: { type: "string" },
      maxItems: 5,
      description: "特徴的な言い回し（「もう」「なんか」「一応」等）",
    },
    implied_meanings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          content: { type: "string" },
          confidence: { type: "string", enum: ["certain", "likely", "possible", "faint"] },
          basis: { type: "string" },
        },
        required: ["content", "confidence", "basis"],
      },
      maxItems: 5,
    },
    unspoken_candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          content: { type: "string" },
          confidence: { type: "string", enum: ["certain", "likely", "possible", "faint"] },
          basis: { type: "string" },
        },
        required: ["content", "confidence", "basis"],
      },
      maxItems: 3,
    },
  },
  required: [
    "surface_intent",
    "emotional_temperature",
    "energy_direction",
    "relational_context",
    "notable_expressions",
    "implied_meanings",
    "unspoken_candidates",
  ],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// System Prompt
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const UTTERANCE_READING_SYSTEM_PROMPT = [
  "あなたはユーザー発話の一次読解を行う解析エンジンです。",
  "意味を確定するのではなく、候補を出す役割です。",
  "",
  "# 読解ルール",
  "1. surface_intent: ユーザーが最も言いたいことを1文で。推測は混ぜない。",
  "2. emotional_temperature: 0.0（完全に冷静・事務的）〜 1.0（強い感情・切迫感）。",
  "   中間値を恐れない。0.3, 0.5, 0.7 のような値が自然。",
  "3. energy_direction:",
  "   - seeking: 「どうすればいい？」「やりたい」「次に進みたい」",
  "   - retreating: 「疲れた」「もう無理」「やめたい」",
  "   - ambivalent: 「でも」「一方で」「迷ってる」",
  "   - neutral: 雑談・報告・情報共有",
  "4. relational_context: 発話に特定の相手が含まれる場合のみ。",
  "   target_role は「上司」「恋人」「母親」「友人」等。含まれなければ null。",
  "   interaction_type は「相談」「報告」「愚痴」「交渉」「共有」等。",
  "5. notable_expressions: 感情や態度を暗示する特徴的な言葉や言い回し。最大5つ。",
  "6. implied_meanings: 発話から読み取れる含意。confidence は控えめに。",
  "   確実に言えることだけ certain。多くは possible か faint が適切。",
  "7. unspoken_candidates: 言葉にしていないが背景にありそうなこと。",
  "   これは仮説であり、外れて当然。confidence は likely 以下が適切。",
  "   最大3つまで。無理に埋めない。候補がなければ空配列。",
  "",
  "# 重要な制約",
  "- あなたの読解は「確定」ではなく「候補」です。",
  "- confidence を過大評価しないこと。迷ったら1段階下げる。",
  "- 短い発話に対して過剰な解釈を足さないこと。",
  "- 「わからない」「読み取れない」は正当な回答です。無理に埋めない。",
].join("\n");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prompt Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 一次読解用のユーザープロンプトを構築する。
 * 直近の会話履歴を含めることで文脈を持った読解を可能にする。
 */
export function buildUtteranceReadingPrompt(
  message: string,
  conversationHistory?: Array<{ role: string; content: string }>,
): string {
  const blocks: string[] = [];

  if (conversationHistory && conversationHistory.length > 0) {
    // 直近4ターン（2往復）のみ。長すぎる文脈はノイズになる
    const recent = conversationHistory.slice(-4);
    blocks.push("## 直前の会話（参考）");
    for (const msg of recent) {
      const label = msg.role === "user" ? "ユーザー" : "Alter";
      blocks.push(`${label}: ${msg.content.slice(0, 300)}`);
    }
    blocks.push("");
  }

  blocks.push("## 読解対象の発話");
  blocks.push(message);

  return blocks.join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Validation & Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Gemini出力をUtteranceReadingとして検証・正規化する。
 * 不正な値はデフォルトにフォールバック。
 */
export function validateUtteranceReading(
  raw: Record<string, unknown>,
): UtteranceReading | null {
  // surface_intent は必須
  if (typeof raw.surface_intent !== "string" || !raw.surface_intent.trim()) {
    return null;
  }

  // emotional_temperature を 0-1 にクランプ
  let emotionalTemp = typeof raw.emotional_temperature === "number"
    ? raw.emotional_temperature
    : 0.5;
  emotionalTemp = Math.max(0, Math.min(1, emotionalTemp));

  // energy_direction のバリデーション
  const validDirections = ["seeking", "retreating", "ambivalent", "neutral"] as const;
  const energyDir = validDirections.includes(raw.energy_direction as any)
    ? (raw.energy_direction as typeof validDirections[number])
    : "neutral";

  // relational_context
  let relCtx: RelationalContextReading | null = null;
  if (raw.relational_context && typeof raw.relational_context === "object") {
    const rc = raw.relational_context as Record<string, unknown>;
    if (typeof rc.target_mentioned === "boolean" && rc.target_mentioned) {
      relCtx = {
        target_mentioned: true,
        target_role: typeof rc.target_role === "string" ? rc.target_role : null,
        interaction_type: typeof rc.interaction_type === "string" ? rc.interaction_type : null,
      };
    }
  }

  // notable_expressions
  const notableExprs = Array.isArray(raw.notable_expressions)
    ? raw.notable_expressions
        .filter((e): e is string => typeof e === "string")
        .slice(0, 5)
    : [];

  // implied_meanings（Phase B: validate but don't use in pipeline）
  const impliedMeanings = validateCandidateArray(raw.implied_meanings, 5);

  // unspoken_candidates（Phase B: validate but don't use in pipeline）
  const unspokenCandidates = validateCandidateArray(raw.unspoken_candidates, 3);

  return {
    surface_intent: raw.surface_intent as string,
    emotional_temperature: emotionalTemp,
    energy_direction: energyDir,
    relational_context: relCtx,
    notable_expressions: notableExprs,
    implied_meanings: impliedMeanings,
    unspoken_candidates: unspokenCandidates,
  };
}

function validateCandidateArray(
  raw: unknown,
  maxItems: number,
): Array<{ content: string; confidence: ReadingConfidence; basis: string }> {
  if (!Array.isArray(raw)) return [];

  const validConfidences: ReadingConfidence[] = ["certain", "likely", "possible", "faint"];

  return raw
    .filter((item): item is Record<string, unknown> => {
      if (!item || typeof item !== "object") return false;
      return typeof (item as any).content === "string" && typeof (item as any).basis === "string";
    })
    .slice(0, maxItems)
    .map((item) => ({
      content: String(item.content),
      confidence: validConfidences.includes(item.confidence as ReadingConfidence)
        ? (item.confidence as ReadingConfidence)
        : "faint",
      basis: String(item.basis),
    }));
}

/**
 * Phase A: emotional_temperature を既存の UserState に補正適用する。
 * ルールベース推定 70% + Gemini読解 30% の加重平均。
 */
export function applyEmotionalTemperatureCorrection(
  currentEmotionalLoad: number,
  geminiTemperature: number,
): number {
  return currentEmotionalLoad * 0.7 + geminiTemperature * 0.3;
}

/**
 * Phase A: Geminiの relational_context を既存の RelationalLens に統合する。
 * Gemini読解が検出し、ルールベースが見逃した対人文脈を補完する。
 * ルールベースが既に検出している場合はルールベースを優先。
 */
export function mergeRelationalContext(
  existingTargetRole: string | null,
  geminiReading: RelationalContextReading | null,
): { target_role: string | null; enriched_by_reading: boolean } {
  // ルールベースが既に検出している → そのまま
  if (existingTargetRole) {
    return { target_role: existingTargetRole, enriched_by_reading: false };
  }

  // Gemini読解が対人文脈を検出 → 補完
  if (geminiReading?.target_mentioned && geminiReading.target_role) {
    return { target_role: geminiReading.target_role, enriched_by_reading: true };
  }

  return { target_role: null, enriched_by_reading: false };
}

/**
 * Phase A: Gemini読解のうち本番利用可能な信号のみを
 * 応答生成プロンプトに注入するブロックを構築する。
 * 内部参照用であり、ユーザーには直接見せない。
 *
 * 注入するもの: emotional_temperature, energy_direction, relational_context, notable_expressions
 * 注入しないもの: surface_intent（並走評価中）, implied_meanings, unspoken_candidates（shadow）
 *
 * 運用原則: Gemini outputs are proposals, not truth.
 * "読む"ことをGeminiに任せるが、"その人にとって何を意味するか"を決める主権はAneurasyncに残す。
 */
export function buildReadingPromptBlock(reading: UtteranceReading): string {
  const lines: string[] = [
    "# 発話の読解補助（内部参照用・ユーザーには見せない）",
    `感情温度: ${reading.emotional_temperature.toFixed(2)}`,
    `方向性: ${reading.energy_direction}`,
  ];

  if (reading.relational_context?.target_mentioned) {
    const rc = reading.relational_context;
    lines.push(`対人文脈: ${rc.target_role ?? "不明"} (${rc.interaction_type ?? "不明"})`);
  }

  if (reading.notable_expressions.length > 0) {
    lines.push(`注目表現: ${reading.notable_expressions.join(", ")}`);
  }

  lines.push("");
  lines.push("この読解を踏まえて応答すること。ただし読解内容を直接言及しないこと。");
  lines.push("「あなたの発話から〜を読み取りました」のような表現は禁止。");

  return lines.join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Disagreement Log — Gemini vs 既存ルールの並走評価
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Gemini読解と既存ルールの出力を比較し、不一致箇所を記録する。
 * 「どこをGeminiに寄せるべきか」の判断材料を蓄積する。
 *
 * 運用原則: Gemini outputs are proposals, not truth.
 * この関数は置換判断のためではなく、並走評価のためにある。
 */
export interface DisagreementEntry {
  field: string;
  gemini_value: string | null;
  rule_value: string | null;
  agrees: boolean;
}

export function buildDisagreementLog(
  reading: UtteranceReading,
  ruleOutputs: {
    classifyQuestion_category: string | null;
    analyzeQueryContext_domain: string | null;
    extractRelationalLens_targetRole: string | null;
  },
): {
  entries: DisagreementEntry[];
  agreement_rate: number;
  disagreements: string[];
} {
  const entries: DisagreementEntry[] = [];

  // 1. surface_intent vs classifyQuestion
  // surface_intent は自由テキスト、classifyQuestion はカテゴリなので完全一致は見ない
  // ただし、energy_direction と classifyQuestion のマッピングで比較可能
  // → energy_direction: seeking ≈ gathering/work, retreating ≈ general, ambivalent ≈ cause
  // この粗い対応で一致/不一致を記録
  if (ruleOutputs.classifyQuestion_category) {
    const geminiDir = reading.energy_direction;
    const ruleCategory = ruleOutputs.classifyQuestion_category;
    // 明らかな不一致パターンのみ検出
    const mismatch =
      (geminiDir === "retreating" && ["gathering", "work", "contact"].includes(ruleCategory)) ||
      (geminiDir === "seeking" && ruleCategory === "general" && reading.emotional_temperature > 0.5);
    entries.push({
      field: "intent_direction",
      gemini_value: `${reading.surface_intent.slice(0, 60)} [${geminiDir}]`,
      rule_value: ruleCategory,
      agrees: !mismatch,
    });
  }

  // 2. domain comparison
  if (ruleOutputs.analyzeQueryContext_domain) {
    const geminiDomain = reading.energy_direction === "retreating" ? "emotional" :
      reading.relational_context?.target_mentioned ? "relationship" : null;
    // ドメイン推定は粗い。不一致があれば記録
    if (geminiDomain) {
      const agrees = ruleOutputs.analyzeQueryContext_domain.includes(geminiDomain.slice(0, 3));
      entries.push({
        field: "domain_hint",
        gemini_value: geminiDomain,
        rule_value: ruleOutputs.analyzeQueryContext_domain,
        agrees,
      });
    }
  }

  // 3. relational_context.target_role vs extractRelationalLens
  const geminiRole = reading.relational_context?.target_role ?? null;
  const ruleRole = ruleOutputs.extractRelationalLens_targetRole ?? null;
  const bothNull = geminiRole === null && ruleRole === null;
  const agrees = bothNull || (geminiRole !== null && ruleRole !== null);
  entries.push({
    field: "relational_target_role",
    gemini_value: geminiRole,
    rule_value: ruleRole,
    agrees,
  });

  const total = entries.length;
  const agreeCount = entries.filter(e => e.agrees).length;

  return {
    entries,
    agreement_rate: total > 0 ? agreeCount / total : 1,
    disagreements: entries
      .filter(e => !e.agrees)
      .map(e => `${e.field}: gemini=${e.gemini_value ?? "null"} vs rule=${e.rule_value ?? "null"}`),
  };
}

/**
 * Phase B shadow log 用: implied_meanings + unspoken_candidates を
 * analytics に記録するための構造化データを返す。
 */
export function buildShadowLogPayload(reading: UtteranceReading): {
  implied_meanings_count: number;
  unspoken_candidates_count: number;
  implied_summary: string[];
  unspoken_summary: string[];
  confidence_distribution: Record<ReadingConfidence, number>;
} {
  const confDist: Record<ReadingConfidence, number> = {
    certain: 0, likely: 0, possible: 0, faint: 0,
  };

  for (const m of reading.implied_meanings) confDist[m.confidence]++;
  for (const c of reading.unspoken_candidates) confDist[c.confidence]++;

  return {
    implied_meanings_count: reading.implied_meanings.length,
    unspoken_candidates_count: reading.unspoken_candidates.length,
    implied_summary: reading.implied_meanings.map(
      (m) => `[${m.confidence}] ${m.content.slice(0, 80)}`,
    ),
    unspoken_summary: reading.unspoken_candidates.map(
      (c) => `[${c.confidence}] ${c.content.slice(0, 80)}`,
    ),
    confidence_distribution: confDist,
  };
}
