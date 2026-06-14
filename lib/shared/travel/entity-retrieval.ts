/**
 * T11-G2-C — Tier0 manual/fixture entity retrieval + evidence-to-state normalizer（**pure・未配線**）
 *
 * 設計: entity-retrieval-types.ts + docs/t11-g2-real-entity-retrieval-design.md（+ Tier0 補正: URL を開かない）
 *
 * 役割: 手動供給 evidence → `Observed<T>` entity state（TravelObjectState）へ変換（user-agnostic・fail-closed）。
 *   ★ Tier0: 処理するのは manual/user_provided のみ。**fetch/scrape/web search/Maps/OTA/URL read をしない**。
 *   ★ evidence→Observed→confidence→state。source を score にしない。popularity は confidence のみ。
 *   ★ price/availability/cancellation/route/weather を hallucinate しない（未供給は省略 or missing question）。
 *   ★ time lock → OrderingConstraint(relation 層)・url → handoff meta・freshness → 内部。fit score / authority を出さない。
 *
 * 厳守（純・決定論・境界）:
 *   - **fetch/API/DB/Supabase/M2/route-weather-place live/env/Date.now/Math.random なし**。
 *   - **rank しない / book しない / solver しない / fit score を付けない**。import は travel entity 型のみ。
 */

import type { BudgetBand } from "./core-types";
import type {
  AnyEntityRole,
  EntityBurdenAxis,
  FitProvenance,
  Observed,
  OnsenState,
  OrderingConstraint,
  ProvenanceSource,
  SharedTraitAxis,
  TraitVector,
  TravelObjectState,
} from "./fit-types";
import {
  TIER0_PROCESSABLE_SOURCES,
  type EntityConfidenceSummary,
  type EntityEvidence,
  type EntityEvidenceSourceKind,
  type EntityFact,
  type EntityHandoffMeta,
  type EntityMissingDataQuestion,
  type EntityRetrievalCandidate,
  type EntityRetrievalEnvelope,
  type EntityTimeLock,
} from "./entity-retrieval-types";

// 非 opaque: provenance 既定 confidence（official/manual=高・review(inferred)=中低）
const DEFAULT_CONF: Record<FitProvenance, number> = {
  explicit_user: 0.85,
  form_input: 0.85,
  editorial: 0.8,
  aggregated: 0.7,
  profile_prior: 0.6,
  relation_context: 0.6,
  after_action: 0.5,
  inferred: 0.45,
  default_assumed: 0.3,
};

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
const factConf = (f: EntityFact): number => clamp01(f.confidence ?? DEFAULT_CONF[f.provenance]);
/** Tier0 で処理してよい fact か（source 未指定=manual 既定）。他 source は skip。 */
const isTier0 = (f: EntityFact): boolean =>
  (TIER0_PROCESSABLE_SOURCES as readonly EntityEvidenceSourceKind[]).includes(f.ref?.sourceKind ?? "manual");

const obs = <T>(value: T, f: EntityFact): Observed<T> => ({
  value,
  confidence: factConf(f),
  provenance: f.provenance,
  ...(f.visibility ? { visibility: f.visibility } : {}),
});

/** entity 単位 confidence 集約: 1 − Π(1 − eff)・非独立×0.5・source 0→0.5・cap 0.99（aggregateFieldConfidence と同式）。 */
function deriveEntityConfidence(sources: ProvenanceSource[]): EntityConfidenceSummary {
  if (sources.length === 0) return { entityConfidence: 0.5, sourceCount: 0 };
  let acc = 1;
  for (const s of sources) acc *= 1 - clamp01(s.reliability) * (s.independent ? 1 : 0.5);
  return { entityConfidence: Math.min(0.99, 1 - acc), sourceCount: sources.length };
}

