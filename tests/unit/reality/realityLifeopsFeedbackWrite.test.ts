/**
 * A-4-c9 — Life Ops Feedback Write Contract（pure + server-only writer・fake のみ・**実 write 0**）unit。
 *   row builder の read 側 roundtrip 一致・action 意味論（accept=intent）・cooldown・gate default OFF・
 *   gate/cooldown 不通過時 insert 0・fail-open を固定。
 *
 * 設計: docs/life-ops-feedback-write-contract-a4-c9-mini-design.md。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  buildLifeOpsFeedbackWriteRow,
  shouldWriteLifeOpsFeedback,
  isLifeOpsFeedbackWriteAllowed,
  LIFEOPS_FEEDBACK_SIGNAL,
  LIFEOPS_SOURCE_KIND,
  LIFEOPS_FEEDBACK_WRITE_COOLDOWN_MS,
  type LifeOpsFeedbackWriteIntent,
} from "@/lib/plan/reality/lifeops/lifeops-feedback-write";
import { createLifeOpsFeedbackWriter, type LifeOpsFeedbackWriteClient } from "@/lib/plan/reality/lifeops/lifeops-feedback-writer";
import { m1RowsToLifeOpsFeedback, lifeOpsFeedbackHandle } from "@/lib/plan/reality/lifeops/lifeops-feedback-source";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
const PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const FORBIDDEN = /seed_?ref|utterance|personality|trait|@[a-z]|\b\d{10,}\b|[0-9a-f]{8}-[0-9a-f]{4}/i;

const intent = (over: Partial<LifeOpsFeedbackWriteIntent> = {}): LifeOpsFeedbackWriteIntent => ({
  categoryId: "beauty_salon",
  menu: "cut",
  action: "accept",
  actedAtISO: "2026-06-11T10:00:00+09:00",
  ...over,
});

describe("c9 — row builder（contract 値・read roundtrip）", () => {
  it("row の key/値が contract どおり（source_kind='lifeops'・confidence_band='high'・null 群）", () => {
    const row = buildLifeOpsFeedbackWriteRow(intent());
    expect(row).toEqual({
      handle: "lifeops:beauty_salon:cut",
      action: "accept",
      signal: "adoption",
      desired_date: null,
      band: null,
      confidence_band: "high",
      duration_min: null,
      source_kind: LIFEOPS_SOURCE_KIND,
      acted_at: "2026-06-11T10:00:00+09:00",
      captured_at: null,
      expires_at: null,
    });
  });
  it("signal map は既存 M1 規約 mirror（accept→adoption / dismiss→non_adoption / later→deferral）", () => {
    expect(LIFEOPS_FEEDBACK_SIGNAL).toEqual({ accept: "adoption", dismiss: "non_adoption", later: "deferral" });
    expect(buildLifeOpsFeedbackWriteRow(intent({ action: "dismiss" })).signal).toBe("non_adoption");
    expect(buildLifeOpsFeedbackWriteRow(intent({ action: "later" })).signal).toBe("deferral");
  });
  it("★roundtrip: 書いた row を c8 read adapter に通すと同一観測に戻る", () => {
    const row = buildLifeOpsFeedbackWriteRow(intent());
    const obs = m1RowsToLifeOpsFeedback([{ handle: row.handle, action: row.action, acted_at: row.acted_at }]);
    expect(obs).toEqual([{ categoryId: "beauty_salon", menu: "cut", action: "accept", actedAtISO: "2026-06-11T10:00:00+09:00" }]);
  });
  it("row に自由文/PII の経路がない（enum builder のみ・FORBIDDEN 不一致）", () => {
    expect(JSON.stringify(buildLifeOpsFeedbackWriteRow(intent({ categoryId: "tax_filing", menu: null })))).not.toMatch(FORBIDDEN);
  });
});

describe("c9 — duplicate/spam guard（cooldown）", () => {
  const h = lifeOpsFeedbackHandle("beauty_salon", "cut");
  const t0 = Date.parse("2026-06-11T10:00:00+09:00");
  it("同一 handle×action が cooldown 内 → false（書かない）", () => {
    expect(shouldWriteLifeOpsFeedback([{ handle: h, action: "accept", actedAtMs: t0 - 60_000 }], intent(), t0)).toBe(false);
  });
  it("別 action / cooldown 経過 / recent 空 → true", () => {
    expect(shouldWriteLifeOpsFeedback([{ handle: h, action: "dismiss", actedAtMs: t0 - 60_000 }], intent(), t0)).toBe(true);
    expect(shouldWriteLifeOpsFeedback([{ handle: h, action: "accept", actedAtMs: t0 - LIFEOPS_FEEDBACK_WRITE_COOLDOWN_MS - 1 }], intent(), t0)).toBe(true);
    expect(shouldWriteLifeOpsFeedback([], intent(), t0)).toBe(true);
  });
});

describe("c9 — write gate（default OFF・production hard block）", () => {
  it("flags default OFF（PLAN_FLAGS.lifeopsFeedbackWrite=false）→ gate false", () => {
    expect(PLAN_FLAGS.lifeopsFeedbackWrite).toBe(false);
    expect(isLifeOpsFeedbackWriteAllowed({ master: PLAN_FLAGS.lifeopsRealdataReadonly, write: PLAN_FLAGS.lifeopsFeedbackWrite, supabaseUrl: STAGING_URL })).toBe(false);
  });
  it("master∧write∧staging → true / production → 常に false / 片 flag → false", () => {
    expect(isLifeOpsFeedbackWriteAllowed({ master: true, write: true, supabaseUrl: STAGING_URL })).toBe(true);
    expect(isLifeOpsFeedbackWriteAllowed({ master: true, write: true, supabaseUrl: PROD_URL })).toBe(false);
    expect(isLifeOpsFeedbackWriteAllowed({ master: true, write: false, supabaseUrl: STAGING_URL })).toBe(false);
    expect(isLifeOpsFeedbackWriteAllowed({ master: false, write: true, supabaseUrl: STAGING_URL })).toBe(false);
  });
});

describe("c9 — server-only writer（fake client・insert 回数を観測）", () => {
  function fakeClient(counter: { inserts: number; payloads: Record<string, unknown>[][] }, error: { message: string } | null = null): LifeOpsFeedbackWriteClient {
    return {
      from: (_t: string) => ({
        insert: async (rows: readonly Record<string, unknown>[]) => {
          counter.inserts++;
          counter.payloads.push([...rows]);
          return { error };
        },
      }),
    };
  }
  it("gate false（default OFF）→ insert 0・reason=gate_off", async () => {
    const c = { inserts: 0, payloads: [] as Record<string, unknown>[][] };
    const w = createLifeOpsFeedbackWriter(fakeClient(c), "user-1", { master: false, write: false, supabaseUrl: STAGING_URL });
    expect(await w.writeFeedback(intent())).toEqual({ written: false, reason: "gate_off" });
    expect(c.inserts).toBe(0);
  });
  it("cooldown 重複 → insert 0・reason=duplicate_cooldown", async () => {
    const c = { inserts: 0, payloads: [] as Record<string, unknown>[][] };
    const w = createLifeOpsFeedbackWriter(fakeClient(c), "user-1", { master: true, write: true, supabaseUrl: STAGING_URL });
    const t0 = Date.parse(intent().actedAtISO);
    const r = await w.writeFeedback(intent(), { recent: [{ handle: "lifeops:beauty_salon:cut", action: "accept", actedAtMs: t0 - 1000 }], nowMs: t0 });
    expect(r).toEqual({ written: false, reason: "duplicate_cooldown" });
    expect(c.inserts).toBe(0);
  });
  it("gate true → insert 1 回・payload は row+user_id（lifeops 契約値）", async () => {
    const c = { inserts: 0, payloads: [] as Record<string, unknown>[][] };
    const w = createLifeOpsFeedbackWriter(fakeClient(c), "user-1", { master: true, write: true, supabaseUrl: STAGING_URL });
    expect(await w.writeFeedback(intent())).toEqual({ written: true, reason: "ok" });
    expect(c.inserts).toBe(1);
    const payload = c.payloads[0][0];
    expect(payload.user_id).toBe("user-1");
    expect(payload.handle).toBe("lifeops:beauty_salon:cut");
    expect(payload.source_kind).toBe("lifeops");
  });
  it("insert error → throw せず reason=insert_failed（fail-open）", async () => {
    const c = { inserts: 0, payloads: [] as Record<string, unknown>[][] };
    const w = createLifeOpsFeedbackWriter(fakeClient(c, { message: "check violation" }), "user-1", { master: true, write: true, supabaseUrl: STAGING_URL });
    expect(await w.writeFeedback(intent())).toEqual({ written: false, reason: "insert_failed" });
  });
});

describe("c9 — source contract（insert のみ・通知/UI/外部なし）", () => {
  for (const rel of ["lib/plan/reality/lifeops/lifeops-feedback-write.ts", "lib/plan/reality/lifeops/lifeops-feedback-writer.ts"]) {
    it(`${path.basename(rel)}: update/delete/upsert/rpc/fetch/notification/react/createClient/service_role なし`, () => {
      const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
      for (const banned of [".update(", ".delete(", ".upsert(", ".rpc(", "fetch(", "notification", "react", "createclient", "service_role"]) {
        expect(src.toLowerCase()).not.toContain(banned);
      }
    });
  }
});
