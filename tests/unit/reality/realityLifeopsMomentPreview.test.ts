/**
 * 横 R2/R4 前段 — Life Ops Moment Trigger Preview（pure・fake/fixture のみ）unit。
 *   選択 tier composed + nowMinute → 「この時点なら何を出すのが自然か」preview VM。
 *   通知 0・R4 本体非 import・cap 1・focus/recovery 全抑制・excludeKeys cooldown を固定。
 *
 * 設計: docs/life-ops-moment-trigger-preview-mini-design.md。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  buildLifeOpsMomentPreview,
  lifeOpsMomentKey,
  MOMENT_LEAD_MINUTES,
  MOMENT_CAUTION_MAX,
} from "@/lib/plan/reality/lifeops/lifeops-moment-preview";
import { composeLifeOpsIntoDayProposals, type ComposedDayProposal, type LifeOpsDayCompose } from "@/lib/plan/reality/lifeops/lifeops-empty-day-compose";
import { placeLifeOpsCandidatesForDay, type LifeOpsPlacementResult, type PlacedLifeOpsCandidate } from "@/lib/plan/reality/lifeops/lifeops-placement";
import { collectLifeOpsCandidates, type LifeOpsInputs } from "@/lib/lifeops/candidate-collector";
import { LIFE_OPS_CATEGORY_MODEL } from "@/lib/lifeops/category-model";
import { generateEmptyDay, type EmptyDayProposalSet, type EmptyDayTier } from "@/lib/plan/reality/empty-day/empty-day-generator";
import { deriveEmptyDayInput } from "@/lib/plan/reality/world-state/world-state-derive";
import { synthesizeMemory } from "@/lib/plan/reality/learning/memory-synthesis";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";

const ASSERTIVE = /すべき|べきです|やるべき|必ず|しなければ|してください/;
const FORBIDDEN = /seed_?ref|utterance|personality|trait|@[a-z]|\b\d{10,}\b|[0-9a-f]{8}-[0-9a-f]{4}/i;
const NOW_ISO = "2026-06-10T09:00:00+09:00";
const NOW_MS = Date.parse(NOW_ISO);

function fakeInputs(): LifeOpsInputs {
  return {
    cadenceObservations: [
      { categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: "2026-04-11T10:00:00+09:00" },
      { categoryId: "groceries", lastCompletedAtISO: "2026-05-31T10:00:00+09:00" },
    ],
    upcomingEvents: [{ kind: "interview", startISO: "2026-06-13T10:00:00+09:00" }],
    deadlineObservations: [{ categoryId: "tax_filing", deadlineISO: "2026-06-15T00:00:00+09:00" }],
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

/** 実 chain → 選択 tier（既定 easy）の composed。 */
function chainTier(tier: EmptyDayTier = "easy"): ComposedDayProposal {
  const world = ws();
  const candidates = collectLifeOpsCandidates(fakeInputs(), NOW_ISO);
  const placement = placeLifeOpsCandidatesForDay({ candidates, worldState: world, maxPlacements: 10 });
  const edi = deriveEmptyDayInput(world, synthesizeMemory([], NOW_MS), { userIntent: null });
  const compose: LifeOpsDayCompose = composeLifeOpsIntoDayProposals({ proposalSet: generateEmptyDay(edi), placement, dayWindows: world.availableWindows });
  return compose.composed.find((c) => c.tier === tier)!;
}

