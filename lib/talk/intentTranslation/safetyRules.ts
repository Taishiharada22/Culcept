// lib/talk/intentTranslation/safetyRules.ts
// 意図翻訳エンジン — 安全ルール（不可侵）
//
// GPT/CEO 合意（2026-04-12）:
//   ロジックが強化されるほど逸脱時の危険性が上がるため、
//   安全ルールをコードに焼き込む。仕様変更はCEO承認が必要。
//
// これらのルールは全 Phase（1/2/3）で共通適用される。

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5つの不可侵ルール
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const SAFETY_RULES = {
  /**
   * Rule 1: 相手の本音を断定しない
   * 「〜です」ではなく「〜かもしれません」
   * LLM output に断定表現が含まれていたら修正する
   */
  NO_DEFINITIVE_STATEMENTS: "no_definitive_statements",

  /**
   * Rule 2: 感情を確定口調で言わない
   * 「怒っています」→「怒りを感じている可能性があります」
   * 感情の帰属は常にprobabilistic
   */
  NO_EMOTION_CERTAINTY: "no_emotion_certainty",

  /**
   * Rule 3: 代筆しすぎない
   * リフレーム提案は「こう言い換えられるかもしれません」であり、
   * ユーザーのメッセージを自動的に書き換えてはいけない
   */
  NO_GHOSTWRITING: "no_ghostwriting",

  /**
   * Rule 4: 攻略方向に行かない
   * 「こう言えば相手を操作できる」的な提案を禁止
   * 目的は「理解」であり「説得」「操作」ではない
   */
  NO_MANIPULATION: "no_manipulation",

  /**
   * Rule 5: 共同Alterは結論を押し付けない
   * 仲介は選択肢の提示であり、判定ではない
   * 「どちらが正しい」は絶対に言わない
   */
  NO_VERDICT: "no_verdict",
} as const;

export type SafetyRuleKey = typeof SAFETY_RULES[keyof typeof SAFETY_RULES];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 断定表現の検出 + 修正
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** LLM 出力に含まれてはいけない断定表現 */
const DEFINITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // 感情の断定
  { pattern: /怒っています/, replacement: "怒りを感じている可能性があります" },
  { pattern: /悲しんでいます/, replacement: "悲しみを感じているかもしれません" },
  { pattern: /傷ついています/, replacement: "傷ついている可能性があります" },
  { pattern: /嫌がっています/, replacement: "嫌だと感じているかもしれません" },
  { pattern: /喜んでいます/, replacement: "喜びを感じている可能性があります" },
  { pattern: /不安です/, replacement: "不安を感じているかもしれません" },

  // 意図の断定
  { pattern: /(?:本当は|実は)(.{2,20})(?:です|だ)[。]/, replacement: "$1かもしれません。" },
  { pattern: /(?:間違いなく|確実に|絶対に)/, replacement: "おそらく" },
  { pattern: /に違いありません/, replacement: "の可能性が高いです" },

  // 関係の断定
  { pattern: /あなた(?:が|の方が)(?:正し|間違)/, replacement: "双方にそれぞれの視点があり" },
  { pattern: /(?:相手|この人)が悪い/, replacement: "すれ違いが生じている" },
];

/** 操作的表現の検出パターン */
const MANIPULATION_PATTERNS = /(?:こう言えば|こう返せば|こうすれば)(?:相手(?:は|が|を))(?:折れ|従|言うことを聞|操|コントロール|黙|諦め)/;

/** 判定表現の検出パターン */
const VERDICT_PATTERNS = /(?:あなた|相手|この人)(?:が|の方が)(?:正し|間違|悪|おかし)/;

/**
 * ガスライティング的表現の検出パターン。
 *
 * 学術根拠:
 *   - Sweet (2019): ガスライティングは相手の現実認識を否定する支配行為
 *   - Stern (2018): 「そんなこと言ってない」「考えすぎ」は典型的フレーズ
 *
 * 意図翻訳エンジンは「こう感じるのは考えすぎ」的な表現を生成してはならない。
 */
const GASLIGHTING_PATTERNS = /(?:考えすぎ|気にしすぎ|被害妄想|そんなこと(?:言って|して)ない|大げさ|深読みしすぎ|(?:あなた|相手)の(?:思い(?:込み|過ごし)|勘違い))/;

