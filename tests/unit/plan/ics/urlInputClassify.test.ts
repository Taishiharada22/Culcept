/**
 * URL Import Productization U1 — classifyUrlInput 単体テスト
 *
 * 検証: 5 分類 + advisory フラグ（suggestFileImport / canAttemptFetch）+ edge。
 * 不変原則: classifier は advisory のみ（本ゲートは server SSRF guard）。
 */

import { describe, expect, it } from "vitest";

import { classifyUrlInput } from "@/lib/plan/ics/urlInputClassify";

describe("classifyUrlInput — invalid(empty)", () => {
  it.each(["", "   ", "\n\n", "\t", "  \n \t "])(
    "空/空白/改行のみ → invalid(empty), 取得不可 %j",
    (input) => {
      const r = classifyUrlInput(input);
      expect(r.kind).toBe("invalid");
      expect(r.invalidReason).toBe("empty");
      expect(r.canAttemptFetch).toBe(false);
      expect(r.suggestFileImport).toBe(false);
    },
  );
});

describe("classifyUrlInput — ics_body（CEO 補正2: ファイル誘導）", () => {
  it("BEGIN:VCALENDAR 始まり → ics_body + suggestFileImport", () => {
    const r = classifyUrlInput("BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\n...");
    expect(r.kind).toBe("ics_body");
    expect(r.suggestFileImport).toBe(true);
    expect(r.canAttemptFetch).toBe(false); // URL ではないので取得しない
  });

  it("前置きの空白/改行があっても trim 後に判定", () => {
    expect(classifyUrlInput("  \n BEGIN:VCALENDAR\n...").kind).toBe("ics_body");
  });

  it("BOM 付き（.ics 貼付の実例）も trim で除去して判定", () => {
    expect(classifyUrlInput("﻿BEGIN:VCALENDAR\n...").kind).toBe("ics_body");
  });

  it("小文字 begin:vcalendar（寛容判定）も ics_body", () => {
    expect(classifyUrlInput("begin:vcalendar\n...").kind).toBe("ics_body");
  });
});

describe("classifyUrlInput — webcal", () => {
  it("webcal:// → webcal, 取得可", () => {
    const r = classifyUrlInput("webcal://p52-caldav.icloud.com/published/2/abc");
    expect(r.kind).toBe("webcal");
    expect(r.canAttemptFetch).toBe(true);
    expect(r.suggestFileImport).toBe(false);
  });

  it("大文字 WEBCAL:// も webcal", () => {
    expect(classifyUrlInput("WEBCAL://example.com/cal.ics").kind).toBe("webcal");
  });
});

describe("classifyUrlInput — https_calendar_like", () => {
  it.each([
    "https://calendar.google.com/calendar/ical/xxx%40group.calendar.google.com/private-abc/basic.ics",
    "https://outlook.office365.com/owa/calendar/xxx/yyy/reachcalendar.ics",
    "https://p52-caldav.icloud.com/published/2/abcdefg", // icloud host（.ics 無しでも host で判定）
    "https://example.com/team/feed.ics", // .ics path hint
    "https://outlook.live.com/owa/calendar/xxx/calendar.ics",
  ])("既知 host or .ics → https_calendar_like %j", (input) => {
    const r = classifyUrlInput(input);
    expect(r.kind).toBe("https_calendar_like");
    expect(r.canAttemptFetch).toBe(true);
  });
});

describe("classifyUrlInput — https_page_guess", () => {
  it.each([
    "https://example.com/",
    "https://www.google.com/search?q=calendar",
    "https://notion.so/my-page",
    "https://example.com/calendar", // "calendar" 文字だけでは calendar-like にしない（過剰一致防止）
  ])("https だが calendar っぽくない → https_page_guess（取得は試させる）%j", (input) => {
    const r = classifyUrlInput(input);
    expect(r.kind).toBe("https_page_guess");
    expect(r.canAttemptFetch).toBe(true); // advisory: ブロックせず server に精密判定させる
    expect(r.suggestFileImport).toBe(false);
  });
});

describe("classifyUrlInput — invalid(not_a_url)", () => {
  it.each([
    "http://example.com/cal.ics", // http:// は server が弾く（https 必要）
    "ftp://example.com/x",
    "just some text",
    "asdf",
    "user:pass@example.com",
    "://broken",
  ])("非対応 scheme / 非 URL / ゴミ → invalid(not_a_url), 取得不可 %j", (input) => {
    const r = classifyUrlInput(input);
    expect(r.kind).toBe("invalid");
    expect(r.invalidReason).toBe("not_a_url");
    expect(r.canAttemptFetch).toBe(false);
    expect(r.suggestFileImport).toBe(false);
  });

  it("https:// で始まるが URL として壊れている → invalid(not_a_url)", () => {
    const r = classifyUrlInput("https://");
    expect(r.kind).toBe("invalid");
    expect(r.invalidReason).toBe("not_a_url");
  });
});

describe("classifyUrlInput — 不変条件", () => {
  it("ics_body 以外は suggestFileImport=false", () => {
    for (const input of [
      "webcal://x.com/c.ics",
      "https://calendar.google.com/x/basic.ics",
      "https://example.com/",
      "http://x.com",
      "",
    ]) {
      expect(classifyUrlInput(input).suggestFileImport).toBe(false);
    }
  });

  it("非文字列入力でも throw しない（防御的）", () => {
    // @ts-expect-error 故意の不正入力
    expect(classifyUrlInput(undefined).kind).toBe("invalid");
    // @ts-expect-error 故意の不正入力
    expect(classifyUrlInput(null).kind).toBe("invalid");
  });
});
