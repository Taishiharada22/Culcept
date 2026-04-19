/**
 * CoAlter Phase B Commit 4 — food narration 実機確認スクリプト
 *
 * 実際の buildFoodNarrationFromLogic を realistic な RankedFoodCandidate /
 * RankedFoodAlternative / SearchCandidate で叩き、ProposalCard 出力を dump する。
 *
 * CEO 条件:
 *  - 事実改変禁止 (null 補完なし)
 *  - venue facts 由来の practicalInfo
 *  - 5-cat booking label
 *  - alternatives 上限 2
 *  - food theme / coreSlot="where"
 *
 * 実行: npx tsx scripts/coalter-food-preview.ts
 */

import { buildFoodNarrationFromLogic } from "@/lib/coalter/narrationTemplate";
import type {
  CoAlterPersonProfile,
  ConversationBrief,
  FoodVenue,
  RankedFoodAlternative,
  RankedFoodCandidate,
  RelationshipContext,
  SearchCandidate,
} from "@/lib/coalter/types";

// ── Fixtures ──

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
  decisionStyle: { noveltyPreference: 0.7, decisionSpeed: null, riskTolerance: 0.5 },
  interests: ["日本酒", "焼き鳥"],
  values: [],
  archetypeCode: null,
  coreFear: null,
  coreDesire: null,
};

const profileB: CoAlterPersonProfile = {
  userId: "b",
  displayName: "あやか",
  communicationStyle: {
    directVsDiplomatic: null,
    conflictStyle: null,
    attachmentStyle: null,
    reassuranceNeed: null,
    emotionalVariability: null,
  },
  decisionStyle: { noveltyPreference: 0.3, decisionSpeed: null, riskTolerance: 0.3 },
  interests: ["和食", "落ち着いた雰囲気"],
  values: [],
  archetypeCode: null,
  coreFear: null,
  coreDesire: null,
};

const brief: ConversationBrief = {
  theme: "food",
  area: "渋谷",
  approximateTime: { date: "今夜", timeSlot: "night", preferredStartHour: 19 },
  mood: ["落ち着いた"],
  hardConstraints: [],
  rankingAxes: {
    preset: "balance_focus",
    roles: ["balance", "aFocus", "bFocus"],
    rationale: "折り合い優先",
  },
  primaryUnresolvedQuestion: null,
  confidence: 0.8,
  source: "llm",
};

const relationship: RelationshipContext = {
  commonGround: [],
  frictionPoints: [],
  fairnessLedger: [],
  pastSessionCount: 2,
};

function venue(over: Partial<FoodVenue> = {}): FoodVenue {
  return {
    name: "酒と肴 いぶり",
    station: "渋谷駅",
    area: "道玄坂",
    priceBand: "¥3,000〜¥3,999",
    openingHours: "17:00-24:00",
    rating: "3.52",
    snippet: "渋谷駅から徒歩 5 分。日本酒が豊富な居酒屋。",
    ...over,
  };
}

function frc(over: Partial<RankedFoodCandidate> = {}): RankedFoodCandidate {
  return {
    candidateKey: "food:tabelog.com:いぶり:渋谷",
    role: "balance",
    venue: venue(),
    sourceUrl: "https://tabelog.com/tokyo/A1303/A130301/13012345/",
    sourceDomain: "tabelog.com",
    confidence: 0.82,
    axisScores: { balance: 0.8 },
    totalScore: 0.8,
    rationale: {
      matchedInterestsA: ["日本酒"],
      matchedInterestsB: ["和食"],
      matchedValuesA: [],
      matchedValuesB: [],
      appealedAxis: ["balance"],
      tradeoff: null,
      contingencyHint: null,
    },
    breakdown: {
      metrics: {
        budgetFit: 0.8,
        areaFit: 1,
        quietnessFit: 0.7,
        novelty: 0.5,
        cuisineMatchA: 0.8,
        cuisineMatchB: 0.7,
        moodMatch: 0.7,
        ratingFit: 0.7,
        compromiseQuality: 0.3,
      },
      roleScores: { balance: 0.8 },
      assignedRole: "balance",
    },
    ...over,
  };
}

