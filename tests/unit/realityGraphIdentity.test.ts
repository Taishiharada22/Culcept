/**
 * Graph identity / RealityInstant（RC2a-1）— 決定性・感度・等価性の fixture
 * 正本: docs/reality-graph-identity-hardening-rg06b.md §1-4/§12/§16
 */
import {
  buildGraphBaseId,
  buildMomentSnapshotId,
  buildSnapshotId,
  canonicalSerialize,
  derivationRevision,
  fnv1a64Hex,
  graphViewerKey,
  recordRevisionOf,
  revisionOf,
  REALITY_DERIVATION_VERSIONS,
  type InputRevisionSet,
} from "@/lib/plan/realityCore/graphIdentity";
import { makeRealityInstantJst } from "@/lib/plan/realityCore/realityInstant";
import { jstNowMinutes } from "@/app/(culcept)/plan/components/alter/screenViewModel";
import { subjectiveDateFor, toHHMM, toJstWallClock } from "@/lib/plan/alterTab/adapter";
import { applyUserCorrection, buildDayStateRecord } from "@/lib/plan/dayState/buildDayStateRecord";
import type { DayStateBuildInput } from "@/lib/plan/dayState/dayStateTypes";

function record(over: Partial<DayStateBuildInput> = {}) {
  return buildDayStateRecord({
    date: "2026-06-12",
    nowHHMM: "07:00",
    segments: [
      { kind: "event", startHHMM: "10:00", endHHMM: "11:00", durationMin: 60, timeBucket: "morning" },
    ],
    shift: { kind: "none" },
    weather: null,
    ...over,
  });
}

describe("fnv1a64 / canonicalSerialize — 決定性と正規化", () => {
  it("同一入力 → 同一 hash（決定的・16 hex）", () => {
    expect(fnv1a64Hex("aneurasync")).toBe(fnv1a64Hex("aneurasync"));
    expect(fnv1a64Hex("aneurasync")).toMatch(/^[0-9a-f]{16}$/);
    expect(fnv1a64Hex("a")).not.toBe(fnv1a64Hex("b"));
  });
  it("canonical: key 順序非依存・undefined 除去", () => {
    expect(canonicalSerialize({ b: 1, a: 2 })).toBe(canonicalSerialize({ a: 2, b: 1 }));
    expect(canonicalSerialize({ a: 1, x: undefined })).toBe(canonicalSerialize({ a: 1 }));
    expect(canonicalSerialize({ a: [1, 2] })).not.toBe(canonicalSerialize({ a: [2, 1] })); // 配列順は意味を持つ
  });
  it("revision は自己記述 prefix（rev1:fnv1a64:）を持つ", () => {
    expect(revisionOf({ x: 1 })).toMatch(/^rev1:fnv1a64:[0-9a-f]{16}$/);
  });
});

describe("recordRevision — 本人台帳の変化にのみ感応（RG0.6b §3・builtAt 非感度）", () => {
  it("同一 record の再 build（リロード相当）では不変", () => {
    expect(recordRevisionOf(record())).toBe(recordRevisionOf(record()));
  });
  it("補正 / manualLevels / 睡眠 / NightCheck 回答で変わる", () => {
    const base = record();
    const r1 = recordRevisionOf(base);
    expect(recordRevisionOf(applyUserCorrection(base, { at: "09:00", field: "energyLevel", direction: "higher" }))).not.toBe(r1);
    expect(recordRevisionOf(record({ manualLevels: { energyLevel: 80 } }))).not.toBe(r1);
    expect(recordRevisionOf(record({ sleepQuality: "short" }))).not.toBe(r1);
    expect(
      recordRevisionOf({ ...base, nightCheck: { answeredAt: "21:00", answeredFor: "2026-06-12", dayFelt: 3, verdicts: {} } }),
    ).not.toBe(r1);
  });
  it("estimates 現在値そのもの・evidence は hash 対象外（補正以外の derive 差で揺れない）", () => {
    const a = record();
    // estimates / evidence を人工的に差し替えても revision は不変（hash 対象が本人入力＋凍結のみの証明）
    const b = { ...a, estimates: { ...a.estimates }, evidence: [...a.evidence, "weather_rain" as const] };
    expect(recordRevisionOf(b)).toBe(recordRevisionOf(a));
  });
});

