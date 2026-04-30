/**
 * CoAlter F-6 — Live smoke harness (offline, LLM-free)
 *
 * CEO 指示 (2026-04-20): F-1〜F-6 bundle commit 後の実機確認。
 *
 * 3 scenario:
 *   1. 新宿 / 11時 / ラーメン / 醤油       → T0 hit 期待
 *   2. 気分語あり (落ち着いた, 会話できる) → T0 hit + moodTag projection
 *   3. T0 時間帯不足 (11時営業の店が薄い)  → T1a escalation 期待
 *
 * 目的: F-6 core path (buildFoodQuery + parseFoodVenues + runTieredRanking) を
 *       LLM/web search 抜きで exercise し、diagnostics を可視化する。
 *
 * 実行: COALTER_FOOD_TIER_LOOP=true npx tsx scripts/coalter-f6-smoke.ts
 */

import { buildFoodQuery } from "@/lib/coalter/foodQueryBuilder";
import { parseFoodVenues } from "@/lib/coalter/foodCatalog";
import { runTieredRanking } from "@/lib/coalter/foodTierRunner";
import type {
  CoAlterPersonProfile,
  ConversationBrief,
  SearchCandidate,
} from "@/lib/coalter/types";
import type { FoodQueryBuilderInput } from "@/lib/coalter/foodQueryBuilder";

// ═════════════════════════════════════════════════════════════════════════
// Shared fixtures
// ═════════════════════════════════════════════════════════════════════════

const profileA: CoAlterPersonProfile = {
  userId: "a",
  displayName: "たいし",
  communicationStyle: {
    directVsDiplomatic: null,
    conflictStyle: null,
    attachmentStyle: null,
    reassuranceNeed: null,
    emotionalVariability: null,
  },
  decisionStyle: {
    noveltyPreference: 0.5,
    decisionSpeed: null,
    riskTolerance: 0.5,
  },
  interests: ["ラーメン"],
  values: [],
  archetypeCode: null,
  coreFear: null,
  coreDesire: null,
};

const profileB: CoAlterPersonProfile = {
  ...profileA,
  userId: "b",
  displayName: "あやか",
  interests: ["和食"],
};

function makeBrief(overrides: Partial<ConversationBrief> = {}): ConversationBrief {
  return {
    theme: "food",
    area: "新宿",
    approximateTime: { date: "今日", timeSlot: "morning", preferredStartHour: 11 },
    mood: [],
    hardConstraints: [],
    rankingAxes: {
      preset: "balance_focus",
      roles: ["balance", "aFocus", "bFocus"],
      rationale: "smoke",
    },
    primaryUnresolvedQuestion: null,
    confidence: 0.85,
    source: "llm",
    ...overrides,
  };
}

