/**
 * Contextual Behavior Engine — ドメイン別行動プロファイルの導出
 * AI不要。OriginV7Save + BehavioralLawsResult → DomainBehaviorProfile[] の純関数。
 */

import type { OriginV7Save, LifeDomain } from "./types";
import { DOMAIN_LABELS } from "./types";
import type { BehavioralLawsResult } from "./behavioralLaws";
import type {
  LifeCenter,
  ActivityCategory,
  EraRole,
  RelationshipTone,
  ResidueCategory,
} from "./workspaceTypes";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   出力型
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type DomainBehaviorProfile = {
  domain: LifeDomain;
  dominantRole: string | null;
  initiative: number;           // 0-1
  emotionalOpenness: number;    // 0-1
  safeConditions: string[];
  dangerSignals: string[];
  evidenceSources: string[];
};

export type ContextualBehaviorResult = {
  profiles: DomainBehaviorProfile[];
  activeDomains: LifeDomain[];
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   マッピング定数
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const LIFE_CENTER_TO_DOMAIN: Record<LifeCenter, LifeDomain> = {
  study: "work",
  club: "work",
  friends: "friendship",
  family: "family",
  hobby: "solitude",
  part_time: "work",
  romance: "romance",
  survival: "solitude",
  escape: "solitude",
};

const ACTIVITY_CATEGORY_TO_DOMAIN: Record<ActivityCategory, LifeDomain> = {
  club: "work",
  hobby: "solitude",
  study: "work",
  part_time: "work",
  job: "work",
  creative: "solitude",
  competition: "work",
  volunteer: "friendship",
  other: "work",
};

const ROLE_INITIATIVE: Record<EraRole, number> = {
  leader: 0.85,
  entertainer: 0.75,
  mediator: 0.6,
  supporter: 0.45,
  follower: 0.35,
  lone_wolf: 0.5,
  observer: 0.25,
  outsider: 0.2,
};

const ROLE_LABELS: Record<EraRole, string> = {
  leader: "リーダー",
  entertainer: "ムードメーカー",
  mediator: "調整役",
  supporter: "サポーター",
  follower: "追随者",
  lone_wolf: "一匹狼",
  observer: "観察者",
  outsider: "部外者",
};

const RELATIONSHIP_OPENNESS: Record<RelationshipTone, number> = {
  close_group: 0.65,
  wide_shallow: 0.5,
  few_deep: 0.7,
  mostly_alone: 0.25,
  mixed: 0.5,
};

const DEFENSE_RESIDUES = new Set([
  "一人で抱える", "距離を置く", "感情を出さない", "笑って流す",
  "空気を読む", "本音を言いにくい", "自分を抑える",
]);

const OPENNESS_RESIDUES = new Set([
  "共感力", "人の気持ちに敏感", "素直さ", "感受性",
  "自分をさらけ出せる",
]);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   メイン関数
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function deriveContextualProfiles(
  save: OriginV7Save,
  laws: BehavioralLawsResult,
): ContextualBehaviorResult {
  const eras = save.eraAffiliations ?? [];
  const activities = save.activities ?? [];
  const residues = save.residueBoard ?? [];

  // ドメインごとのデータ収集
  const domainData: Record<LifeDomain, {
    roles: EraRole[];
    relationships: RelationshipTone[];
    evidences: string[];
  }> = {
    work: { roles: [], relationships: [], evidences: [] },
    romance: { roles: [], relationships: [], evidences: [] },
    friendship: { roles: [], relationships: [], evidences: [] },
    family: { roles: [], relationships: [], evidences: [] },
    solitude: { roles: [], relationships: [], evidences: [] },
  };

  // Era → ドメインマッピング
  for (const era of eras) {
    const domain = era.lifeCenter ? LIFE_CENTER_TO_DOMAIN[era.lifeCenter] : null;
    if (!domain) continue;

    if (era.mainRole) {
      domainData[domain].roles.push(era.mainRole);
    }
    if (era.relationships) {
      domainData[domain].relationships.push(era.relationships);
    }
    domainData[domain].evidences.push(
      `${era.period}: ${era.affiliation ?? era.school ?? DOMAIN_LABELS[domain]}`,
    );
  }

  // Activity → ドメインマッピング
  for (const act of activities) {
    const domain = ACTIVITY_CATEGORY_TO_DOMAIN[act.category];
    if (act.analyticalFrame?.role) {
      domainData[domain].roles.push(act.analyticalFrame.role);
    }
    domainData[domain].evidences.push(`活動: ${act.name}`);
  }

  // Residue からドメイン横断の感情開示シグナル
  let globalDefenseCount = 0;
  let globalOpennessCount = 0;
  for (const r of residues) {
    if (DEFENSE_RESIDUES.has(r.label)) globalDefenseCount++;
    if (OPENNESS_RESIDUES.has(r.label)) globalOpennessCount++;
  }
  const globalOpennessBase =
    globalDefenseCount + globalOpennessCount > 0
      ? globalOpennessCount / (globalDefenseCount + globalOpennessCount)
      : 0.5;

  // ドメイン別プロファイル生成
  const profiles: DomainBehaviorProfile[] = [];
  const activeDomains: LifeDomain[] = [];

  for (const domain of Object.keys(domainData) as LifeDomain[]) {
    const data = domainData[domain];
    if (data.evidences.length === 0) continue;

    activeDomains.push(domain);

    // initiative: ロールの平均
    const initiativeValues = data.roles.map((r) => ROLE_INITIATIVE[r]);
    const initiative =
      initiativeValues.length > 0
        ? initiativeValues.reduce((a, b) => a + b, 0) / initiativeValues.length
        : 0.5;

    // emotionalOpenness: ドメインの relationships + global residue signal
    const opennessValues = data.relationships.map((r) => RELATIONSHIP_OPENNESS[r]);
    const relationshipOpenness =
      opennessValues.length > 0
        ? opennessValues.reduce((a, b) => a + b, 0) / opennessValues.length
        : globalOpennessBase;
    const emotionalOpenness = relationshipOpenness * 0.6 + globalOpennessBase * 0.4;

    // dominant role
    const roleCounts = new Map<EraRole, number>();
    for (const r of data.roles) {
      roleCounts.set(r, (roleCounts.get(r) ?? 0) + 1);
    }
    let dominantRole: string | null = null;
    let maxCount = 0;
    for (const [role, count] of roleCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantRole = ROLE_LABELS[role];
      }
    }

    // safe/danger from collapse/growth conditions
    const safeConditions: string[] = [];
    const dangerSignals: string[] = [];

    for (const gc of laws.growthConditions) {
      // ドメインとの関連はevidence内のキーワードで推定
      const domainLabel = DOMAIN_LABELS[domain];
      const isRelated =
        gc.evidence.some((e) =>
          data.evidences.some((de) => e.includes(de.split(": ")[1] ?? "")),
        ) || gc.trigger.includes(domainLabel);
      if (isRelated) {
        safeConditions.push(gc.trigger);
      }
    }

    for (const cc of laws.collapseConditions) {
      const domainLabel = DOMAIN_LABELS[domain];
      const isRelated =
        cc.evidence.some((e) =>
          data.evidences.some((de) => e.includes(de.split(": ")[1] ?? "")),
        ) || cc.trigger.includes(domainLabel);
      if (isRelated) {
        dangerSignals.push(cc.trigger);
      }
    }

    // フォールバック: ドメインに直接マッチしない場合、全体の条件を薄く追加
    if (safeConditions.length === 0 && laws.growthConditions.length > 0) {
      safeConditions.push(laws.growthConditions[0].trigger);
    }
    if (dangerSignals.length === 0 && laws.collapseConditions.length > 0) {
      dangerSignals.push(laws.collapseConditions[0].trigger);
    }

    profiles.push({
      domain,
      dominantRole,
      initiative: Math.round(initiative * 100) / 100,
      emotionalOpenness: Math.round(emotionalOpenness * 100) / 100,
      safeConditions: safeConditions.slice(0, 3),
      dangerSignals: dangerSignals.slice(0, 3),
      evidenceSources: data.evidences.slice(0, 5),
    });
  }

  return { profiles, activeDomains };
}