describe("Graph identity 3 層 — 感度と minute 規律（RG0.6b §1-3）", () => {
  const inputSet: InputRevisionSet = {
    dayGraphRevision: "dg:abc",
    recordRevision: recordRevisionOf(record()),
    environmentRevision: "env0:none",
    hintsRevision: "hints0:none",
    shiftRevision: "shift0:none",
    derivationRevision: derivationRevision(),
    schemaVersion: 0,
  };
  const viewerKey = graphViewerKey("viewer-self");
  const baseId = buildGraphBaseId({ subjectiveDate: "2026-06-12", viewerKey, inputRevisionSet: inputSet });

  it("graphBaseId は決定的・各 revision 成分に感応", () => {
    expect(buildGraphBaseId({ subjectiveDate: "2026-06-12", viewerKey, inputRevisionSet: inputSet })).toBe(baseId);
    for (const key of ["dayGraphRevision", "recordRevision", "environmentRevision", "hintsRevision", "shiftRevision", "derivationRevision"] as const) {
      const mutated = { ...inputSet, [key]: "rev1:fnv1a64:deadbeefdeadbeef" };
      expect(buildGraphBaseId({ subjectiveDate: "2026-06-12", viewerKey, inputRevisionSet: mutated })).not.toBe(baseId);
    }
  });

  it("derive version の bump で graphBaseId が変わる（コード更新後の同 id 防止）", () => {
    const bumped = { ...inputSet, derivationRevision: revisionOf({ ...REALITY_DERIVATION_VERSIONS, momentSnapshot: 1 }) };
    expect(buildGraphBaseId({ subjectiveDate: "2026-06-12", viewerKey, inputRevisionSet: bumped })).not.toBe(baseId);
  });

  it("snapshotId は分が進めば別 id / momentSnapshotId も同様", () => {
    expect(buildSnapshotId(baseId, 520)).not.toBe(buildSnapshotId(baseId, 521));
    expect(
      buildMomentSnapshotId({ subjectiveDate: "2026-06-12", viewerKey, minuteOfSubjectiveDay: 520, graphBaseId: baseId }),
    ).not.toBe(buildMomentSnapshotId({ subjectiveDate: "2026-06-12", viewerKey, minuteOfSubjectiveDay: 521, graphBaseId: baseId }));
  });
});

describe("graphViewerKey — 擬名化（RG0.6b §12）", () => {
  it("決定的・raw viewerId を含まない", () => {
    const raw = "виewer-1234-uuid-like";
    const key = graphViewerKey(raw);
    expect(key).toBe(graphViewerKey(raw));
    expect(key).toMatch(/^vk[0-9a-f]{16}$/);
    expect(key.includes(raw)).toBe(false);
    expect(graphViewerKey("other")).not.toBe(key);
  });
});

describe("RealityInstant — TZ 換算の単一正本（既存実装との等価性で再分裂を防ぐ）", () => {
  // W6 実バグの再現値: UTC 14:17 = JST 23:17
  const utc1417 = new Date(Date.UTC(2026, 5, 12, 14, 17, 42, 500));

  it("JST 壁時計・暦日・主観日・主観分が正しい", () => {
    const ri = makeRealityInstantJst(utc1417);
    expect(ri.timezone).toBe("Asia/Tokyo");
    expect(ri.wallClockHHMM).toBe("23:17");
    expect(ri.calendarDate).toBe("2026-06-12");
    expect(ri.subjectiveDate).toBe("2026-06-12");
    expect(ri.minuteOfSubjectiveDay).toBe((23 - 5) * 60 + 17);
  });

  it("深夜 JST 02:00 → 主観日は前日（05:00 境界）", () => {
    const ri = makeRealityInstantJst(new Date(Date.UTC(2026, 5, 12, 17, 0))); // JST 6/13 02:00
    expect(ri.calendarDate).toBe("2026-06-13");
    expect(ri.subjectiveDate).toBe("2026-06-12");
    expect(ri.minuteOfSubjectiveDay).toBe(21 * 60);
  });

  it("既存 3 実装と等価（jstNowMinutes / toJstWallClock+toHHMM / subjectiveDateFor — 時刻ソース再分裂の機械検出）", () => {
    for (const d of [utc1417, new Date(Date.UTC(2026, 5, 12, 17, 0)), new Date(Date.UTC(2026, 5, 11, 20, 5))]) {
      const ri = makeRealityInstantJst(d);
      const wall = toJstWallClock(d);
      expect(ri.wallClockHHMM).toBe(toHHMM(wall));
      expect(ri.subjectiveDate).toBe(subjectiveDateFor(wall));
      const absMin = jstNowMinutes(d);
      expect(ri.minuteOfSubjectiveDay).toBe((absMin - 300 + 1440) % 1440);
    }
  });

  it("nowInstant の秒/ms は identity 成分（minute 系 field）に影響しない", () => {
    const a = makeRealityInstantJst(new Date(Date.UTC(2026, 5, 12, 14, 17, 1, 100)));
    const b = makeRealityInstantJst(new Date(Date.UTC(2026, 5, 12, 14, 17, 58, 900)));
    expect(a.nowInstant).not.toBe(b.nowInstant); // metadata は異なる
    expect(a.minuteOfSubjectiveDay).toBe(b.minuteOfSubjectiveDay); // identity は同一
    expect(a.wallClockHHMM).toBe(b.wallClockHHMM);
  });
});
