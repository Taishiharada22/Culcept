/**
 * SR B1b-2C-8-b / 8-c-2 — /plan/dev-shift-draft server component の guard wire 契約
 *
 * 不変条件:
 *   ① guard false → notFound() 呼出（DevShiftDraftClient mount しない）
 *   ② guard true + unauthenticated → redirect("/login?next=/plan/dev-shift-draft")
 *   ③ guard true + authenticated → DevShiftDraftClient を mount（idle 既定）
 *   ④ saveEnabled は server-side flag `isShiftImportSaveEnabled()` 経由（8-c-2）。
 *      → test 環境では env 未設定で false が伝わる。
 *
 * mock 戦略（E2a client test pattern を踏襲）:
 *   - "server-only" / supabaseServer は vi.mock で差替え
 *   - isShiftDraftHostAllowed の戻り値を vi.fn で制御
 *   - notFound / redirect は throw する mock（実 Next と同じ短絡挙動）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));

// notFound() / redirect() は throw する（次行の処理に進ませない＝実 Next の挙動）
const notFoundCalls: { count: number } = { count: 0 };
const redirectCalls: { url: string | null } = { url: null };
vi.mock("next/navigation", () => ({
  notFound: () => {
    notFoundCalls.count++;
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    redirectCalls.url = url;
    throw new Error("NEXT_REDIRECT");
  },
}));

// supabaseServer は auth.getUser() を返す client stub。テスト内で setAuthUser で制御。
let currentAuthUser: { id: string } | null = null;
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({
    auth: {
      getUser: async () => ({ data: { user: currentAuthUser } }),
    },
  }),
}));

// guard helper を vi.fn で差替え
const isShiftDraftHostAllowedMock = vi.fn<(env: unknown) => boolean>();
vi.mock("@/lib/plan/shift/devDraftHost", () => ({
  isShiftDraftHostAllowed: (env: unknown) => isShiftDraftHostAllowedMock(env),
}));

import DevShiftDraftPage from "@/app/(culcept)/plan/dev-shift-draft/page";

beforeEach(() => {
  notFoundCalls.count = 0;
  redirectCalls.url = null;
  currentAuthUser = null;
  isShiftDraftHostAllowedMock.mockReset();
});

describe("/plan/dev-shift-draft server component — guard wire", () => {
  it("guard false → notFound()（Client mount しない）", async () => {
    isShiftDraftHostAllowedMock.mockReturnValue(false);
    currentAuthUser = { id: "user-abc" }; // auth は通っているが guard で先に弾く

    await expect(DevShiftDraftPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundCalls.count).toBe(1);
    expect(redirectCalls.url).toBeNull();
  });

  it("guard true + unauthenticated → redirect(/login?next=/plan/dev-shift-draft)", async () => {
    isShiftDraftHostAllowedMock.mockReturnValue(true);
    currentAuthUser = null;

    await expect(DevShiftDraftPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(notFoundCalls.count).toBe(0);
    expect(redirectCalls.url).toBe("/login?next=/plan/dev-shift-draft");
  });

  it("guard true + authenticated → DevShiftDraftClient を mount（idle 既定 + warning + state=idle）", async () => {
    isShiftDraftHostAllowedMock.mockReturnValue(true);
    currentAuthUser = { id: "user-abc" };

    const node = await DevShiftDraftPage();
    const html = renderToStaticMarkup(node);
    expect(html).toContain('data-testid="dev-shift-draft-host"');
    expect(html).toContain('data-testid="dev-shift-draft-warning"');
    // 8-c-2: 初期 state は idle、file input + 「画像を選ぶ」CTA が出る
    expect(html).toContain('data-state="idle"');
    expect(html).toContain('data-testid="dev-shift-draft-idle"');
    expect(html).toContain('data-testid="dev-shift-draft-file-input"');
    // saveEnabled は test 環境では PLAN_SHIFT_IMPORT_SAVE 未設定 → false → idle 段階では UI 反映なし
    expect(html).not.toContain('data-testid="shift-import-modal"');
    expect(notFoundCalls.count).toBe(0);
    expect(redirectCalls.url).toBeNull();
  });

  it("guard が env から正しく値を受け取る（structural wire 検証）", async () => {
    isShiftDraftHostAllowedMock.mockReturnValue(true);
    currentAuthUser = { id: "user-abc" };

    await DevShiftDraftPage();

    expect(isShiftDraftHostAllowedMock).toHaveBeenCalledTimes(1);
    const arg = isShiftDraftHostAllowedMock.mock.calls[0]?.[0] as {
      draftMode: unknown;
      supabaseUrl: unknown;
    };
    expect(arg).toHaveProperty("draftMode");
    expect(arg).toHaveProperty("supabaseUrl");
  });
});
