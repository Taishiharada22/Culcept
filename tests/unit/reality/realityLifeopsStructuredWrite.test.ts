/**
 * A-4-c31 — Structured Source Input Contract + Writer Gate（pure + fake writer・**実 write 0**）unit。
 *   GPT 16 lock: ①②valid input→writer DTO ③unknown category/menu invalid ④invalid ISO ⑤deadline は dueDate 必須
 *   ⑥cadence は last か interval ⑦occurrenceKey は dueDate 由来 deterministic ⑧now/開始時刻不使用 ⑨free text field を受けない
 *   ⑩client input に user_id/DB id/raw なし ⑪duplicate guard ⑫production gate false ⑬default OFF write 0
 *   ⑭insert shape が c27 schema 一致 ⑮no UI/production/notification/R4 ⑯suite/tsc（suite 側）。
 *
 * 設計: docs/life-ops-structured-input-contract-a4-c31-mini-design.md。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  buildLifeOpsStructuredInsertRow,
  hasActiveStructuredDuplicate,
  isLifeOpsStructuredSourceWriteAllowed,
  type LifeOpsStructuredSourceInput,
} from "@/lib/plan/reality/lifeops/lifeops-structured-write";
import { createLifeOpsStructuredSourceWriter, type LifeOpsStructuredWriteClient } from "@/lib/plan/reality/lifeops/lifeops-structured-writer";
import { deriveLifeOpsOccurrenceKey, deriveLifeOpsCadenceOccurrenceKey } from "@/lib/plan/reality/lifeops/lifeops-structured-source";
import { rowsToStructuredSources, type LifeOpsStructuredSourceRow } from "@/lib/plan/reality/lifeops/lifeops-structured-storage";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
const PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const FORBIDDEN = /user_id|"id"|raw|source_ref|free_text|title|note|memo|description|place_query|calendar_title|event_name|store_name/;

const deadlineInput = (over: Partial<Record<string, unknown>> = {}): LifeOpsStructuredSourceInput =>
  ({ sourceType: "deadline", categoryId: "tax_filing", dueDateISO: "2026-06-25", ...over }) as LifeOpsStructuredSourceInput;
const cadenceInput = (over: Partial<Record<string, unknown>> = {}): LifeOpsStructuredSourceInput =>
  ({ sourceType: "cadence", categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: "2026-04-11T00:00:00+09:00", ...over }) as LifeOpsStructuredSourceInput;

describe("c31 — builder（①②③④⑤⑥⑦⑧⑭）", () => {
  it("①valid deadline → insert row（occurrence=dueDate 由来・confidence high・status active 固定）", () => {
    const r = buildLifeOpsStructuredInsertRow(deadlineInput());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row).toEqual({
      source_type: "deadline", category_id: "tax_filing", menu: null,
      due_at: "2026-06-25", last_completed_at: null, typical_interval_days: null,
      occurrence_key: "tax_filing:2026-06-25", confidence: "high", status: "active",
    });
  });
  it("②valid cadence → insert row（interval のみ / last のみ / 両方）・occurrence=固定 suffix", () => {
    const lastOnly = buildLifeOpsStructuredInsertRow(cadenceInput());
    expect(lastOnly.ok && lastOnly.row.occurrence_key === "beauty_salon:cut:cadence").toBe(true);
    const intervalOnly = buildLifeOpsStructuredInsertRow(cadenceInput({ lastCompletedAtISO: undefined, typicalIntervalDays: 30, menu: undefined, categoryId: "eyebrow" }));
    expect(intervalOnly.ok && intervalOnly.row.typical_interval_days === 30 && intervalOnly.row.occurrence_key === "eyebrow:cadence").toBe(true);
  });
  it("③unknown category/enum 外 menu → invalid_category", () => {
    expect(buildLifeOpsStructuredInsertRow(deadlineInput({ categoryId: "massage_parlor" }))).toEqual({ ok: false, reason: "invalid_category" });
    expect(buildLifeOpsStructuredInsertRow(cadenceInput({ menu: "perm" }))).toEqual({ ok: false, reason: "invalid_category" });
  });
  it("④invalid ISO → invalid_iso ⑤dueDate なし → missing_due ⑥cadence 両方なし → missing_cadence_fields・interval 範囲外 → invalid_interval", () => {
    expect(buildLifeOpsStructuredInsertRow(deadlineInput({ dueDateISO: "not-a-date" }))).toEqual({ ok: false, reason: "invalid_iso" });
    expect(buildLifeOpsStructuredInsertRow(deadlineInput({ dueDateISO: "" }))).toEqual({ ok: false, reason: "missing_due" });
    expect(buildLifeOpsStructuredInsertRow(cadenceInput({ lastCompletedAtISO: "broken" }))).toEqual({ ok: false, reason: "invalid_iso" });
    expect(buildLifeOpsStructuredInsertRow(cadenceInput({ lastCompletedAtISO: undefined }))).toEqual({ ok: false, reason: "missing_cadence_fields" });
    for (const bad of [0, -1, 731, 1.5]) {
      expect(buildLifeOpsStructuredInsertRow(cadenceInput({ lastCompletedAtISO: undefined, typicalIntervalDays: bad }))).toEqual({ ok: false, reason: "invalid_interval" });
    }
  });
  it("⑦⑧occurrenceKey は deterministic（同 input→同 key・dueDate 変更でのみ変化・now 不使用=時刻を跨いでも同値）", () => {
    expect(deriveLifeOpsOccurrenceKey("tax_filing", null, "2026-06-25T23:59:00+09:00")).toBe("tax_filing:2026-06-25");
    // ★A-4-c32: menu なしで double colon（空 segment）を残さない（4 推奨形の lock）
    expect(deriveLifeOpsOccurrenceKey("tax_filing", null, "2026-06-25")).not.toContain("::");
    expect(deriveLifeOpsOccurrenceKey("beauty_salon", "cut", "2026-06-25")).toBe("beauty_salon:cut:2026-06-25");
    expect(deriveLifeOpsCadenceOccurrenceKey("tax_filing", null)).toBe("tax_filing:cadence");
    expect(deriveLifeOpsCadenceOccurrenceKey("tax_filing", null)).not.toContain("::");
    const a = buildLifeOpsStructuredInsertRow(deadlineInput());
    const b = buildLifeOpsStructuredInsertRow(deadlineInput());
    expect(a.ok && b.ok && a.row.occurrence_key === b.row.occurrence_key).toBe(true); // 呼び出し時刻に依存しない
    const c = buildLifeOpsStructuredInsertRow(deadlineInput({ dueDateISO: "2026-07-01" }));
    expect(c.ok && c.row.occurrence_key === "tax_filing:2026-07-01").toBe(true);
    expect(deriveLifeOpsCadenceOccurrenceKey("beauty_salon", "cut")).toBe("beauty_salon:cut:cadence");
    // ★c30 finding 回帰 lock: 生成 source code に now/Date.now が存在しない（occurrence は入力のみから決まる）
    const src = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/lifeops/lifeops-structured-write.ts"), "utf8");
    expect(src).not.toContain("Date.now");
    expect(src).not.toContain("new Date(");
  });
  it("⑨⑩⑭input に free text/user_id/id field なし・余計な prop は row に透過しない・shape は c27 schema と一致", () => {
    const sneaky = buildLifeOpsStructuredInsertRow({ ...deadlineInput(), title: "確定申告メモ", user_id: "u-1", id: "x", raw: "r" } as unknown as LifeOpsStructuredSourceInput);
    expect(sneaky.ok).toBe(true);
    if (!sneaky.ok) return;
    expect(Object.keys(sneaky.row).sort()).toEqual(
      ["source_type", "category_id", "menu", "due_at", "last_completed_at", "typical_interval_days", "occurrence_key", "confidence", "status"].sort(),
    ); // id/created_at/updated_at 不含（DB DEFAULT）・偽装 prop 不透過
    expect(JSON.stringify(sneaky.row)).not.toMatch(FORBIDDEN);
    expect(JSON.stringify(sneaky.row)).not.toContain("メモ");
  });
});

describe("c31 — duplicate guard（⑪）", () => {
  const existingRow: LifeOpsStructuredSourceRow = {
    source_type: "deadline", category_id: "tax_filing", menu: null, due_at: "2026-06-25",
    last_completed_at: null, typical_interval_days: null, occurrence_key: "tax_filing:2026-06-25",
    confidence: "high", status: "active",
  };
  it("同 type+category+menu+occurrence の active 既存 → duplicate / 別 occurrence・archived は通る", () => {
    const built = buildLifeOpsStructuredInsertRow(deadlineInput());
    if (!built.ok) throw new Error("unexpected");
    expect(hasActiveStructuredDuplicate([existingRow], built.row)).toBe(true);
    expect(hasActiveStructuredDuplicate([{ ...existingRow, occurrence_key: "tax_filing:2026-07-01" }], built.row)).toBe(false); // 別期日=別 occurrence
    expect(hasActiveStructuredDuplicate([{ ...existingRow, status: "archived" }], built.row)).toBe(false); // archive 済みは再登録可
    expect(hasActiveStructuredDuplicate([], built.row)).toBe(false);
  });
});

describe("c31 — writer（⑫⑬・fake client・insert 1 件のみ）", () => {
  function fakeClient(counter: { inserts: number; payloads: Record<string, unknown>[] }): LifeOpsStructuredWriteClient {
    return {
      from: () => ({
        insert: async (rows: readonly Record<string, unknown>[]) => {
          counter.inserts++;
          counter.payloads.push(...rows);
          return { error: null };
        },
      }),
    } as unknown as LifeOpsStructuredWriteClient;
  }
  it("⑬default OFF → gate_off・insert 0 ⑫production は flag ON でも gate false", async () => {
    expect(PLAN_FLAGS.lifeopsStructuredSourceWrite).toBe(false);
    expect(isLifeOpsStructuredSourceWriteAllowed({ master: true, write: true, supabaseUrl: PROD_URL })).toBe(false);
    const counter = { inserts: 0, payloads: [] as Record<string, unknown>[] };
    const offWriter = createLifeOpsStructuredSourceWriter(fakeClient(counter), "user-1", {
      master: PLAN_FLAGS.lifeopsRealdataReadonly, write: PLAN_FLAGS.lifeopsStructuredSourceWrite, supabaseUrl: STAGING_URL,
    });
    expect(await offWriter.writeSource(deadlineInput())).toEqual({ written: false, reason: "gate_off" });
    const prodWriter = createLifeOpsStructuredSourceWriter(fakeClient(counter), "user-1", { master: true, write: true, supabaseUrl: PROD_URL });
    expect(await prodWriter.writeSource(deadlineInput())).toEqual({ written: false, reason: "gate_off" });
    expect(counter.inserts).toBe(0);
  });
  it("gate 開: valid→insert 1 件（payload=row+user_id のみ）・invalid/duplicate は insert 0", async () => {
    const counter = { inserts: 0, payloads: [] as Record<string, unknown>[] };
    const writer = createLifeOpsStructuredSourceWriter(fakeClient(counter), "user-1", { master: true, write: true, supabaseUrl: STAGING_URL });
    expect(await writer.writeSource(deadlineInput({ categoryId: "massage_parlor" }))).toEqual({ written: false, reason: "invalid_category" });
    const existing: LifeOpsStructuredSourceRow = {
      source_type: "deadline", category_id: "tax_filing", menu: null, due_at: "2026-06-25",
      last_completed_at: null, typical_interval_days: null, occurrence_key: "tax_filing:2026-06-25",
      confidence: "high", status: "active",
    };
    expect(await writer.writeSource(deadlineInput(), { existing: [existing] })).toEqual({ written: false, reason: "already_exists" });
    expect(counter.inserts).toBe(0); // ここまで write 0
    expect(await writer.writeSource(deadlineInput())).toEqual({ written: true, reason: "ok" });
    expect(counter.inserts).toBe(1);
    expect(Object.keys(counter.payloads[0]).sort()).toEqual(
      ["user_id", "source_type", "category_id", "menu", "due_at", "last_completed_at", "typical_interval_days", "occurrence_key", "confidence", "status"].sort(),
    );
    expect(counter.payloads[0].user_id).toBe("user-1"); // auth 注入（client input 由来でない）
  });
  it("roundtrip: writer payload → c27 reader DTO → 正規化可能（insert shape と read contract の整合）", async () => {
    const counter = { inserts: 0, payloads: [] as Record<string, unknown>[] };
    const writer = createLifeOpsStructuredSourceWriter(fakeClient(counter), "u", { master: true, write: true, supabaseUrl: STAGING_URL });
    await writer.writeSource(cadenceInput());
    const { user_id: _drop, ...rowShape } = counter.payloads[0];
    const split = rowsToStructuredSources([rowShape as unknown as LifeOpsStructuredSourceRow]);
    expect(split.cadences.length).toBe(1);
    expect(split.cadences[0].categoryId).toBe("beauty_salon");
  });
  it("⑮静的安全: writer/contract に UI/notification/R4/external 参照なし・呼び出し元 0（dormant）", () => {
    for (const rel of ["lib/plan/reality/lifeops/lifeops-structured-write.ts", "lib/plan/reality/lifeops/lifeops-structured-writer.ts"]) {
      const code = fs.readFileSync(path.join(process.cwd(), rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n").toLowerCase();
      for (const banned of ["notification", "react", "fetch(", "createclient", "service_role", "trigger-model", "calendar", "process.env"]) {
        expect(code).not.toContain(banned);
      }
    }
    const offenders: string[] = [];
    for (const rel of fs.readdirSync(path.join(process.cwd(), "app"), { recursive: true }) as string[]) {
      const s = rel.toString();
      if (!/\.(ts|tsx)$/.test(s)) continue;
      if (fs.readFileSync(path.join(process.cwd(), "app", s), "utf8").includes("lifeops-structured-writer")) offenders.push(s);
    }
    expect(offenders).toEqual([]); // UI 入力 slice（別 CEO GO）まで呼び出し元なし
  });
});
