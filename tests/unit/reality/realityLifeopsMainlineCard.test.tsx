/**
 * A-4-c23 — Life Ops Mainline Minimal Card（staging gated・fake のみ・実 write 0）unit + render contract。
 *   GPT 18 lock: ①flag OFF→card なし ②production deny ③staging+ON→表示 ④候補 0→card なし ⑤代表 ≤3
 *   ⑥rail=later/dismiss/done のみ ⑦accept 不在 ⑧⑨⑩done 2 段階（初回 write なし/confirm 後のみ）⑪⑫handle/PII 非搬出
 *   ⑬server 再計算 ⑭done→suppression ⑮390px wrap ⑯既存 tab/proposals 不干渉 ⑰no R4/notification/production ⑱suite/tsc。
 *
 * 設計: docs/life-ops-mainline-minimal-card-a4-c23-mini-design.md。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "fs";
import * as path from "path";
import {
  buildLifeOpsMainlineCardDto,
  routeLifeOpsMainlineActionRequest,
  LIFEOPS_MAINLINE_ACTIONS,
} from "@/lib/plan/reality/lifeops/lifeops-mainline-card";
import { computeLifeOpsPreviewModel } from "@/lib/plan/reality/lifeops/lifeops-preview-compute";
import { isLifeOpsMainlineAllowed } from "@/lib/plan/reality/lifeops/lifeops-mainline-gate";
import { m1RowsToLifeOpsFeedback } from "@/lib/plan/reality/lifeops/lifeops-feedback-source";
import { lifeOpsMomentKey } from "@/lib/plan/reality/lifeops/lifeops-moment-preview";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { LifeOpsMainlineCard } from "@/app/(culcept)/plan/LifeOpsMainlineCard";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";
import type { LifeOpsFeedbackObservation } from "@/lib/plan/reality/lifeops/lifeops-feedback-source";

const NOW_MS = Date.parse("2026-06-10T09:00:00+09:00");
const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (d: number) => new Date(NOW_MS + d * DAY_MS).toISOString();
const FORBIDDEN = /seed_?ref|utterance|personality|trait|user_id|source_ref|@[a-z]|\b\d{10,}\b|[0-9a-f]{8}-[0-9a-f]{4}/i;
const BANNED_WORDS = /予定に入れた|通知する|通知します|確定(?!申告)|やるべき|すべき|必ず|今すぐ|しなければ|してください/;

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
const model = (doneFeedback?: readonly LifeOpsFeedbackObservation[]) =>
  computeLifeOpsPreviewModel({ world: ws(), date: "2026-06-10", nowMinute: 800, nowMs: NOW_MS, doneFeedback });
const card = () => buildLifeOpsMainlineCardDto(model())!;
const noop = async (_: FormData) => {};
const render = (props?: Partial<Parameters<typeof LifeOpsMainlineCard>[0]>) =>
  renderToStaticMarkup(<LifeOpsMainlineCard card={card()} feedbackAction={noop} {...props} />);

describe("c23 — gate/builder（①②③④⑤）", () => {
  it("①flag default OFF → gate false（page は card を計算しない）②production は flag ON でも false ③staging+ON→true", () => {
    expect(PLAN_FLAGS.lifeopsMainline).toBe(false);
    const staging = `https://${STAGING_PROJECT_REF}.supabase.co`;
    expect(isLifeOpsMainlineAllowed({ mainline: false, planRouteLive: true, supabaseUrl: staging })).toBe(false);
    expect(isLifeOpsMainlineAllowed({ mainline: true, planRouteLive: true, supabaseUrl: `https://${PRODUCTION_PROJECT_REF}.supabase.co` })).toBe(false);
    expect(isLifeOpsMainlineAllowed({ mainline: true, planRouteLive: true, supabaseUrl: staging })).toBe(true);
  });
  it("④候補 0（代表 rail なし）→ builder は null（card 自体を出さない）", () => {
    const empty = computeLifeOpsPreviewModel({ world: ws(), date: "2026-06-10", nowMinute: 800, nowMs: NOW_MS, inputs: {} });
    expect(buildLifeOpsMainlineCardDto(empty)).toBeNull();
  });
  it("⑤代表は最大 3 件・headline 同梱・⑥actions は later/dismiss/done のみ ⑦accept 不在", () => {
    const c = card();
    expect(c.items.length).toBeGreaterThan(0);
    expect(c.items.length).toBeLessThanOrEqual(3);
    expect(c.headline.length).toBeGreaterThan(0);
    expect([...LIFEOPS_MAINLINE_ACTIONS].sort()).toEqual(["dismiss", "done", "later"]);
    for (const item of c.items) {
      expect(item.actions.map((a) => a.action).sort()).toEqual(["dismiss", "done", "later"]);
      expect(item.actions.map((a) => a.action)).not.toContain("accept");
      expect(item.actions.find((a) => a.action === "done")!.requiresConfirmation).toBe(true);
    }
    expect(JSON.stringify(c)).not.toContain("採用");
  });
});

describe("c23 — mainline route（⑦⑧⑨⑩・server 側 accept 拒否）", () => {
  const reps = model().repCandidates;
  const key0 = lifeOpsMomentKey(reps[0]);
  it("⑦accept は server 側でも常時拒否（偽造 POST 防御の二重化）・enum 外/型不正も invalid", () => {
    for (const bad of ["accept", "explode", "", 42, null, undefined]) {
      expect(routeLifeOpsMainlineActionRequest(reps, key0, bad as unknown, null)).toEqual({ kind: "reject", reason: "invalid_action" });
    }
  });
  it("⑨done+confirm 不在 → confirm_redirect（初回 click で write されない）⑩confirm 一致のみ write", () => {
    expect(routeLifeOpsMainlineActionRequest(reps, key0, "done", null)).toEqual({ kind: "confirm_redirect", confirmToken: `done:${key0}` });
    const r = routeLifeOpsMainlineActionRequest(reps, key0, "done", `done:${key0}`);
    expect(r.kind).toBe("write");
    expect(routeLifeOpsMainlineActionRequest(reps, key0, "done", "done:other")).toEqual({ kind: "reject", reason: "invalid_confirm" });
  });
  it("later/dismiss は confirm 不要で write（c17 経路共有）・陳腐化 key は安全 reject", () => {
    for (const a of ["later", "dismiss"] as const) expect(routeLifeOpsMainlineActionRequest(reps, key0, a, null).kind).toBe("write");
    expect(routeLifeOpsMainlineActionRequest([], key0, "later", null)).toEqual({ kind: "reject", reason: "unknown_candidate" });
  });
  it("⑭done 後は同 key deadline が代表から消える（suppression が builder 入力で効く）", () => {
    const taxKey = model().repCandidates.find((c) => c.dueReason.kind === "deadline")!;
    const done = m1RowsToLifeOpsFeedback([{ handle: `lifeops:${taxKey.category}`, action: "done", acted_at: iso(0), source_kind: "lifeops" }]);
    const after = buildLifeOpsMainlineCardDto(model(done));
    const labels = JSON.stringify(after ?? {});
    expect(labels).not.toContain("確定申告"); // fixture の deadline 先頭=tax_filing
  });
});

describe("c23 — render contract（⑪⑫⑮・本線文言）", () => {
  it("card render: 生活まわり/headline/代表/rail（後で・不要・完了※）/footnote・⑮flex-wrap（390px 折返し）", () => {
    const h = render();
    expect(h).toContain("生活まわり");
    expect(h).toContain("lifeops-mainline-rail");
    for (const label of ["後で", "不要"]) expect(h).toContain(label);
    expect(h).toContain("完了※");
    expect(h).toContain("flex-wrap"); // mobile 390px: rail は折返し許容
    expect(h).toContain("※完了は実際に終わった時だけ。予定には追加せず、次回以降の提案調整に使います。");
  });
  it("本線文言: 「preview 限定」「本線には反映されません」を使わない・非断定維持・ok/ok_done は本線軸", () => {
    const okDone = render({ actionResult: "ok_done" });
    expect(okDone).toContain("完了を記録しました。しばらくこの提案を控えます（予定には追加しません）");
    const ok = render({ actionResult: "ok" });
    expect(ok).toContain("記録しました。予定には追加しません（生活提案の学習にだけ使います）");
    for (const h of [render(), okDone, ok]) {
      expect(h).not.toContain("preview 限定");
      expect(h).not.toContain("本線には反映されません");
      expect(h).not.toMatch(BANNED_WORDS);
    }
  });
  it("⑧done 確認 block（pendingDone 時のみ・stage-2 form だけ confirm field・戻る=/plan link）", () => {
    const c = card();
    const withPending = render({ pendingDone: { candidateKey: c.items[0].candidateKey, label: c.items[0].label } });
    expect(withPending).toContain("lifeops-mainline-done-confirm");
    expect(withPending).toContain("を完了として記録しますか？");
    expect(withPending).toContain("完了にすると、しばらくこの提案を控えます。予定には追加しません。");
    expect(withPending.split('name="confirm"').length - 1).toBe(1); // confirm は確認 block の 1 箇所のみ
    expect(withPending).toMatch(/<a[^>]*href="\/plan"/);
    const without = render();
    expect(without).not.toContain("lifeops-mainline-done-confirm");
    expect(without).not.toContain('name="confirm"'); // rail に confirm なし＝初回 click で write 不能
  });
  it("⑪⑫HTML/DTO に handle / lifeops: / 採用 / raw / PII / internal counts が出ない", () => {
    const h = render({ pendingDone: { candidateKey: card().items[0].candidateKey, label: card().items[0].label } });
    expect(h).not.toContain("lifeops:");
    expect(h).not.toContain('"handle"');
    expect(h).not.toContain("採用");
    expect(h).not.toContain("suppressedDeadline"); // internal counts は本線非表示
    expect(h).not.toContain("realCadence");
    expect(h).not.toMatch(FORBIDDEN);
    expect(JSON.stringify(card())).not.toMatch(FORBIDDEN);
  });
});

describe("c23 — 配線/静的安全（⑬⑯⑰）", () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  it("⑬mainline action: 'use server'+gate+model 再計算+mainline route+writer（dev preview action とは分離）", () => {
    const src = read("app/(culcept)/plan/_actions/lifeops-feedback-mainline.ts");
    expect(src.startsWith('"use server"')).toBe(true);
    for (const required of [
      "isLifeOpsMainlineAllowed",
      "computeLifeOpsMainlineModel", // server 側候補再計算（page と単一ソース）
      "routeLifeOpsMainlineActionRequest",
      "createLifeOpsFeedbackWriter",
      "PLAN_FLAGS.lifeopsFeedbackWrite",
      'redirect(`${PLAN_PATH}?lifeopsConfirm=',
    ]) {
      expect(src).toContain(required);
    }
    expect(strip(src)).not.toContain("service_role");
  });
  it("page: gated 合成（gate 通過時のみ）+ token allowlist + card/action props・page と action が同一 model helper", () => {
    const src = read("app/(culcept)/plan/page.tsx");
    expect(src).toContain("isLifeOpsMainlineAllowed");
    expect(src).toContain("computeLifeOpsMainlineModel");
    expect(src).toContain("buildLifeOpsMainlineCardDto");
    expect(src).toContain("LIFEOPS_MAINLINE_FB_TOKENS");
    expect(src).toContain("submitLifeOpsMainlineFeedbackAction");
  });
  it("⑯PlanClient: card は props 条件付き 1 箇所のみ・既存 tab/proposals コードに lifeops 写像なし", () => {
    const src = read("app/(culcept)/plan/PlanClient.tsx");
    expect(src.split("LifeOpsMainlineCard").length - 1).toBeGreaterThanOrEqual(2); // import + 条件 render
    expect(src).toContain("{lifeOpsCard && lifeOpsAction && (");
    for (const rel of ["app/(culcept)/plan/tabs/CalendarTab.tsx", "app/(culcept)/plan/tabs/FlowTab.tsx", "app/(culcept)/plan/tabs/MapTab.tsx"]) {
      expect(read(rel)).not.toContain("lifeOps"); // 既存 tab 不干渉
    }
  });
  it("⑰card/action/model: notification/R4(trigger)/external fetch なし・client に writer/supabase なし", () => {
    const clientCode = strip(read("app/(culcept)/plan/LifeOpsMainlineCard.tsx")).toLowerCase();
    for (const banned of ["fetch(", "usestate", "supabase", "lifeops-feedback-writer", "notification", "onclick"]) {
      expect(clientCode).not.toContain(banned);
    }
    for (const rel of ["app/(culcept)/plan/_actions/lifeops-feedback-mainline.ts", "lib/plan/reality/lifeops/lifeops-mainline-model.ts", "lib/plan/reality/lifeops/lifeops-mainline-card.ts"]) {
      const code = strip(read(rel)).toLowerCase();
      for (const banned of ["notification", "trigger-model", "trigger-evaluator", "external"]) expect(code).not.toContain(banned);
    }
  });
});
