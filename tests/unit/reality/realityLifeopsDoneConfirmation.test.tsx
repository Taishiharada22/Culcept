/**
 * A-4-c18 — Life Ops Done Confirmation（PRG 2 段階 confirm token・fake のみ・実 write 0）unit + render contract。
 *   GPT 14 lock: ①初回 click で write されない ②確認状態が出る ③confirm 後だけ writer 可 ④cancel/back は write なし
 *   ⑤server 再検証 ⑥不正 candidateKey 拒否 ⑦不正 confirm token 拒否 ⑧handle 非露出 ⑨done=cadenceEligible
 *   ⑩done write 後 cadence=1（pure 側）⑪accept/later/dismiss 既存挙動不変 ⑫production gate false
 *   ⑬cleanup（smoke 側）⑭suite/tsc（suite 側）。
 *
 * 設計: docs/life-ops-done-confirmation-a4-c18-mini-design.md。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "fs";
import * as path from "path";
import {
  routeLifeOpsActionRequest,
  resolveLifeOpsActionRequest,
  buildLifeOpsDoneConfirmToken,
  parseLifeOpsDoneConfirmToken,
  LIFEOPS_DONE_CONFIRM_PREFIX,
} from "@/lib/plan/reality/lifeops/lifeops-action-request";
import { computeLifeOpsPreviewModel } from "@/lib/plan/reality/lifeops/lifeops-preview-compute";
import { actionIntentToWriterInput } from "@/lib/plan/reality/lifeops/lifeops-action-intent";
import { buildLifeOpsFeedbackWriteRow, isLifeOpsFeedbackWriteAllowed } from "@/lib/plan/reality/lifeops/lifeops-feedback-write";
import { m1RowsToLifeOpsFeedback, feedbackToCadence } from "@/lib/plan/reality/lifeops/lifeops-feedback-source";
import { lifeOpsMomentKey } from "@/lib/plan/reality/lifeops/lifeops-moment-preview";
import { PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import { RealityPipelinePreviewClient, type RealityPipelinePreviewMeta } from "@/app/(culcept)/plan/dev-reality-pipeline/RealityPipelinePreviewClient";
import type { RealityPipelineEnvelope } from "@/lib/plan/reality/orchestration/reality-pipeline";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";

const NOW_MS = Date.parse("2026-06-10T09:00:00+09:00");

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
const reps = model().repCandidates;
const key0 = lifeOpsMomentKey(reps[0]);

describe("c18 — token（build/parse roundtrip・firewall）", () => {
  it("build → parse 一致・prefix/型/空/handle 形式は null", () => {
    expect(parseLifeOpsDoneConfirmToken(buildLifeOpsDoneConfirmToken(key0))).toBe(key0);
    expect(LIFEOPS_DONE_CONFIRM_PREFIX).toBe("done:");
    for (const bad of ["", "done:", key0, `lifeops:${key0}`, 42, null, undefined, ["done:x"]]) {
      expect(parseLifeOpsDoneConfirmToken(bad as unknown)).toBeNull();
    }
  });
});

describe("c18 — route（①②③⑤⑥⑦・done は 2 段階）", () => {
  it("①stage-1: done + confirm 不在（null/''）→ confirm_redirect（**write kind に到達しない**）", () => {
    for (const absent of [null, undefined, ""]) {
      const r = routeLifeOpsActionRequest(reps, key0, "done", absent);
      expect(r).toEqual({ kind: "confirm_redirect", confirmToken: `done:${key0}` });
    }
  });
  it("③stage-2: done + 一致 confirm → write intent（cadenceEligible=true・requiresExplicitConfirmation=true）", () => {
    const r = routeLifeOpsActionRequest(reps, key0, "done", `done:${key0}`);
    expect(r.kind).toBe("write");
    if (r.kind === "write") {
      expect(r.intent.action).toBe("done");
      expect(r.intent.cadenceEligible).toBe(true); // ⑨
      expect(r.intent.requiresExplicitConfirmation).toBe(true);
      expect(r.intent.signal).toBe("completion");
      // ⑪互換: writer roundtrip（c9 row builder）も成立
      const row = buildLifeOpsFeedbackWriteRow(actionIntentToWriterInput(r.intent, "2026-06-11T10:00:00+09:00"));
      expect(row.signal).toBe("completion");
      expect(row.source_kind).toBe("lifeops");
    }
  });
  it("⑦不正 confirm token（別 key/garbage/prefix なし/handle 形式）→ invalid_confirm（write なし）", () => {
    for (const bad of [`done:no_such:key`, "garbage", key0, `lifeops:${key0}`, "done:"]) {
      expect(routeLifeOpsActionRequest(reps, key0, "done", bad)).toEqual({ kind: "reject", reason: "invalid_confirm" });
    }
  });
  it("⑥不正/陳腐化 candidateKey → unknown_candidate（confirm の有無に関係なく・stage-1 でも write なし）", () => {
    expect(routeLifeOpsActionRequest(reps, "no_such:key", "done", null)).toEqual({ kind: "reject", reason: "unknown_candidate" });
    expect(routeLifeOpsActionRequest(reps, "no_such:key", "done", "done:no_such:key")).toEqual({ kind: "reject", reason: "unknown_candidate" });
    expect(routeLifeOpsActionRequest([], key0, "done", `done:${key0}`)).toEqual({ kind: "reject", reason: "unknown_candidate" });
    expect(routeLifeOpsActionRequest(reps, 7 as unknown, "done", null)).toEqual({ kind: "reject", reason: "invalid_action" });
  });
  it("⑪accept/later/dismiss は c17 と同一経路（confirm 不要で write・resolve 関数は done を引き続き拒否）", () => {
    for (const action of ["accept", "later", "dismiss"] as const) {
      const r = routeLifeOpsActionRequest(reps, key0, action, null);
      expect(r.kind).toBe("write");
      if (r.kind === "write") expect(r.intent.cadenceEligible).toBe(false);
    }
    expect(resolveLifeOpsActionRequest(reps, key0, "done")).toEqual({ ok: false, reason: "invalid_action" }); // c17 lock 不変
    expect(routeLifeOpsActionRequest(reps, key0, "explode", null)).toEqual({ kind: "reject", reason: "invalid_action" });
  });
  it("⑩pure 側: done 行 → cadence=1 / accept 行 → 0（write 後の cadence 動作の根拠・c13 整合）", () => {
    const row = (action: string) => ({ handle: "lifeops:beauty_salon:cut", action, acted_at: "2026-06-11T10:00:00+09:00", source_kind: "lifeops" });
    expect(feedbackToCadence(m1RowsToLifeOpsFeedback([row("done")])).length).toBe(1);
    expect(feedbackToCadence(m1RowsToLifeOpsFeedback([row("accept")])).length).toBe(0);
  });
  it("⑫production では writer gate false（flag ON でも）", () => {
    expect(isLifeOpsFeedbackWriteAllowed({ master: true, write: true, supabaseUrl: `https://${PRODUCTION_PROJECT_REF}.supabase.co` })).toBe(false);
  });
});

describe("c18 — render contract（②④⑧・確認 block）", () => {
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
  const noop = async (_: FormData) => {};
  const dto = model().dto;
  const firstRail = dto.briefing.tiers.flatMap((t) => t.highlights).find((h) => h.candidateKey);
  const render = (pending?: { candidateKey: string; label: string }, result?: "ok_done") =>
    renderToStaticMarkup(
      <RealityPipelinePreviewClient envelope={envelope} meta={meta} lifeOpsPreview={dto} feedbackAction={noop} pendingDone={pending} lifeOpsActionResult={result} />,
    );

  it("②pendingDone → 確認 block（問い+周期影響+preview 限定+記録する+戻る）が出る", () => {
    const h = render({ candidateKey: firstRail!.candidateKey!, label: firstRail!.label });
    expect(h).toContain("lifeops-done-confirm");
    expect(h).toContain(`「${firstRail!.label}」を完了として記録しますか？`);
    expect(h).toContain("次回の提案周期に影響します。preview 限定です。本線には反映されません。");
    expect(h).toContain("記録する");
    expect(h).toContain(`value="done:${firstRail!.candidateKey}"`); // stage-2 confirm token（hidden）
    expect(h).toContain("戻る");
  });
  it("④戻る は plain link（submit ではない＝write 経路なし）・確認 block 外に confirm field なし", () => {
    const h = render({ candidateKey: firstRail!.candidateKey!, label: firstRail!.label });
    expect(h).toMatch(/<a[^>]*data-testid="lifeops-done-confirm-cancel"/); // anchor であること（submit でない）
    expect(h).toMatch(/<a[^>]*href="\/plan\/dev-reality-pipeline"[^>]*data-testid="lifeops-done-confirm-cancel"|<a[^>]*data-testid="lifeops-done-confirm-cancel"[^>]*href="\/plan\/dev-reality-pipeline"/);
    expect(h.split('name="confirm"').length - 1).toBe(1); // confirm field は確認 block の 1 箇所だけ
    expect(h).not.toContain("lifeops:"); // ⑧handle 非露出（HTML 全体）
  });
  it("①UI 側: pendingDone なし → 確認 block なし・rail の done は stage-1（confirm なし）", () => {
    const h = render(undefined);
    expect(h).not.toContain("lifeops-done-confirm");
    expect(h).toContain("lifeops-action-stage1");
    expect(h).not.toContain('name="confirm"');
  });
  it("ok_done 結果文言（周期影響+preview 限定を明示・本線保存と誤解させない）", () => {
    expect(render(undefined, "ok_done")).toContain("完了を記録しました（次回の提案周期に影響します。preview 限定・本線には反映されません）");
  });
});

describe("c18 — 配線 static（page/actions）", () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  it("page: lifeopsConfirm token parse + 実在検証つき pendingDone 注入 + ok_done allowlist", () => {
    const src = read("app/(culcept)/plan/dev-reality-pipeline/page.tsx");
    expect(src).toContain("parseLifeOpsDoneConfirmToken");
    expect(src).toContain("pendingDone");
    expect(src).toContain('"ok_done"');
    expect(src).toContain("candidateKey === confirmKey"); // DTO rail 実在検証（server-rendered）
  });
  it('actions: routeLifeOpsActionRequest + confirm 受領 + stage-1 redirect（"use server" 維持）', () => {
    const src = read("app/(culcept)/plan/dev-reality-pipeline/actions.ts");
    expect(src.startsWith('"use server"')).toBe(true);
    expect(src).toContain("routeLifeOpsActionRequest");
    expect(src).toContain('formData.get("confirm")');
    expect(src).toContain("lifeopsConfirm=");
    expect(src).toContain('"ok_done"');
  });
});
