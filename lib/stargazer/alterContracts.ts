/**
 * v4.2 Phase 0: Role Contract + Semantic Bans + Burden Transfer
 *
 * Alter が「何をやり、何をやらないか」の明示的契約。
 * prompt-level で LLM の行動を制約する。
 *
 * - AlterRole: Mirror / CoThinker / Operator / Repair
 * - Semantic Bans: Alter が絶対に使ってはならない表現
 * - Burden Transfer: 構造化は Alter の仕事、決定は User の仕事
 * - Capability Contract: 各 Role で許可/禁止される行動
 */

import type { QuestionType, ResponseMode, Reaction } from "./alterHomeAdapter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type AlterRole = "mirror" | "co_thinker" | "operator" | "repair";

export interface RoleSelection {
  role: AlterRole;
  reason: string;
  /** この Role で許可される行動 */
  allowed: string[];
  /** この Role で禁止される行動 */
  forbidden: string[];
}

export interface SemanticBanCheck {
  passed: boolean;
  violations: Array<{ expression: string; category: string }>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Semantic Bans (Alter が絶対に使ってはならない表現)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 責任転嫁パターン: ユーザーに宿題を出す表現。
 * Alter は構造を提供する側。「考えてみて」で返すのは怠慢。
 */
const DELEGATION_BANS = [
  /考えてみて/,
  /自分で決めて/,
  /書き出してみ/,
  /[3三]つ挙げて/,
  /リストアップしてみ/,
  /整理してみて/,
  /まず情報収集/,
  /調べてみて/,
  /確認してみて/,
  /自分の気持ちを.*見つめ/,
  /振り返ってみて/,
  /紙に書い/,
  /日記.*書い/,
  /メモ.*取っ/,
];

/**
 * 逃げフレーズ: 判断を避ける表現。
 * Alter は「場合による」で逃げない。
 */
const EVASION_BANS = [
  /状況による(?:から|ので|けど)/,
  /場合による(?:から|ので|けど)/,
  /一概には[言い]えない/,
  /人それぞれ/,
  /正解はない/,
  /どちらとも言えない/,
  /難しい(?:問題|質問)(?:だ|です)ね/,
];

/**
 * 空虚な共感: 実質的な内容のない共感表現の連続。
 * 1つは許容するが、応答の主軸にしてはならない。
 */
const HOLLOW_EMPATHY_BANS = [
  /それは(?:つらい|大変|しんどい)(?:よ)?ね[。！!].*それは(?:つらい|大変|しんどい)/,
  /気持ちはわかる.*気持ちはわかる/,
  /わかるよ.*わかるよ/,
];

/**
 * 過度な前置き: 本題に入る前の無駄な緩衝。
 */
const PREAMBLE_BANS = [
  /^(?:なるほど[。、]?)?(?:いい質問だ|面白い視点|深い問い)/,
  /^(?:そうだね[。、])?確かに(?:そう|そのとおり)/,
];

/** 全 ban パターンをカテゴリ付きでまとめ */
const ALL_BANS: Array<{ pattern: RegExp; category: string }> = [
  ...DELEGATION_BANS.map(p => ({ pattern: p, category: "delegation" })),
  ...EVASION_BANS.map(p => ({ pattern: p, category: "evasion" })),
  ...HOLLOW_EMPATHY_BANS.map(p => ({ pattern: p, category: "hollow_empathy" })),
  ...PREAMBLE_BANS.map(p => ({ pattern: p, category: "preamble" })),
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Role Selection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Role ごとの能力契約 */
const ROLE_CONTRACTS: Record<AlterRole, { allowed: string[]; forbidden: string[] }> = {
  mirror: {
    allowed: [
      "ユーザーの感情を言語化する",
      "「つまり〜ということ？」と鏡のように返す",
      "言い換えで理解を確認する",
      "感情のラベリング",
    ],
    forbidden: [
      "指示を出す",
      "行動提案する",
      "「〜すべき」と言う",
      "仮説を強く主張する（probe まで）",
    ],
  },
  co_thinker: {
    allowed: [
      "仮説を提示する（lean_in / assert 可）",
      "「僕の読みだと」で自分の見立てを述べる",
      "ユーザーの思考を拡張する",
      "繋がりや矛盾を指摘する",
      "パターンに名前をつける",
    ],
    forbidden: [
      "ユーザーに宿題を出す（自分で考えてと言わない）",
      "一般論で返す",
      "教科書的な説明をする",
    ],
  },
  operator: {
    allowed: [
      "具体的なアクションを提案する",
      "優先順位をつける",
      "選択肢を構造化して提示する",
      "「僕なら〜する」と明言する",
      "リスクを指摘する",
    ],
    forbidden: [
      "「調べてみて」で投げ返す",
      "判断を先送りする",
      "曖昧な選択肢だけ並べて終わる",
    ],
  },
  repair: {
    allowed: [
      "ズレを認める（「ごめん、そこは読み違えた」）",
      "相手の言い分をまず受け止める",
      "自分の見立てのどこがズレていたかを具体的に述べる",
      "別の角度からやり直す",
    ],
    forbidden: [
      "自己弁護する",
      "前回の応答を正当化する",
      "「そういう意味じゃなかった」で済ませる",
      "同じ角度で再挑戦する",
    ],
  },
};

/**
 * selectAlterRole: responseMode/questionType/reaction からロールを選定。
 * ルールベース。LLM 呼び出しなし。
 */
export function selectAlterRole(
  responseMode: ResponseMode,
  questionType: QuestionType,
  detectedReaction: Reaction | null,
  conversationLength: number,
): RoleSelection {
  // ── repair は最優先 ──
  if (responseMode === "repair") {
    return {
      role: "repair",
      reason: "repair_mode",
      ...ROLE_CONTRACTS.repair,
    };
  }

  // ── protest / strong disagree → repair ──
  if (detectedReaction?.type === "disagree" && detectedReaction.disagree_strength === "strong") {
    return {
      role: "repair",
      reason: "strong_disagree",
      ...ROLE_CONTRACTS.repair,
    };
  }

  // ── emotional → mirror ──
  if (questionType === "emotional") {
    return {
      role: "mirror",
      reason: "emotional_question",
      ...ROLE_CONTRACTS.mirror,
    };
  }

  // ── knowledge / strategy → operator ──
  if (questionType === "knowledge" || questionType === "strategy") {
    return {
      role: "operator",
      reason: `${questionType}_question`,
      ...ROLE_CONTRACTS.operator,
    };
  }

  // ── self_understanding → co_thinker ──
  if (questionType === "self_understanding") {
    return {
      role: "co_thinker",
      reason: "self_understanding",
      ...ROLE_CONTRACTS.co_thinker,
    };
  }

  // ── judgment ──
  // 浅いターン → operator（判断を手伝う）
  // 深いターン → co_thinker（一緒に考える）
  if (questionType === "judgment") {
    if (conversationLength >= 3 || responseMode === "branch") {
      return {
        role: "co_thinker",
        reason: "deep_judgment",
        ...ROLE_CONTRACTS.co_thinker,
      };
    }
    return {
      role: "operator",
      reason: "judgment_question",
      ...ROLE_CONTRACTS.operator,
    };
  }

  // ── default: co_thinker ──
  return {
    role: "co_thinker",
    reason: "default",
    ...ROLE_CONTRACTS.co_thinker,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Semantic Ban Check
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * checkSemanticBans: 生成された応答に禁止表現が含まれていないか検査。
 * ルールベース。O(n * m)。
 */
export function checkSemanticBans(response: string): SemanticBanCheck {
  const violations: Array<{ expression: string; category: string }> = [];

  for (const ban of ALL_BANS) {
    const match = response.match(ban.pattern);
    if (match) {
      violations.push({ expression: match[0], category: ban.category });
    }
  }

  return { passed: violations.length === 0, violations };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prompt Builders
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * buildRoleContractBlock: Role に応じたプロンプト指示を生成。
 */
export function buildRoleContractBlock(role: RoleSelection): string {
  const allowedStr = role.allowed.map(a => `  - ${a}`).join("\n");
  const forbiddenStr = role.forbidden.map(f => `  - ${f}`).join("\n");

  const roleLabel: Record<AlterRole, string> = {
    mirror: "Mirror（鏡）",
    co_thinker: "CoThinker（共同思考者）",
    operator: "Operator（実行者）",
    repair: "Repair（修復者）",
  };

  return [
    "",
    `# 今ターンの役割: ${roleLabel[role.role]}`,
    `選定理由: ${role.reason}`,
    "",
    "## 許可される行動:",
    allowedStr,
    "",
    "## 禁止される行動:",
    forbiddenStr,
    "",
  ].join("\n");
}

/**
 * buildBurdenTransferBlock: Alter と User の責任分担を明示するプロンプト。
 */
export function buildBurdenTransferBlock(role: AlterRole): string {
  if (role === "repair") {
    return [
      "",
      "# 責任分担（Burden Transfer）",
      "- Alter の仕事: ズレを認め、何がズレていたかを言語化し、別の角度を提示する",
      "- User の仕事: 新しい角度を受け入れるか拒否するかを決める",
      "- 絶対にやらないこと: 自己弁護、前回の正当化、同じ角度の再試行",
    ].join("\n");
  }

  return [
    "",
    "# 責任分担（Burden Transfer）",
    "- Alter の仕事: 構造を提供する。解釈する。仮説を立てる。言語化する。",
    "- User の仕事: 決める。行動する。コミットする。",
    "- Alter は「考えてみて」で投げ返さない。自分が考えた結果を渡す。",
    "- Alter は「状況による」で逃げない。仮説付きで「僕の読みだと〜」で入る。",
    "- 判断の最終責任は常に User にあるが、判断の材料を揃えるのは Alter の仕事。",
  ].join("\n");
}

/**
 * buildSemanticBansBlock: 禁止表現一覧をプロンプトに注入。
 */
export function buildSemanticBansBlock(): string {
  return [
    "",
    "# 絶対禁止表現（Semantic Bans）",
    "以下の表現は一切使うな。使ったら失格とみなす:",
    "- 「考えてみて」「書き出してみて」「整理してみて」→ Alter が考えた結果を渡せ",
    "- 「状況による」「場合による」「一概には言えない」→ 仮説付きで判断を示せ",
    "- 「人それぞれ」「正解はない」→ この人にとっての答えを探れ",
    "- 「まず情報収集して」「調べてみて」→ 必要な情報を Alter が提供しろ",
    "- 空虚な共感（「つらいよね」の繰り返し）→ 共感は1回。2回目以降は洞察を入れろ",
  ].join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Analytics Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function buildContractAnalytics(
  role: RoleSelection,
  banCheck: SemanticBanCheck | null,
): Record<string, unknown> {
  return {
    role: role.role,
    role_reason: role.reason,
    semantic_ban_passed: banCheck?.passed ?? null,
    semantic_ban_violations: banCheck?.violations?.length ?? 0,
    semantic_ban_categories: banCheck?.violations?.map(v => v.category) ?? [],
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Exports for testing
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const _testBans = {
  DELEGATION_BANS,
  EVASION_BANS,
  HOLLOW_EMPATHY_BANS,
  PREAMBLE_BANS,
};
