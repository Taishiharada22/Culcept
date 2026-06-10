/**
 * 横 R2 — Life Ops Placement（pure・fake/injected のみ）unit。
 *   縦の実 collector（collectLifeOpsCandidates）→ 横 placement の chain を fake inputs で固定。
 *   実データ源/DB/fetch/UI/通知 0。LifeOpsCandidate は縦正本型（横で再定義しない）。
 *
 * 設計: docs/life-ops-r2-placement-mini-design.md。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  placeLifeOpsCandidatesForDay,
  HOME_TASK_MIN,
  OUTING_BASE_MIN,
  DEFAULT_MAX_PLACEMENTS,
} from "@/lib/plan/reality/lifeops/lifeops-placement";
import { collectLifeOpsCandidates, type LifeOpsInputs } from "@/lib/lifeops/candidate-collector";
import type { LifeOpsCandidate } from "@/lib/lifeops/candidate-types";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";

const FORBIDDEN = /seed_?ref|utterance|personality|trait|title|location|@[a-z]|\b\d{10,}\b/i;
const NOW_ISO = "2026-06-10T09:00:00+09:00";

/** §10 fake scenario（実 collector を通す・実データ源ゼロ）。 */
function fakeInputs(over: Partial<LifeOpsInputs> = {}): LifeOpsInputs {
  return {
    cadenceObservations: [
      { categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: "2026-04-11T10:00:00+09:00" }, // 60 日前=well_beyond 圏
      { categoryId: "groceries", lastCompletedAtISO: "2026-05-31T10:00:00+09:00" }, // 10 日前
    ],
    upcomingEvents: [{ kind: "interview", startISO: "2026-06-13T10:00:00+09:00" }], // 3 日後
    deadlineObservations: [{ categoryId: "tax_filing", deadlineISO: "2026-06-15T00:00:00+09:00" }], // 5 日後
    ...over,
  };
}

function ws(over: Partial<WorldState> = {}): WorldState {
  return {
    date: "2026-06-10",
    nowMinute: 540, // 09:00
    todaySchedule: [],
    availableWindows: [
      { startMinute: 600, endMinute: 660, meaning: null }, // 朝 60 分
      { startMinute: 780, endMinute: 960, meaning: null }, // 午後 180 分
    ],
    context: null,
    mobility: null, // → travel buffer 既定 15 分
    permissionLevel: 2,
    ...over,
  };
}

function collect(over: Partial<LifeOpsInputs> = {}): readonly LifeOpsCandidate[] {
  return collectLifeOpsCandidates(fakeInputs(over), NOW_ISO);
}

describe("R2 placement — 縦実 collector → 横配置 chain", () => {
  it("fake scenario で候補が生成され、cap(3) 内が窓に配置される", () => {
    const candidates = collect();
    expect(candidates.length).toBeGreaterThanOrEqual(3);
    const r = placeLifeOpsCandidatesForDay({ candidates, worldState: ws() });
    expect(r.placedCount).toBeGreaterThan(0);
    expect(r.placedCount).toBeLessThanOrEqual(DEFAULT_MAX_PLACEMENTS);
    expect(r.placedCount + r.unplacedCount).toBe(candidates.length);
    // placed が先頭・unplaced が後段
    const firstUnplacedIdx = r.placements.findIndex((p) => p.window === null);
    if (firstUnplacedIdx >= 0) {
      expect(r.placements.slice(firstUnplacedIdx).every((p) => p.window === null)).toBe(true);
    }
  });
  it("優先度: deadline(tax_filing) が最優先で配置される", () => {
    const r = placeLifeOpsCandidatesForDay({ candidates: collect(), worldState: ws() });
    expect(r.placements[0].candidate.dueReason.kind).toBe("deadline");
    expect(r.placements[0].window).not.toBeNull();
  });
});