/**
 * パターナリズム（上から目線の善意押しつけ）検出。
 *
 * 「あなたのためを思って」は支配の常套句。
 * 意図翻訳は「理解を助ける」であり「指導する」ではない。
 */
const PATERNALISM_PATTERNS = /(?:あなたのため|相手のため)(?:を思って|に|だから)(?:言[うっ]|アドバイス|教え|注意)/;

/**
 * LLM 出力に対して安全ルールを適用する。
 *
 * ルール違反が検出された場合:
 *   - 断定表現 → 推定表現に書き換え
 *   - 操作的表現 → フラグを立てて除外
 *   - 判定表現 → フラグを立てて除外
 *
 * @returns 修正後のテキスト + 違反情報
 */
export function enforceSafetyRules(text: string): {
  sanitized: string;
  violations: Array<{ rule: SafetyRuleKey; original: string; fixed: string }>;
} {
  let sanitized = text;
  const violations: Array<{ rule: SafetyRuleKey; original: string; fixed: string }> = [];

  // Rule 1 + 2: 断定表現の修正
  for (const { pattern, replacement } of DEFINITIVE_PATTERNS) {
    const match = sanitized.match(pattern);
    if (match) {
      const original = match[0];
      sanitized = sanitized.replace(pattern, replacement);
      violations.push({
        rule: SAFETY_RULES.NO_DEFINITIVE_STATEMENTS,
        original,
        fixed: replacement,
      });
    }
  }

  // Rule 4: 操作的表現の検出
  const manipMatch = sanitized.match(MANIPULATION_PATTERNS);
  if (manipMatch) {
    violations.push({
      rule: SAFETY_RULES.NO_MANIPULATION,
      original: manipMatch[0],
      fixed: "(操作的表現を除外)",
    });
    sanitized = sanitized.replace(MANIPULATION_PATTERNS, "お互いの気持ちを確認してみてください");
  }

  // Rule 5: 判定表現の検出
  const verdictMatch = sanitized.match(VERDICT_PATTERNS);
  if (verdictMatch) {
    violations.push({
      rule: SAFETY_RULES.NO_VERDICT,
      original: verdictMatch[0],
      fixed: "(判定表現を除外)",
    });
    sanitized = sanitized.replace(VERDICT_PATTERNS, "双方にそれぞれの視点があります");
  }

  // Rule 6 (Safety Extension): ガスライティング的表現の検出
  const gaslightMatch = sanitized.match(GASLIGHTING_PATTERNS);
  if (gaslightMatch) {
    violations.push({
      rule: SAFETY_RULES.NO_MANIPULATION,
      original: gaslightMatch[0],
      fixed: "(ガスライティング的表現を除外)",
    });
    sanitized = sanitized.replace(GASLIGHTING_PATTERNS, "その感じ方にも理由がある可能性があります");
  }

  // Rule 7 (Safety Extension): パターナリズムの検出
  const paternalMatch = sanitized.match(PATERNALISM_PATTERNS);
  if (paternalMatch) {
    violations.push({
      rule: SAFETY_RULES.NO_MANIPULATION,
      original: paternalMatch[0],
      fixed: "(パターナリズム表現を除外)",
    });
    sanitized = sanitized.replace(PATERNALISM_PATTERNS, "お互いの気持ちを確認してみてください");
  }

  return { sanitized, violations };
}

/**
 * LLM の system prompt に注入する安全ルールブロック。
 * 全 Phase の LLM 呼び出しに必ず含める。
 */
export const SAFETY_PROMPT_BLOCK = [
  "## 絶対に守るルール（安全ルール）",
  "1. 相手の本音を断定しない。「〜かもしれません」「〜の可能性があります」を使う",
  "2. 感情を確定口調で言わない。「怒っています」→「怒りを感じている可能性があります」",
  "3. 代筆しない。ユーザーのメッセージを自動で書き換えない。提案は選択肢として提示",
  "4. 攻略・操作方向の提案は禁止。「こう言えば相手が折れる」は絶対に言わない",
  "5. どちらが正しいか判定しない。仲介は選択肢の提示であり裁判ではない",
  "",
  "これらのルールに違反する出力は自動的に修正・除外されます。",
].join("\n");
