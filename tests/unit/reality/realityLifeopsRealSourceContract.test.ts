/**
 * A-4-c26 — Real Source Contract + Sparse Representative Policy（pure・fake のみ）unit。
 *   GPT 18 lock: ①②structured deadline/cadence→valid DTO ③unknown drop ④invalid ISO drop ⑤raw/PII 非搬出
 *   ⑥calendar title 推定なし ⑦low confidence は強く代表化しない ⑧fixture は production 代表にならない
 *   ⑨real-only 0 件→card null ⑩valid deadline 1 件→代表になれる ⑪cycle 1 件（push のみ）→fallback 最大 1
 *   ⑫fallback max1 ⑬低圧文言（やるべき系なし）⑭accept 不在 ⑮done/later/dismiss 維持 ⑯page/actions 同一 policy
 *   ⑰production deny 維持 ⑱suite/tsc（suite 側）。
 *
 * 設計: docs/life-ops-real-source-contract-a4-c26-mini-design.md。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  structuredDeadlinesToObservations,
  structuredCadenceToObservations,
  deriveLifeOpsOccurrenceKey,
  type LifeOpsStructuredDeadlineSource,
  type LifeOpsStructuredCadenceSource,
} from "@/lib/plan/reality/lifeops/lifeops-structured-source";
import {
  buildLifeOpsMainlineCardDto,
  selectLifeOpsMainlineRepresentatives,
  selectLifeOpsSparseFallback,
  routeLifeOpsMainlineActionRequest,
  LIFEOPS_SPARSE_FALLBACK_PHRASE,
} from "@/lib/plan/reality/lifeops/lifeops-mainline-card";
import { resolveLifeOpsSourceMode, baseLifeOpsInputsForMode } from "@/lib/plan/reality/lifeops/lifeops-source-policy";
import { computeLifeOpsPreviewModel } from "@/lib/plan/reality/lifeops/lifeops-preview-compute";
import { isLifeOpsMainlineAllowed } from "@/lib/plan/reality/lifeops/lifeops-mainline-gate";
import { isLifeOpsFeedbackWriteAllowed } from "@/lib/plan/reality/lifeops/lifeops-feedback-write";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";
import type { LifeOpsInputs } from "@/lib/lifeops/candidate-collector";

const PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
const NOW_MS = Date.parse("2026-06-10T09:00:00+09:00");
const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (d: number) => new Date(NOW_MS + d * DAY_MS).toISOString();
const FORBIDDEN = /seed_?ref|utterance|personality|trait|user_id|"id"|source_ref|raw|@[a-z]|\b\d{10,}\b|[0-9a-f]{8}-[0-9a-f]{4}/i;
const BANNED_PRESSURE = /やるべき|すべき|必ず|今すぐ|しなければ|してください/;

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
/** real_only の mainline model（base 空 + 注入 inputs を real とみなす）。 */
const realModel = (inputs: LifeOpsInputs) =>
  computeLifeOpsPreviewModel({ world: ws(), date: "2026-06-10", nowMinute: 800, nowMs: NOW_MS, inputs });

