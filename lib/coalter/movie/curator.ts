/**
 * CoAlter Stage 2 Curate (movie) — LLM Ranker with Personality-Rooted Narration
 *
 * 三段式 §2.3.3 / mainstream plan §3.2 元 D-2-c / handoff rev 6 §2 Step D-1-c.
 *
 * Stage 1 Understand の `TwoPersonLensToday` + D-1-b の `candidatePool` (filtered)
 * + (optional) movie 固有 cinematic 文脈 を input に、LLM Ranker で top picks を
 * 結晶化する。narration は 5 要素 (personA_lens / personB_lens / relational_fit /
 * today_hook / veto_guard) を必須とし、汎用 LLM には書けない「2 人理解の累積」を
 * 引用根拠とする (CoAlter 存在論 §0.5)。
 *
 * 設計原則:
 *   - **LLM 接続は DI**: 本 file は `CuratorLLMClient` interface を **型定義のみ**
 *     とし、実 LLM client (`runAI` 等) を import しない。実接続は D-1-d
 *     (movieOrchestrator wiring) で別 file から行う。これにより本 file は完全に
 *     pure / mock-friendly で、test は vi.fn() 経由で挙動 verify 可能。
 *   - **失敗独立 (Bug-1 §2.3 精神)**: LLM throw / invalid JSON / pool 外 title /
 *     5 要素欠落 → fallback narration で必ず CuratorResult を返す。caller を止めない。
 *   - **5 要素必須 (G3)**: reasoning の 5 要素のいずれかが空 → reject + fallback
 *   - **lens 由来引用 (G6)**: narration / reasoning は lens フィールドからのキーワード
 *     を引用する構造。`computeNarrationCoverage` で測定可能。
 *   - **固有情報率 (G4)**: 汎用語 ("一般的に" / "多くの人が" / "人気の" 等) を控え、
 *     ペア固有情報を含む narration を促す。`computeNarrationCoverage` で測定。
 *
 * 構造 gate B1 担保 (mainstream plan §3.2 / 三段式 §6 M2 Bug-2 接続):
 *   - 本 file は `candidate.theater` を **一切参照しない**
 *   - userPrompt 構築でも `candidate.theater` を embed しない
 *   - 劇場確定は Stage 3 Resolve に委譲 (Stage 2 Curate は Skeleton UI 前提)
 *
 * 凍結線整合 (handover §4.2):
 *   - `lib/coalter/movieOrchestrator.ts` / `flags.ts` / `movieRanker.ts` /
 *     `movieCatalog.ts` / `webConnector.ts` / `understanding/**` への touch なし
 *   - 既存 LLM 経路 (`runAI` 等) を import しない
 */

import type { TwoPersonLensToday } from "../understanding/types";
import type { MovieQuery } from "./queryDerivation";
import type { MovieCandidate } from "./candidatePool";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Public types — Curator Input / Output / LLM Client interface
// ═══════════════════════════════════════════════════════════════════════════

/** 視聴履歴イベント (movie 固有 cinematic 文脈)。 */
export type WatchEvent = {
  title: string;
  watchedAt: string; // ISO 8601
  /** 満足度 -1..1 (optional) */
  satisfaction?: number;
  /** 一緒に観たか単独か (optional) */
  context?: "shared" | "alone";
};

/** ジャンル感度 (affinity = 好み、aversion = 苦手)。 */
export type GenreSensitivity = Record<
  string,
  { affinity: number; aversion: number }
>;

/** 個人 cinematic 文脈。 */
export type PersonCinematicContext = {
  watchHistory: readonly WatchEvent[];
  genreSensitivity: GenreSensitivity;
  rejectedTitles: readonly string[];
};

/** 2 人 cinematic 文脈 (movie 固有、optional)。 */
export type MovieDomainContext = {
  personA_cinematic: PersonCinematicContext;
  personB_cinematic: PersonCinematicContext;
  sharedWatches: readonly WatchEvent[];
};

/** Curator への入力。 */
export type CuratorInput = {
  lens: TwoPersonLensToday;
  query: MovieQuery;
  candidatePool: readonly MovieCandidate[];
  /** movie 固有 cinematic 文脈 (optional、不在時は generic ranking) */
  movieDomain?: MovieDomainContext;
};

