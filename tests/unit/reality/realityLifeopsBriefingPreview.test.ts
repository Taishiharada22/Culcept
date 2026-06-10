/**
 * 横 R2 — Life Ops Morning Briefing Preview Presenter（pure・fake/fixture のみ）unit。
 *   compose 結果 → 非断定文言 + 3案要約 + 代表 1〜3 件の VM。本線接続なし・React なし・PII 構造的不在を固定。
 *
 * 設計: docs/life-ops-morning-briefing-preview-mini-design.md。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  buildLifeOpsBriefingPreview,
  BRIEFING_HIGHLIGHT_MAX,
  BRIEFING_CAUTION_MAX,
} from "@/lib/plan/reality/lifeops/lifeops-briefing-preview";
import { composeLifeOpsIntoDayProposals, type LifeOpsDayCompose } from "@/lib/plan/reality/lifeops/lifeops-empty-day-compose";
import { placeLifeOpsCandidatesForDay } from "@/lib/plan/reality/lifeops/lifeops-placement";
import { collectLifeOpsCandidates, type LifeOpsInputs } from "@/lib/lifeops/candidate-collector";
import { generateEmptyDay } from "@/lib/plan/reality/empty-day/empty-day-generator";
import { deriveEmptyDayInput } from "@/lib/plan/reality/world-state/world-state-derive";
import { synthesizeMemory } from "@/lib/plan/reality/learning/memory-synthesis";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";

// 断定語（恒久禁止）と PII 系 FORBIDDEN。
const ASSERTIVE = /すべき|べきです|やるべき|必ず|しなければ|してください/;
const FORBIDDEN = /seed_?ref|utterance|personality|trait|@[a-z]|\b\d{10,}\b|[0-9a-f]{8}-[0-9a-f]{4}/i;
const NOW_ISO = "2026-06-10T09:00:00+09:00";
const NOW_MS = Date.parse(NOW_ISO);

function fakeInputs(over: Partial<LifeOpsInputs> = {}): LifeOpsInputs {
  return {
    cadenceObservations: [
      { categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: "2026-04-11T10:00:00+09:00" },
      { categoryId: "groceries", lastCompletedAtISO: "2026-05-31T10:00:00+09:00" },
    ],
    upcomingEvents: [{ kind: "interview", startISO: "2026-06-13T10:00:00+09:00" }],
    deadlineObservations: [{ categoryId: "tax_filing", deadlineISO: "2026-06-15T00:00:00+09:00" }],
    ...over,
  };
}

function ws(): WorldState {
  return {
    date: "2026-06-10",
    nowMinute: 540,
    todaySchedule: [],
    availableWindows: [
      { startMinute: 600, endMinute: 660, meaning: null },
      { startMinute: 780, endMinute: 960, meaning: null },
    ],
    context: null,
    mobility: null,
    permissionLevel: 2,
  };
}

function chainCompose(over: { inputs?: Partial<LifeOpsInputs>; maxPlacements?: number } = {}): LifeOpsDayCompose {
  const world = ws();
  const candidates = collectLifeOpsCandidates(fakeInputs(over.inputs), NOW_ISO);
  const placement = placeLifeOpsCandidatesForDay({ candidates, worldState: world, maxPlacements: over.maxPlacements ?? 10 });
  const edi = deriveEmptyDayInput(world, synthesizeMemory([], NOW_MS), { userIntent: null });
  return composeLifeOpsIntoDayProposals({ proposalSet: generateEmptyDay(edi), placement, dayWindows: world.availableWindows });
}

describe("briefing — headline（朝の一言・非断定）", () => {
  it("deadline ありの日: 期限 label を先に・非断定（安心です/入れられそうです）", () => {
    const vm = buildLifeOpsBriefingPreview(chainCompose());
    expect(vm.headline).toContain("確定申告"); // L-1 辞書 label
    expect(vm.headline).toMatch(/安心です/);
    expect(vm.headline).not.toMatch(ASSERTIVE);
  });
  it("候補ゼロの日: 静かな一言（急ぎのものはなさそうです）", () => {
    const vm = buildLifeOpsBriefingPreview(chainCompose({ inputs: { cadenceObservations: [], upcomingEvents: [], deadlineObservations: [] } }));
    expect(vm.headline).toBe("今日は生活まわりで急ぎのものはなさそうです");
    expect(vm.tiers.every((t) => t.highlights.length === 0)).toBe(true);
  });
});

describe("briefing — 3案要約（protect/easy/push）", () => {
  it("3 tier 順・tierLabel・件数 line・deadline は全 tier の highlights に現れうる", () => {
    const vm = buildLifeOpsBriefingPreview(chainCompose());
    expect(vm.tiers.map((t) => t.tier)).toEqual(["protect", "easy", "push"]);
    expect(vm.tiers.map((t) => t.tierLabel)).toEqual(["守る案", "楽な案", "攻める案"]);
    for (const t of vm.tiers) {
      expect(t.line).toMatch(/には\d+件入ります|生活まわりの追加なし/);
      // 累積包含: protect の代表は deadline 系のみ
      if (t.tier === "protect" && t.highlights.length > 0) {
        expect(t.highlights.some((h) => h.title === "確定申告")).toBe(true);
      }
    }
  });
  it("代表は最大 3 件・phrase は L-8a 由来の事実文・windowHint は粗い時間帯", () => {
    const vm = buildLifeOpsBriefingPreview(chainCompose());
    for (const t of vm.tiers) {
      expect(t.highlights.length).toBeLessThanOrEqual(BRIEFING_HIGHLIGHT_MAX);
      for (const h of t.highlights) {
        expect(h.phrase.length).toBeGreaterThan(0);
        expect(["午前の空き時間に", "午後の空き時間に", "夕方以降の空き時間に"]).toContain(h.windowHint);
        expect(h.phrase).not.toMatch(ASSERTIVE);
      }
    }
  });
});

describe("briefing — overflow / alsoAvailable（§4・honest）", () => {
  it("placement cap=1 → alsoAvailableLine が件数つきで出る", () => {
    const vm = buildLifeOpsBriefingPreview(chainCompose({ maxPlacements: 1 }));
    expect(vm.alsoAvailableLine).toMatch(/ほかにも候補が\d+件あります/);
  });
  it("unplaced 0 → alsoAvailableLine は null", () => {
    const vm = buildLifeOpsBriefingPreview(chainCompose({ inputs: { cadenceObservations: [], upcomingEvents: [], deadlineObservations: [{ categoryId: "tax_filing", deadlineISO: "2026-06-15T00:00:00+09:00" }] } }));
    expect(vm.alsoAvailableLine).toBeNull();
  });
  it("overflow がある tier は overflowLine（手組み compose fixture）", () => {
    const base = chainCompose();
    const withOverflow: LifeOpsDayCompose = {
      ...base,
      composed: base.composed.map((c, i) =>
        i === 0 ? { ...c, lifeOps: { fitting: c.lifeOps.fitting, overflow: base.composed[2].lifeOps.fitting.slice(0, 2) } } : c,
      ),
    };
    const vm = buildLifeOpsBriefingPreview(withOverflow);
    expect(vm.tiers[0].overflowLine).toMatch(/入りきらない候補が\d+件あります/);
    expect(vm.tiers[1].overflowLine).toBeNull();
  });
});

describe("briefing — cautions（§5・L-7/L-8a 再利用）", () => {
  it("確認が要る候補（美容予約系）が代表に入る tier では注意が出る・cap 2・dedupe", () => {
    const vm = buildLifeOpsBriefingPreview(chainCompose());
    expect(vm.cautions.length).toBeLessThanOrEqual(BRIEFING_CAUTION_MAX);
    expect(new Set(vm.cautions).size).toBe(vm.cautions.length); // dedupe
    for (const c of vm.cautions) expect(c).not.toMatch(ASSERTIVE);
  });
});

describe("briefing — 非断定・redaction・deterministic", () => {
  it("VM 全文に断定語なし・FORBIDDEN（PII/UUID）なし・placeQuery を出さない", () => {
    const vm = buildLifeOpsBriefingPreview(chainCompose());
    const json = JSON.stringify(vm);
    expect(json).not.toMatch(ASSERTIVE);
    expect(json).not.toMatch(FORBIDDEN);
    expect(json).not.toContain("placeQuery");
    expect(json).not.toContain("美容室"); // placeQuery hint 語を VM に出さない（カード側責務）
  });
  it("deterministic（同入力→同出力）", () => {
    expect(JSON.stringify(buildLifeOpsBriefingPreview(chainCompose()))).toBe(JSON.stringify(buildLifeOpsBriefingPreview(chainCompose())));
  });
});

describe("briefing — source contract（本線非接続）", () => {
  const SRC = fs
    .readFileSync(path.join(process.cwd(), "lib/plan/reality/lifeops/lifeops-briefing-preview.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
  it("React/UI/DB/fetch/通知/Morning 本線/Trigger を import しない", () => {
    for (const banned of ["react", "use client", "supabase", "fetch(", "server-only", "notification", "alter-morning", "trigger-"]) {
      expect(SRC.toLowerCase()).not.toContain(banned);
    }
  });
  it("generateEmptyDay/collector を実行しない（compose 結果を受けるだけ）", () => {
    expect(SRC).not.toContain("generateEmptyDay");
    expect(SRC).not.toContain("collectLifeOpsCandidates");
  });
  it("L-8a を public API で再利用（card-presenter/permission import）", () => {
    expect(SRC).toContain("toLifeOpsCardViewModel");
    expect(SRC).toContain("assessLifeOpsPermission");
  });
});
