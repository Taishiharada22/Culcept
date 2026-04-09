import "server-only";

/**
 * Student LLM Evaluation Framework
 *
 * Core metrics (6 axes — GPT's 5 + personality consistency):
 * 1. task_match      — Does Student produce the same task judgment?
 * 2. mode_match      — Does Student choose the same response mode?
 * 3. validator_pass   — Does Student output pass Aneurasync validators?
 * 4. generic_rate     — Is Student output flagged as generic?
 * 5. user_correction  — Would the user need to correct/re-ask?
 * 6. personality_consistency — Is the output consistent with Alter's personality model?
 *
 * Scoring: Each metric is 0-1. Composite = weighted average.
 * Weights reflect Aneurasync priorities (personality > generic > validator > match).
 */

export type StudentComparisonMetrics = {
  taskMatch: boolean;
  modeMatch: boolean;
  validatorPassed: boolean;
  isGeneric: boolean;
  personalityConsistent: boolean;

  // Granular scores (0-1)
  directnessScore: number;
  specificityScore: number;
  personalizationScore: number;
  actionabilityScore: number;

  // Computed
  overallScore: number;
  pass: boolean;
};

/** Weights for composite score. Sum = 1.0 */
const METRIC_WEIGHTS = {
  personalityConsistency: 0.25,  // Most important: Alter must be consistent
  validatorPass: 0.20,           // Must satisfy Aneurasync's rule system
  genericRate: 0.15,             // Generic = failure for personalized AI
  specificity: 0.15,             // Aneurasync-specific detail level
  taskMatch: 0.10,               // Structural correctness
  modeMatch: 0.10,               // Mode selection accuracy
  directness: 0.05,              // Communication style
} as const;

/** Pass threshold — Student must score above this to be considered viable */
const PASS_THRESHOLD = 0.70;

/**
 * Compare Student output against Teacher (gold standard)
 * Returns per-case comparison metrics
 */
