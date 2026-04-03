/**
 * v4.2 Phase E+F: Strategy Compliance Check + Rally Critic
 *
 * === Strategy Compliance Check ===
 * LLM が生成した応答が、計画された戦略に準拠しているかを検証。
 * 違反があれば correction prompt を生成し、1回の再生成を許可。
 *
 * === Rally Critic ===
 * ラリー（会話の連続ターン）が前進しているか評価。
 * 堂々巡り・浅い繰り返し・User の離脱兆候を検出。
 *
 * ルールベース。LLM 呼び出しなし。
 */

import type { AlterRole, RoleSelection } from "./alterContracts";
import type { WinningInterpretation, InterpretationLensId } from "./alterInterpretationArena";
import type { TurnSignal } from "./alterSignalReader";
import type { ClaimDecision, SharpBet } from "./alterThinSlice";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types: Strategy Compliance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ComplianceViolation =
  | "role_mismatch"          // Role Contract 違反
  | "claim_strength_wrong"   // Claim Strength 不一致
  | "semantic_ban_hit"       // 禁止表現使用
  | "bet_ignored"            // bet が無視された
  | "empty_response"         // 空応答
  | "too_long"               // 長すぎ
  | "too_short";             // 短すぎ

export interface ComplianceCheckResult {
  passed: boolean;
  violations: Array<{
    type: ComplianceViolation;
    detail: string;
    severity: "warning" | "critical";
  }>;
  /** 違反時の correction prompt（1回の再生成に使用） */
  correction_prompt: string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types: Rally Critic
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type RallyProgressionStatus =
  | "advancing"       // 会話が前進している
  | "stalling"        // 停滞している
  | "looping"         // 堂々巡り
  | "user_disengaging" // ユーザーが離脱しかけている
  | "deepening";      // 深掘りが進んでいる

export interface RallyCriticResult {
  status: RallyProgressionStatus;
  /** ラリー深度 0-1（0=浅い, 1=深い） */
  depth: number;
  /** ターン数 */
  turn_count: number;
  /** 同一テーマ継続ターン数 */
  same_theme_streak: number;
  /** 推奨アクション */
  recommendation: string;
  /** 堂々巡り検出 */
  loop_detected: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Strategy Compliance Check
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Role ごとの禁止パターン */
const ROLE_VIOLATION_PATTERNS: Record<AlterRole, RegExp[]> = {
  mirror: [
    /(?:すべき|したほうがいい|おすすめ|提案)/, // mirror は指示を出さない
  ],
  co_thinker: [
    /考えてみて[。！!？?]?$/,  // co_thinker は宿題を出さない
    /自分で.*決め/,
    /書き出してみ/,
  ],
  operator: [
    /状況による(?:から|ので)/,  // operator は曖昧な回答をしない
    /場合による(?:から|ので)/,
    /一概には/,
  ],
  repair: [
    /でも.*(?:正しかった|合ってた)/, // repair は自己弁護しない
    /そういう意味じゃなかった/,
  ],
};

/** Claim Strength の表現パターン */
const CLAIM_PATTERNS: Record<string, RegExp> = {
  assert: /(?:間違いなく|はっきり言うと|これは.*だと思う|確信.*持って)/,
  lean_in: /(?:僕の読みだと|たぶん|見た感じ|おそらく)/,
  probe: /(?:もしかして|〜じゃない[？?]|ひょっとして|ひとつ聞いていい)/,
};

/**
 * checkStrategyCompliance: LLM 応答が計画された戦略に準拠しているか検証。
 *
 * 検査項目:
 * 1. Role Contract 準拠
 * 2. Claim Strength 一致
 * 3. Bet 反映
 * 4. 応答長
 * 5. 空応答
 */
export function checkStrategyCompliance(
  response: string,
  roleSelection: RoleSelection | null,
  claim: ClaimDecision | null,
  bet: SharpBet | null,
  _arena: WinningInterpretation | null,
): ComplianceCheckResult {
  const violations: ComplianceCheckResult["violations"] = [];
  const trimmedResponse = response.trim();

  // ── 空応答チェック ──
  if (!trimmedResponse || trimmedResponse.length < 5) {
    violations.push({
      type: "empty_response",
      detail: "応答が空または極端に短い",
      severity: "critical",
    });
  }

  // ── 長さチェック ──
  if (trimmedResponse.length > 800) {
    violations.push({
      type: "too_long",
      detail: `応答が長すぎる（${trimmedResponse.length}文字）。300文字以内を推奨`,
      severity: "warning",
    });
  }
  if (trimmedResponse.length > 0 && trimmedResponse.length < 10) {
    violations.push({
      type: "too_short",
      detail: `応答が短すぎる（${trimmedResponse.length}文字）`,
      severity: "warning",
    });
  }

  // ── Role Contract 違反 ──
  if (roleSelection) {
    const patterns = ROLE_VIOLATION_PATTERNS[roleSelection.role];
    for (const p of patterns) {
      if (p.test(trimmedResponse)) {
        violations.push({
          type: "role_mismatch",
          detail: `Role "${roleSelection.role}" の禁止表現を使用: ${p.source}`,
          severity: "warning",
        });
        break; // 1つ見つかれば十分
      }
    }
  }

  // ── Claim Strength 不一致 ──
  if (claim && claim.strength !== "hold" && bet) {
    // assert なのに弱い表現しかない
    if (claim.strength === "assert") {
      const hasAssertiveLanguage = CLAIM_PATTERNS.assert!.test(trimmedResponse);
      const hasProbeLanguage = CLAIM_PATTERNS.probe!.test(trimmedResponse);
      if (!hasAssertiveLanguage && hasProbeLanguage) {
        violations.push({
          type: "claim_strength_wrong",
          detail: "assert で出すべきだが、probe 的な表現になっている",
          severity: "warning",
        });
      }
    }

    // probe なのに強い断定がある
    if (claim.strength === "probe") {
      const hasAssertiveLanguage = CLAIM_PATTERNS.assert!.test(trimmedResponse);
      if (hasAssertiveLanguage) {
        violations.push({
          type: "claim_strength_wrong",
          detail: "probe で出すべきだが、assert 的な表現になっている",
          severity: "warning",
        });
      }
    }
  }

  // ── Bet 反映 ──
  if (bet && claim && claim.strength !== "hold") {
    // bet のキーワード（先頭20文字）が応答に含まれているか
    const betKeyword = bet.bet.slice(0, 20);
    const betWords = betKeyword.split(/[、。\s]/).filter(w => w.length >= 3);
    const betReflected = betWords.some(w => trimmedResponse.includes(w));
    if (!betReflected && bet.confidence >= 0.4) {
      violations.push({
        type: "bet_ignored",
        detail: `bet「${bet.bet.slice(0, 50)}…」が応答に反映されていない`,
        severity: "warning",
      });
    }
  }

  // ── correction prompt 生成 ──
  let correctionPrompt: string | null = null;
  const criticalViolations = violations.filter(v => v.severity === "critical");
  const warningViolations = violations.filter(v => v.severity === "warning");

  if (criticalViolations.length > 0 || warningViolations.length >= 2) {
    const issues = violations.map(v => `- ${v.detail}`).join("\n");
    correctionPrompt = [
      "\n# 応答修正指示（Strategy Compliance）",
      "前回の応答に以下の問題がある。修正して再生成せよ:",
      issues,
      "",
      "修正ルール:",
      roleSelection ? `- Role は「${roleSelection.role}」。この Role の禁止行動を確認せよ。` : "",
      claim && claim.strength !== "hold" ? `- Claim Strength は「${claim.strength}」。${claim.phrase_guide}` : "",
      "- 300文字以内を推奨。",
    ].filter(Boolean).join("\n");
  }

  return {
    passed: violations.length === 0 || (criticalViolations.length === 0 && warningViolations.length < 2),
    violations,
    correction_prompt: correctionPrompt,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rally Critic
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 堂々巡り検出: ユーザーの発話の類似度を計算 */
function computeSimpleSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const aWords = new Set(a.match(/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]{2,}|[a-zA-Z]{3,}/gu) ?? []);
  const bWords = new Set(b.match(/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]{2,}|[a-zA-Z]{3,}/gu) ?? []);
  if (aWords.size === 0 || bWords.size === 0) return 0;

