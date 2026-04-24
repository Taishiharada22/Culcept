/**
 * CoAlter F-6 Live smoke harness (harness-A, 2026-04-20)
 *
 * Spec 位置づけ:
 *   本 docstring が正本（docstring-as-spec）。独立 doc は作らない。
 *   類似 harness 9 本中 8 本（f6-live-replay / shadow-real-api /
 *   step4-postflip-smoke 等）と同じ docstring 主義で統一する。
 *   2026-04-24 Step A-4（docs/coalter-handoff-2026-04-22.md §2 Step A-4）
 *   で CEO 判定: docstring 正本継続 + 本拡張 3 点（Scenarios 観測目的 /
 *   失敗時挙動 / CEO 改訂欄）を実施。
 *
 * CEO 承認構成 (message D):
 *   - 構成: A (harness, not HTTP route)
 *   - thread: 新規 / live-smoke 識別子付き（本 harness は talk_messages を
 *     触らず、turns を in-memory で流し込む方針に fallback しているため
 *     DB 側の "新規 thread" 物理作成は行わない。CEO 承認の背景:
 *     "この段階では route/auth/session 完全再検証は主目的ではない"）
 *   - 実行条件: COALTER_FOOD_LENS_WIRED=true, COALTER_FOOD_TIER_LOOP=true
 *
 * 何が live か:
 *   (a) 実ユーザー profile の Supabase ロード (service-role key)
 *   (b) 実 web 検索 (EXA 経由 searchAndFilter)
 *   (c) 実 LLM (Claude/Opus) 経由の Layer 0 brief + Layer 3 narration
 *   (d) F-6 tier retry loop (flag ON)
 *
 * 何を report するか (CEO message D 必須 6 項目):
 *   1. proposalCard.summary / reasoning / candidates
 *   2. diagnostics.queryProjectionCoverage / missingAxes / droppedAxes
 *   3. diagnostics.appliedTier / tierAttempts / tierThinReason
 *   4. diagnostics.rankedCount
 *   5. diagnostics.bookingProviderDistribution
 *   6. searchCandidates 上位 3 件
 *
 * Scenarios (3 本固定、観測目的):
 *   S1 新宿 / 11時 / ラーメン / 醤油 (explicit):
 *       area / cuisineHints / time が explicit で揃った"基本線"観測。
 *       query projection coverage の上限値を見る。
 *   S2 気分語あり (落ち着いた / 会話できる):
 *       moodTags + atmosphereDesire(quiet, spacious, warm_low) を入れた
 *       "soft 軸"観測。narration に mood が滲むか、tier 内で mood 軸が
 *       drop されないかを見る。
 *   S3 早朝時間帯 (新橋 7時 / 和定食):
 *       T0 候補が薄くなる時間帯で tier escalation が発火するかを見る。
 *       appliedTier / tierAttempts / tierThinReason の挙動観測が主目的。
 *
 * 失敗時の挙動:
 *   - 各 scenario 実行は try/catch で分離包括（runScenario 内）
 *   - 例外発生時は scenario 内で止めず ScenarioReport.error に記録し
 *     次 scenario の実行を継続する。他 scenario の結果汚染を防ぐため
 *     早期 return ではなく error フィールド付きレポート返却とする
 *   - main の profileLoader / console.info interceptor 系の例外は
 *     main の catch で fatal 扱い process.exit(1)
 *   - searchCandidates が空の場合もエラー扱いにしない（decideSearch
 *     が false を返したなら searchTop3 = [] として report する）
 *
 * CEO 承認改訂履歴:
 *   2026-04-20 message D: harness-A 構成 / 必須 6 項目 report / 実行条件 /
 *                         talk_messages 非接触 の承認
 *   2026-04-24 Step A-4:  docstring 継続 + 本補強 3 点（Scenarios 観測目的 /
 *                         失敗時挙動 / CEO 改訂欄）の承認
 *   (以降の CEO 追加指示はここに年月日付きで追記する)
 *
 * 使用:
 *   COALTER_FOOD_LENS_WIRED=true COALTER_FOOD_TIER_LOOP=true \
 *     NODE_OPTIONS='--conditions=react-server' \
 *     npx tsx scripts/coalter/f6-live-smoke.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config as dotenv } from "dotenv";
import path from "node:path";

dotenv({ path: path.resolve(process.cwd(), ".env.local") });

// CEO-approved flags. Set BEFORE any coalter import so getters read correct values.
process.env.COALTER_FOOD_LENS_WIRED = "true";
process.env.COALTER_FOOD_TIER_LOOP = "true";

import { loadPairProfiles } from "@/lib/coalter/profileLoader";
import { analyzeConversation } from "@/lib/coalter/conversationParser";
import { decideSearch, searchAndFilter } from "@/lib/coalter/webConnector";
import { generateFoodProposalV2 } from "@/lib/coalter/foodOrchestrator";
import type { FoodQueryBuilderInput } from "@/lib/coalter/foodQueryBuilder";
import type {
  ConversationTurn,
  RelationshipContext,
  SearchCandidate,
} from "@/lib/coalter/types";
import type {
  TwoPersonLensToday,
  UserId,
} from "@/lib/coalter/understanding/types";
import type { FoodLensToday } from "@/lib/coalter/understanding/foodLensAdapter";

// ═════════════════════════════════════════════════════════════════════════
// Service-role Supabase client
// ═════════════════════════════════════════════════════════════════════════

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("[f6-live] env missing: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Reusing the existing internal pair (accepted genome_connection) — real
// Stargazer/Alter footprint, real CoAlter profile.
const USER_A = "1c6ef878-6c77-49bd-8b30-d1cc395814c9"; // たいし (requester)
const USER_B = "f94d885e-33be-490a-a4e7-0898e8a74b8b"; // あやか (target)

// Live-smoke sentinel session id (namespaced, reproducibly identifiable)
function liveSmokeSessionId(label: string): string {
  // UUID-shape literal, 先頭 'f61e'（"F-6 1 LiveE"）で grep 可能
  return `f61e0000-0000-4000-0000-${label.padEnd(12, "0").slice(0, 12)}`;
}

// ═════════════════════════════════════════════════════════════════════════
// Scenario fixtures — in-memory turns + foodLens input
// ═════════════════════════════════════════════════════════════════════════

function now(): string {
  return new Date().toISOString();
}

function turn(senderId: string, body: string): ConversationTurn {
  return {
    id: `t_${Math.random().toString(36).slice(2, 10)}`,
    senderId,
    body,
    createdAt: now(),
  };
}

interface Scenario {
  name: string;
  turns: ConversationTurn[];
  foodLens: FoodQueryBuilderInput;
}

const SCENARIOS: Scenario[] = [
  {
    name: "S1 新宿 / 11時 / ラーメン / 醤油 (explicit)",
    turns: [
      turn(USER_A, "お昼一緒に食べない?"),
      turn(USER_B, "いいね、何食べたい?"),
      turn(USER_A, "新宿で11時頃にラーメン行きたい。醤油系で"),
    ],
    foodLens: {
      area: "新宿",
      cuisineHints: ["ラーメン", "醤油"],
      excludeCuisines: [],
      priceBand: null,
      requestedTimeSlots: [
        {
          localDate: null,
          startHour: 11,
          endHour: 12,
          confidence: "explicit",
        },
      ],
      targetLocalTime: "11:00",
      timeWindow: "lunch",
      occasion: null,
      atmosphere: { quietness: "either", density: "either", lighting: "either" },
      moodTags: [],
      reservationUrgency: "flexible",
    },
  },
  {
    name: "S2 気分語あり (落ち着いた / 会話できる)",
    turns: [
      turn(USER_A, "どこ行こっか。落ち着いたところがいいな"),
      turn(USER_B, "ゆっくり話せる感じが好き"),
      turn(USER_A, "渋谷で夜、会話できる雰囲気のお店で。イタリアンとか?"),
    ],
    foodLens: {
      area: "渋谷",
      cuisineHints: ["イタリアン"],
      excludeCuisines: [],
      priceBand: null,
      requestedTimeSlots: [
        {
          localDate: null,
          startHour: 19,
          endHour: 21,
          confidence: "explicit",
        },
      ],
      targetLocalTime: "19:00",
      timeWindow: "dinner",
      occasion: null,
      atmosphere: {
        quietness: "quiet",
        density: "spacious",
        lighting: "warm_low",
      },
      moodTags: ["落ち着いた", "会話できる"],
      reservationUrgency: "flexible",
    },
  },
  {
    name: "S3 早朝時間帯で T0 が薄いケース (tier escalation 期待)",
    turns: [
      turn(USER_A, "朝早めに食べたいんだよね"),
      turn(USER_B, "何時くらい?"),
      turn(USER_A, "新橋で朝7時にしっかり和定食食べたい"),
    ],
    foodLens: {
      area: "新橋",
      cuisineHints: ["和食", "定食"],
      excludeCuisines: [],
      priceBand: null,
      requestedTimeSlots: [
        {
          localDate: null,
          startHour: 7,
          endHour: 8,
          confidence: "explicit",
        },
      ],
      targetLocalTime: "07:00",
      timeWindow: "breakfast",
      occasion: null,
      atmosphere: { quietness: "either", density: "either", lighting: "either" },
      moodTags: [],
      reservationUrgency: "flexible",
    },
  },
];

// ═════════════════════════════════════════════════════════════════════════
// Lens synthesis — minimal but valid TwoPersonLensToday + FoodLensToday
// ═════════════════════════════════════════════════════════════════════════

function synthLens(): TwoPersonLensToday {
  return {
    personalLenses: {
      a: {
        userId: USER_A as UserId,
        displayName: "たいし",
        coreDecisionPrinciples: [],
        currentEmotionalHue: "",
        todaySensitivities: [],
        comfortPathways: [],
        sourcedFrom: { stargazer: [], alter: [], behavioral: [] },
      },
      b: {
        userId: USER_B as UserId,
        displayName: "あやか",
        coreDecisionPrinciples: [],
        currentEmotionalHue: "",
        todaySensitivities: [],
        comfortPathways: [],
        sourcedFrom: { stargazer: [], alter: [], behavioral: [] },
      },
    },
    relationalLens: {
      temperature: "warm",
      dominantDynamic: "",
      careAxes: [],
      avoidElements: [],
      interactionPace: "steady",
    },
    todayReading: {
      mode: "connect",
      energyBudget: "mid",
      timeBudget: "ample",
      implicitIntent: "",
      latentNeeds: [],
      confidence: 0.7,
    },
    fairnessAdjustment: {
      favorSide: null,
      rationale: null,
      strength: 0,
      basedOnSessionCount: 0,
    },
    understanding_confidence: 0.7,
    dataGaps: [],
    computedAt: now(),
    lensVersion: "1.0.0",
  };
}

function synthFoodLensToday(scenarioIdx: number): FoodLensToday {
  // Scenario-specific foodContext approximation (ranker narration hints).
  const byIdx: FoodLensToday["foodContext"][] = [
    {
      hungerLevel: "hungry",
      timeWindow: "lunch",
      atmosphereDesire: {
        quietness: "either",
        density: "either",
        lighting: "either",
      },
      moodTags: [],
    },
    {
      hungerLevel: "peckish",
      timeWindow: "dinner",
      atmosphereDesire: {
        quietness: "quiet",
        density: "spacious",
        lighting: "warm_low",
      },
      moodTags: ["落ち着いた", "会話できる"],
    },
    {
      hungerLevel: "very_hungry",
      timeWindow: "breakfast",
      atmosphereDesire: {
        quietness: "either",
        density: "either",
        lighting: "either",
      },
      moodTags: [],
    },
  ];
  return {
    lens: synthLens(),
    foodContext: byIdx[scenarioIdx],
    derivationSource: {
      hungerLevel: [],
      timeWindow: [],
      atmosphereDesire: [],
      moodTags: [],
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════
// console.info interception — capture "[CoAlter] food.diagnostics"
// ═════════════════════════════════════════════════════════════════════════

interface DiagnosticsCapture {
  sessionId: string | null;
  [key: string]: unknown;
}

const diagnosticsLog: DiagnosticsCapture[] = [];
const origInfo = console.info.bind(console);
console.info = ((...args: unknown[]) => {
  try {
    if (
      args.length >= 2 &&
      typeof args[0] === "string" &&
      args[0] === "[CoAlter] food.diagnostics" &&
      typeof args[1] === "string"
    ) {
      const obj = JSON.parse(args[1] as string);
      diagnosticsLog.push(obj as DiagnosticsCapture);
    }
  } catch {
    // ignore parse failures; still forward to origInfo
  }
  origInfo(...(args as [unknown, ...unknown[]]));
}) as typeof console.info;

// ═════════════════════════════════════════════════════════════════════════
// Scenario runner
// ═════════════════════════════════════════════════════════════════════════

interface ScenarioReport {
  name: string;
  sessionId: string;
  searchTop3: Array<{
    title: string;
    url: string | null;
    source: string | null;
    rating: string | null;
  }>;
  queryProjectionCoverage: unknown;
  missingAxes: string[] | undefined;
  droppedAxes: string[] | undefined;
  appliedTier: string | undefined;
  tierAttempts: unknown;
  tierThinReason: string | undefined;
  rankedCount: number;
  bookingProviderDistribution: unknown;
  proposalSummary: string;
  proposalReasoning: string;
  proposalCandidates: Array<{
    title: string;
    url: string | null;
    description: string;
  }>;
  error?: string;
}

async function runScenario(
  idx: number,
  scen: Scenario,
  profiles: {
    profileA: Awaited<ReturnType<typeof loadPairProfiles>>["profileA"];
    profileB: Awaited<ReturnType<typeof loadPairProfiles>>["profileB"];
  },
): Promise<ScenarioReport> {
  const sessionId = liveSmokeSessionId(`s${idx + 1}`);
  const relationship: RelationshipContext = {
    commonGround: [],
    frictionPoints: [],
    fairnessLedger: [],
    pastSessionCount: 0,
  };

  try {
    // 1. analyze conversation (theme detection + constraint extraction)
    const analysis = analyzeConversation(scen.turns, USER_A, USER_B);
    // Force food theme if parser mis-detects (harness scenarios are food-explicit).
    if (analysis.theme !== "food") analysis.theme = "food";

    // 2. live web search
    const decision = decideSearch(analysis);
    const searchCandidates: SearchCandidate[] = decision.shouldSearch
      ? await searchAndFilter(decision, profiles.profileA, profiles.profileB)
      : [];

    const searchTop3 = searchCandidates.slice(0, 3).map((s) => ({
      title: s.title,
      url: s.url,
      source: s.source,
      rating: s.externalRating,
    }));

    // 3. orchestrator (live LLM brief + tier loop + narration)
    const out = await generateFoodProposalV2({
      turns: scen.turns,
      analysis,
      searchCandidates,
      profileA: profiles.profileA,
      profileB: profiles.profileB,
      relationship,
      sessionId,
      userId: USER_A,
      foodLens: scen.foodLens,
      lens: synthLens(),
      foodLensToday: synthFoodLensToday(idx),
    });

    const d = out.diagnostics;
    return {
      name: scen.name,
      sessionId,
      searchTop3,
      queryProjectionCoverage: d.queryProjectionCoverage,
      missingAxes: d.missingAxes,
      droppedAxes: d.droppedAxes,
      appliedTier: d.appliedTier,
      tierAttempts: d.tierAttempts,
      tierThinReason: d.tierThinReason,
      rankedCount: d.rankedCount,
      bookingProviderDistribution: d.bookingProviderDistribution,
      proposalSummary: out.card.summary,
      proposalReasoning: out.card.reasoning,
      proposalCandidates: out.card.candidates.map((c) => ({
        title: c.title,
        url: c.url,
        description: c.description,
      })),
    };
  } catch (err) {
    return {
      name: scen.name,
      sessionId,
      searchTop3: [],
      queryProjectionCoverage: null,
      missingAxes: undefined,
      droppedAxes: undefined,
      appliedTier: undefined,
      tierAttempts: null,
      tierThinReason: undefined,
      rankedCount: 0,
      bookingProviderDistribution: null,
      proposalSummary: "",
      proposalReasoning: "",
      proposalCandidates: [],
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  }
}

// ═════════════════════════════════════════════════════════════════════════
// Pretty printer (1-page report)
// ═════════════════════════════════════════════════════════════════════════

function fmt(v: unknown): string {
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

function printReport(r: ScenarioReport): void {
  console.log(`\n┌─── ${r.name}`);
  console.log(`│ sessionId: ${r.sessionId}`);
  if (r.error) {
    console.log(`│ ERROR: ${r.error}`);
    console.log(`└────`);
    return;
  }

  console.log(`│`);
  console.log(`│ ▼ searchCandidates top 3 (live web)`);
  if (r.searchTop3.length === 0) {
    console.log(`│   (none)`);
  } else {
    r.searchTop3.forEach((s, i) => {
      console.log(`│   [${i + 1}] ${s.title}`);
      console.log(`│       src=${s.source ?? "-"} rating=${s.rating ?? "-"}`);
      console.log(`│       url=${s.url ?? "-"}`);
    });
  }

  console.log(`│`);
  console.log(`│ ▼ query projection (Layer 0 → buildFoodQuery)`);
  console.log(`│   coverage: ${fmt(r.queryProjectionCoverage)}`);
  console.log(`│   missingAxes: ${fmt(r.missingAxes)}`);
  console.log(`│   droppedAxes: ${fmt(r.droppedAxes)}`);

  console.log(`│`);
  console.log(`│ ▼ F-6 tier retry loop`);
  console.log(`│   appliedTier: ${fmt(r.appliedTier)}`);
  console.log(`│   tierAttempts: ${fmt(r.tierAttempts)}`);
  console.log(`│   tierThinReason: ${fmt(r.tierThinReason)}`);
  console.log(`│   rankedCount: ${r.rankedCount}`);

  console.log(`│`);
  console.log(`│ ▼ booking provider distribution`);
  console.log(`│   ${fmt(r.bookingProviderDistribution)}`);

  console.log(`│`);
  console.log(`│ ▼ proposalCard`);
  console.log(`│   summary: ${r.proposalSummary}`);
  console.log(`│   reasoning: ${r.proposalReasoning.slice(0, 300)}${r.proposalReasoning.length > 300 ? "…" : ""}`);
  console.log(`│   candidates (${r.proposalCandidates.length}):`);
  r.proposalCandidates.slice(0, 5).forEach((c, i) => {
    const desc = c.description ?? "";
    console.log(`│     [${i + 1}] ${c.title}`);
    console.log(`│         url=${c.url ?? "-"}`);
    console.log(`│         desc=${desc.slice(0, 150)}${desc.length > 150 ? "…" : ""}`);
  });

  console.log(`└────`);
}

// ═════════════════════════════════════════════════════════════════════════
// Main
// ═════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║ CoAlter F-6 Live Smoke Harness (2026-04-20)               ║");
  console.log("║   COALTER_FOOD_LENS_WIRED=true  COALTER_FOOD_TIER_LOOP=true║");
  console.log(`║   users: A=${USER_A.slice(0, 8)}… B=${USER_B.slice(0, 8)}…            ║`);
  console.log("╚════════════════════════════════════════════════════════════╝");

  const t0 = Date.now();
  const profiles = await loadPairProfiles(admin, USER_A, USER_B);
  console.log(
    `\n[setup] profiles loaded in ${Date.now() - t0}ms ` +
      `(A.interests=${profiles.profileA.interests.length}, B.interests=${profiles.profileB.interests.length})`,
  );

  const reports: ScenarioReport[] = [];
  for (let i = 0; i < SCENARIOS.length; i++) {
    const scen = SCENARIOS[i];
    console.log(`\n[scenario ${i + 1}/${SCENARIOS.length}] ${scen.name} ...`);
    const r = await runScenario(i, scen, profiles);
    reports.push(r);
  }

  console.log("\n\n╔════════════════════════════════════════════════════════════╗");
  console.log("║ 1-PAGE REPORT                                             ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  for (const r of reports) printReport(r);

  console.log(
    `\n[diagnostics log] ${diagnosticsLog.length} food.diagnostics entries intercepted`,
  );

  console.log("\n[done]");
}

main().catch((err) => {
  console.error("[f6-live] fatal:", err);
  process.exit(1);
});