const ranked: RankedFoodCandidate[] = [
  frc(),
  frc({
    candidateKey: "food:tabelog.com:割烹みやこ:渋谷",
    role: "bFocus",
    venue: venue({
      name: "割烹 みやこ",
      station: "渋谷駅",
      area: "松濤",
      priceBand: "¥5,000〜¥5,999",
      openingHours: "17:30-22:30",
      rating: "3.71",
      snippet: "渋谷の静かな和食。個室あり。",
    }),
    sourceUrl: "https://tabelog.com/tokyo/A1303/A130301/13067890/",
    confidence: 0.88,
    rationale: {
      matchedInterestsA: [],
      matchedInterestsB: ["和食", "落ち着いた雰囲気"],
      matchedValuesA: [],
      matchedValuesB: [],
      appealedAxis: ["bFocus"],
      tradeoff: null,
      contingencyHint: null,
    },
  }),
  frc({
    candidateKey: "food:official:炭火焼風月:渋谷",
    role: "aFocus",
    venue: venue({
      name: "炭火焼 風月",
      station: "渋谷駅",
      area: "神泉",
      priceBand: "¥4,000〜¥4,999",
      openingHours: "18:00-24:00",
      rating: null, // 事実なしパターン
      snippet: "炭火焼鳥の専門店。日本酒も豊富。",
    }),
    sourceUrl: "https://fugetsu-shibuya.com/reservation/",
    sourceDomain: "fugetsu-shibuya.com",
    confidence: 0.72,
    rationale: {
      matchedInterestsA: ["焼き鳥", "日本酒"],
      matchedInterestsB: [],
      matchedValuesA: [],
      matchedValuesB: [],
      appealedAxis: ["aFocus"],
      tradeoff: null,
      contingencyHint: null,
    },
  }),
];

const alternatives: RankedFoodAlternative[] = [
  {
    candidateKey: "food:tabelog.com:居酒屋あおい:渋谷",
    venue: venue({
      name: "居酒屋 あおい",
      station: "渋谷駅",
      area: null, // area null pattern
      priceBand: "¥2,500〜¥2,999",
      openingHours: "17:00-23:00",
      rating: "3.40",
    }),
    sourceUrl: "https://tabelog.com/tokyo/A1303/A130301/13099999/",
    reason: "安心枠としても成立（価格帯軽め）",
    topRole: "safety",
    topRoleScore: 0.6,
  },
];

const searchCandidates: SearchCandidate[] = [
  {
    title: "酒と肴 いぶり",
    description: "渋谷駅 徒歩 5 分。日本酒 30 種。17:00-24:00。",
    externalRating: "3.52",
    practicalInfo: null,
    source: "食べログ",
    url: "https://tabelog.com/tokyo/A1303/A130301/13012345/",
  },
  {
    title: "割烹 みやこ",
    description: "渋谷駅 徒歩 7 分。松濤の静かな和食。個室あり。",
    externalRating: "3.71",
    practicalInfo: null,
    source: "食べログ",
    url: "https://tabelog.com/tokyo/A1303/A130301/13067890/",
  },
  {
    title: "炭火焼 風月",
    description: "神泉駅 徒歩 3 分。公式サイトから予約可能。",
    externalRating: null,
    practicalInfo: null,
    source: "公式",
    url: "https://fugetsu-shibuya.com/reservation/",
  },
];

// ── Run ──

const card = buildFoodNarrationFromLogic({
  ranked,
  brief,
  profileA,
  profileB,
  relationship,
  alternatives,
  searchCandidates,
});

// ── Dump ──

console.log("════════════════════════════════════════════════════════════");
console.log(" CoAlter Phase B Commit 4 — food narration 実機出力");
console.log("════════════════════════════════════════════════════════════\n");

