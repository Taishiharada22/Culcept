/**
 * RD2f-wiring-P2 — operator real-data preview path への leaveBy enrichment **no-op wiring** + non-load-bearing guard（2026-06-15）
 * 正本設計: docs/reality-leaveby-assembly-wiring-rd2f-assembly-wiring-0.md（§3/§6/§7）
 *
 * 核（honest constraint）: route ETA supply 未接続ゆえ `assembleLeaveByBindings` は real-data でも **何も attach しない**。
 *   flag ON/OFF で operator snapshot/payload は **byte 同一**（inert plumbing）。real leaveBy 接続ではない。
 *
 * 検証:
 *   - operator flag OFF → enrichment 非実行・snapshot/payload 差分ゼロ。
 *   - operator flag ON（empty supply）→ snapshot/payload は OFF と byte 同一・exact timestamp 不出現。
 *   - MovementReality（leaveByKnown/routeKnown/etaKnown/missingInputs）by-reference 不変。
 *   - **non-load-bearing 静的証明**: Feasibility/CollapseRisk/InterventionEligibility(Permission)/Surface/Copy/Delivery/
 *     judgmentInput の **どの module も `leaveByComputed` を参照しない**（source-scan）。
 *   - product `/plan` / Alter tab は reality enrichment に未接続（source-scan）。
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import {
  buildOperatorDaySnapshot as buildSnapshotDefault,
  buildOperatorDayRealPayload as buildPayloadDefault,
  realDayPayloadLeakViolations,
  type OperatorDayPreviewDeps,
} from "@/lib/plan/realityCore/operatorDayPreview";
import { makeRealityInstantJst } from "@/lib/plan/realityCore/realityInstant";
import { LEAVEBY_LEAK_TOKENS } from "@/lib/plan/realityCore/leaveByLeakTokens";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

const REF = new Date(Date.UTC(2026, 5, 12, 0, 0)); // JST 09:00
const SUBJ = makeRealityInstantJst(REF).subjectiveDate; // "2026-06-12"
const OP = "op-user-1";

function oneOff(over: Partial<ExternalAnchor> & { id: string; startTime: string }): ExternalAnchor {
  return { anchorKind: "one_off", userId: OP, sourceId: "src-real", title: "予定", date: SUBJ, rigidity: "soft", endTime: undefined, confirmedAt: "2026-06-01T00:00:00.000Z", ...over } as unknown as ExternalAnchor;
}
const ANCHORS: ExternalAnchor[] = [
  oneOff({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷", rigidity: "hard" }),
  oneOff({ id: "a2", startTime: "18:00", endTime: "19:00" }),
];
const depsOf = (anchors: ExternalAnchor[]): OperatorDayPreviewDeps => ({ listAnchors: async () => anchors });

/** flag を env で切替えて operatorDayPreview を fresh import（PLAN_FLAGS は module-load 時評価ゆえ resetModules 必須） */
async function freshOperator(on: boolean) {
  vi.resetModules();
  vi.stubEnv("REALITY_LEAVEBY_ENRICH_PREVIEW", on ? "true" : "");
  return import("@/lib/plan/realityCore/operatorDayPreview");
}
async function snapshotWithFlag(on: boolean) {
  const mod = await freshOperator(on);
  return mod.buildOperatorDaySnapshot(ANCHORS, SUBJ, REF, OP);
}
async function payloadWithFlag(on: boolean) {
  const mod = await freshOperator(on);
  return mod.buildOperatorDayRealPayload({ operatorUserId: OP, referenceInstantUtc: REF }, depsOf(ANCHORS));
}

