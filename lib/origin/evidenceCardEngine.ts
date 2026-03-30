// lib/origin/evidenceCardEngine.ts
// 証拠カードエンジン — 種→芽→証拠カード成長 + 仮説→観測提案→検証ループ
//
// 設計原則:
// - データ蓄積前は「観測の種カード」→ 育って証拠カードに成長
// - 例外は「パターンが崩れた理由は？」と問いに変換
// - 問いかけ頻度は週2-3回まで（例外検出時のみ）
// - 仮説は選択肢式で提示（自由記述はオプション）
// - 仮説 → 観測提案 → 検証の完全ループ

import type { DailyOrbitStore, DailyOrbitEntry, OrbitLaw } from "./dailyOrbit/types";
import type { EntryRecord, JudgmentCategory } from "./entryContract";
import type { StargazerOriginContext } from "./stargazerPipeline";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** カード成長段階 */
export type CardGrowth = "seed" | "sprout" | "evidence";

/** 証拠カード */
export type EvidenceCard = {
  id: string;
  /** 成長段階 */
  growth: CardGrowth;
  /** パターンの説明 */
  pattern: string;
  /** 発生頻度（evidence段階のみ） */
  frequency: string | null;
  /** 例外の存在（evidence段階のみ） */
  exception: EvidenceException | null;
  /** 関連する判断カテゴリ */
  category: JudgmentCategory | "cross_category";
  /** カードの種類 */
  type: "judgment_pattern" | "layer_correlation" | "stargazer_bridge";
  /** 生データ */
  dataPoints: number;
  /** 最終更新日 */
  updatedAt: string;
};

/** 例外情報 */
export type EvidenceException = {
  description: string;
  recentCount: number;  // 直近で例外が発生した回数
  totalCount: number;   // 全体の母数
  /** 問いかけ（例外検出時のみ） */
  question: string;
};

/** 仮説 */
export type Hypothesis = {
  id: string;
  cardId: string;
  /** 仮説の選択肢 */
  options: HypothesisOption[];
  /** ユーザーが選択した仮説 */
  selectedOption: string | null;
  /** 自由記述の仮説 */
  freeText: string | null;
  /** 観測提案 */
  observationProposal: string | null;
  /** 検証結果 */
  verification: HypothesisVerification | null;
  createdAt: string;
};

export type HypothesisOption = {
  id: string;
  label: string;
};

export type HypothesisVerification = {
  result: "supported" | "exception" | "inconclusive";
  evidence: string;
  verifiedAt: string;
};

/** 問いかけ（週2-3回制限） */
export type InquiryCard = {
  evidenceCard: EvidenceCard;
  question: string;
  hypothesisOptions: HypothesisOption[];
  /** 観測提案（仮説選択後に表示） */
  observationProposal: string;
};

// ---------------------------------------------------------------------------
// Core: カード生成
// ---------------------------------------------------------------------------

const SEED_THRESHOLD = 3;    // 種カードに必要な最小データ数
const SPROUT_THRESHOLD = 7;  // 芽カードに必要な最小データ数
const EVIDENCE_THRESHOLD = 14; // 証拠カードに必要な最小データ数

/**
 * DailyOrbitStore + EntryRecords から証拠カードを生成する。
 */
export function generateEvidenceCards(
  orbitStore: DailyOrbitStore | null,
  entryRecords: EntryRecord[],
  stargazerCtx: StargazerOriginContext | null,
): EvidenceCard[] {
  const cards: EvidenceCard[] = [];

  // 1. 判断カテゴリのパターン
  const categoryCards = analyzeCategoryPatterns(entryRecords);
  cards.push(...categoryCards);

  // 2. 層との相関パターン（DailyOrbitデータから）
  if (orbitStore) {
    const correlationCards = analyzeLayerCorrelations(orbitStore, entryRecords);
    cards.push(...correlationCards);
  }

  // 3. Stargazer 連携パターン
  if (stargazerCtx && orbitStore) {
    const bridgeCards = analyzeStargazerBridge(orbitStore, stargazerCtx);
    cards.push(...bridgeCards);
  }

  return cards.sort((a, b) => growthOrder(b.growth) - growthOrder(a.growth));
}

