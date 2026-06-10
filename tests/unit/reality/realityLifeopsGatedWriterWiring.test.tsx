/**
 * A-4-c17 — Life Ops Gated Writer Wiring（non-cadence actions only・fake のみ・実 write 0）unit + render contract。
 *   GPT 14 lock: ①accept/later/dismiss のみ writer 可 ②done 不可 ③done chip は disabled のまま
 *   ④client DTO に handle なし ⑤client DTO に writer input なし ⑥server 側 action 再検証 ⑦不正 action 拒否
 *   ⑧不正 candidateKey 拒否 ⑨writer import は server 側だけ ⑩client に server-only/supabase なし
 *   ⑪production では writer gate false ⑫write 成功でも cadence は動かない ⑬staging smoke 未実施（N/A・c12/c13 で実証済）
 *   ⑭full suite green / tsc baseline（suite 側で担保）。
 *
 * 設計: docs/life-ops-gated-writer-wiring-a4-c17-mini-design.md。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "fs";
import * as path from "path";
import { resolveLifeOpsActionRequest, LIFEOPS_WRITABLE_ACTIONS } from "@/lib/plan/reality/lifeops/lifeops-action-request";
import { computeLifeOpsPreviewModel, computeLifeOpsPreviewDto } from "@/lib/plan/reality/lifeops/lifeops-preview-compute";
import { actionIntentToWriterInput } from "@/lib/plan/reality/lifeops/lifeops-action-intent";
import { buildLifeOpsFeedbackWriteRow, isLifeOpsFeedbackWriteAllowed } from "@/lib/plan/reality/lifeops/lifeops-feedback-write";
import { m1RowsToLifeOpsFeedback, feedbackToCadence } from "@/lib/plan/reality/lifeops/lifeops-feedback-source";
import { lifeOpsMomentKey } from "@/lib/plan/reality/lifeops/lifeops-moment-preview";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { RealityPipelinePreviewClient, type RealityPipelinePreviewMeta } from "@/app/(culcept)/plan/dev-reality-pipeline/RealityPipelinePreviewClient";
import type { RealityPipelineEnvelope } from "@/lib/plan/reality/orchestration/reality-pipeline";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";

const NOW_MS = Date.parse("2026-06-10T09:00:00+09:00");
const FORBIDDEN = /seed_?ref|utterance|personality|trait|user_id|placeQuery|@[a-z]|\b\d{10,}\b|[0-9a-f]{8}-[0-9a-f]{4}/i;

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
const model = () => computeLifeOpsPreviewModel({ world: ws(), date: "2026-06-10", nowMinute: 800, nowMs: NOW_MS });

describe("c17 — resolver（⑥⑦⑧・client 値を信頼しない）", () => {
  const reps = model().repCandidates;
  const key0 = lifeOpsMomentKey(reps[0]);
  it("①accept/later/dismiss は server 側 candidate から intent 再構築で ok（handle は server 産・signal 整合）", () => {
    expect([...LIFEOPS_WRITABLE_ACTIONS].sort()).toEqual(["accept", "dismiss", "later"]);
    for (const action of ["accept", "later", "dismiss"] as const) {
      const r = resolveLifeOpsActionRequest(reps, key0, action);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.intent.handle).toBe(`lifeops:${key0.endsWith(":") ? key0.slice(0, -1) : key0}`); // menu なしは category のみ
        expect(r.intent.action).toBe(action);
        expect(r.intent.cadenceEligible).toBe(false); // ⑫ 書いても cadence は動かない action だけが通る
      }
    }
  });
  it("②⑦done / enum 外 / 非 string action は invalid_action（done は cadence を動かすため常時拒否）", () => {
    for (const bad of ["done", "explode", "", 42, null, undefined, { a: 1 }]) {
      const r = resolveLifeOpsActionRequest(reps, key0, bad as unknown);
      expect(r).toEqual({ ok: false, reason: "invalid_action" });
    }
  });
  it("⑧不正/陳腐化 candidateKey は unknown_candidate（lookup 失敗=安全側 reject）・非 string は invalid", () => {
    expect(resolveLifeOpsActionRequest(reps, "no_such:key", "accept")).toEqual({ ok: false, reason: "unknown_candidate" });
    expect(resolveLifeOpsActionRequest(reps, "lifeops:beauty_salon:cut", "accept")).toEqual({ ok: false, reason: "unknown_candidate" }); // handle 形式は key として不成立
    expect(resolveLifeOpsActionRequest([], key0, "accept")).toEqual({ ok: false, reason: "unknown_candidate" }); // 代表が変わった（stale UI）
    expect(resolveLifeOpsActionRequest(reps, 7 as unknown, "accept")).toEqual({ ok: false, reason: "invalid_action" });
  });
  it("⑪production では writer gate が flag ON でも false（c9 gate 再 lock）+ flags default OFF", () => {
    expect(isLifeOpsFeedbackWriteAllowed({ master: true, write: true, supabaseUrl: `https://${PRODUCTION_PROJECT_REF}.supabase.co` })).toBe(false);
    expect(isLifeOpsFeedbackWriteAllowed({ master: true, write: true, supabaseUrl: `https://${STAGING_PROJECT_REF}.supabase.co` })).toBe(true);
    expect(PLAN_FLAGS.lifeopsFeedbackWrite).toBe(false);
    expect(PLAN_FLAGS.realityPipelinePreview).toBe(false);
  });
});

describe("c17 — model/DTO 整合（④⑤・writer roundtrip）", () => {
  it("repCandidates と DTO rail candidateKey が 1:1（同一 reps が単一ソース）", () => {
    const m = model();
    const dtoKeys = m.dto.briefing.tiers.flatMap((t) => t.highlights.map((h) => h.candidateKey).filter((k): k is string => !!k));
    expect(dtoKeys).toEqual(m.repCandidates.map((c) => lifeOpsMomentKey(c)));
    expect(dtoKeys.length).toBeGreaterThan(0);
  });
  it("④⑤client DTO に handle / writer input（signal/source_kind/acted_at）が出ない", () => {
    const json = JSON.stringify(model().dto);
    for (const banned of ['"handle"', "lifeops:", '"signal"', '"source_kind"', '"sourceKind"', '"acted_at"', '"actedAtISO"', '"confidence_band"']) {
      expect(json).not.toContain(banned);
    }
    expect(json).not.toMatch(FORBIDDEN);
  });
  it("resolver intent → writer input → c9 row（handle/action/signal roundtrip・menu あり candidate）", () => {
    const m = model();
    const withMenu = m.repCandidates.find((c) => c.menu !== null);
    if (!withMenu) return; // fixture 変更時の防御（現 fixture では beauty_salon:cut が存在）
    const r = resolveLifeOpsActionRequest(m.repCandidates, lifeOpsMomentKey(withMenu), "later");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const row = buildLifeOpsFeedbackWriteRow(actionIntentToWriterInput(r.intent, "2026-06-11T10:00:00+09:00"));
    expect(row.handle).toBe(r.intent.handle);
    expect(row.signal).toBe("deferral");
    expect(row.source_kind).toBe("lifeops");
  });
  it("⑫write される action（accept/later/dismiss 行）からは cadence が生まれない（c13 整合）", () => {
    const rows = ["accept", "later", "dismiss"].map((action, i) => ({
      handle: "lifeops:beauty_salon:cut",
      action,
      acted_at: `2026-06-1${i}T10:00:00+09:00`,
      source_kind: "lifeops",
    }));
    expect(feedbackToCadence(m1RowsToLifeOpsFeedback(rows))).toEqual([]);
  });
});

describe("c17 — render contract（③・押せるのは 3 action だけ）", () => {
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
  const noopAction = async (_: FormData) => {};
  const html = (result?: "ok") =>
    renderToStaticMarkup(
      <RealityPipelinePreviewClient envelope={envelope} meta={meta} lifeOpsPreview={model().dto} feedbackAction={noopAction} lifeOpsActionResult={result} />,
    );

  it("採用/後で/不要 が submit button・③完了※は stage-1（rail に confirm field なし＝1 クリック write 不能）", () => {
    const h = html();
    for (const v of ["accept", "later", "dismiss"]) expect(h).toContain(`value="${v}"`);
    expect(h).toContain("完了※");
    expect(h).toContain("lifeops-action-stage1"); // A-4-c18: done は stage-1 button（確認へ遷移するだけ）
    expect(h).not.toContain('name="confirm"'); // rail の form は confirm を持たない（write 経路は確認 block のみ）
    expect(h).not.toContain("lifeops-done-confirm"); // pendingDone なし → 確認 block 不在
    expect(h).toContain("lifeops-action-button");
    expect(h).toContain('name="candidateKey"'); // lookup key（hidden）
    expect(h).not.toContain("lifeops:"); // ④handle は HTML にも出ない
    expect(h).toContain("完了は確認をはさみます（1 回押しでは記録されません）"); // interactive 注記
  });
  it("結果 token → 固定辞書 1 行（本線保存と誤解させない文言）", () => {
    expect(html("ok")).toContain("記録しました（preview 限定・本線には反映されません）");
    expect(html()).not.toContain("lifeops-action-result");
  });
  it("feedbackAction なし（c16 互換）: button/form 0・全 chip 表示のまま", () => {
    const h = renderToStaticMarkup(<RealityPipelinePreviewClient envelope={envelope} meta={meta} lifeOpsPreview={model().dto} />);
    expect(h).not.toContain("<button");
    expect(h).not.toContain("<form");
    expect(h).toContain("今は表示のみで、押せず・記録もしません");
  });
});

describe("c17 — 静的安全（⑨⑩・配線位置）", () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  it("⑨writer import は server（actions.ts）だけ — client/compute/page には無い", () => {
    expect(read("app/(culcept)/plan/dev-reality-pipeline/actions.ts")).toContain("lifeops-feedback-writer");
    for (const rel of [
      "app/(culcept)/plan/dev-reality-pipeline/RealityPipelinePreviewClient.tsx",
      "app/(culcept)/plan/dev-reality-pipeline/page.tsx",
      "lib/plan/reality/lifeops/lifeops-preview-compute.ts",
      "lib/plan/reality/lifeops/lifeops-action-request.ts",
    ]) {
      expect(read(rel)).not.toContain("lifeops-feedback-writer");
    }
  });
  it('actions.ts: "use server" + gate stack（host 三重ガード/preview flag/auth/resolver/writer gate）+ PRG', () => {
    const src = read("app/(culcept)/plan/dev-reality-pipeline/actions.ts");
    expect(src.startsWith('"use server"')).toBe(true);
    for (const required of [
      "isCandidateActionsPreviewHostAllowed",
      "PLAN_FLAGS.realityPipelinePreview",
      "auth.getUser",
      "routeLifeOpsActionRequest", // A-4-c18: done 2 段階対応で resolve→route へ（resolve は route 内部で委譲継続）
      "createLifeOpsFeedbackWriter",
      "PLAN_FLAGS.lifeopsFeedbackWrite",
      "redirect(",
    ]) {
      expect(src).toContain(required);
    }
    expect(strip(src)).not.toContain("service_role");
  });
  it("⑩client: server-only/supabase/writer/process.env import 0（presentational 維持）", () => {
    const code = strip(read("app/(culcept)/plan/dev-reality-pipeline/RealityPipelinePreviewClient.tsx")).toLowerCase();
    for (const banned of ["server-only", "supabase", "createclient", "process.env", "lifeops-feedback-writer", "usestate", "fetch("]) {
      expect(code).not.toContain(banned);
    }
  });
  it("page: feedbackAction 配線 + token allowlist 検証（URL 生値を直接表示しない）", () => {
    const src = read("app/(culcept)/plan/dev-reality-pipeline/page.tsx");
    expect(src).toContain("submitLifeOpsFeedbackAction");
    expect(src).toContain("LIFEOPS_FB_TOKENS");
    expect(src).toContain("feedbackAction={submitLifeOpsFeedbackAction}");
  });
});