/**
 * LLM client interface (DI、curator.ts 自身は実 LLM 接続を持たない)。
 *
 *   実装は D-1-d で `lib/coalter/movieOrchestrator.ts` 経由で `runAI` 等を
 *   注入する想定。本 file は interface 定義のみ。
 *
 *   入力: systemPrompt + userPrompt
 *   出力: JSON 文字列 (parseLLMResponse で deserialize)
 */
export type CuratorLLMClient = (input: {
  systemPrompt: string;
  userPrompt: string;
}) => Promise<string>;

/** Personality-Rooted Reasoning の 5 要素 (G3 必須)。 */
export type PersonalityRootedReasoning = {
  /** Aさんの coreDecisionPrinciples / comfortPathways 由来 */
  personA_lens: string;
  /** Bさんの同上 */
  personB_lens: string;
  /** relationalLens.dominantDynamic / careAxes 由来 */
  relational_fit: string;
  /** todayReading.mode / implicitIntent 由来 */
  today_hook: string;
  /** relationalLens.avoidElements 由来 */
  veto_guard: string;
};

/** LLM Ranker の出力 1 件。 */
export type PersonalityRootedPick = {
  title: string;
  /** 0-1 */
  confidence: number;
  reasoning: PersonalityRootedReasoning;
  /** カード表示用 2〜3 文 */
  narrative: string;
  /** fairness 調整の言及 (non-null = 言及あり) */
  fairnessNote: string | null;
};

/** Curator 集計 diagnostics。 */
export type CuratorDiagnostics = {
  /** LLM 呼び出しが成功したか (throw / parse 失敗で false) */
  llmCallSucceeded: boolean;
  /** LLM が出力した raw pick 数 */
  totalPicks: number;
  /** validation 通過数 (pool 内 + 5 要素充足) */
  validPicks: number;
  /** validation で reject された数 */
  rejectedPicks: number;
  /** rejection 理由ごとの集計 */
  rejectionReasons: Array<{ reason: RejectReason; count: number }>;
  /** fallback narration を起動したか */
  fallbackUsed: boolean;
};

/** validation reject の理由 enum。 */
export type RejectReason =
  | "title_not_in_pool"
  | "missing_reasoning_field"
  | "empty_narrative"
  | "invalid_confidence";