  let intersection = 0;
  for (const w of aWords) {
    if (bWords.has(w)) intersection++;
  }
  return (2 * intersection) / (aWords.size + bWords.size);
}

/**
 * assessRally: ラリーの前進度を評価。
 *
 * 評価項目:
 * 1. 堂々巡り検出（直近3ターンのユーザー発話の類似度）
 * 2. ユーザー離脱兆候（短文化、感嘆なし、単語返答）
 * 3. 深掘り進行度（ターン数 + 反応パターン）
 * 4. 同一テーマ継続度（Arena 結果の一貫性）
 */
export function assessRally(
  conversationHistory: { role: string; content: string }[],
  arenaHistory: InterpretationLensId[],
  _signal: TurnSignal | null,
): RallyCriticResult {
  const userTurns = conversationHistory.filter(m => m.role === "user");
  const turnCount = userTurns.length;

  // ── 堂々巡り検出 ──
  let loopDetected = false;
  if (userTurns.length >= 3) {
    const last3 = userTurns.slice(-3).map(t => t.content);
    const sim12 = computeSimpleSimilarity(last3[0] ?? "", last3[1] ?? "");
    const sim23 = computeSimpleSimilarity(last3[1] ?? "", last3[2] ?? "");
    if (sim12 > 0.5 && sim23 > 0.5) {
      loopDetected = true;
    }
  }

  // ── ユーザー離脱兆候 ──
  let disengaging = false;
  if (userTurns.length >= 2) {
    const lastTwo = userTurns.slice(-2).map(t => t.content);
    const shortening = lastTwo.every(t => t.length < 15);
    if (shortening) disengaging = true;
  }

  // ── 同一テーマ継続 ──
  let sameThemeStreak = 0;
  if (arenaHistory.length >= 2) {
    const lastLens = arenaHistory[arenaHistory.length - 1];
    for (let i = arenaHistory.length - 1; i >= 0; i--) {
      if (arenaHistory[i] === lastLens) sameThemeStreak++;
      else break;
    }
  }

  // ── 深度推定 ──
  let depth = Math.min(turnCount / 8, 1.0); // 8ターンで最大
  if (loopDetected) depth *= 0.5; // 堂々巡りなら深度半減
  if (disengaging) depth *= 0.7; // 離脱兆候なら減点

  // ── ステータス決定 ──
  let status: RallyProgressionStatus;
  if (loopDetected) {
    status = "looping";
  } else if (disengaging) {
    status = "user_disengaging";
  } else if (turnCount >= 4 && sameThemeStreak >= 3) {
    status = "stalling";
  } else if (turnCount >= 3 && depth > 0.5) {
    status = "deepening";
  } else {
    status = "advancing";
  }

  // ── 推奨アクション ──
  const recommendation = generateRecommendation(status, sameThemeStreak, turnCount);

  return {
    status,
    depth: Math.round(depth * 100) / 100,
    turn_count: turnCount,
    same_theme_streak: sameThemeStreak,
    recommendation,
    loop_detected: loopDetected,
  };
}

function generateRecommendation(
  status: RallyProgressionStatus,
  sameThemeStreak: number,
  _turnCount: number,
): string {
  switch (status) {
    case "looping":
      return "堂々巡りを検出。新しい角度から切り込むか、パターンを名指しせよ。";
    case "user_disengaging":
      return "ユーザーの関与が低下。短くインパクトのある1文で引き戻せ。";
    case "stalling":
      return `同一テーマが${sameThemeStreak}ターン継続。別の角度か具体的なアクションに移行せよ。`;
    case "deepening":
      return "深掘りが進んでいる。このペースを維持。核心に近づいたら言い切れ。";
    case "advancing":
      return "順調に前進。このまま継続。";
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rally Critic Prompt Block
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * buildRallyCriticBlock: Rally Critic の結果をプロンプトに注入。
 * stalling/looping/disengaging の場合のみ注入。
 */
export function buildRallyCriticBlock(critic: RallyCriticResult): string {
  if (critic.status === "advancing" || critic.status === "deepening") {
    return ""; // 順調なら注入不要
  }

  return [
    "",
    "# ラリー評価（Rally Critic）",
    `状態: ${critic.status}`,
    `推奨: ${critic.recommendation}`,
    critic.loop_detected ? "⚠ 堂々巡りが検出されている。同じ内容を繰り返すな。" : "",
    "",
  ].filter(Boolean).join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Analytics Builders
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function buildComplianceAnalytics(
  result: ComplianceCheckResult,
): Record<string, unknown> {
  return {
    compliance_passed: result.passed,
    violation_count: result.violations.length,
    violation_types: result.violations.map(v => v.type),
    critical_violations: result.violations.filter(v => v.severity === "critical").length,
    correction_needed: !!result.correction_prompt,
  };
}

export function buildRallyCriticAnalytics(
  result: RallyCriticResult,
): Record<string, unknown> {
  return {
    rally_status: result.status,
    rally_depth: result.depth,
    rally_turn_count: result.turn_count,
    rally_same_theme_streak: result.same_theme_streak,
    rally_loop_detected: result.loop_detected,
  };
}
