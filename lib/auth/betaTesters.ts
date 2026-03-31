/**
 * lib/auth/betaTesters.ts
 *
 * ベータテスター（VIP）メールリスト。
 * このリストに含まれるユーザーは、データ不足・フェーズ未到達・
 * premium 未加入に関わらず全機能が解放される。
 */

const BETA_TESTER_EMAILS: string[] = [
  "aneurasync@outlook.com",
  "hikariharada86@icloud.com",
  "zawane0903@gmail.com",
];

/**
 * メールアドレスがベータテスターかどうかを判定する。
 */
export function isBetaTesterEmail(email?: string | null): boolean {
  if (!email) return false;
  return BETA_TESTER_EMAILS.includes(email.trim().toLowerCase());
}
