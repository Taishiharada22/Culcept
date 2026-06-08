import { describe, it, expect } from "vitest";
import {
  buildContextModifier,
  contextReasonLine,
  isContextModifierEnabled,
  DAY_REHEARSAL_CONTEXT_MODIFIER_ENABLED,
  type ContextSnapshot,
  type ContextSource,
} from "@/lib/plan/context/contextModifier";

const OBS: ContextSource = "observed";

function snap(over: ContextSnapshot = {}): ContextSnapshot {
  return over;
}

describe("buildContextModifier — 空 / unknown source", () => {
  it("空 snapshot → overallTilt unknown・factor なし・count 0", () => {
    const m = buildContextModifier(snap());
    expect(m.overallTilt).toBe("unknown");
    expect(m.factors).toHaveLength(0);
    expect(m.knownSignalCount).toBe(0);
    expect(m.widenUncertainty).toBe(false);
  });
  it("★source unknown → factor を作らず ignoredUnknown に記録（断定しない）", () => {
    const m = buildContextModifier(snap({ weather: { value: "rain", source: "unknown" } }));
    expect(m.factors).toHaveLength(0);
    expect(m.ignoredUnknown).toContain("weather");
    expect(m.overallTilt).toBe("unknown");
  });
});

describe("buildContextModifier — 各信号の tilt", () => {
  it("weather rain(observed) → tightens slight", () => {
    const m = buildContextModifier(snap({ weather: { value: "rain", source: OBS } }));
    const f = m.factors.find((x) => x.signal === "weather")!;
    expect(f.direction).toBe("tightens");
    expect(f.strength).toBe("slight");
    expect(f.grounding).toBe("general"); // ★v0 は本人観測でなく一般則
  });
  it("weather cold/normal → factor なし（記述扱い）", () => {
    expect(buildContextModifier(snap({ weather: { value: "cold", source: OBS } })).factors).toHaveLength(0);
    expect(buildContextModifier(snap({ weather: { value: "normal", source: OBS } })).factors).toHaveLength(0);
  });
  it("density packed → tightens notable / sparse → eases slight / balanced → なし", () => {
    expect(buildContextModifier(snap({ density: { value: "packed", source: OBS } })).factors[0]).toMatchObject({ direction: "tightens", strength: "notable" });
    expect(buildContextModifier(snap({ density: { value: "sparse", source: OBS } })).factors[0]).toMatchObject({ direction: "eases", strength: "slight" });
    expect(buildContextModifier(snap({ density: { value: "balanced", source: OBS } })).factors).toHaveLength(0);
  });
  it("position late → tightens / early・mid → なし", () => {
    expect(buildContextModifier(snap({ positionInDay: { value: "late", source: OBS } })).factors[0]?.direction).toBe("tightens");
    expect(buildContextModifier(snap({ positionInDay: { value: "early", source: OBS } })).factors).toHaveLength(0);
    expect(buildContextModifier(snap({ positionInDay: { value: "mid", source: OBS } })).factors).toHaveLength(0);
  });
  it("energy 低→tightens notable / 高→eases slight / 中→なし", () => {
    expect(buildContextModifier(snap({ energy: { value: 0.2, source: "derived" } })).factors[0]).toMatchObject({ direction: "tightens", strength: "notable" });
    expect(buildContextModifier(snap({ energy: { value: 0.8, source: "derived" } })).factors[0]).toMatchObject({ direction: "eases", strength: "slight" });
    expect(buildContextModifier(snap({ energy: { value: 0.5, source: "derived" } })).factors).toHaveLength(0);
  });
  it("travel heavy→tightens / light→eases / moderate→なし", () => {
    expect(buildContextModifier(snap({ travelLoad: { value: "heavy", source: OBS } })).factors[0]?.direction).toBe("tightens");
    expect(buildContextModifier(snap({ travelLoad: { value: "light", source: OBS } })).factors[0]?.direction).toBe("eases");
    expect(buildContextModifier(snap({ travelLoad: { value: "moderate", source: OBS } })).factors).toHaveLength(0);
  });
  it("★timeBand / dayType は known source でも tilt factor を出さない（記述のみ・過剰主張回避）", () => {
    const m = buildContextModifier(snap({ timeBand: { value: "evening", source: OBS }, dayType: { value: "weekend", source: OBS } }));
    expect(m.factors).toHaveLength(0);
    expect(m.overallTilt).toBe("unknown");
  });
});

