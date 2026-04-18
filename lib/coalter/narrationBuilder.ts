/**
 * CoAlter Layer 3a: Narration Builder (logic)
 *
 * RankedCandidate[] → ProposalCandidate[] + priorities + reasoning (logic 起源)
 *
 * 設計:
 *  - practicalInfo は事実のみ（劇場・時刻・上映時間・評価）
 *  - oneLiner は role + 2 人の interest/mood 一致から決定論的に合成
 *  - reasoning は preset.rationale + 役割ラベルの統合
 *  - priorities は L1 profile 由来
 *
 * CEO 方針: 「品質は絶対に落としません」
 * → template ではなく事実ベースの構造化本文。LLM enricher が無くてもこれ単体で成立。
 */

import type {
  CandidateAlternative,
  CandidateDetail,
  CandidateSource,
  ConversationBrief,
  CoAlterPersonProfile,
  ProposalCandidate,
  ProposalCard,
  RankedAlternative,
  RankedCandidate,
  RankingRole,
  SearchCandidate,
} from "./types";
import type { SlotBundle } from "./slots";
import { resolveBookingHandoff } from "./bookingResolver";

// ─────────────────────────────────────────────
// Role → 表現ラベル
// ─────────────────────────────────────────────

const ROLE_HEADLINE: Record<RankingRole, string> = {
  balance: "2人の折り合いが取りやすい1本",
  aFocus: "Aさんの好みに寄せた1本",
  bFocus: "Bさんの好みに寄せた1本",
  safety: "外しにくい安心枠",
  adventure: "少し冒険してみる1本",
  discovery: "新しい発見になりそうな1本",
  calm: "落ち着いて楽しめる1本",
  stimulating: "気分を上げてくれる刺激枠",
  nostalgic: "余韻と懐かしさが残る1本",
};

const ROLE_PRIORITY_CUE: Record<RankingRole, string> = {
  balance: "折り合い",
  aFocus: "Aさんの関心",
  bFocus: "Bさんの関心",
  safety: "ハズレ回避",
  adventure: "新しさ",
  discovery: "発見の楽しさ",
  calm: "落ち着き",
  stimulating: "刺激・高揚",
  nostalgic: "ノスタルジー",
};

// ─────────────────────────────────────────────
// practicalInfo（事実のみ）
// ─────────────────────────────────────────────

export function buildPracticalInfo(c: RankedCandidate): string {
  const parts: string[] = [];
  if (c.theater) parts.push(c.theater);
  if (c.showtime) parts.push(`${c.showtime}〜`);
  if (c.runtimeMinutes) parts.push(`${c.runtimeMinutes}分`);
  if (c.rating) parts.push(c.rating);
  if (c.releaseStatus === "upcoming") parts.push("公開予定");
  return parts.join(" / ");
}

// ─────────────────────────────────────────────
// oneLiner (logic)
// ─────────────────────────────────────────────

export function buildOneLiner(c: RankedCandidate): string {
  const headline = ROLE_HEADLINE[c.role];
  // matched interests があれば 1 つだけ添える
  const allMatched = [
    ...c.rationale.matchedInterestsA,
    ...c.rationale.matchedInterestsB,
  ];
  if (allMatched.length > 0) {
    return `${headline}（${allMatched[0]}が響くはず）`;
  }
  return headline;
}

// ─────────────────────────────────────────────
// slots 合成（movie テーマ）
// ─────────────────────────────────────────────

function buildSlots(c: RankedCandidate): SlotBundle {
  const slots: SlotBundle = {};
  slots.what = {
    label: c.title,
    detail: c.runtimeMinutes ? `${c.runtimeMinutes}分` : undefined,
    status: "confirmed",
  };
  if (c.theater) {
    slots.where = {
      label: c.theater,
      detail: undefined,
      status: "confirmed",
    };
  }
  if (c.showtime) {
    slots.when = {
      label: `${c.showtime}〜`,
      status: "confirmed",
    };
  }
  return slots;
}

// ─────────────────────────────────────────────
// Priorities (L1 + brief)
// ─────────────────────────────────────────────

export function buildPriorities(
  ranked: RankedCandidate[],
  brief: ConversationBrief,
  profileA: CoAlterPersonProfile,
  profileB: CoAlterPersonProfile,
): ProposalCard["priorities"] {
  // どの role が A 寄り / B 寄り / 共通かを集計
  const rolesUsed = ranked.map((r) => r.role);

  // A が重視していそうな方向
  const userA = describePriority(rolesUsed, "A", profileA, brief);
  const userB = describePriority(rolesUsed, "B", profileB, brief);
  // 共通点: 両方の matchedInterests に出てくるもの
  const commonInterests = new Set<string>();
  for (const r of ranked) {
    const a = new Set(r.rationale.matchedInterestsA);
    for (const b of r.rationale.matchedInterestsB) if (a.has(b)) commonInterests.add(b);
  }
  const common =
    commonInterests.size > 0
      ? `2人ともに響きそうなのは「${[...commonInterests].slice(0, 2).join("・")}」`
      : null;

  return { userA, userB, common };
}

