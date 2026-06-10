/**
 * A-4-c16 — Life Ops UI Action Preview / No-write Display（表示のみ・押せない・記録しない）unit + render contract。
 *   GPT 13 lock: ①descriptors 付与 ②固定順 ③done のみ cadenceEligible ④done のみ requiresConfirmation
 *   ⑤disabled/no-write ⑥writer/server-only/supabase import 0 ⑦handle 非搬出 ⑧placeQuery/dueReason/riskFlags 非混入
 *   ⑨lib/lifeops→action-intent 逆 import 0 ⑩対象なし時は既存 preview 不変 ⑪DB write 0 ⑫notification 0 ⑬production 0。
 *
 * 設計: docs/life-ops-action-preview-a4-c16-mini-design.md。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "fs";
import * as path from "path";
import { computeLifeOpsPreviewDto, type LifeOpsPreviewClientDto } from "@/lib/plan/reality/lifeops/lifeops-preview-compute";
import { RealityPipelinePreviewClient, type RealityPipelinePreviewMeta } from "@/app/(culcept)/plan/dev-reality-pipeline/RealityPipelinePreviewClient";
import type { RealityPipelineEnvelope } from "@/lib/plan/reality/orchestration/reality-pipeline";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";
import type { LifeOpsInputs } from "@/lib/lifeops/candidate-collector";

const NOW_MS = Date.parse("2026-06-10T09:00:00+09:00");
const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (d: number) => new Date(NOW_MS + d * DAY_MS).toISOString();
const BANNED_WORDS = /予定に入れた|通知する|通知します|確定(?!申告)|やるべき|すべき|必ず|今すぐ|しなければ|してください/;

function ws(nowMinute = 800): WorldState {
  return {
    date: "2026-06-10",
    nowMinute,
    todaySchedule: [],
    availableWindows: [
      { startMinute: 600, endMinute: 660, meaning: null },
      { startMinute: 780, endMinute: 960, meaning: null },
    ],
    context: null,
    mobility: null,
    permissionLevel: 2,
  } as WorldState;
}
const dto = (inputs?: LifeOpsInputs): LifeOpsPreviewClientDto =>
  computeLifeOpsPreviewDto({ world: ws(), date: "2026-06-10", nowMinute: 800, nowMs: NOW_MS, inputs });

const withActions = () => dto(); // 既定 fixture（候補あり → 代表 tier に rail）
const railHighlights = (d: LifeOpsPreviewClientDto) => d.briefing.tiers.flatMap((t) => t.highlights.filter((h) => (h.actions?.length ?? 0) > 0));

describe("c16 — DTO（①②③④・rail は代表 tier のみ）", () => {
  it("①代表候補に actions が付く（4 件）・rail を持つ tier はちょうど 1 つ", () => {
    const d = withActions();
    const hs = railHighlights(d);
    expect(hs.length).toBeGreaterThan(0);
    for (const h of hs) expect(h.actions!.length).toBe(4);
    const tiersWithRail = d.briefing.tiers.filter((t) => t.highlights.some((h) => h.actions));
    expect(tiersWithRail.length).toBe(1); // Morning 代表（recommended tier）だけ＝縦長化させない
  });
  it("②固定順 [採用, 完了, 後で, 不要]・previewOnly=true 全件", () => {
    for (const h of railHighlights(withActions())) {
      expect(h.actions!.map((a) => a.uiLabel)).toEqual(["採用", "完了", "後で", "不要"]);
      expect(h.actions!.map((a) => a.action)).toEqual(["accept", "done", "later", "dismiss"]);
      for (const a of h.actions!) expect(a.previewOnly).toBe(true);
    }
  });
  it("③done だけ cadenceEligible ④done だけ requiresConfirmation", () => {
    for (const h of railHighlights(withActions())) {
      for (const a of h.actions!) {
        expect(a.cadenceEligible).toBe(a.action === "done");
        expect(a.requiresConfirmation).toBe(a.action === "done");
      }
    }
  });
});

describe("c16 — safety（⑦⑧）", () => {
  it("⑦handle / lifeops: prefix を DTO に出さない（writer 用内部 DTO は UI 非搬出）", () => {
    const json = JSON.stringify(withActions());
    expect(json).not.toContain('"handle"');
    expect(json).not.toContain("lifeops:");
  });
  it("⑧placeQuery/dueReason/riskFlags/店舗名 hint が DTO に混ざらない", () => {
    const json = JSON.stringify(withActions());
    for (const banned of ['"placeQuery"', '"dueReason"', '"riskFlags"', '"candidate"', "美容室", "スーパー", '"sourceKind"', '"categoryId"', '"menu"']) {
      expect(json).not.toContain(banned);
    }
  });
});

describe("c16 — render contract（⑤・押せない・no-write 注記）", () => {
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
  const html = () => renderToStaticMarkup(<RealityPipelinePreviewClient envelope={envelope} meta={meta} lifeOpsPreview={withActions()} />);

  it("chip rail（採用/完了※/後で/不要）と注記が render され、完了だけ ※ + amber 区別", () => {
    const h = html();
    expect(h).toContain("lifeops-action-rail");
    for (const label of ["採用", "後で", "不要"]) expect(h).toContain(label);
    expect(h).toContain("完了※");
    expect(h).toContain("border-amber-300"); // 完了 chip の視覚区別
    expect(h).toContain("※完了は実際に終わった時だけ（次回の提案周期に影響）。自動では完了になりません。今は表示のみで、押せず・記録もしません。");
  });
  it("⑤押せない: <button>/onClick/href/form なし・aria-disabled chip・断定/督促語なし", () => {
    const h = html();
    expect(h).not.toContain("<button");
    expect(h).not.toContain("onClick");
    expect(h).not.toContain("<form");
    expect(h).not.toContain("<a ");
    expect(h).toContain('aria-disabled="true"');
    expect(h).not.toMatch(BANNED_WORDS);
  });
  it("⑩対象なし（候補 0）: actions/rail/注記なし・既存 preview は壊れない", () => {
    const empty = dto({});
    expect(JSON.stringify(empty)).not.toContain('"actions"');
    const h = renderToStaticMarkup(<RealityPipelinePreviewClient envelope={envelope} meta={meta} lifeOpsPreview={empty} />);
    expect(h).toContain("Life Ops Preview（fixture 入力・観測のみ）"); // section 自体は健在
    expect(h).not.toContain("lifeops-action-rail");
    expect(h).not.toContain("※完了は実際に終わった時だけ");
  });
});

describe("c16 — 静的安全（⑥⑨⑪⑫⑬）", () => {
  const strip = (rel: string) =>
    fs.readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  it("⑥compute/client: writer・server-only・supabase・createClient import 0", () => {
    for (const rel of ["lib/plan/reality/lifeops/lifeops-preview-compute.ts", "app/(culcept)/plan/dev-reality-pipeline/RealityPipelinePreviewClient.tsx"]) {
      const code = strip(rel).toLowerCase();
      for (const banned of ["lifeops-feedback-writer", "server-only", "supabase", "createclient", "writefeedback"]) {
        expect(code).not.toContain(banned);
      }
    }
  });
  it("⑨lib/lifeops（縦）から action-intent への逆 import 0（boundary 維持）", () => {
    const root = path.join(process.cwd(), "lib/lifeops");
    for (const rel of fs.readdirSync(root, { recursive: true }) as string[]) {
      if (!rel.toString().endsWith(".ts")) continue;
      expect(fs.readFileSync(path.join(root, rel.toString()), "utf8")).not.toContain("lifeops-action-intent");
    }
  });
  it("⑪⑫⑬compute/client: insert/update/delete/upsert/rpc/fetch/notification/process.env 0（DB write・通知・production 経路なし）", () => {
    for (const rel of ["lib/plan/reality/lifeops/lifeops-preview-compute.ts", "app/(culcept)/plan/dev-reality-pipeline/RealityPipelinePreviewClient.tsx"]) {
      const code = strip(rel).toLowerCase();
      for (const banned of [".insert(", ".update(", ".delete(", ".upsert(", ".rpc(", "fetch(", "notification", "process.env", "usestate"]) {
        expect(code).not.toContain(banned);
      }
    }
  });
});
