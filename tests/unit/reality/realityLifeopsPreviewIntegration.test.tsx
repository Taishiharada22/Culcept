/**
 * Life Ops Preview Integration（fixture operator preview・no real data / no write）unit。
 *   3 VM（Briefing/Moment/Reflection）が operator preview に並ぶ contract: DTO allowlist・重複制御・文言安全・render。
 *
 * 設計: docs/life-ops-preview-integration-contract.md。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "fs";
import * as path from "path";
import { computeLifeOpsPreviewDto, fixtureLifeOpsInputs, type LifeOpsPreviewClientDto } from "@/lib/plan/reality/lifeops/lifeops-preview-compute";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { RealityPipelinePreviewClient, type RealityPipelinePreviewMeta } from "@/app/(culcept)/plan/dev-reality-pipeline/RealityPipelinePreviewClient";
import type { RealityPipelineEnvelope } from "@/lib/plan/reality/orchestration/reality-pipeline";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";

// 文言禁止（CEO 指定 + 既存断定禁止 + A-4-c6「今すぐ」）と PII 系。「確定」は完了状態の語のみ禁止（辞書 label「確定申告」は除外）。
const BANNED_WORDS = /予定に入れた|通知する|通知します|確定(?!申告)|やるべき|すべき|必ず|今すぐ|しなければ|してください/;
const FORBIDDEN = /seed_?ref|utterance|personality|trait|@[a-z]|\b\d{10,}\b|[0-9a-f]{8}-[0-9a-f]{4}/i;
const NOW_MS = Date.parse("2026-06-10T09:00:00+09:00");

function ws(): WorldState {
  return {
    date: "2026-06-10",
    nowMinute: 620, // 朝窓 open（重複制御の検証に最適）
    todaySchedule: [],
    availableWindows: [
      { startMinute: 600, endMinute: 660, meaning: null },
      { startMinute: 780, endMinute: 960, meaning: null },
    ],
    context: null,
    mobility: null,
    permissionLevel: 2,
  };
}

function dto(nowMinute = 620): LifeOpsPreviewClientDto {
  return computeLifeOpsPreviewDto({ world: { ...ws(), nowMinute }, date: "2026-06-10", nowMinute, nowMs: NOW_MS });
}

describe("integration — DTO compute（fixture chain）", () => {
  it("briefing（headline+3 tiers）と moment が 1 DTO に揃う・fixtureNotice 明示", () => {
    const d = dto();
    expect(d.briefing.headline.length).toBeGreaterThan(0);
    expect(d.briefing.tiers.map((t) => t.tier)).toEqual(["protect", "easy", "push"]);
    expect(d.fixtureNotice).toBe(true);
    expect(d.moment).toBeDefined();
  });
  it("fixture 入力は nowMs 相対の決定論（実データ源 0）", () => {
    const a = fixtureLifeOpsInputs(NOW_MS);
    expect(a.deadlineObservations![0].categoryId).toBe("tax_filing");
    expect(JSON.stringify(computeLifeOpsPreviewDto({ world: ws(), date: "2026-06-10", nowMinute: 620, nowMs: NOW_MS }))).toBe(
      JSON.stringify(computeLifeOpsPreviewDto({ world: ws(), date: "2026-06-10", nowMinute: 620, nowMs: NOW_MS })),
    );
  });
});

describe("integration — DTO allowlist（実体を渡さない）", () => {
  it("top-level / tier / highlight の key 集合が契約どおり", () => {
    const d = dto();
    expect(Object.keys(d).sort()).toEqual(["briefing", "fixtureNotice", "integrationMeta", "moment"].sort());
    expect(Object.keys(d.briefing).sort()).toEqual(["alsoAvailableLine", "cautions", "headline", "tiers"].sort());
    for (const t of d.briefing.tiers) {
      expect(Object.keys(t).sort()).toEqual(["highlights", "line", "overflowLine", "tier", "tierLabel"].sort());
      for (const h of t.highlights) {
        // A-4-c16/c17: 代表 tier のみ actions+candidateKey（lookup 専用・非 handle）。action DTO も閉集合。
        expect([
          ["label", "phrase", "windowHint"].sort().join(),
          ["actions", "candidateKey", "label", "phrase", "windowHint"].sort().join(),
        ]).toContain(Object.keys(h).sort().join());
        if (h.candidateKey !== undefined) expect(h.candidateKey).not.toContain("lifeops:"); // handle 形式ではない
        for (const a of h.actions ?? []) {
          expect(Object.keys(a).sort()).toEqual(["action", "cadenceEligible", "previewOnly", "requiresConfirmation", "uiLabel"].sort());
        }
      }
    }
    expect(Object.keys(d.moment).sort()).toEqual(["silencedCount", "suppression", "surfaced"].sort());
  });
  it("candidate 実体/dueReason/placeQuery/coarseMinutes/分数/コード列/HH:MM を渡さない", () => {
    const json = JSON.stringify(dto());
    for (const banned of ["candidate", "dueReason", "placeQuery", "coarseMinutes", "suppressedReasons", "startMinute", "title"]) {
      expect(json).not.toContain(`"${banned}"`);
    }
    expect(json).not.toMatch(/\d{1,2}:\d{2}/); // HH:MM を出さない（窓は午前/午後/夕方の粗さ）
    expect(json).not.toMatch(FORBIDDEN);
    expect(json).not.toContain("スーパー"); // placeQuery hint 語
  });
});

describe("integration — 重複制御（§3: 朝言ったことを今もう一度言わない）", () => {
  it("briefing 代表の key が moment exclude に入り、moment は代表と別の候補 or 沈黙", () => {
    const d = dto(620); // 朝窓 open: 代表（確定申告ほか）は exclude 済み
    expect(d.integrationMeta.momentExcludedCount).toBe(d.integrationMeta.briefingRepresentativeCount);
    expect(d.integrationMeta.momentExcludedCount).toBeGreaterThan(0);
    const recTier = d.briefing.tiers.find((t) => t.highlights.length > 0);
    const repLabels = new Set((recTier?.highlights ?? []).map((h) => h.label));
    if (d.moment.surfaced) {
      expect(repLabels.has(d.moment.surfaced.label)).toBe(false); // 朝の代表を再提示しない
    } else {
      expect(d.moment.silencedCount).toBeGreaterThan(0); // 全て既出/窓外なら沈黙（連打しない）
    }
  });
  it("deadline fallback も exclude に従う（朝に出した期限を moment で連打しない）", () => {
    const d = dto(620);
    if (d.moment.surfaced) expect(d.moment.surfaced.label).not.toBe("確定申告");
  });
  it("★A-4-c6 policy: overdue/due-today の期限だけは朝に出ていても Moment が一度だけ拾える", () => {
    // 期限超過 1 件のみの入力 → 代表=確定申告（urgent）→ exclude されない → 午後窓で window_open 再提示。
    const d = computeLifeOpsPreviewDto({
      world: { ...ws(), nowMinute: 800 },
      date: "2026-06-10",
      nowMinute: 800,
      nowMs: NOW_MS,
      inputs: { deadlineObservations: [{ categoryId: "tax_filing", deadlineISO: "2026-06-09T00:00:00+09:00" }] },
    });
    const reps = d.briefing.tiers.find((t) => t.highlights.length > 0)!.highlights.map((h) => h.label);
    expect(reps).toContain("確定申告"); // 朝に出ている
    expect(d.moment.surfaced).not.toBeNull(); // それでも一度だけ拾う（urgent 例外）
    expect(d.moment.surfaced!.label).toBe("確定申告");
    expect(d.integrationMeta.momentExcludedCount).toBeLessThan(Math.max(1, d.integrationMeta.briefingRepresentativeCount)); // urgent は exclude 対象外
    expect(d.briefing.headline).toContain("期日を過ぎています"); // escalation も同時に作動
  });
});

describe("integration — 文言安全（§4）", () => {
  it("DTO 全文: 「予定に入れた/通知する/確定/やるべき」等の禁止語なし", () => {
    for (const nowMinute of [575, 620, 800, 950]) {
      expect(JSON.stringify(dto(nowMinute))).not.toMatch(BANNED_WORDS);
    }
  });
});

describe("integration — render（operator preview に 3 VM が並ぶ）", () => {
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
  it("section 名・fixture 明示文・headline・moment 行・重複制御 row が render される", () => {
    const html = renderToStaticMarkup(<RealityPipelinePreviewClient envelope={envelope} meta={meta} lifeOpsPreview={dto()} />);
    expect(html).toContain("Life Ops Preview（fixture 入力・観測のみ）");
    expect(html).toContain("実データ源には接続していません（fixture）。予定には書き込みません。通知もしません。");
    expect(html).toContain("守る案");
    expect(html).toContain("Moment（今この瞬間・cap 1）");
    expect(html).toContain("重複制御（朝の代表→今は除外）");
  });
  it("HTML: button/通知導線/禁止語/PII なし・prop なしなら section 不在", () => {
    const html = renderToStaticMarkup(<RealityPipelinePreviewClient envelope={envelope} meta={meta} lifeOpsPreview={dto()} />);
    expect(html).not.toContain("<button");
    expect(html).not.toMatch(BANNED_WORDS);
    expect(html).not.toMatch(FORBIDDEN);
    const without = renderToStaticMarkup(<RealityPipelinePreviewClient envelope={envelope} meta={meta} />);
    expect(without).not.toContain("Life Ops Preview");
  });
});

describe("★A-4-c7 — 5層cap dry-run（fixture pipeline で cap が安全に効く）", () => {
  const OLD = "2026-03-01T10:00:00+09:00";
  /** 多カテゴリ flood inputs（collector 経由で pool cap を超えさせる）。 */
  const FLOOD = {
    deadlineObservations: [
      { categoryId: "tax_filing", deadlineISO: "2026-06-15T00:00:00+09:00" },
      { categoryId: "license_renewal", deadlineISO: "2026-06-30T00:00:00+09:00" },
      { categoryId: "passport_renewal", deadlineISO: "2026-07-20T00:00:00+09:00" },
    ],
    upcomingEvents: [{ kind: "interview" as const, startISO: "2026-06-13T10:00:00+09:00" }],
    cadenceObservations: [
      { categoryId: "beauty_salon", menu: "cut" as const, lastCompletedAtISO: OLD },
      { categoryId: "eyebrow", lastCompletedAtISO: OLD },
      { categoryId: "nail", lastCompletedAtISO: OLD },
      { categoryId: "eyelash", lastCompletedAtISO: OLD },
      { categoryId: "bodywork", lastCompletedAtISO: OLD },
      { categoryId: "dental", lastCompletedAtISO: OLD },
      { categoryId: "groceries", lastCompletedAtISO: OLD },
      { categoryId: "daily_necessities", lastCompletedAtISO: OLD },
    ],
  };
  const floodDto = (nowMinute: number) =>
    computeLifeOpsPreviewDto({ world: { ...ws(), nowMinute }, date: "2026-06-10", nowMinute, nowMs: NOW_MS, inputs: FLOOD });
  it("pool cap 配線下でも deadline 代表と push 差分は残る（現行辞書では dedup により cap 超過は構造的に不発=droppedは0で可視）", () => {
    // 注: collector の (category,menu) dedup + 現行 L-1/L-2 辞書では chain 候補は最大 ~10 件 → pool cap(12) は
    //   **実データ規模（辞書拡張/recurring 期限）への防御**。cap が縛る挙動自体は pool-cap helper の flood test(19件) が証明。
    const d = floodDto(800);
    expect(d.integrationMeta.poolDroppedCount).toBe(0); // 黙って消えたものが無いことが count で見える
    const reps = d.briefing.tiers.find((t) => t.highlights.length > 0)!.highlights.map((h) => h.label);
    expect(reps).toContain("確定申告"); // deadline は cap 配線下でも生存
    const pushTier = d.briefing.tiers.find((t) => t.tier === "push")!;
    const easyTier = d.briefing.tiers.find((t) => t.tier === "easy")!;
    expect(`${pushTier.line}|${pushTier.overflowLine ?? ""}`).not.toBe(`${easyTier.line}|${easyTier.overflowLine ?? ""}`); // easy≠push 維持
  });
  it("representative ≤3・各 tier line の件数 ≤ tier cap(5)・overflow line は総数表記", () => {
    const d = floodDto(800);
    for (const t of d.briefing.tiers) {
      expect(t.highlights.length).toBeLessThanOrEqual(3);
      const m = t.line.match(/には(\d+)件入ります/);
      if (m) expect(Number(m[1])).toBeLessThanOrEqual(5);
      if (t.overflowLine) expect(t.overflowLine).toMatch(/入りきらない候補が\d+件あります/);
    }
  });
  it("cap が効いても Moment は生きている（発火 or 理由つき沈黙・crash しない）", () => {
    const d = floodDto(800);
    expect(d.moment.surfaced !== null || d.moment.silencedCount > 0).toBe(true);
  });
  it("cap が効いても focus 沈黙は維持（620=focus_block）", () => {
    const d = floodDto(620);
    expect(d.moment.surfaced).toBeNull();
    expect(d.moment.suppression).toBe("focus_block");
  });
  it("raw input cap: 同一カテゴリ大量観測でも rawDroppedCount で刻まれ dedup で 1 候補", () => {
    const big = Array.from({ length: 60 }, () => ({ categoryId: "tax_filing", deadlineISO: "2026-06-15T00:00:00+09:00" }));
    const d = computeLifeOpsPreviewDto({ world: ws(), date: "2026-06-10", nowMinute: 620, nowMs: NOW_MS, inputs: { deadlineObservations: big } });
    expect(d.integrationMeta.rawDroppedCount).toBe(10); // 60-50
  });
  it("実データ flag 群は dormant（default OFF・本 slice で読み取り実装なし）", () => {
    expect(PLAN_FLAGS.lifeopsRealdataReadonly).toBe(false);
    expect(PLAN_FLAGS.lifeopsCadenceReadonly).toBe(false);
    expect(PLAN_FLAGS.lifeopsCalendarEventReadonly).toBe(false);
    expect(PLAN_FLAGS.lifeopsDeadlineReadonly).toBe(false);
    expect(PLAN_FLAGS.lifeopsFeedbackReadonly).toBe(false);
  });
});