describe("moment — timing（§1）", () => {
  it("朝窓 open 中 → deadline（確定申告）が window_open で最優先", () => {
    // tax_filing は朝窓 600-660 に placement 済み。620 は窓内かつ残 40 ≥ 30。
    const vm = buildLifeOpsMomentPreview({ composedTier: chainTier(), nowMinute: 620 });
    expect(vm.surfaced).not.toBeNull();
    expect(vm.surfaced!.kind).toBe("window_open");
    expect(vm.surfaced!.title).toBe("確定申告"); // fitting 先頭（urgency 順）
    expect(vm.surfaced!.phrase).toContain("今なら");
  });
  it("午後窓 open 中 → 朝窓の候補は outside_window・午後配置の候補が出る（cap 1）", () => {
    // 800 時点: 朝窓(600-660)組は過ぎている。過ぎた deadline の別窓 re-offer は完了シグナル無しでは
    // nagging リスク＝feedback/学習 slice の領分（本 slice は placement 窓に bound）。
    const vm = buildLifeOpsMomentPreview({ composedTier: chainTier(), nowMinute: 800 });
    expect(vm.surfaced).not.toBeNull();
    expect(vm.surfaced!.kind).toBe("window_open");
    expect(vm.suppressedReasons).toContain("outside_window"); // 朝窓組
    expect(vm.silencedCount).toBeGreaterThan(0); // cap 1 + 窓外
  });
  it("窓開始前 30 分以内 → window_approaching", () => {
    // 朝窓 600 開始・lead 30 → 575 は approaching 帯。
    const vm = buildLifeOpsMomentPreview({ composedTier: chainTier(), nowMinute: 575 });
    expect(vm.surfaced).not.toBeNull();
    expect(vm.surfaced!.kind).toBe("window_approaching");
    expect(vm.surfaced!.phrase).toContain("この後の空き時間に");
    expect(MOMENT_LEAD_MINUTES).toBe(30);
  });
  it("全窓の外（早朝）→ 沈黙（outside_window）", () => {
    const vm = buildLifeOpsMomentPreview({ composedTier: chainTier(), nowMinute: 400 });
    expect(vm.surfaced).toBeNull();
    expect(vm.suppressedReasons.every((r) => r === "outside_window")).toBe(true);
  });
  it("窓の残りが coarseMinutes 未満 → window_too_short で鳴らさない", () => {
    // 午後窓 780-960。外出 90 分候補は 950 時点で残 10 分 → too_short。30 分在宅も 950 で too_short。
    const vm = buildLifeOpsMomentPreview({ composedTier: chainTier(), nowMinute: 950 });
    expect(vm.surfaced).toBeNull();
    expect(vm.suppressedReasons).toContain("window_too_short");
  });
});

describe("moment — focus/recovery 全抑制（§2）", () => {
  function tierWithBlock(kind: "focus_work" | "recovery"): ComposedDayProposal {
    const base = chainTier();
    const proposal = { ...base.proposal, blocks: [{ startMinute: 780, endMinute: 900, kind, band: "neutral", memoryLeaning: null } as never] };
    return { ...base, proposal };
  }
  it("focus_work block 中 → 全抑制（suppression=focus_block・surfaced null）", () => {
    const vm = buildLifeOpsMomentPreview({ composedTier: tierWithBlock("focus_work"), nowMinute: 800 });
    expect(vm.surfaced).toBeNull();
    expect(vm.suppression).toBe("focus_block");
    expect(vm.silencedCount).toBe(tierWithBlock("focus_work").lifeOps.fitting.length);
  });
  it("recovery block 中 → 全抑制（suppression=recovery_block）", () => {
    const vm = buildLifeOpsMomentPreview({ composedTier: tierWithBlock("recovery"), nowMinute: 800 });
    expect(vm.surfaced).toBeNull();
    expect(vm.suppression).toBe("recovery_block");
  });
});

describe("moment — cooldown / 重複制御（§6・§8）", () => {
  it("excludeKeys（briefing 既出）→ already_surfaced で沈黙し、次候補が出る", () => {
    const tier = chainTier();
    const first = buildLifeOpsMomentPreview({ composedTier: tier, nowMinute: 800 });
    expect(first.surfaced).not.toBeNull();
    // **surfaced された候補**の key を除外（briefing/前回 moment で既出の想定）。title は L-1 辞書 label。
    const surfacedPlaced = tier.lifeOps.fitting.find((p) => LIFE_OPS_CATEGORY_MODEL[p.candidate.category].label === first.surfaced!.title)!;
    const vm = buildLifeOpsMomentPreview({ composedTier: tier, nowMinute: 800, excludeKeys: [lifeOpsMomentKey(surfacedPlaced.candidate)] });
    expect(vm.suppressedReasons).toContain("already_surfaced");
    expect(vm.surfaced).not.toBeNull();
    expect(vm.surfaced!.title).not.toBe(first.surfaced!.title); // 次候補へ
  });
  it("全 key exclude → 完全沈黙（連打しない）", () => {
    const tier = chainTier();
    const keys = [...tier.lifeOps.fitting, ...tier.lifeOps.overflow].map((p) => lifeOpsMomentKey(p.candidate));
    const vm = buildLifeOpsMomentPreview({ composedTier: tier, nowMinute: 800, excludeKeys: keys });
    expect(vm.surfaced).toBeNull();
  });
  it("key は縦 collector の dedup 定義（category:menu）", () => {
    const tier = chainTier();
    const p = tier.lifeOps.fitting[0];
    expect(lifeOpsMomentKey(p.candidate)).toBe(`${p.candidate.category}:${p.candidate.menu ?? ""}`);
  });
});

