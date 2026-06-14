/**
 * operatorDayPreview（RD1a operator 当日 one-off real-data preview orchestration）— CEO 必須 fixtures
 * 正本: docs/reality-real-data-wiring-readiness-rd0.md / CEO RD1a 実装 GO
 *
 * 核: operator 当日 one-off anchor のみ read-only で RC2a→RJ2 chain→safe DTO。recurring は読む+数えるが当日 graph に入れない。
 *   unavailable 時 fixture へ fallback しない。raw anchor/internal を client に渡さない。place/ETA/otherPeople を fake しない。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import {
  selectTodayOneOff,
  buildOperatorDaySnapshot,
  buildOperatorDayRealPayload,
  realDayPayloadLeakViolations,
  type OperatorDayPreviewDeps,
  type RealDaySurfacePayloadV0,
} from "@/lib/plan/realityCore/operatorDayPreview";
import { makeRealityInstantJst } from "@/lib/plan/realityCore/realityInstant";

const REF = new Date(Date.UTC(2026, 5, 12, 0, 0)); // JST 09:00
const SUBJ = makeRealityInstantJst(REF).subjectiveDate; // "2026-06-12"
const OP = "op-user-1";

function oneOff(over: Partial<ExternalAnchor> & { id: string; startTime: string }): ExternalAnchor {
  return { anchorKind: "one_off", userId: OP, sourceId: "src-real", title: "予定", date: SUBJ, rigidity: "soft", endTime: undefined, confirmedAt: "2026-06-01T00:00:00.000Z", ...over } as unknown as ExternalAnchor;
}
function recurring(over: Partial<ExternalAnchor> & { id: string; startTime: string }): ExternalAnchor {
  return { anchorKind: "recurring", userId: OP, sourceId: "src-real", title: "定例", endTime: "11:00", rigidity: "hard", validFrom: "2026-01-01", recurrenceRule: "FREQ=WEEKLY;BYDAY=MO", confirmedAt: "2026-06-01T00:00:00.000Z", ...over } as unknown as ExternalAnchor;
}
const depsOf = (anchors: ExternalAnchor[]): OperatorDayPreviewDeps => ({ listAnchors: async () => anchors });

describe("RD1a #4/#5 one-off 当日のみ抽出・recurring 除外", () => {
  it("当日 one-off のみ oneOff・recurring は recurringCount に数えるが除外", () => {
    const anchors = [
      oneOff({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" }),
      oneOff({ id: "a2", startTime: "09:00", endTime: "10:00", date: "2026-06-11" }), // 別日 → 除外
      recurring({ id: "r1", startTime: "10:00" }),
      recurring({ id: "r2", startTime: "12:00" }),
    ];
    const { oneOff: sel, recurringCount } = selectTodayOneOff(anchors, SUBJ);
    expect(sel.map((a) => a.id)).toEqual(["a1"]);
    expect(recurringCount).toBe(2);
  });
});

describe("RD1a #3/#6 read-only listAnchors + recurring excluded count が summary に", () => {
  it("operator + listAnchors read のみ → summary に count", async () => {
    let calls = 0;
    const deps: OperatorDayPreviewDeps = {
      listAnchors: async (uid) => {
        calls += 1;
        expect(uid).toBe(OP);
        return [oneOff({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" }), recurring({ id: "r1", startTime: "10:00" })];
      },
    };
    const payload = await buildOperatorDayRealPayload({ operatorUserId: OP, referenceInstantUtc: REF }, deps);
    expect(calls).toBe(1);
    expect(payload.summary.includedOneOffCount).toBe(1);
    expect(payload.summary.recurringExcludedCount).toBe(1);
    expect(payload.available).toBe(true);
  });
});

describe("RD1a #7 unavailable 時 fixture へ fallback しない", () => {
  it("anchor 0 → available false・consumerView null（fixture を出さない）", async () => {
    const p = await buildOperatorDayRealPayload({ operatorUserId: OP, referenceInstantUtc: REF }, depsOf([]));
    expect(p.available).toBe(false);
    expect(p.reasonCode).toBe("no_anchor");
    expect(p.consumerView).toBeNull();
    expect(p.renderedCopy).toBeNull();
  });
  it("当日 one-off 0（recurring のみ）→ no_today_oneoff・consumerView null", async () => {
    const p = await buildOperatorDayRealPayload({ operatorUserId: OP, referenceInstantUtc: REF }, depsOf([recurring({ id: "r1", startTime: "10:00" })]));
    expect(p.available).toBe(false);
    expect(p.reasonCode).toBe("no_today_oneoff");
    expect(p.summary.recurringExcludedCount).toBe(1);
    expect(p.consumerView).toBeNull();
  });
});

describe("RD1a #8/#9/#10 fake 禁止（real anchor → RC2a が unknown/knownFalse）", () => {
  it("locationText なし → placeCertainty unknown / leaveBy null / etaKnown false / otherPeople unknown", () => {
    const anchors = [
      oneOff({ id: "a1", startTime: "10:00", endTime: "11:00" }), // location/companions なし
      oneOff({ id: "a2", startTime: "13:00", endTime: "14:00" }),
    ];
    const snapshot = buildOperatorDaySnapshot(anchors, SUBJ, REF, OP);
    // #8 place を fake しない
    expect(snapshot.eventRealityNodes.every((e) => e.placeCertainty.status === "unknown")).toBe(true);
    // #9 leaveBy null・ETA fake しない
    expect(snapshot.eventRealityNodes.every((e) => e.leaveBy.value === null)).toBe(true);
    expect(snapshot.movementRealityNodes.every((m) => m.etaKnown.value === false && m.routeKnown.value === false)).toBe(true);
    // #10 companions なし → otherPeople を false 断定しない（unknown）
    expect(snapshot.commitmentSignals.every((c) => c.otherPeoplePossible.status === "unknown")).toBe(true);
  });
});

describe("RD1a #11/#12 safe DTO に raw anchor / internal を含まない", () => {
  it("payload JSON に anchor raw / graph / trace / evidence / source / missing refs が無い", async () => {
    const p = await buildOperatorDayRealPayload({ operatorUserId: OP, referenceInstantUtc: REF }, depsOf([oneOff({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷", companions: ["田中"], sensitiveCategory: "medical", externalUid: "uid-1" })]));
    const json = JSON.stringify(p).toLowerCase();
    for (const t of ["recurrencerule", "externaluid", "sourceid", "companions", "田中", "渋谷", "medical", "ern:", "trace", "sourcerefs", "evidencerefs", "missinginput", "graphviewerkey", "suppressedreasons", "carrieddecisionkind", "snapshot"]) {
      expect(json.includes(t)).toBe(false);
    }
  });
});

describe("RD1a #13 token leak guard", () => {
  it("正常 payload → leak guard 空・raw token 注入 → 検出", async () => {
    const p = await buildOperatorDayRealPayload({ operatorUserId: OP, referenceInstantUtc: REF }, depsOf([oneOff({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]));
    expect(realDayPayloadLeakViolations(p)).toEqual([]);
    const leaked: RealDaySurfacePayloadV0 = { ...p, reasonCode: "companions leaked" };
    expect(realDayPayloadLeakViolations(leaked).some((m) => m.includes("companions"))).toBe(true);
  });
});

describe("RD1a #16 deliveredNow=false 維持", () => {
  it("available payload の delivery.deliveredNow false", async () => {
    const p = await buildOperatorDayRealPayload({ operatorUserId: OP, referenceInstantUtc: REF }, depsOf([oneOff({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]));
    expect(p.available).toBe(true);
    expect(p.delivery?.deliveredNow).toBe(false);
  });
});

describe("RD1a #14/#15 read-only / no-write / no-notification（source-scan）", () => {
  it("operatorDayPreview.ts に write/service_role/notification/push/localStorage/IO なし", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/operatorDayPreview.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of [".insert(", ".update(", ".delete(", ".upsert(", "service_role", "notification", "push(", "localStorage", "fetch(", "supabase", "Date.now", "Math.random", "new Date(", "geolocation", "currentLocation"]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});
