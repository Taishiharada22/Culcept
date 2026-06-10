/**
 * A-4-c25 — Life Ops Production Source Safety / Fixture Kill-Switch（pure・fake のみ）unit。
 *   GPT 12 lock: ①production で fixture candidates=0 ②fixture deadline/cadence/eventPrep 不流入 ③real 0 件→card null
 *   ④staging は dogfood fixture 維持 ⑤dev/operator preview は fixture 維持 ⑥page/actions が同一 policy（単一 helper）
 *   ⑦偽造 candidateKey でも fixture 候補は再構築されない ⑧production writer gate false ⑨LIFEOPS_MAINLINE=true でも deny 勝ち
 *   ⑩raw/PII/debug source 名 非表示 ⑪既存 staging 挙動不変 ⑫suite/tsc（suite 側）。
 *
 * 設計: docs/life-ops-production-source-safety-a4-c25-mini-design.md。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { resolveLifeOpsSourceMode, baseLifeOpsInputsForMode } from "@/lib/plan/reality/lifeops/lifeops-source-policy";
import { computeLifeOpsPreviewModel } from "@/lib/plan/reality/lifeops/lifeops-preview-compute";
import { buildLifeOpsMainlineCardDto, routeLifeOpsMainlineActionRequest } from "@/lib/plan/reality/lifeops/lifeops-mainline-card";
import { isLifeOpsMainlineAllowed } from "@/lib/plan/reality/lifeops/lifeops-mainline-gate";
import { isLifeOpsFeedbackWriteAllowed } from "@/lib/plan/reality/lifeops/lifeops-feedback-write";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";
import type { CadenceObservation } from "@/lib/lifeops/candidate-types";

const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
const PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const NOW_MS = Date.parse("2026-06-10T09:00:00+09:00");
const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (d: number) => new Date(NOW_MS + d * DAY_MS).toISOString();
const FORBIDDEN = /seed_?ref|utterance|personality|trait|user_id|source_ref|@[a-z]|\b\d{10,}\b|[0-9a-f]{8}-[0-9a-f]{4}/i;
const FIXTURE_LABELS = ["確定申告", "免許の更新", "パスポートの更新", "美容院", "食料品"];

function ws(nowMinute = 800): WorldState {
  return {
    date: "2026-06-10", nowMinute, todaySchedule: [],
    availableWindows: [
      { startMinute: 600, endMinute: 660, meaning: null },
      { startMinute: 780, endMinute: 960, meaning: null },
    ],
    context: null, mobility: null, permissionLevel: 2,
  } as WorldState;
}
/** mainline model helper と同じ式（policy→base inputs→compute）を pure に再現。 */
const modelFor = (supabaseUrl: string | undefined, realCadence?: readonly CadenceObservation[]) =>
  computeLifeOpsPreviewModel({
    world: ws(), date: "2026-06-10", nowMinute: 800, nowMs: NOW_MS,
    inputs: baseLifeOpsInputsForMode(resolveLifeOpsSourceMode({ supabaseUrl })),
    realCadence,
  });

describe("c25 — source mode（fail-safe・flag では開けない）", () => {
  it("staging → fixture_allowed / production → real_only / 不明 host・未設定 → real_only（fail-safe）", () => {
    expect(resolveLifeOpsSourceMode({ supabaseUrl: STAGING_URL })).toBe("fixture_allowed");
    expect(resolveLifeOpsSourceMode({ supabaseUrl: PROD_URL })).toBe("real_only");
    expect(resolveLifeOpsSourceMode({ supabaseUrl: "https://unknown-host.supabase.co" })).toBe("real_only");
    expect(resolveLifeOpsSourceMode({ supabaseUrl: undefined })).toBe("real_only");
    expect(baseLifeOpsInputsForMode("fixture_allowed")).toBeUndefined(); // compute 既定 fixture
    expect(baseLifeOpsInputsForMode("real_only")).toEqual({}); // base 候補 0
  });
});

