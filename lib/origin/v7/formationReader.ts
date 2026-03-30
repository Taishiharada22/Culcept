/**
 * Formation Reader — 蓄積データから「読める形」を導出する純関数群
 * AI不要。OriginV7Save を入力とし、ルールベースで導出。
 */

import type { OriginV7Save, LifePeriod, MemoryChapter, CurrentPosition } from "./types";
import type {
  RootProfile,
  EraAffiliation,
  ActivityEntry,
  TurningPoint,
  ResidueItem,
  ResidueCategory,
  EraRole,
  RewardType,
  AnalyticalFrame,
} from "./workspaceTypes";
import { getPeriodLabel, PERIOD_DEFS } from "./periods";
import { getHomeAtmosphereLabel } from "./rootProfileData";
import { getEraRoleLabel, getLifeCenterLabel } from "./eraAffiliationData";
import { getActivityCategoryLabel } from "./activityData";
import { getResidueCategoryLabel, RESIDUE_PRESET_LABELS } from "./residueData";
import { REMAIN_ITEMS, SEEKING_ITEMS } from "./currentPositionData";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   出力型
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/** Origin Snapshot — 3-6文の形成要約 */
export type OriginSnapshot = {
  sentences: string[];
  dataCompleteness: number; // 0-1
};

/** Formation Chain — 因果の線 1本分 */
export type FormationChain = {
  id: string;
  source: string;
  sourcePeriod: LifePeriod;
  mechanism: string;
  remains: string;
  confidence: number; // 0-1
};

/** Life Backbone — 時代ごとの骨格 */
export type LifeBackbonePeriod = {
  period: LifePeriod;
  periodLabel: string;
  location: string | null;
  lifeCenter: string | null;
  role: string | null;
  mainActivities: string[];
  turningPoints: string[];
};
export type LifeBackbone = { periods: LifeBackbonePeriod[] };

/** Residue Summary — 残留の俯瞰 */
export type ResidueSummary = {
  groups: { category: ResidueCategory; categoryLabel: string; items: ResidueItem[] }[];
  strongestItems: ResidueItem[];
};

/** Pressure/Reward Profile */
export type PressureRewardProfile = {
  dominantPressures: string[];
  dominantRewards: RewardType[];
  costPatterns: string[];
};

