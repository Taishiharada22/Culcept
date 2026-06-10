/**
 * A-4-c15 — Life Ops Action Intent Contract（pure・fake candidate のみ・write 0・UI 0）unit。
 *   GPT 14 lock: ①handle 生成 ②accept→adoption ③done→completion ④later→deferral ⑤dismiss→non_adoption
 *   ⑥done のみ cadence eligible ⑦accept 不適格 ⑧dismiss/later 不適格 ⑨placeQuery/label/raw 不混入
 *   ⑩辞書外は intent 化しない（safe disabled）⑪writer DTO へ変換可 ⑫writer は呼ばれない
 *   ⑬presenter/UI 本線へ出ない（縦 boundary 維持）⑭no DB write / no UI / no notification / no production。
 *
 * 設計: docs/life-ops-action-intent-contract-a4-c15-mini-design.md。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  CADENCE_ELIGIBLE_ACTIONS,
  isCadenceEligibleAction,
  LIFEOPS_ACTION_UI_LABELS,
  LIFEOPS_ACTION_ORDER,
  buildLifeOpsActionIntent,
  listLifeOpsActionDescriptors,
  actionIntentToWriterInput,
} from "@/lib/plan/reality/lifeops/lifeops-action-intent";
import { buildLifeOpsFeedbackWriteRow, shouldWriteLifeOpsFeedback, type LifeOpsFeedbackAction } from "@/lib/plan/reality/lifeops/lifeops-feedback-write";
import { m1RowsToLifeOpsFeedback, feedbackToCadence } from "@/lib/plan/reality/lifeops/lifeops-feedback-source";
import type { LifeOpsCandidate } from "@/lib/lifeops/candidate-types";

const FORBIDDEN = /seed_?ref|utterance|personality|trait|user_id|placeQuery|@[a-z]|\b\d{10,}\b|[0-9a-f]{8}-[0-9a-f]{4}/i;

/** fake candidate（縦 seam 形・placeQuery 等の流出禁止 field を含む＝混入検査の餌）。 */
function candidate(over: Partial<LifeOpsCandidate> = {}): LifeOpsCandidate {
  return {
    category: "beauty_salon",
    menu: "cut",
    dueReason: { kind: "cycle", elapsedDays: 60, typicalIntervalDays: 42, phase: "beyond_typical" },
    suggestedWindow: null,
    placeQuery: "美容室 渋谷 ○○ヘアサロン", // 店舗名/自由文（intent に出てはならない）
    permissionLevelHint: "L3",
    riskFlags: ["appearance_change"],
    ...over,
  } as LifeOpsCandidate;
}

describe("c15 — ①handle / 意味論 mapping（②〜⑤）", () => {
  it("①candidate → lifeops:{categoryId}[:{menu}] handle（menu なしは category のみ）", () => {
    expect(buildLifeOpsActionIntent(candidate(), "accept")!.handle).toBe("lifeops:beauty_salon:cut");
    expect(buildLifeOpsActionIntent(candidate({ category: "tax_filing", menu: null } as Partial<LifeOpsCandidate>), "accept")!.handle).toBe("lifeops:tax_filing");
  });
  it("②accept→adoption ③done→completion ④later→deferral ⑤dismiss→non_adoption・sourceKind=lifeops 固定", () => {
    const expected: Record<LifeOpsFeedbackAction, string> = { accept: "adoption", done: "completion", later: "deferral", dismiss: "non_adoption" };
    for (const action of LIFEOPS_ACTION_ORDER) {
      const intent = buildLifeOpsActionIntent(candidate(), action)!;
      expect(intent.signal).toBe(expected[action]);
      expect(intent.sourceKind).toBe("lifeops");
      expect(intent.action).toBe(action);
    }
  });
  it("descriptor: 固定順 [採用, 完了, 後で, 不要]・uiLabel は 4 語辞書のみ", () => {
    const ds = listLifeOpsActionDescriptors(candidate());
    expect(ds.map((d) => d.uiLabel)).toEqual(["採用", "完了", "後で", "不要"]);
    expect(Object.values(LIFEOPS_ACTION_UI_LABELS).sort()).toEqual(["不要", "完了", "後で", "採用"].sort());
  });
});

describe("c15 — cadence eligibility（⑥⑦⑧）と確認契約", () => {
  it("⑥done のみ eligible ⑦accept 不適格 ⑧dismiss/later 不適格（intent field と関数の両方）", () => {
    expect([...CADENCE_ELIGIBLE_ACTIONS]).toEqual(["done"]);
    expect(isCadenceEligibleAction("done")).toBe(true);
    for (const a of ["accept", "later", "dismiss"] as const) expect(isCadenceEligibleAction(a)).toBe(false);
    const byAction = Object.fromEntries(LIFEOPS_ACTION_ORDER.map((a) => [a, buildLifeOpsActionIntent(candidate(), a)!]));
    expect(byAction.done.cadenceEligible).toBe(true);
    expect(byAction.accept.cadenceEligible).toBe(false);
    expect(byAction.later.cadenceEligible).toBe(false);
    expect(byAction.dismiss.cadenceEligible).toBe(false);
  });
  it("整合 lock: eligibility は c13 feedbackToCadence の実挙動と一致（done=1 件 / accept=0 件）", () => {
    const row = (action: string) => ({ handle: "lifeops:beauty_salon:cut", action, acted_at: "2026-06-11T10:00:00+09:00", source_kind: "lifeops" });
    expect(feedbackToCadence(m1RowsToLifeOpsFeedback([row("done")])).length).toBe(1);
    expect(feedbackToCadence(m1RowsToLifeOpsFeedback([row("accept")])).length).toBe(0);
  });
  it("done のみ requiresExplicitConfirmation=true（誤タップ→cadence 歪み防止・自動 done の経路なし）", () => {
    for (const action of LIFEOPS_ACTION_ORDER) {
      expect(buildLifeOpsActionIntent(candidate(), action)!.requiresExplicitConfirmation).toBe(action === "done");
    }
  });
});