describe("R2 placement — lane mapping（§3）", () => {
  it("deadline → protect", () => {
    const r = placeLifeOpsCandidatesForDay({ candidates: collect(), worldState: ws() });
    const dl = r.placements.find((p) => p.candidate.dueReason.kind === "deadline")!;
    expect(dl.planLane).toBe("protect");
    expect(dl.placementReason).toContain("deadline_near");
  });
  it("event_prep（interview 3 日後・美容前倒し cyclePhase あり）→ push", () => {
    const r = placeLifeOpsCandidatesForDay({ candidates: collect(), worldState: ws() });
    const prep = r.placements.filter((p) => p.candidate.dueReason.kind === "event_prep");
    expect(prep.length).toBeGreaterThan(0);
    for (const p of prep) {
      const d = p.candidate.dueReason as Extract<LifeOpsCandidate["dueReason"], { kind: "event_prep" }>;
      if (d.cyclePhase !== undefined) expect(p.planLane).toBe("push");
      else expect(p.planLane).toBe(d.daysUntilEvent <= 2 ? "protect" : "easy");
    }
  });
  it("event_prep 直前（daysUntilEvent ≤ 2）→ protect", () => {
    const candidates = collect({ upcomingEvents: [{ kind: "interview", startISO: "2026-06-11T10:00:00+09:00" }] }); // 1 日後
    const r = placeLifeOpsCandidatesForDay({ candidates, worldState: ws() });
    const oneShot = r.placements.filter((p) => {
      const d = p.candidate.dueReason;
      return d.kind === "event_prep" && d.cyclePhase === undefined;
    });
    expect(oneShot.length).toBeGreaterThan(0);
    expect(oneShot.every((p) => p.planLane === "protect")).toBe(true);
    expect(oneShot[0].placementReason).toContain("event_prep_imminent");
  });
  it("cycle: groceries(daily_upkeep) は phase 連動（well_beyond→protect / 他→easy）・beauty_salon(非 health) → push", () => {
    const r = placeLifeOpsCandidatesForDay({ candidates: collect(), worldState: ws(), maxPlacements: 10 });
    const groceries = r.placements.find((p) => p.candidate.category === "groceries" && p.candidate.dueReason.kind === "cycle");
    const beauty = r.placements.find((p) => p.candidate.category === "beauty_salon" && p.candidate.dueReason.kind === "cycle");
    expect(groceries).toBeDefined();
    const gPhase = (groceries!.candidate.dueReason as Extract<LifeOpsCandidate["dueReason"], { kind: "cycle" }>).phase;
    expect(groceries!.planLane).toBe(gPhase === "well_beyond" ? "protect" : "easy"); // 生活破綻防止は protect・通常補充は easy
    if (beauty) expect(beauty.planLane).toBe("push"); // 美容（非 health）は phase に依らず攻め
  });
});

describe("R2 placement — 窓要件（§4 在宅/外出）", () => {
  it("外出候補（placeQuery あり）は 60+2×15=90 分要 → 60 分窓に入らず 180 分窓へ", () => {
    const candidates = collect();
    const outing = candidates.filter((c) => c.placeQuery !== null);
    expect(outing.length).toBeGreaterThan(0);
    const r = placeLifeOpsCandidatesForDay({ candidates: outing, worldState: ws() });
    for (const p of r.placements.filter((p) => p.window !== null)) {
      expect(p.window!.startMinute).toBe(780); // 180 分窓のみ可（90 分要 > 朝 60 分）
      expect(p.placementReason).toContain("needs_outing_window");
      expect(p.placementReason).toContain("coarse_duration");
    }
  });
  it("在宅候補（placeQuery null）は 30 分要 → 朝 60 分窓に入る", () => {
    const candidates = collect({ upcomingEvents: [{ kind: "interview", startISO: "2026-06-13T10:00:00+09:00" }] });
    const home = candidates.filter((c) => c.placeQuery === null);
    expect(home.length).toBeGreaterThan(0);
    const r = placeLifeOpsCandidatesForDay({ candidates: home, worldState: ws() });
    const first = r.placements.find((p) => p.window !== null)!;
    expect(first.window!.startMinute).toBe(600);
    expect(first.placementReason).toContain("home_doable");
    expect(OUTING_BASE_MIN + 2 * 15).toBe(90);
    expect(HOME_TASK_MIN).toBe(30);
  });
  it("mobility.typicalTravelBufferMin を使う（30 分なら外出 120 分要 → 180 分窓のみ）", () => {
    const candidates = collect().filter((c) => c.placeQuery !== null);
    const r = placeLifeOpsCandidatesForDay({ candidates, worldState: ws({ mobility: { typicalTravelBufferMin: 30 } }) });
    for (const p of r.placements.filter((p) => p.window !== null)) expect(p.window!.startMinute).toBe(780);
  });
});