// ---------------------------------------------------------------------------
// Pattern Analysis
// ---------------------------------------------------------------------------

function analyzeCategoryPatterns(entries: EntryRecord[]): EvidenceCard[] {
  if (entries.length < SEED_THRESHOLD) return [];

  const cards: EvidenceCard[] = [];

  // カテゴリ別の頻度を分析
  const categoryCounts: Partial<Record<JudgmentCategory, number>> = {};
  for (const e of entries) {
    categoryCounts[e.category] = (categoryCounts[e.category] ?? 0) + 1;
  }

  // 最頻カテゴリのカード
  const sorted = Object.entries(categoryCounts)
    .sort(([, a], [, b]) => b - a)
    .filter(([cat]) => cat !== "nothing_special");

  if (sorted.length > 0) {
    const [topCat, topCount] = sorted[0];
    const growth = determineGrowth(entries.length);
    const percentage = Math.round((topCount / entries.length) * 100);

    cards.push({
      id: `cat_${topCat}`,
      growth,
      pattern: `あなたのエネルギーは「${getCategoryLabel(topCat as JudgmentCategory)}」に最も多く使われています`,
      frequency: growth !== "seed" ? `${topCount}/${entries.length}回（${percentage}%）` : null,
      exception: detectCategoryException(entries, topCat as JudgmentCategory),
      category: topCat as JudgmentCategory,
      type: "judgment_pattern",
      dataPoints: entries.length,
      updatedAt: new Date().toISOString(),
    });
  }

  // 曜日パターン
  const weekdayPattern = detectWeekdayPattern(entries);
  if (weekdayPattern) {
    cards.push(weekdayPattern);
  }

  // 「特になし」の傾向
  const nothingCount = categoryCounts.nothing_special ?? 0;
  if (nothingCount >= SEED_THRESHOLD) {
    const growth = determineGrowth(nothingCount);
    cards.push({
      id: "cat_nothing_trend",
      growth,
      pattern: "判断コストが低い日が一定の頻度で発生しています",
      frequency: growth !== "seed" ? `${nothingCount}/${entries.length}回` : null,
      exception: null,
      category: "nothing_special",
      type: "judgment_pattern",
      dataPoints: nothingCount,
      updatedAt: new Date().toISOString(),
    });
  }

  return cards;
}

function analyzeLayerCorrelations(
  store: DailyOrbitStore,
  entries: EntryRecord[],
): EvidenceCard[] {
  const cards: EvidenceCard[] = [];
  if (entries.length < SPROUT_THRESHOLD) return cards;

  // Entry カテゴリ × タスク完了率の相関
  const entryMap = new Map(entries.map((e) => [e.date, e]));

  for (const category of ["work_decision", "relationship", "self_care"] as JudgmentCategory[]) {
    const matchingDays = entries.filter((e) => e.category === category);
    if (matchingDays.length < 3) continue;

    const completionRates: number[] = [];
    for (const day of matchingDays) {
      const orbitEntry = store.entries[day.date];
      if (!orbitEntry || orbitEntry.tasks.length === 0) continue;
      const rate = orbitEntry.tasks.filter((t) => t.completed).length / orbitEntry.tasks.length;
      completionRates.push(rate);
    }

    if (completionRates.length < 3) continue;

    const avgRate = completionRates.reduce((s, r) => s + r, 0) / completionRates.length;
    const label = getCategoryLabel(category);

    // 全体平均との比較
    const allEntries = Object.values(store.entries).filter((e) => e.tasks.length > 0);
    const overallRate = allEntries.length > 0
      ? allEntries.reduce((s, e) => s + e.tasks.filter((t) => t.completed).length / e.tasks.length, 0) / allEntries.length
      : 0.5;

    const diff = avgRate - overallRate;
    if (Math.abs(diff) < 0.1) continue;

    const direction = diff > 0 ? "高め" : "低め";
    const growth = determineGrowth(matchingDays.length);

    cards.push({
      id: `corr_${category}_completion`,
      growth,
      pattern: `「${label}」にエネルギーを使った日は、タスク完了率が${direction}です`,
      frequency: growth !== "seed"
        ? `${matchingDays.length}日中${Math.round(avgRate * 100)}%完了（全体平均${Math.round(overallRate * 100)}%）`
        : null,
      exception: null,
      category,
      type: "layer_correlation",
      dataPoints: matchingDays.length,
      updatedAt: new Date().toISOString(),
    });
  }

  return cards;
}

