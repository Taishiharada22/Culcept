/**
 * Phase D rollback (CEO 2026-04-17)
 *
 * 旧 Phase D:
 *   transport を「都市圏=電車 / それ以外=車」で自動推論して plan_presented に直行。
 *
 * 現在（rollback）:
 *   transport は勝手に推論しない。外出判定されたら clarify で聞く。
 *   venue / withWhom / mood は従来通り（venue のみ auto-infer、他は unknown のまま non-blocking）。
 *
 * 本ファイルはその新しい契約を固定化する。
 */

import { describe, test, expect, beforeAll } from "vitest";
import {
  checkPlanIntakeSufficiency,
  checkSufficiency,
  extractDayConditions,
} from "@/lib/alter-morning/sufficiencyGate";
import {
  parseIntent,
  intentToPlanItems,
  preloadVocabulary,
} from "@/lib/alter-morning/intentParser";
import { processMorningMessage, createSession } from "@/lib/alter-morning/morningProtocol";

beforeAll(async () => {
  await preloadVocabulary();
});

function intakeFromText(text: string, userPrefecture?: string) {
  const intent = parseIntent(text);
  const items = intentToPlanItems(intent);
  const rawSufficiency = checkSufficiency(text, items);
  const dayConditions = extractDayConditions(text);
  return checkPlanIntakeSufficiency(rawSufficiency, intent, items, dayConditions, text, userPrefecture);
}

// ----------------------------------------------------------------
// 1. Transport — 自動推論は撤回（常に null）
// ----------------------------------------------------------------

describe("Phase D rollback: transport はもう自動推論しない", () => {
  test("explicit transport -> autoInferred に出ない（従来どおり）", () => {
    const result = intakeFromText("車でマックに行って仕事する");
    expect(result.autoInferredMap.transport).toBeUndefined();
    expect(result.level).toBe("sufficient");
    expect(result.missingFields).not.toContain("transport");
  });

  test("Tokyo user + no transport -> autoInferred なし + planMissing に transport", () => {
    const result = intakeFromText("マックで仕事する", "東京都");
    // 都市圏推論は撤回 → transport は auto-infer されない
    expect(result.autoInferredMap.transport).toBeUndefined();
    // 外出判定 → transport は clarify 対象
    expect(result.missingFields).toContain("transport");
    expect(result.level).toBe("partial");
  });

  test("Osaka user + no transport -> clarify 対象", () => {
    const result = intakeFromText("スタバで勉強する", "大阪府");
    expect(result.autoInferredMap.transport).toBeUndefined();
    expect(result.missingFields).toContain("transport");
  });

  test("Hokkaido user + no transport -> clarify 対象（地方=車デフォルトも撤回）", () => {
    const result = intakeFromText("カフェで仕事する", "北海道");
    expect(result.autoInferredMap.transport).toBeUndefined();
    expect(result.missingFields).toContain("transport");
  });

  test("no prefecture + no transport -> clarify 対象", () => {
    const result = intakeFromText("マックで仕事する");
    expect(result.autoInferredMap.transport).toBeUndefined();
    expect(result.missingFields).toContain("transport");
  });

  test("stay-home plan -> transport は聞かない（移動がないため）", () => {
    const result = intakeFromText("家にいるよ。掃除する");
    expect(result.goingOut).toBe(false);
    expect(result.missingFields).not.toContain("transport");
    expect(result.autoInferredMap.transport).toBeUndefined();
  });
});

// ----------------------------------------------------------------
// 2. Venue — 従来の confidence 付き推論は維持
// ----------------------------------------------------------------

describe("Phase D: venue confidence inference（維持）", () => {
  test("cafe -> indoor (high confidence)", () => {
    const result = intakeFromText("車でスタバに行く");
    expect(result.autoInferredMap.venue).toBeDefined();
    expect(result.autoInferredMap.venue!.value).toBe("indoor");
    expect(result.autoInferredMap.venue!.confidence).toBe("high");
  });

  test("park -> outdoor (high confidence) or pre-resolved", () => {
    const result = intakeFromText("車で公園に行く");
    if (result.autoInferredMap.venue) {
      expect(result.autoInferredMap.venue.value).toBe("outdoor");
      expect(result.autoInferredMap.venue.confidence).toBe("high");
    } else {
      expect(result.autoInferred.venue).toBeUndefined();
    }
  });

  test("goOut + unknown category -> mixed (medium confidence)", () => {
    const result = intakeFromText("車で外に出る。買い物する");
    if (result.autoInferredMap.venue) {
      expect(["mixed", "indoor"]).toContain(result.autoInferredMap.venue.value);
    }
  });

  test("stay home -> indoor (high confidence)", () => {
    const result = intakeFromText("家にいるよ。読書する");
    if (result.autoInferredMap.venue) {
      expect(result.autoInferredMap.venue.value).toBe("indoor");
      expect(result.autoInferredMap.venue.confidence).toBe("high");
    }
  });
});

