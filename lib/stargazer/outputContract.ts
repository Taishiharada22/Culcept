import "server-only";

// ---------------------------------------------------------------------------
// Domain-specific Output Contracts for Home Alter responses
// ---------------------------------------------------------------------------

export interface ContractField {
  name: string;
  description: string;
  required: boolean;
  detector: RegExp;
}

export interface OutputContract {
  domain: string;
  fields: ContractField[];
  maxLength: number;
  prohibitions: RegExp[];
  promptInstruction: string;
}

export interface ContractValidation {
  pass: boolean;
  met: string[];
  missing: string[];
  repairable: string[];
}

// ---------------------------------------------------------------------------
// Contract Definitions
// ---------------------------------------------------------------------------

const FOUNDER_TEAM_FIT_CONTRACT: OutputContract = {
  domain: "founder_team_fit",
  fields: [
    {
      name: "conclusion",
      description: "どんなタイプの人がこの起業家を補完するか",
      required: true,
      detector: /合[うっ]|補完|タイプ|必要.*人|パートナー/,
    },
    {
      name: "complement_reason",
      description: "なぜそのタイプが補完になるのか",
      required: true,
      detector: /だから|ため|なぜなら|理由|足りない|弱い|苦手/,
    },
    {
      name: "clash_warning",
      description: "衝突しやすいタイプの警告",
      required: true,
      detector: /衝突|ぶつか[るり]|合わない|避け|注意|リスク|危険/,
    },
    {
      name: "role_needed",
      description: "具体的に必要な役割やスキル",
      required: false,
      detector: /エンジニア|デザイナー|マーケ|営業|CTO|COO|右腕|参謀/,
    },
    {
      name: "screening_tip",
      description: "候補者の見極め方",
      required: false,
      detector: /見極め|判断|確認|質問|聞[くけ]|面[接談]|見[るて]/,
    },
    {
      name: "next_action",
      description: "今すぐ取れる具体的な次の一手",
      required: true,
      detector: /今日|今週|まず|最初|次|探[すし]|会[うっ]|話[すし]/,
    },
  ],
  maxLength: 400,
  prohibitions: [
    /MBTI.{0,20}(型|タイプ)(?!.*あなた)/,
    /一般的に|誰でも|よくある/,
  ],
  promptInstruction: [
    "## 出力契約: founder_team_fit",
    "以下を必ず含めること:",
    "1. 結論: あなたを補完する人物タイプ（性格データに基づく）",
    "2. 補完理由: なぜその人物が足りない部分を埋めるのか",
    "3. 衝突警告: このタイプとは合わない・注意すべきタイプ",
    "4. 次の一手: 今日・今週中にできる具体的アクション",
    "推奨: 必要な役割名（CTO/デザイナー等）、見極め方も含める",
    "禁止: MBTIラベルだけの一般論、「誰でも当てはまる」助言",
    "400文字以内。",
  ].join("\n"),
};

const CAREER_FIT_CONTRACT: OutputContract = {
  domain: "career_fit",
  fields: [
    {
      name: "conclusion",
      description: "どの方向性が合うか",
      required: true,
      detector: /向[いく]|合[うっ]|適[しす]|フィット|方向|道/,
    },
    {
      name: "personality_reason",
      description: "性格データに基づく理由",
      required: true,
      detector: /あなた|性格|特[性徴]|傾向|強[みさ]|だから|ため/,
    },
    {
      name: "anti_fit",
      description: "合わない方向性",
      required: true,
      detector: /合わない|向かない|避け|苦[しい手]|消耗|リスク/,
    },
    {
      name: "next_action",
      description: "具体的な次のアクション",
      required: true,
      detector: /今日|今週|まず|最初|次|試[すし]|やって/,
    },
  ],
  maxLength: 400,
  prohibitions: [/一般的に|誰でも|よくある/],
  promptInstruction: [
    "## 出力契約: career_fit",
    "以下を必ず含めること:",
    "1. 結論: あなたに合う方向性",
    "2. 性格的理由: なぜ合うのか（性格データから）",
    "3. アンチフィット: 合わない・消耗する方向",
    "4. 次の一手: 具体的アクション",
    "400文字以内。",
  ].join("\n"),
};

const CREATION_CONTRACT: OutputContract = {
  domain: "creation",
  fields: [
    {
      name: "conclusion",
      description: "方向性・判断",
      required: true,
      detector: /方向|判断|結論|進[めむ]|やる|作[るり]/,
    },
    {
      name: "bottleneck",
      description: "今の主なボトルネック",
      required: true,
      detector: /ボトルネック|障[害壁]|壁|詰ま|止ま|課題|問題/,
    },
    {
      name: "two_week_action",
      description: "2週間以内にやるべきこと",
      required: true,
      detector: /2週間|二週間|14日|今月|この先|まず|ステップ/,
    },
    {
      name: "risk_pattern",
      description: "性格に基づくリスクパターン",
      required: true,
      detector: /あなた.*[癖傾パターン]|陥[るり]|やりがち|注意|罠/,
    },
  ],
  maxLength: 400,
  prohibitions: [/一般的に|誰でも|よくある/],
  promptInstruction: [
    "## 出力契約: creation",
    "以下を必ず含めること:",
    "1. 結論: 方向性や判断",
    "2. ボトルネック: 今いちばんの障壁",
    "3. 2週間アクション: この2週間でやること",
    "4. リスクパターン: あなたの性格上、陥りやすい罠",
    "400文字以内。",
  ].join("\n"),
};