describe("c15 — safety（⑨⑩）", () => {
  it("⑨placeQuery/店舗名/raw text/risk flag は intent/descriptor JSON に混入しない", () => {
    const json = JSON.stringify(listLifeOpsActionDescriptors(candidate()));
    for (const banned of ["渋谷", "ヘアサロン", "美容室", "placeQuery", "dueReason", "riskFlags", "appearance_change", "suggestedWindow"]) {
      expect(json).not.toContain(banned);
    }
    expect(json).not.toMatch(FORBIDDEN);
  });
  it("⑩辞書外 category / enum 外 menu / 区切り汚染は intent 化されない（null / []＝safe disabled）", () => {
    const badCat = candidate({ category: "massage_parlor" } as unknown as Partial<LifeOpsCandidate>);
    const badMenu = candidate({ menu: "perm" } as unknown as Partial<LifeOpsCandidate>);
    const injected = candidate({ category: "beauty_salon:09012345678" } as unknown as Partial<LifeOpsCandidate>);
    for (const bad of [badCat, badMenu, injected]) {
      expect(buildLifeOpsActionIntent(bad, "accept")).toBeNull();
      expect(listLifeOpsActionDescriptors(bad)).toEqual([]);
    }
  });
});

describe("c15 — writer DTO 変換（⑪）と非実行（⑫）", () => {
  it("⑪intent → writer 入力 → c9 row builder で handle/action/signal/source_kind が一致（roundtrip）", () => {
    for (const action of LIFEOPS_ACTION_ORDER) {
      const intent = buildLifeOpsActionIntent(candidate(), action)!;
      const row = buildLifeOpsFeedbackWriteRow(actionIntentToWriterInput(intent, "2026-06-11T10:00:00+09:00"));
      expect(row.handle).toBe(intent.handle);
      expect(row.action).toBe(intent.action);
      expect(row.signal).toBe(intent.signal);
      expect(row.source_kind).toBe(intent.sourceKind);
      expect(row.acted_at).toBe("2026-06-11T10:00:00+09:00");
    }
  });
  it("⑪b 変換後も cooldown guard と互換（同一 handle×action は 10 分内 false）", () => {
    const intent = buildLifeOpsActionIntent(candidate(), "done")!;
    const wi = actionIntentToWriterInput(intent, new Date(1000_000_000).toISOString());
    expect(shouldWriteLifeOpsFeedback([{ handle: intent.handle, action: "done", actedAtMs: 1000_000_000 }], wi, 1000_000_000 + 60_000)).toBe(false);
    expect(shouldWriteLifeOpsFeedback([], wi, 1000_000_000 + 60_000)).toBe(true);
  });
  it("⑫module は writer/server-only/supabase を import しない（変換のみ・実行経路なし）", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/lifeops/lifeops-action-intent.ts"), "utf8");
    for (const banned of ["lifeops-feedback-writer", "server-only", "supabase", "createClient", "writeFeedback"]) {
      expect(src).not.toContain(banned);
    }
  });
});

describe("c15 — 非接続（⑬）と静的安全（⑭）", () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  it("⑬縦 boundary 維持: lib/lifeops（card-presenter 含む）は action-intent を import しない", () => {
    const root = path.join(process.cwd(), "lib/lifeops");
    for (const rel of fs.readdirSync(root, { recursive: true }) as string[]) {
      if (!rel.toString().endsWith(".ts")) continue;
      expect(read(path.join("lib/lifeops", rel.toString()))).not.toContain("lifeops-action-intent");
    }
  });
  it("⑬b UI 本線へ出ない: app/ 配下に import 0・barrel(integration/index.ts) 非 export", () => {
    const offenders: string[] = [];
    for (const rel of fs.readdirSync(path.join(process.cwd(), "app"), { recursive: true }) as string[]) {
      const s = rel.toString();
      if (!/\.(ts|tsx)$/.test(s)) continue;
      if (read(path.join("app", s)).includes("lifeops-action-intent")) offenders.push(s);
    }
    expect(offenders).toEqual([]);
    expect(read("lib/plan/reality/integration/index.ts")).not.toContain("lifeops-action-intent");
  });
  it("⑭no DB write / no UI / no notification / no production: 禁止 token 0（comment 除外）", () => {
    const code = read("lib/plan/reality/lifeops/lifeops-action-intent.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    for (const banned of [".insert(", ".update(", ".delete(", ".upsert(", ".rpc(", "fetch(", "notification", "react", "process.env", "service_role"]) {
      expect(code.toLowerCase()).not.toContain(banned.toLowerCase());
    }
  });
});
