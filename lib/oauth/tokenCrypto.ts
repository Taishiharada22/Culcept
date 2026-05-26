/**
 * P3-A-1-1-d: OAuth refresh_token 暗号化 helper (= AES-256-GCM、 pure module)
 *
 * 設計書: docs/alter-plan-p3-a-1-1-oauth-scaffold-readiness.md §1.5
 * decision-log: 2026-05-26 D3 採用、 application-level AES-256-GCM
 *
 * 役割:
 *   - user_calendar_connections.refresh_token_encrypted (bytea) の暗号化 / 復号
 *   - 方式: AES-256-GCM (= authenticated encryption、 改竄検出付き)
 *   - 鍵: 32 bytes random base64 (= env `OAUTH_TOKEN_ENCRYPTION_KEY`)
 *   - 出力 layout: `[IV(12) || authTag(16) || ciphertext]` の bytea (= DB に bytea 保存)
 *
 * 不変原則:
 *   1. pure module (= I/O なし、 randomness は IV 生成のみ)
 *   2. throw しない (= 戻り値で valid / invalid、 ただし key 長不正は throw)
 *   3. authentication tag による改竄検出 (= tampered → reason: 'authentication')
 *   4. key は引数で受け取って即使う (= module 内で保持しない、 GC 任せ)
 *
 * 範囲外:
 *   - key rotation (= 別 phase、 既存暗号化 token の再暗号化 batch が必要)
 *   - pgsodium / pgcrypto (= application-level に統一、 DB extension 依存なし)
 *   - access_token 暗号化 (= access_token は短命で都度 refresh、 DB 保管しない)
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ALGORITHM = "aes-256-gcm";

/** GCM 推奨 IV 長 (= 96-bit) */
const IV_LENGTH_BYTES = 12;

/** AES-GCM authentication tag 長 (= 128-bit、 固定) */
const AUTH_TAG_LENGTH_BYTES = 16;

/** AES-256 鍵長 (= 256-bit = 32 bytes) */
const KEY_LENGTH_BYTES = 32;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Key handling
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * base64 encoded key を Buffer に変換 + 長さ検証。
 *
 * @throws Error if 32 bytes でない (= AES-256 必須長)
 */
export function decodeEncryptionKey(base64Key: string): Buffer {
  if (typeof base64Key !== "string" || base64Key.length === 0) {
    throw new Error("OAUTH_TOKEN_ENCRYPTION_KEY is empty or not a string");
  }
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `OAUTH_TOKEN_ENCRYPTION_KEY must be 32 bytes base64-encoded (got ${key.length} bytes)`,
    );
  }
  return key;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Encrypt
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * plaintext (= refresh_token 文字列) を AES-256-GCM で暗号化。
 *
 * 出力 layout: `[IV(12) || authTag(16) || ciphertext]` の Buffer (= DB bytea へ直接 insert)
 *
 * @throws Error if key 長不正
 */
export function encryptToken(plaintext: string, base64Key: string): Buffer {
  if (typeof plaintext !== "string") {
    throw new Error("encryptToken: plaintext must be a string");
  }
  const key = decodeEncryptionKey(base64Key);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Decrypt
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type DecryptResult =
  | { readonly ok: true; readonly plaintext: string }
  | { readonly ok: false; readonly reason: "format" | "authentication" };

/**
 * 暗号化 Buffer (= encryptToken の出力) を復号。
 *
 * - 長さ不足 / IV/tag 抽出失敗 → reason: "format"
 * - authentication tag mismatch (= 改竄 or 別 key) → reason: "authentication"
 * - 正常 → ok: true, plaintext
 *
 * @throws Error if key 長不正 (= decodeEncryptionKey throw を bubble、 unrecoverable 環境問題)
 */
export function decryptToken(encrypted: Buffer, base64Key: string): DecryptResult {
  if (!Buffer.isBuffer(encrypted)) {
    return { ok: false, reason: "format" };
  }
  if (encrypted.length < IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES) {
    return { ok: false, reason: "format" };
  }
  const key = decodeEncryptionKey(base64Key);
  const iv = encrypted.subarray(0, IV_LENGTH_BYTES);
  const authTag = encrypted.subarray(
    IV_LENGTH_BYTES,
    IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES,
  );
  const ciphertext = encrypted.subarray(IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    return { ok: true, plaintext };
  } catch {
    // authTag mismatch / 任意の crypto error は 改竄 と同一視
    return { ok: false, reason: "authentication" };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 用 const export
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const __test__ = {
  ALGORITHM,
  IV_LENGTH_BYTES,
  AUTH_TAG_LENGTH_BYTES,
  KEY_LENGTH_BYTES,
};