describe("c26 Part1 — structured source contract（①②③④⑤⑥⑦）", () => {
  const deadline = (over: Partial<LifeOpsStructuredDeadlineSource> = {}): LifeOpsStructuredDeadlineSource => ({
    categoryId: "tax_filing", menu: null, dueAtISO: iso(5), sourceKind: "user_structured_deadline", confidence: "high", ...over,
  });
  const cadence = (over: Partial<LifeOpsStructuredCadenceSource> = {}): LifeOpsStructuredCadenceSource => ({
    categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-60), sourceKind: "user_structured_cadence", confidence: "high", ...over,
  });
  it("①deadline source → DeadlineObservation（enum+ISO のみ）", () => {
    expect(structuredDeadlinesToObservations([deadline()])).toEqual([{ categoryId: "tax_filing", deadlineISO: iso(5) }]);
  });
  it("②cadence source → CadenceObservation（menu/履歴 null 許容）", () => {
    expect(structuredCadenceToObservations([cadence()])).toEqual([{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-60) }]);
    expect(structuredCadenceToObservations([cadence({ lastCompletedAtISO: null })])).toEqual([{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: null }]);
  });
  it("③unknown category/enum 外 menu drop ④invalid ISO drop", () => {
    expect(structuredDeadlinesToObservations([deadline({ categoryId: "massage_parlor" as never })])).toEqual([]);
    expect(structuredCadenceToObservations([cadence({ menu: "perm" as never })])).toEqual([]);
    expect(structuredDeadlinesToObservations([deadline({ dueAtISO: "not-a-date" })])).toEqual([]);
    expect(structuredCadenceToObservations([cadence({ lastCompletedAtISO: "broken" })])).toEqual([]);
  });
  it("⑦low confidence は流さない（deadline/cadence とも）・medium は通す", () => {
    expect(structuredDeadlinesToObservations([deadline({ confidence: "low" })])).toEqual([]);
    expect(structuredCadenceToObservations([cadence({ confidence: "low" })])).toEqual([]);
    expect(structuredDeadlinesToObservations([deadline({ confidence: "medium" })]).length).toBe(1);
  });
  it("⑤出力 JSON に free text/raw/user_id/id/source_ref なし・occurrenceKey 自動導出は非 PII 構造キー", () => {
    const obs = structuredDeadlinesToObservations([deadline()]);
    expect(JSON.stringify(obs)).not.toMatch(FORBIDDEN);
    expect(deriveLifeOpsOccurrenceKey("tax_filing", null, iso(5))).toBe(`tax_filing:${iso(5).slice(0, 10)}`); // c32: 空 menu は segment ごと省略（:: なし）
  });
  it("⑥static: contract file に calendar/title/event_name/LLM/fetch/URL 解析なし（pure）", () => {
    const code = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/lifeops/lifeops-structured-source.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n").toLowerCase();
    for (const banned of ["calendar", "title", "event_name", "llm", "openai", "fetch(", "@supabase", "createclient", "process.env", "new url"]) {
      expect(code).not.toContain(banned);
    }
  });
});