function describePriority(
  roles: RankingRole[],
  who: "A" | "B",
  profile: CoAlterPersonProfile,
  brief: ConversationBrief,
): string {
  const cues: string[] = [];
  // novelty 志向
  const novelty = profile.decisionStyle.noveltyPreference;
  if (novelty !== null) {
    if (novelty > 0.6) cues.push("新しさ・話題性");
    else if (novelty < 0.4) cues.push("安心・定番感");
  }
  // risk tolerance
  const risk = profile.decisionStyle.riskTolerance;
  if (risk !== null) {
    if (risk < 0.4) cues.push("ハズレ回避");
  }
  // interests（先頭 2 つだけ）
  if (profile.interests.length > 0) cues.push(profile.interests.slice(0, 2).join("・"));

  // 該当 role ベースの補足
  if (who === "A" && roles.includes("aFocus")) cues.unshift("自分の好みに沿うこと");
  if (who === "B" && roles.includes("bFocus")) cues.unshift("自分の好みに沿うこと");

  if (cues.length === 0) {
    return brief.mood.length > 0
      ? `今は「${brief.mood[0]}」気分が合う`
      : "今回はフラットに選びたい";
  }
  return cues.slice(0, 3).join(" / ");
}

// ─────────────────────────────────────────────
// Reasoning (なぜこの提案か)
// ─────────────────────────────────────────────

export function buildReasoning(
  ranked: RankedCandidate[],
  brief: ConversationBrief,
): string {
  const roleCues = ranked
    .map((r) => ROLE_PRIORITY_CUE[r.role])
    .filter((v, i, arr) => arr.indexOf(v) === i);

  const axisText = `今回は「${roleCues.join(" / ")}」の軸で並べました。`;
  const presetRationale = brief.rankingAxes.rationale
    ? `${brief.rankingAxes.rationale}。`
    : "";
  const moodText = brief.mood.length > 0
    ? `空気感は「${brief.mood.slice(0, 2).join("・")}」寄りで調整。`
    : "";

  return `${presetRationale}${axisText}${moodText}あとは2人で話して決めてね。`.trim();
}

// ─────────────────────────────────────────────
// Summary (会話の要点)
// ─────────────────────────────────────────────

export function buildSummary(
  brief: ConversationBrief,
  ranked: RankedCandidate[],
): string {
  const parts: string[] = [];
  if (brief.area) parts.push(brief.area);
  if (brief.approximateTime.date) parts.push(brief.approximateTime.date);
  if (brief.approximateTime.timeSlot) {
    const label: Record<string, string> = {
      morning: "朝",
      afternoon: "昼",
      evening: "夕方",
      night: "夜",
    };
    parts.push(label[brief.approximateTime.timeSlot] ?? brief.approximateTime.timeSlot);
  }

  const when = parts.length > 0 ? parts.join("・") : "近いうち";
  if (ranked.length === 0) {
    return `${when}で映画を決めたい様子。候補を絞り込むためにもう少し情報が欲しい。`;
  }
  return `${when}で見る映画を選びたい流れ。2人の好みと公開情報を突き合わせて${ranked.length}本に絞った。`;
}

// ─────────────────────────────────────────────
// Closing
// ─────────────────────────────────────────────

export function buildClosing(): string {
  return "ここから先は2人で話して決めてね。";
}

// ─────────────────────────────────────────────
// Main: logic-only ProposalCandidate 合成
// ─────────────────────────────────────────────

export function buildProposalCandidates(
  ranked: RankedCandidate[],
): ProposalCandidate[] {
  return ranked.map((c, i) => ({
    rank: i + 1,
    title: c.title,
    oneLiner: buildOneLiner(c),
    practicalInfo: buildPracticalInfo(c) || null,
    url: c.sourceUrl || null,
    slots: buildSlots(c),
    theme: "movie" as const,
    coreSlot: "what",
  }));
}

// ─────────────────────────────────────────────
// CandidateDetail (Phase A 2026-04-18) — bottom sheet 用
// ─────────────────────────────────────────────

/**
 * Movie 候補の詳細を logic 合成する。
 *
 * - why2People: role + matched interests から 1-2 文を組み立てる
 * - address / access / operatingHours: catalog + searchCandidates から抽出
 * - alternatives: Layer 2 residual (上限 2)
 * - booking: resolveBookingHandoff へ委譲（CTA label 決定を含む）
 * - sources: matching searchCandidates のユニーク URL 一覧
 */