// block コメントと行コメントを除去（string-literal 内は近似だが本 module 群は token 不含有を確認済）
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}
function readSrc(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("RD2f-wiring-P2 #1 flag default OFF・OFF で enrichment 非実行（payload 構築・leak ゼロ）", () => {
  it("PLAN_FLAGS.realityLeaveByEnrichPreview は env 未設定で false（新 flag 追加なし＝既存 flag 再利用）", () => {
    expect(PLAN_FLAGS.realityLeaveByEnrichPreview).toBe(false);
  });
  it("OFF（top import）で operator real-data payload が available・leak violation ゼロ", async () => {
    const payload = await buildPayloadDefault({ operatorUserId: OP, referenceInstantUtc: REF }, depsOf(ANCHORS));
    expect(payload.available).toBe(true);
    expect(realDayPayloadLeakViolations(payload)).toEqual([]);
    // sanity: snapshot が real ERN を持つ（fixture でなく実 anchor 由来）
    const snap = buildSnapshotDefault(ANCHORS, SUBJ, REF, OP);
    expect(snap.eventRealityNodes.length).toBe(2);
  });
});

describe("RD2f-wiring-P2 #2 OFF と ON(empty supply) で snapshot/payload byte 同一（real-data path）", () => {
  it("snapshot: OFF === ON（mv/ern/missingInputs 含む全 internal が不変）", async () => {
    const off = await snapshotWithFlag(false);
    const on = await snapshotWithFlag(true);
    expect(JSON.stringify(on)).toBe(JSON.stringify(off));
  });
  it("payload(safe DTO): OFF === ON（Feasibility/Risk/Permission/Surface/Copy/Delivery 出力不変）", async () => {
    const off = await payloadWithFlag(false);
    const on = await payloadWithFlag(true);
    expect(JSON.stringify(on)).toBe(JSON.stringify(off));
  });
});

describe("RD2f-wiring-P2 #3/#4 operator output に leaveByComputed / exact instant token が出ない", () => {
  it("ON payload に exact-instant content token（leaveByInstant/arrivalTarget/timeContract/*Ref）不出現", async () => {
    // RD3b-P1/RD3x-P2: readiness.leaveByComputedPresentCount + payload.leaveByComputedPresent（RD3x-P2 boolean）は意図的
    //   safe schema-state（substring "leavebycomputed" を含むが exact instant でない）。"leavebycomputedpresent" 除去で count
    //   prefix も同時に消える。残り content token のみ検証する（dogfood と同 contract）。
    const on = await payloadWithFlag(true);
    const json = JSON.stringify(on).toLowerCase().split("leavebycomputedpresent").join("");
    for (const t of LEAVEBY_LEAK_TOKENS) expect(json.includes(t)).toBe(false);
  });
  it("ON snapshot にも実データ由来の leaveByComputed は attach されない（empty supply）", async () => {
    const on = await snapshotWithFlag(true);
    for (const e of on.eventRealityNodes) expect(e.leaveByComputed).toBeUndefined();
  });
});

describe("RD2f-wiring-P2 #5 operator token leak guard が synthetic leak を検出", () => {
  it("realDayPayloadLeakViolations が leaveByComputed 系 token を弾く", () => {
    const synthetic = {
      nested: {
        leaveByComputed: {
          leaveByInstant: "2026-06-12T13:40:00+09:00",
          timeContract: { arrivalTargetInstant: "2026-06-12T14:00:00+09:00" },
          sourceTimeEstimateRef: "ref_src",
          bufferRef: "ref_buf",
        },
      },
    };
    const out = realDayPayloadLeakViolations(synthetic as never);
    for (const t of LEAVEBY_LEAK_TOKENS) expect(out.some((m) => m.includes(t))).toBe(true);
  });
});

describe("RD2f-wiring-P2 #6/#7/#8/#9 MovementReality 不変（leaveByKnown/routeKnown/etaKnown/missingInputs）", () => {
  it("OFF snapshot の mv は v0 invariant（known 系 false・mobilityStatus unresolved）", async () => {
    const off = await snapshotWithFlag(false);
    expect(off.movementRealityNodes.length).toBeGreaterThan(0);
    for (const m of off.movementRealityNodes) {
      expect(m.routeKnown.value).toBe(false);
      expect(m.etaKnown.value).toBe(false);
      expect(m.leaveByKnown.value).toBe(false);
    }
  });
  it("ON snapshot の mv は OFF と完全一致（by-reference 不変＝enrichment は ern のみ通過）", async () => {
    const off = await snapshotWithFlag(false);
    const on = await snapshotWithFlag(true);
    expect(JSON.stringify(on.movementRealityNodes)).toBe(JSON.stringify(off.movementRealityNodes));
  });
});

// ── non-load-bearing 静的証明（source-scan）: judgment/surface/copy/delivery chain は leaveByComputed を参照しない ──
const CHAIN_MODULES: ReadonlyArray<{ label: string; rel: string }> = [
  { label: "#10 Feasibility", rel: "lib/plan/realityCore/feasibilityJudgment.ts" },
  { label: "#11 CollapseRisk", rel: "lib/plan/realityCore/collapseRisk.ts" },
  { label: "#11 CollapsePropagation", rel: "lib/plan/realityCore/collapsePropagation.ts" },
  { label: "#12 InterventionEligibility", rel: "lib/plan/realityCore/interventionEligibility.ts" },
  { label: "#12 InterventionDecision", rel: "lib/plan/realityCore/interventionDecision.ts" },
  { label: "#12 judgmentInput", rel: "lib/plan/realityCore/realityJudgmentInput.ts" },
  { label: "#13 SurfacePlan", rel: "lib/plan/realityCore/judgmentSurfacePlan.ts" },
  { label: "#13 SurfaceClaim", rel: "lib/plan/realityCore/surfaceClaim.ts" },
  { label: "#13 SurfaceProjection", rel: "lib/plan/realityCore/surfaceProjection.ts" },
  { label: "#13 CopySurface", rel: "lib/plan/realityCore/copySurface.ts" },
  { label: "#13 DeliveryGate", rel: "lib/plan/realityCore/deliveryGate.ts" },
];

describe("RD2f-wiring-P2 #10-#13 non-load-bearing: chain module は leaveByComputed を読まない（source-scan）", () => {
  for (const m of CHAIN_MODULES) {
    it(`${m.label} は leaveByComputed を参照しない`, () => {
      const code = stripComments(readSrc(m.rel));
      expect(code.includes("leaveByComputed")).toBe(false);
    });
  }
  it("Feasibility は display `ern.leaveBy`（computed でない）を読む（既存挙動の確認）", () => {
    const code = stripComments(readSrc("lib/plan/realityCore/feasibilityJudgment.ts"));
    expect(code.includes("ern.leaveBy")).toBe(true); // display attribute は読む
    expect(code.includes("leaveByComputed")).toBe(false); // computed は読まない
  });
});

describe("RD2f-wiring-P2 #14 product /plan / Alter tab は reality enrichment に未接続（source-scan）", () => {
  const PRODUCT_FILES: ReadonlyArray<string> = [
    "app/(culcept)/plan/page.tsx",
    "app/(culcept)/plan/tabs/AlterTab.tsx",
    "app/(culcept)/plan/tabs/buildAlterScreen.ts",
  ];
  for (const rel of PRODUCT_FILES) {
    it(`${rel} は operatorDayPreview/dogfoodPreview/assembleLeaveByBindings/leaveByComputed を参照しない`, () => {
      const code = stripComments(readSrc(rel));
      expect(code.includes("operatorDayPreview")).toBe(false);
      expect(code.includes("dogfoodPreview")).toBe(false);
      expect(code.includes("assembleLeaveByBindings")).toBe(false);
      expect(code.includes("leaveByComputed")).toBe(false);
      expect(code.includes("realityLeaveByEnrichPreview")).toBe(false);
    });
  }
});