// scalar fact の衝突検出キー（同キー異値=conflict→confidence でなく fail-closed: 採用せず question）
function scalarKey(f: EntityFact): string | null {
  switch (f.kind) {
    case "trait": return `trait:${f.axis}`;
    case "roleAffinity": return `role:${f.role}`;
    case "burden": return `burden:${f.axis}`;
    case "recoveryRest": return "recoveryRest";
    case "priceBand": return "priceBand";
    case "cancellationFlexibility": return "cancel";
    case "accessibilityStepFree": return "accStepFree";
    default: return null; // onsen/timeLock/allergen/supportRelief/popularity は additive（衝突検査外）
  }
}
function scalarVal(f: EntityFact): string {
  switch (f.kind) {
    case "trait": case "roleAffinity": case "burden": case "recoveryRest": case "cancellationFlexibility": return String((f as { value: number }).value);
    case "priceBand": return `${f.lo}-${f.hi ?? ""}`;
    case "accessibilityStepFree": return f.value;
    default: return "";
  }
}

const SAFETY_REQUIRE_KEYS = new Set(["allergen", "accessibility", "accStepFree", "medical"]);

/**
 * 1 entity の手動 evidence → candidate。Tier0 のみ・user-agnostic・fail-closed。
 *   - 非 Tier0 source fact は skip（非実行）。
 *   - scalar 衝突 → 採用せず missing question（断定しない）。
 *   - 未供給 price hi → priceBand を作らず missing question（hi 捏造しない）。
 *   - cancellation/url/freshness/time は entity の外。popularity は confidence のみ。
 */