describe("integration — source contract（§5）", () => {
  const COMPUTE = fs
    .readFileSync(path.join(process.cwd(), "lib/plan/reality/lifeops/lifeops-preview-compute.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
  it("compute: no DB/fetch/server-only/Date.now/notification/R4 import/real reader", () => {
    for (const banned of ["supabase", "fetch(", "server-only", "Date.now", "notification", "trigger-model", "trigger-evaluator", "createSupabase"]) {
      expect(COMPUTE.toLowerCase()).not.toContain(banned.toLowerCase());
    }
  });
  it("client: fetch/onClick/useState なし・button は server action form submit のみ（A-4-c17）", () => {
    const raw = fs.readFileSync(path.join(process.cwd(), "app/(culcept)/plan/dev-reality-pipeline/RealityPipelinePreviewClient.tsx"), "utf8");
    expect(raw).not.toContain("fetch(");
    expect(raw).not.toContain("onClick");
    expect(raw).not.toContain("useState");
    // <button は type="submit"（form action 経由）と 1:1（任意 handler の button を作らない）。
    const buttons = raw.split("<button").length - 1;
    const submits = raw.split('type="submit"').length - 1;
    expect(buttons).toBe(submits);
    expect(raw).not.toContain('value="done"'); // done を submit value にしない（押せない契約）
  });
});