function analyzeStargazerBridge(
  store: DailyOrbitStore,
  ctx: StargazerOriginContext,
): EvidenceCard[] {
  const cards: EvidenceCard[] = [];

  // 矛盾軸がある場合、行動データとの接続カードを生成
  for (const contradiction of ctx.contradictions.slice(0, 2)) {
    cards.push({
      id: `sg_contradiction_${contradiction.key}`,
      growth: "seed",
      pattern: `Stargazerで「${contradiction.label}」に二面性が検出されています。日々の行動との関連を観測中です`,
      frequency: null,
      exception: null,
      category: "cross_category",
      type: "stargazer_bridge",
      dataPoints: 0,
      updatedAt: new Date().toISOString(),
    });
  }

  return cards;
}

// ---------------------------------------------------------------------------
// Inquiry generation (週2-3回制限)
// ---------------------------------------------------------------------------

const INQUIRY_KEY = "origin_inquiry_history_v1";
const MAX_INQUIRIES_PER_WEEK = 3;

/**
 * 今日の問いかけカードを生成する。
 * 週2-3回制限を適用し、例外が検出されたカードのみ問いかける。
 */
export function generateInquiry(
  cards: EvidenceCard[],
): InquiryCard | null {
  // 週の問いかけ回数チェック
  if (typeof window !== "undefined") {
    try {
      const history = JSON.parse(localStorage.getItem(INQUIRY_KEY) ?? "[]") as string[];
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekAgoStr = weekAgo.toISOString().slice(0, 10);
      const recentCount = history.filter((d) => d >= weekAgoStr).length;
      if (recentCount >= MAX_INQUIRIES_PER_WEEK) return null;
    } catch { /* */ }
  }

  // 例外があるカードから問いかけを生成
  const cardWithException = cards.find(
    (c) => c.growth === "evidence" && c.exception != null
  );

  if (!cardWithException || !cardWithException.exception) return null;

  const options = generateHypothesisOptions(cardWithException);

  return {
    evidenceCard: cardWithException,
    question: cardWithException.exception.question,
    hypothesisOptions: options,
    observationProposal: generateObservationProposal(cardWithException),
  };
}

/**
 * 問いかけに対するユーザーの回答を記録
 */
export function recordInquiryResponse(hypothesis: Hypothesis): void {
  if (typeof window === "undefined") return;
  try {
    const history = JSON.parse(localStorage.getItem(INQUIRY_KEY) ?? "[]") as string[];
    history.push(new Date().toISOString().slice(0, 10));
    localStorage.setItem(INQUIRY_KEY, JSON.stringify(history.slice(-30)));

    // 仮説を保存
    const hypotheses = JSON.parse(localStorage.getItem("origin_hypotheses_v1") ?? "[]") as Hypothesis[];
    hypotheses.push(hypothesis);
    localStorage.setItem("origin_hypotheses_v1", JSON.stringify(hypotheses.slice(-50)));
  } catch { /* */ }
}

// ---------------------------------------------------------------------------
// Sub-functions
// ---------------------------------------------------------------------------

function determineGrowth(dataPoints: number): CardGrowth {
  if (dataPoints >= EVIDENCE_THRESHOLD) return "evidence";
  if (dataPoints >= SPROUT_THRESHOLD) return "sprout";
  return "seed";
}

function growthOrder(growth: CardGrowth): number {
  return growth === "evidence" ? 3 : growth === "sprout" ? 2 : 1;
}