export function normalizeManualEntityEvidence(ev: EntityEvidence): EntityRetrievalCandidate {
  const facts = ev.facts.filter(isTier0); // ★ Tier0: manual/user_provided のみ処理

  // scalar 衝突キー
  const byKey = new Map<string, Set<string>>();
  for (const f of facts) {
    const k = scalarKey(f);
    if (!k) continue;
    (byKey.get(k) ?? byKey.set(k, new Set()).get(k)!).add(scalarVal(f));
  }
  const conflictKeys = new Set([...byKey.entries()].filter(([, v]) => v.size > 1).map(([k]) => k));

  const missingQuestions: EntityMissingDataQuestion[] = [];
  for (const k of conflictKeys) missingQuestions.push({ field: k, reason: "low_confidence" });

  // core layers
  const roleAffinity: Partial<Record<AnyEntityRole, Observed<number>>> = {};
  const burden: Partial<Record<EntityBurdenAxis, Observed<number>>> = {};
  const traits: TraitVector = {};
  const recovery: { restValue?: Observed<number>; energyRequired?: Observed<number> } = {};
  const hardProfile: NonNullable<TravelObjectState["hardProfile"]> = {};
  const sources: ProvenanceSource[] = [];
  const timeLocks: EntityTimeLock[] = [];
  let cancellationFlexibility: Observed<number> | undefined;
  let priceBand: Observed<BudgetBand> | undefined;
  let onsen: OnsenState | undefined;
  let supportRich: NonNullable<Extract<TravelObjectState, { category: "support" }>["rich"]> | undefined;
  let freshness = ev.facts.find((f) => f.freshness)?.freshness;

  for (const f of facts) {
    const k = scalarKey(f);
    if (k && conflictKeys.has(k)) continue; // 衝突は採用しない（断定しない）
    switch (f.kind) {
      case "trait": traits[f.axis] = { value: f.value, confidence: factConf(f), ...(f.visibility ? { visibility: f.visibility } : {}) }; break;
      case "roleAffinity": roleAffinity[f.role] = obs(f.value, f); break;
      case "burden": burden[f.axis] = obs(f.value, f); break;
      case "recoveryRest": recovery.restValue = obs(f.value, f); break;
      case "onsen": {
        onsen = onsen ?? {};
        if (f.springType !== undefined) onsen.springType = obs(f.springType, f);
        if (f.kakenagashi !== undefined) onsen.kakenagashi = obs(f.kakenagashi, f);
        if (f.scenicView !== undefined) onsen.scenicView = obs(f.scenicView, f);
        break;
      }
      case "timeLock": // ★ relation 層（OrderingConstraint）+ raw carrier。entity/hardProfile に時刻を載せない・schedule しない
        timeLocks.push({ ordering: { kind: f.lockKind, subjectRef: ev.placeRefId, objectRef: ev.placeRefId, relaxable: false }, ...(f.rawTime ? { rawTime: f.rawTime } : {}), ...(f.ref ? { ref: f.ref } : {}) });
        break;
      case "priceBand": // ★ hi 未供給は hi を捏造せず priceBand を作らない（missing question）
        if (f.hi === undefined) missingQuestions.push({ field: "price_upper_bound", reason: "low_confidence" });
        else priceBand = obs<BudgetBand>({ lo: f.lo, hi: f.hi, confidence: factConf(f), currency: f.currency ?? "JPY" }, f);
        break;
      case "cancellationFlexibility": cancellationFlexibility = obs(f.value, f); break; // entity でない（readiness hint）
      case "accessibilityStepFree": hardProfile.accessibility = { ...(hardProfile.accessibility ?? {}), stepFree: f.value }; break;
      case "allergen": hardProfile.allergens = { handling: f.handling, ...(f.descriptor ? { present: [f.descriptor] } : {}) }; break;
      case "supportRelief": supportRich = { ...(supportRich ?? {}), reliefAxis: f.reliefAxis, ...(f.reliefValue !== undefined ? { reliefValue: obs(f.reliefValue, f) } : {}), ...(f.necessity ? { necessity: f.necessity } : {}) }; break;
      case "popularity": sources.push({ kind: "aggregated", reliability: clamp01(f.reliability), independent: f.independent ?? true }); break; // ★ confidence のみ
    }
  }

  // requires: 宣言された必須 field が未供給 → missing question（safety key は safety_unknown）
  for (const req of ev.requires ?? []) {
    const satisfied = facts.some((f) => scalarKey(f) === req || f.kind === req || (f.kind === "accessibilityStepFree" && req === "accessibility"));
    if (!satisfied) missingQuestions.push({ field: req, reason: SAFETY_REQUIRE_KEYS.has(req) ? "safety_unknown" : "low_confidence" });
  }

  // entity 組立（category↔rich の対応は normalizer が保証・cast は局所）
  const core = {
    placeRefId: ev.placeRefId,
    ...(Object.keys(traits).length ? { traits } : {}),
    ...(Object.keys(roleAffinity).length ? { roleAffinity } : {}),
    ...(Object.keys(burden).length ? { burden } : {}),
    ...(recovery.restValue ? { recovery } : {}),
    ...(priceBand ? { priceBand } : {}),
    ...(Object.keys(hardProfile).length ? { hardProfile } : {}),
    provenance: { sources },
  };
  const onsenCapable = ev.category === "lodging" || ev.category === "place" || ev.category === "area";
  const rich: Record<string, unknown> = {
    ...(onsen && onsenCapable ? { onsenFacet: onsen } : {}),
    ...(ev.category === "support" && supportRich ? supportRich : {}),
  };
  const entity = { ...core, category: ev.category, ...(Object.keys(rich).length ? { rich } : {}) } as TravelObjectState;

  return {
    placeRefId: ev.placeRefId,
    entity,
    timeLocks,
    ...(cancellationFlexibility ? { cancellationFlexibility } : {}),
    missingQuestions,
    confidence: deriveEntityConfidence(sources),
    ...(freshness ? { freshness } : {}),
  };
}

/**
 * Tier0 manual/fixture entity retrieval。手動 evidence → candidates（順序なし集合）+ handoff（url・**開かない**）。
 *   ★ fetch/scrape/web search/Maps/OTA を一切しない。url は handoff meta として carry only。
 */
export function getManualEntityRetrievalCandidates(input: { entities: EntityEvidence[] }): EntityRetrievalEnvelope {
  const candidates = input.entities.map(normalizeManualEntityEvidence);
  const handoffs: EntityHandoffMeta[] = [];
  for (const ev of input.entities) {
    const urlRefs = [ev.ref, ...ev.facts.map((f) => f.ref)].filter((r): r is NonNullable<typeof r> => !!r && !!r.url);
    for (const r of urlRefs) handoffs.push({ placeRefId: ev.placeRefId, url: r.url, sourceKind: r.sourceKind }); // ★ carry only・開かない
  }
  return { result: { candidates }, handoffs };
}
