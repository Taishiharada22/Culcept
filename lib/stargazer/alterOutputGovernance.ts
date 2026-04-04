/**
 * Alter Output Governance Layer
 *
 * 「出力ガバナンス層」— Alterの設計思想を表層出力で逆転不能にするための層。
 *
 * 3つの中核メカニズム:
 *   RC1: 動的会話制約レジストリ（NGワード・修正指示の伝播）
 *   RC5: フラストレーション累積検出器（信頼崩壊の早期修復）
 *   評価: constraint_violation_rate / direct_answer_first_sentence_rate / repair_recovery_rate
 *
 * 設計原則:
 *   - 全関数はルールベース（LLM呼び出しなし）
 *   - fail-open: 解析失敗時は空/デフォルトを返す（既存パイプラインを壊さない）
 *   - 計算量 O(n) — 会話ターン数に線形
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RC1: 動的会話制約レジストリ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface UserBan {
  /** 禁止された語・表現 */
  expression: string;
  /** 検出されたターン番号 */
  turn: number;
  /** ユーザーの元発言（デバッグ用） */
  source_message: string;
}

/**
 * 会話履歴からユーザーが明示的に禁止した表現を抽出する。
 *
 * 検出パターン:
 *   - 「〜使うな」「〜言うな」「〜やめて」
 *   - 「〜NGワード」「〜禁止」
 *   - 「〜使わないで」「〜言わないで」
 *   - 「〜って言葉は嫌」「〜って表現は良くない」
 *
 * 禁止対象の抽出:
 *   直前に「」で括られた語、または助詞「って/という/は」の直前の語句を取得。
 */
export function extractUserBans(
  history: Array<{ role: string; content: string }>,
): UserBan[] {
  const bans: UserBan[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < history.length; i++) {
    const msg = history[i];
    if (msg.role !== "user") continue;

    const content = msg.content;

    // パターン1: 「X」を使うな / 「X」って言葉は使うな
    const quoted = Array.from(content.matchAll(/[「『"](.*?)[」』"]\s*(?:って(?:いう)?\s*(?:言葉|ワード|表現)\s*(?:は|を)\s*)?(?:を|は)?(?:使[うわ]な|言[うわ]な|やめて|禁止|NG)/g));
    for (const m of quoted) {
      const expr = m[1].trim();
      if (expr && !seen.has(expr)) {
        seen.add(expr);
        bans.push({ expression: expr, turn: i, source_message: content });
      }
    }

    // パターン2: Xって/という/は + (いう)? + ワード/言葉/表現 + 使うな/良くない/嫌/NG/やめて/禁止
    // 「霧っていう表現は良くない」「霧という言葉は使うな」両方に対応
    const patterns = [
      /(.{1,20}?)(?:っていう|という|って|は)\s*(?:ワード|言葉|表現)\s*(?:は)?\s*(?:使[うわ]な|良くない|よくない|嫌[だ。！!]?|NG|やめて|禁止|使わないで)/g,
      /(.{1,20}?)(?:っていう|という|って|は)\s*(?:表現|ワード|言葉)\s*(?:は)?\s*(?:あまりに?|かなり)?\s*(?:良くない|よくない)/g,
    ];
    for (const pat of patterns) {
      const matches = Array.from(content.matchAll(pat));
      for (const m of matches) {
        // 先頭の「もう」「いえ、」等を除去（複数回適用）
        let expr = m[1].replace(/^(?:いえ、?\s*|いや、?\s*|もう\s*)+/, "").trim();
        // 「霧っていう」→「霧」に正規化
        expr = expr.replace(/っていう$|という$/, "").trim();
        if (expr && expr.length >= 1 && !seen.has(expr)) {
          seen.add(expr);
          bans.push({ expression: expr, turn: i, source_message: content });
        }
      }
    }

    // パターン3: Xを使わないでほしい / Xという言葉は使わないでほしい
    const directBan = Array.from(content.matchAll(/(.{1,30}?)(?:を|は)\s*(?:使わないで|言わないで|使うな|言うな)(?:ほしい|欲しい|くれ)?/g));
    for (const m of directBan) {
      let expr = m[1].trim();
      // 「霧という言葉」→「霧」、「霧っていう表現」→「霧」、「霧って言葉」→「霧」に正規化
      expr = expr.replace(/(?:っていう|という|って)\s*(?:言葉|ワード|表現)$/, "").trim();
      expr = expr.replace(/っていう$|という$|って$/, "").trim();
      // 先頭の「もう」「いえ、」「いや、」等を除去（suffix除去後に実行、複数回適用）
      expr = expr.replace(/^(?:いえ、?\s*|いや、?\s*|もう\s*)+/, "").trim();
      if (expr && expr.length >= 1 && !seen.has(expr)) {
        seen.add(expr);
        bans.push({ expression: expr, turn: i, source_message: content });
      }
    }

    // パターン4: Xって言葉を使うなって言ってんじゃないか (怒りパターン)
    const angerBan = Array.from(content.matchAll(/(.{1,20}?)(?:って|という)\s*(?:言葉|ワード|表現)\s*(?:を)?\s*使うな(?:って|と)/g));
    for (const m of angerBan) {
      let expr = m[1].trim();
      // 「霧って言葉」→「霧」に正規化
      expr = expr.replace(/(?:って|という)\s*(?:言葉|ワード|表現)$/, "").trim();
      if (expr && expr.length >= 1 && !seen.has(expr)) {
        seen.add(expr);
        bans.push({ expression: expr, turn: i, source_message: content });
      }
    }
  }

  return bans;
}

