// lib/auth/anonymousAuth.ts
// 後ログイン型: 匿名認証の初期化・昇格・merge処理
"use client";

import { supabaseBrowser } from "@/lib/supabase/client";

const ANON_USER_ID_KEY = "aneurasync_anon_user_id";

// ─── 匿名サインイン ─────────────────────────────────

/**
 * 匿名ユーザーとしてサインインする。
 * すでにセッションがある場合は何もしない。
 * オンボーディング開始時に呼び出す。
 */
export async function ensureAnonymousSession(): Promise<{
  userId: string;
  isAnonymous: boolean;
  isNewSession: boolean;
}> {
  const supabase = supabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // すでにログイン済み（匿名 or 正規）ならそのまま返す
  if (user) {
    return {
      userId: user.id,
      isAnonymous: user.is_anonymous ?? false,
      isNewSession: false,
    };
  }

  // 匿名サインイン
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error(
      `[anonymousAuth] signInAnonymously failed: ${error?.message ?? "unknown"}`
    );
  }

  // localStorage に補助キーを保存（Cookie消失時の照合用）
  try {
    localStorage.setItem(ANON_USER_ID_KEY, data.user.id);
  } catch {
    // localStorage が使えない環境でも動作は継続
  }

  return {
    userId: data.user.id,
    isAnonymous: true,
    isNewSession: true,
  };
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
