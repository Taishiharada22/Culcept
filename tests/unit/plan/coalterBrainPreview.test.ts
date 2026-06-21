/**
 * C4 — CoAlter Brain Preview core + adapter tests（**pure・DB なし・保存なし・full pipeline 非呼出**）
 *
 * 設計正本: docs/coalter-brain-newsession-bridge-migration-gap-design.md（§4-B/§10）
 * 検証: adapter 写像 / preview 決定論 / theme 反応 / solo / insufficient / bounded surface /
 *   DB・Supabase 不使用 / runCoAlterPipeline 非呼出。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  COALTER_TURN_SENDER,
  distinctParticipantSenders,
  mapNewSessionMessagesToTurns,
  type NewSessionMessageLike,
} from "@/lib/coalter/preview/newSessionTurnAdapter";
import { buildCoAlterBrainPreview } from "@/lib/coalter/preview/brainPreviewCore";

const strip = (raw: string) =>
  raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const ADAPTER_SRC = strip(readFileSync(resolve(process.cwd(), "lib/coalter/preview/newSessionTurnAdapter.ts"), "utf8"));
const CORE_SRC = strip(readFileSync(resolve(process.cwd(), "lib/coalter/preview/brainPreviewCore.ts"), "utf8"));

const m = (id: string, userId: string | null, body: string, kind: "chat" | "system_event" = "chat"): NewSessionMessageLike => ({
  id,
  author: userId ? { kind: "participant", userId } : { kind: "coalter" },
  kind,
  body,
  createdAt: "2026-07-01T10:00:00Z",
});

const TRAVEL = [
  m("t1", "P1", "来月、二人で温泉旅行に行きたいな。1泊2日くらいで。"),
  m("t2", "P2", "いいね。近場がいいな。"),
  m("t3", "P1", "予算は一人3万円くらい。"),
];
const FOOD = [
  m("f1", "P1", "今週末ご飯食べに行かない？"),
  m("f2", "P2", "イタリアンか和食がいいな。"),
];

describe("1. adapter: New session messages → ConversationTurn[]", () => {
  it("participant→userId / coalter→COALTER_TURN_SENDER・chat のみ・順序/body/id 保持", () => {
    const turns = mapNewSessionMessagesToTurns([
      m("a", "P1", "やあ"),
      m("b", null, "（CoAlter）"),
      m("c", "P2", "システム", "system_event"), // 除外される
    ]);
    expect(turns).toEqual([
      { id: "a", senderId: "P1", body: "やあ", createdAt: "2026-07-01T10:00:00Z" },
      { id: "b", senderId: COALTER_TURN_SENDER, body: "（CoAlter）", createdAt: "2026-07-01T10:00:00Z" },
    ]);
  });
  it("distinctParticipantSenders は coalter を除外し順序保持で distinct", () => {
    const turns = mapNewSessionMessagesToTurns([m("a", "P1", "x"), m("b", null, "y"), m("c", "P2", "z"), m("d", "P1", "w")]);
    expect(distinctParticipantSenders(turns)).toEqual(["P1", "P2"]);
  });
  it("空 / 非配列 → []", () => {
    expect(mapNewSessionMessagesToTurns([])).toEqual([]);
    // @ts-expect-error runtime 防御
    expect(mapNewSessionMessagesToTurns(null)).toEqual([]);
  });
});

describe("2. preview core: 脳の決定論コアで反応（DB/LLM/保存なし）", () => {
  it("旅行の会話 → theme=travel・bounded preview", () => {
    const r = buildCoAlterBrainPreview(TRAVEL);
    expect(r.status).toBe("preview");
    if (r.status !== "preview") throw new Error("preview 期待");
    expect(r.preview.theme).toBe("travel");
    expect(r.preview.turnsAnalyzed).toBe(3);
    expect(["low", "medium", "high"]).toContain(r.preview.constraintReadiness);
    expect(typeof r.preview.previewText).toBe("string");
    expect(r.preview.previewText.length).toBeGreaterThan(0);
  });
  it("食事の会話 → theme=food（旅行と別の反応＝会話に反応している）", () => {
    const food = buildCoAlterBrainPreview(FOOD);
    expect(food.status).toBe("preview");
    if (food.status !== "preview") throw new Error("preview 期待");
    expect(food.preview.theme).toBe("food");
    // 旅行 preview と異なる（反応が会話依存）
    expect(JSON.stringify(food)).not.toBe(JSON.stringify(buildCoAlterBrainPreview(TRAVEL)));
  });
  it("決定論: 同入力 → 同出力", () => {
    expect(JSON.stringify(buildCoAlterBrainPreview(TRAVEL))).toBe(JSON.stringify(buildCoAlterBrainPreview(TRAVEL)));
  });
  it("solo（participant 1）も preview を返す", () => {
    const r = buildCoAlterBrainPreview([m("s1", "P1", "ひとりで旅行に行こうかな。温泉でも。")]);
    expect(r.status).toBe("preview");
    if (r.status !== "preview") throw new Error("preview 期待");
    expect(r.preview.turnsAnalyzed).toBe(1);
  });
  it("participant chat なし（空 / coalter のみ / system_event のみ）→ insufficient", () => {
    expect(buildCoAlterBrainPreview([]).status).toBe("insufficient");
    expect(buildCoAlterBrainPreview([m("a", null, "coalter のみ")]).status).toBe("insufficient");
    expect(buildCoAlterBrainPreview([m("a", "P1", "sys", "system_event")]).status).toBe("insufficient");
  });
  it("bounded surface のみ（raw 内部 signal を出さない）", () => {
    const r = buildCoAlterBrainPreview(TRAVEL);
    if (r.status !== "preview") throw new Error("preview 期待");
    expect(Object.keys(r.preview).sort()).toEqual(["constraintReadiness", "hasStalemate", "kind", "previewText", "theme", "turnsAnalyzed"]);
    const json = JSON.stringify(r);
    for (const raw of ["caringIntensity", "extractedConstraints", "recentMessages", "constraintScore", "agreedConstraints", "emotionTags"]) {
      expect(json).not.toContain(raw);
    }
  });
});

describe("3. source-contract: DB/Supabase/full pipeline 不使用", () => {
  it("adapter / core は supabase/createClient/fetch/insert/DB を import/呼出しない", () => {
    for (const src of [ADAPTER_SRC, CORE_SRC]) {
      expect(src).not.toMatch(/@supabase\/|supabaseServer|createClient/);
      expect(src).not.toMatch(/\bfetch\(/);
      expect(src).not.toMatch(/\.from\(|\.insert\(|\.update\(|\.rpc\(/);
      expect(src).not.toMatch(/service_role|serviceRole/);
    }
  });
  it("preview core は runCoAlterPipeline / fetchRecentMessages（DB 経路）を呼ばない", () => {
    expect(CORE_SRC).not.toContain("runCoAlterPipeline");
    expect(CORE_SRC).not.toContain("fetchRecentMessages");
    // 再利用は DB 非依存の analyzeConversation のみ
    expect(CORE_SRC).toContain("analyzeConversation");
  });
  it("LLM/外部 retrieval を呼ばない", () => {
    for (const src of [ADAPTER_SRC, CORE_SRC]) {
      expect(src).not.toMatch(/anthropic|openai|generateProposal|googleapis/i);
    }
  });
});