/**
 * 生成された応答がユーザー禁止表現を含んでいないかチェック。
 * 含んでいた場合、違反箇所と修正指示を返す。
 */
export interface UserBanViolation {
  passed: boolean;
  violations: Array<{
    expression: string;
    /** 応答テキスト中で見つかった位置 */
    found_at: number;
  }>;
  /** 再生成プロンプトに追加する修正指示 */
  correction_prompt: string;
}

export function checkUserBans(
  response: string,
  bans: UserBan[],
): UserBanViolation {
  if (bans.length === 0) return { passed: true, violations: [], correction_prompt: "" };

  const violations: UserBanViolation["violations"] = [];
  for (const ban of bans) {
    const idx = response.indexOf(ban.expression);
    if (idx >= 0) {
      violations.push({ expression: ban.expression, found_at: idx });
    }
  }

  if (violations.length === 0) return { passed: true, violations: [], correction_prompt: "" };

  const correction = [
    "## ユーザー禁止表現（最上位制約 — 違反は即失格）",
    "以下の表現はユーザーが明示的に禁止した。絶対に使うな:",
    ...violations.map(v => `- 「${v.expression}」`),
    "",
    "これらの語は比喩・引用・否定文中でも使用禁止。",
    "別の表現に完全に置き換えること。",
  ].join("\n");

  return { passed: false, violations, correction_prompt: correction };
}

/**
 * ユーザー禁止表現をsystem promptに注入するブロックを生成する。
 */
