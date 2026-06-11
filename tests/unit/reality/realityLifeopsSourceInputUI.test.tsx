/**
 * A-4-c33 — Structured Source Input UI（staging gated・deadline first・fake のみ・実 write 0）unit + render contract。
 *   GPT 16 lock: ①production 非表示 ②default OFF 非表示 ③staging+gate ON で表示 ④source/candidate 0 件でも入口は出る
 *   ⑤候補 card は従来どおり null ⑥free text 欄不存在 ⑦occurrence_key を client から送れない ⑧user_id/DB id/raw 送れない
 *   ⑨server action が c31 builder（writer 経由）を使う ⑩occurrence 形式 ⑪duplicate 2 件目なし ⑫結果表示 3 種
 *   ⑬390px wrap ⑭既存 tab/proposals 不干渉 ⑮no production write/notification/R4 ⑯suite/tsc（suite 側）。
 *
 * 設計: docs/life-ops-source-input-ui-a4-c33-mini-design.md。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "fs";
import * as path from "path";
import { LifeOpsSourceInputCard } from "@/app/(culcept)/plan/LifeOpsSourceInputCard";
import { listLifeOpsDeadlineInputCategories, buildLifeOpsStructuredInsertRow } from "@/lib/plan/reality/lifeops/lifeops-structured-write";
import { readActiveStructuredRowsForDuplicateGuard, type LifeOpsStructuredGuardReadClient } from "@/lib/plan/reality/lifeops/lifeops-structured-writer";
import { isLifeOpsMainlineAllowed } from "@/lib/plan/reality/lifeops/lifeops-mainline-gate";
import { isLifeOpsStructuredSourceWriteAllowed } from "@/lib/plan/reality/lifeops/lifeops-structured-write";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
const PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const noop = async (_: FormData) => {};
const cats = listLifeOpsDeadlineInputCategories();
const render = (result?: "ok" | "already_exists" | "invalid") =>
  renderToStaticMarkup(<LifeOpsSourceInputCard categories={cats} inputAction={noop} result={result} />);

describe("c33 — gate（①②③・page 配線 static）", () => {
  it("①②production/default OFF では gate false（page は props 不渡し=非表示）③staging+両 flag で true", () => {
    expect(PLAN_FLAGS.lifeopsMainline).toBe(false);
    expect(PLAN_FLAGS.lifeopsStructuredSourceWrite).toBe(false);
    expect(isLifeOpsMainlineAllowed({ mainline: true, planRouteLive: true, supabaseUrl: PROD_URL })).toBe(false); // production deny
    expect(isLifeOpsStructuredSourceWriteAllowed({ master: true, write: true, supabaseUrl: PROD_URL })).toBe(false);
    expect(isLifeOpsMainlineAllowed({ mainline: true, planRouteLive: true, supabaseUrl: STAGING_URL })).toBe(true);
    const page = fs.readFileSync(path.join(process.cwd(), "app/(culcept)/plan/page.tsx"), "utf8");
    expect(page).toContain("if (PLAN_FLAGS.lifeopsStructuredSourceWrite)"); // 入口は write flag も必要（gated block 内）
    expect(page).toContain("LIFEOPS_SRC_TOKENS"); // token allowlist 検証
  });
});

describe("c33 — render contract（④⑤⑥⑬・bootstrap 分離）", () => {
  it("④入口 card は候補 card と独立に render できる（source/candidate 0 件でも出る＝bootstrap）", () => {
    const h = render();
    expect(h).toContain("lifeops-source-input-card");
    expect(h).toContain("生活まわりを登録");
    expect(h).toContain("登録"); // submit
    // 辞書 money_admin 由来の選択肢（表示名は辞書 label）
    for (const c of cats) expect(h).toContain(c.label);
    expect(cats.map((c) => c.id)).toContain("tax_filing");
    expect(h).toContain("予定には追加しません。生活提案の材料として使います。");
  });
  it("⑤候補 card の null 挙動は不変（PlanClient は入口と候補を別条件で render・static）", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "app/(culcept)/plan/PlanClient.tsx"), "utf8");
    expect(src).toContain("{lifeOpsCard && lifeOpsAction && (");
    expect(src).toContain("{lifeOpsInputCategories && lifeOpsInputAction && ("); // 独立条件（lifeOpsCard 非依存）
  });
  it("⑥free text 入力欄が存在しない（input は hidden/date のみ・textarea/type=text なし）⑦⑧禁止 field 名なし", () => {
    const h = render();
    expect(h).not.toContain("<textarea");
    expect(h).not.toContain('type="text"');
    const inputTypes = [...h.matchAll(/<input[^>]*type="([a-z]+)"/g)].map((m) => m[1]).sort();
    expect([...new Set(inputTypes)].sort()).toEqual(["date", "hidden"].sort());
    for (const banned of ['name="occurrence_key"', 'name="user_id"', 'name="id"', 'name="confidence"', 'name="status"', 'name="title"', 'name="memo"', 'name="note"']) {
      expect(h).not.toContain(banned);
    }
    expect([...h.matchAll(/name="([a-zA-Z_]+)"/g)].map((m) => m[1]).sort()).toEqual(["categoryId", "dueDateISO", "sourceType"].sort()); // 送れるのは 3 名のみ
  });
  it("⑫結果表示: success は成功色・duplicate/invalid は notice（文言固定）⑬390px flex-wrap", () => {
    expect(render("ok")).toContain("登録しました。生活まわりの提案に反映します。");
    expect(render("already_exists")).toContain("同じ期限はすでに登録されています。");
    expect(render("invalid")).toContain("期限日を確認してください。");
    expect(render("already_exists")).toContain('data-result-kind="notice"');
    expect(render("ok")).toContain('data-result-kind="success"');
    expect(render()).toContain("flex-wrap"); // mobile 390px 折返し
  });
});

describe("c33 — server action（⑦⑧⑨⑩⑪・static + pure）", () => {
  const action = fs.readFileSync(path.join(process.cwd(), "app/(culcept)/plan/_actions/lifeops-structured-input.ts"), "utf8");
  it('⑨action: "use server"・mainline gate・c31 writer（builder 内蔵）・duplicate 読み口・PRG', () => {
    expect(action.startsWith('"use server"')).toBe(true);
    for (const required of [
      "isLifeOpsMainlineAllowed",
      "createLifeOpsStructuredSourceWriter", // c31 builder は writer 内で必須経路
      "readActiveStructuredRowsForDuplicateGuard", // c32 finding 対応の読み口
      "PLAN_FLAGS.lifeopsStructuredSourceWrite",
      "lifeopsSrc=",
    ]) {
      expect(action).toContain(required);
    }
  });
  it("⑦⑧formData から読むのは 4 名のみ（occurrence_key/user_id/id/confidence/status を読まない）", () => {
    const gets = [...action.matchAll(/formData\.get\("([a-zA-Z_]+)"\)/g)].map((m) => m[1]).sort();
    expect(gets).toEqual(["categoryId", "dueDateISO", "menu", "sourceType"].sort());
    for (const banned of ['formData.get("occurrence_key")', 'formData.get("user_id")', 'formData.get("id")', 'formData.get("confidence")', 'formData.get("status")'] ) {
      expect(action).not.toContain(banned);
    }
    expect(action).not.toContain("occurrence_key:"); // action 内で occurrence を組み立てない（builder 専任）
  });
  it("⑩occurrence は builder 生成で tax_filing:YYYY-MM-DD（再 lock）⑪duplicate 読み口は gate OFF/production で query 0", async () => {
    const built = buildLifeOpsStructuredInsertRow({ sourceType: "deadline", categoryId: "tax_filing", dueDateISO: "2026-06-25" });
    expect(built.ok && built.row.occurrence_key === "tax_filing:2026-06-25").toBe(true);
    const counter = { queries: 0 };
    const fake: LifeOpsStructuredGuardReadClient = {
      from: () => ({
        select: () => {
          const chain = { eq: () => chain, limit: async () => { counter.queries++; return { data: [], error: null }; } };
          return chain as never;
        },
      }),
    } as unknown as LifeOpsStructuredGuardReadClient;
    await readActiveStructuredRowsForDuplicateGuard(fake, "u", { master: false, write: false, supabaseUrl: STAGING_URL });
    await readActiveStructuredRowsForDuplicateGuard(fake, "u", { master: true, write: true, supabaseUrl: PROD_URL });
    expect(counter.queries).toBe(0); // default OFF / production → query 0
    await readActiveStructuredRowsForDuplicateGuard(fake, "u", { master: true, write: true, supabaseUrl: STAGING_URL });
    expect(counter.queries).toBe(1); // staging+flags のみ
  });
  it("⑭⑮既存 tab 不干渉・action に notification/R4/external なし", () => {
    for (const rel of ["app/(culcept)/plan/tabs/CalendarTab.tsx", "app/(culcept)/plan/tabs/FlowTab.tsx", "app/(culcept)/plan/tabs/MapTab.tsx"]) {
      expect(fs.readFileSync(path.join(process.cwd(), rel), "utf8")).not.toContain("lifeOpsInput");
    }
    const code = action.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n").toLowerCase();
    for (const banned of ["notification", "trigger-model", "external", "service_role"]) expect(code).not.toContain(banned);
  });
});
