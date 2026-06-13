/**
 * canonical 直列化 + FNV-1a 64bit hash（layer-neutral pure primitives・依存ゼロ）
 *
 * 正本: docs/reality-graph-identity-patch-rc2a1b.md §3 / docs/reality-graph-identity-hardening-rg06b.md §1
 *
 * 配置理由（RC2a-6A）: dayGraph 層（computeSnapshotId）と realityCore 層（graphIdentity）の**両方**が
 *   content hash を必要とする。realityCore→dayGraph の依存は既存のため、dayGraph→realityCore を足すと
 *   循環参照になる。よって両層の下に neutral primitive として切り出す（graphIdentity は後方互換 re-export）。
 *
 * 規律:
 *  - hash = FNV-1a 64bit（BigInt・pure・同期・依存ゼロ。暗号強度は不要 — 同一性識別が目的）
 *  - id/hash は**決定的 cache key**であって内容同一性の証明ではない（証明は canonicalSerialize 比較で行う）
 *  - 乱数・Date.now 禁止（決定性 = resume/cache/dedupe の前提）
 */

// ── FNV-1a 64bit ──
// 使用境界（RC2a-1b §2）: snapshot memoization / 揮発 cache key / redactedRefId までが「可」。
// PredictionLedger / SSC / learning / 永続 idempotency では hash 単独で同一性を決めない —
// 永続 identity は full payload を保存し、hash 一致時も必要に応じ canonical payload 比較で確証する。

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;

export function fnv1a64Hex(input: string): string {
  let h = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    h ^= BigInt(input.charCodeAt(i));
    h = (h * FNV_PRIME) & MASK64;
  }
  return h.toString(16).padStart(16, "0");
}

/**
 * canonical 直列化（仕様正本: docs/reality-graph-identity-patch-rc2a1b.md §3）:
 *  - object key sort（昇順）・undefined 値 key は除去（absent ≠ null — null は保持）
 *  - array は順序保持・sort しない（corrections[] の並びは意味を持つ）。要素 undefined は null 化
 *  - number は finite double のみ。NaN/±Infinity は throw（silent "null" 崩壊の禁止）。-0 は 0 正規化
 *  - BigInt / Date / function / symbol は throw（Date は ISO string に変換してから渡す —
 *    オブジェクトのまま渡すと "{}" に崩壊するため fail-fast）
 *  - string は byte-wise・Unicode 正規化なし（上流が一貫エンコードを供給する責務）。
 *    RC2a-1c §4: revision/identity payload には ID/enum/normalized field のみ（生ユーザー文字列を入れない）。
 *    将来 発話/場所名/displayLabel を入れる場合は boundary で NFC 正規化してから渡す（本関数は NFC 済み前提）。
 * 内容同一性の証明はこの出力の比較で行う（id 比較で代用しない）
 */
export function canonicalSerialize(value: unknown): string {
  const t = typeof value;
  if (t === "bigint" || t === "function" || t === "symbol") {
    throw new TypeError(`canonicalSerialize: ${t} は直列化不可（仕様 §3 — fail-fast）`);
  }
  if (t === "number") {
    if (!Number.isFinite(value as number)) {
      throw new TypeError("canonicalSerialize: NaN/Infinity は禁止（silent null 崩壊を防ぐ — 仕様 §3）");
    }
    return JSON.stringify(value); // -0 は JSON 規約で "0" に正規化される
  }
  if (value === null || t !== "object") {
    return JSON.stringify(value ?? null); // undefined（配列要素経由）は null 化
  }
  if (value instanceof Date) {
    throw new TypeError("canonicalSerialize: Date オブジェクトは禁止（ISO string に変換してから渡す — 仕様 §3）");
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalSerialize(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalSerialize(obj[k])}`).join(",")}}`;
}
