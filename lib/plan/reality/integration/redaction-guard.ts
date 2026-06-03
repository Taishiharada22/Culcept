/**
 * Reality Control OS — Redaction Guard（Stage 4-A / pure verifier・runtime-unconnected）
 *
 * 設計: docs/aneurasync-reality-control-os-runtime-preflight.md §3（Redaction Boundary）
 *
 * 目的: 「raw が出力に出ない」を *構造的に* 保証する **allowlist 表明**。
 *   - blocklist（既知 raw を消す）ではなく allowlist（既知の安全語彙だけ許す）。
 *     → テストしていない *想定外* の漏洩まで捕捉する。
 *   - 将来の実 runtime 接続（Stage 4-B）が *通さねば進めない* ゲート。
 *
 * 監査で確定した境界（file:line 根拠）:
 *   - R1: RealityInput は **内部型**。実 id（DayNode.id / anchors キー / SourceTrace.ref）と
 *         自由文（SourceTrace.reason ← PlanSeed.desiredAction）を *正当に* 持つ。**出力に出さない**。
 *   - R2: ShadowSummary は今日 redacted-safe だが「規律」で守られている（bestRef/rejected[].ref は
 *         refOf チョークポイント、line は手組み）。三つとも型は string ＝将来の一編集で raw が
 *         混入しても型は通る。→ allowlist 表明で **構造化** する。
 *   - R3: DevReportRedacted は構造的に安全（counts/enum のみ）。その状態を表明で固定する。
 *
 * 検出器自身が leak-safe:
 *   - 違反は **JSON path のみ**（フィールド名/添字）を返す。offending な raw *値* は戻り値に含めない。
 *   - すなわち verdict をログ/集計しても raw は漏れない。
 *
 * 厳守: pure・synthetic 専用。実データ読取 / runtime / route / UI / console / file / DB / push なし。
 */

import type { ShadowSummary } from "./shadow-runner";
import type { DevReportRedacted } from "./dev-report";

// ── 安全語彙（allowlist）— shadow-runner / dev-report の enum と一致させる ──

/** EngineMode */
const MODE_TOKENS = ["build", "complete", "repair", "optimize", "none"] as const;
/** GateKind */
const GATE_TOKENS = ["safety", "permission", "traceability", "reversibility", "whole_part", "recovery_core"] as const;
/** RiskLevel */
const RISK_TOKENS = ["none", "low", "medium", "high"] as const;
/** DeliveryMode（+ "none" placeholder） */
const DELIVERY_TOKENS = ["silent", "on_open", "push", "urgent_push", "permission_prompt", "none"] as const;

/** 出力に出てよい原子文字列の集合（line を除く全 string atom）。 */
export const SAFE_ENUM_TOKENS: ReadonlySet<string> = new Set<string>([
  ...MODE_TOKENS,
  ...GATE_TOKENS,
  ...RISK_TOKENS,
  ...DELIVERY_TOKENS,
]);

/** report-local ephemeral ref（"c0" / "c12" / "c?"）。永続 id ではない。 */
export const EPHEMERAL_REF = /^c(\d+|\?)$/;

/** invariant id（"INV-16" 等）。raw title は決してこの形にならない。 */
export const INV_ID = /^INV-\d+$/;

/**
 * ShadowSummary.line の厳密文法。
 * shadow-runner.ts の line 構築（mode/candidates/best/rejected/delivery/violations/risk）と一致。
 * MODE/DELIVERY/RISK は enum に拘束 → "delivery=渋谷の…" 等の混入は文法違反で弾く。
 */
export const SHADOW_LINE = new RegExp(
  "^mode=(build|complete|repair|optimize|none) " +
    "candidates=\\d+ " +
    "best=(c\\d+|none) " +
    "rejected=\\d+ " +
    "delivery=(silent|on_open|push|urgent_push|permission_prompt|none) " +
    "violations=\\d+ " +
    "risk=(none|low|medium|high)$"
);

/** line 以外の原子文字列が allowlist に属するか。 */
export function isAllowedAtom(value: string): boolean {
  if (value === "") return true; // 空文字は無害
  if (SAFE_ENUM_TOKENS.has(value)) return true;
  if (EPHEMERAL_REF.test(value)) return true;
  if (INV_ID.test(value)) return true;
  return false;
}

/** ShadowSummary.line が厳密文法に合致するか。 */
export function isValidShadowLine(line: string): boolean {
  return SHADOW_LINE.test(line);
}

// ── 走査 ──

export interface StringLeaf {
  /** JSON path（フィールド名/添字のみ。値は含めない設計の path 部） */
  readonly path: string;
  /** 原子文字列の値（テスト走査用。verdict には載せない） */
  readonly value: string;
  /** その値が line フィールド直下か（文法検証対象） */
  readonly isLineField: boolean;
}

function collect(v: unknown, path: string, isLineField: boolean, lineFieldName: string, out: StringLeaf[]): void {
  if (typeof v === "string") {
    out.push({ path: path || "$", value: v, isLineField });
    return;
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => collect(x, `${path}[${i}]`, false, lineFieldName, out));
    return;
  }
  if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      collect(val, path ? `${path}.${k}` : k, k === lineFieldName, lineFieldName, out);
    }
  }
  // number / boolean / null / undefined → raw string ではない（無視）
}

/**
 * 任意の値から **string 値のみ** を path 付きで収集（object のキー＝構造名は対象外）。
 * テストが「raw 値が出力のどこにも無い」を走査するための utility。
 * 注: 値を返すのはここだけ。漏洩安全が要る検出は assertRedacted を使う（verdict に値を載せない）。
 */
export function collectStringValues(v: unknown, lineFieldName = "line"): StringLeaf[] {
  const out: StringLeaf[] = [];
  collect(v, "", false, lineFieldName, out);
  return out;
}

// ── 表明 ──

export interface RedactionVerdict {
  readonly clean: boolean;
  /** 違反した JSON path のみ（raw 値は **含めない** — 検出器自身を leak-safe に保つ） */
  readonly offendingPaths: readonly string[];
}

/**
 * 出力オブジェクトが allowlist-clean か表明する（純粋）。
 *   - line フィールド: 厳密文法
 *   - それ以外の全 string 値: enum / ephemeral ref / INV id のみ許可
 * 違反時も raw 値は返さず、path のみ返す。
 */
export function assertRedacted(v: unknown, opts: { readonly lineFieldName?: string } = {}): RedactionVerdict {
  const lineFieldName = opts.lineFieldName ?? "line";
  const offendingPaths: string[] = [];
  for (const leaf of collectStringValues(v, lineFieldName)) {
    const ok = leaf.isLineField ? isValidShadowLine(leaf.value) : isAllowedAtom(leaf.value);
    if (!ok) offendingPaths.push(leaf.path);
  }
  return { clean: offendingPaths.length === 0, offendingPaths };
}

/** ShadowSummary 専用の型付き表明（R2）。 */
export function assertShadowSummaryRedacted(s: ShadowSummary): RedactionVerdict {
  return assertRedacted(s);
}

/** DevReportRedacted 専用の型付き表明（R3）。 */
export function assertDevReportRedacted(r: DevReportRedacted): RedactionVerdict {
  return assertRedacted(r);
}