function makeLensInput(
  overrides: Partial<FoodQueryBuilderInput> = {},
): FoodQueryBuilderInput {
  return {
    area: "新宿",
    cuisineHints: ["ラーメン", "醤油"],
    excludeCuisines: [],
    priceBand: null,
    requestedTimeSlots: [
      { localDate: null, startHour: 11, endHour: 12, confidence: "explicit" },
    ],
    targetLocalTime: "11:00",
    timeWindow: "lunch",
    occasion: null,
    atmosphere: { quietness: "either", density: "either", lighting: "either" },
    moodTags: [],
    reservationUrgency: "flexible",
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════════════
// Handcrafted search candidates (simulates what webConnector would return)
// ═════════════════════════════════════════════════════════════════════════

/** Scenario 1/2: 11時営業の新宿ラーメン店が揃ったケース (T0 hit 期待) */
function candidatesRich(): SearchCandidate[] {
  return [
    {
      title: "新宿 醤油ラーメン 蔵 | 新宿駅西口",
      description:
        "新宿駅徒歩3分。醤油ラーメン 980円。11:00〜22:00。食べログ3.8。新宿",
      externalRating: "3.8",
      practicalInfo: null,
      source: "食べログ",
      url: "https://tabelog.com/tokyo/A1304/rstdetail/shinjuku-kura-ramen/",
    },
    {
      title: "新宿 中華そば 澄 | 新宿三丁目",
      description:
        "新宿三丁目駅徒歩2分。醤油ラーメン 1050円。11:30〜23:00。食べログ3.6。新宿",
      externalRating: "3.6",
      practicalInfo: null,
      source: "食べログ",
      url: "https://tabelog.com/tokyo/A1304/rstdetail/shinjuku-sumi-ramen/",
    },
    {
      title: "新宿ラーメン 白龍 | 新宿駅東口",
      description:
        "新宿駅徒歩5分。醤油ラーメン 950円。11:00〜15:00 / 17:00〜23:00。食べログ3.7。新宿",
      externalRating: "3.7",
      practicalInfo: null,
      source: "食べログ",
      url: "https://tabelog.com/tokyo/A1304/rstdetail/shinjuku-hakuryu/",
    },
  ];
}

/**
 * Scenario 3: 新宿で 11 時営業の店が無く、12:00〜開店のみ (T1a 時間拡張で hit 期待)
 *
 * 期待挙動: T0 slot=11-12 は `open=12 vs end=12` で overlap=false → 0 件。
 *           T1a next slot=12-13 は `open=12 < end=13 && close=22 > start=12` → hit。
 *           → appliedTier=T1a / tierAttempts[0]=T0:0, [1]=T1a>=1。
 */
function candidatesLateOnly(): SearchCandidate[] {
  return [
    {
      title: "新宿 醤油ラーメン 昼 | 新宿駅西口",
      description:
        "新宿駅徒歩3分。醤油ラーメン 980円。12:00〜22:00。食べログ3.7。新宿",
      externalRating: "3.7",
      practicalInfo: null,
      source: "食べログ",
      url: "https://tabelog.com/tokyo/A1304/rstdetail/shinjuku-hiru-ramen/",
    },
    {
      title: "新宿 中華そば 暁 | 新宿三丁目",
      description:
        "新宿三丁目駅徒歩2分。醤油ラーメン 1050円。12:30〜22:00。食べログ3.6。新宿",
      externalRating: "3.6",
      practicalInfo: null,
      source: "食べログ",
      url: "https://tabelog.com/tokyo/A1304/rstdetail/shinjuku-akatsuki/",
    },
  ];
}

// ═════════════════════════════════════════════════════════════════════════
// Smoke runner
// ═════════════════════════════════════════════════════════════════════════

interface ScenarioReport {
  name: string;
  queryShouldClarify: boolean;
  queryArea: string | null;
  queryTimeSlot: string | null;
  queryMoodTags: string[];
  catalogCount: number;
  pageTypeBlocked: number;
  runnerRan: boolean;
  appliedTier?: string;
  tierAttemptsCounts?: Array<{ tier: string; ranked: number }>;
  finalRankedCount: number;
  firstRankedName: string | null;
  thinReason?: string;
}

function runScenario(args: {
  name: string;
  lensInput: FoodQueryBuilderInput;
  brief: ConversationBrief;
  searchCandidates: SearchCandidate[];
}): ScenarioReport {
  const { name, lensInput, brief, searchCandidates } = args;

  // (a) query 結晶化
  const qResult = buildFoodQuery(lensInput);

  // (b) catalog parse
  const parsed = parseFoodVenues(searchCandidates);

  // (c) tier retry loop (F-6 主役)
  const runner = runTieredRanking({
    brief,
    query: qResult.query,
    catalog: parsed.catalog,
    avoidKeys: [],
    profileA,
    profileB,
  });

  const q = qResult.query;
  const firstSlot = q.requestedTimeSlots[0];
  const timeSlotStr = firstSlot
    ? `${firstSlot.startHour}-${firstSlot.endHour}時`
    : null;

  const report: ScenarioReport = {
    name,
    queryShouldClarify: qResult.clarifySignal.shouldClarify,
    queryArea: q.area,
    queryTimeSlot: timeSlotStr,
    queryMoodTags: q.moodTags,
    catalogCount: parsed.catalog.length,
    pageTypeBlocked: parsed.meta.blockedPageTypeCount,
    runnerRan: runner !== null,
    finalRankedCount: runner?.ranked.length ?? 0,
    firstRankedName: runner?.ranked[0]?.venue.name ?? null,
  };
  if (runner) {
    report.appliedTier = runner.appliedTier;
    report.tierAttemptsCounts = runner.tierAttempts.map((a) => ({
      tier: a.tier,
      ranked: a.rankedCount,
    }));
    if (runner.tierThinReason) report.thinReason = runner.tierThinReason;
  }
  return report;
}

function prettyReport(r: ScenarioReport): string {
  const lines: string[] = [];
  lines.push(`【${r.name}】`);
  lines.push(`  query:  area=${r.queryArea} / time=${r.queryTimeSlot} / moodTags=[${r.queryMoodTags.join(",")}] / clarify=${r.queryShouldClarify}`);
  lines.push(`  catalog: ${r.catalogCount} venue(s)  (pageType blocked: ${r.pageTypeBlocked})`);
  if (!r.runnerRan) {
    lines.push(`  runner: SKIP (area/time underivable or null) — fallback to plain rankFood`);
  } else {
    lines.push(`  runner: appliedTier=${r.appliedTier}`);
    lines.push(`  attempts: ${(r.tierAttemptsCounts ?? []).map((a) => `${a.tier}=${a.ranked}`).join(" / ")}`);
    if (r.thinReason) lines.push(`  thinReason: ${r.thinReason}`);
  }
  lines.push(`  final ranked: ${r.finalRankedCount} — top: ${r.firstRankedName ?? "(none)"}`);
  return lines.join("\n");
}

async function main() {
  const flagOn = (process.env.COALTER_FOOD_TIER_LOOP ?? "").toLowerCase();
  const effective =
    flagOn === "1" || flagOn === "true" || flagOn === "on" || flagOn === "yes";
  console.log(
    `\n=== CoAlter F-6 smoke (COALTER_FOOD_TIER_LOOP=${effective ? "ON" : "OFF"}) ===\n` +
      `(注: runTieredRanking は flag を直接読まない。本 smoke は F-6 core path を直接叩く)\n`,
  );

  // Scenario 1: 新宿 / 11時 / ラーメン / 醤油
  const r1 = runScenario({
    name: "S1 新宿 / 11時 / ラーメン / 醤油 (構造化入力 → T0 hit 期待)",
    lensInput: makeLensInput(),
    brief: makeBrief(),
    searchCandidates: candidatesRich(),
  });
  console.log(prettyReport(r1));
  console.log();

  // Scenario 2: 気分語あり
  const r2 = runScenario({
    name: "S2 気分語あり (落ち着いた, 会話できる) → T0 hit + moodTag projection",
    lensInput: makeLensInput({
      moodTags: ["落ち着いた", "会話できる"],
      atmosphere: {
        quietness: "quiet",
        density: "spacious",
        lighting: "either",
      },
    }),
    brief: makeBrief({ mood: ["落ち着いた", "会話できる"] }),
    searchCandidates: candidatesRich(),
  });
  console.log(prettyReport(r2));
  console.log();

  // Scenario 3: T0 不足 → T1a escalation
  const r3 = runScenario({
    name: "S3 11時営業の店が薄い (13時〜のみ) → T1a 時間拡張で hit 期待",
    lensInput: makeLensInput(),
    brief: makeBrief(),
    searchCandidates: candidatesLateOnly(),
  });
  console.log(prettyReport(r3));
  console.log();

  // ── Summary ──
  console.log("=== summary ===");
  const rows: Array<[string, string]> = [
    [
      "S1 T0 hit",
      r1.appliedTier === "T0" && r1.finalRankedCount >= 1 ? "OK" : "NG",
    ],
    [
      "S2 moodTag projected + T0 hit",
      r2.queryMoodTags.length >= 2 &&
      r2.appliedTier === "T0" &&
      r2.finalRankedCount >= 1
        ? "OK"
        : "NG",
    ],
    [
      "S3 escalation (T0=0, later tier hit)",
      (r3.tierAttemptsCounts?.[0]?.ranked ?? 0) === 0 &&
      r3.finalRankedCount >= 1 &&
      r3.appliedTier !== "T0"
        ? "OK"
        : r3.appliedTier === "T2" && r3.finalRankedCount === 0
          ? "T2/thin"
          : "NG",
    ],
  ];
  for (const [k, v] of rows) {
    console.log(`  ${v.padEnd(8)} ${k}`);
  }
  console.log();
}

void main();