// ----------------------------------------------------------------
// 3. mood / withWhom never auto-filled（従来どおり）
// ----------------------------------------------------------------

describe("Phase D: mood / withWhom は auto-fill しない", () => {
  test("meeting + unknown companion -> withWhom 不在 / plan を止めない", () => {
    const result = intakeFromText("車でカフェでミーティングする");
    expect((result.autoInferredMap as any).withWhom).toBeUndefined();
    // transport 解決済み + withWhom 非ブロッキング → sufficient
    expect(result.level).toBe("sufficient");
  });

  test("mood unspecified -> autoInferred 不在", () => {
    const result = intakeFromText("車でマックに行って仕事する");
    expect((result.autoInferredMap as any).mood).toBeUndefined();
  });
});

// ----------------------------------------------------------------
// 4. venue autoInferred structure（transport は無くなったので venue のみ）
// ----------------------------------------------------------------

describe("Phase D: autoInferred structure (venue)", () => {
  test("venue autoInferred has value / confidence / reason", () => {
    const result = intakeFromText("車でスタバに行く");
    const v = result.autoInferredMap.venue!;
    expect(v.value).toBeDefined();
    expect(v.confidence).toBeDefined();
    expect(v.reason).toBeDefined();
    expect(["indoor", "outdoor", "mixed"]).toContain(v.value);
    expect(["high", "medium", "low"]).toContain(v.confidence);
    expect(v.reason.length).toBeGreaterThan(0);
  });
});

// ----------------------------------------------------------------
// 5. E2E: morningProtocol -> transport 未指定は clarify へ
// ----------------------------------------------------------------

describe("Phase D rollback E2E: transport clarify", () => {
  test("cafe work (no transport) -> clarifying で transport を聞く", async () => {
    const session = createSession();
    session.phase = "collecting";

    const { session: updated, response } = await processMorningMessage(
      "カフェで仕事する",
      session,
    );

    expect(updated.phase).toBe("clarifying");
    const msg = response.clarifyQuestion ?? response.message ?? "";
    expect(msg).toContain("移動");
    // plan は clarify 段でも返す（UI に仮提示する）
    expect(response.plan).toBeDefined();
  });

  test("explicit transport -> plan_presented 直行 / autoInferred.transport 不在", async () => {
    const session = createSession();
    session.phase = "collecting";

    const { session: updated, response } = await processMorningMessage(
      "車で友達とスタバに行ってランチする",
      session,
    );

    expect(updated.phase).toBe("plan_presented");
    expect(response.plan!.autoInferred?.transport).toBeUndefined();
  });

  test("Tokyo user + no transport -> 都市圏推論はせずに clarify", async () => {
    const session = createSession();
    session.phase = "collecting";
    session.userPrefecture = "東京都";

    const { session: updated, response } = await processMorningMessage(
      "スタバで勉強する",
      session,
    );

    expect(updated.phase).toBe("clarifying");
    const msg = response.clarifyQuestion ?? response.message ?? "";
    expect(msg).toContain("移動");
    // transport は prefills されない
    expect(response.plan?.autoInferred?.transport).toBeUndefined();
  });

  test("外出 + transport 未指定 -> clarify に「移動」が含まれる", async () => {
    const session = createSession();
    session.phase = "collecting";

    const { session: updated, response } = await processMorningMessage(
      "マックで仕事して、そのあとAさんと会う",
      session,
    );

    expect(updated.phase).toBe("clarifying");
    const msg = response.clarifyQuestion ?? response.message ?? "";
    // transport は聞く（Phase D rollback）
    // withWhom は聞かない（plan を止めない方針は継続）
    expect(msg).not.toContain("誰か");
    expect(response.plan).toBeDefined();
  });
});
