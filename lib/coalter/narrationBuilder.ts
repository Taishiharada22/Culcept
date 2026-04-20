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
  ConversationTheme,
  CoAlterPersonProfile,
  ProposalCandidate,
  ProposalCard,
  RankedAlternative,
  RankedCandidate,
  RankedFoodAlternative,
  RankedFoodCandidate,
  RankingRole,
  SearchCandidate,
} from "./types";
import type { SlotBundle } from "./slots";
import { resolveBookingHandoff } from "./bookingResolver";

// ─────────────────────────────────────────────
// Role → 表現ラベル
//
// Phase B Commit 4 (2026-04-19): ROLE_HEADLINE を theme × role の二重 Record に拡張。
// 内部 role semantics は共通、表示文言だけ theme で切り替える（CEO 条件）。
// 将来 travel / date 等を追加するときは headline の辞書を足すだけで済む。
//
// ROLE_PRIORITY_CUE は theme 非依存の抽象語（"折り合い"/"ハズレ回避"等）。
// CEO 条件: priority cue まで theme 分岐させない。共通維持。
// ─────────────────────────────────────────────

/** 現時点で role headline を持つ theme の部分型（未対応 theme は movie 語彙に fallback） */
type HeadlineTheme = "movie" | "food";

const ROLE_HEADLINE_BY_THEME: Record<HeadlineTheme, Record<RankingRole, string>> = {
  movie: {
    balance: "2人の折り合いが取りやすい1本",
    aFocus: "Aさんの好みに寄せた1本",
    bFocus: "Bさんの好みに寄せた1本",
    safety: "外しにくい安心枠",
    adventure: "少し冒険してみる1本",
    discovery: "新しい発見になりそうな1本",
    calm: "落ち着いて楽しめる1本",
    stimulating: "気分を上げてくれる刺激枠",
    nostalgic: "余韻と懐かしさが残る1本",
  },
  food: {
    balance: "2人の折り合いが取りやすい1軒",
    aFocus: "Aさんの好みに寄せた1軒",
    bFocus: "Bさんの好みに寄せた1軒",
    safety: "外しにくい安心の1軒",
    adventure: "少し冒険してみる1軒",
    discovery: "新しい発見になりそうな1軒",
    calm: "落ち着いて過ごせる1軒",
    stimulating: "気分を上げてくれる1軒",
    nostalgic: "余韻と懐かしさが残る1軒",
  },
};

/**
 * theme に対応する headline 辞書を返す。未対応 theme は movie 辞書に fallback。
 * （travel / schedule / gift 等は将来追加予定。fallback で事故らず配信する契約）
 */
function getRoleHeadlineTable(theme: ConversationTheme | undefined): Record<RankingRole, string> {
  if (theme === "food") return ROLE_HEADLINE_BY_THEME.food;
  return ROLE_HEADLINE_BY_THEME.movie;
}

/**
 * movie 側の後方互換エクスポート。
 * 既存 (Commit 3 以前) では `ROLE_HEADLINE[role]` で参照できていたので、
 * movie semantics を壊さないために movie 辞書を同名で維持する。
 */
const ROLE_HEADLINE: Record<RankingRole, string> = ROLE_HEADLINE_BY_THEME.movie;

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

/**
 * food 版 practicalInfo — 事実のみで組み立てる。
 *
 * 順序: stationOrArea → priceBand → openingHours → rating
 * 最大 4 token、" / " 区切り。すべて null なら空文字（呼び出し側が null に正規化）。
 *
 * 事実改変禁止:
 *  - 各フィールドが null のときは何も足さない（"価格帯不明" 等を作らない）
 *  - station と area の両方が null でも OK（その行をまるごと落とす）
 */
export function buildPracticalInfoFood(c: RankedFoodCandidate): string {
  const v = c.venue;
  const parts: string[] = [];
  const loc = composeStationOrArea(v.station, v.area);
  if (loc) parts.push(loc);
  if (v.priceBand) parts.push(v.priceBand);
  if (v.openingHours) parts.push(v.openingHours);
  if (v.rating) parts.push(v.rating);
  return parts.join(" / ");
}