/** Role Evolution — 役割の変遷 */
export type RoleTransition = {
  period: LifePeriod;
  periodLabel: string;
  role: EraRole;
  roleLabel: string;
};
export type RoleEvolution = {
  transitions: RoleTransition[];
  pattern: string | null;
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Period Order (shared)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const PERIOD_ORDER: Record<string, number> = {
  early_childhood: 0,
  elementary: 1,
  middle_school: 2,
  high_school: 3,
  late_teens: 4,
  early_twenties: 5,
  mid_twenties: 6,
  thirties: 7,
  forties_plus: 8,
  special_period: 9,
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ATMOSPHERE → RESIDUE マッピング
   homeAtmosphere から推定される残留パターン
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ATMOSPHERE_RESIDUE_MAP: Record<string, { label: string; mechanism: string; category: ResidueCategory }[]> = {
  strict: [
    { label: "先に周囲を見てから動く", mechanism: "周りの反応を先に読む必要があった", category: "behavioral_pattern" },
    { label: "完璧を目指す", mechanism: "失敗が許されない空気の中で育った", category: "behavioral_pattern" },
    { label: "空気を読む", mechanism: "緊張感のある家庭で気配を察する習慣がついた", category: "interpersonal_habit" },
  ],
  tense: [
    { label: "先に周囲を見てから動く", mechanism: "安全確認してから動く癖がついた", category: "behavioral_pattern" },
    { label: "感情を出さない", mechanism: "感情を出すと波風が立つ環境だった", category: "defense" },
    { label: "距離を置く", mechanism: "緊張感を避けるため距離を取る習慣がついた", category: "interpersonal_habit" },
  ],
  warm: [
    { label: "世話を焼く", mechanism: "あたたかい関係の中で自然に世話役が身についた", category: "interpersonal_habit" },
    { label: "安心感", mechanism: "安定した家庭から安心の基盤を得た", category: "still_seeking" },
  ],
  quiet: [
    { label: "本音を言いにくい", mechanism: "静かな家庭で言葉を飲む癖がついた", category: "interpersonal_habit" },
    { label: "一人で抱える", mechanism: "一人の時間が多く自分で処理する癖がついた", category: "behavioral_pattern" },
  ],
  lonely: [
    { label: "本当の居場所", mechanism: "孤独な家庭環境が居場所を求める原動力になった", category: "still_seeking" },
    { label: "自分から声をかけにくい", mechanism: "孤独が普通だったため人に近づく方法が分からなかった", category: "interpersonal_habit" },
    { label: "独立心", mechanism: "一人でやるしかない環境が独立心を育てた", category: "pride" },
  ],
  free: [
    { label: "自由", mechanism: "干渉されない環境で自由の価値が根付いた", category: "still_seeking" },
    { label: "すぐに行動する", mechanism: "制約が少ない環境で行動力が育った", category: "behavioral_pattern" },
  ],
  busy: [
    { label: "先回りする", mechanism: "忙しい家庭の中で自分で先回りする必要があった", category: "behavioral_pattern" },
    { label: "適応力", mechanism: "忙しく変わる環境への対応力が鍛えられた", category: "weapon" },
  ],
  unstable: [
    { label: "期待しない", mechanism: "不安定な環境で期待しないことが自衛になった", category: "defense" },
    { label: "安心感", mechanism: "不安定な家庭が安心感への渇望を生んだ", category: "still_seeking" },
    { label: "適応力", mechanism: "変化に適応し続ける必要があった", category: "weapon" },
  ],
  mixed: [
    { label: "相手に合わせる", mechanism: "複雑な家庭で相手に合わせる術を覚えた", category: "interpersonal_habit" },
    { label: "観察力", mechanism: "状況を読む必要があり観察力が磨かれた", category: "weapon" },
  ],
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   1. deriveOriginSnapshot
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function deriveOriginSnapshot(save: OriginV7Save): OriginSnapshot {
  const sentences: string[] = [];
  const root = save.rootProfile;
  const eras = save.eraAffiliations ?? [];
  const activities = save.activities ?? [];
  const tps = save.turningPoints ?? [];
  const residue = save.residueBoard ?? [];
  const cp = save.currentPosition;

  // 充足度を計算
  let filled = 0;
  let total = 5;
  if (root && (root.birthplace || root.homeAtmosphere)) filled++;
  if (eras.length > 0) filled++;
  if (activities.length > 0) filled++;
  if (tps.length > 0) filled++;
  if (residue.length > 0) filled++;
  const dataCompleteness = filled / total;

  // 1文目: 出身地
  if (root?.birthplace) {
    const atmo = root.homeAtmosphere ? getHomeAtmosphereLabel(root.homeAtmosphere) : null;
    if (atmo) {
      sentences.push(`${root.birthplace}で育ち、家庭の空気は「${atmo}」ものだった。`);
    } else {
      sentences.push(`${root.birthplace}で育った。`);
    }
  }

  // 2文目: 時代の概要
  if (eras.length > 0) {
    const eraRoles = eras
      .filter((e) => e.mainRole)
      .map((e) => getEraRoleLabel(e.mainRole!));
    const uniqueRoles = [...new Set(eraRoles)];
    if (uniqueRoles.length > 0) {
      sentences.push(`${eras.length}つの時代を通じて、${uniqueRoles.slice(0, 2).join("や")}としての経験を重ねた。`);
    } else {
      sentences.push(`${eras.length}つの時代にわたる履歴がある。`);
    }
  }

  // 3文目: 主な活動
  if (activities.length > 0) {
    const mainActs = activities
      .filter((a) => a.timeAllocation === "main")
      .map((a) => a.name);
    if (mainActs.length > 0) {
      sentences.push(`「${mainActs.slice(0, 2).join("」「")}」を生活の中心に据えていた時期がある。`);
    } else {
      sentences.push(`${activities.length}件の活動履歴が記録されている。`);
    }
  }

  // 4文目: 転機
  if (tps.length > 0) {
    const transformative = tps.filter((t) => t.impact === "transformative");
    if (transformative.length > 0) {
      sentences.push(`「${transformative[0].title}」が人生を大きく変えた転機だった。`);
    } else {
      sentences.push(`${tps.length}つの転機を経験している。`);
    }
  }

  // 5文目: 残留
  if (residue.length > 0) {
    const strong = residue.filter((r) => r.intensity === "strong");
    if (strong.length > 0) {
      sentences.push(`今も「${strong.slice(0, 2).map((r) => r.label).join("」「")}」が強く残っている。`);
    } else {
      sentences.push(`${residue.length}個の残留パターンが認識されている。`);
    }
  }

  // 6文目: 今探しているもの
  if (cp && cp.seeking.length > 0) {
    const seekLabels = cp.seeking
      .map((id) => SEEKING_ITEMS.find((s) => s.id === id)?.label)
      .filter(Boolean);
    if (seekLabels.length > 0) {
      sentences.push(`そして今、「${seekLabels[0]}」を探している。`);
    }
  }

  return { sentences, dataCompleteness };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   2. deriveFormationChains
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function deriveFormationChains(save: OriginV7Save): FormationChain[] {
  const chains: FormationChain[] = [];
  const residue = save.residueBoard ?? [];
  const residueLabels = new Set(residue.map((r) => r.label));
  let chainId = 0;

  // A. homeAtmosphere → residue
  const atmo = save.rootProfile?.homeAtmosphere;
  if (atmo && ATMOSPHERE_RESIDUE_MAP[atmo]) {
    for (const mapping of ATMOSPHERE_RESIDUE_MAP[atmo]) {
      if (residueLabels.has(mapping.label) || fuzzyMatchResidue(mapping.label, residue)) {
        chains.push({
          id: `chain_${chainId++}`,
          source: `${getHomeAtmosphereLabel(atmo)}家庭`,
          sourcePeriod: "early_childhood",
          mechanism: mapping.mechanism,
          remains: mapping.label,
          confidence: 0.75,
        });
      }
    }
  }

  // B. activity.frame → residue
  for (const act of save.activities ?? []) {
    const frame = act.analyticalFrame;
    if (!frame) continue;

    // frame.whatRemains → residue
    if (frame.whatRemains && (residueLabels.has(frame.whatRemains) || fuzzyMatchResidue(frame.whatRemains, residue))) {
      chains.push({
        id: `chain_${chainId++}`,
        source: act.name,
        sourcePeriod: act.period,
        mechanism: frame.pressure ? `「${frame.pressure}」という圧力の中で` : `${getActivityCategoryLabel(act.category)}の経験を通じて`,
        remains: frame.whatRemains,
        confidence: 0.8,
      });
    }

    // frame.learnedRules → residue
    if (frame.learnedRules && (residueLabels.has(frame.learnedRules) || fuzzyMatchResidue(frame.learnedRules, residue))) {
      chains.push({
        id: `chain_${chainId++}`,
        source: act.name,
        sourcePeriod: act.period,
        mechanism: "そこで覚えたルールが今の動き方になった",
        remains: frame.learnedRules,
        confidence: 0.7,
      });
    }
  }

  // C. turningPoint.frame → residue
  for (const tp of save.turningPoints ?? []) {
    const frame = tp.analyticalFrame;
    if (!frame) continue;

    if (frame.whatGained && (residueLabels.has(frame.whatGained) || fuzzyMatchResidue(frame.whatGained, residue))) {
      chains.push({
        id: `chain_${chainId++}`,
        source: tp.title,
        sourcePeriod: tp.period,
        mechanism: `この転機で得たものが今の武器になった`,
        remains: frame.whatGained,
        confidence: 0.75,
      });
    }

    if (frame.whatLost && (residueLabels.has(frame.whatLost) || fuzzyMatchResidue(frame.whatLost, residue))) {
      chains.push({
        id: `chain_${chainId++}`,
        source: tp.title,
        sourcePeriod: tp.period,
        mechanism: `この転機で失ったものが今の傷として残っている`,
        remains: frame.whatLost,
        confidence: 0.7,
      });
    }
  }

  // D. chapter.echoes → residue (fuzzy)
  for (const ch of save.chapters) {
    for (const echo of ch.echoes) {
      const match = findClosestResidueLabel(echo, residue);
      if (match) {
        // 既に同じ remains のチェーンがなければ追加
        if (!chains.some((c) => c.remains === match)) {
          chains.push({
            id: `chain_${chainId++}`,
            source: ch.title ?? getPeriodLabel(ch.fact.period),
            sourcePeriod: ch.fact.period,
            mechanism: `「${echo}」という残響が今の行動に影響している`,
            remains: match,
            confidence: 0.6,
          });
        }
      }
    }
  }

  // 重複除去（remains が同じものは confidence が高い方を優先）
  const unique = new Map<string, FormationChain>();
  for (const chain of chains) {
    const existing = unique.get(chain.remains);
    if (!existing || existing.confidence < chain.confidence) {
      unique.set(chain.remains, chain);
    }
  }

  return Array.from(unique.values()).sort((a, b) => b.confidence - a.confidence);
}

/** residue board の label とファジーマッチ */
function fuzzyMatchResidue(text: string, residue: ResidueItem[]): boolean {
  if (!text) return false;
  const norm = text.trim();
  return residue.some((r) => {
    return r.label.includes(norm) || norm.includes(r.label);
  });
}

/** echo テキストから最も近い residue label を見つける */
function findClosestResidueLabel(echo: string, residue: ResidueItem[]): string | null {
  if (!echo) return null;
  const norm = echo.trim();

  // 完全一致
  const exact = residue.find((r) => r.label === norm);
  if (exact) return exact.label;

  // 部分一致
  const partial = residue.find((r) => r.label.includes(norm) || norm.includes(r.label));
  if (partial) return partial.label;

  // RESIDUE_PRESET_LABELS 内でのファジーマッチ
  for (const [, labels] of Object.entries(RESIDUE_PRESET_LABELS)) {
    const match = labels.find((l) => l.includes(norm) || norm.includes(l));
    if (match && residue.some((r) => r.label === match)) {
      return match;
    }
  }

  return null;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   3. deriveLifeBackbone
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function deriveLifeBackbone(save: OriginV7Save): LifeBackbone {
  const eras = save.eraAffiliations ?? [];
  const activities = save.activities ?? [];
  const tps = save.turningPoints ?? [];
  const root = save.rootProfile;

  // 全period を集約
  const periodSet = new Set<LifePeriod>();
  for (const e of eras) periodSet.add(e.period);
  for (const a of activities) periodSet.add(a.period);
  for (const t of tps) periodSet.add(t.period);

  const periods: LifeBackbonePeriod[] = Array.from(periodSet)
    .sort((a, b) => (PERIOD_ORDER[a] ?? 99) - (PERIOD_ORDER[b] ?? 99))
    .map((period) => {
      const era = eras.find((e) => e.period === period);
      const acts = activities.filter((a) => a.period === period);
      const tpList = tps.filter((t) => t.period === period);

      // Location: rootProfile の childLocation か moving history から
      let location: string | null = null;
      if (root) {
        if (period === "early_childhood" || period === "elementary") {
          location = root.childhoodLocation || root.birthplace || null;
        }
        // Check moving history
        const move = root.movingHistory?.find((m) => m.period === period);
        if (move) {
          location = move.toLocation;
        }
      }

      return {
        period,
        periodLabel: getPeriodLabel(period),
        location,
        lifeCenter: era?.lifeCenter ? getLifeCenterLabel(era.lifeCenter) : null,
        role: era?.mainRole ? getEraRoleLabel(era.mainRole) : null,
        mainActivities: acts.map((a) => a.name),
        turningPoints: tpList.map((t) => t.title),
      };
    });

  return { periods };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   4. deriveResidueSummary
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function deriveResidueSummary(save: OriginV7Save): ResidueSummary {
  const residue = save.residueBoard ?? [];

  // カテゴリ別グループ化
  const categoryOrder: ResidueCategory[] = [
    "behavioral_pattern",
    "interpersonal_habit",
    "pride",
    "wound",
    "weapon",
    "defense",
    "still_seeking",
  ];

  const groups = categoryOrder
    .map((category) => ({
      category,
      categoryLabel: getResidueCategoryLabel(category),
      items: residue.filter((r) => r.category === category),
    }))
    .filter((g) => g.items.length > 0);

  const strongestItems = residue.filter((r) => r.intensity === "strong");

  return { groups, strongestItems };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   5. derivePressureRewardProfile
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function derivePressureRewardProfile(save: OriginV7Save): PressureRewardProfile {
  const frames = collectAllFrames(save);

  // Pressures
  const pressureCounts = new Map<string, number>();
  for (const f of frames) {
    if (f.pressure) {
      pressureCounts.set(f.pressure, (pressureCounts.get(f.pressure) ?? 0) + 1);
    }
  }
  const dominantPressures = Array.from(pressureCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([p]) => p);

  // Rewards
  const rewardCounts = new Map<RewardType, number>();
  for (const f of frames) {
    for (const r of f.reward) {
      rewardCounts.set(r, (rewardCounts.get(r) ?? 0) + 1);
    }
  }
  const dominantRewards = Array.from(rewardCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([r]) => r);

  // Cost patterns (whatLost)
  const costSet = new Set<string>();
  for (const f of frames) {
    if (f.whatLost) costSet.add(f.whatLost);
  }
  const costPatterns = Array.from(costSet).slice(0, 3);

  return { dominantPressures, dominantRewards, costPatterns };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   6. deriveRoleEvolution
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function deriveRoleEvolution(save: OriginV7Save): RoleEvolution {
  const eras = save.eraAffiliations ?? [];
  const activities = save.activities ?? [];

  // 時代順に role を並べる
  const rolePeriods: { period: LifePeriod; role: EraRole }[] = [];

  // Era roles
  for (const era of eras) {
    if (era.mainRole) {
      rolePeriods.push({ period: era.period, role: era.mainRole });
    }
  }

  // Activity frame roles (era が無い period を補完)
  for (const act of activities) {
    const frame = act.analyticalFrame;
    if (frame?.role && !rolePeriods.some((rp) => rp.period === act.period)) {
      rolePeriods.push({ period: act.period, role: frame.role });
    }
  }

  // Sort by period
  const sorted = rolePeriods.sort(
    (a, b) => (PERIOD_ORDER[a.period] ?? 99) - (PERIOD_ORDER[b.period] ?? 99),
  );

  // 重複period を除去（先に出てきた方を採用）
  const seen = new Set<string>();
  const transitions: RoleTransition[] = [];
  for (const rp of sorted) {
    if (!seen.has(rp.period)) {
      seen.add(rp.period);
      transitions.push({
        period: rp.period,
        periodLabel: getPeriodLabel(rp.period),
        role: rp.role,
        roleLabel: getEraRoleLabel(rp.role),
      });
    }
  }

  // Pattern text
  let pattern: string | null = null;
  if (transitions.length >= 2) {
    pattern = transitions.map((t) => t.roleLabel).join(" → ");
  }

  return { transitions, pattern };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ヘルパー
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/** 全 AnalyticalFrame を収集 */
function collectAllFrames(save: OriginV7Save): AnalyticalFrame[] {
  const frames: AnalyticalFrame[] = [];
  for (const a of save.activities ?? []) {
    if (a.analyticalFrame) frames.push(a.analyticalFrame);
  }
  for (const t of save.turningPoints ?? []) {
    if (t.analyticalFrame) frames.push(t.analyticalFrame);
  }
  return frames;
}
