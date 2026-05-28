/**
 * P3-A-1-1-d — tokenCrypto helper unit test
 *
 * 検証範囲:
 *   - decodeEncryptionKey: 32 bytes → ok / 不正長 → throw
 *   - encryptToken: 出力 layout (= IV + authTag + ciphertext)
 *   - encrypt → decrypt round-trip
 *   - decrypt: 短すぎる buffer → format
 *   - decrypt: tampered ciphertext → authentication
 *   - decrypt: tampered authTag → authentication
 *   - decrypt: wrong key → authentication
 *   - 異なる plaintext → 異なる ciphertext (= IV randomness)
 */

import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";

import {
  __test__,
  decodeEncryptionKey,
  decryptToken,
  encryptToken,
} from "@/lib/oauth/tokenCrypto";

// 32 bytes random base64 を 1 回生成
const TEST_KEY = randomBytes(32).toString("base64");
const TEST_KEY_2 = randomBytes(32).toString("base64");
const TEST_PLAINTEXT = "ya29.test_refresh_token_value_12345_abcdef";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("decodeEncryptionKey", () => {
  it("32 bytes base64 → Buffer 32 bytes", () => {
    const key = decodeEncryptionKey(TEST_KEY);
    expect(Buffer.isBuffer(key)).toBe(true);
    expect(key.length).toBe(32);
  });

  it("不正長 (= 16 bytes) → throw", () => {
    const shortKey = randomBytes(16).toString("base64");
    expect(() => decodeEncryptionKey(shortKey)).toThrow(/32 bytes/);
  });

  it("空文字列 → throw", () => {
    expect(() => decodeEncryptionKey("")).toThrow(/empty/);
  });
});

describe("encryptToken — output layout", () => {
  it("出力長 = IV(12) + authTag(16) + ciphertext", () => {
    const enc = encryptToken(TEST_PLAINTEXT, TEST_KEY);
    const expectedMin = __test__.IV_LENGTH_BYTES + __test__.AUTH_TAG_LENGTH_BYTES;
    expect(enc.length).toBeGreaterThan(expectedMin);
    expect(enc.length).toBe(expectedMin + Buffer.byteLength(TEST_PLAINTEXT, "utf8"));
  });

  it("呼び出しごとに異なる出力 (= IV randomness)", () => {
    const a = encryptToken(TEST_PLAINTEXT, TEST_KEY);
    const b = encryptToken(TEST_PLAINTEXT, TEST_KEY);
    expect(a.equals(b)).toBe(false);
  });

  it("plaintext 空文字 → ciphertext 部 0 bytes (= IV + authTag のみ)", () => {
    const enc = encryptToken("", TEST_KEY);
    expect(enc.length).toBe(__test__.IV_LENGTH_BYTES + __test__.AUTH_TAG_LENGTH_BYTES);
  });
});

describe("encrypt → decrypt round-trip", () => {
  it("同 key で round-trip → plaintext 一致", () => {
    const enc = encryptToken(TEST_PLAINTEXT, TEST_KEY);
    const dec = decryptToken(enc, TEST_KEY);
    expect(dec.ok).toBe(true);
    if (dec.ok) expect(dec.plaintext).toBe(TEST_PLAINTEXT);
  });

  it("UTF-8 マルチバイト (= 日本語) round-trip", () => {
    const jp = "リフレッシュトークン値🔑";
    const enc = encryptToken(jp, TEST_KEY);
    const dec = decryptToken(enc, TEST_KEY);
    expect(dec.ok).toBe(true);
    if (dec.ok) expect(dec.plaintext).toBe(jp);
  });
});

describe("decryptToken — format errors", () => {
  it("空 Buffer → format", () => {
    const r = decryptToken(Buffer.alloc(0), TEST_KEY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("format");
  });

  it("IV+authTag 長未満 → format", () => {
    const short = Buffer.alloc(__test__.IV_LENGTH_BYTES + __test__.AUTH_TAG_LENGTH_BYTES - 1);
    const r = decryptToken(short, TEST_KEY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("format");
  });

  it("非 Buffer (= string injected as any) → format", () => {
    const r = decryptToken("not a buffer" as unknown as Buffer, TEST_KEY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("format");
  });
});

describe("decryptToken — authentication errors", () => {
  it("ciphertext tampered → authentication", () => {
    const enc = Buffer.from(encryptToken(TEST_PLAINTEXT, TEST_KEY));
    // ciphertext 末尾 1 byte を反転
    const cipherStart = __test__.IV_LENGTH_BYTES + __test__.AUTH_TAG_LENGTH_BYTES;
    if (enc.length > cipherStart) {
      enc[enc.length - 1] = enc[enc.length - 1]! ^ 0xff;
    }
    const r = decryptToken(enc, TEST_KEY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("authentication");
  });

  it("authTag tampered → authentication", () => {
    const enc = Buffer.from(encryptToken(TEST_PLAINTEXT, TEST_KEY));
    // authTag 領域 (= IV_LENGTH 〜 IV_LENGTH+AUTH_TAG_LENGTH) を反転
    enc[__test__.IV_LENGTH_BYTES] = enc[__test__.IV_LENGTH_BYTES]! ^ 0xff;
    const r = decryptToken(enc, TEST_KEY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("authentication");
  });

  it("wrong key → authentication", () => {
    const enc = encryptToken(TEST_PLAINTEXT, TEST_KEY);
    const r = decryptToken(enc, TEST_KEY_2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("authentication");
  });
});