describe("moment — deadline overflow fallback（§9）", () => {
  function tierWithDeadlineOverflow(): ComposedDayProposal {
    const candidates = collectLifeOpsCandidates({ deadlineObservations: [{ categoryId: "tax_filing", deadlineISO: "2026-06-15T00:00:00+09:00" }] }, NOW_ISO);
    const dl: PlacedLifeOpsCandidate = {
      candidate: candidates[0],
      window: { startMinute: 780, endMinute: 960, meaning: null },
      placementReason: ["deadline_near"],
      planLane: "protect",
      coarseMinutes: 30,
    };
    const base = chainTier();
    return { ...base, lifeOps: { fitting: [], overflow: [dl] } };
  }
  it("fitting が空でも deadline overflow は窓内で deadline_pressure として鳴る", () => {
    const vm = buildLifeOpsMomentPreview({ composedTier: tierWithDeadlineOverflow(), nowMinute: 800 });
    expect(vm.surfaced).not.toBeNull();
    expect(vm.surfaced!.kind).toBe("deadline_pressure");
    expect(vm.surfaced!.phrase).toContain("期日が近い");
  });
  it("★A-4-c5 S8 lock: window=null の deadline overflow は crash せず no_window で沈黙", () => {
    // A-4-c4 以降 overflow は pool 未着席（window=null）を含みうる。窓がない＝moment の根拠がない。
    const candidates = collectLifeOpsCandidates({ deadlineObservations: [{ categoryId: "license_renewal", deadlineISO: "2026-06-30T00:00:00+09:00" }] }, NOW_ISO);
    const nullWindowOverflow: PlacedLifeOpsCandidate = {
      candidate: candidates[0],
      window: null,
      placementReason: ["deadline_near", "no_window_fits"],
      planLane: "protect",
      coarseMinutes: 30,
    };
    const base = chainTier();
    const tier: ComposedDayProposal = { ...base, lifeOps: { fitting: [], overflow: [nullWindowOverflow] } };
    const vm = buildLifeOpsMomentPreview({ composedTier: tier, nowMinute: 800 }); // crash しないこと
    expect(vm.surfaced).toBeNull();
    expect(vm.suppressedReasons).toContain("no_window");
  });
  it("deadline 以外の overflow は鳴らさない（その日の形を尊重）", () => {
    const base = chainTier("protect");
    const nonDeadlineOverflow = chainTier("push").lifeOps.fitting.filter((p) => p.candidate.dueReason.kind !== "deadline");
    const tier: ComposedDayProposal = { ...base, lifeOps: { fitting: [], overflow: nonDeadlineOverflow } };
    const vm = buildLifeOpsMomentPreview({ composedTier: tier, nowMinute: 800 });
    expect(vm.surfaced).toBeNull();
  });
});

describe("moment — cautions / 非断定 / redaction（§4・§7・§10）", () => {
  it("cautions は cap 2・dedupe・非断定", () => {
    const vm = buildLifeOpsMomentPreview({ composedTier: chainTier("push"), nowMinute: 800 });
    if (vm.surfaced) {
      expect(vm.surfaced.cautions.length).toBeLessThanOrEqual(MOMENT_CAUTION_MAX);
      expect(new Set(vm.surfaced.cautions).size).toBe(vm.surfaced.cautions.length);
    }
  });
  it("VM 全文: 断定語なし・FORBIDDEN なし・HH:MM なし・placeQuery 非表示", () => {
    for (const nowMinute of [575, 800, 950]) {
      const json = JSON.stringify(buildLifeOpsMomentPreview({ composedTier: chainTier(), nowMinute }));
      expect(json).not.toMatch(ASSERTIVE);
      expect(json).not.toMatch(FORBIDDEN);
      expect(json).not.toMatch(/\d{1,2}:\d{2}/); // moment は「今」の文脈＝時刻表記を出さない
      expect(json).not.toContain("placeQuery");
      expect(json).not.toContain("スーパー"); // placeQuery hint 語
    }
  });
  it("deterministic（同入力→同出力）", () => {
    const a = buildLifeOpsMomentPreview({ composedTier: chainTier(), nowMinute: 800 });
    const b = buildLifeOpsMomentPreview({ composedTier: chainTier(), nowMinute: 800 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("moment — source contract（§10）", () => {
  const SRC = fs
    .readFileSync(path.join(process.cwd(), "lib/plan/reality/lifeops/lifeops-moment-preview.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
  it("no notification / no UI / no DB / no fetch / no Date.now / no R4 import", () => {
    for (const banned of ["notification", "react", "supabase", "fetch(", "server-only", "Date.now", "trigger-model", "trigger-evaluator", "trigger-gating", "trigger-content"]) {
      expect(SRC.toLowerCase()).not.toContain(banned.toLowerCase());
    }
  });
  it("collector/個別経路を import しない・L-8a は public API 再利用", () => {
    expect(SRC).not.toContain("candidate-collector");
    expect(SRC).not.toContain("candidate-engine");
    expect(SRC).toContain("toLifeOpsCardViewModel");
    expect(SRC).toContain("assessLifeOpsPermission");
  });
});
