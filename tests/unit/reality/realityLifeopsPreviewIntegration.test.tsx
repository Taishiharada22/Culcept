/**
 * Life Ops Preview Integration（fixture operator preview・no real data / no write）unit。
 *   3 VM（Briefing/Moment/Reflection）が operator preview に並ぶ contract: DTO allowlist・重複制御・文言安全・render。
 *
 * 設計: docs/life-ops-preview-integration-contract.md。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "fs";
import * as path from "path";
import { computeLifeOpsPreviewDto, fixtureLifeOpsInputs, type LifeOpsPreviewClientDto } from "@/lib/plan/reality/lifeops/lifeops-preview-compute";
import { RealityPipelinePreviewClient, type RealityPipelinePreviewMeta } from "@/app/(culcept)/plan/dev-reality-pipeline/RealityPipelinePreviewClient";
import type { RealityPipelineEnvelope } from "@/lib/plan/reality/orchestration/reality-pipeline";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";

// 文言禁止（CEO 指定 + 既存断定禁止）と PII 系。「確定」は完了状態の語のみ禁止（辞書 label「確定申告」は除外）。
const BANNED_WORDS = /予定に入れた|通知する|通知します|確定(?!申告)|やるべき|すべき|必ず|しなければ|してください/;
const FORBIDDEN = /seed_?ref|utterance|personality|trait|@[a-z]|\b\d{10,}\b|[0-9a-f]{8}-[0-9a-f]{4}/i;
const NOW_MS = Date.parse("2026-06-10T09:00:00+09:00");

function ws(): WorldState {
  return {
    date: "2026-06-10",
    nowMinute: 620, // 朝窓 open（重複制御の検証に最適）
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

function dto(nowMinute = 620): LifeOpsPreviewClientDto {
  return computeLifeOpsPreviewDto({ world: { ...ws(), nowMinute }, date: "2026-06-10", nowMinute, nowMs: NOW_MS });
}

describe("integration — DTO compute（fixture chain）", () => {
  it("briefing（headline+3 tiers）と moment が 1 DTO に揃う・fixtureNotice 明示", () => {
    const d = dto();
    expect(d.briefing.headline.length).toBeGreaterThan(0);
    expect(d.briefing.tiers.map((t) => t.tier)).toEqual(["protect", "easy", "push"]);
    expect(d.fixtureNotice).toBe(true);
    expect(d.moment).toBeDefined();
  });
  it("fixture 入力は nowMs 相対の決定論（実データ源 0）", () => {
    const a = fixtureLifeOpsInputs(NOW_MS);
    expect(a.deadlineObservations![0].categoryId).toBe("tax_filing");
    expect(JSON.stringify(computeLifeOpsPreviewDto({ world: ws(), date: "2026-06-10", nowMinute: 620, nowMs: NOW_MS }))).toBe(
      JSON.stringify(computeLifeOpsPreviewDto({ world: ws(), date: "2026-06-10", nowMinute: 620, nowMs: NOW_MS })),
    );
  });
});

describe("integration — DTO allowlist（実体を渡さない）", () => {
  it("top-level / tier / highlight の key 集合が契約どおり", () => {
    const d = dto();
    expect(Object.keys(d).sort()).toEqual(["briefing", "fixtureNotice", "integrationMeta", "moment"].sort());
    expect(Object.keys(d.briefing).sort()).toEqual(["alsoAvailableLine", "cautions", "headline", "tiers"].sort());
    for (const t of d.briefing.tiers) {
      expect(Object.keys(t).sort()).toEqual(["highlights", "line", "overflowLine", "tier", "tierLabel"].sort());
      for (const h of t.highlights) expect(Object.keys(h).sort()).toEqual(["label", "phrase", "windowHint"].sort());
    }
    expect(Object.keys(d.moment).sort()).toEqual(["silencedCount", "suppression", "surfaced"].sort());
  });
  it("candidate 実体/dueReason/placeQuery/coarseMinutes/分数/コード列/HH:MM を渡さない", () => {
    const json = JSON.stringify(dto());
    for (const banned of ["candidate", "dueReason", "placeQuery", "coarseMinutes", "suppressedReasons", "startMinute", "title"]) {
      expect(json).not.toContain(`"${banned}"`);
    }
    expect(json).not.toMatch(/\d{1,2}:\d{2}/); // HH:MM を出さない（窓は午前/午後/夕方の粗さ）
    expect(json).not.toMatch(FORBIDDEN);
    expect(json).not.toContain("スーパー"); // placeQuery hint 語
  });
});

describe("integration — 重複制御（§3: 朝言ったことを今もう一度言わない）", () => {
  it("briefing 代表の key が moment exclude に入り、moment は代表と別の候補 or 沈黙", () => {
    const d = dto(620); // 朝窓 open: 代表（確定申告ほか）は exclude 済み
    expect(d.integrationMeta.momentExcludedCount).toBe(d.integrationMeta.briefingRepresentativeCount);
    expect(d.integrationMeta.momentExcludedCount).toBeGreaterThan(0);
    const recTier = d.briefing.tiers.find((t) => t.highlights.length > 0);
    const repLabels = new Set((recTier?.highlights ?? []).map((h) => h.label));
    if (d.moment.surfaced) {
      expect(repLabels.has(d.moment.surfaced.label)).toBe(false); // 朝の代表を再提示しない
    } else {
      expect(d.moment.silencedCount).toBeGreaterThan(0); // 全て既出/窓外なら沈黙（連打しない）
    }
  });
  it("deadline fallback も exclude に従う（朝に出した期限を moment で連打しない）", () => {
    const d = dto(620);
    if (d.moment.surfaced) expect(d.moment.surfaced.label).not.toBe("確定申告");
  });
});

describe("integration — 文言安全（§4）", () => {
  it("DTO 全文: 「予定に入れた/通知する/確定/やるべき」等の禁止語なし", () => {
    for (const nowMinute of [575, 620, 800, 950]) {
      expect(JSON.stringify(dto(nowMinute))).not.toMatch(BANNED_WORDS);
    }
  });
});

describe("integration — render（operator preview に 3 VM が並ぶ）", () => {
  const envelope: RealityPipelineEnvelope = {
    date: "2026-06-10",
    worldReadiness: "ready",
    recommended: { tier: "protect", activeMinutes: 120, restMinutes: 180, strain: "low" },
    reasoning: { fits: { time: "good", energy: "ok", weather: "ok", mobility: "ok" }, confidence: "low", readiness: "ready_to_show" },
    surfacedTrigger: null,
    silencedTriggerCount: 0,
    permission: { verdict: "allowed", risk: "low", reason: "権限の範囲内です" },
    changeSetDraft: { opCount: 4 },
    stopReasons: [],
  };
  const meta: RealityPipelinePreviewMeta = { hardConstraintsCount: 0, availableWindowsCount: 2, usableContextsCount: 0, memoryItemCount: 0 };
  it("section 名・fixture 明示文・headline・moment 行・重複制御 row が render される", () => {
    const html = renderToStaticMarkup(<RealityPipelinePreviewClient envelope={envelope} meta={meta} lifeOpsPreview={dto()} />);
    expect(html).toContain("Life Ops Preview（fixture 入力・観測のみ）");
    expect(html).toContain("実データ源には接続していません（fixture）。予定には書き込みません。通知もしません。");
    expect(html).toContain("守る案");
    expect(html).toContain("Moment（今この瞬間・cap 1）");
    expect(html).toContain("重複制御（朝の代表→今は除外）");
  });
  it("HTML: button/通知導線/禁止語/PII なし・prop なしなら section 不在", () => {
    const html = renderToStaticMarkup(<RealityPipelinePreviewClient envelope={envelope} meta={meta} lifeOpsPreview={dto()} />);
    expect(html).not.toContain("<button");
    expect(html).not.toMatch(BANNED_WORDS);
    expect(html).not.toMatch(FORBIDDEN);
    const without = renderToStaticMarkup(<RealityPipelinePreviewClient envelope={envelope} meta={meta} />);
    expect(without).not.toContain("Life Ops Preview");
  });
});

describe("integration — source contract（§5）", () => {
  const COMPUTE = fs
    .readFileSync(path.join(process.cwd(), "lib/plan/reality/lifeops/lifeops-preview-compute.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
  it("compute: no DB/fetch/server-only/Date.now/notification/R4 import/real reader", () => {
    for (const banned of ["supabase", "fetch(", "server-only", "Date.now", "notification", "trigger-model", "trigger-evaluator", "createSupabase"]) {
      expect(COMPUTE.toLowerCase()).not.toContain(banned.toLowerCase());
    }
  });
  it("client: 追加後も fetch/onClick/useState/button なし（presentational 維持）", () => {
    const raw = fs.readFileSync(path.join(process.cwd(), "app/(culcept)/plan/dev-reality-pipeline/RealityPipelinePreviewClient.tsx"), "utf8");
    expect(raw).not.toContain("fetch(");
    expect(raw).not.toContain("<button");
    expect(raw).not.toContain("onClick");
    expect(raw).not.toContain("useState");
  });
});