/**
 * FoodVenue の station / area を 1 行にまとめる。両方 null なら null を返す（"エリア情報なし" の創作はしない）。
 *
 * - station のみ: 「渋谷駅」
 * - area のみ: 「代官山」
 * - 両方: 「代官山（渋谷駅）」
 */
function composeStationOrArea(
  station: string | null,
  area: string | null,
): string | null {
  if (station && area) return `${area}（${station}）`;
  if (area) return area;
  if (station) return station;
  return null;
}

// ─────────────────────────────────────────────
// oneLiner (logic)
// ─────────────────────────────────────────────

export function buildOneLiner(
  c: RankedCandidate,
  theme: ConversationTheme | undefined = "movie",
): string {
  const headline = getRoleHeadlineTable(theme)[c.role];
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

/**
 * RankedFoodCandidate 向け oneLiner。
 *
 * headline は food 辞書を参照。matchedInterests 結合部は movie と同ロジック
 * （末尾「が響くはず」は食でも違和感なし — CEO 追認の反証 2）。
 */
export function buildOneLinerFood(c: RankedFoodCandidate): string {
  const headline = getRoleHeadlineTable("food")[c.role];
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

/**
 * food 版 slots 合成。
 *
 * - what: venue.name + priceBand (detail、null なら undefined)
 * - where: station/area 複合（null なら slot 省略）
 * - when: openingHours を生で採用（"営業時間帯に合わせて" 等の創作なし）
 *
 * 事実改変禁止: null は slot を出さない。ラベルに「不明」「未定」を書かない。
 */
function buildSlotsFood(c: RankedFoodCandidate): SlotBundle {
  const slots: SlotBundle = {};
  const v = c.venue;
  slots.what = {
    label: v.name,
    detail: v.priceBand ?? undefined,
    status: "confirmed",
  };
  const loc = composeStationOrArea(v.station, v.area);
  if (loc) {
    slots.where = {
      label: loc,
      detail: undefined,
      status: "confirmed",
    };
  }
  if (v.openingHours) {
    slots.when = {
      label: v.openingHours,
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

/**
 * brief の area / approximateTime から「いつどこ」を表す日本語を組み立てる。
 *
 * Commit 4 で movie / food 両方の summary が共有する。
 * すべて null のときは "近いうち" に落とす（創作はしない — 約束された空文字 fallback）。
 */
export function formatWhenFromBrief(brief: ConversationBrief): string {
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
  return parts.length > 0 ? parts.join("・") : "近いうち";
}

export function buildSummary(
  brief: ConversationBrief,
  ranked: RankedCandidate[],
): string {
  const when = formatWhenFromBrief(brief);
  if (ranked.length === 0) {
    return `${when}で映画を決めたい様子。候補を絞り込むためにもう少し情報が欲しい。`;
  }
  return `${when}で見る映画を選びたい流れ。2人の好みと公開情報を突き合わせて${ranked.length}本に絞った。`;
}

/**
 * food 版 summary。
 *
 * 事実改変禁止: brief に area / date / timeSlot が 1 つも無ければ "近いうち" に落ち、
 * 具体的な場所や時刻を創作しない。ranked が空なら primaryUnresolvedQuestion 前提で
 * clarify 寄りに倒す（orchestrator が別経路で質問を出すため、ここは控えめな文）。
 */
export function buildSummaryFood(
  brief: ConversationBrief,
  ranked: RankedFoodCandidate[],
): string {
  const when = formatWhenFromBrief(brief);
  if (ranked.length === 0) {
    return `${when}でご飯をどこで食べるか決めたい様子。候補を絞り込むためにもう少し情報が欲しい。`;
  }
  return `${when}でご飯をどこで食べるか選びたい流れ。2人の好みとお店情報を突き合わせて${ranked.length}軒に絞った。`;
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
    oneLiner: buildOneLiner(c, "movie"),
    practicalInfo: buildPracticalInfo(c) || null,
    url: c.sourceUrl || null,
    slots: buildSlots(c),
    theme: "movie" as const,
    coreSlot: "what",
  }));
}

/**
 * food 版 ProposalCandidate 合成。
 *
 * - title = venue.name（LLM 改変禁止。venue は pure entity）
 * - oneLiner は theme="food" の ROLE_HEADLINE を使う
 * - practicalInfo は 4 トークン以内で場所/価格/時間/評価
 * - axisScores は RankingRole 型で AxisKey 型と食い違うため渡さない
 *   （既存 movie 側でも path によっては未設定のため互換）
 * - theme = "food" 固定
 * - coreSlot = "where" 固定（food は「どこで食べるか」が主軸）
 */
export function buildProposalCandidatesFood(
  ranked: RankedFoodCandidate[],
): ProposalCandidate[] {
  return ranked.map((c, i) => {
    const practical = buildPracticalInfoFood(c);
    return {
      rank: i + 1,
      title: c.venue.name,
      oneLiner: buildOneLinerFood(c),
      practicalInfo: practical || null,
      url: c.sourceUrl || null,
      slots: buildSlotsFood(c),
      theme: "food" as const,
      coreSlot: "where",
    };
  });
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

/**
 * food 版 why2People。
 *
 * 事実改変禁止: 場所・時間・価格を一切含めない（venue facts は facts ブロックが出す）。
 * matchedInterests / role が source。抽象語のみ。
 *
 * fallback 文も事実改変禁止契約に準拠:
 *  - 「2人の好みから外しにくい中間に置いた」は role の意味を抽象的に説明するだけ
 *  - 価格帯・営業時間・駅名など pure entity 事実は含めない
 */
function buildWhy2PeopleFood(c: RankedFoodCandidate): string {
  const { rationale, role } = c;
  const aHit = rationale.matchedInterestsA.slice(0, 2);
  const bHit = rationale.matchedInterestsB.slice(0, 2);

  const roleLabel = ROLE_PRIORITY_CUE[role];

  if (aHit.length > 0 && bHit.length > 0) {
    const common = aHit.filter((x) => bHit.includes(x));
    if (common.length > 0) {
      return `2人ともに響く「${common[0]}」の要素があり、${roleLabel}の軸で中間が取れる1軒。`;
    }
    return `Aには「${aHit[0]}」、Bには「${bHit[0]}」にそれぞれ引っかかる要素がある。${roleLabel}として据えた。`;
  }
  if (aHit.length > 0) {
    return `Aの「${aHit[0]}」寄りに振った1軒。${roleLabel}の役割として機能する。`;
  }
  if (bHit.length > 0) {
    return `Bの「${bHit[0]}」寄りに振った1軒。${roleLabel}の役割として機能する。`;
  }
  return `${roleLabel}を主眼に据えた1軒。2人の好みから外しにくい中間に置いた。`;
}

function buildOperatingHours(c: RankedCandidate): string | null {
  if (c.showtime) {
    const runtime = c.runtimeMinutes ? ` (${c.runtimeMinutes}分)` : "";
    return `${c.showtime}〜${runtime}`;
  }
  if (c.releaseStatus === "upcoming") return "公開予定";
  return null;
}

/**
 * food 版 operatingHours — venue.openingHours をそのまま返す。
 * null なら null（detail.operatingHours が "時間" facts 行の表示制御をする）。
 */
function buildOperatingHoursFood(c: RankedFoodCandidate): string | null {
  return c.venue.openingHours ?? null;
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

/**
 * food 版 CandidateDetail — 事実整合性契約の中心。
 *
 * 共通: why2People（role+matched interests 抽象語のみ）、alternatives、booking、sources
 * food 固有:
 *   address = composeStationOrArea(station, area)（両 null なら null）
 *   priceBand = venue.priceBand（null なら null）
 *   operatingHours = venue.openingHours（null なら null）
 *   access = searchCandidates から「駅徒歩」パターン抽出（共通 extractAccess 流用）
 *
 * 事実改変禁止 4 フィールド独立:
 *  - stationOrArea null → detail.address null
 *  - priceBand null → detail.priceBand null
 *  - openingHours null → detail.operatingHours null
 *  - rating null → practicalInfo から rating token が落ちる（detail 側には項目なし）
 */
export function buildCandidateDetailFood(args: {
  candidate: RankedFoodCandidate;
  alternatives: RankedFoodAlternative[];
  searchCandidates: SearchCandidate[];
  brief: ConversationBrief;
}): CandidateDetail {
  const { candidate, alternatives, searchCandidates, brief } = args;

  const v = candidate.venue;

  // matched search candidates を取得（access 抽出 + sources 両方に使う）
  const matched = pickMatchingSearchCandidatesFood(
    v.name,
    composeStationOrArea(v.station, v.area),
    searchCandidates,
  );

  const address = composeStationOrArea(v.station, v.area); // 両 null なら null
  const access = extractAccess(matched);
  const priceBand = v.priceBand ?? null;
  const operatingHours = buildOperatingHoursFood(candidate);

  // why2People は抽象語のみ（事実含めない）
  const why2People = buildWhy2PeopleFood(candidate);

  // alternatives → CandidateAlternative[] (上限 2、重複除外)
  const altOut: CandidateAlternative[] = alternatives
    .filter((a) => a.venue.name !== v.name)
    .slice(0, 2)
    .map((a) => ({
      title: a.venue.name,
      reason: a.reason,
      url: a.sourceUrl || null,
    }));

  // booking handoff — resolver は 5 分類の providerType/label/confidence を返す
  // food では candidateTheater は使わないので null を渡す
  const booking = resolveBookingHandoff({
    theme: brief.theme,
    candidateTitle: v.name,
    candidateTheater: null,
    catalogSourceUrl: candidate.sourceUrl || null,
    searchCandidates,
  });

  // sources — venue name / station / area を渡す
  const sources = buildSourcesFood(candidate, matched);

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

/**
 * food 用 searchCandidate 絞り込み。
 * title = venue.name、theater 相当 = stationOrArea（複合文字列）を使う。
 */
function pickMatchingSearchCandidatesFood(
  venueName: string,
  stationOrArea: string | null,
  searchCandidates: SearchCandidate[],
): SearchCandidate[] {
  const nt = venueName.toLowerCase().replace(/[\s　]/g, "");
  const matches: SearchCandidate[] = [];
  for (const sc of searchCandidates) {
    const nsc = sc.title.toLowerCase().replace(/[\s　]/g, "");
    const descNorm = `${sc.title} ${sc.description ?? ""} ${sc.practicalInfo ?? ""}`
      .toLowerCase()
      .replace(/[\s　]/g, "");
    const nameMatch = nsc.includes(nt) || nt.includes(nsc) || descNorm.includes(nt);
    if (!nameMatch) continue;
    if (stationOrArea) {
      const nsa = stationOrArea.toLowerCase().replace(/[\s　]/g, "");
      // stationOrArea が含まれていれば優先。無くても許容（nameMatch 完全一致なら採用）
      if (!descNorm.includes(nsa) && !nsc.includes(nsa)) {
        if (!(nsc === nt || descNorm.includes(nt))) continue;
      }
    }
    matches.push(sc);
  }
  return matches;
}

/**
 * food 版 sources — catalog sourceUrl → matched searchCandidates の順でユニーク URL 収集。
 *
 * label は providerName 正規化を Commit 5 以降まで保留（Commit 4 では sc.source の raw ラベル）。
 * catalog sourceUrl の label は「お店情報」に統一（movie の「上映情報」対応）。
 */
function buildSourcesFood(
  candidate: RankedFoodCandidate,
  matched: SearchCandidate[],
): CandidateSource[] {
  const seen = new Set<string>();
  const out: CandidateSource[] = [];

  if (candidate.sourceUrl) {
    seen.add(candidate.sourceUrl);
    out.push({ label: "お店情報", url: candidate.sourceUrl });
  }

  for (const sc of matched) {
    if (!sc.url || seen.has(sc.url)) continue;
    seen.add(sc.url);
    out.push({ label: sc.source || "参考", url: sc.url });
    if (out.length >= 4) break;
  }
  return out;
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
  ROLE_HEADLINE_BY_THEME,
  ROLE_PRIORITY_CUE,
  getRoleHeadlineTable,
  buildSlots,
  buildSlotsFood,
  buildWhy2People,
  buildWhy2PeopleFood,
  composeStationOrArea,
  pickMatchingSearchCandidates,
  pickMatchingSearchCandidatesFood,
  extractAccess,
  buildSources,
  buildSourcesFood,
  buildOperatingHoursFood,
};