export function buildUserBansPromptBlock(bans: UserBan[]): string {
  if (bans.length === 0) return "";
  return [
    "",
    "# ユーザー禁止表現（最上位制約 — 全てのルールに優先）",
    "ユーザーが会話中に以下の表現を禁止した。いかなる文脈でも使用してはならない:",
    ...bans.map(b => `- 「${b.expression}」（ターン${b.turn + 1}で禁止指定）`),
    "",
    "比喩・引用・否定文（「〜ではない」）中でも禁止。完全に別の表現を使え。",
    "この制約は他の全ての指示に優先する。",
  ].join("\n");
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RC5: フラストレーション累積検出器
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface FrustrationState {
  /** 0-5 のレベル。3以上でrepair強制 */
  level: number;
  /** 何が怒りの原因か */
  triggers: string[];
  /** まだ応えていないユーザー要求 */
  unresolved_requests: string[];
  /** 同じ訂正が繰り返された回数 */
  repeated_correction_count: number;
}

/** フラストレーション信号パターン */
const FRUSTRATION_SIGNALS = {
  // Level 1: やんわりした不満
  mild: [
    /ちょっと違う/,
    /あまり.*良くない/,
    /しっくりこない/,
    /ピンとこない/,
    /うーん/,
  ],
  // Level 2: 明確な不満
  clear: [
    /使わないで/,
    /やめて/,
    /言わないで/,
    /違うって/,
    /そうじゃない/,
    /そういうことじゃない/,
    /聞いてる.*違/,
  ],
  // Level 3: 怒り
  angry: [
    /言[っう]て[るん]じゃないか/,
    /何回.*言[えわ]/,
    /逃げ/,
    /寄り添.*ない/,
    /投げ.*すぎ/,
    /全[然く].*[でじゃ]ない/,
    /早く.*[答こた]え/,
    /いい加減/,
  ],
  // Level 4: 信頼崩壊
  trust_break: [
    /もういい/,
    /話にならない/,
    /使えない/,
    /ダメだ/,
    /意味.*ない/,
    /無理/,
  ],
};

/** ユーザーの未回答要求を検出するパターン */
const REQUEST_PATTERNS = [
  { pattern: /具体的に(?:教えて|話して|言って|して)/, label: "具体的な回答を求めている" },
  { pattern: /(?:何|どう|どんな|どれ|どっち).*(?:合[っう]て|向いて|いい)/, label: "自分に合うものを知りたい" },
  { pattern: /面接.*(?:長所|強み|自己PR)/, label: "面接用の回答が欲しい" },
  { pattern: /(?:起業|転職|就職).*(?:向いて|合って|いい)/, label: "キャリア判断を求めている" },
  { pattern: /導いて|アドバイス|助言/, label: "具体的な導きを求めている" },
  { pattern: /寄り添[っい]/, label: "寄り添った応答を求めている" },
];

/**
 * 会話履歴全体からフラストレーション状態を算定する。
 *
 * 仕組み:
 *   1. 各ユーザー発言のフラストレーション信号を検出
 *   2. 信号レベルに応じてスコアを加算（時間減衰あり）
 *   3. 同じ訂正の繰り返しを検出（例: 「霧」を3回NGにした）
 *   4. ユーザーの要求のうち、Alterが応えていないものを特定
 */
export function assessFrustration(
  history: Array<{ role: string; content: string }>,
  currentMessage: string,
): FrustrationState {
  const triggers: string[] = [];
  const unresolvedRequests: string[] = [];
  let score = 0;
  let repeatedCorrectionCount = 0;

  // 訂正パターンの重複検出用
  const correctionTopics = new Map<string, number>();

  const allMessages = [...history, { role: "user", content: currentMessage }];

  for (let i = 0; i < allMessages.length; i++) {
    const msg = allMessages[i];
    if (msg.role !== "user") continue;

    const content = msg.content;
    // 新しいメッセージほど重み大（古い不満は減衰）
    const recency = 1.0 + (i / allMessages.length) * 0.5;

    // フラストレーション信号
    for (const [level, patterns] of Object.entries(FRUSTRATION_SIGNALS)) {
      for (const pat of patterns) {
        if (pat.test(content)) {
          const weight = level === "mild" ? 0.5 : level === "clear" ? 1.0 : level === "angry" ? 2.0 : 3.0;
          score += weight * recency;
          if (level === "angry" || level === "trust_break") {
            triggers.push(content.slice(0, 60));
          }
          break; // 同一レベル内で最初のマッチのみ
        }
      }
    }

    // 訂正の繰り返し検出: 同じ話題での訂正が2回以上
    // 広めにキャッチ: 「X使うな」だけでなく「Xは良くない」「Xやめて」「Xワード使った」も
    const correctionPatterns = [
      /(.{1,10}?)(?:っていう|という|って|は|を).*(?:使うな|言うな|やめて|禁止|使わないで|言わないで|NG)/,
      /(.{1,10}?)(?:っていう|という|って|は).*(?:表現|ワード|言葉).*(?:良くない|よくない|嫌|NG)/,
      /(.{1,10}?)(?:っていう|という|って).*(?:ワード|言葉|表現).*使[っうわ]/,
    ];
    for (const pat of correctionPatterns) {
      const correctionMatch = content.match(pat);
      if (correctionMatch) {
        let topic = correctionMatch[1].replace(/^(?:もう|また|いえ、?\s*|いや、?\s*)/, "").trim();
        topic = topic.replace(/っていう$|という$|って$/, "").trim();
        if (topic.length >= 1) {
          const count = (correctionTopics.get(topic) ?? 0) + 1;
          correctionTopics.set(topic, count);
          if (count >= 2) {
            repeatedCorrectionCount = Math.max(repeatedCorrectionCount, count);
            score += count;
          }
          break; // 1メッセージにつき1回だけカウント
        }
      }
    }
  }

  // 未回答要求の特定: ユーザーが求めたもののうち、Alterが応えていないもの
  const userMessages = allMessages.filter(m => m.role === "user");
  const alterMessages = allMessages.filter(m => m.role !== "user");
  const recentUserMsgs = userMessages.slice(-5); // 直近5発言

  for (const msg of recentUserMsgs) {
    for (const { pattern, label } of REQUEST_PATTERNS) {
      if (pattern.test(msg.content)) {
        // Alterの直後の応答に具体的な回答があるかチェック
        const msgIdx = allMessages.indexOf(msg);
        const nextAlter = allMessages.slice(msgIdx + 1).find(m => m.role !== "user");
        if (nextAlter) {
          // 回答が質問返し・情報収集提案・深掘り提案で終わっている場合は未解決
          if (/考えてみ|情報.*集め|整理して|書き出し|深掘り|まず.*確認|記録して|問いかけて/.test(nextAlter.content)) {
            if (!unresolvedRequests.includes(label)) {
              unresolvedRequests.push(label);
            }
          }
        } else {
          // Alterの応答がまだない = currentMessage内の要求
          if (!unresolvedRequests.includes(label)) {
            unresolvedRequests.push(label);
          }
        }
      }
    }
  }

  // スコアをレベルに変換 (0-5)
  let level: number;
  if (score <= 0.5) level = 0;
  else if (score <= 1.5) level = 1;
  else if (score <= 3.0) level = 2;
  else if (score <= 5.0) level = 3;
  else if (score <= 8.0) level = 4;
  else level = 5;

  // 繰り返し訂正があればレベルを最低3に引き上げ
  if (repeatedCorrectionCount >= 2 && level < 3) {
    level = 3;
  }

  return {
    level,
    triggers,
    unresolved_requests: unresolvedRequests,
    repeated_correction_count: repeatedCorrectionCount,
  };
}

/**
 * フラストレーション状態に基づくプロンプト注入ブロックを生成する。
 */
export function buildFrustrationPromptBlock(state: FrustrationState): string {
  if (state.level < 2) return "";

  const parts: string[] = [
    "",
    `# ⚠ ユーザーフラストレーション: レベル ${state.level}/5`,
  ];

  if (state.level >= 3) {
    parts.push("**信頼回復が最優先。分析・深掘り・仮説提示は全て中断せよ。**");
    parts.push("");
    parts.push("## 修復プロトコル:");
    parts.push("1. まずズレを認める（1文以内）");
    parts.push("2. ユーザーが求めていることに直接答える（次の文で）");
    parts.push("3. 心理分析・比喩・解釈は一切使わない");
    parts.push("4. 同じ失敗を繰り返すな");
  }

  if (state.unresolved_requests.length > 0) {
    parts.push("");
    parts.push("## 未回答のユーザー要求（今すぐ応えること）:");
    for (const req of state.unresolved_requests) {
      parts.push(`- ${req}`);
    }
  }

  if (state.triggers.length > 0) {
    parts.push("");
    parts.push("## フラストレーションの原因:");
    for (const t of state.triggers.slice(-3)) {
      parts.push(`- 「${t}」`);
    }
  }

  if (state.repeated_correction_count >= 2) {
    parts.push("");
    parts.push(`**同じ訂正が${state.repeated_correction_count}回繰り返されている。これ以上の違反は絶対に許されない。**`);
  }

  return parts.join("\n");
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 評価指標
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface GovernanceMetrics {
  /** ユーザー禁止表現の違反率 (0.0 = 違反なし) */
  constraint_violation_rate: number;
  /** conclude/strategy応答で1文目が具体的結論で始まっている率 */
  direct_answer_first_sentence_rate: number;
  /** repair mode後にユーザーが改善反応を示した率 */
  repair_recovery_rate: number;
}

/**
 * 会話ログからガバナンス指標を算出する。
 * リプレイテスト用。実際の会話中ではなく、事後分析で使う。
 */
export function computeGovernanceMetrics(
  history: Array<{ role: string; content: string }>,
  bans: UserBan[],
): GovernanceMetrics {
  let banCheckCount = 0;
  let banViolationCount = 0;
  let concludeCount = 0;
  let directAnswerCount = 0;
  let repairCount = 0;
  let repairRecoveryCount = 0;

  // 宿題・逃げパターン（1文目に出てはいけない）
  const evasionFirstSentence = /^(?:まず|情報.*集め|考えてみ|整理して|書き出し|確認して|本当に知りたいのは|もしかして|ごめん)/;

  for (let i = 0; i < history.length; i++) {
    const msg = history[i];
    if (msg.role === "user") continue; // Alter応答のみ

    // Ban violation check
    if (bans.length > 0) {
      banCheckCount++;
      for (const ban of bans) {
        // この禁止が設定されたターン以降のみチェック
        if (i > ban.turn && msg.content.includes(ban.expression)) {
          banViolationCount++;
          break;
        }
      }
    }

    // Direct answer first sentence check
    // 直前のユーザーメッセージが具体的な質問かどうか
    const prevUser = i > 0 ? history[i - 1] : null;
    if (prevUser?.role === "user") {
      const isConcreteQuestion = REQUEST_PATTERNS.some(p => p.pattern.test(prevUser.content));
      if (isConcreteQuestion) {
        concludeCount++;
        const firstSentence = msg.content.split(/[。！!？?\n]/)[0] || "";
        if (!evasionFirstSentence.test(firstSentence) && firstSentence.length > 5) {
          directAnswerCount++;
        }
      }
    }

    // Repair recovery check
    // Alter が謝罪/修復した後、次のユーザー発言がポジティブか
    const isRepairResponse = /ごめん|ズレてた|読み違え|すまない/.test(msg.content);
    if (isRepairResponse) {
      repairCount++;
      const nextUser = history[i + 1];
      if (nextUser?.role === "user") {
        // ポジティブまたは次の質問に移行 = 修復成功
        const isRecovered = !/違う|やめて|使うな|逃げ|投げ|全然|ダメ/.test(nextUser.content);
        if (isRecovered) {
          repairRecoveryCount++;
        }
      }
    }
  }

  return {
    constraint_violation_rate: banCheckCount > 0 ? banViolationCount / banCheckCount : 0,
    direct_answer_first_sentence_rate: concludeCount > 0 ? directAnswerCount / concludeCount : 1,
    repair_recovery_rate: repairCount > 0 ? repairRecoveryCount / repairCount : 1,
  };
}
