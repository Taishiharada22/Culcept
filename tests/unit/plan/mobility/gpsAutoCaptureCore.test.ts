import { describe, it, expect } from "vitest";
import {
  shouldSampleGps,
  evaluateCaptureCandidate,
  pickCaptureCandidate,
  buildCaptureEvent,
  DAY_REHEARSAL_GPS_CAPTURE_ENABLED,
  type CaptureLegContext,
} from "@/lib/plan/mobility/gpsAutoCaptureCore";
import type { PositionSample } from "@/lib/plan/mobility/movementEventDetector";

const FROM = { lat: 35.6812, lng: 139.7671 };
const TO = { lat: 35.6586, lng: 139.7454 };
const ENROUTE = { lat: 35.67, lng: 139.756 };
const MIN = 60_000;

function s(atMin: number, p: { lat: number; lng: number }, accuracyM?: number): PositionSample {
  return { at: atMin * MIN, lat: p.lat, lng: p.lng, accuracyM };
}
function leg(over: Partial<CaptureLegContext> = {}): CaptureLegContext {
  return {
    legKey: "a__b",
    odKey: "home->office",
    mode: "train",
    estimateMin: 30,
    sensitive: false,
    readOnly: false,
    fromCoord: FROM,
    toCoord: TO,
    ...over,
  };
}
// high confidence: 出発 + 到着 + dwell + 密
const HIGH_SAMPLES = [s(0, FROM), s(5, ENROUTE), s(20, TO), s(24, { lat: TO.lat + 0.0003, lng: TO.lng })];
// medium: 両端 + 正所要だが dwell 未確認 & 非密(3点)
const MEDIUM_SAMPLES = [s(0, FROM), s(10, ENROUTE), s(20, TO)];

describe("shouldSampleGps — gate（flag/opt-in/permission）", () => {
  it("flag ON ∧ opt-in granted ∧ permission granted → true", () => {
    expect(shouldSampleGps({ flagEnabled: true, optInState: "granted", permission: "granted" })).toBe(true);
  });
  it("★flag OFF → false（既定・完全不変）", () => {
    expect(shouldSampleGps({ flagEnabled: false, optInState: "granted", permission: "granted" })).toBe(false);
  });
  it("★permission denied/prompt/unsupported/unavailable → false", () => {
    for (const p of ["denied", "prompt", "unsupported", "unavailable"] as const) {
      expect(shouldSampleGps({ flagEnabled: true, optInState: "granted", permission: p })).toBe(false);
    }
  });
  it("★opt-in not_asked/snoozed/declined → false", () => {
    for (const o of ["not_asked", "snoozed", "declined"] as const) {
      expect(shouldSampleGps({ flagEnabled: true, optInState: o, permission: "granted" })).toBe(false);
    }
  });
  it("DAY_REHEARSAL_GPS_CAPTURE_ENABLED は default OFF", () => {
    expect(DAY_REHEARSAL_GPS_CAPTURE_ENABLED).toBe(false);
  });
});

describe("evaluateCaptureCandidate — blackout / 既記録 / dismiss", () => {
  const base = { samples: HIGH_SAMPLES, alreadyRecorded: false, dismissed: false };
  it("★sensitive → candidate null（blocked_sensitive）", () => {
    const r = evaluateCaptureCandidate({ leg: leg({ sensitive: true }), ...base });
    expect(r.candidate).toBeNull();
    expect(r.reason).toBe("blocked_sensitive");
  });
  it("★readOnly → candidate null（blocked_readonly）", () => {
    expect(evaluateCaptureCandidate({ leg: leg({ readOnly: true }), ...base }).reason).toBe("blocked_readonly");
  });
  it("already recorded → null", () => {
    expect(evaluateCaptureCandidate({ leg: leg(), ...base, alreadyRecorded: true }).reason).toBe("already_recorded");
  });
  it("dismissed → null", () => {
    expect(evaluateCaptureCandidate({ leg: leg(), ...base, dismissed: true }).reason).toBe("dismissed");
  });
});

