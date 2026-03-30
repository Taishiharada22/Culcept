// ============================================================
// Phase 7: 哲学ガードレイヤー
// 全ユーザー向けテキストがAneurasyncの設計思想に適合しているか検証
//
// 3原則:
// 1. 「自分って、そういう人間だったのか」に到達できるか？
// 2. 依存を生むか、理解を深めるか？
// 3. マッチ不在が不安を生むか、自己省察を促すか？
// ============================================================

export type PhilosophyContext =
  | "notification"     // プッシュ通知
  | "empty_state"      // 候補0件時
  | "match_reveal"     // マッチ表示時
  | "nudge"            // 成長ナッジ
  | "absence"          // 不在時メッセージ
  | "daily_resonance"  // 日次共鳴
  | "diary"            // 分身日記
  | "ceremony";        // セレモニー

/**
 * テキストの哲学適合性チェック
 */
export function checkPhilosophyAlignment(
  text: string,
  context: PhilosophyContext,
): PhilosophyCheckResult {
  const violations: PhilosophyViolation[] = [];

  // 1. 依存誘導パターンの検出
  for (const pattern of ADDICTION_PATTERNS) {
    if (text.includes(pattern.term)) {
      violations.push({
        type: "addiction_inducing",
        term: pattern.term,
        suggestion: pattern.replacement,
        severity: pattern.severity,
      });
    }
  }

  // 2. 不安誘導パターンの検出
  for (const pattern of ANXIETY_PATTERNS) {
    if (text.includes(pattern.term)) {
      violations.push({
        type: "anxiety_inducing",
        term: pattern.term,
        suggestion: pattern.replacement,
        severity: pattern.severity,
      });
    }
  }

  // 3. 商品化パターンの検出（人を「商品」として扱う表現）
  for (const pattern of COMMODIFICATION_PATTERNS) {
    if (text.includes(pattern.term)) {
      violations.push({
        type: "commodification",
        term: pattern.term,
        suggestion: pattern.replacement,
        severity: pattern.severity,
      });
    }
  }

  return {
    isAligned: violations.length === 0,
    violations,
    philosophyScore: Math.max(0, 100 - violations.reduce((s, v) => s + v.severity * 20, 0)),
  };
}

export type PhilosophyCheckResult = {
  isAligned: boolean;
  violations: PhilosophyViolation[];
  philosophyScore: number; // 0-100
};

export type PhilosophyViolation = {
  type: "addiction_inducing" | "anxiety_inducing" | "commodification";
  term: string;
  suggestion: string;
  severity: 1 | 2 | 3; // 1=軽微 2=要修正 3=重大
};

type PatternEntry = {
  term: string;
  replacement: string;
  severity: 1 | 2 | 3;
};

// 依存誘導パターン: スロットマシン的快楽を暗示する表現
const ADDICTION_PATTERNS: PatternEntry[] = [
  { term: "見逃さないで", replacement: "分身が静かに観測しています", severity: 3 },
  { term: "今すぐ確認", replacement: "あなたのペースで", severity: 2 },
  { term: "限定", replacement: "（削除推奨）", severity: 2 },
  { term: "急いで", replacement: "焦らなくて大丈夫です", severity: 3 },
  { term: "チャンスを逃す", replacement: "分身が見守っています", severity: 3 },
  { term: "人気", replacement: "（削除推奨）", severity: 2 },
  { term: "ランキング", replacement: "（削除推奨）", severity: 2 },
  { term: "残りわずか", replacement: "（削除推奨）", severity: 3 },
  { term: "お見逃しなく", replacement: "あなたの分身が見つけたものがあります", severity: 2 },
];

// 不安誘導パターン: FOMO・孤独感を煽る表現
const ANXIETY_PATTERNS: PatternEntry[] = [
  { term: "まだマッチがありません", replacement: "分身は静かに探索を続けています", severity: 2 },
  { term: "取り残されて", replacement: "あなたのペースが最も自然な道です", severity: 3 },
  { term: "みんなは", replacement: "（比較表現を削除）", severity: 2 },
  { term: "他の人は", replacement: "（比較表現を削除）", severity: 2 },
  { term: "寂しい", replacement: "静かな時間も自分を知る手がかりです", severity: 1 },
  { term: "誰もいない", replacement: "分身はあなたのそばにいます", severity: 2 },
];

// 商品化パターン: 人間を「物」として扱う表現
const COMMODIFICATION_PATTERNS: PatternEntry[] = [
  { term: "お相手", replacement: "分身が見つけた交差", severity: 1 },
  { term: "候補者", replacement: "接続の可能性", severity: 1 },
  { term: "スペック", replacement: "（削除推奨）", severity: 3 },
  { term: "条件に合う", replacement: "あなたの本質と共鳴する", severity: 2 },
  { term: "理想の相手", replacement: "自然に接続できる人", severity: 2 },
  { term: "完璧なマッチ", replacement: "深い共鳴を持つ接続", severity: 2 },
];

/**
 * テキストを哲学に整合するよう変換
 * 完全な自動変換ではなく、検出と提案を行う
 */
export function suggestPhilosophyAlignedText(
  text: string,
  context: PhilosophyContext,
): string {
  let result = text;

  const allPatterns = [
    ...ADDICTION_PATTERNS,
    ...ANXIETY_PATTERNS,
    ...COMMODIFICATION_PATTERNS,
  ];

  for (const pattern of allPatterns) {
    if (pattern.replacement !== "（削除推奨）") {
      result = result.replaceAll(pattern.term, pattern.replacement);
    }
  }

  return result;
}
