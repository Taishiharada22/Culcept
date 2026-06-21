/**
 * /plan/dev-travel-personalization — UX-6a Travel Personalization Enrichment **read-only dev preview**
 *   （**fixture 性格のみ・snapshotReader/DB/Supabase 非接触・read-only・本番 /plan 非接触**）
 *
 * 目的: 「性格が旅行プランを変える」を **fixture で目視確認**する。
 *   fixture `PlanParams`/`TravelTraitsV0` → `mapPersonalizationToM2SoftPreference` → soft enrichment →
 *   `buildTravelPlanDisplayResult` の **baseline（性格なし）vs personalized（性格あり）** を比較表示。
 *
 * 厳守:
 *   - flag `PLAN_TRAVEL_PERSONALIZATION_PREVIEW`（server default OFF）→ OFF なら Disabled。
 *   - **fixture 入力のみ**（snapshotReader/DB/Supabase/real user data/fetch/送信なし）。
 *   - **read-only**（write/insert/seed/apply なし・PlanClient 非接続）・action button なし。
 *   - engine は fixture 入力で実行するが authoritative/raw output は表示しない（projection の説明文のみ）。
 */

import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { buildTravelPlanDisplayResult } from "@/lib/shared/travel/travel-plan-display-adapter";
import { mapPersonalizationToM2SoftPreference } from "@/lib/shared/travel/personalization-to-m2-soft-preference";
import type { DerivedValue, PlanParams, TravelTraitKeyV0, TravelTraitsV0 } from "@/lib/shared/personalization/types";
import type { M2TravelSoftPreference } from "@/lib/shared/travel/m2-soft-enrichment-types";
import type { TravelPlanDisplayInput } from "@/lib/shared/travel/travel-plan-display-adapter-types";
import type { SessionSurfaceEvent } from "@/lib/shared/travel/travel-session-binding-types";

export const dynamic = "force-dynamic";

const PROD = { fixtureAllowed: false } as const;
const READY_EVENTS: SessionSurfaceEvent[] = [
  { kind: "destination_input", areaText: "京都", surface: "form_input" },
  { kind: "selected_plan_window", window: { kind: "single_day", date: "2026-07-01" } },
];
const INPUT: TravelPlanDisplayInput = { events: READY_EVENTS, participantIds: ["P1"], viewerId: "P1" };

const dv = <T,>(value: T, confidence: number, source: "derived" | "default" = "derived"): DerivedValue<T> => ({ value, confidence, source });
const NEUTRAL_TRAITS = (): TravelTraitsV0 => ({
  version: "v0",
  traits: Object.fromEntries(
    (["noveltySeeking", "pacePreference", "crowdTolerance", "planningStyle", "comfortVsAdventure", "experienceDepth", "aestheticOrientation", "socialOrientation"] as TravelTraitKeyV0[]).map(
      (k) => [k, dv(0, 0, "default")],
    ),
  ) as TravelTraitsV0["traits"],
});
const NEUTRAL_PLAN = (): PlanParams => ({
  paceDefault: dv("normal", 0, "default"),
  densityCap: dv(3, 0, "default"),
  morningness: dv(0.5, 0, "default"),
  noveltyBias: dv(0, 0, "default"),
  precommitPreference: dv(0.5, 0, "default"),
  socialLoadTolerance: dv(0.5, 0, "default"),
  budgetPosture: dv("balanced", 0, "default"),
  bufferMargin: dv(0.5, 0, "default"),
  explanationTone: dv("reason_first", 0, "default"),
});

/** 落ち着いた性格（ゆっくり・定番・人混み回避）。 */
function calmPersonality(): { plan: PlanParams; traits: TravelTraitsV0 } {
  const plan = NEUTRAL_PLAN();
  plan.paceDefault = dv("slow", 0.8);
  plan.noveltyBias = dv(-0.6, 0.7);
  const traits = NEUTRAL_TRAITS();
  traits.traits.crowdTolerance = dv(-0.7, 0.7);
  return { plan, traits };
}
/** アクティブな性格（詰め込み・新奇・人混み平気）。 */
function activePersonality(): { plan: PlanParams; traits: TravelTraitsV0 } {
  const plan = NEUTRAL_PLAN();
  plan.paceDefault = dv("intense", 0.8);
  plan.noveltyBias = dv(0.6, 0.7);
  const traits = NEUTRAL_TRAITS();
  traits.traits.crowdTolerance = dv(0.5, 0.6);
  return { plan, traits };
}

interface Row {
  label: string;
  pref: M2TravelSoftPreference | null;
  text: string;
  why: string;
  recommended: string | null;
}

function rowFor(label: string, p: { plan: PlanParams; traits: TravelTraitsV0 } | null): Row {
  const pref = p ? mapPersonalizationToM2SoftPreference(p.plan, p.traits) : null;
  const r = buildTravelPlanDisplayResult(INPUT, PROD, pref ? { softPersonalization: pref } : undefined);
  if (r.status !== "ready") return { label, pref, text: `(${r.status})`, why: "", recommended: null };
  return { label, pref, text: r.display.projection.answer.text, why: r.display.projection.whyThisPlan, recommended: r.display.projection.answer.recommendedProposalId };
}

function Disabled() {
  return (
    <div className="mx-auto max-w-md px-4 py-6 text-gray-600" data-testid="travel-personalization-disabled">
      <h1 className="text-lg font-bold">Travel Personalization Preview（read-only・dev）</h1>
      <p className="mt-2 text-[12px] text-gray-500">PLAN_TRAVEL_PERSONALIZATION_PREVIEW=OFF（表示しません）。</p>
    </div>
  );
}

export default function DevTravelPersonalizationPage() {
  if (!PLAN_FLAGS.travelPersonalizationPreview) return <Disabled />;

  const rows: Row[] = [
    rowFor("baseline（性格なし）", null),
    rowFor("落ち着いた性格（ゆっくり/定番/静か）", calmPersonality()),
    rowFor("アクティブな性格（詰め込み/新奇/賑やか）", activePersonality()),
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6" data-testid="travel-personalization-preview">
      <h1 className="text-lg font-bold text-gray-900">Travel Personalization Preview（read-only・dev・fixture）</h1>
      <p className="mt-1 text-[12px] text-gray-500">
        同じ目的地・日程（京都・2026-07-01）で、性格だけを変えた時に proposal の説明がどう変わるかを fixture で比較（DB 非接触）。
      </p>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-lg border border-gray-200 bg-white/60 p-3" data-testid="travel-personalization-row">
            <p className="text-[13px] font-bold text-gray-900" data-testid="row-label">{row.label}</p>
            <p className="mt-1 text-[11px] text-gray-500" data-testid="row-pref">
              soft preference: {row.pref ? JSON.stringify({ pace: row.pref.pace, descriptors: row.pref.descriptors, confidence: row.pref.confidence }) : "（なし）"}
            </p>
            <p className="mt-1 text-[12px] text-gray-800" data-testid="row-text">答え: {row.text || "（なし）"}</p>
            {row.why && <p className="mt-0.5 text-[12px] text-gray-700" data-testid="row-why">理由: {row.why}</p>}
            <p className="mt-0.5 text-[11px] text-gray-400" data-testid="row-recommended">recommendedProposalId: {row.recommended ?? "null"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
