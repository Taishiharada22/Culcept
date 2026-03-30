import type {
  LifePeriod,
  AtmosphereCard,
  PerspectiveCard,
  ComparisonCard,
  TriggerCard,
} from "./types";
import { ATMOSPHERE_CARDS } from "./atmosphereData";
import { PERSPECTIVE_CARDS } from "./perspectiveData";
import { COMPARISON_CARDS } from "./comparisonData";
import { ALL_TRIGGER_CARDS } from "./triggerData";

// ────────────────────────────────────────────
// Chain Logic: 前ステップの選択に応じてカードを優先・フィルタする
// 完全排除はせず「並び順」で制御（上位に来るほど目に入りやすい）
// ────────────────────────────────────────────

/* ─── Period → Atmosphere weighting ─── */

const ATMOSPHERE_BOOST: Partial<Record<LifePeriod, string[]>> = {
  early_childhood: ["protected", "warm", "free", "quiet"],
  elementary: ["hot", "free", "dazzling", "expanding"],
  middle_school: ["suffocating", "shaky", "searching", "lonely"],
  high_school: ["hot", "tense", "expanding", "searching"],
  late_teens: ["shaky", "expanding", "searching", "dazzling"],
  early_twenties: ["expanding", "hectic", "searching", "free"],
  mid_twenties: ["hectic", "heavy", "shaky", "tense"],
  thirties: ["heavy", "quiet", "warm", "expanding"],
  forties_plus: ["quiet", "warm", "expanding", "free"],
  special_period: ["shaky", "heavy", "dazzling", "searching"],
};

export function getAtmosphereCardsForPeriod(
  period: LifePeriod,
): AtmosphereCard[] {
  const boosted = ATMOSPHERE_BOOST[period] ?? [];
  return sortByBoost(ATMOSPHERE_CARDS, boosted);
}

/* ─── Period + Atmosphere → Perspective weighting ─── */

const PERSPECTIVE_BOOST_BY_ATMOSPHERE: Partial<Record<string, string[]>> = {
  quiet: ["calm", "mysterious", "own_world", "quiet_person"],
  hot: ["competitive", "leader", "bright", "reliable"],
  suffocating: ["serious", "unapproachable", "mysterious", "quiet_person"],
  protected: ["kind", "bright", "calm", "reliable"],
  shaky: ["mysterious", "quiet_person", "kind", "own_world"],
  expanding: ["bright", "funny", "leader", "reliable"],
  heavy: ["serious", "calm", "reliable", "unapproachable"],
  lonely: ["own_world", "quiet_person", "mysterious", "calm"],
  searching: ["own_world", "mysterious", "serious", "calm"],
  free: ["bright", "funny", "own_world", "kind"],
  tense: ["serious", "competitive", "reliable", "unapproachable"],
  warm: ["kind", "bright", "calm", "reliable"],
  dazzling: ["bright", "leader", "competitive", "funny"],
  hectic: ["reliable", "leader", "competitive", "bright"],
};

export function getPerspectiveCardsForContext(
  _period: LifePeriod,
  atmosphere: string,
): PerspectiveCard[] {
  const boosted = PERSPECTIVE_BOOST_BY_ATMOSPHERE[atmosphere] ?? [];
  return sortByBoost(PERSPECTIVE_CARDS, boosted);
}

/* ─── Comparison — no special filtering, always show all ─── */

export function getComparisonCards(): ComparisonCard[] {
  return COMPARISON_CARDS;
}

/* ─── Period → Trigger filtering ─── */

const TRIGGER_HIDE_BY_PERIOD: Partial<Record<LifePeriod, string[]>> = {
  early_childhood: [
    "p_clubroom", "p_cram_school", "p_part_time", "p_airport", "p_convenience",
    "p_office", "p_cafe", "p_rooftop",
    "t_headphones", "t_smartphone", "t_pc", "t_earphones", "t_textbook",
    "h_senior", "h_junior", "h_coworker", "h_online", "h_partner",
    "s_chalk", "s_train",
  ],
  elementary: [
    "p_part_time", "p_airport", "p_convenience", "p_office", "p_cafe",
    "t_pc", "t_earphones",
    "h_coworker", "h_partner",
    "s_train",
  ],
  middle_school: [
    "p_part_time", "p_office",
    "h_coworker", "h_partner",
  ],
  high_school: [
    "p_office",
    "h_coworker",
  ],
  early_twenties: [
    "p_clubroom", "p_gym",
    "t_bag", "t_school_uniform",
    "s_chalk", "s_chime",
  ],
  mid_twenties: [
    "p_clubroom", "p_gym", "p_playground",
    "t_bag", "t_school_uniform", "t_textbook",
    "h_teacher",
    "s_chalk", "s_chime",
  ],
  thirties: [
    "p_clubroom", "p_gym", "p_playground", "p_cram_school",
    "t_bag", "t_school_uniform", "t_textbook", "t_uniform",
    "h_teacher", "h_classmate",
    "s_chalk", "s_chime", "s_cicada",
  ],
  forties_plus: [
    "p_clubroom", "p_gym", "p_playground", "p_cram_school",
    "t_bag", "t_school_uniform", "t_textbook", "t_uniform",
    "h_teacher", "h_classmate",
    "s_chalk", "s_chime",
  ],
};

export function getTriggerCardsForPeriod(period: LifePeriod): TriggerCard[] {
  const hidden = new Set(TRIGGER_HIDE_BY_PERIOD[period] ?? []);
  return ALL_TRIGGER_CARDS.filter((c) => !hidden.has(c.id));
}

/* ─── util ─── */

function sortByBoost<T extends { id: string }>(
  cards: T[],
  boostIds: string[],
): T[] {
  const boostSet = new Set(boostIds);
  const boosted: T[] = [];
  const rest: T[] = [];
  for (const c of cards) {
    if (boostSet.has(c.id)) boosted.push(c);
    else rest.push(c);
  }
  // Keep boost order, then append rest in original order
  const ordered = boostIds
    .map((id) => cards.find((c) => c.id === id))
    .filter((c): c is T => !!c);
  return [...ordered, ...rest.filter((c) => !boostSet.has(c.id))];
}