describe("c25 — production kill-switch（①②③⑦⑩）", () => {
  it("①②production: fixture candidates=0（deadline/cadence/eventPrep 全て不流入・代表 0）", () => {
    const m = modelFor(PROD_URL);
    expect(m.repCandidates.length).toBe(0);
    const json = JSON.stringify(m.dto);
    for (const label of FIXTURE_LABELS) expect(json).not.toContain(label);
  });
  it("③production: real source 0 件 → mainline card は null（card/rail 非表示）", () => {
    expect(buildLifeOpsMainlineCardDto(modelFor(PROD_URL))).toBeNull();
  });
  it("real channel は pipeline に乗るが、代表（recommended tier）外なら card は null（保守側・実測 lock）", () => {
    // 単独の done 由来 cycle 候補（美容院 -60d）は push tier にのみ fitting され、代表 tier（protect）は空
    //   → rail なし → card null。production では「中途半端な real 1 件」より無表示が安全（代表選定 policy は案 A の論点として残置）。
    const m = modelFor(PROD_URL, [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-60) }]);
    expect(JSON.stringify(m.dto)).toContain("美容院"); // pipeline には正当に流入（攻め tier）
    expect(m.repCandidates.length).toBe(0); // 代表は空 → rail なし
    expect(buildLifeOpsMainlineCardDto(m)).toBeNull(); // card も null（fixture label は当然不在）
  });
  it("⑦偽造 candidateKey（fixture の tax_filing 等）は production では再構築されず unknown_candidate", () => {
    const empty = modelFor(PROD_URL);
    expect(routeLifeOpsMainlineActionRequest(empty.repCandidates, "tax_filing:", "later", null)).toEqual({ kind: "reject", reason: "unknown_candidate" });
    // real 由来候補が pipeline にあっても代表外なら reps は空＝どの key も write に到達しない（fixture key は永遠に不可）
    const withReal = modelFor(PROD_URL, [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-60) }]);
    expect(routeLifeOpsMainlineActionRequest(withReal.repCandidates, "tax_filing:", "later", null)).toEqual({ kind: "reject", reason: "unknown_candidate" });
    expect(routeLifeOpsMainlineActionRequest(withReal.repCandidates, "beauty_salon:cut", "later", null)).toEqual({ kind: "reject", reason: "unknown_candidate" });
  });
  it("⑩real_only の card DTO に raw/PII/debug source 名（fixture/feedback_done 等）が出ない", () => {
    const card = buildLifeOpsMainlineCardDto(modelFor(PROD_URL, [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-60) }]));
    const json = JSON.stringify(card);
    expect(json).not.toMatch(FORBIDDEN);
    for (const banned of ["fixture", "feedback_done", "real_only", "suppressedDeadline", "lifeops:"]) expect(json).not.toContain(banned);
  });
});

describe("c25 — staging/preview は不変（④⑤⑪）", () => {
  it("④⑪staging: fixture_allowed → dogfood fixture が従来どおり（builder 出力が既定 compute と完全一致）", () => {
    const stagingCard = buildLifeOpsMainlineCardDto(modelFor(STAGING_URL));
    const defaultCard = buildLifeOpsMainlineCardDto(
      computeLifeOpsPreviewModel({ world: ws(), date: "2026-06-10", nowMinute: 800, nowMs: NOW_MS }),
    );
    expect(stagingCard).not.toBeNull();
    expect(JSON.stringify(stagingCard)).toBe(JSON.stringify(defaultCard)); // 挙動不変
    expect(JSON.stringify(stagingCard)).toContain("確定申告");
  });
  it("⑤dev/operator preview: source-policy 非依存のまま（preview page/actions は policy を import しない=fixture 維持）", () => {
    for (const rel of ["app/(culcept)/plan/dev-reality-pipeline/page.tsx", "app/(culcept)/plan/dev-reality-pipeline/actions.ts"]) {
      expect(fs.readFileSync(path.join(process.cwd(), rel), "utf8")).not.toContain("lifeops-source-policy");
    }
  });
});

describe("c25 — gate 整理（⑥⑧⑨・多層防御）", () => {
  it("⑥page/actions は単一 helper 経由のみ（直接 computeLifeOpsPreviewModel を呼ばない）・policy は helper 内で適用", () => {
    const model = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/lifeops/lifeops-mainline-model.ts"), "utf8");
    expect(model).toContain("resolveLifeOpsSourceMode");
    expect(model).toContain("baseLifeOpsInputsForMode");
    for (const rel of ["app/(culcept)/plan/page.tsx", "app/(culcept)/plan/_actions/lifeops-feedback-mainline.ts"]) {
      const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(src).toContain("computeLifeOpsMainlineModel");
      expect(src).not.toContain("computeLifeOpsPreviewModel"); // helper 迂回の禁止
      expect(src).not.toContain("fixtureLifeOpsInputs");
    }
  });
  it("⑧production writer gate は flag ON でも false ⑨LIFEOPS_MAINLINE=true でも production deny が勝つ", () => {
    expect(isLifeOpsFeedbackWriteAllowed({ master: true, write: true, supabaseUrl: PROD_URL })).toBe(false);
    expect(isLifeOpsMainlineAllowed({ mainline: true, planRouteLive: true, supabaseUrl: PROD_URL })).toBe(false);
  });
  it("policy は pure（env flag/process.env/DB なし＝設定では開かない kill-switch）", () => {
    const code = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/lifeops/lifeops-source-policy.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n").toLowerCase();
    for (const banned of ["process.env", "plan_flags", "createclient", "@supabase", "fetch(", ".insert("]) {
      expect(code).not.toContain(banned);
    }
  });
});