/** Curator の最終結果。 */
export type CuratorResult = {
  topPick: PersonalityRootedPick;
  alternates: readonly PersonalityRootedPick[];
  diagnostics: CuratorDiagnostics;
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. Prompt builders (B1 ガード: theater 不参照)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * System prompt 構築。三段式 §2.3.3 のプロンプト設計に準拠。
 *
 *   ペア固有の理解を引用根拠として narration を生成する CoAlter の核。
 */
export function buildSystemPrompt(_lens: TwoPersonLensToday): string {
  return [
    "あなたは CoAlter。A/B 2人を誰よりも理解している存在。",
    "Stage 1 Understand が「今日のおふたり」を読んだ結果を渡す。",
    "この読みを信じて、作品を結晶化せよ。",
    "",
    "タスク:",
    "1. 候補から top 3 を選ぶ。単なるマッチングではなく、",
    "   「この 2人がこの作品を今日観ると、何が起こるか」を想像して選ぶ。",
    "2. 各作品について reasoning 5 要素を必ず埋める:",
    "   - personA_lens: Aさんの lens の coreDecisionPrinciples or comfortPathways を 1 つ具体的に引用",
    "   - personB_lens: Bさんの lens を同様に",
    "   - relational_fit: relationalLens.dominantDynamic or careAxes から",
    "   - today_hook: todayReading.mode or implicitIntent を引用",
    "   - veto_guard: relationalLens.avoidElements から「外した理由」を 1 つ",
    "3. 「Aさん・Bさん」の名前を narration に使う (displayName 使用)",
    "4. fairnessNote: fairnessAdjustment が non-null なら rationale を反映",
    "",
    "禁止事項:",
    "- 「多くのカップルに人気」のような集計的理由",
    "- ジャンル名だけの理由 (「ヒューマンドラマが好きそう」)",
    "- 2人のどちらにも触れない一般論",
    "- 候補 pool 外のタイトルを出す (hallucination 防止)",
    "- Stage 1 lens を使わない一般論",
    "- dataGaps にある薄い部分を根拠にする",
    "",
    "出力は JSON。schema:",
    "{",
    '  "picks": [',
    "    {",
    '      "title": "string (pool 内の title)",',
    '      "confidence": number (0-1),',
    '      "reasoning": {',
    '        "personA_lens": "string",',
    '        "personB_lens": "string",',
    '        "relational_fit": "string",',
    '        "today_hook": "string",',
    '        "veto_guard": "string"',
    "      },",
    '      "narrative": "string (2〜3 文)",',
    '      "fairnessNote": "string | null"',
    "    }",
    "  ]",
    "}",
  ].join("\n");
}

/**
 * User prompt 構築 (B1 ガード: candidate.theater を一切 embed しない)。
 *
 *   pool / lens / movieDomain を embed する。劇場情報 (theater / showtime) は
 *   Stage 3 Resolve の領域、本 file では渡さない。
 */
export function buildUserPrompt(input: CuratorInput): string {
  const { lens, query, candidatePool, movieDomain } = input;

  const lines: string[] = [];

  // Stage 1 Understand 引用
  lines.push("【Stage 1 Understand の読み】");
  lines.push(`A の coreDecisionPrinciples: ${
    JSON.stringify(lens.personalLenses.a.coreDecisionPrinciples)
  }`);
  lines.push(`A の comfortPathways: ${
    JSON.stringify(lens.personalLenses.a.comfortPathways)
  }`);
  lines.push(`A の currentEmotionalHue: ${lens.personalLenses.a.currentEmotionalHue}`);
  lines.push(`B の coreDecisionPrinciples: ${
    JSON.stringify(lens.personalLenses.b.coreDecisionPrinciples)
  }`);
  lines.push(`B の comfortPathways: ${
    JSON.stringify(lens.personalLenses.b.comfortPathways)
  }`);
  lines.push(`B の currentEmotionalHue: ${lens.personalLenses.b.currentEmotionalHue}`);
  lines.push(`relationalLens.dominantDynamic: ${lens.relationalLens.dominantDynamic}`);
  lines.push(`relationalLens.careAxes: ${JSON.stringify(lens.relationalLens.careAxes)}`);
  lines.push(`relationalLens.avoidElements: ${JSON.stringify(lens.relationalLens.avoidElements)}`);
  lines.push(`relationalLens.temperature: ${lens.relationalLens.temperature}`);
  lines.push(`todayReading.mode: ${lens.todayReading.mode}`);
  lines.push(`todayReading.implicitIntent: ${lens.todayReading.implicitIntent}`);
  lines.push(`fairnessAdjustment: ${JSON.stringify(lens.fairnessAdjustment)}`);
  lines.push(`dataGaps: ${JSON.stringify(lens.dataGaps)}`);
  lines.push("");

  // Movie ドメイン軸 (D-1-a Query)
  lines.push("【Movie 検索軸 (D-1-a Query Derivation)】");
  lines.push(`query.mood: ${query.mood}`);
  lines.push(`query.weight: ${query.weight}`);
  lines.push(`query.length_minutes_max: ${query.length_minutes_max}`);
  lines.push(`query.couple_fit_hints: ${JSON.stringify(query.couple_fit_hints)}`);
  lines.push(`query.exclude (veto): ${JSON.stringify(query.exclude)}`);
  lines.push("");

  // Movie ドメイン固有 cinematic (optional)
  if (movieDomain) {
    lines.push("【Movie 固有 cinematic 文脈】");
    lines.push(`A の rejectedTitles: ${
      JSON.stringify(movieDomain.personA_cinematic.rejectedTitles)
    }`);
    lines.push(`B の rejectedTitles: ${
      JSON.stringify(movieDomain.personB_cinematic.rejectedTitles)
    }`);
    lines.push(`shared watch count: ${movieDomain.sharedWatches.length}`);
    lines.push("");
  }

  // 候補 pool (B1 ガード: theater は embed しない)
  lines.push("【候補作品 pool】");
  for (const c of candidatePool) {
    // 意図的に theater field を含めない (B1 構造 gate)
    const synopsis = c.synopsis ?? "(あらすじ不明)";
    const runtime = c.runtimeMin === undefined || c.runtimeMin === null
      ? "?"
      : `${c.runtimeMin}min`;
    lines.push(
      `- id="${c.id}" title="${c.title}" genres=${
        JSON.stringify(c.genres)
      } runtime=${runtime} synopsis="${synopsis}"`,
    );
  }

  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. LLM response parse + validate
// ═══════════════════════════════════════════════════════════════════════════

type RawPick = {
  title?: unknown;
  confidence?: unknown;
  reasoning?: unknown;
  narrative?: unknown;
  fairnessNote?: unknown;
};

/**
 * LLM raw response (JSON 文字列) を parse する。
 * 失敗時は空配列を返す (失敗独立、caller は fallback に倒す)。
 */
export function parseLLMResponse(raw: string): RawPick[] {
  try {
    const parsed = JSON.parse(raw) as { picks?: unknown };
    if (!parsed || !Array.isArray(parsed.picks)) return [];
    return parsed.picks as RawPick[];
  } catch {
    return [];
  }
}

function isString(x: unknown): x is string {
  return typeof x === "string" && x.length > 0;
}

function isReasoning(x: unknown): x is PersonalityRootedReasoning {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return (
    isString(r.personA_lens) &&
    isString(r.personB_lens) &&
    isString(r.relational_fit) &&
    isString(r.today_hook) &&
    isString(r.veto_guard)
  );
}

/**
 * Raw pick の validation:
 *   - title が pool 内 (hallucination 防止)
 *   - confidence が 0-1 の number
 *   - reasoning 5 要素全て non-empty string (G3)
 *   - narrative non-empty string
 *
 * reject された pick は理由付きで rejectionReasons に集計される。
 */
function validatePicks(
  raws: RawPick[],
  pool: readonly MovieCandidate[],
): {
  valid: PersonalityRootedPick[];
  rejected: Array<{ raw: RawPick; reason: RejectReason }>;
} {
  const titles = new Set(pool.map((c) => c.title));
  const valid: PersonalityRootedPick[] = [];
  const rejected: Array<{ raw: RawPick; reason: RejectReason }> = [];

  for (const raw of raws) {
    if (!isString(raw.title) || !titles.has(raw.title)) {
      rejected.push({ raw, reason: "title_not_in_pool" });
      continue;
    }
    if (
      typeof raw.confidence !== "number" ||
      raw.confidence < 0 ||
      raw.confidence > 1 ||
      !Number.isFinite(raw.confidence)
    ) {
      rejected.push({ raw, reason: "invalid_confidence" });
      continue;
    }
    if (!isReasoning(raw.reasoning)) {
      rejected.push({ raw, reason: "missing_reasoning_field" });
      continue;
    }
    if (!isString(raw.narrative)) {
      rejected.push({ raw, reason: "empty_narrative" });
      continue;
    }
    const fairnessNote =
      typeof raw.fairnessNote === "string" && raw.fairnessNote.length > 0
        ? raw.fairnessNote
        : null;
    valid.push({
      title: raw.title,
      confidence: raw.confidence,
      reasoning: raw.reasoning,
      narrative: raw.narrative,
      fairnessNote,
    });
  }

  return { valid, rejected };
}

function aggregateRejections(
  rejected: Array<{ raw: RawPick; reason: RejectReason }>,
): Array<{ reason: RejectReason; count: number }> {
  const counts = new Map<RejectReason, number>();
  for (const r of rejected) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
  return [...counts.entries()].map(([reason, count]) => ({ reason, count }));
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Fallback narration (失敗独立、Bug-1 §2.3 精神)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LLM 失敗 / 全 pick reject 時の最小 fallback narration を生成。
 *
 *   pool 先頭 candidate を top に置き、reasoning は lens 由来の generic
 *   placeholder を埋める。caller を止めないことを最優先。
 */
function buildFallbackPick(
  candidate: MovieCandidate,
  lens: TwoPersonLensToday,
): PersonalityRootedPick {
  const aPrincipal =
    lens.personalLenses.a.coreDecisionPrinciples[0] ?? "(観測薄)";
  const bPrincipal =
    lens.personalLenses.b.coreDecisionPrinciples[0] ?? "(観測薄)";
  const dominant = lens.relationalLens.dominantDynamic || "(動的観測薄)";
  const todayMode = lens.todayReading.mode;
  const avoid = lens.relationalLens.avoidElements[0] ?? "(避け要素なし)";
  return {
    title: candidate.title,
    confidence: 0.3, // fallback で低めに
    reasoning: {
      personA_lens: `Aさんの傾向「${aPrincipal}」を踏まえた候補`,
      personB_lens: `Bさんの傾向「${bPrincipal}」を踏まえた候補`,
      relational_fit: `2人の関係性 (${dominant}) に合いそう`,
      today_hook: `今日のモード「${todayMode}」に沿った選定`,
      veto_guard: `「${avoid}」は外した想定`,
    },
    narrative: "今日のおふたりに合うかもしれない候補です。詳細は次の段階で確定します。",
    fairnessNote: null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. fairnessNote 補完
// ═══════════════════════════════════════════════════════════════════════════

function attachFairnessIfMissing(
  pick: PersonalityRootedPick,
  lens: TwoPersonLensToday,
): PersonalityRootedPick {
  if (pick.fairnessNote) return pick;
  const fa = lens.fairnessAdjustment;
  if (fa.favorSide === null || !fa.rationale) return pick;
  return { ...pick, fairnessNote: fa.rationale };
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Public API — curate
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stage 2 Curate (movie) の本体。
 *
 *   1. system / user prompt 構築 (B1 ガード: theater 不参照)
 *   2. LLM client (DI) 呼び出し (失敗時は fallback)
 *   3. raw response parse + validate (5 要素必須 / pool 内 title)
 *   4. fairnessNote 補完
 *   5. top + alternates 分離 + diagnostics 集計
 *
 *   候補 pool が空の場合: 全 reject + fallback (caller 側で「候補ゼロ」UI 表示)
 */
export async function curate(
  input: CuratorInput,
  deps: { llmClient: CuratorLLMClient },
): Promise<CuratorResult> {
  const { lens, candidatePool } = input;

  // pool 空の場合: 即 fallback (合成 placeholder、caller 側 UI が候補ゼロを扱う)
  if (candidatePool.length === 0) {
    const placeholder: PersonalityRootedPick = {
      title: "(候補なし)",
      confidence: 0,
      reasoning: {
        personA_lens: "(候補ゼロのため不能)",
        personB_lens: "(候補ゼロのため不能)",
        relational_fit: "(候補ゼロのため不能)",
        today_hook: "(候補ゼロのため不能)",
        veto_guard: "(候補ゼロのため不能)",
      },
      narrative: "候補が見つかりませんでした。条件を変えてみてください。",
      fairnessNote: null,
    };
    return {
      topPick: placeholder,
      alternates: [],
      diagnostics: {
        llmCallSucceeded: false,
        totalPicks: 0,
        validPicks: 0,
        rejectedPicks: 0,
        rejectionReasons: [],
        fallbackUsed: true,
      },
    };
  }

  const systemPrompt = buildSystemPrompt(lens);
  const userPrompt = buildUserPrompt(input);

  let raw = "";
  let llmCallSucceeded = true;
  try {
    raw = await deps.llmClient({ systemPrompt, userPrompt });
  } catch {
    llmCallSucceeded = false;
  }

  const rawPicks = llmCallSucceeded ? parseLLMResponse(raw) : [];
  const { valid, rejected } = validatePicks(rawPicks, candidatePool);
  const validWithFairness = valid.map((p) => attachFairnessIfMissing(p, lens));

  let topPick: PersonalityRootedPick;
  let alternates: readonly PersonalityRootedPick[];
  let fallbackUsed = false;

  if (validWithFairness.length === 0) {
    // 全 reject or LLM 失敗 → fallback
    fallbackUsed = true;
    topPick = attachFairnessIfMissing(buildFallbackPick(candidatePool[0], lens), lens);
    alternates = [];
  } else {
    topPick = validWithFairness[0];
    alternates = validWithFairness.slice(1);
  }

  return {
    topPick,
    alternates,
    diagnostics: {
      llmCallSucceeded,
      totalPicks: rawPicks.length,
      validPicks: valid.length,
      rejectedPicks: rejected.length,
      rejectionReasons: aggregateRejections(rejected),
      fallbackUsed,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. Narration coverage (G3 / G4 / G6 を pure function で測定)
// ═══════════════════════════════════════════════════════════════════════════

/** G4 / G6 閾値 (handover §5.1)。 */
export const NARRATION_COVERAGE_THRESHOLDS = {
  /** G4: narration 固有情報率 (汎用語を含まない比率) */
  G4_UNIQUE_INFO_MIN: 0.8,
  /** G6: narration の lens 由来引用率 */
  G6_LENS_CITATION_MIN: 0.7,
} as const;

/** G4 違反候補となる generic 表現リスト (汎用語)。 */
const GENERIC_PHRASES: readonly string[] = [
  "一般的に",
  "多くの人が",
  "人気の",
  "おすすめの",
  "話題の",
  "誰もが",
];

/**
 * narration 全テキスト (reasoning 5 要素 + narrative + fairnessNote) を集約。
 */
function collectNarrationText(pick: PersonalityRootedPick): string {
  const r = pick.reasoning;
  const parts = [
    r.personA_lens,
    r.personB_lens,
    r.relational_fit,
    r.today_hook,
    r.veto_guard,
    pick.narrative,
    pick.fairnessNote ?? "",
  ];
  return parts.join(" ");
}

/**
 * lens 由来引用キーワードを集約。
 *   - 各 personalLenses の coreDecisionPrinciples / comfortPathways 各要素
 *   - relationalLens.dominantDynamic / careAxes / avoidElements
 *   - todayReading.mode / implicitIntent
 *   - fairnessAdjustment.rationale (non-null 時)
 */
function collectLensKeywords(lens: TwoPersonLensToday): string[] {
  const out: string[] = [];
  out.push(...lens.personalLenses.a.coreDecisionPrinciples);
  out.push(...lens.personalLenses.a.comfortPathways);
  out.push(...lens.personalLenses.b.coreDecisionPrinciples);
  out.push(...lens.personalLenses.b.comfortPathways);
  if (lens.relationalLens.dominantDynamic) {
    out.push(lens.relationalLens.dominantDynamic);
  }
  out.push(...lens.relationalLens.careAxes);
  out.push(...lens.relationalLens.avoidElements);
  out.push(lens.todayReading.mode);
  if (lens.todayReading.implicitIntent) {
    out.push(lens.todayReading.implicitIntent);
  }
  if (lens.fairnessAdjustment.rationale) {
    out.push(lens.fairnessAdjustment.rationale);
  }
  return out.filter((s) => s.length > 0);
}

export type NarrationCoverage = {
  /** 5 要素すべて非空か (G3) */
  meetsG3: boolean;
  /** narration 固有情報率 (汎用語が含まれない 1 - genericRatio) */
  uniqueInfoRatio: number;
  /** lens 由来キーワードの引用率 (含まれた数 / lens キーワード総数) */
  lensCitationRatio: number;
  /** uniqueInfoRatio >= G4 閾値 */
  meetsG4: boolean;
  /** lensCitationRatio >= G6 閾値 */
  meetsG6: boolean;
};

/**
 * Pure function: pick + lens から narration coverage を算出。
 *
 *   - G3: reasoning 5 要素 + narrative すべて非空文字
 *   - G4: 汎用語 (GENERIC_PHRASES) の出現がゼロに近いほど高 (1 - hit_rate)
 *   - G6: lens キーワードの含有率 (引用される lens kw 数 / lens kw 総数)
 */
export function computeNarrationCoverage(
  pick: PersonalityRootedPick,
  lens: TwoPersonLensToday,
): NarrationCoverage {
  // G3
  const r = pick.reasoning;
  const meetsG3 =
    r.personA_lens.length > 0 &&
    r.personB_lens.length > 0 &&
    r.relational_fit.length > 0 &&
    r.today_hook.length > 0 &&
    r.veto_guard.length > 0 &&
    pick.narrative.length > 0;

  const text = collectNarrationText(pick);

  // G4: 汎用語 hit count を測定
  const genericHits = GENERIC_PHRASES.filter((p) => text.includes(p)).length;
  // 0 hit = uniqueInfoRatio 1.0、各 hit ごとに 0.2 減点 (max 5 hits で 0)
  const uniqueInfoRatio = Math.max(0, 1 - genericHits * 0.2);

  // G6: lens キーワードの引用率
  const lensKeywords = collectLensKeywords(lens);
  let lensCitationRatio: number;
  if (lensKeywords.length === 0) {
    // lens に引用素材がない (新規ペア等) → 0 を返す (gate skip ではない、観測値)
    lensCitationRatio = 0;
  } else {
    const hits = lensKeywords.filter((kw) => text.includes(kw)).length;
    lensCitationRatio = hits / lensKeywords.length;
  }

  return {
    meetsG3,
    uniqueInfoRatio,
    lensCitationRatio,
    meetsG4: uniqueInfoRatio >= NARRATION_COVERAGE_THRESHOLDS.G4_UNIQUE_INFO_MIN,
    meetsG6:
      lensCitationRatio >= NARRATION_COVERAGE_THRESHOLDS.G6_LENS_CITATION_MIN,
  };
}
