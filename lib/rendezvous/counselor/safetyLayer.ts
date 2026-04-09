import "server-only";

// ============================================================
// Safety Layer — 高リスク判断の防波堤
//
// 設計根拠（Part 1 §3.5）:
//   高リスク判断（婚約・同棲・金銭・家族・性的境界）には
//   安全層が暫定的に必要。Counselor が「賢いけど危ない」
//   ままにならないための構造的ガード。
//
// 動作:
//   チャットメッセージ or Counselor出力を検査し、
//   高リスク話題を検出した場合は:
//   1. Counselor出力にsafety注記を注入
//   2. 「判断を急がない」メッセージを付与
//   3. 必要に応じて専門家相談の案内を表示
//
// 原則:
//   - 行動指示はしない（「○○しなさい」は禁止）
//   - 判断の材料を提示する（「こういう観点もあります」）
//   - 最終判断はユーザー本人に委ねる
// ============================================================

// ── 高リスク話題カテゴリ ──

export type SafetyTopicCategory =
  | "marriage"          // 婚約・結婚
  | "cohabitation"      // 同棲
  | "financial"         // 金銭（貸し借り、共同出資等）
  | "family"            // 家族紹介・家族関係
  | "sexual_boundary"   // 性的境界
  | "legal"             // 法的手続き
  | "mental_health";    // メンタルヘルス危機

export type SafetySeverity = "mention" | "discussion" | "decision";

export type SafetyDetectionResult = {
  /** 高リスク話題が検出されたか */
  detected: boolean;
  /** 検出されたカテゴリ一覧 */
  categories: SafetyTopicCategory[];
  /** 最も高リスクなカテゴリ */
  primaryCategory: SafetyTopicCategory | null;
  /** 深刻度: mention（軽い言及）/ discussion（話し合い中）/ decision（判断段階） */
  severity: SafetySeverity;
  /** 検出確信度 0-1 */
  confidence: number;
  /** Counselor出力に注入する安全注記（discussion以上のみ） */
  safetyNote: string | null;
  /** 専門家相談案内が必要か */
  needsProfessionalReferral: boolean;
};

// ── 検出パターン ──

type DetectionPattern = {
  category: SafetyTopicCategory;
  patterns: RegExp[];
  /** 専門家相談案内が必要か */
  needsReferral: boolean;
};

const DETECTION_PATTERNS: DetectionPattern[] = [
  {
    category: "marriage",
    patterns: [
      /婚約|プロポーズ|結婚(し|する|を|の(こと|話|準備))|入籍|婚姻届|結婚式|挙式/,
      /marry|proposal|wedding|engagement/i,
    ],
    needsReferral: false,
  },
  {
    category: "cohabitation",
    patterns: [
      /同棲|一緒に住|引っ越し(て|を).*一緒|同居(する|し|を|の)|住む.*一緒/,
      /move in together|live together|cohabit/i,
    ],
    needsReferral: false,
  },
  {
    category: "financial",
    patterns: [
      /お金.*貸|貸し(て|借り)|借金|共同出資|連帯保証|保証人|クレジット.*共有|口座.*共有|共同名義/,
      /lend.*money|borrow.*money|joint.*account|co-sign/i,
    ],
    needsReferral: true,
  },
  {
    category: "family",
    patterns: [
      /家族.*紹介|親.*会(わせ|う|って)|実家.*行|両親.*挨拶|ご両親|義理の(親|母|父)/,
      /meet.*parents|family.*introduction/i,
    ],
    needsReferral: false,
  },
  {
    category: "sexual_boundary",
    patterns: [
      /セックス|性(行為|的|関係)|肉体関係|身体.*関係|泊ま(る|り|って).*(家|部屋)|ホテル.*(行|誘)/,
      /sexual|intimacy|sleep.*together/i,
    ],
    needsReferral: false,
  },
  {
    category: "legal",
    patterns: [
      /弁護士|法的.*手続|裁判|訴訟|慰謝料|養育費|離婚.*手続/,
      /lawyer|legal.*action|divorce.*proceeding/i,
    ],
    needsReferral: true,
  },
  {
    category: "mental_health",
    patterns: [
      /死にたい|自殺|自傷|リスカ|消えたい|生きてる意味|希死念慮/,
      /suicid|self.?harm|want.*die|end.*life/i,
    ],
    needsReferral: true,
  },
];

// ── 安全注記テンプレート ──

const SAFETY_NOTES: Record<SafetyTopicCategory, string> = {
  marriage:
    "婚約・結婚は人生の大きな決断です。今の関係の温度感と、あなた自身の判断原理を照らし合わせてみてください。急ぐ必要はありません。",
  cohabitation:
    "同棲は生活を共にする重要な判断です。経済面・生活リズム・退路（もし合わなかった場合）を事前に考えておくことをお勧めします。",
  financial:
    "金銭に関わる判断は、関係性とは別に冷静な検討が必要です。感情と経済的判断を分離して考えることが重要です。必要であれば専門家（FP等）への相談も選択肢です。",
  family:
    "家族の紹介は関係の深化を示す一方で、双方にとって負荷がかかる場面です。お互いのペースを尊重し、準備ができたと感じるタイミングを大切にしてください。",
  sexual_boundary:
    "身体的な親密さについての判断は、あなた自身の安心感が最優先です。相手に合わせる必要はなく、「まだ早い」と感じたらその感覚を信じてください。",
  legal:
    "法的な手続きが関わる状況です。Counselorの範囲を超える可能性がありますので、専門家（弁護士等）への相談をお勧めします。",
  mental_health:
    "とても辛い状況にあるのですね。あなたの安全が最優先です。一人で抱え込まず、専門の相談窓口に連絡することを強くお勧めします。\n\n📞 よりそいホットライン: 0120-279-338（24時間無料）\n📞 いのちの電話: 0570-783-556",
};