console.log("【theme】", card.theme);
console.log();
console.log("【summary】");
console.log(" ", card.summary);
console.log();
console.log("【priorities】");
console.log("  A:", card.priorities.userA);
console.log("  B:", card.priorities.userB);
console.log("  共通:", card.priorities.common);
console.log();
console.log("【reasoning】");
console.log(" ", card.reasoning);
console.log();
console.log("【closing】");
console.log(" ", card.closing);
console.log();
console.log("【candidates】");
for (const c of card.candidates) {
  console.log(`\n  #${c.rank} ${c.title}`);
  console.log(`    theme/coreSlot : ${c.theme} / ${c.coreSlot}`);
  console.log(`    oneLiner       : ${c.oneLiner}`);
  console.log(`    practicalInfo  : ${c.practicalInfo ?? "(null)"}`);
  console.log(`    url            : ${c.url ?? "(null)"}`);
  console.log(`    slots.what     : ${JSON.stringify(c.slots?.what)}`);
  console.log(`    slots.where    : ${JSON.stringify(c.slots?.where)}`);
  console.log(`    slots.when     : ${JSON.stringify(c.slots?.when)}`);
  if (c.detail) {
    console.log(`    --- detail (bottom sheet) ---`);
    console.log(`    why2People     : ${c.detail.why2People}`);
    console.log(`    address        : ${c.detail.address ?? "(null)"}`);
    console.log(`    access         : ${c.detail.access ?? "(null)"}`);
    console.log(`    priceBand      : ${c.detail.priceBand ?? "(null)"}`);
    console.log(`    operatingHours : ${c.detail.operatingHours ?? "(null)"}`);
    if (c.detail.booking) {
      console.log(`    booking:`);
      console.log(`      providerType : ${c.detail.booking.providerType}`);
      console.log(`      providerName : ${c.detail.booking.providerName ?? "(null)"}`);
      console.log(`      label        : ${c.detail.booking.label}`);
      console.log(`      confidence   : ${c.detail.booking.confidence}`);
      console.log(`      url          : ${c.detail.booking.bookingUrl ?? c.detail.booking.officialUrl ?? "(null)"}`);
    } else {
      console.log(`    booking        : (null)`);
    }
    console.log(`    alternatives   : [${c.detail.alternatives.length} 件]`);
    for (const a of c.detail.alternatives) {
      console.log(`      - ${a.title} | ${a.reason} | ${a.url ?? "(no url)"}`);
    }
    console.log(`    sources        : [${c.detail.sources.length} 件]`);
    for (const s of c.detail.sources) {
      console.log(`      - ${s.label} | ${s.url}`);
    }
  } else {
    console.log(`    detail        : (null)`);
  }
}

console.log("\n════════════════════════════════════════════════════════════");
console.log(" 事実改変禁止 監査");
console.log("════════════════════════════════════════════════════════════");

// 炭火焼 風月 は rating=null の venue → practicalInfo に rating token が無いこと
const fugetsu = card.candidates.find((c) => c.title === "炭火焼 風月");
if (fugetsu) {
  const hasRating = /\d\.\d{2}|★|評価/.test(fugetsu.practicalInfo ?? "");
  console.log(`  炭火焼 風月 (rating=null) practicalInfo 中の rating 痕跡: ${hasRating ? "❌ 検出" : "✅ なし"}`);
}

// 居酒屋 あおい (alternative, area=null) → detail に出ないはず
const ibri = card.candidates.find((c) => c.title === "酒と肴 いぶり");
if (ibri?.detail) {
  const altAoi = ibri.detail.alternatives.find((a) => a.title === "居酒屋 あおい");
  console.log(`  居酒屋 あおい alternative: ${altAoi ? "✅ 出力に含まれる" : "❌ 出ていない"}`);
}

// why2People に駅/徒歩/円/時/分 が混入していないこと
for (const c of card.candidates) {
  const w = c.detail?.why2People ?? "";
  const leak = /駅|徒歩|円|¥|\d+:\d+|\d+分/.test(w);
  console.log(`  ${c.title.padEnd(18, " ")} why2People 事実混入: ${leak ? "❌ 検出" : "✅ なし"}`);
}

// 炭火焼 風月 は 公式 + /reservation/ → official + high
if (fugetsu?.detail?.booking) {
  const b = fugetsu.detail.booking;
  console.log(
    `  炭火焼 風月 booking: providerType=${b.providerType} / label="${b.label}" / confidence=${b.confidence}`,
  );
}

// いぶり / みやこ は tabelog → third_party_listing
const miyako = card.candidates.find((c) => c.title === "割烹 みやこ");
if (ibri?.detail?.booking)
  console.log(`  いぶり    booking: providerType=${ibri.detail.booking.providerType} / label="${ibri.detail.booking.label}"`);
if (miyako?.detail?.booking)
  console.log(`  みやこ    booking: providerType=${miyako.detail.booking.providerType} / label="${miyako.detail.booking.label}"`);

console.log();