function detectCategoryException(
  entries: EntryRecord[],
  category: JudgmentCategory,
): EvidenceException | null {
  if (entries.length < EVIDENCE_THRESHOLD) return null;

  // 直近5回の該当カテゴリを確認
  const recent = entries
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  const recentMatch = recent.filter((e) => e.category === category).length;
  const totalMatch = entries.filter((e) => e.category === category).length;
  const expectedRate = totalMatch / entries.length;
  const recentRate = recentMatch / recent.length;

  // 直近の傾向が全体と大きく異なる → 例外
  if (Math.abs(recentRate - expectedRate) < 0.2) return null;

  const direction = recentRate > expectedRate ? "増加" : "減少";
  const label = getCategoryLabel(category);

  return {
    description: `直近10日では「${label}」の${direction}傾向`,
    recentCount: recentMatch,
    totalCount: recent.length,
    question: `最近「${label}」への判断エネルギーが${direction}していますが、何か変わりましたか？`,
  };
}

function detectWeekdayPattern(entries: EntryRecord[]): EvidenceCard | null {
  if (entries.length < SPROUT_THRESHOLD) return null;

  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const dayCounts: Record<number, Record<string, number>> = {};

  for (const e of entries) {
    const day = new Date(e.date).getDay();
    if (!dayCounts[day]) dayCounts[day] = {};
    dayCounts[day][e.category] = (dayCounts[day][e.category] ?? 0) + 1;
  }

  // 最も偏りのある曜日を検出
  let maxBias = 0;
  let biasDay = -1;
  let biasCategory = "";

  for (const [day, counts] of Object.entries(dayCounts)) {
    const total = Object.values(counts).reduce((s, c) => s + c, 0);
    for (const [cat, count] of Object.entries(counts)) {
      const bias = count / total;
      if (bias > maxBias && total >= 2 && bias > 0.5) {
        maxBias = bias;
        biasDay = Number(day);
        biasCategory = cat;
      }
    }
  }

  if (biasDay < 0 || maxBias < 0.5) return null;

  return {
    id: `weekday_${biasDay}_${biasCategory}`,
    growth: determineGrowth(entries.length),
    pattern: `${weekdays[biasDay]}曜日は「${getCategoryLabel(biasCategory as JudgmentCategory)}」にエネルギーを使う傾向があります`,
    frequency: `${Math.round(maxBias * 100)}%`,
    exception: null,
    category: biasCategory as JudgmentCategory,
    type: "judgment_pattern",
    dataPoints: entries.length,
    updatedAt: new Date().toISOString(),
  };
}

function generateHypothesisOptions(card: EvidenceCard): HypothesisOption[] {
  const base: HypothesisOption[] = [];

  switch (card.type) {
    case "judgment_pattern":
      base.push(
        { id: "workload", label: "仕事量や責任の変化" },
        { id: "relationship_change", label: "人間関係の変化" },
        { id: "season", label: "季節や時期の影響" },
        { id: "other", label: "他の理由がある" },
      );
      break;
    case "layer_correlation":
      base.push(
        { id: "energy_level", label: "エネルギーレベルの違い" },
        { id: "priority_shift", label: "優先順位の変化" },
        { id: "external", label: "外部要因" },
        { id: "other", label: "他の理由がある" },
      );
      break;
    default:
      base.push(
        { id: "context", label: "状況による切り替え" },
        { id: "growth", label: "成長や変化の途中" },
        { id: "other", label: "他の理由がある" },
      );
  }

  return base;
}

function generateObservationProposal(card: EvidenceCard): string {
  switch (card.category) {
    case "work_decision":
      return "来週、仕事の判断を意識的に減らす日を1日作ってみてください";
    case "relationship":
      return "次に人間関係でエネルギーを使った時、そのあとの身体の声を記録してみてください";
    case "time_allocation":
      return "明日、時間の使い方を変えた場合の満足度を観測してみてください";
    case "self_care":
      return "セルフケアの日を意図的に設けて、翌日の状態を観察してみてください";
    case "money":
      return "次の購買判断の前後で、Shadow Intention を記録してみてください";
    default:
      return "この傾向が次に現れた時、その場面の詳細をメモしてみてください";
  }
}

function getCategoryLabel(cat: JudgmentCategory): string {
  const labels: Record<JudgmentCategory, string> = {
    work_decision: "仕事の判断",
    relationship: "人間関係",
    time_allocation: "時間の使い方",
    self_care: "自分のケア",
    money: "お金の使い方",
    nothing_special: "特になし",
  };
  return labels[cat] ?? cat;
}

