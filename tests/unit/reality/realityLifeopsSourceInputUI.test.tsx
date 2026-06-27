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
import {
  listLifeOpsDeadlineInputCategories,
  listLifeOpsCadenceInputOptions,
  buildLifeOpsStructuredInsertRow,
} from "@/lib/plan/reality/lifeops/lifeops-structured-write";
import { readActiveStructuredRowsForDuplicateGuard, type LifeOpsStructuredGuardReadClient } from "@/lib/plan/reality/lifeops/lifeops-structured-writer";
import { isLifeOpsMainlineAllowed } from "@/lib/plan/reality/lifeops/lifeops-mainline-gate";
import { isLifeOpsStructuredSourceWriteAllowed } from "@/lib/plan/reality/lifeops/lifeops-structured-write";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
const PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const noop = async (_: FormData) => {};
const cats = listLifeOpsDeadlineInputCategories();
const cadenceOpts = listLifeOpsCadenceInputOptions();
const render = (result?: "ok" | "already_exists" | "invalid", resultSourceType?: "deadline" | "cadence") =>
  renderToStaticMarkup(
    <LifeOpsSourceInputCard categories={cats} cadenceOptions={cadenceOpts} inputAction={noop} result={result} resultSourceType={resultSourceType} />,
  );

describe("c33 — gate（①②③・page 配線 static）", () => {
  it("①②production/default OFF では gate false（props 不渡し=非表示）③staging+両 flag で true", () => {
    expect(PLAN_FLAGS.lifeopsMainline).toBe(false);
    expect(PLAN_FLAGS.lifeopsStructuredSourceWrite).toBe(false);
    expect(isLifeOpsMainlineAllowed({ mainline: true, planRouteLive: true, supabaseUrl: PROD_URL })).toBe(false); // production deny
    expect(isLifeOpsStructuredSourceWriteAllowed({ master: true, write: true, supabaseUrl: PROD_URL })).toBe(false);
    expect(isLifeOpsMainlineAllowed({ mainline: true, planRouteLive: true, supabaseUrl: STAGING_URL })).toBe(true);
    // P16 test-drift fix: HOME-SWIPE-PLAN-PARITY FIX(2026-06-25)で write flag gate と LIFEOPS_SRC_TOKENS は
    //   page.tsx → planClientFeatureProps.ts に移動（route/pane parity 確保のため）。挙動は不変。
    const featureProps = fs.readFileSync(path.join(process.cwd(), "app/(culcept)/plan/planClientFeatureProps.ts"), "utf8");
    expect(featureProps).toContain("if (PLAN_FLAGS.lifeopsStructuredSourceWrite)"); // 入口は write flag も必要（gated block 内）
    expect(featureProps).toContain("LIFEOPS_SRC_TOKENS"); // token allowlist 検証
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
    expect(src).toContain("{lifeOpsInputCategories && lifeOpsCadenceOptions && lifeOpsInputAction && ("); // 独立条件（lifeOpsCard 非依存・c34）
  });
  it("⑥free text 入力欄が存在しない（input は hidden/date/number のみ・textarea/type=text なし）⑦⑧禁止 field 名なし", () => {
    const h = render();
    expect(h).not.toContain("<textarea");
    expect(h).not.toContain('type="text"');
    const inputTypes = [...h.matchAll(/<input[^>]*type="([a-z]+)"/g)].map((m) => m[1]).sort();
    expect([...new Set(inputTypes)].sort()).toEqual(["date", "hidden", "number"].sort()); // c34: 周期日数 number 追加
    for (const banned of ['name="occurrence_key"', 'name="user_id"', 'name="id"', 'name="confidence"', 'name="status"', 'name="title"', 'name="memo"', 'name="note"']) {
      expect(h).not.toContain(banned);
    }
    // 送れる field 名の全集合（期限 form 3 + 周期 form 4・sourceType は両 form の hidden）
    expect([...new Set([...h.matchAll(/name="([a-zA-Z_]+)"/g)].map((m) => m[1]))].sort()).toEqual(
      ["cadenceOption", "categoryId", "dueDateISO", "lastCompletedAtISO", "sourceType", "typicalIntervalDays"].sort(),
    );
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
  it("⑦⑧formData から読むのは許可 7 名のみ（occurrence_key/user_id/id/confidence/status を読まない）", () => {
    const gets = [...action.matchAll(/formData\.get\("([a-zA-Z_]+)"\)/g)].map((m) => m[1]).sort();
    expect(gets).toEqual(["cadenceOption", "categoryId", "dueDateISO", "lastCompletedAtISO", "menu", "sourceType", "typicalIntervalDays"].sort());
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
  it("★c34: cadence picker は MVP cadence spec 実在分のみ（辞書 label+menu 名・value は cadenceKey 形式）", () => {
    // listMvpCadences() を自動列挙する設計（A4-C 本体不変）。LifeOps 縦拡張で laundry/cleaning が追加されたため 7 組。
    expect(cadenceOpts.map((o) => o.value).sort()).toEqual(
      ["beauty_salon:color", "beauty_salon:cut", "cleaning", "daily_necessities", "eyebrow", "groceries", "laundry"].sort(),
    );
    expect(cadenceOpts.find((o) => o.value === "beauty_salon:cut")!.label).toBe("美容院（カット）");
    expect(cadenceOpts.find((o) => o.value === "eyebrow")!.label).toBe("眉");
    const h = render();
    expect(h).toContain("lifeops-cadence-input-form");
    expect(h).toContain("前回やった日");
    expect(h).toContain("周期日数（任意）");
    expect(h).toContain("美容院（カット）");
    // 期限 form は不変（共存 lock）
    expect(h).toContain("lifeops-source-input-form");
    expect(h).toContain("期限日");
  });
  it("★c34: type 別文言（cadence=同じ周期/前回の日付・deadline 側は不変）", () => {
    expect(render("already_exists", "cadence")).toContain("同じ周期はすでに登録されています。");
    expect(render("invalid", "cadence")).toContain("前回の日付を確認してください。");
    expect(render("already_exists", "deadline")).toContain("同じ期限はすでに登録されています。");
    expect(render("invalid")).toContain("期限日を確認してください。"); // 既定=deadline
    expect(render("ok", "cadence")).toContain("登録しました。生活まわりの提案に反映します。"); // 成功は共通
  });
  it("★c34: future date は invalid（builder の future_date・nowMs 注入時のみ・過去は ok・後方互換）", () => {
    const NOW = Date.parse("2026-06-11T09:00:00+09:00");
    const cad = (last: string) => ({ sourceType: "cadence" as const, categoryId: "eyebrow" as const, lastCompletedAtISO: last });
    expect(buildLifeOpsStructuredInsertRow(cad("2026-06-20"), { nowMs: NOW })).toEqual({ ok: false, reason: "future_date" });
    const past = buildLifeOpsStructuredInsertRow(cad("2026-05-20"), { nowMs: NOW });
    expect(past.ok && past.row.occurrence_key === "eyebrow:cadence" && !past.row.occurrence_key.includes("::")).toBe(true);
    expect(buildLifeOpsStructuredInsertRow(cad("2026-06-20")).ok).toBe(true); // nowMs 省略=判定なし（後方互換）
    // deadline の未来 dueDate は正当（future_date 対象外）
    const dl = buildLifeOpsStructuredInsertRow({ sourceType: "deadline", categoryId: "tax_filing", dueDateISO: "2026-07-01" }, { nowMs: NOW });
    expect(dl.ok).toBe(true);
  });
  it("★c34: action は cadence 分岐で nowMs を注入・cleanup script は TYPE param 対応（static）", () => {
    expect(action).toContain('sourceTypeRaw === "cadence"');
    expect(action).toContain("nowMs: Date.now()");
    expect(action).toContain("lifeopsSrcType=");
    const cleanup = fs.readFileSync(path.join(process.cwd(), "scripts/lifeops-structured-dogfood-cleanup.ts"), "utf8");
    expect(cleanup).toContain("LIFEOPS_STRUCTURED_CLEANUP_TYPE");
    expect(cleanup).toContain('.eq("source_type", SOURCE_TYPE)');
    // P16 test-drift fix: HOME-SWIPE-PLAN-PARITY FIX(2026-06-25)で cadence option list と type 検証は
    //   page.tsx → planClientFeatureProps.ts に移動。挙動は不変。
    const featureProps = fs.readFileSync(path.join(process.cwd(), "app/(culcept)/plan/planClientFeatureProps.ts"), "utf8");
    expect(featureProps).toContain("listLifeOpsCadenceInputOptions");
    expect(featureProps).toContain('sp?.lifeopsSrcType === "cadence"'); // type も検証して渡す
  });
  it("⑭⑮既存 tab 不干渉・action に notification/R4/external なし", () => {
    for (const rel of ["app/(culcept)/plan/tabs/CalendarTab.tsx", "app/(culcept)/plan/tabs/FlowTab.tsx", "app/(culcept)/plan/tabs/MapTab.tsx"]) {
      expect(fs.readFileSync(path.join(process.cwd(), rel), "utf8")).not.toContain("lifeOpsInput");
    }
    const code = action.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n").toLowerCase();
    for (const banned of ["notification", "trigger-model", "external", "service_role"]) expect(code).not.toContain(banned);
  });
});
