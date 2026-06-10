/**
 * A-4-c20 — Life Ops Cadence Real Source（pure 合成層・fake のみ・新規 DB query 0）unit。
 *   GPT 14 lock: ①flag default OFF→query 0 ②production flag ON→gate false ③staging+flags でのみ read
 *   ④column 限定（新 reader なし=構造的） ⑤raw/user_id/id/source_ref/free text 非搬出 ⑥辞書外 drop
 *   ⑦calendar title 推定なし ⑧c14 feedback cadence 維持 ⑨real と feedback の merge ⑩同 key latest 勝ち
 *   ⑪merge 後も raw cap ⑫0 件 no-op ⑬real 由来の候補変化を preview で観測 ⑭no write/notification/PlanClient/production。
 *
 * 設計: docs/life-ops-cadence-real-read-a4-c20-mini-design.md。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  feedbackDoneToRealCadence,
  realCadenceToCadenceObservations,
  countCadenceKeyConflicts,
  isLifeOpsCadenceReadAllowed,
  CADENCE_FRESHNESS_INTERVAL_FACTOR,
  type LifeOpsCadenceRealObservation,
} from "@/lib/plan/reality/lifeops/lifeops-cadence-real-source";
import { m1RowsToLifeOpsFeedback, feedbackToCadence } from "@/lib/plan/reality/lifeops/lifeops-feedback-source";
import { computeLifeOpsPreviewDto } from "@/lib/plan/reality/lifeops/lifeops-preview-compute";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";
import type { LifeOpsInputs } from "@/lib/lifeops/candidate-collector";
import type { CadenceObservation } from "@/lib/lifeops/candidate-types";

const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
const PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const NOW_MS = Date.parse("2026-06-10T09:00:00+09:00");
const NOW_ISO = new Date(NOW_MS).toISOString();
const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (d: number) => new Date(NOW_MS + d * DAY_MS).toISOString();
const FORBIDDEN = /seed_?ref|utterance|personality|trait|user_id|"id"|source_ref|@[a-z]|\b\d{10,}\b|[0-9a-f]{8}-[0-9a-f]{4}/i;

const doneObs = (deltaDays: number, categoryId = "beauty_salon", menu: "cut" | null = "cut") =>
  m1RowsToLifeOpsFeedback([{ handle: `lifeops:${categoryId}${menu ? `:${menu}` : ""}`, action: "done", acted_at: iso(deltaDays), source_kind: "lifeops" }]);

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
const dto = (inputs?: LifeOpsInputs, feedbackCadence?: readonly CadenceObservation[], realCadence?: readonly CadenceObservation[]) =>
  computeLifeOpsPreviewDto({ world: ws(), date: "2026-06-10", nowMinute: 800, nowMs: NOW_MS, inputs, feedbackCadence, realCadence });

describe("c20 — gate（①②③・default OFF・mainline 独立）", () => {
  it("①flags default OFF → gate false（query する consumer も存在しない=構造的 query 0）", () => {
    expect(PLAN_FLAGS.lifeopsRealdataReadonly).toBe(false);
    expect(PLAN_FLAGS.lifeopsCadenceReadonly).toBe(false);
    expect(isLifeOpsCadenceReadAllowed({ master: PLAN_FLAGS.lifeopsRealdataReadonly, cadence: PLAN_FLAGS.lifeopsCadenceReadonly, supabaseUrl: STAGING_URL })).toBe(false);
  });
  it("②production は flag ON でも false ③staging+master∧cadence でのみ true・mainline とは独立", () => {
    expect(isLifeOpsCadenceReadAllowed({ master: true, cadence: true, supabaseUrl: PROD_URL })).toBe(false);
    expect(isLifeOpsCadenceReadAllowed({ master: true, cadence: true, supabaseUrl: STAGING_URL })).toBe(true);
    expect(isLifeOpsCadenceReadAllowed({ master: true, cadence: false, supabaseUrl: STAGING_URL })).toBe(false);
    expect(isLifeOpsCadenceReadAllowed({ master: false, cadence: true, supabaseUrl: STAGING_URL })).toBe(false);
    expect(PLAN_FLAGS.lifeopsMainline).toBe(false); // 独立した別 flag（c20 では不使用）
  });
});

describe("c20 — DTO（confidence/freshness/source・⑤⑥）", () => {
  it("done → DTO: confidence=high・source=feedback_done・key 最新 1 件", () => {
    const obs = [...doneObs(-60), ...doneObs(-10)]; // 同 key 2 件 → 最新
    const dtos = feedbackDoneToRealCadence(obs, NOW_ISO);
    expect(dtos).toEqual([
      { categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-10), confidence: "high", source: "feedback_done", freshness: "fresh" },
    ]);
  });
  it("freshness: cut(42d 周期) は 3 倍=126d 境界で fresh/stale・spec なしは unknown", () => {
    expect(CADENCE_FRESHNESS_INTERVAL_FACTOR).toBe(3);
    expect(feedbackDoneToRealCadence(doneObs(-100), NOW_ISO)[0].freshness).toBe("fresh"); // 100 ≤ 126
    expect(feedbackDoneToRealCadence(doneObs(-200), NOW_ISO)[0].freshness).toBe("stale"); // 200 > 126
    expect(feedbackDoneToRealCadence(doneObs(-10, "tax_filing", null), NOW_ISO)[0].freshness).toBe("unknown"); // L-2 spec なし
  });
  it("accept/later/dismiss は DTO にならない（done のみ・c13 mirror）", () => {
    const rows = ["accept", "later", "dismiss"].map((action) => ({ handle: "lifeops:groceries", action, acted_at: iso(-5), source_kind: "lifeops" }));
    expect(feedbackDoneToRealCadence(m1RowsToLifeOpsFeedback(rows), NOW_ISO)).toEqual([]);
  });
  it("⑤DTO/変換出力 JSON に raw/user_id/id/source_ref/free text なし", () => {
    const dtos = feedbackDoneToRealCadence(doneObs(-10), NOW_ISO);
    expect(JSON.stringify(dtos)).not.toMatch(FORBIDDEN);
    expect(JSON.stringify(realCadenceToCadenceObservations(dtos))).not.toMatch(FORBIDDEN);
  });
  it("⑥辞書外 category/enum 外 menu は出口の roundtrip 再検証で drop・low confidence は流さない", () => {
    const forged = [
      { categoryId: "massage_parlor", menu: null, lastCompletedAtISO: iso(-5), confidence: "high", source: "feedback_done", freshness: "fresh" },
      { categoryId: "beauty_salon", menu: "perm", lastCompletedAtISO: iso(-5), confidence: "high", source: "feedback_done", freshness: "fresh" },
      { categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-5), confidence: "low", source: "structured_completion", freshness: "fresh" }, // low → 足切り
      { categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: "broken", confidence: "high", source: "feedback_done", freshness: "fresh" }, // 不正 ISO
      { categoryId: "groceries", menu: null, lastCompletedAtISO: iso(-3), confidence: "medium", source: "structured_completion", freshness: "fresh" }, // 正規（medium は通す）
    ] as unknown as readonly LifeOpsCadenceRealObservation[];
    expect(realCadenceToCadenceObservations(forged)).toEqual([{ categoryId: "groceries", menu: null, lastCompletedAtISO: iso(-3) }]);
  });
});

describe("c20 — merge（⑧⑨⑩⑫・c14 維持）", () => {
  it("⑧c14 feedbackToCadence は不変更で維持（done→1 件・accept→0 件）", () => {
    expect(feedbackToCadence(doneObs(-10)).length).toBe(1);
    expect(feedbackToCadence(m1RowsToLifeOpsFeedback([{ handle: "lifeops:groceries", action: "accept", acted_at: iso(-1), source_kind: "lifeops" }]))).toEqual([]);
  });
  it("⑨real と feedback の両 channel が候補生成に合流（別 key なら両方出る）", () => {
    const d = dto({}, [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-60) }], [{ categoryId: "eyebrow", lastCompletedAtISO: iso(-90) }]);
    const json = JSON.stringify(d);
    expect(json).toContain("美容院");
    expect(json).toContain("眉"); // real 由来も候補化
    expect(d.integrationMeta.feedbackCadenceCount).toBe(1);
    expect(d.integrationMeta.realCadenceCount).toBe(1);
    expect(d.integrationMeta.cadenceSourceConflictCount).toBe(0); // 別 key=衝突なし
  });
  it("⑩同一 key は latest 勝ち（real が新しければ real・feedback が新しければ feedback）+ 衝突 count=1", () => {
    const declared: LifeOpsInputs = { cadenceObservations: [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-60) }] };
    // real の done(-5d) が最新 → 周期内に戻り候補が消える（latest 勝ちの行動的証明）
    const dNewReal = dto(declared, [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-50) }], [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-5) }]);
    expect(JSON.stringify(dNewReal)).not.toContain("美容院");
    expect(dNewReal.integrationMeta.cadenceSourceConflictCount).toBe(1);
    // feedback の方が新しい（real は古い）→ feedback の -5d が勝ち、やはり候補は消える
    const dNewFeedback = dto(declared, [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-5) }], [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-50) }]);
    expect(JSON.stringify(dNewFeedback)).not.toContain("美容院");
    // 逆に両方古ければ候補は出る（latest でも beyond）
    const dBothOld = dto(declared, [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-55) }], [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-50) }]);
    expect(JSON.stringify(dBothOld)).toContain("美容院");
  });
  it("countCadenceKeyConflicts: 同 key 異 ISO のみ数える（同値/別 key は 0）", () => {
    const a: CadenceObservation[] = [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-5) }];
    expect(countCadenceKeyConflicts(a, [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-9) }])).toBe(1);
    expect(countCadenceKeyConflicts(a, [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-5) }])).toBe(0);
    expect(countCadenceKeyConflicts(a, [{ categoryId: "eyebrow", menu: null, lastCompletedAtISO: iso(-9) }])).toBe(0);
  });
  it("⑫0 件は静かに no-op（realCadence 省略/[] → DTO 完全一致・counts 0）", () => {
    expect(JSON.stringify(dto(undefined, [], []))).toBe(JSON.stringify(dto(undefined)));
    const d = dto(undefined);
    expect(d.integrationMeta.realCadenceCount).toBe(0);
    expect(d.integrationMeta.cadenceSourceConflictCount).toBe(0);
  });
});

describe("c20 — cap/候補変化（⑪⑬）", () => {
  it("⑪merge 後も raw input cap 作動（flood 60 期限 + real cadence 併用で rawDropped=10）", () => {
    const big = Array.from({ length: 60 }, () => ({ categoryId: "tax_filing" as const, deadlineISO: iso(5) }));
    const d = dto({ deadlineObservations: big }, [], [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-60) }]);
    expect(d.integrationMeta.rawDroppedCount).toBe(10);
    expect(JSON.stringify(d)).toContain("美容院"); // real merge 自体も有効
  });
  it("⑬raw row なしで real cadence だけから候補変化を観測（空 inputs → 美容院出現 + meta count）", () => {
    const base = dto({});
    expect(JSON.stringify(base)).not.toContain("美容院");
    const fed = dto({}, [], [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-60) }]);
    expect(JSON.stringify(fed)).toContain("美容院");
    expect(fed.integrationMeta.realCadenceCount).toBe(1);
  });
});

describe("c20 — 静的安全（④⑦⑭）", () => {
  const strip = (rel: string) =>
    fs.readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  it("④⑦source: 新規 DB reader なし（createClient/.from/fetch 0）・calendar/title/LLM/external 参照 0", () => {
    const code = strip("lib/plan/reality/lifeops/lifeops-cadence-real-source.ts").toLowerCase();
    for (const banned of ["createclient", ".from(", "fetch(", "@supabase", "server-only", "process.env", "calendar", "title", "event_name", "llm", "openai", "anthropic"]) {
      expect(code).not.toContain(banned);
    }
  });
  it("⑭no write / no notification / no PlanClient: source+page+actions に insert/update/delete/notification 0・PlanClient import 0", () => {
    for (const rel of [
      "lib/plan/reality/lifeops/lifeops-cadence-real-source.ts",
      "app/(culcept)/plan/dev-reality-pipeline/page.tsx",
      "app/(culcept)/plan/dev-reality-pipeline/actions.ts",
    ]) {
      const code = strip(rel);
      for (const banned of [".insert(", ".update(", ".delete(", ".upsert(", ".rpc(", "notification", "PlanClient"]) {
        expect(code).not.toContain(banned);
      }
    }
  });
  it("page/actions: 表示と照合が同一の real cadence 合成を使う（gate 関数 + 変換 chain が両方に存在）", () => {
    for (const rel of ["app/(culcept)/plan/dev-reality-pipeline/page.tsx", "app/(culcept)/plan/dev-reality-pipeline/actions.ts"]) {
      const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(src).toContain("isLifeOpsCadenceReadAllowed");
      expect(src).toContain("feedbackDoneToRealCadence");
      expect(src).toContain("realCadenceToCadenceObservations");
      expect(src).toContain("PLAN_FLAGS.lifeopsCadenceReadonly");
    }
  });
});
