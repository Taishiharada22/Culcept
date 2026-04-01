// tests/unit/cleanNext.test.ts
import { describe, it, expect } from "vitest";
import { cleanNext } from "@/lib/auth/cleanNext";

describe("cleanNext — リダイレクト先サニタイズ", () => {

  // ── 正常パス: 通過すべき入力 ──
  describe("正常パスは通過する", () => {
    it("単純な相対パス", () => {
      expect(cleanNext("/onboarding")).toBe("/onboarding");
    });
    it("ルートパス", () => {
      expect(cleanNext("/")).toBe("/");
    });
    it("ネストされたパス", () => {
      expect(cleanNext("/stargazer/results")).toBe("/stargazer/results");
    });
    it("query パラメータ付き", () => {
      expect(cleanNext("/stargazer?tab=results")).toBe("/stargazer?tab=results");
    });
    it("hash fragment 付き", () => {
      expect(cleanNext("/origin#section")).toBe("/origin#section");
    });
    it("query + hash 付き", () => {
      expect(cleanNext("/rendezvous?from=alter#top")).toBe("/rendezvous?from=alter#top");
    });
    it("エンコード済みパス", () => {
      expect(cleanNext("/%E3%83%9B%E3%83%BC%E3%83%A0")).toBe("/%E3%83%9B%E3%83%BC%E3%83%A0");
    });
  });

  // ── 攻撃ベクトル: "/" にフォールバックすべき入力 ──
  describe("攻撃ベクトルはブロックする", () => {
    it("protocol-relative URL (//evil.com)", () => {
      expect(cleanNext("//evil.com")).toBe("/");
    });
    it("protocol-relative URL (//evil.com/path)", () => {
      expect(cleanNext("//evil.com/callback")).toBe("/");
    });
    it("backslash trick (/\\evil.com)", () => {
      expect(cleanNext("/\\evil.com")).toBe("/");
    });
    it("backslash in path (/foo\\@evil.com)", () => {
      expect(cleanNext("/foo\\@evil.com")).toBe("/");
    });
    it("absolute URL (https://evil.com)", () => {
      expect(cleanNext("https://evil.com")).toBe("/");
    });
    it("javascript protocol", () => {
      expect(cleanNext("javascript:alert(1)")).toBe("/");
    });
    it("data URL", () => {
      expect(cleanNext("data:text/html,<h1>pwned</h1>")).toBe("/");
    });
  });

  // ── 空/null/undefined ──
  describe("空・null・undefined は / に正規化", () => {
    it("空文字", () => {
      expect(cleanNext("")).toBe("/");
    });
    it("null", () => {
      expect(cleanNext(null)).toBe("/");
    });
    it("undefined", () => {
      expect(cleanNext(undefined)).toBe("/");
    });
    it("空白のみ", () => {
      expect(cleanNext("   ")).toBe("/");
    });
  });

  // ── エッジケース ──
  describe("エッジケース", () => {
    it("先頭空白 + 有効パス → trim して通過", () => {
      expect(cleanNext("  /onboarding  ")).toBe("/onboarding");
    });
    it("スラッシュなしの文字列", () => {
      expect(cleanNext("onboarding")).toBe("/");
    });
    it("URL エンコードされた // (/%2F/) — 二重デコードされないので安全", () => {
      expect(cleanNext("/%2F/evil.com")).toBe("/%2F/evil.com");
    });
  });
});
