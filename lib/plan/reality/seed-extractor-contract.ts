/**
 * Reality Control OS — A1-5-5b Seed Extractor Contract（pure・no-run・barrel 非 export）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.25/§8.27
 *
 * 役割: 将来の **実 LLM extractor（A1-5-5d）が返すべき structured output の契約 + validator + fake**。
 *   raw 発話は extractor の **入力でのみ** 扱い、出力は structured JSON（raw 本文を含まない）。
 *   出力検証は **intake guard（A1-5-4c）を単一ソースとして再利用**（検証ルールを二重化しない＝drift 防止）。
 *
 * 境界（A1-5-5b）:
 *   [raw 発話]（CaptureExtractionInput.utterance・**ここだけ raw**）
 *     --(SeedExtractor.extract・**実 LLM は A1-5-5d**)--> ExtractorResult（extracted: 構造化 JSON(untrusted) / no_intent）
 *     --(validateExtractorOutput・**intake 再利用・non-throwing**)--> ValidatedExtractorOutput | reason
 *     --(orchestrator の buildStructuredCaptureInput が再度 firewall)--> ...
 *
 * 厳守:
 *   - **pure**（実 LLM / prompt / SDK / DB / Supabase / runtime なし）。server-only 不要。barrel 非 export。
 *   - **raw を出力に持ち込まない**: raw field（intake FORBIDDEN_INTAKE_FIELDS）は reject、未知 key は allowlist 再構築で破棄。
 *   - **non-throwing** validation（intake と同じく reason code を返す）。
 *   - **no-op 条件**: `no_intent` / validation reject / null・invalid raw → 呼び出し側（A1-5-5c）が no-op。
 *   - 検証は **intake guard 単一ソース**（独立再実装しない）。
 */

import {
  buildStructuredCaptureInput,
  type IntakeRejectReason,
} from "./seed-capture-intake";
import type { StructuredCaptureInput } from "./seed-capture-mapper";

/** LLM extractor が返すべき **structured 出力契約**（loose・untrusted・raw を含まない）。単一定義は intake。 */
export type { ExtractorStructuredOutput } from "./seed-capture-intake";

/**
 * extractor の入力。**`utterance` が唯一の raw**（extractor 内でのみ処理・output に出さない）。
 * `sourceRef` は opaque（chat msg id 等・raw 本文でない）。`nowIso` は date 解決の基準時刻（caller 提供）。
 */
export interface CaptureExtractionInput {
  /** raw 発話（**ここだけ raw**・extractor の入力のみ・保存しない・output に出さない）。 */
  readonly utterance: string;
  /** date/相対表現解決の基準時刻（ISO・caller 提供）。 */
  readonly nowIso: string;
  /** opaque 参照（chat msg id 等・raw 本文でない）。 */
  readonly sourceRef?: string;
}

/**
 * extractor の結果。`no_intent` を **明示**（null 過負荷を避ける）。
 *   - extracted: LLM の structured JSON（**untrusted**・`validateExtractorOutput` で検証）。
 *   - no_intent: 捕捉すべき意図なし → **no-op**（reject ではなく正常な「何もしない」）。
 */
export type ExtractorResult =
  | { readonly kind: "extracted"; readonly raw: unknown }
  | { readonly kind: "no_intent" };

/** 実 LLM extractor（A1-5-5d）/ fake が満たす **DI 契約**。raw 発話 → ExtractorResult。 */
export interface SeedExtractor {
  extract(input: CaptureExtractionInput): Promise<ExtractorResult>;
}

/**
 * 検証済み extractor 出力（**server 注入前**の構造化 capture フィールド・proper types）。
 * server-inject される seedId/userId/capturedAt と policy 由来の expiresAt は含まない。
 */
export type ValidatedExtractorOutput = Omit<
  StructuredCaptureInput,
  "seedId" | "userId" | "capturedAt" | "expiresAt"
>;

/** validation 結果（reason code は intake 単一ソース）。 */
export type ExtractorOutputValidation =
  | { readonly ok: true; readonly output: ValidatedExtractorOutput }
  | { readonly ok: false; readonly reason: IntakeRejectReason; readonly field?: string };

// intake 流用時の placeholder（intake は id/時刻を検証せず透過するため安全・output で strip）。
const PLACEHOLDER_UUID = "00000000-0000-0000-0000-000000000000";
const PLACEHOLDER_ISO = "1970-01-01T00:00:00.000Z";

/**
 * A1-5-5b: extractor の structured 出力（untrusted）を検証（**intake guard 単一ソース再利用・non-throwing**）。
 *   - intake に placeholder id/時刻で委譲 → field 検証（raw reject / allowlist 再構築 / date·time_hint·action_shape·
 *     confidence·source·source_ref·explicitDuration）。placeholder は output から除外。
 *   - reject 時は intake の reason code をそのまま返す（二重ルールを作らない）。
 *   - 戻り値は **raw 本文を含まない**（allowlist 再構築済）。throw しない。
 */
export function validateExtractorOutput(raw: unknown): ExtractorOutputValidation {
  const intake = buildStructuredCaptureInput(PLACEHOLDER_UUID, PLACEHOLDER_UUID, PLACEHOLDER_ISO, raw);
  if (!intake.ok) {
    return intake.field !== undefined
      ? { ok: false, reason: intake.reason, field: intake.field }
      : { ok: false, reason: intake.reason };
  }
  const i = intake.input;
  // 明示構築（placeholder id/時刻を除外・allowlist 済フィールドのみ）。
  const output: ValidatedExtractorOutput = {
    confidence: i.confidence,
    source: i.source,
    desiredDate: i.desiredDate,
    desiredTimeHint: i.desiredTimeHint,
    actionShape: i.actionShape,
    sourceRef: i.sourceRef,
    explicitDuration: i.explicitDuration,
  };
  return { ok: true, output };
}

// ── fake extractor（テスト用・**実 LLM なし**） ──

/** fake: 固定 raw を `extracted` で返す（valid/invalid 両方を再現・raw は validate 側で検証）。 */
export function createExtractedFakeExtractor(raw: unknown): SeedExtractor {
  return {
    async extract() {
      return { kind: "extracted", raw };
    },
  };
}

/** fake: 常に `no_intent` を返す（no-op 経路の再現）。 */
export function createNoIntentExtractor(): SeedExtractor {
  return {
    async extract() {
      return { kind: "no_intent" };
    },
  };
}
