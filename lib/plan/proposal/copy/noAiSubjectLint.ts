/**
 * No-AI-Subject Copy Lint — Phase 3 Invariant 34 + Smoke 38。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §2.5 補正 invariant 34 / §3.1 J-1b / §10.4 Smoke 38
 *
 * 役割:
 *   proposal copy 文字列が AI 主語を含まないことを runtime で検証。
 *   J-2 UI の runtime check で violation 検出時 dev warning を発する基盤。
 *   smoke test で全 copy 文字列が PASS することを機械的に強制。
 *
 * 禁止 pattern (= AI が主語として登場する文体):
 *   - 「Alter [は|が|に|を]」     (= AI 主体の動詞)
 *   - 「私 [は|が|を]」            (= 一人称、 boundary check 付き)
 *   - "I [verb]"                  (= 英語 一人称 + 動詞)
 *   - "my " / "me "               (= 英語 一人称所有 / 目的格)
 *
 * 許可 pattern (= 主語ではない用法):
 *   - "Alter Plan"                (= 製品名としての修飾子)
 *   - "Alter Settings"            (= 設定項目名)
 *   - "Alter からの提案"           (= 修飾子としての Alter)
 *
 * 不変原則:
 *   - Invariant 34 No-AI-Subject Copy
 *   - Invariant 29 Past-Self Voice (= 過去の自分が話す主体)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Forbidden patterns
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ForbiddenPattern {
  readonly regex: RegExp;
  readonly reason: string;
}

const FORBIDDEN_AI_SUBJECT_PATTERNS: ReadonlyArray<ForbiddenPattern> = [
  // 日本語: Alter [は|が|に|を]  (= 主語助詞、 修飾子用法 「Alter Plan」 は除外)
  {
    regex: /Alter\s*[はがにを]/,
    reason: "AI 主語: 「Alter [は|が|に|を]」 は AI を文章主語にする禁止 pattern",
  },

  // 日本語: 私 [は|が|を]  (= 一人称、 単独 vocab boundary 緩め)
  // 山田 / 私たち 等の compound 形を除外するため、 前方境界を check
  // ただし 「私たち」 にも 「私は/が/を」 は含まれないので、 単純に 私[はがを] でほぼ安全
  {
    regex: /(?:^|[^一-龯ぁ-んァ-ヶ])私[はがを]/,
    reason: "AI 主語: 「私 [は|が|を]」 は一人称、 AI 主体表現の禁止 pattern",
  },

  // 英語: "I [verb]"  (= "I" の後に space + 動詞)
  {
    regex: /\bI\s+(?:am|will|can|suggest|think|believe|recommend|propose|guess|see|notice|know|feel)\b/i,
    reason: "AI 主語: 「I [verb]」 は英語一人称主語の禁止 pattern",
  },

  // 英語: "my " / "me "  (= 所有格 / 目的格)
  {
    regex: /\b(?:my|me)\b/i,
    reason: "AI 主語: 「my / me」 は英語一人称所有 / 目的格の禁止 pattern",
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface NoAiSubjectViolation {
  /** 違反検出された copy 文字列 */
  readonly copy: string;
  /** 違反理由 */
  readonly reason: string;
}

/**
 * proposal copy 文字列が AI 主語 pattern を含むか runtime 検証。
 *
 * @returns violation 一覧。 空配列なら PASS。 同 copy で複数違反時は複数 entry。
 */
export function detectAiSubjectViolations(copy: string): NoAiSubjectViolation[] {
  const violations: NoAiSubjectViolation[] = [];
  for (const { regex, reason } of FORBIDDEN_AI_SUBJECT_PATTERNS) {
    if (regex.test(copy)) {
      violations.push({ copy, reason });
    }
  }
  return violations;
}

/**
 * 違反があれば throw (= test / dev assertion 用)。
 *
 * J-2 UI で runtime check に使用、 dev mode の warning として発火。
 */
export function assertNoAiSubject(copy: string): void {
  const violations = detectAiSubjectViolations(copy);
  if (violations.length > 0) {
    const messages = violations.map((v) => v.reason).join("; ");
    throw new Error(
      `[No-AI-Subject Lint] copy contains AI subject pattern: "${copy}" — ${messages}`,
    );
  }
}
