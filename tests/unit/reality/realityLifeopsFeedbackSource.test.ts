/**
 * A-4-c8 — Life Ops Feedback Read-only Source（pure adapter + gate + server-only wiring・fake のみ）unit。
 *   辞書 firewall（自由文/PII 不通過）・accept=完了 proxy の tentative cadence・gate default OFF・
 *   gate false → query しない（fail-closed-to-empty）・write 0 を固定。
 *
 * 設計: docs/life-ops-feedback-readonly-source-a4-c8-mini-design.md。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  LIFEOPS_FEEDBACK_HANDLE_PREFIX,
  lifeOpsFeedbackHandle,
  parseLifeOpsFeedbackHandle,
  m1RowsToLifeOpsFeedback,
  feedbackToCadence,
  isLifeOpsFeedbackReadAllowed,
} from "@/lib/plan/reality/lifeops/lifeops-feedback-source";
import { createLifeOpsFeedbackReadonlySource } from "@/lib/plan/reality/lifeops/lifeops-feedback-readonly-source";
import type { PrmLearningEventReadClient } from "@/lib/plan/reality/learning/supabase-prm-learning-event-reader";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
const PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const FORBIDDEN = /seed_?ref|utterance|personality|trait|@[a-z]|\b\d{10,}\b|[0-9a-f]{8}-[0-9a-f]{4}/i;

describe("c8 — handle namespace（write 側との共有規約）", () => {
  it("roundtrip: lifeOpsFeedbackHandle → parse で同一 key", () => {
    expect(parseLifeOpsFeedbackHandle(lifeOpsFeedbackHandle("beauty_salon", "cut"))).toEqual({ categoryId: "beauty_salon", menu: "cut" });
    expect(parseLifeOpsFeedbackHandle(lifeOpsFeedbackHandle("tax_filing", null))).toEqual({ categoryId: "tax_filing", menu: null });
    expect(LIFEOPS_FEEDBACK_HANDLE_PREFIX).toBe("lifeops:");
  });
  it("辞書 firewall: 辞書外 category / enum 外 menu / 非 prefix は null（自由文・PII は構造的に不通過）", () => {
    expect(parseLifeOpsFeedbackHandle("lifeops:歯医者@渋谷 09012345678")).toBeNull(); // 自由文/PII
    expect(parseLifeOpsFeedbackHandle("lifeops:unknown_category")).toBeNull();
    expect(parseLifeOpsFeedbackHandle("lifeops:beauty_salon:perm")).toBeNull(); // enum 外 menu
    expect(parseLifeOpsFeedbackHandle("seed:abc123")).toBeNull(); // plan-seed 由来（非 prefix）
    expect(parseLifeOpsFeedbackHandle("")).toBeNull();
  });
});

describe("c8 — M1 rows → 観測（enum + ISO のみ）", () => {
  const rows = [
    { handle: "lifeops:beauty_salon:cut", action: "accept", acted_at: "2026-06-01T10:00:00+09:00" },
    { handle: "lifeops:groceries", action: "dismiss", acted_at: "2026-06-02T10:00:00+09:00" },
    { handle: "seed:opaque-from-plan-track", action: "accept", acted_at: "2026-06-03T10:00:00+09:00" }, // 非 lifeops → drop
    { handle: "lifeops:tax_filing", action: "explode", acted_at: "2026-06-04T10:00:00+09:00" }, // action enum 外 → drop
    { handle: "lifeops:beauty_salon:cut", action: "accept", acted_at: "broken-date" }, // 不正日付 → drop
    { handle: "lifeops:eyebrow", action: "later", acted_at: "2026-05-30T10:00:00+09:00" },
  ];
  it("prefix filter + firewall + enum 検証で 3 件のみ・acted_at 昇順", () => {
    const obs = m1RowsToLifeOpsFeedback(rows);
    expect(obs.map((o) => `${o.categoryId}:${o.action}`)).toEqual(["eyebrow:later", "beauty_salon:accept", "groceries:dismiss"]);
  });
  it("★A-4-c10 二重識別: source_kind が与えられ 'lifeops' でない行は prefix が合っても drop", () => {
    const obs = m1RowsToLifeOpsFeedback([
      { handle: "lifeops:groceries", action: "accept", acted_at: "2026-06-11T09:00:00+09:00", source_kind: "seed_explicit" }, // 偽装/バグ行 → drop
      { handle: "lifeops:groceries", action: "accept", acted_at: "2026-06-11T10:00:00+09:00", source_kind: "lifeops" }, // 正規（migration 後の実 row 形）
      { handle: "lifeops:eyebrow", action: "later", acted_at: "2026-06-11T11:00:00+09:00" }, // source_kind 未指定（legacy/fake）→ prefix のみで可
    ]);
    expect(obs.map((o) => `${o.categoryId}:${o.action}`)).toEqual(["groceries:accept", "eyebrow:later"]);
  });
  it("★A-4-c14 二重識別の逆向き: prefix≠lifeops は source_kind='lifeops' でも drop（双方向 AND）", () => {
    const obs = m1RowsToLifeOpsFeedback([
      { handle: "seed:opaque-from-plan-track", action: "done", acted_at: "2026-06-11T09:00:00+09:00", source_kind: "lifeops" }, // 偽装/バグ行 → drop
      { handle: "lifeops:groceries", action: "done", acted_at: "2026-06-11T10:00:00+09:00", source_kind: "lifeops" }, // 正規
    ]);
    expect(obs.map((o) => `${o.categoryId}:${o.action}`)).toEqual(["groceries:done"]);
  });
  it("★A-4-c13: action='done' を正式に読む（completion semantics・proxy 退役と同時に対応）", () => {
    const obs = m1RowsToLifeOpsFeedback([{ handle: "lifeops:groceries", action: "done", acted_at: "2026-06-11T09:00:00+09:00", source_kind: "lifeops" }]);
    expect(obs).toEqual([{ categoryId: "groceries", menu: null, action: "done", actedAtISO: "2026-06-11T09:00:00+09:00" }]);
  });
  it("出力 JSON に自由文/PII が混ざらない（FORBIDDEN 不一致）", () => {
    const obs = m1RowsToLifeOpsFeedback([...rows, { handle: "lifeops:utterance personality 09099998888", action: "accept", acted_at: "2026-06-05T00:00:00+09:00" }]);
    expect(JSON.stringify(obs)).not.toMatch(FORBIDDEN);
    expect(JSON.stringify(obs)).not.toContain("渋谷");
  });
});

describe("★A-4-c13 — cadence は done のみ（accept-proxy 退役）", () => {
  const obs = m1RowsToLifeOpsFeedback([
    { handle: "lifeops:beauty_salon:cut", action: "accept", acted_at: "2026-06-05T10:00:00+09:00" }, // 採用 intent → cadence 不使用
    { handle: "lifeops:beauty_salon:cut", action: "done", acted_at: "2026-05-01T10:00:00+09:00" },
    { handle: "lifeops:beauty_salon:cut", action: "done", acted_at: "2026-06-01T10:00:00+09:00" }, // 同 key 最新 done
    { handle: "lifeops:groceries", action: "dismiss", acted_at: "2026-06-02T10:00:00+09:00" }, // 不要 → 不使用
    { handle: "lifeops:eyebrow", action: "later", acted_at: "2026-06-03T10:00:00+09:00" }, // 後で → 不使用
  ]);
  it("done のみ・key ごと最新 1 件 → CadenceObservation（後日の accept があっても無視）", () => {
    const cad = feedbackToCadence(obs);
    expect(cad).toEqual([{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: "2026-06-01T10:00:00+09:00" }]);
  });
  it("accept だけ（done ゼロ）→ []（採用しただけで完了扱いにしない＝周期学習を歪めない）", () => {
    expect(feedbackToCadence(m1RowsToLifeOpsFeedback([{ handle: "lifeops:groceries", action: "accept", acted_at: "2026-06-02T10:00:00+09:00" }]))).toEqual([]);
  });
  it("dismiss/later だけ → []", () => {
    expect(feedbackToCadence(m1RowsToLifeOpsFeedback([
      { handle: "lifeops:groceries", action: "dismiss", acted_at: "2026-06-02T10:00:00+09:00" },
      { handle: "lifeops:eyebrow", action: "later", acted_at: "2026-06-03T10:00:00+09:00" },
    ]))).toEqual([]);
  });
});

describe("c8 — gate（default OFF・staging only・production hard block）", () => {
  it("flags default OFF（PLAN_FLAGS）→ gate false", () => {
    expect(PLAN_FLAGS.lifeopsRealdataReadonly).toBe(false);
    expect(PLAN_FLAGS.lifeopsFeedbackReadonly).toBe(false);
    expect(isLifeOpsFeedbackReadAllowed({ master: PLAN_FLAGS.lifeopsRealdataReadonly, feedback: PLAN_FLAGS.lifeopsFeedbackReadonly, supabaseUrl: STAGING_URL })).toBe(false);
  });
  it("master ∧ feedback ∧ staging → true / production → 常に false / 片 flag → false", () => {
    expect(isLifeOpsFeedbackReadAllowed({ master: true, feedback: true, supabaseUrl: STAGING_URL })).toBe(true);
    expect(isLifeOpsFeedbackReadAllowed({ master: true, feedback: true, supabaseUrl: PROD_URL })).toBe(false);
    expect(isLifeOpsFeedbackReadAllowed({ master: true, feedback: false, supabaseUrl: STAGING_URL })).toBe(false);
    expect(isLifeOpsFeedbackReadAllowed({ master: false, feedback: true, supabaseUrl: STAGING_URL })).toBe(false);
    expect(isLifeOpsFeedbackReadAllowed({ master: true, feedback: true, supabaseUrl: undefined })).toBe(false);
  });
});

describe("c8 — server-only wiring（fake client・query 有無を観測）", () => {
  function fakeClient(rows: { handle: string; action: string; acted_at: string }[], counter: { queries: number }): PrmLearningEventReadClient {
    return {
      from: (_table: string) => ({
        select: (_c: string) => ({
          eq: (_col: string, _v: string) => ({
            order: () => ({
              limit: async () => {
                counter.queries++;
                return { data: rows as unknown as Record<string, unknown>[], error: null };
              },
            }),
          }),
        }),
      }),
    } as unknown as PrmLearningEventReadClient;
  }
  it("gate false（default OFF）→ **query せず** []", async () => {
    const counter = { queries: 0 };
    const src = createLifeOpsFeedbackReadonlySource(fakeClient([{ handle: "lifeops:groceries", action: "accept", acted_at: "2026-06-01T00:00:00+09:00" }], counter), "user-1", { master: false, feedback: false, supabaseUrl: STAGING_URL });
    expect(await src.readObservations()).toEqual([]);
    expect(counter.queries).toBe(0); // fail-closed-to-empty
  });
  it("gate true → M1 reader 経由で firewall 済み観測のみ返す", async () => {
    const counter = { queries: 0 };
    const src = createLifeOpsFeedbackReadonlySource(
      fakeClient(
        [
          { handle: "lifeops:groceries", action: "accept", acted_at: "2026-06-01T00:00:00+09:00" },
          { handle: "seed:opaque", action: "accept", acted_at: "2026-06-02T00:00:00+09:00" },
        ],
        counter,
      ),
      "user-1",
      { master: true, feedback: true, supabaseUrl: STAGING_URL },
    );
    const obs = await src.readObservations();
    expect(counter.queries).toBe(1);
    expect(obs.length).toBe(1);
    expect(obs[0].categoryId).toBe("groceries");
  });
});

describe("c8 — source contract（write 0・通知 0・UI 0）", () => {
  for (const rel of ["lib/plan/reality/lifeops/lifeops-feedback-source.ts", "lib/plan/reality/lifeops/lifeops-feedback-readonly-source.ts"]) {
    it(`${path.basename(rel)}: insert/update/delete/upsert/rpc/fetch/notification/react なし`, () => {
      const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
      for (const banned of [".insert(", ".update(", ".delete(", ".upsert(", ".rpc(", "fetch(", "notification", "createclient", "service_role", "react"]) {
        expect(src.toLowerCase()).not.toContain(banned);
      }
    });
  }
});
