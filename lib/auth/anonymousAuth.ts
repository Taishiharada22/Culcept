// lib/auth/anonymousAuth.ts
// 後ログイン型: 匿名認証の初期化・昇格・merge処理
"use client";

import { supabaseBrowser } from "@/lib/supabase/client";

const ANON_USER_ID_KEY = "aneurasync_anon_user_id";

// ─── Feature Flag チェック ────────────────────────────

/**
 * サーバーサイドの STARGAZER_ANON_ENABLED フラグを確認する。
 * サーバーサイド環境変数のため、Vercel Dashboard から即時切替可能。
 */
async function isAnonymousAuthEnabled(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/anonymous-session");
    if (!res.ok) return false;
    const data = await res.json();
    return data.enabled === true;
  } catch {
    return false;
  }
}

// ─── 匿名サインイン ─────────────────────────────────

/**
 * 匿名ユーザーとしてサインインする。
 * すでにセッションがある場合は何もしない。
 * オンボーディング開始時（ページロード時）に呼び出す。
 *
 * リトライ: 指数バックオフ（2s, 4s, 8s）で最大3回。
 * Feature flag OFF: { ok: false, reason: "anonymous_disabled" } を返す。
 */
export async function ensureAnonymousSession(): Promise<{
  ok: boolean;
  userId?: string;
  isAnonymous?: boolean;
  isNewSession?: boolean;
  reason?: string;
}> {
  const supabase = supabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // すでにログイン済み（匿名 or 正規）ならそのまま返す
  if (user) {
    return {
      ok: true,
      userId: user.id,
      isAnonymous: user.is_anonymous ?? false,
      isNewSession: false,
    };
  }

  // Feature flag チェック
  const enabled = await isAnonymousAuthEnabled();
  if (!enabled) {
    return { ok: false, reason: "anonymous_disabled" };
  }

  // 匿名サインイン（リトライ付き）
  const RETRY_DELAYS = [2000, 4000, 8000];
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    const { data, error } = await supabase.auth.signInAnonymously();

    if (!error && data.user) {
      // profiles レコードを作成（merge の冪等チェックに必要）
      await supabase.from("profiles").upsert(
        { id: data.user.id, locale: "ja" },
        { onConflict: "id" }
      );

      // localStorage に補助キーを保存（Cookie消失時の照合用）
      try {
        localStorage.setItem(ANON_USER_ID_KEY, data.user.id);
      } catch {
        // localStorage が使えない環境でも動作は継続
      }

      return {
        ok: true,
        userId: data.user.id,
        isAnonymous: true,
        isNewSession: true,
      };
    }

    lastError = error?.message ?? "unknown";

    // 最終試行でなければリトライ待ち
    if (attempt < RETRY_DELAYS.length) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
    }
  }

  console.error(`[anonymousAuth] signInAnonymously failed after ${RETRY_DELAYS.length + 1} attempts: ${lastError}`);
  return { ok: false, reason: "sign_in_failed" };
}

// ─── 現在のユーザー状態を確認 ─────────────────────────

/**
 * 現在のセッションが匿名ユーザーかどうかを判定する。
 */
export async function isCurrentUserAnonymous(): Promise<boolean> {
  const supabase = supabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.is_anonymous ?? false;
}

/**
 * localStorage に保存された匿名 user_id を取得する。
 * Cookie が消失した場合の照合用。
 */
export function getSavedAnonymousUserId(): string | null {
  try {
    return localStorage.getItem(ANON_USER_ID_KEY);
  } catch {
    return null;
  }
}

/**
 * 匿名ユーザーIDの補助キーをクリアする（昇格完了後に呼ぶ）。
 */
export function clearSavedAnonymousUserId(): void {
  try {
    localStorage.removeItem(ANON_USER_ID_KEY);
  } catch {
    // noop
  }
}
