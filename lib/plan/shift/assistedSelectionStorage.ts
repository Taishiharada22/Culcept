/**
 * assistedSelectionStorage — assisted row selection の localStorage IO 層（SR S-geo Persist-3）
 *
 * 役割: 既に存在する **pure 契約**（`assistedRowSelection.ts` の toStoredPayload /
 *   parseStoredPayload / makeStorageKey）に、SSR / 制限環境で安全な localStorage IO だけを
 *   足す薄いラッパ。**新しいシリアライズ経路は作らない**（既存契約に乗せる第一候補）。
 *
 * 設計核心（CEO 補正・2026-06-05）:
 *   - 保存するのは **座標メタデータのみ**（gridLeft/colWidth/source/imageW/imageH/dayCount/
 *     calibratedAt + bands + dayColumns）。raw 画像 / base64 / dataURI / Blob / ArrayBuffer /
 *     canvas bitmap / VLM raw response は **型 + parse で構造的に弾く**（pure 層が保証）。
 *   - per-image key（`makeStorageKey(imageFingerprint)`）。別画像へは混ざらない。
 *   - 適用時の **誤適用防止（imageW/imageH/dayCount mismatch）は resolve 側**（resolveEffectiveGeometry）
 *     が担う。本層は「書く / 読む / 消す」だけで、apply 判断はしない。
 *
 * 不変原則:
 *   - SSR / localStorage 不可 / quota / 破損 JSON いずれでも **throw しない**（read は null / write は no-op）。
 *   - module top-level で localStorage に触らない（関数内のみ）。
 *   - DB / server / VLM / save payload に一切触れない（client localStorage のみ）。
 */

import {
  toStoredPayload,
  parseStoredPayload,
  makeStorageKey,
  type AssistedRowSelection,
  type AssistedRowSelectionStored,
} from "./assistedRowSelection";

/** localStorage を安全に取得（SSR / 制限環境 / アクセス例外では null）。 */
function getStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    // Safari private mode 等で参照自体が throw する場合がある。
    return null;
  }
}

/**
 * selection を localStorage に保存（座標のみ）。
 * - imageFingerprint 不在 / selection invalid → no-op（toStoredPayload が null）。
 * - SSR / quota / 例外 → no-op（throw しない）。
 * - **画像本体は型で構造的に乗らない**（toStoredPayload が許可 field だけ抽出）。
 */
export function saveAssistedSelection(
  selection: AssistedRowSelection,
  updatedAt: string
): void {
  const payload = toStoredPayload(selection, updatedAt);
  if (!payload) return;
  const store = getStorage();
  if (!store) return;
  try {
    store.setItem(makeStorageKey(payload.imageFingerprint), JSON.stringify(payload));
  } catch {
    // quota / serialization 例外は no-op（保存は best-effort）。
  }
}

/**
 * imageFingerprint から復元（parse 防御込み）。
 * - key 不在 / 破損 JSON / 構造不正 → null。
 * - raw 画像 / base64 等の余計な field は parseStoredPayload が黙って捨てる。
 * - **mismatch（別画像/別月）判定はしない**（呼び出し側が resolve で apply 判断する）。
 */
export function loadAssistedSelection(
  imageFingerprint: string
): AssistedRowSelectionStored | null {
  if (!imageFingerprint) return null;
  const store = getStorage();
  if (!store) return null;
  let raw: string | null = null;
  try {
    raw = store.getItem(makeStorageKey(imageFingerprint));
  } catch {
    return null;
  }
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null; // 破損 JSON は無視。
  }
  return parseStoredPayload(json);
}

/**
 * imageFingerprint の stored payload を完全削除（key ごと remove）。
 * - 主に明示クリア用途（payload 全消し）。**校正値だけの除去は通常 save の再書込で行う**
 *   （reset → gridCalibration を外した selection を保存し直す → payload から gridCalibration が消える）。
 * - SSR / 例外 → no-op。
 */
export function removeAssistedSelection(imageFingerprint: string): void {
  if (!imageFingerprint) return;
  const store = getStorage();
  if (!store) return;
  try {
    store.removeItem(makeStorageKey(imageFingerprint));
  } catch {
    // no-op
  }
}
