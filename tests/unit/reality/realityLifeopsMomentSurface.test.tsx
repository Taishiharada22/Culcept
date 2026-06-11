/**
 * A-4-c39 — Life Ops Moment Read-only Surface（「今の一枚」・staging gated・純 read-only）unit + render contract。
 *   GPT 10 lock: ①default OFF→card 不在 ②production は mainline gate deny で不可視 ③staging+両 flag∧surfaced→表示
 *   ④surfaced null→card ごと不在（沈黙維持）⑤最大 1 件 ⑥button/form/link/onClick 0 ⑦Morning 代表との重複なし
 *   ⑧R4/writer/notification import 0 ⑨BANNED_WORDS/FORBIDDEN ⑩既存 tab/proposals 不干渉。
 *
 * 設計: docs/life-ops-moment-readonly-surface-a4-c39-mini-design.md。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "fs";
import * as path from "path";
import { LifeOpsMomentCard } from "@/app/(culcept)/plan/LifeOpsMomentCard";
import { computeLifeOpsPreviewModel } from "@/lib/plan/reality/lifeops/lifeops-preview-compute";
import { isLifeOpsMainlineAllowed } from "@/lib/plan/reality/lifeops/lifeops-mainline-gate";
import { PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";

const NOW_MS = Date.parse("2026-06-10T09:00:00+09:00");
const BANNED_WORDS = /予定に入れた|通知する|通知します|確定(?!申告)|やるべき|すべき|必ず|今すぐ|しなければ|してください/;
const FORBIDDEN = /seed_?ref|utterance|personality|trait|user_id|source_ref|@[a-z]|\b\d{10,}\b|[0-9a-f]{8}-[0-9a-f]{4}/i;

function ws(nowMinute: number): WorldState {
  return {
    date: "2026-06-10", nowMinute, todaySchedule: [],
    availableWindows: [
      { startMinute: 600, endMinute: 660, meaning: null },
      { startMinute: 780, endMinute: 960, meaning: null },
    ],
    context: null, mobility: null, permissionLevel: 2,
  } as WorldState;
}
const model = (nowMinute: number) => computeLifeOpsPreviewModel({ world: ws(nowMinute), date: "2026-06-10", nowMinute, nowMs: NOW_MS });
const render = (m: { phrase: string; cautions: readonly string[] }) => renderToStaticMarkup(<LifeOpsMomentCard moment={m} />);

describe("c39 — gate（①②③・default OFF / production deny）", () => {
  it("①LIFEOPS_MAINLINE_MOMENT は default OFF（dormant）", () => {
    expect(PLAN_FLAGS.lifeopsMainlineMoment).toBe(false);
  });
  it("②production は mainline gate で恒久 deny（moment flag 単独では何も開かない）③staging で mainline 許可", () => {
    expect(isLifeOpsMainlineAllowed({ mainline: true, planRouteLive: true, supabaseUrl: `https://${PRODUCTION_PROJECT_REF}.supabase.co` })).toBe(false);
    expect(isLifeOpsMainlineAllowed({ mainline: true, planRouteLive: true, supabaseUrl: `https://${STAGING_PROJECT_REF}.supabase.co` })).toBe(true);
  });
  it("page: 表示条件 = mainline gate ∧ MOMENT flag ∧ surfaced 非 null（static）", () => {
    const raw = fs.readFileSync(path.join(process.cwd(), "app/(culcept)/plan/page.tsx"), "utf8");
    expect(raw).toContain("PLAN_FLAGS.lifeopsMainlineMoment && model.dto.moment.surfaced");
    expect(raw).toContain("model.dto.moment.surfaced.phrase");
    expect(raw).toContain("model.dto.moment.surfaced.cautions");
    // page は phrase/cautions だけ抽出（kind/suppression/silencedCount を props に乗せない）— comment 除去後の code で検証。
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    expect(code).not.toContain("moment.surfaced.kind");
    expect(code).not.toContain("silencedCount");
    expect(code).not.toContain("lifeOpsMoment = { phrase: model.dto.moment.surfaced.phrase, cautions: model.dto.moment.surfaced.cautions, kind"); // kind を props に足さない
  });
});

describe("c39 — VM 由来（④⑤⑦・compute は既に moment を持つ）", () => {
  it("⑤moment は単数 surfaced（cap 1）・shape は phrase/cautions/kind/silencedCount/suppression", () => {
    const dto = model(800).dto;
    expect(Object.keys(dto.moment).sort()).toEqual(["silencedCount", "suppression", "surfaced"].sort());
    if (dto.moment.surfaced) {
      expect(typeof dto.moment.surfaced.phrase).toBe("string"); // 単数（配列でない）
    }
  });
  it("④focus 帯（620=focus_block）では surfaced=null → page は moment を渡さない（沈黙維持）", () => {
    const dto = model(620).dto;
    expect(dto.moment.surfaced).toBeNull();
    expect(dto.moment.suppression).toBe("focus_block");
  });
  it("⑦重複制御: surfaced の label は Morning 代表（rail 付き highlight）labels に含まれない（compute 内 excludeKeys）", () => {
    const dto = model(800).dto;
    if (dto.moment.surfaced) {
      const repLabels = new Set(dto.briefing.tiers.flatMap((t) => t.highlights.filter((h) => !!h.candidateKey).map((h) => h.label)));
      expect(repLabels.has(dto.moment.surfaced.label)).toBe(false);
    }
  });
});

describe("c39 — render contract（③⑥⑨・純 read-only）", () => {
  it("③surfaced を渡すと「今の一枚」+phrase が表示・⑨BANNED_WORDS/FORBIDDEN なし", () => {
    const h = render({ phrase: "今なら「食料品の買い物」を入れやすそうです", cautions: [] });
    expect(h).toContain("lifeops-moment-card");
    expect(h).toContain("今の一枚");
    expect(h).toContain("今なら「食料品の買い物」を入れやすそうです");
    expect(h).not.toMatch(BANNED_WORDS);
    expect(h).not.toMatch(FORBIDDEN);
  });
  it("cautions があれば小さく表示・なければ非表示", () => {
    expect(render({ phrase: "p", cautions: ["予約時に指名を聞かれることがあります"] })).toContain("lifeops-moment-cautions");
    expect(render({ phrase: "p", cautions: [] })).not.toContain("lifeops-moment-cautions");
  });
  it("⑥button/form/link/onClick/input ゼロ（純観測面・disabled chip も置かない）", () => {
    const h = render({ phrase: "p", cautions: ["c"] });
    for (const banned of ["<button", "<form", "<a ", "<input", "onClick", "aria-disabled"]) {
      expect(h).not.toContain(banned);
    }
  });
});

describe("c39 — 静的安全（⑧⑩・配線/不干渉）", () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  it("⑧moment card: R4/trigger/writer/server action/notification/timer/polling の import・参照ゼロ", () => {
    const code = read("app/(culcept)/plan/LifeOpsMomentCard.tsx")
      .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n").toLowerCase();
    for (const banned of ["trigger", "writer", "feedbackaction", "server", "notification", "setinterval", "settimeout", "fetch(", "usestate", "useeffect", "onclick", "supabase"]) {
      expect(code).not.toContain(banned);
    }
  });
  it("⑩既存 tab に lifeOpsMoment 写像なし・PlanClient は条件 render 1 箇所（独立条件）", () => {
    for (const rel of ["app/(culcept)/plan/tabs/CalendarTab.tsx", "app/(culcept)/plan/tabs/FlowTab.tsx", "app/(culcept)/plan/tabs/MapTab.tsx"]) {
      expect(read(rel)).not.toContain("lifeOpsMoment");
    }
    const planClient = read("app/(culcept)/plan/PlanClient.tsx");
    expect(planClient).toContain("{lifeOpsMoment && (");
    expect(planClient).toContain("<LifeOpsMomentCard moment={lifeOpsMoment} />");
  });
});