describe("evaluateCaptureCandidate — detector 連動（accuracy/confidence/arrival）", () => {
  const base = { alreadyRecorded: false, dismissed: false };
  it("★low accuracy のみ（>1000m）→ detector filter で no_detection（no-op）", () => {
    const lowAcc = [s(0, FROM, 2000), s(5, ENROUTE, 2000), s(20, TO, 2000)];
    expect(evaluateCaptureCandidate({ leg: leg(), samples: lowAcc, ...base }).reason).toBe("no_detection");
  });
  it("★出発のみ・到着なし → no_arrival（到着時のみ prompt）", () => {
    const noArrival = [s(0, FROM), s(5, ENROUTE), s(10, ENROUTE)];
    expect(evaluateCaptureCandidate({ leg: leg(), samples: noArrival, ...base }).reason).toBe("no_arrival");
  });
  it("★low confidence（疎 2 点）→ low_confidence（黙って破棄）", () => {
    const r = evaluateCaptureCandidate({ leg: leg(), samples: [s(0, FROM), s(40, TO)], ...base });
    expect(r.candidate).toBeNull();
    expect(r.reason).toBe("low_confidence");
  });
  it("★medium → candidate ok", () => {
    const r = evaluateCaptureCandidate({ leg: leg(), samples: MEDIUM_SAMPLES, ...base });
    expect(r.reason).toBe("ok");
    expect(r.candidate?.legKey).toBe("a__b");
    expect(r.candidate?.detected.confidence).toBe("medium");
  });
  it("★high → candidate ok（mode/odKey/estimate を candidate に保持）", () => {
    const r = evaluateCaptureCandidate({ leg: leg(), samples: HIGH_SAMPLES, ...base });
    expect(r.reason).toBe("ok");
    expect(r.candidate?.detected.confidence).toBe("high");
    expect(r.candidate?.mode).toBe("train");
    expect(r.candidate?.odKey).toBe("home->office");
    expect(r.candidate?.estimateMin).toBe(30);
  });
});

describe("pickCaptureCandidate — 複数 leg から直近到着を 1 つ", () => {
  it("ok candidate のうち到着が最新のものを選ぶ", () => {
    const THIRD = { lat: 35.69, lng: 139.7 }; // FROM/TO/ENROUTE と十分離れた第3地点
    const legEarly = leg({ legKey: "early", fromCoord: FROM, toCoord: TO });
    const legLate = leg({ legKey: "late", fromCoord: TO, toCoord: THIRD }); // TO→THIRD（到着先は未占有）
    const samples = [
      s(0, FROM), s(5, ENROUTE), s(20, TO), s(24, { lat: TO.lat + 0.0003, lng: TO.lng }), // early 到着 20分
      s(30, ENROUTE), s(50, THIRD), s(54, { lat: THIRD.lat + 0.0003, lng: THIRD.lng }), // late 到着 50分
    ];
    const best = pickCaptureCandidate({
      legs: [legEarly, legLate],
      samples,
      isRecorded: () => false,
      isDismissed: () => false,
    });
    expect(best?.legKey).toBe("late");
  });
  it("recorded / dismissed は除外", () => {
    const best = pickCaptureCandidate({
      legs: [leg()],
      samples: HIGH_SAMPLES,
      isRecorded: (k) => k === "a__b",
      isDismissed: () => false,
    });
    expect(best).toBeNull();
  });
  it("候補なし → null", () => {
    expect(
      pickCaptureCandidate({ legs: [leg({ sensitive: true })], samples: HIGH_SAMPLES, isRecorded: () => false, isDismissed: () => false }),
    ).toBeNull();
  });
});

describe("buildCaptureEvent — derived only / source=gps / meta", () => {
  it("source=gps・meta(mode/odKey/estimate) 反映・★raw 座標を含まない", () => {
    const r = evaluateCaptureCandidate({ leg: leg(), samples: HIGH_SAMPLES, alreadyRecorded: false, dismissed: false });
    const ev = buildCaptureEvent(r.candidate!, Date.parse("2026-06-08T00:30:00.000Z"));
    expect(ev.source).toBe("gps");
    expect(ev.mode).toBe("train");
    expect(ev.odKey).toBe("home->office");
    expect(ev.estimateMin).toBe(30);
    expect(ev.actualDurationMin).toBe(15);
    expect(Object.keys(ev)).not.toContain("lat");
    expect(Object.keys(ev)).not.toContain("lng");
  });
});