export function buildCandidateDetail(args: {
  candidate: RankedCandidate;
  alternatives: RankedAlternative[];
  searchCandidates: SearchCandidate[];
  brief: ConversationBrief;
}): CandidateDetail {
  const { candidate, alternatives, searchCandidates, brief } = args;

  // address / access / operatingHours / priceBand
  const matched = pickMatchingSearchCandidates(
    candidate.title,
    candidate.theater,
    searchCandidates,
  );

  const address = candidate.theater ?? null;
  const access = extractAccess(matched);
  const operatingHours = buildOperatingHours(candidate);
  const priceBand: string | null = null; // movie では一旦空。Phase B 食事で使う

  // why2People
  const why2People = buildWhy2People(candidate);

  // alternatives → CandidateAlternative[]
  const altOut: CandidateAlternative[] = alternatives
    .filter((a) => a.title !== candidate.title)
    .slice(0, 2)
    .map((a) => ({
      title: a.title,
      reason: a.reason,
      url: a.sourceUrl || null,
    }));

  // booking handoff
  const booking = resolveBookingHandoff({
    theme: brief.theme,
    candidateTitle: candidate.title,
    candidateTheater: candidate.theater,
    catalogSourceUrl: candidate.sourceUrl || null,
    searchCandidates,
  });

  // sources
  const sources = buildSources(candidate, matched);

  return {
    why2People,
    address,
    access,
    priceBand,
    operatingHours,
    alternatives: altOut,
    booking,
    sources,
  };
}

function buildWhy2People(c: RankedCandidate): string {
  const { rationale, role } = c;
  const aHit = rationale.matchedInterestsA.slice(0, 2);
  const bHit = rationale.matchedInterestsB.slice(0, 2);

  const roleLabel = ROLE_PRIORITY_CUE[role];

  if (aHit.length > 0 && bHit.length > 0) {
    const common = aHit.filter((x) => bHit.includes(x));
    if (common.length > 0) {
      return `2人ともに響く「${common[0]}」の要素があり、${roleLabel}の軸で中間が取れる1本。`;
    }
    return `Aには「${aHit[0]}」、Bには「${bHit[0]}」にそれぞれ引っかかる要素がある。${roleLabel}として据えた。`;
  }
  if (aHit.length > 0) {
    return `Aの「${aHit[0]}」寄りに振った1本。${roleLabel}の役割として機能する。`;
  }
  if (bHit.length > 0) {
    return `Bの「${bHit[0]}」寄りに振った1本。${roleLabel}の役割として機能する。`;
  }
  return `${roleLabel}を主眼に据えた1本。2人の好みから外しにくい中間に置いた。`;
}

function buildOperatingHours(c: RankedCandidate): string | null {
  if (c.showtime) {
    const runtime = c.runtimeMinutes ? ` (${c.runtimeMinutes}分)` : "";
    return `${c.showtime}〜${runtime}`;
  }
  if (c.releaseStatus === "upcoming") return "公開予定";
  return null;
}

function extractAccess(matched: SearchCandidate[]): string | null {
  // practicalInfo / description から「〇〇駅 徒歩X分」「〇〇から徒歩」パターンを拾う
  const pattern = /([^\s、。「」]{1,10}駅[^。、\n]{0,4}徒歩\s?\d+\s?分)/;
  for (const sc of matched) {
    for (const field of [sc.practicalInfo, sc.description]) {
      if (!field) continue;
      const m = field.match(pattern);
      if (m) return m[1];
    }
  }
  return null;
}

function pickMatchingSearchCandidates(
  title: string,
  theater: string | null,
  searchCandidates: SearchCandidate[],
): SearchCandidate[] {
  const nt = title.toLowerCase().replace(/[\s　]/g, "");
  const matches: SearchCandidate[] = [];
  for (const sc of searchCandidates) {
    const nsc = sc.title.toLowerCase().replace(/[\s　]/g, "");
    const descNorm = `${sc.title} ${sc.description ?? ""} ${sc.practicalInfo ?? ""}`
      .toLowerCase()
      .replace(/[\s　]/g, "");
    const titleMatch = nsc.includes(nt) || nt.includes(nsc) || descNorm.includes(nt);
    if (!titleMatch) continue;
    if (theater) {
      const nth = theater.toLowerCase().replace(/[\s　]/g, "");
      // theater が description / title に出ていれば優先。無くても許容。
      if (!descNorm.includes(nth) && !nsc.includes(nth)) {
        // theater 不一致でも title が完全一致してれば採用
        if (!(nsc === nt || descNorm.includes(nt))) continue;
      }
    }
    matches.push(sc);
  }
  return matches;
}

function buildSources(
  candidate: RankedCandidate,
  matched: SearchCandidate[],
): CandidateSource[] {
  const seen = new Set<string>();
  const out: CandidateSource[] = [];

  // catalog sourceUrl を最優先
  if (candidate.sourceUrl) {
    seen.add(candidate.sourceUrl);
    out.push({ label: "上映情報", url: candidate.sourceUrl });
  }

  for (const sc of matched) {
    if (!sc.url || seen.has(sc.url)) continue;
    seen.add(sc.url);
    out.push({ label: sc.source || "参考", url: sc.url });
    if (out.length >= 4) break;
  }
  return out;
}

export const __internal = {
  ROLE_HEADLINE,
  ROLE_PRIORITY_CUE,
  buildSlots,
  buildWhy2People,
  pickMatchingSearchCandidates,
  extractAccess,
  buildSources,
};
