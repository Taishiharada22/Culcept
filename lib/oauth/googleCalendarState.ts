/**
 * P3-A-1-1-c: Google Calendar OAuth state cookie helper (= pure module、 CSRF 防止)
 *
 * 設計書: docs/alter-plan-p3-a-1-1-oauth-scaffold-readiness.md §1.4
 *
 * 役割:
 *   - connect route で random state token を生成 → HMAC-SHA256 署名 → cookie value 化
 *   - callback route で cookie を取り出して signature 検証
 *   - secret は外部 (= process.env.OAUTH_STATE_SECRET) から引数で渡す (= module 内で env 参照しない)
 *
 * 不変原則:
 *   1. pure function (= randomness は generate のみ、 sign/verify は deterministic)
 *   2. throw しない (= 戻り値で valid / invalid を返す)
 *   3. timing-safe compare (= signature 比較で timing attack 防止)
 *   4. secret は module 内で保持しない (= 引数で受け取って即使う)
 *
 * 範囲外 (= 別 module):
 *   - cookie 名 / maxAge / path 等の設定 (= route handler 側で扱う)
 *   - secret rotation (= 後段の運用課題)
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** state token の random bytes 長 (= 256-bit、 推奨値) */
const STATE_LENGTH_BYTES = 32;

/** state と signature を区切る separator (= base64url の英数字に含まれない記号) */
const SEPARATOR = ".";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** generateState() の戻り値 */
export type StateSignResult = {
  /** Google OAuth URL の state parameter に渡す random 値 (= base64url) */
  readonly state: string;
  /** cookie value (= `${state}.${hmac}`、 callback で verifyState に渡す) */
  readonly signedCookieValue: string;
};

/** verifyState() の戻り値 (= discriminated union、 throw 禁止) */
export type StateVerifyResult =
  | { readonly ok: true; readonly state: string }
  | { readonly ok: false; readonly reason: "format" | "signature" };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pure helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Random state を生成し、 HMAC 署名付きの cookie value を返す。
 *
 * - state = 32 bytes random base64url
 * - cookie value = `${state}.${HMAC-SHA256(state, secret)}`
 *
 * @param secret OAUTH_STATE_SECRET の値 (= 呼出側で env から取得して渡す)
 */
export function generateState(secret: string): StateSignResult {
  const state = randomBytes(STATE_LENGTH_BYTES).toString("base64url");
  const signedCookieValue = signState(state, secret);
  return { state, signedCookieValue };
}

/**
 * 既存 state token に HMAC 署名を付けて cookie value を返す。
 * (= generateState の sub-step、 test で deterministic に検証するため export)
 */
export function signState(state: string, secret: string): string {
  const hmac = createHmac("sha256", secret).update(state).digest("base64url");
  return `${state}${SEPARATOR}${hmac}`;
}

/**
 * cookie value (= `${state}.${hmac}`) を分解して signature 検証。
 *
 * - format 不正 (= separator なし / 空) → ok: false, reason: "format"
 * - signature 不一致 → ok: false, reason: "signature" (= timing-safe compare)
 * - 正常 → ok: true, state (= callback で Google URL の state と比較するため返す)
 */
export function verifyState(
  signedCookieValue: string,
  secret: string,
): StateVerifyResult {
  if (typeof signedCookieValue !== "string") {
    return { ok: false, reason: "format" };
  }
  const sepIndex = signedCookieValue.indexOf(SEPARATOR);
  if (sepIndex <= 0 || sepIndex === signedCookieValue.length - 1) {
    return { ok: false, reason: "format" };
  }
  const state = signedCookieValue.slice(0, sepIndex);
  const providedHmac = signedCookieValue.slice(sepIndex + 1);
  if (state.length === 0 || providedHmac.length === 0) {
    return { ok: false, reason: "format" };
  }
  const expectedHmac = createHmac("sha256", secret).update(state).digest("base64url");
  const a = Buffer.from(providedHmac);
  const b = Buffer.from(expectedHmac);
  if (a.length !== b.length) {
    return { ok: false, reason: "signature" };
  }
  if (!timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature" };
  }
  return { ok: true, state };
}