// ---------------------------------------------------------------------------
// Hypothesis verification loop — ループを閉じる
// ---------------------------------------------------------------------------

const HYPOTHESES_KEY = "origin_hypotheses_v1";
/** 仮説作成から検証可能になるまでの最小日数 */
const MIN_DAYS_BEFORE_VERIFICATION = 3;
/** 検証に使う最小データポイント数 */
const MIN_VERIFICATION_DATA = 3;

/**
 * 保存済みの仮説を全件取得
 */
export function loadHypotheses(): Hypothesis[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HYPOTHESES_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/**
 * 検証待ちの仮説を取得（作成から3日以上経過 & 未検証）
 */
export function loadPendingHypotheses(): Hypothesis[] {
  const all = loadHypotheses();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MIN_DAYS_BEFORE_VERIFICATION);
  const cutoffStr = cutoff.toISOString();

  return all.filter(
    (h) => h.verification === null && h.createdAt < cutoffStr,
  );
}

/**
 * 仮説を半自動で検証する。
 *
 * ロジック:
 * 1. 仮説作成日以降のEntryRecordsとOrbitデータを取得
 * 2. 仮説の元カードのパターンが「強まった」「変わらない」「崩れた」を判定
 * 3. 判定結果 + 根拠テキストを返す（ユーザーが確認して確定する）
 *
 * 完全自動ではなく「AIが判定案を出し、ユーザーが確認」する半自動設計。
 */
export function evaluateHypothesis(
  hypothesis: Hypothesis,
  entryRecords: EntryRecord[],
  orbitStore: DailyOrbitStore | null,
): VerificationProposal {
  const createdDate = hypothesis.createdAt.slice(0, 10);

  // 仮説作成後のデータだけ抽出
  const postEntries = entryRecords.filter((e) => e.date > createdDate);

  if (postEntries.length < MIN_VERIFICATION_DATA) {
    return {
      result: "insufficient_data",
      evidence: `検証にはあと${MIN_VERIFICATION_DATA - postEntries.length}日分のデータが必要です`,
      confidence: 0,
    };
  }

  // カードIDからパターンの種類を判定
  const cardId = hypothesis.cardId;

  if (cardId.startsWith("cat_")) {
    return evaluateCategoryHypothesis(hypothesis, postEntries, entryRecords);
  }

  if (cardId.startsWith("corr_") && orbitStore) {
    return evaluateCorrelationHypothesis(hypothesis, postEntries, orbitStore);
  }

  // デフォルト: データ不足扱い
  return {
    result: "insufficient_data",
    evidence: "このパターンの自動検証はまだ対応していません。手動で判定してください",
    confidence: 0,
  };
}

/** 検証の提案（ユーザー確認前） */
export type VerificationProposal = {
  result: "supported" | "exception" | "inconclusive" | "insufficient_data";
  evidence: string;
  confidence: number; // 0-1
};

function evaluateCategoryHypothesis(
  hypothesis: Hypothesis,
  postEntries: EntryRecord[],
  allEntries: EntryRecord[],
): VerificationProposal {
  // カードIDからカテゴリを抽出 (cat_work_decision → work_decision)
  const category = hypothesis.cardId.replace("cat_", "") as JudgmentCategory;

  // 仮説作成前のデータ
  const createdDate = hypothesis.createdAt.slice(0, 10);
  const preEntries = allEntries.filter((e) => e.date <= createdDate);

  // 作成前後のカテゴリ頻度を比較
  const preRate = preEntries.length > 0
    ? preEntries.filter((e) => e.category === category).length / preEntries.length
    : 0;
  const postRate = postEntries.length > 0
    ? postEntries.filter((e) => e.category === category).length / postEntries.length
    : 0;

  const diff = postRate - preRate;
  const label = getCategoryLabel(category);
  const prePercent = Math.round(preRate * 100);
  const postPercent = Math.round(postRate * 100);

  if (Math.abs(diff) < 0.1) {
    return {
      result: "supported",
      evidence: `「${label}」の頻度はほぼ変わらず（${prePercent}% → ${postPercent}%）。パターンは安定しています`,
      confidence: 0.7,
    };
  }

  if (diff > 0.1) {
    return {
      result: "supported",
      evidence: `「${label}」の頻度が上昇（${prePercent}% → ${postPercent}%）。仮説で指摘した傾向が強まっています`,
      confidence: Math.min(0.5 + Math.abs(diff), 0.9),
    };
  }

  // 頻度が下がった場合
  return {
    result: "exception",
    evidence: `「${label}」の頻度が低下（${prePercent}% → ${postPercent}%）。パターンに変化が起きています。何が変わりましたか？`,
    confidence: Math.min(0.5 + Math.abs(diff), 0.9),
  };
}

