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
  selectDayAnchors,
  buildOperatorDaySnapshot,
  buildOperatorDayRealPayload,
  realDayPayloadLeakViolations,
  type OperatorDayPreviewDeps,
  type RealDaySurfacePayloadV0,
} from "@/lib/plan/realityCore/operatorDayPreview";
import { makeRealityInstantJst } from "@/lib/plan/realityCore/realityInstant";
import { evaluateFeasibility } from "@/lib/plan/realityCore/feasibilityJudgment";
import { buildRealityJudgmentInput } from "@/lib/plan/realityCore/realityJudgmentInput";

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

describe("RD1a #4/#5 day anchor 分離（one-off 当日 + recurring 全件）", () => {
  it("当日 one-off のみ oneOff・recurring 全件 recurring", () => {
    const anchors = [
      oneOff({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" }),
      oneOff({ id: "a2", startTime: "09:00", endTime: "10:00", date: "2026-06-11" }), // 別日 → 除外
      recurring({ id: "r1", startTime: "10:00" }),
      recurring({ id: "r2", startTime: "12:00" }),
    ];
    const { oneOff: sel, recurring: rec } = selectDayAnchors(anchors, SUBJ);
    expect(sel.map((a) => a.id)).toEqual(["a1"]);
    expect(rec.map((a) => a.id)).toEqual(["r1", "r2"]);
  });
});

describe("RD1a #3/#6 read-only listAnchors + recurring 内訳 count が summary に", () => {
  it("operator + listAnchors read のみ → summary に 4 count（recurring MO は当日=金 でない→excluded）", async () => {
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
    expect(payload.summary.oneOffIncludedCount).toBe(1);
    expect(payload.summary.recurringIncludedCount).toBe(0); // BYDAY=MO は金曜でない
    expect(payload.summary.recurringExcludedCount).toBe(1);
    expect(payload.available).toBe(true);
  });
});

describe("RD1b 当日 occur recurring（BYDAY=FR）→ graph に入る・recurringIncludedCount", () => {
  it("金曜 rule → recurringIncludedCount 1・available（fake せず展開）", async () => {
    const p = await buildOperatorDayRealPayload(
      { operatorUserId: OP, referenceInstantUtc: REF },
      depsOf([recurring({ id: "r1", startTime: "14:00", recurrenceRule: "FREQ=WEEKLY;BYDAY=FR" } as Partial<ExternalAnchor> & { id: string; startTime: string })]),
    );
    expect(p.available).toBe(true);
    expect(p.summary.oneOffIncludedCount).toBe(0);
    expect(p.summary.recurringIncludedCount).toBe(1);
    expect(realDayPayloadLeakViolations(p)).toEqual([]); // recurrenceRule 等を漏らさない
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
  it("当日 event 0（recurring MO のみ・当日=金 occur せず）→ no_today_event・consumerView null", async () => {
    const p = await buildOperatorDayRealPayload({ operatorUserId: OP, referenceInstantUtc: REF }, depsOf([recurring({ id: "r1", startTime: "10:00" })]));
    expect(p.available).toBe(false);
    expect(p.reasonCode).toBe("no_today_event");
    expect(p.summary.recurringExcludedCount).toBe(1); // MO は金曜でない
    expect(p.consumerView).toBeNull();
  });
});

describe("RD1b #8/#9 one-off + recurring 同 timeWindow → duplicate 断定しない（exact_time_collision_ambiguous）", () => {
  it("同時刻の one-off + recurring(当日 FR) → exact_time_collision_ambiguous・infeasible/confirmed 直行しない", () => {
    const dayAnchors = [
      oneOff({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" }),
      recurring({ id: "r1", startTime: "14:00", endTime: "15:00", recurrenceRule: "FREQ=WEEKLY;BYDAY=FR" } as Partial<ExternalAnchor> & { id: string; startTime: string }),
    ];
    const snapshot = buildOperatorDaySnapshot(dayAnchors, SUBJ, REF, OP);
    const fj = evaluateFeasibility(buildRealityJudgmentInput(snapshot, { kind: "day" }));
    expect(fj.judgmentTrace.timeRelations.some((rel) => rel.relationKind === "exact_time_collision_ambiguous")).toBe(true);
    expect(fj.feasibilityStatus).not.toBe("infeasible"); // confirmedBlocking 直行しない
    expect(fj.confirmedBlockingReasons).toEqual([]); // duplicate を confirmed にしない
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