const GENERAL_CONTRACT: OutputContract = {
  domain: "general",
  fields: [
    {
      name: "conclusion",
      description: "方向性・判断",
      required: true,
      detector: /方向|判断|結論|答[えー]|思[うい]|べき/,
    },
    {
      name: "personal_reason",
      description: "この人だからこそ、の理由",
      required: true,
      detector: /あなた|性格|特[性徴]|傾向|だから|ため|理由/,
    },
    {
      name: "next_action",
      description: "具体的な次のアクション",
      required: true,
      detector: /今日|今週|まず|最初|次|試[すし]|やって|動[くけ]/,
    },
  ],
  maxLength: 400,
  prohibitions: [/一般的に|誰でも|よくある/],
  promptInstruction: [
    "## 出力契約: general",
    "以下を必ず含めること:",
    "1. 結論: 方向性や判断",
    "2. パーソナルな理由: あなたの性格だからこそ、の根拠",
    "3. 次の一手: 具体的アクション",
    "400文字以内。",
  ].join("\n"),
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const CONTRACT_REGISTRY: Record<string, OutputContract> = {
  founder_team_fit: FOUNDER_TEAM_FIT_CONTRACT,
  career_fit: CAREER_FIT_CONTRACT,
  creation: CREATION_CONTRACT,
  general: GENERAL_CONTRACT,
};

export function getContract(domain: string): OutputContract {
  return CONTRACT_REGISTRY[domain] ?? GENERAL_CONTRACT;
}

// ---------------------------------------------------------------------------
// Contract Validator
// ---------------------------------------------------------------------------

export function validateAgainstContract(
  response: string,
  domain: string,
  _questionType: string,
): ContractValidation {
  const contract = getContract(domain);
  const met: string[] = [];
  const missing: string[] = [];
  const repairable: string[] = [];

  for (const field of contract.fields) {
    if (field.detector.test(response)) {
      met.push(field.name);
    } else if (field.required) {
      // Required but missing -- check if repairable
      if (isRepairable(field.name, domain)) {
        repairable.push(field.name);
      }
      missing.push(field.name);
    }
    // Non-required and not detected: silently skip
  }

  // Check prohibitions
  for (const prohibition of contract.prohibitions) {
    if (prohibition.test(response)) {
      missing.push("__prohibition_violated__");
    }
  }

  // Check length
  if (response.length > contract.maxLength) {
    missing.push("__over_max_length__");
  }

  const pass = missing.length === 0;
  return { pass, met, missing, repairable };
}

/** Fields that can be repaired from personality facts */
const REPAIRABLE_FIELDS: Record<string, Set<string>> = {
  founder_team_fit: new Set([
    "next_action",
    "clash_warning",
    "complement_reason",
  ]),
  career_fit: new Set(["next_action", "anti_fit"]),
  creation: new Set(["risk_pattern", "two_week_action"]),
  general: new Set(["next_action", "personal_reason"]),
};

function isRepairable(fieldName: string, domain: string): boolean {
  return REPAIRABLE_FIELDS[domain]?.has(fieldName) ?? false;
}

// ---------------------------------------------------------------------------
// Deterministic Repair Layer
// ---------------------------------------------------------------------------

/** Templates for repairing missing fields. Placeholders: {fact} */
const REPAIR_TEMPLATES: Record<string, Record<string, string>> = {
  founder_team_fit: {
    next_action: "まず{fact}から始めてみるといい。",
    clash_warning:
      "ちなみに、あなたの性格だと{fact}と衝突しやすいから気をつけて。",
    complement_reason: "あなたは{fact}から、それを補う人がいると強い。",
  },
  career_fit: {
    next_action: "まず{fact}から試してみるのが合ってる。",
    anti_fit: "逆に、あなたの性格だと{fact}は消耗しやすいと思う。",
  },
  creation: {
    risk_pattern: "あなたが陥りやすい罠としては、{fact}がある。",
    two_week_action: "この2週間でまず{fact}からやってみない？",
  },
  general: {
    next_action: "まず{fact}から始めてみるのが合ってると思う。",
    personal_reason: "あなたの場合は特に、{fact}。",
  },
};

const MAX_REPAIRABLE = 2;

export function repairResponse(
  response: string,
  contract: OutputContract,
  missingFields: string[],
  personalizedFacts: string[],
  sessionFacts: string[],
): { repaired: string; fieldsRepaired: string[] } | null {
  const repairableOnly = missingFields.filter(
    (f) =>
      !f.startsWith("__") && isRepairable(f, contract.domain),
  );

  // Too many fields missing -- repair not viable
  if (repairableOnly.length === 0 || missingFields.length > MAX_REPAIRABLE + 1) {
    return null;
  }

  const allFacts = [...personalizedFacts, ...sessionFacts];
  if (allFacts.length === 0) {
    return null;
  }

  const templates = REPAIR_TEMPLATES[contract.domain] ?? REPAIR_TEMPLATES.general;
  const fieldsRepaired: string[] = [];
  let repaired = response.trimEnd();

  for (const fieldName of repairableOnly) {
    const template = templates[fieldName];
    if (!template) continue;

    // Pick the first available fact
    const fact = allFacts.shift();
    if (!fact) break;

    const line = template.replace("{fact}", fact.trim());
    repaired += "\n" + line;
    fieldsRepaired.push(fieldName);
  }

  if (fieldsRepaired.length === 0) {
    return null;
  }

  // Trim to maxLength if needed
  if (repaired.length > contract.maxLength) {
    repaired = repaired.slice(0, contract.maxLength);
  }

  return { repaired, fieldsRepaired };
}

// ---------------------------------------------------------------------------
// Contract Prompt Builder
// ---------------------------------------------------------------------------

export function buildContractPromptBlock(domain: string): string {
  const contract = getContract(domain);
  return contract.promptInstruction;
}