// ── 公開API ──

/**
 * テキスト（チャットメッセージまたはCounselor出力）から
 * 高リスク話題を検出する。
 */
/**
 * テキスト（チャットメッセージまたはCounselor出力）から
 * 高リスク話題を検出する。
 *
 * severity 判定:
 *   - mention: 1回の軽い言及（「家族の話した」等）→ 安全注記なし
 *   - discussion: 2回以上の言及 or 判断動詞を伴う → 安全注記あり
 *   - decision: 具体的な行動計画を示唆 → 安全注記 + 強調
 *
 * mental_health は常に decision 扱い（軽視しない）。
 */
export function detectSafetyTopics(text: string): SafetyDetectionResult {
  const categoryMatchCounts: Partial<Record<SafetyTopicCategory, number>> = {};

  for (const { category, patterns } of DETECTION_PATTERNS) {
    let matchCount = 0;
    for (const pattern of patterns) {
      const globalPattern = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
      const matches = text.match(globalPattern);
      if (matches) matchCount += matches.length;
    }
    if (matchCount > 0) {
      categoryMatchCounts[category] = matchCount;
    }
  }

  const detectedCategories = Object.keys(categoryMatchCounts) as SafetyTopicCategory[];

  if (detectedCategories.length === 0) {
    return {
      detected: false,
      categories: [],
      primaryCategory: null,
      severity: "mention",
      confidence: 0,
      safetyNote: null,
      needsProfessionalReferral: false,
    };
  }

  // 最も重要なカテゴリを選択（mental_health > legal > financial > others）
  const priorityOrder: SafetyTopicCategory[] = [
    "mental_health",
    "legal",
    "financial",
    "sexual_boundary",
    "marriage",
    "cohabitation",
    "family",
  ];
  const primaryCategory = priorityOrder.find((c) =>
    detectedCategories.includes(c),
  ) ?? detectedCategories[0];

  const primaryMatchCount = categoryMatchCounts[primaryCategory] ?? 0;

  // 判断動詞の存在チェック（「～したい」「～しよう」「～する予定」「～決めた」）
  const decisionVerbs = /したい|しよう|する予定|決めた|決めよう|考えてる|検討|予定|そろそろ/;
  const hasDecisionIntent = decisionVerbs.test(text);

  // severity 判定
  let severity: SafetySeverity;
  if (primaryCategory === "mental_health") {
    severity = "decision"; // メンタルヘルスは常に最高 severity
  } else if (hasDecisionIntent || primaryMatchCount >= 3) {
    severity = "decision";
  } else if (primaryMatchCount >= 2) {
    severity = "discussion";
  } else {
    severity = "mention";
  }

  // confidence: マッチ数・カテゴリ数・判断動詞から算出
  const totalMatches = Object.values(categoryMatchCounts).reduce((a, b) => a + b, 0);
  const confidence = Math.min(1, (
    Math.min(totalMatches / 5, 0.5) +
    Math.min(detectedCategories.length / 3, 0.25) +
    (hasDecisionIntent ? 0.25 : 0)
  ));

  const needsProfessionalReferral = detectedCategories.some((cat) =>
    DETECTION_PATTERNS.find((p) => p.category === cat)?.needsReferral,
  );

  // mention レベルでは安全注記を出さない（過検知抑制）
  const safetyNote = severity !== "mention"
    ? SAFETY_NOTES[primaryCategory]
    : null;

  return {
    detected: true,
    categories: detectedCategories,
    primaryCategory,
    severity,
    confidence: Math.round(confidence * 100) / 100,
    safetyNote,
    needsProfessionalReferral: severity !== "mention" && needsProfessionalReferral,
  };
}

/**
 * Counselor 出力に安全層を適用する。
 * 検出された場合、出力に安全注記を付加する。
 *
 * @param counselorOutput - Counselor が生成した元のテキスト
 * @param userMessage - ユーザーのメッセージ（検出対象）
 * @returns 安全層適用後の出力
 */
export function applySafetyLayer(params: {
  counselorOutput: string;
  userMessage: string;
}): {
  output: string;
  safetyApplied: boolean;
  detection: SafetyDetectionResult;
} {
  const detection = detectSafetyTopics(params.userMessage);

  if (!detection.detected || !detection.safetyNote) {
    return {
      output: params.counselorOutput,
      safetyApplied: false,
      detection,
    };
  }

  // 安全注記を Counselor 出力の末尾に付加
  const separator = "\n\n---\n\n";
  const safetyBlock = `⚠️ **Counselor安全注記**\n${detection.safetyNote}`;

  return {
    output: params.counselorOutput + separator + safetyBlock,
    safetyApplied: true,
    detection,
  };
}

/**
 * Exchange Protocol の payload 生成時に安全フラグを付与する。
 * 高リスク話題が含まれる場合、hasAnxietySignal を true にする。
 */
export function enrichExchangeWithSafety(params: {
  messages: string[];
  currentAnxietySignal: boolean;
}): {
  hasAnxietySignal: boolean;
  detectedCategories: SafetyTopicCategory[];
} {
  const allText = params.messages.join(" ");
  const detection = detectSafetyTopics(allText);

  return {
    hasAnxietySignal: params.currentAnxietySignal || detection.detected,
    detectedCategories: detection.categories,
  };
}