describe("c26 Part2 — sparse representative policy（⑧⑨⑩⑪⑫⑬⑭⑮）", () => {
  const PROD_MODE = resolveLifeOpsSourceMode({ supabaseUrl: PROD_URL });
  it("⑨real-only source 0 件 → card null（c25 維持）", () => {
    expect(buildLifeOpsMainlineCardDto(realModel(baseLifeOpsInputsForMode(PROD_MODE) ?? {}), PROD_MODE)).toBeNull();
  });
  it("⑩real deadline 1 件（structured 正規化経由）→ 代表になれる（card 非 null・1 件）", () => {
    const obs = structuredDeadlinesToObservations([
      { categoryId: "tax_filing", menu: null, dueAtISO: iso(5), sourceKind: "user_structured_deadline", confidence: "high" },
    ]);
    const card = buildLifeOpsMainlineCardDto(realModel({ deadlineObservations: obs }), "real_only");
    expect(card).not.toBeNull();
    expect(card!.items.length).toBe(1);
    expect(card!.items[0].label).toBe("確定申告");
  });
  it("⑪cycle 1 件（push tier のみ・c25 finding 再現系）→ real_only では fallback で代表 1 件・低圧文言", () => {
    const obs = structuredCadenceToObservations([
      { categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-60), sourceKind: "user_structured_cadence", confidence: "high" },
    ]);
    const model = realModel({ cadenceObservations: obs });
    expect(model.repCandidates.length).toBe(0); // 代表 tier は空（c25 実測の再現）
    const card = buildLifeOpsMainlineCardDto(model, "real_only");
    expect(card).not.toBeNull();
    expect(card!.items.length).toBe(1); // ⑫max 1
    expect(card!.items[0].label).toBe("美容院");
    expect(card!.items[0].phrase).toBe(LIFEOPS_SPARSE_FALLBACK_PHRASE.cycle); // 低圧固定句
  });
  it("⑧fixture は production 代表にならない: fixture_allowed では fallback 自体が無効（reps 空→card null）", () => {
    const fixtureModeEmptyReps = realModel({ cadenceObservations: [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-60) }] });
    expect(selectLifeOpsMainlineRepresentatives(fixtureModeEmptyReps, "fixture_allowed")).toEqual([]); // fallback は real_only 限定
    expect(buildLifeOpsMainlineCardDto(fixtureModeEmptyReps, "fixture_allowed")).toBeNull();
  });
  it("⑫複数 real 候補でも fallback は 1 件のみ・deadline 優先（daysUntil 昇順）", () => {
    const inputs: LifeOpsInputs = {
      deadlineObservations: structuredDeadlinesToObservations([
        { categoryId: "passport_renewal", menu: null, dueAtISO: iso(40), sourceKind: "user_structured_deadline", confidence: "high" },
        { categoryId: "license_renewal", menu: null, dueAtISO: iso(20), sourceKind: "user_structured_deadline", confidence: "high" },
      ]),
      cadenceObservations: [{ categoryId: "eyebrow", lastCompletedAtISO: iso(-90) }],
    };
    const model = realModel(inputs);
    if (model.repCandidates.length === 0) {
      const fb = selectLifeOpsSparseFallback(model.pooledCandidates);
      expect(fb).not.toBeNull();
      expect(fb!.category).toBe("license_renewal"); // 期日が近い deadline を優先
      expect(selectLifeOpsMainlineRepresentatives(model, "real_only").length).toBe(1);
    } else {
      expect(buildLifeOpsMainlineCardDto(model, "real_only")!.items.length).toBeLessThanOrEqual(3); // 通常経路でも上限維持
    }
  });
  it("⑬低圧文言は督促語なし ⑭accept 不在 ⑮done/later/dismiss のみ（fallback item でも維持）", () => {
    expect(LIFEOPS_SPARSE_FALLBACK_PHRASE.deadline).not.toMatch(BANNED_PRESSURE);
    expect(LIFEOPS_SPARSE_FALLBACK_PHRASE.cycle).not.toMatch(BANNED_PRESSURE);
    const card = buildLifeOpsMainlineCardDto(
      realModel({ cadenceObservations: [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-60) }] }),
      "real_only",
    )!;
    expect(card.items[0].actions.map((a) => a.action).sort()).toEqual(["dismiss", "done", "later"]);
    expect(JSON.stringify(card)).not.toContain("採用");
    expect(JSON.stringify(card)).not.toMatch(FORBIDDEN);
  });
  it("fallback 候補は action 照合にも乗る（押せるのに unknown にならない・偽造 key は引き続き拒否）", () => {
    const model = realModel({ cadenceObservations: [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: iso(-60) }] });
    const reps = selectLifeOpsMainlineRepresentatives(model, "real_only");
    expect(routeLifeOpsMainlineActionRequest(reps, "beauty_salon:cut", "later", null).kind).toBe("write");
    expect(routeLifeOpsMainlineActionRequest(reps, "tax_filing:", "later", null)).toEqual({ kind: "reject", reason: "unknown_candidate" });
    expect(routeLifeOpsMainlineActionRequest(reps, "beauty_salon:cut", "accept", null)).toEqual({ kind: "reject", reason: "invalid_action" });
  });
});

describe("c26 — 配線整合・gate（⑯⑰）", () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  it("⑯page は builder(mode)・action は同 selector を使用（表示と照合の代表集合が同一）", () => {
    const page = read("app/(culcept)/plan/page.tsx");
    expect(page).toContain("buildLifeOpsMainlineCardDto(model, sourceMode)");
    const action = read("app/(culcept)/plan/_actions/lifeops-feedback-mainline.ts");
    expect(action).toContain("selectLifeOpsMainlineRepresentatives(model, sourceMode)");
    expect(action).toContain("routeLifeOpsMainlineActionRequest(representatives,");
  });
  it("⑰production deny 維持（mainline/writer gate は flag ON でも false・staging は従来どおり）", () => {
    expect(isLifeOpsMainlineAllowed({ mainline: true, planRouteLive: true, supabaseUrl: PROD_URL })).toBe(false);
    expect(isLifeOpsFeedbackWriteAllowed({ master: true, write: true, supabaseUrl: PROD_URL })).toBe(false);
    expect(isLifeOpsMainlineAllowed({ mainline: true, planRouteLive: true, supabaseUrl: STAGING_URL })).toBe(true);
  });
});