describe("buildContextModifier — 集約 overallTilt", () => {
  it("packed+late（tighten 3）→ tighter_than_usual", () => {
    const m = buildContextModifier(snap({ density: { value: "packed", source: OBS }, positionInDay: { value: "late", source: OBS } }));
    expect(m.overallTilt).toBe("tighter_than_usual");
    expect(m.widenUncertainty).toBe(false); // 一貫した tighten・2 信号
  });
  it("sparse+light+high energy（ease 3）→ easier_than_usual", () => {
    const m = buildContextModifier(snap({ density: { value: "sparse", source: OBS }, travelLoad: { value: "light", source: OBS }, energy: { value: 0.9, source: "derived" } }));
    expect(m.overallTilt).toBe("easier_than_usual");
  });
  it("単一 sparse（ease 1・|net|<2）→ as_usual", () => {
    expect(buildContextModifier(snap({ density: { value: "sparse", source: OBS } })).overallTilt).toBe("as_usual");
  });
});

describe("buildContextModifier — widenUncertainty（捏造でなく広げる）", () => {
  it("★mixed（packed tighten + high energy ease）→ widen true・overall as_usual", () => {
    const m = buildContextModifier(snap({ density: { value: "packed", source: OBS }, energy: { value: 0.9, source: "derived" } }));
    expect(m.overallTilt).toBe("as_usual"); // net = 2-1 = 1
    expect(m.widenUncertainty).toBe(true); // 両方向 → 読みにくい
  });
  it("★薄い証拠（単一 notable: energy 低のみ）→ widen true", () => {
    const m = buildContextModifier(snap({ energy: { value: 0.1, source: "derived" } }));
    expect(m.overallTilt).toBe("tighter_than_usual");
    expect(m.widenUncertainty).toBe(true);
  });
  it("薄い + 出所不明あり → widen true", () => {
    const m = buildContextModifier(snap({ density: { value: "sparse", source: OBS }, weather: { value: "rain", source: "unknown" } }));
    expect(m.ignoredUnknown).toContain("weather");
    expect(m.widenUncertainty).toBe(true);
  });
});

describe("contextReasonLine — 仮説トーン・sensitive-free・偽数値なし", () => {
  it("条件なし → null（沈黙）", () => {
    expect(contextReasonLine(buildContextModifier(snap()))).toBeNull();
  });
  it("tighter → 余白を見ておく系の 1 行", () => {
    const line = contextReasonLine(buildContextModifier(snap({ density: { value: "packed", source: OBS }, positionInDay: { value: "late", source: OBS } })));
    expect(line).toContain("余白");
    expect(line).not.toMatch(/[0-9]/); // ★数値を出さない
  });
  it("easier → ゆとり系の 1 行", () => {
    const line = contextReasonLine(buildContextModifier(snap({ density: { value: "sparse", source: OBS }, travelLoad: { value: "light", source: OBS }, energy: { value: 0.9, source: "derived" } })));
    expect(line).toContain("ゆとり");
  });
  it("★mixed/widen + as_usual → 当てにくい日（断定せず広げる）", () => {
    const line = contextReasonLine(buildContextModifier(snap({ density: { value: "packed", source: OBS }, energy: { value: 0.9, source: "derived" } })));
    expect(line).toContain("当てにくい");
  });
  it("★場所名・同伴者・確率を含まない（sensitive-free）", () => {
    const line = contextReasonLine(buildContextModifier(snap({ density: { value: "packed", source: OBS }, positionInDay: { value: "late", source: OBS } })));
    expect(line).not.toMatch(/%|確率|駅|自宅|職場|さんと/);
  });
});

describe("純粋性 / flag", () => {
  it("★同一入力で同一出力（pure・副作用なし）", () => {
    const s = snap({ density: { value: "packed", source: OBS }, energy: { value: 0.2, source: "derived" } });
    expect(buildContextModifier(s)).toStrictEqual(buildContextModifier(s));
  });
  it("★flag default OFF・反映無効（production hard block）", () => {
    expect(DAY_REHEARSAL_CONTEXT_MODIFIER_ENABLED).toBe(false);
    expect(isContextModifierEnabled()).toBe(false);
  });
});