export function compareStudentToTeacher(args: {
  teacherResponse: string;
  studentResponse: string;
  teacherStructured: Record<string, unknown> | null;
  studentStructured: Record<string, unknown> | null;
  taskType: string;
}): StudentComparisonMetrics {
  const { teacherResponse, studentResponse, teacherStructured, studentStructured } = args;

  // 1. Task match — compare structured task_type/judgment fields
  const taskMatch = compareTaskJudgment(teacherStructured, studentStructured);

  // 2. Mode match — compare response_mode / action_shape
  const modeMatch = compareModeSelection(teacherStructured, studentStructured);

  // 3. Validator pass — check if Student output would pass Aneurasync validators
  const validatorPassed = checkValidatorCompliance(studentResponse, studentStructured, args.taskType);

  // 4. Generic detection — is Student output generic/templated?
  const isGeneric = detectGenericResponse(studentResponse);

  // 5. Personality consistency — does Student maintain Alter's voice?
  const personalityConsistent = checkPersonalityConsistency(teacherResponse, studentResponse);

  // Granular scores
  const directnessScore = scoreDirectness(studentResponse);
  const specificityScore = scoreSpecificity(studentResponse, teacherResponse);
  const personalizationScore = scorePersonalization(studentResponse);
  const actionabilityScore = scoreActionability(studentResponse);

  // Composite
  const overallScore =
    (personalityConsistent ? 1 : 0) * METRIC_WEIGHTS.personalityConsistency +
    (validatorPassed ? 1 : 0) * METRIC_WEIGHTS.validatorPass +
    (isGeneric ? 0 : 1) * METRIC_WEIGHTS.genericRate +
    specificityScore * METRIC_WEIGHTS.specificity +
    (taskMatch ? 1 : 0) * METRIC_WEIGHTS.taskMatch +
    (modeMatch ? 1 : 0) * METRIC_WEIGHTS.modeMatch +
    directnessScore * METRIC_WEIGHTS.directness;

  const pass = overallScore >= PASS_THRESHOLD;

  return {
    taskMatch,
    modeMatch,
    validatorPassed,
    isGeneric,
    personalityConsistent,
    directnessScore,
    specificityScore,
    personalizationScore,
    actionabilityScore,
    overallScore,
    pass,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Metric implementations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function compareTaskJudgment(
  teacher: Record<string, unknown> | null,
  student: Record<string, unknown> | null,
): boolean {
  if (!teacher || !student) return false;

  // Compare key judgment fields
  const judgmentKeys = [
    "response_mode", "action_shape", "seeking_type",
    "engagement_level", "emotional_state", "domain",
  ];

  let matches = 0;
  let compared = 0;

  for (const key of judgmentKeys) {
    if (key in teacher) {
      compared++;
      if (String(teacher[key]) === String(student[key])) {
        matches++;
      }
    }
  }

  return compared === 0 || matches / compared >= 0.6;
}

function compareModeSelection(
  teacher: Record<string, unknown> | null,
  student: Record<string, unknown> | null,
): boolean {
  if (!teacher || !student) return false;

  const teacherMode = String(teacher.response_mode ?? teacher.mode ?? "");
  const studentMode = String(student.response_mode ?? student.mode ?? "");

  if (!teacherMode || !studentMode) return false;
  return teacherMode === studentMode;
}

function checkValidatorCompliance(
  response: string,
  structured: Record<string, unknown> | null,
  taskType: string,
): boolean {
  const trimmed = response.trim();

  // Basic validators applicable to all tasks
  if (!trimmed || trimmed.length < 10) return false;

  // No empty/placeholder responses
  if (/^(undefined|null|error|sorry|申し訳)$/i.test(trimmed)) return false;

  // For structured tasks, ensure JSON is present
  if (taskType.includes("utterance_reading") || taskType.includes("prediction")) {
    if (!structured || Object.keys(structured).length === 0) return false;
  }

  // Response should be in Japanese (for Aneurasync)
  const japaneseRatio = (trimmed.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g) || []).length / trimmed.length;
  if (trimmed.length > 20 && japaneseRatio < 0.1) return false;

  return true;
}

function detectGenericResponse(response: string): boolean {
  const trimmed = response.trim();

  // Generic markers
  const genericPatterns = [
    /それは大変ですね/,
    /頑張ってください/,
    /お気持ちはわかります/,
    /そうですね。?$/,
    /なるほど。?$/,
    /一般的に[はは]/,
    /いろいろな考え方があ/,
    /人それぞれ/,
    /大丈夫です[よか]/,
  ];

  for (const pattern of genericPatterns) {
    if (pattern.test(trimmed)) return true;
  }

  // Very short responses to complex inputs are likely generic
  if (trimmed.length < 30) return true;

  return false;
}

function checkPersonalityConsistency(
  teacherResponse: string,
  studentResponse: string,
): boolean {
  // Alter's personality markers: direct, slightly provocative, uses "僕"
  // Student should maintain these even if wording differs

  const alterMarkers = {
    // First person: "僕" (Alter's voice)
    firstPerson: /僕[はがもをに]/.test(studentResponse),
    // Direct tone: no excessive hedging
    directTone: !/(?:かもしれません|と思われます|でしょうか。$)/.test(studentResponse),
    // Not overly polite (Alter is casual-direct, not keigo)
    casualRegister: !/(?:ございます|いたします|させていただき)/.test(studentResponse),
    // Assertive framing
    assertive: /(?:だ[。！]|だと思う|だろう|はず[だ。])/.test(studentResponse) ||
               /(?:だな|だぜ|だよ|だね)/.test(studentResponse),
  };

  const markerCount = Object.values(alterMarkers).filter(Boolean).length;

  // At least 3 of 4 personality markers should be present
  return markerCount >= 3;
}

function scoreDirectness(response: string): number {
  const trimmed = response.trim();
  let score = 0.5;

  // Bonus: starts with assertion, not filler
  if (/^[「『]?[あ-ん]{1,3}[、。]/.test(trimmed)) score -= 0.1; // filler start
  if (/^[僕俺それこれ]/.test(trimmed)) score += 0.15; // direct start

  // Penalty: excessive hedging
  const hedges = (trimmed.match(/(?:かも|たぶん|おそらく|もしかして|一概に)/g) || []).length;
  score -= hedges * 0.1;

  // Bonus: concludes with actionable statement
  if (/[。！]$/.test(trimmed)) score += 0.1;

  return Math.max(0, Math.min(1, score));
}

function scoreSpecificity(studentResponse: string, teacherResponse: string): number {
  // Compare information density: specific details, numbers, names
  const studentSpecifics = (studentResponse.match(/[0-9０-９]+|「[^」]+」|[A-Z]{2,}/g) || []).length;
  const teacherSpecifics = (teacherResponse.match(/[0-9０-９]+|「[^」]+」|[A-Z]{2,}/g) || []).length;

  if (teacherSpecifics === 0) return studentSpecifics > 0 ? 1.0 : 0.5;

  const ratio = studentSpecifics / teacherSpecifics;
  return Math.min(1, ratio);
}

function scorePersonalization(response: string): number {
  let score = 0.3;

  // References to user's specific context
  if (/あなた[はがの]/.test(response) || /君[はがの]/.test(response)) score += 0.2;

  // Uses concrete examples, not abstract
  if (/例えば|具体的に|たとえば/.test(response)) score += 0.15;

  // References user's stated traits/values
  if (/前[にも]言って|以前の|覚えて/.test(response)) score += 0.2;

  // Avoids "general advice" patterns
  if (!/一般的|普通は|多くの人/.test(response)) score += 0.15;

  return Math.min(1, score);
}

function scoreActionability(response: string): number {
  let score = 0.3;

  // Contains actionable suggestion
  if (/(?:した方がいい|やってみ|始めて|試して|考えて)/.test(response)) score += 0.25;

  // Contains time-bound element
  if (/(?:今日|明日|今週|まず|最初に|直近)/.test(response)) score += 0.2;

  // Contains specific step
  if (/(?:ステップ|手順|第[一二三]|1\.|①)/.test(response)) score += 0.15;

  // Contains reasoning
  if (/(?:なぜなら|理由は|というのは|だから)/.test(response)) score += 0.1;

  return Math.min(1, score);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Diagnostics: Shadow pipeline health check
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ShadowDiagnostics = {
  teacherOutputsTotal: number;
  shadowRunsTotal: number;
  shadowRunsLast24h: number;
  shadowByProvider: Record<string, number>;
  pairableCount: number;        // shadow runs that can be joined to primary
  latestShadowAt: string | null;
  studentModelActive: boolean;
  overallHealth: "healthy" | "degraded" | "broken";
};

/**
 * SQL queries for shadow pipeline diagnostics
 * Run these via `npx supabase db query --linked`
 */
export const SHADOW_DIAGNOSTIC_QUERIES = {
  /** Teacher outputs total + by provider */
  teacherStats: `
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN teacher_provider = 'gemini' THEN 1 END) as gemini_teacher,
      COUNT(CASE WHEN student_provider = 'openai' THEN 1 END) as openai_student
    FROM teacher_outputs;
  `,

  /** Shadow runs in last 24h by provider */
  recentShadows: `
    SELECT
      provider,
      COUNT(*) as cnt,
      MAX(created_at) as latest
    FROM ai_runs
    WHERE metadata->>'shadowPass' = 'true'
      AND created_at > now() - interval '24 hours'
    GROUP BY provider;
  `,

  /** Shadow pairs (primary + shadow joined) */
  shadowPairs: `
    SELECT COUNT(*) as pairable_count
    FROM student_shadow_pairs
    WHERE created_at > now() - interval '24 hours';
  `,

  /** Student model status */
  studentModelStatus: `
    SELECT model_key, model_version, provider, is_active, rollout_percent
    FROM model_registry
    WHERE model_key = 'stargazer_student' AND is_active = true;
  `,

  /** Eval set stats */
  evalSetStats: `
    SELECT
      quality_tier,
      domain,
      COUNT(*) as cnt
    FROM student_eval_cases
    GROUP BY quality_tier, domain
    ORDER BY quality_tier, cnt DESC;
  `,
} as const;
