// lib/auth/isCeo.ts
// CEO判定ユーティリティ — サーバー・クライアント両方で使用可能

const CEO_EMAIL = "aneurasync@outlook.com";

/** メールアドレスがCEOかどうか判定 */
export function isCeoEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === CEO_EMAIL;
}
