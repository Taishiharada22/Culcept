/**
 * Graph identity / revision（RC2a-1・pure）
 *
 * 正本: docs/reality-graph-identity-hardening-rg06b.md §1-4/§12
 *
 * 規律:
 *  - id は**決定的 cache key**であり証明ではない（id 同一 ⇒ 同一 semantic inputs は圧倒的高確率。
 *    内容同一性の証明は canonicalSerialize の比較で行う — RG0.6b §1）
 *  - hash = FNV-1a 64bit（BigInt・pure・同期・依存ゼロ。暗号強度は不要 — 同一性識別が目的）
 *  - revision 文字列は自己記述 prefix（`rev1:fnv1a64:<hex16>`）でアルゴリズム移行に備える
 *  - builtAt / nowInstant / 現在時刻を hash・id に混ぜない（identity は minute precision まで）
 *  - 乱数・Date.now 禁止（決定性 = resume/cache/dedupe の前提）
 */

import type { DayStateRecordV0 } from "@/lib/plan/dayState/dayStateTypes";

// ── FNV-1a 64bit ──
// 使用境界（RC2a-1b §2）: snapshot memoization / 揮発 cache key / redactedRefId までが「可」。
// PredictionLedger / SSC / learning / 永続 idempotency では hash 単独で同一性を決めない —
// 永続 identity は full payload（inputRevisionSet / derivationVersions / targetNodeId 等）を保存し、
// hash 一致時も必要に応じ canonical payload 比較で確証する（collision で別入力を同一視しない）。

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
 *    現状 recordRevisionOf の対象は時刻 HH:MM・enum・number のみで Unicode 問題の構造的免疫がある。
 *    将来 発話/場所名/displayLabel を入れる場合は boundary で NFC 正規化してから渡す（本関数は NFC 済み前提）。
 * 内容同一性の証明はこの出力の比較で行う（id 比較で代用しない — RG0.6b §1）
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

export const REVISION_SCHEMA_VERSION = "rev1";
export const HASH_ALGORITHM = "fnv1a64";

/** 自己記述 revision: `rev1:fnv1a64:<hex16>` */
export function revisionOf(value: unknown): string {
  return `${REVISION_SCHEMA_VERSION}:${HASH_ALGORITHM}:${fnv1a64Hex(canonicalSerialize(value))}`;
}

// ── recordRevision（本人台帳のみ — RG0.6a §2 / RG0.6b §3） ──

/**
 * hash 対象 = persisted-mutable な本人由来部分のみ。
 * 非対象: facts（dayGraphRevision が担う）/ estimates 現在値（決定的再導出）/ evidence /
 *         builtAt・現在時刻（混入禁止）
 */
export function recordRevisionOf(record: DayStateRecordV0): string {
  return revisionOf({
    frozenAt: record.estimatesFrozen.at,
    frozenKind: record.estimatesFrozen.frozenKind,
    frozenValues: record.estimatesFrozen.values,
    corrections: record.userInputs.corrections.map((c) => ({ at: c.at, field: c.field, direction: c.direction })),
    manualLevels: record.userInputs.manualLevels ?? {},
    moodCode: record.userInputs.moodCode ?? null,
    sleepQuality: record.userInputs.sleepQuality ?? null,
    nightCheck: record.nightCheck
      ? { answeredAt: record.nightCheck.answeredAt, dayFelt: record.nightCheck.dayFelt, planVerdict: record.nightCheck.planVerdict ?? null }
      : null,
  });
}

// ── InputRevisionSet / DerivationVersionSet（RG0.6b §3-4） ──

/**
 * derive 出力に影響する変更は対応 entry の bump 必須（bump 漏れ = 「同じ id で違う Graph」= 契約違反）。
 */
export const REALITY_DERIVATION_VERSIONS = {
  graphSchema: 0,
  eventRealityCompile: 0,
  momentSnapshot: 0,
  movementRealityCompile: 0,
  decisionDebt: 0,
  commitmentSignal: 0,
  predictionGrading: 0,
  graphAssembler: 0,
} as const;

export type DerivationVersionSet = typeof REALITY_DERIVATION_VERSIONS;

export interface InputRevisionSet {
  /** = DayGraph.snapshotId（anchors 由来の構造） */
  readonly dayGraphRevision: string;
  /** = recordRevisionOf（本人台帳） */
  readonly recordRevision: string;
  /** weather payload + freshness（未取得は "env0:none"） */
  readonly environmentRevision: string;
  /** day-state-hints 応答（未取得は "hints0:none"） */
  readonly hintsRevision: string;
  /** 当日 dayIndicator + shift source id 集合（DayGraph 外の供給。なしは "shift0:none"） */
  readonly shiftRevision: string;
  /** = revisionOf(REALITY_DERIVATION_VERSIONS) */
  readonly derivationRevision: string;
  readonly schemaVersion: number;
}

export function derivationRevision(versions: DerivationVersionSet = REALITY_DERIVATION_VERSIONS): string {
  return revisionOf(versions);
}

// ── viewer 擬名化（RG0.6b §12） ──

const VIEWER_KEY_SALT = "aneurasync.reality-graph.viewer.v0";

/**
 * graph id / log / cache key 用の **pseudonymous** viewer key（匿名化ではない — RC2a-1b §6）。
 *  - salt は client 到達コード内の固定値 = 推測可能。linkability は残るため privacy boundary として過信しない
 *  - **使用は cache key に限定**（RC2a-1c §10）。analytics/log には原則出さない・出す場合は session/day scope に限定
 *  - raw auth user id と相互参照できる場所を限定
 *  - **権限判断には使わない**（redaction/RLS の authority は常に auth user id・server 検証）
 * raw auth UUID を id に入れない。fixture は定数 "viewer-self"（実 UUID を fixture に書かない）。
 */
export function graphViewerKey(internalViewerId: string): string {
  return `vk${fnv1a64Hex(`${VIEWER_KEY_SALT}:${internalViewerId}`)}`;
}

// ── Graph identity 3 層（RG0.6a §1 / RG0.6b §1-3） ──

export function buildGraphBaseId(args: {
  subjectiveDate: string;
  viewerKey: string; // graphViewerKey の出力（raw viewerId 禁止）
  inputRevisionSet: InputRevisionSet;
}): string {
  return `rgb:${args.subjectiveDate}:${args.viewerKey}:${fnv1a64Hex(canonicalSerialize(args.inputRevisionSet))}`;
}

/** 分が進めば別 id（同 id ⇒ meta.* を除き canonical 等価 — RG0.6b §2） */
export function buildSnapshotId(graphBaseId: string, minuteOfSubjectiveDay: number): string {
  return `rgs:${graphBaseId}:${minuteOfSubjectiveDay}`;
}

export function buildMomentSnapshotId(args: {
  subjectiveDate: string;
  viewerKey: string;
  minuteOfSubjectiveDay: number;
  graphBaseId: string;
}): string {
  return `ms:${args.subjectiveDate}:${args.viewerKey}:${args.minuteOfSubjectiveDay}:${fnv1a64Hex(args.graphBaseId)}`;
}
