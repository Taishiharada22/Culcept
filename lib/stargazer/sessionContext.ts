import "server-only";

// ---------------------------------------------------------------------------
// Session Context — 3-layer context accumulator for Alter conversations
//
// Layer a: Session Explicit Facts  — user explicitly stated
// Layer b: Session Inferred Hypotheses — inferred from messages
// Layer c: Cross-session Memory — handled by existing system (not here)
// ---------------------------------------------------------------------------

// ---- Types ----------------------------------------------------------------

export type FactType = "explicit" | "inferred";

export type FactCategory =
  | "goal"
  | "experience"
  | "situation"
  | "need"
  | "preference"
  | "relationship"
  | "identity"
  | "emotion"
  | "value";

export interface SessionFact {
  type: FactType;
  category: FactCategory;
  content: string;
  source_turn: number;
}

export type DrillDownType = "example_request" | "reframe" | "narrowing";

export interface DrillDown {
  type: DrillDownType;
  parentFact: SessionFact;
  constraint: string;
}

// ---- Pattern Definitions --------------------------------------------------

interface PatternDef {
  category: FactCategory;
  type: FactType;
  patterns: RegExp[];
  contentTemplate: (match: RegExpMatchArray, raw: string) => string;
}

const EXPLICIT_PATTERNS: PatternDef[] = [
  // Goals
  {
    category: "goal",
    type: "explicit",
    patterns: [
      /起業(したい|を目指|しようと|する|考えて)/,
      /独立(したい|を目指|しようと|する|考えて)/,
      /転職(したい|を目指|しようと|する|考えて)/,
      /就職(したい|を目指|しようと|する|考えて)/,
      /留学(したい|を目指|しようと|する|考えて)/,
      /フリーランス(になりたい|を目指|しようと|になる|考えて)/,
      /(〜|～)?.*?(やりたい|なりたい|目指して|していきたい)/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Experience
  {
    category: "experience",
    type: "explicit",
    patterns: [
      /(開発|エンジニア|プログラミング|コーディング)(した|してる|してた|やってた|やってる|の経験|経験あり)/,
      /(営業|セールス)(した|してる|してた|やってた|やってる|の経験|経験あり)/,
      /(デザイン|UI|UX)(した|してる|してた|やってた|やってる|の経験|経験あり)/,
      /(マーケティング|広告|PR)(した|してる|してた|やってた|やってる|の経験|経験あり)/,
      /(教師|教員|先生|講師)(した|してる|してた|やってた|やってる|の経験|経験あり|をして)/,
      /(アプリ|サービス|プロダクト).*?(作った|開発した|リリースした|出した)/,
      /(\d+年|半年|数年).*?(やって|働いて|経験)/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Situation
  {
    category: "situation",
    type: "explicit",
    patterns: [
      /(1人|一人|ひとり)で(やって|開発|仕事|活動|進めて)/,
      /チームで(やって|開発|仕事|活動|進めて)/,
      /会社(に|で)(勤めて|働いて|所属)/,
      /フリーランス(で|として)(やって|働いて|活動)/,
      /学生(です|だ|やって|をして)/,
      /(大学|高校|専門学校|大学院)(に|で|を)(通って|在学|卒業)/,
      /(無職|休職|育休|産休|ニート)(です|だ|中|して)/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Need
  {
    category: "need",
    type: "explicit",
    patterns: [
      /(人|仲間|メンバー|パートナー|エンジニア|デザイナー)が(必要|欲しい|いない|足りない)/,
      /(助け|サポート|アドバイス)が(必要|欲しい|ほしい)/,
      /(資金|お金|投資|融資)が(必要|欲しい|ほしい|足りない)/,
      /(相談|話)を?(したい|聞いてほしい|聞いて欲しい)/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Preference
  {
    category: "preference",
    type: "explicit",
    patterns: [
      /(.{1,12})が(好き|大好き|すき)/,
      /(.{1,12})が(嫌い|きらい|苦手|にがて)/,
      /(.{1,12})が(得意|とくい|上手|うまい)/,
      /(.{1,12})が(苦手|にがて|下手|へた|できない)/,
      /(.{1,12})に(興味|関心)(がある|ある|持って)/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Relationship
  {
    category: "relationship",
    type: "explicit",
    patterns: [
      /(彼女|彼氏|恋人|パートナー|妻|夫|奥さん|旦那)(が|と|は|に|の)/,
      /(友人|友達|親友|知り合い)(が|と|は|に|の)/,
      /(上司|部下|同僚|先輩|後輩)(が|と|は|に|の)/,
      /(親|母|父|兄|姉|弟|妹|家族)(が|と|は|に|の)/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Identity
  {
    category: "identity",
    type: "explicit",
    patterns: [
      /MBTI.*?(INTJ|INTP|ENTJ|ENTP|INFJ|INFP|ENFJ|ENFP|ISTJ|ISFJ|ESTJ|ESFJ|ISTP|ISFP|ESTP|ESFP)/i,
      /(INTJ|INTP|ENTJ|ENTP|INFJ|INFP|ENFJ|ENFP|ISTJ|ISFJ|ESTJ|ESFJ|ISTP|ISFP|ESTP|ESFP)(です|だ|なんだ|タイプ)/i,
      /(\d{1,2})(歳|才)(です|だ|の|で)/,
      /(男|女|男性|女性|ノンバイナリー)(です|だ|の|で)/,
      /(エンジニア|デザイナー|営業|マーケター|経営者|学生|教師|医者|看護師|公務員)(です|だ|の|で|をして)/,
    ],
    contentTemplate: (m) => m[0],
  },
];

const INFERRED_PATTERNS: PatternDef[] = [
  // Emotion (inferred from tone)
  {
    category: "emotion",
    type: "inferred",
    patterns: [
      /(つらい|辛い|しんどい|きつい|疲れた|疲れて)/,
      /(嬉しい|うれしい|楽しい|たのしい|ワクワク|わくわく)/,
      /(不安|心配|怖い|こわい|焦って|焦り)/,
      /(迷って|悩んで|どうしたら|どうすれば)/,
      /(イライラ|怒り|ムカつく|腹が立つ)/,
      /(寂しい|さみしい|孤独|ひとりぼっち)/,
    ],
    contentTemplate: (m) => m[0],
  },
  // Value (inferred from expressions)
  {
    category: "value",
    type: "inferred",
    patterns: [
      /(大事|大切|重要)なの(は|が)/,
      /(自由|安定|成長|挑戦|貢献|創造).*?(したい|が好き|を求めて|重視)/,
      /(お金|年収|給料).*?(より|よりも|じゃなくて)/,
    ],
    contentTemplate: (m) => m[0],
  },
];

// ---- Drill-down patterns --------------------------------------------------

interface DrillDownPattern {
  type: DrillDownType;
  patterns: RegExp[];
  constraintExtractor: (match: RegExpMatchArray) => string;
}

const DRILLDOWN_PATTERNS: DrillDownPattern[] = [
  {
    type: "example_request",
    patterns: [
      /(有名人|芸能人|著名人|歴史上の人物|キャラクター)で(言うと|例えると|言えば)/,
      /例えば(誰|どんな人|どういう)/,
      /具体的に(は|言うと|教えて)/,
    ],
    constraintExtractor: (m) => m[0],
  },
  {
    type: "narrowing",
    patterns: [
      /(日本人|アメリカ人|海外|国内|東京|関西|アジア)だと/,
      /(男性|女性|男|女)だと/,
      /(\d{2}代)だと/,
      /(IT|医療|教育|金融|飲食).*?(だと|では|の場合)/,
    ],
    constraintExtractor: (m) => m[0],
  },
  {
    type: "reframe",
    patterns: [
      /(MBTI|エニアグラム|ストレングスファインダー|16Personalities|BigFive)で(言うと|言えば|分析すると)/,
      /(心理学|科学|データ|統計)的に(は|言うと|見ると)/,
      /(ビジネス|キャリア|恋愛|人間関係)の(観点|視点|面)で/,
    ],
    constraintExtractor: (m) => m[0],
  },
];

// ---- Extraction -----------------------------------------------------------

function normalizeContent(
  category: FactCategory,
  raw: string,
): string {
  // Light normalization — keep it close to original but clean up
  const trimmed = raw.replace(/\s+/g, "").trim();
  if (trimmed.length > 40) return trimmed.slice(0, 40) + "…";
  return trimmed;
}

export function extractSessionFacts(
  message: string,
  turnIndex: number = 0,
): SessionFact[] {
  const facts: SessionFact[] = [];
  const seen = new Set<string>();

  const allPatterns = [...EXPLICIT_PATTERNS, ...INFERRED_PATTERNS];

  for (const def of allPatterns) {
    for (const pattern of def.patterns) {
      const match = message.match(pattern);
      if (!match) continue;

      const rawContent = def.contentTemplate(match, message);
      const content = normalizeContent(def.category, rawContent);
      const key = `${def.category}:${content}`;

      if (seen.has(key)) continue;
      seen.add(key);

      facts.push({
        type: def.type,
        category: def.category,
        content,
        source_turn: turnIndex,
      });
    }
  }

  return facts;
}

// ---- Drill-down detection -------------------------------------------------

export function detectDrillDown(
  message: string,
  previousFacts: SessionFact[],
): DrillDown | null {
  if (previousFacts.length === 0) return null;

  for (const dd of DRILLDOWN_PATTERNS) {
    for (const pattern of dd.patterns) {
      const match = message.match(pattern);
      if (!match) continue;

      // Link to the most recent fact as parent
      const parentFact = previousFacts[previousFacts.length - 1];
      return {
        type: dd.type,
        parentFact,
        constraint: dd.constraintExtractor(match),
      };
    }
  }

  return null;
}

// ---- Accumulator ----------------------------------------------------------

export class SessionFactAccumulator {
  private facts: SessionFact[] = [];

  addTurn(message: string, turnIndex: number): void {
    const newFacts = extractSessionFacts(message, turnIndex);
    for (const fact of newFacts) {
      // Deduplicate by category + content
      const isDuplicate = this.facts.some(
        (f) => f.category === fact.category && f.content === fact.content,
      );
      if (!isDuplicate) {
        this.facts.push(fact);
      }
    }
  }

  getAllFacts(): SessionFact[] {
    return [...this.facts];
  }

  getExplicitFacts(): SessionFact[] {
    return this.facts.filter((f) => f.type === "explicit");
  }

  getInferredFacts(): SessionFact[] {
    return this.facts.filter((f) => f.type === "inferred");
  }

  buildPromptInjection(): string {
    const explicit = this.getExplicitFacts();
    const inferred = this.getInferredFacts();

    if (explicit.length === 0 && inferred.length === 0) return "";

    const lines: string[] = [];

    if (explicit.length > 0) {
      lines.push("# この会話で本人が明言した事実（常時参照可）");
      for (const f of explicit) {
        lines.push(`- ${f.content}`);
      }
    }

    if (inferred.length > 0) {
      if (lines.length > 0) lines.push("");
      lines.push("# この会話から推測される仮説（確定ではない）");
      for (const f of inferred) {
        lines.push(`- ${f.content}（推測）`);
      }
    }

    return lines.join("\n");
  }
}