describe("R2 placement — 窓の残量/過去窓/cap/捏造しない", () => {
  it("同一窓は残量内のみ多重配置（180 分窓に外出 90 分×2 で満了）", () => {
    const outing = collect().filter((c) => c.placeQuery !== null);
    const world = ws({ availableWindows: [{ startMinute: 780, endMinute: 960, meaning: null }] }); // 180 分のみ
    const r = placeLifeOpsCandidatesForDay({ candidates: outing, worldState: world, maxPlacements: 10 });
    expect(r.placedCount).toBeLessThanOrEqual(2); // 90×2=180 まで
    const over = r.placements.filter((p) => p.window === null);
    for (const p of over) expect(p.placementReason).toContain("no_window_fits");
  });
  it("過去の窓は使わない（nowMinute より前は skip / 進行中は残量縮約）", () => {
    const home = collect().filter((c) => c.placeQuery === null);
    const world = ws({ nowMinute: 1000, availableWindows: [{ startMinute: 600, endMinute: 660, meaning: null }] }); // 全部過去
    const r = placeLifeOpsCandidatesForDay({ candidates: home, worldState: world });
    expect(r.placedCount).toBe(0);
    expect(r.placements.every((p) => p.placementReason.includes("no_window_fits"))).toBe(true);
  });
  it("cap 超過は window=null + cap_exceeded で保持（捨てない）", () => {
    const candidates = collect();
    const r = placeLifeOpsCandidatesForDay({ candidates, worldState: ws(), maxPlacements: 1 });
    expect(r.placedCount).toBe(1);
    expect(r.unplacedCount).toBe(candidates.length - 1);
    expect(r.placements.some((p) => p.placementReason.includes("cap_exceeded"))).toBe(true);
  });
});

describe("R2 placement — candidate 無改変・透過・redaction", () => {
  it("candidate は embedded 同一参照（riskFlags/permissionLevelHint を欠落させない）", () => {
    const candidates = collect();
    const r = placeLifeOpsCandidatesForDay({ candidates, worldState: ws(), maxPlacements: 10 });
    for (const p of r.placements) {
      const original = candidates.find((c) => c === p.candidate);
      expect(original).toBeDefined(); // 同一参照＝無改変
      expect(p.candidate.riskFlags).toBeDefined();
      expect(p.candidate.permissionLevelHint).toBeDefined();
      expect(p.candidate.suggestedWindow).toBeNull(); // 縦契約を変えない（window は wrapper 側）
    }
  });
  it("placementReason は安定コードのみ（FORBIDDEN 不一致・deterministic）", () => {
    const r1 = placeLifeOpsCandidatesForDay({ candidates: collect(), worldState: ws() });
    const r2 = placeLifeOpsCandidatesForDay({ candidates: collect(), worldState: ws() });
    expect(JSON.stringify(r1.placements.map((p) => ({ w: p.window?.startMinute ?? null, lane: p.planLane, r: p.placementReason }))))
      .toBe(JSON.stringify(r2.placements.map((p) => ({ w: p.window?.startMinute ?? null, lane: p.planLane, r: p.placementReason }))));
    expect(JSON.stringify(r1.placements.flatMap((p) => p.placementReason))).not.toMatch(FORBIDDEN);
  });
});

describe("R2 placement — source contract（責務分離）", () => {
  const SRC = fs
    .readFileSync(path.join(process.cwd(), "lib/plan/reality/lifeops/lifeops-placement.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
  it("縦の個別経路（candidate-engine/event-preparation/deadline-engine/collector）を import しない", () => {
    expect(SRC).not.toContain("candidate-engine");
    expect(SRC).not.toContain("event-preparation");
    expect(SRC).not.toContain("deadline-engine");
    expect(SRC).not.toContain("candidate-collector"); // collector は caller が呼ぶ（placement は受け取るだけ）
  });
  it("LifeOpsCandidate を再定義しない（縦 candidate-types を型 import）", () => {
    expect(SRC).toMatch(/import\s+type\s+\{[^}]*LifeOpsCandidate[^}]*\}\s+from\s+"\.\.\/\.\.\/\.\.\/lifeops\/candidate-types"/);
    expect(SRC).not.toMatch(/interface\s+LifeOpsCandidate\b/);
  });
  it("DB/fetch/UI/通知/外部 API を持たない", () => {
    for (const banned of ["supabase", "fetch(", "server-only", ".insert(", ".update(", ".delete(", ".upsert(", "notification", "places", "hotpepper"]) {
      expect(SRC.toLowerCase()).not.toContain(banned);
    }
  });
});