function evaluateCorrelationHypothesis(
  hypothesis: Hypothesis,
  postEntries: EntryRecord[],
  orbitStore: DailyOrbitStore,
): VerificationProposal {
  // corr_work_decision_completion → work_decision
  const parts = hypothesis.cardId.replace("corr_", "").split("_");
  parts.pop(); // remove "completion"
  const category = parts.join("_") as JudgmentCategory;
  const label = getCategoryLabel(category);

  const matchingDays = postEntries.filter((e) => e.category === category);
  if (matchingDays.length < MIN_VERIFICATION_DATA) {
    return {
      result: "insufficient_data",
      evidence: `「${label}」の日がまだ${matchingDays.length}日しかありません。あと${MIN_VERIFICATION_DATA - matchingDays.length}日分必要です`,
      confidence: 0,
    };
  }

  // 完了率を計算
  const completionRates: number[] = [];
  for (const day of matchingDays) {
    const entry = orbitStore.entries[day.date];
    if (!entry || entry.tasks.length === 0) continue;
    completionRates.push(
      entry.tasks.filter((t) => t.completed).length / entry.tasks.length,
    );
  }

  if (completionRates.length < 2) {
    return {
      result: "insufficient_data",
      evidence: "タスクデータが不足しています",
      confidence: 0,
    };
  }

  const avgRate = completionRates.reduce((s, r) => s + r, 0) / completionRates.length;
  const allOrbit = Object.values(orbitStore.entries).filter((e) => e.tasks.length > 0);
  const overallRate = allOrbit.length > 0
    ? allOrbit.reduce((s, e) => s + e.tasks.filter((t) => t.completed).length / e.tasks.length, 0) / allOrbit.length
    : 0.5;

  const diff = avgRate - overallRate;
  const avgPercent = Math.round(avgRate * 100);
  const overallPercent = Math.round(overallRate * 100);

  if (Math.abs(diff) < 0.1) {
    return {
      result: "inconclusive",
      evidence: `「${label}」の日の完了率（${avgPercent}%）は全体（${overallPercent}%）とほぼ同じ。相関は不明確です`,
      confidence: 0.4,
    };
  }

  const direction = diff > 0 ? "高め" : "低め";
  return {
    result: "supported",
    evidence: `「${label}」の日の完了率は${avgPercent}%（全体${overallPercent}%）。やはり${direction}の傾向が確認されました`,
    confidence: Math.min(0.5 + Math.abs(diff), 0.9),
  };
}

/**
 * ユーザーが検証結果を確定する。
 * 仮説に検証結果を書き込み、localStorage に保存。
 */
export function confirmVerification(
  hypothesisId: string,
  result: HypothesisVerification["result"],
  evidence: string,
): void {
  if (typeof window === "undefined") return;
  try {
    const hypotheses = loadHypotheses();
    const idx = hypotheses.findIndex((h) => h.id === hypothesisId);
    if (idx < 0) return;

    hypotheses[idx] = {
      ...hypotheses[idx],
      verification: {
        result,
        evidence,
        verifiedAt: new Date().toISOString(),
      },
    };

    localStorage.setItem(HYPOTHESES_KEY, JSON.stringify(hypotheses));
  } catch { /* */ }
}

/**
 * 検証済み仮説を取得（カードに反映用）
 */
export function loadVerifiedHypotheses(): Hypothesis[] {
  return loadHypotheses().filter((h) => h.verification !== null);
}
